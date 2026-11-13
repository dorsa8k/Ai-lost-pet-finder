/**
 * Evaluates AI photo matching on a labelled photo set.
 *
 * Folder layout (only use photos you have consent or a licence to use):
 *   eval-photos/
 *     dog/
 *       max/        1.jpg 2.jpg 3.jpg     <- several photos of the SAME dog
 *       bella/      a.jpg b.jpg
 *       _distractors/  x.jpg y.jpg        <- optional: single photos of OTHER dogs (lookalikes)
 *     cat/
 *       ...
 *
 * For every pet with 2+ photos, one photo plays the "found" report and the
 * rest are that pet's "lost" report. The found photo is compared with every
 * lost report of the same species (best similarity across its photos), just
 * like the app. We then measure where the correct pet ranks.
 *
 * Run (needs a Cloudflare API token with Workers AI permission):
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_AI_API_TOKEN=... npx tsx scripts/evaluate-matching.ts eval-photos
 * Options:
 *   --mock      use a simple pixel-based stand-in instead of the AI (tests the script only — NOT a model result)
 *   --out FILE  where to write the Markdown report (default: eval-report.md)
 * Embeddings are cached in <folder>/.embeddings-cache.json so re-runs are free.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import {
  cosineSimilarity,
  EMBEDDING_MODEL,
  extractEmbeddings,
  imageEmbeddingRequest,
  normaliseEmbedding,
} from "../src/lib/ai/embedding-core";

interface Pet {
  id: string;
  species: string;
  photos: string[];
  distractor: boolean;
}

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith("--")) ?? "eval-photos";
const mock = args.includes("--mock");
const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : "eval-report.md";

function listPets(dir: string): Pet[] {
  const pets: Pet[] = [];
  for (const species of readdirSync(dir)) {
    const sp = join(dir, species);
    if (!statSync(sp).isDirectory() || species.startsWith(".")) continue;
    for (const petId of readdirSync(sp)) {
      const pd = join(sp, petId);
      if (!statSync(pd).isDirectory()) continue;
      const photos = readdirSync(pd)
        .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
        .sort()
        .map((f) => join(pd, f));
      if (petId === "_distractors") {
        photos.forEach((p, i) => pets.push({ id: `${species}/_distractor_${i}`, species, photos: [p], distractor: true }));
      } else if (photos.length) {
        pets.push({ id: `${species}/${petId}`, species, photos, distractor: false });
      }
    }
  }
  return pets;
}

/** Same preparation as the website: rotate, fit within 1600 px, JPEG, no metadata. */
async function prepare(path: string): Promise<Uint8Array> {
  const buf = await sharp(readFileSync(path))
    .rotate()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return new Uint8Array(buf);
}

