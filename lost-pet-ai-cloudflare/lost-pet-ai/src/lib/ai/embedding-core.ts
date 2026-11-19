/**
 * Pure helpers for image embeddings (no network, no secrets) — unit-tested.
 *
 * Model: Google EmbeddingGemma 2 on Cloudflare Workers AI.
 *   - Model id: @cf/google/embeddinggemma-2 (published on Workers AI 12 Nov 2026)
 *   - Multimodal: text, images, video and audio share one 768-dimensional space.
 *   - We send IMAGES ONLY (no text), so these are genuine visual embeddings —
 *     never text embeddings of a description.
 *   - Request shape (Cloudflare's published example): a batch of inputs, each
 *     input being a list of chat-style messages whose content may contain
 *     { type: "image_url", image_url: { url: <data URI> } }.
 */

export const EMBEDDING_MODEL = "@cf/google/embeddinggemma-2";
export const EMBEDDING_DIMS = 768;
/** Workers AI doesn't expose a model revision, so we record the provider + catalogue date we built against. */
export const DEFAULT_MODEL_VERSION = "workers-ai/embeddinggemma-2@2026-11-12";

export class EmbeddingError extends Error {
  constructor(
    message: string,
    /** true when retrying later may succeed (network issue, rate limit, provider outage) */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export function jpegDataUri(bytes: Uint8Array): string {
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}

/** Request body for one image-only input. */
export function imageEmbeddingRequest(bytes: Uint8Array) {
  return {
    messages: [
      [
        {
          role: "user",
          content: [{ type: "image_url", image_url: { url: jpegDataUri(bytes) } }],
        },
      ],
    ],
  };
}

function isNumberArray(v: unknown): v is number[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number");
}

/**
 * Pulls the embedding vectors out of a Workers AI response. The binding and
 * REST API wrap results slightly differently, and embedding models have used
 * a few shapes over time, so we accept the known ones and reject anything else
 * loudly rather than guessing.
 */
export function extractEmbeddings(raw: unknown): number[][] {
  let body: unknown = raw;
  if (body && typeof body === "object" && "result" in body && (body as { result: unknown }).result) {
    body = (body as { result: unknown }).result; // REST API envelope
  }
  const candidates: unknown[] = [];
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    candidates.push(o.data, o.embeddings, o.response, o.embedding);
  }
  candidates.push(body);
  for (const c of candidates) {
    if (isNumberArray(c)) return [c];
    if (Array.isArray(c) && c.length > 0) {
      if (c.every(isNumberArray)) return c as number[][];
      // OpenAI-style: [{ embedding: [...] }]
      const inner = c.map((x) => (x && typeof x === "object" ? (x as { embedding?: unknown }).embedding : undefined));
      if (inner.every(isNumberArray)) return inner as number[][];
    }
  }
  throw new EmbeddingError("The AI service returned an unexpected response format.", false);
}

/** Validates dimensions and finiteness, then scales to unit length (so cosine = dot product). */
export function normaliseEmbedding(v: number[], dims = EMBEDDING_DIMS): number[] {
  if (v.length !== dims) {
    throw new EmbeddingError(`Expected a ${dims}-number embedding but received ${v.length}.`, false);
  }
  let sum = 0;
  for (const x of v) {
    if (!Number.isFinite(x)) throw new EmbeddingError("The embedding contained invalid numbers.", false);
    sum += x * x;
  }
  const norm = Math.sqrt(sum);
  if (norm === 0) throw new EmbeddingError("The embedding was all zeros.", false);
  return v.map((x) => x / norm);
}

/** Converts a JS array to the text format pgvector accepts: "[0.1,0.2,…]". */
export function toPgVector(v: number[]): string {
  return `[${v.map((x) => Number(x.toFixed(7))).join(",")}]`;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("length mismatch");
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Short, safe error text for storing/logging (never includes image data). */
export function describeProviderError(err: unknown): { message: string; retryable: boolean } {
  if (err instanceof EmbeddingError) return { message: err.message.slice(0, 400), retryable: err.retryable };
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  const retryable =
    /timeout|timed out|network|fetch failed|rate|429|5\d\d|unavailable|capacity|overloaded/.test(lower);
  return { message: msg.replace(/data:image\/[^"\s]+/g, "[image]").slice(0, 400), retryable };
}
