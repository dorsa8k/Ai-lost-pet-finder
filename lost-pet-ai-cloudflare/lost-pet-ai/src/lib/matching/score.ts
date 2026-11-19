/**
 * Match scoring — pure functions, unit-tested.
 *
 * The AI photo similarity is the main signal. It's combined with what people
 * typed (colour, size, markings), distance and timing, so a lookalike from
 * the other side of Melbourne ranks below a similar-looking pet found nearby
 * the next day.
 *
 * IMPORTANT: the resulting score is only used to ORDER suggestions. It is not
 * a probability that two animals are the same and is never shown as a percentage.
 */
import type { PetReport } from "../types";

export interface MatchConfig {
  /** Cosine similarity mapped to 0 on the visual scale. */
  visualFloor: number;
  /** Cosine similarity mapped to 1 on the visual scale. */
  visualCeil: number;
  /** Thresholds for "strong" / "moderate" resemblance labels. null = not calibrated yet. */
  strongAt: number | null;
  moderateAt: number | null;
  /** Minimum ranking score before a notification is sent. */
  notifyMinScore: number;
  maxDistanceKm: number;
}

function envNumber(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Thresholds can be tuned with environment variables after running the
 * evaluation script (scripts/evaluate-matching.ts prints suggested values).
 * Until MATCH_VISUAL_STRONG / MATCH_VISUAL_MODERATE are set, the app does NOT
 * label resemblance as strong/weak — it only shows the AI ranking.
 */
export function loadMatchConfig(): MatchConfig {
  const strong = envNumber("MATCH_VISUAL_STRONG");
  const moderate = envNumber("MATCH_VISUAL_MODERATE");
  const calibrated = strong !== null && moderate !== null && strong > moderate;
  return {
    visualFloor: envNumber("MATCH_VISUAL_FLOOR") ?? 0.5,
    visualCeil: envNumber("MATCH_VISUAL_CEIL") ?? 0.95,
    strongAt: calibrated ? strong : null,
    moderateAt: calibrated ? moderate : null,
    notifyMinScore: envNumber("MATCH_NOTIFY_MIN_SCORE") ?? 0.55,
    maxDistanceKm: envNumber("MATCH_MAX_DISTANCE_KM") ?? 40,
  };
}

export const DEFAULT_CONFIG: MatchConfig = {
  visualFloor: 0.5,
  visualCeil: 0.95,
  strongAt: null,
  moderateAt: null,
  notifyMinScore: 0.55,
  maxDistanceKm: 40,
};

const WEIGHTS = { visual: 0.55, colour: 0.15, distance: 0.12, time: 0.06, size: 0.06, text: 0.06 };

// ---------- colours ----------------------------------------------------
const COLOUR_FAMILIES: Record<string, string[]> = {
  black: ["black", "ebony", "jet", "charcoal"],
  white: ["white", "ivory", "snow"],
  cream: ["cream", "apricot", "fawn", "wheaten", "champagne", "blonde", "blond", "buff", "sand", "beige", "biscuit"],
  golden: ["golden", "gold", "yellow", "honey", "red", "ginger", "orange", "marmalade", "rust", "copper", "caramel"],
  brown: ["brown", "chocolate", "liver", "tan", "mahogany", "bronze", "cinnamon"],
  grey: ["grey", "gray", "blue", "silver", "slate", "smoke", "smokey"],
  brindle: ["brindle"],
  tabby: ["tabby", "striped", "mackerel"],
  tortoiseshell: ["tortoiseshell", "tortie", "torti", "calico"],
  merle: ["merle", "dapple"],
  tricolour: ["tricolour", "tricolor", "tri-colour", "tri-color", "tri"],
};
const ADJACENT: Array<[string, string]> = [
  ["cream", "golden"],
  ["golden", "brown"],
  ["cream", "white"],
  ["grey", "white"],
  ["black", "grey"],
  ["cream", "brown"],
  ["tortoiseshell", "tricolour"],
];

export function colourFamilies(text: string | null | undefined): string[] {
  if (!text) return [];
  const words = text.toLowerCase().replace(/[^a-z\s-]/g, " ").split(/[\s-]+/);
  const found = new Set<string>();
  for (const [family, names] of Object.entries(COLOUR_FAMILIES)) {
    if (names.some((n) => words.includes(n) || (n.includes("-") && text.toLowerCase().includes(n)))) found.add(family);
  }
  return [...found];
}

function adjacent(a: string, b: string) {
  return ADJACENT.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** 0–1 agreement between two colour descriptions; 0.5 when either is unknown. */
export function colourScore(
  a: Pick<PetReport, "primary_colour" | "secondary_colour">,
  b: Pick<PetReport, "primary_colour" | "secondary_colour">,
): number {
  const ap = colourFamilies(a.primary_colour);
  const bp = colourFamilies(b.primary_colour);
  const as = colourFamilies(a.secondary_colour);
  const bs = colourFamilies(b.secondary_colour);
  if (ap.length === 0 || bp.length === 0) return 0.5;
  if (ap.some((f) => bp.includes(f))) return 1;
  if (ap.some((f) => bs.includes(f)) || bp.some((f) => as.includes(f))) return 0.7;
  if (ap.some((f) => bp.some((g) => adjacent(f, g)))) return 0.6;
  return 0;
}

// ---------- size, distance, time ----------------------------------------
const SIZE_ORDER = { small: 0, medium: 1, large: 2 } as const;
export function sizeScore(a: PetReport["size"], b: PetReport["size"]): number {
  if (a === "unknown" || b === "unknown") return 0.5;
  const d = Math.abs(SIZE_ORDER[a] - SIZE_ORDER[b]);
  return d === 0 ? 1 : d === 1 ? 0.5 : 0;
}

/** 1 at 0 km, about 0.5 at 5.5 km, about 0.3 at 10 km. */
export function distanceScore(km: number | null): number {
  if (km === null || !Number.isFinite(km)) return 0.5;
  return Math.exp(-Math.max(0, km) / 8);
}

/** Days between "last seen" and "found" (positive = found after lost). */
export function daysBetween(lostAt: string, foundAt: string): number {
  return (new Date(foundAt).getTime() - new Date(lostAt).getTime()) / 86_400_000;
}

/** Full marks when found within 3 days of going missing, fading over the following weeks. */
export function timeScore(daysFoundAfterLost: number): number {
  if (daysFoundAfterLost < -2) return 0;
  if (daysFoundAfterLost <= 3) return 1;
  return Math.exp(-(daysFoundAfterLost - 3) / 30);
}

// ---------- shared words (markings, collar, breed) --------------------------
const STOPWORDS = new Set(
  "a an and are as at be but by dog cat for from has have he her his in is it its may my of on or our she so that the their them they this to very was we were with you your no not none very friendly found lost seen last near around area pet small medium large looks look like possibly maybe".split(
    " ",
  ),
);
const ALL_COLOUR_WORDS = new Set(Object.values(COLOUR_FAMILIES).flat());

export function significantWords(text: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  for (const w of text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/)) {
    const word = w.replace(/^-+|-+$/g, "");
    if (word.length >= 3 && !STOPWORDS.has(word)) out.add(word.endsWith("s") && word.length > 4 ? word.slice(0, -1) : word);
  }
  return out;
}

type TextFields = Pick<PetReport, "breed" | "markings" | "collar_description" | "description">;

export function sharedDetails(a: TextFields, b: TextFields): { score: number; words: string[] } {
  const wa = new Set([
    ...significantWords(a.breed),
    ...significantWords(a.markings),
    ...significantWords(a.collar_description),
  ]);
  const wb = new Set([
    ...significantWords(b.breed),
    ...significantWords(b.markings),
    ...significantWords(b.collar_description),
  ]);
  if (wa.size === 0 || wb.size === 0) return { score: 0.5, words: [] };
  const shared = [...wa].filter((w) => wb.has(w));
  const union = new Set([...wa, ...wb]).size;
  const jaccard = shared.length / union;
  // Colour words are already counted by colourScore, so list descriptive words first.
  const ordered = [...shared.filter((w) => !ALL_COLOUR_WORDS.has(w)), ...shared.filter((w) => ALL_COLOUR_WORDS.has(w))];
  return { score: Math.min(1, 0.3 + jaccard * 2), words: ordered.slice(0, 5) };
}

// ---------- visual ------------------------------------------------------------
export function visualScale(sim: number, cfg: MatchConfig): number {
  const span = cfg.visualCeil - cfg.visualFloor;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (sim - cfg.visualFloor) / span));
}

