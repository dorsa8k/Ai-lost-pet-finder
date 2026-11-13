import { test } from "node:test";
import assert from "node:assert/strict";
import {
  colourFamilies,
  colourScore,
  DEFAULT_CONFIG,
  distanceScore,
  isPromising,
  scoreMatch,
  sharedDetails,
  sizeScore,
  timeScore,
  visualBand,
  type MatchConfig,
} from "../../src/lib/matching/score";
import {
  cosineSimilarity,
  describeProviderError,
  EMBEDDING_DIMS,
  EmbeddingError,
  extractEmbeddings,
  imageEmbeddingRequest,
  normaliseEmbedding,
  toPgVector,
} from "../../src/lib/ai/embedding-core";
import { matchNoticeEmail, matchNoticeText } from "../../src/lib/notify/templates";
import { unsubscribeToken, verifyUnsubscribeToken } from "../../src/lib/notify/unsubscribe";

const base = {
  species: "dog" as const,
  primary_colour: "Apricot",
  secondary_colour: null,
  size: "small" as const,
  sex: "male" as const,
  breed: "Cavoodle",
  markings: "White patch on chest",
  collar_description: "Red collar",
  description: null,
};
const lost = { ...base, kind: "lost" as const, event_at: "2026-11-10T08:00:00Z" };
const found = { ...base, kind: "found" as const, event_at: "2026-11-11T09:00:00Z", breed: "Cavoodle (possibly)", collar_description: "Red collar, no tag" };
const calibrated: MatchConfig = { ...DEFAULT_CONFIG, strongAt: 0.85, moderateAt: 0.75 };

// ---------- metadata signals ----------------------------------------------
test("colour families understand common pet colour words", () => {
  assert.deepEqual(colourFamilies("Apricot"), ["cream"]);
  assert.deepEqual(colourFamilies("Ginger tabby").sort(), ["golden", "tabby"]);
  assert.deepEqual(colourFamilies("blue-grey"), ["grey"]);
  assert.deepEqual(colourFamilies(""), []);
});

test("colour score: same family, adjacent family, conflicting, unknown", () => {
  assert.equal(colourScore({ primary_colour: "Apricot", secondary_colour: null }, { primary_colour: "Cream", secondary_colour: null }), 1);
  assert.equal(colourScore({ primary_colour: "Apricot", secondary_colour: null }, { primary_colour: "Ginger", secondary_colour: null }), 0.6);
  assert.equal(colourScore({ primary_colour: "Black", secondary_colour: "White" }, { primary_colour: "White", secondary_colour: null }), 0.7);
  assert.equal(colourScore({ primary_colour: "Black", secondary_colour: null }, { primary_colour: "Apricot", secondary_colour: null }), 0);
  assert.equal(colourScore({ primary_colour: "Mixed", secondary_colour: null }, { primary_colour: "Black", secondary_colour: null }), 0.5);
});

test("size, distance and time scores behave sensibly", () => {
  assert.equal(sizeScore("small", "small"), 1);
  assert.equal(sizeScore("small", "medium"), 0.5);
  assert.equal(sizeScore("small", "large"), 0);
  assert.equal(sizeScore("unknown", "large"), 0.5);
  assert.ok(distanceScore(0) === 1 && distanceScore(5) > distanceScore(20));
  assert.equal(distanceScore(null), 0.5);
  assert.equal(timeScore(1), 1);
  assert.equal(timeScore(-5), 0);
  assert.ok(timeScore(10) < 1 && timeScore(10) > timeScore(60));
});

test("shared details find meaningful words in markings, collar and breed", () => {
  const s = sharedDetails(lost, found);
  assert.ok(s.words.includes("cavoodle"));
  assert.ok(s.words.includes("collar"));
  assert.ok(s.score > 0.5);
  assert.deepEqual(sharedDetails({ ...lost, breed: null, markings: null, collar_description: null }, found).words, []);
});

// ---------- combined ranking ---------------------------------------------------
test("a visually similar pet nearby ranks above a lookalike far away and a different-looking pet", () => {
  const near = scoreMatch(lost, found, { bestSimilarity: 0.9, meanBestSimilarity: 0.88, comparedPairs: 2, distanceKm: 2 });
  const far = scoreMatch(lost, found, { bestSimilarity: 0.9, meanBestSimilarity: 0.88, comparedPairs: 2, distanceKm: 35 });
  const different = scoreMatch(lost, { ...found, primary_colour: "Black", size: "large" }, { bestSimilarity: 0.6, meanBestSimilarity: 0.6, comparedPairs: 2, distanceKm: 2 });
  assert.ok(near.score > far.score, "distance should matter");
  assert.ok(near.score > different.score, "appearance should matter");
  for (const s of [near, far, different]) assert.ok(s.score >= 0 && s.score <= 1);
});