async function embedReal(bytes: Uint8Array): Promise<number[]> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_AI_API_TOKEN;
  if (!account || !token) throw new Error("Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_API_TOKEN (or use --mock to test the script).");
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${EMBEDDING_MODEL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(imageEmbeddingRequest(bytes)),
    });
    if (res.ok) return normaliseEmbedding(extractEmbeddings(await res.json())[0]);
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      continue;
    }
    throw new Error(`Workers AI HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/** NOT AI: 16x16 colour thumbnail as a vector, only to check the script works end to end. */
async function embedMock(bytes: Uint8Array): Promise<number[]> {
  const { data } = await sharp(bytes).resize(16, 16, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const v = Array.from(data, (x) => x / 255 - 0.5);
  while (v.length < 768) v.push(0);
  return normaliseEmbedding(v);
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
}

async function main() {
  if (!existsSync(root)) throw new Error(`Folder not found: ${root}`);
  const pets = listPets(root);
  const queryPets = pets.filter((p) => !p.distractor && p.photos.length >= 2);
  if (queryPets.length < 2) throw new Error("Need at least 2 pets with 2+ photos each.");

  const cachePath = join(root, mock ? ".embeddings-cache-mock.json" : ".embeddings-cache.json");
  const cache: Record<string, number[]> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf8")) : {};
  const embed = mock ? embedMock : embedReal;
  const vectors = new Map<string, number[]>();
  const allPhotos = pets.flatMap((p) => p.photos);
  let done = 0;
  for (const path of allPhotos) {
    const bytes = await prepare(path);
    const key = createHash("sha256").update(bytes).digest("hex");
    if (!cache[key]) {
      cache[key] = await embed(bytes);
      writeFileSync(cachePath, JSON.stringify(cache));
    }
    vectors.set(path, cache[key]);
    done++;
    if (done % 10 === 0 || done === allPhotos.length) process.stdout.write(`\rEmbedded ${done}/${allPhotos.length} photos`);
  }
  process.stdout.write("\n");

  // Evaluate: each query pet's first photo vs every "lost report" of the same species.
  const ranks: number[] = [];
  const correctSims: number[] = [];
  const bestWrongSims: number[] = [];
  const confusions: string[] = [];
  for (const q of queryPets) {
    const queryVec = vectors.get(q.photos[0])!;
    const gallery = pets
      .filter((p) => p.species === q.species)
      .map((p) => {
        const photos = p.id === q.id ? p.photos.slice(1) : p.photos;
        const sim = Math.max(...photos.map((ph) => cosineSimilarity(queryVec, vectors.get(ph)!)));
        return { id: p.id, sim };
      })
      .sort((a, b) => b.sim - a.sim);
    const rank = gallery.findIndex((g) => g.id === q.id) + 1;
    ranks.push(rank);
    correctSims.push(gallery.find((g) => g.id === q.id)!.sim);
    const wrong = gallery.find((g) => g.id !== q.id);
    if (wrong) bestWrongSims.push(wrong.sim);
    if (rank > 1 && wrong) confusions.push(`${q.id} → ranked #${rank}; top was ${wrong.id} (${wrong.sim.toFixed(3)} vs ${correctSims.at(-1)!.toFixed(3)})`);
  }

  const n = ranks.length;
  const recallAt = (k: number) => ranks.filter((r) => r <= k).length / n;
  const mrr = ranks.reduce((s, r) => s + 1 / r, 0) / n;
  const sortedCorrect = [...correctSims].sort((a, b) => a - b);
  const sortedWrong = [...bestWrongSims].sort((a, b) => a - b);

  // False match rate at a threshold = share of queries where some WRONG pet scores >= threshold.
  const fmr = (t: number) => bestWrongSims.filter((s) => s >= t).length / Math.max(1, bestWrongSims.length);
  const tar = (t: number) => correctSims.filter((s) => s >= t).length / n;
  const thresholds = [...new Set([...correctSims, ...bestWrongSims].map((x) => Number(x.toFixed(3))))].sort((a, b) => a - b);
  const lowestWith = (maxFmr: number) => thresholds.find((t) => fmr(t) <= maxFmr) ?? thresholds.at(-1)!;
  const strong = lowestWith(0.02);
  const moderate = lowestWith(0.1);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  const species = [...new Set(queryPets.map((p) => p.species))].join(", ");
  const report = `# AI photo matching evaluation

${mock ? "> **MOCK RUN — a pixel-thumbnail stand-in was used instead of the AI model. These numbers say nothing about real matching quality; they only show the script works.**\n" : ""}
- Model: ${mock ? "mock (not AI)" : EMBEDDING_MODEL}
- Date: ${new Date().toISOString().slice(0, 10)}
- Species: ${species}
- Pets with 2+ photos (queries): ${n}
- Other pets / lookalike distractors in the gallery: ${pets.length - n}
- Total photos: ${allPhotos.length}

## Does the right pet appear near the top? (photo similarity only)
| Measure | Result |
|---|---|
| Recall@1 (correct pet ranked first) | ${pct(recallAt(1))} |
| Recall@5 (correct pet in top 5) | ${pct(recallAt(5))} |
| Recall@10 (correct pet in top 10) | ${pct(recallAt(10))} |
| Mean reciprocal rank | ${mrr.toFixed(3)} |

In the app, distance, dates, colour and size are combined with these photo scores, which usually improves ranking. This test measures the photo comparison on its own.

## False matches
| Similarity threshold | Same pet scores at/above it | A wrong pet scores at/above it (false match rate) |
|---|---|---|
${[...new Set([moderate, strong])].map((t) => `| ${t.toFixed(3)} | ${pct(tar(t))} | ${pct(fmr(t))} |`).join("\n")}

- Same-pet similarity: median ${percentile(sortedCorrect, 50).toFixed(3)} (10th–90th percentile ${percentile(sortedCorrect, 10).toFixed(3)}–${percentile(sortedCorrect, 90).toFixed(3)})
- Best wrong-pet similarity: median ${percentile(sortedWrong, 50).toFixed(3)} (10th–90th percentile ${percentile(sortedWrong, 10).toFixed(3)}–${percentile(sortedWrong, 90).toFixed(3)})

## Suggested settings (Cloudflare → Worker → Settings → Variables and Secrets)
${n < 30 ? `> **Not enough data: only ${n} pets were tested. Don't apply these settings yet — collect at least 30 (ideally 50+) pets with 2+ photos each.**\n` : ""}Only apply these if the test set is realistic (real lost/found-style photos taken on phones, in different places and lighting).
\`\`\`
MATCH_VISUAL_STRONG=${strong.toFixed(3)}     # wrong pets reach this in at most ~2% of searches
MATCH_VISUAL_MODERATE=${moderate.toFixed(3)}   # wrong pets reach this in at most ~10% of searches
MATCH_VISUAL_FLOOR=${percentile(sortedWrong, 10).toFixed(3)}
MATCH_VISUAL_CEIL=${percentile(sortedCorrect, 90).toFixed(3)}
\`\`\`

## Cases where the correct pet was not ranked first
${confusions.length ? confusions.map((c) => `- ${c}`).join("\n") : "- None"}

## Interpretation
A high Recall@5 means owners will usually see their pet among the five suggestions. A wrong pet scoring above a threshold is a *false match*; this is why every suggestion is labelled as needing human confirmation. Don't describe the system as identifying individual animals unless results on a large, realistic test set support it.
`;
  writeFileSync(outFile, report);
  console.log(report);
  console.log(`Report written to ${outFile}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