export type VisualBand = "strong" | "moderate" | "weak" | "uncalibrated" | "none";

export function visualBand(best: number | null, cfg: MatchConfig): VisualBand {
  if (best === null) return "none";
  if (cfg.strongAt === null || cfg.moderateAt === null) return "uncalibrated";
  if (best >= cfg.strongAt) return "strong";
  if (best >= cfg.moderateAt) return "moderate";
  return "weak";
}

export const BAND_LABEL: Record<VisualBand, string> = {
  strong: "Strong visual resemblance",
  moderate: "Some visual resemblance",
  weak: "Weak visual resemblance",
  uncalibrated: "Photos compared by AI",
  none: "No photos to compare",
};

// ---------- combining ----------------------------------------------------------
export interface CandidateSignals {
  bestSimilarity: number | null;
  meanBestSimilarity: number | null;
  comparedPairs: number;
  distanceKm: number | null;
}

type ScoredReport = Pick<
  PetReport,
  | "kind"
  | "species"
  | "primary_colour"
  | "secondary_colour"
  | "size"
  | "sex"
  | "breed"
  | "markings"
  | "collar_description"
  | "description"
  | "event_at"
>;

export interface ScoredMatch {
  score: number;
  band: VisualBand;
  reasons: string[];
  cautions: string[];
  daysApart: number;
  colour: number;
  identicalPhoto: boolean;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function formatKm(km: number) {
  if (km < 1) return "less than 1 km";
  if (km < 10) return `about ${km.toFixed(1)} km`;
  return `about ${Math.round(km)} km`;
}

function formatDays(d: number) {
  const days = Math.round(Math.abs(d));
  if (days === 0) return "on the same day";
  return `${plural(days, "day")} ${d >= 0 ? "after" : "before"}`;
}

/** Photos this similar are almost certainly the same image file re-used (e.g. copied from a lost report). */
export const IDENTICAL_PHOTO_SIMILARITY = 0.995;

export function scoreMatch(
  source: ScoredReport,
  candidate: ScoredReport,
  signals: CandidateSignals,
  cfg: MatchConfig = DEFAULT_CONFIG,
): ScoredMatch {
  const lost = source.kind === "lost" ? source : candidate;
  const found = source.kind === "lost" ? candidate : source;
  const reasons: string[] = [];
  const cautions: string[] = [];

  const colour = colourScore(source, candidate);
  const size = sizeScore(source.size, candidate.size);
  const dist = distanceScore(signals.distanceKm);
  const daysApart = daysBetween(lost.event_at, found.event_at);
  const time = timeScore(daysApart);
  const text = sharedDetails(source, candidate);
  const band = visualBand(signals.bestSimilarity, cfg);
  const identicalPhoto = signals.bestSimilarity !== null && signals.bestSimilarity >= IDENTICAL_PHOTO_SIMILARITY;

  // --- explanation: visual
  if (signals.bestSimilarity !== null) {
    reasons.push(
      band === "uncalibrated"
        ? `AI compared ${plural(signals.comparedPairs, "photo pair")}`
        : `${BAND_LABEL[band]} (AI comparison of ${plural(signals.comparedPairs, "photo pair")})`,
    );
  } else {
    cautions.push("No photos to compare on one or both reports — suggested from the description only");
  }
  if (identicalPhoto) {
    cautions.push("The photos appear to be the same image file. This can mean a duplicate report or a copied photo — be careful.");
  }

  // --- explanation: colour
  if (colour === 1) {
    reasons.push(`Both described as ${source.primary_colour.toLowerCase()}${
      source.primary_colour.toLowerCase() !== candidate.primary_colour.toLowerCase() ? ` / ${candidate.primary_colour.toLowerCase()}` : ""
    }`);
  } else if (colour >= 0.6) {
    reasons.push(`Similar colours: ${source.primary_colour.toLowerCase()} and ${candidate.primary_colour.toLowerCase()}`);
  } else if (colour === 0) {
    cautions.push(`Colours described differently: ${source.primary_colour.toLowerCase()} vs ${candidate.primary_colour.toLowerCase()}`);
  }

  // --- explanation: distance and time
  if (signals.distanceKm !== null) {
    const text = `Reports are ${formatKm(signals.distanceKm)} apart (approximate locations)`;
    if (signals.distanceKm <= 10) reasons.push(text);
    else cautions.push(text);
  }
  if (daysApart >= -2) {
    const t = `Found ${formatDays(daysApart)} it was reported missing`;
    if (daysApart <= 14) reasons.push(t);
    else cautions.push(t);
  }

  // --- explanation: size, sex, shared details
  if (size === 1) reasons.push(`Both described as ${source.size}`);
  else if (size === 0) cautions.push(`Sizes differ: ${source.size} vs ${candidate.size}`);
  let sexPenalty = 1;
  if (source.sex !== "unknown" && candidate.sex !== "unknown" && source.sex !== candidate.sex) {
    cautions.push(`Sex differs: ${source.sex} vs ${candidate.sex}`);
    sexPenalty = 0.8;
  }
  if (text.words.length > 0) reasons.push(`Both reports mention: ${text.words.join(", ")}`);

  // --- combine
  const metadata =
    WEIGHTS.colour * colour + WEIGHTS.distance * dist + WEIGHTS.time * time + WEIGHTS.size * size + WEIGHTS.text * text.score;
  let score: number;
  if (signals.bestSimilarity !== null) {
    const visual =
      0.7 * visualScale(signals.bestSimilarity, cfg) +
      0.3 * visualScale(signals.meanBestSimilarity ?? signals.bestSimilarity, cfg);
    score = WEIGHTS.visual * visual + metadata;
  } else {
    // Description-only suggestions are capped so photo-backed matches rank first.
    score = 0.5 * (metadata / (1 - WEIGHTS.visual));
  }
  score = Math.min(1, Math.max(0, score * sexPenalty));
  return { score: Number(score.toFixed(4)), band, reasons, cautions, daysApart, colour, identicalPhoto };
}

/**
 * Should the reporter be alerted? Conservative on purpose:
 *  - only the top 3 suggestions for that report, and only with a photo comparison;
 *  - calibrated mode: resemblance must be strong or moderate;
 *  - uncalibrated mode (before the evaluation has been run): only the #1
 *    suggestion, with matching colour and within 15 km.
 */
export function isPromising(m: ScoredMatch, rank: number, distanceKm: number | null, cfg: MatchConfig): boolean {
  if (m.identicalPhoto || m.band === "none" || rank > 3) return false;
  if (m.score < cfg.notifyMinScore) return false;
  if (m.band === "uncalibrated") {
    return rank === 1 && m.colour >= 0.6 && distanceKm !== null && distanceKm <= 15;
  }
  return m.band === "strong" || m.band === "moderate";
}