test("photo-backed suggestions outrank description-only suggestions", () => {
  const withPhoto = scoreMatch(lost, found, { bestSimilarity: 0.8, meanBestSimilarity: 0.8, comparedPairs: 1, distanceKm: 3 });
  const noPhoto = scoreMatch(lost, found, { bestSimilarity: null, meanBestSimilarity: null, comparedPairs: 0, distanceKm: 3 });
  assert.ok(withPhoto.score > noPhoto.score);
  assert.ok(noPhoto.score <= 0.5);
  assert.equal(noPhoto.band, "none");
  assert.ok(noPhoto.cautions.some((c) => c.includes("description only")));
});

test("explanations are specific and honest", () => {
  const m = scoreMatch(lost, found, { bestSimilarity: 0.9, meanBestSimilarity: 0.88, comparedPairs: 2, distanceKm: 2.3 }, calibrated);
  assert.equal(m.band, "strong");
  assert.ok(m.reasons.some((r) => r.startsWith("Strong visual resemblance (AI comparison of 2 photo pairs)")));
  assert.ok(m.reasons.includes("Both described as apricot"));
  assert.ok(m.reasons.some((r) => r.includes("about 2.3 km apart")));
  assert.ok(m.reasons.some((r) => r.startsWith("Found 1 day after")));
  assert.ok(m.reasons.includes("Both described as small"));
  for (const text of [...m.reasons, ...m.cautions]) {
    assert.ok(!/%|probability|certain|confirmed|same animal/i.test(text), `overclaiming text: ${text}`);
  }
});

test("conflicts become cautions and lower the score", () => {
  const ok = scoreMatch(lost, found, { bestSimilarity: 0.85, meanBestSimilarity: 0.85, comparedPairs: 1, distanceKm: 3 });
  const bad = scoreMatch(lost, { ...found, sex: "female", size: "large" }, { bestSimilarity: 0.85, meanBestSimilarity: 0.85, comparedPairs: 1, distanceKm: 3 });
  assert.ok(bad.score < ok.score);
  assert.ok(bad.cautions.some((c) => c.startsWith("Sex differs")));
  assert.ok(bad.cautions.some((c) => c.startsWith("Sizes differ")));
});

test("identical photos are detected (copied photo / duplicate report)", () => {
  const m = scoreMatch(lost, found, { bestSimilarity: 0.999, meanBestSimilarity: 0.999, comparedPairs: 1, distanceKm: 1 });
  assert.equal(m.identicalPhoto, true);
  assert.equal(isPromising(m, 1, 1, calibrated), false);
});

test("resemblance labels are only shown once thresholds are calibrated", () => {
  assert.equal(visualBand(0.9, DEFAULT_CONFIG), "uncalibrated");
  assert.equal(visualBand(null, DEFAULT_CONFIG), "none");
  assert.equal(visualBand(0.9, calibrated), "strong");
  assert.equal(visualBand(0.8, calibrated), "moderate");
  assert.equal(visualBand(0.5, calibrated), "weak");
});

test("notification rule is conservative", () => {
  const strong = scoreMatch(lost, found, { bestSimilarity: 0.92, meanBestSimilarity: 0.9, comparedPairs: 2, distanceKm: 2 }, calibrated);
  assert.equal(isPromising(strong, 1, 2, calibrated), true);
  assert.equal(isPromising(strong, 4, 2, calibrated), false, "only top 3");
  const weak = scoreMatch(lost, found, { bestSimilarity: 0.6, meanBestSimilarity: 0.6, comparedPairs: 2, distanceKm: 2 }, calibrated);
  assert.equal(isPromising(weak, 1, 2, calibrated), false, "weak resemblance never alerts");
  const uncal = scoreMatch(lost, found, { bestSimilarity: 0.92, meanBestSimilarity: 0.9, comparedPairs: 2, distanceKm: 2 });
  assert.equal(isPromising(uncal, 1, 2, DEFAULT_CONFIG), true);
  assert.equal(isPromising(uncal, 2, 2, DEFAULT_CONFIG), false, "uncalibrated: only #1");
  assert.equal(isPromising(uncal, 1, 20, DEFAULT_CONFIG), false, "uncalibrated: must be within 15 km");
  const noPhoto = scoreMatch(lost, found, { bestSimilarity: null, meanBestSimilarity: null, comparedPairs: 0, distanceKm: 1 });
  assert.equal(isPromising(noPhoto, 1, 1, calibrated), false, "never alert without a photo comparison");
});

// ---------- embedding provider helpers -------------------------------------------
const vec = (n = EMBEDDING_DIMS, f = (i: number) => Math.sin(i + 1)) => Array.from({ length: n }, (_, i) => f(i));

test("request body sends the image (not text) in Cloudflare's documented format", () => {
  const body = imageEmbeddingRequest(new Uint8Array([0xff, 0xd8, 0xff, 0x00]));
  assert.equal(body.messages.length, 1);
  const content = body.messages[0][0].content;
  assert.equal(content.length, 1);
  assert.equal(content[0].type, "image_url");
  assert.match(content[0].image_url.url, /^data:image\/jpeg;base64,\/9j\/AA==$/);
});

test("extractEmbeddings accepts known response shapes and rejects others", () => {
  const v = vec();
  assert.deepEqual(extractEmbeddings({ data: [v] }), [v]);
  assert.deepEqual(extractEmbeddings({ shape: [1, 768], data: [v] }), [v]);
  assert.deepEqual(extractEmbeddings({ result: { data: [v] }, success: true }), [v]); // REST envelope
  assert.deepEqual(extractEmbeddings({ data: [{ embedding: v }] }), [v]); // OpenAI-style
  assert.deepEqual(extractEmbeddings({ embedding: v }), [v]);
  assert.deepEqual(extractEmbeddings([v]), [v]);
  assert.throws(() => extractEmbeddings({ response: "a dog" }), EmbeddingError);
  assert.throws(() => extractEmbeddings(null), EmbeddingError);
});

test("normaliseEmbedding validates and unit-normalises", () => {
  const n = normaliseEmbedding(vec());
  const len = Math.sqrt(n.reduce((s, x) => s + x * x, 0));
  assert.ok(Math.abs(len - 1) < 1e-9);
  assert.throws(() => normaliseEmbedding(vec(384)), /768/);
  assert.throws(() => normaliseEmbedding(vec(768, () => 0)), /zeros/);
  assert.throws(() => normaliseEmbedding(vec(768, (i) => (i === 3 ? NaN : 1))), /invalid/);
});

test("cosine similarity and pgvector formatting", () => {
  const a = vec();
  assert.ok(Math.abs(cosineSimilarity(a, a) - 1) < 1e-9);
  assert.ok(Math.abs(cosineSimilarity(a, a.map((x) => -x)) + 1) < 1e-9);
  assert.match(toPgVector([0.5, -0.25, 1e-9]), /^\[0\.5,-0\.25,0\]$/);
});

test("provider errors are classified and never leak image data", () => {
  const r = describeProviderError(new Error("HTTP 503 upstream unavailable data:image/jpeg;base64,AAAA"));
  assert.equal(r.retryable, true);
  assert.ok(!r.message.includes("AAAA"));
  assert.equal(describeProviderError(new EmbeddingError("bad format", false)).retryable, false);
  assert.equal(describeProviderError(new Error("Invalid input")).retryable, false);
});

// ---------- notifications ---------------------------------------------------
const notice = {
  recipientKind: "lost" as const,
  recipientPetName: "Biscuit",
  otherSpecies: "dog" as const,
  otherSuburb: "Lysterfield",
  link: "https://lostpetfinder.com.au/pets/abc/matches",
  unsubscribeUrl: "https://lostpetfinder.com.au/unsubscribe?k=user&id=1&t=x",
  hasAccount: true,
};

test("notification wording is cautious and contains no private details", () => {
  const t = matchNoticeText(notice);
  assert.equal(t.title, "Possible match for Biscuit");
  assert.match(t.body, /found in Lysterfield/);
  assert.match(t.body, /can be wrong/);
  const email = matchNoticeEmail(notice, "Lost Pet AI");
  assert.match(email.text, /doesn't prove it's the same animal/);
  assert.match(email.text, /Stop these emails/);
  assert.match(email.html, /Review possible match/);
  const finder = matchNoticeText({ ...notice, recipientKind: "found", recipientPetName: null });
  assert.equal(finder.title, "A lost dog may match the one you found");
});

test("email HTML escapes user-supplied text", () => {
  const email = matchNoticeEmail({ ...notice, recipientPetName: "<script>x</script>", otherSuburb: "A&B" }, "Lost Pet AI");
  assert.ok(!email.html.includes("<script>"));
  assert.ok(email.html.includes("&lt;script&gt;"));
});

test("unsubscribe links are signed", () => {
  const t = unsubscribeToken({ kind: "report", id: "11111111-1111-1111-1111-111111111111" });
  assert.equal(verifyUnsubscribeToken({ kind: "report", id: "11111111-1111-1111-1111-111111111111" }, t), true);
  assert.equal(verifyUnsubscribeToken({ kind: "report", id: "22222222-2222-2222-2222-222222222222" }, t), false);
  assert.equal(verifyUnsubscribeToken({ kind: "user", id: "11111111-1111-1111-1111-111111111111" }, t), false);
  assert.equal(verifyUnsubscribeToken({ kind: "report", id: "11111111-1111-1111-1111-111111111111" }, ""), false);
});
