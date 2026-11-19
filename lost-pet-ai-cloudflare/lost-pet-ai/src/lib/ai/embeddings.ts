import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  DEFAULT_MODEL_VERSION,
  EMBEDDING_DIMS,
  EMBEDDING_MODEL,
  EmbeddingError,
  extractEmbeddings,
  imageEmbeddingRequest,
  normaliseEmbedding,
} from "./embedding-core";

/**
 * Image embedding provider.
 *
 * In production on Cloudflare the app uses the Workers AI *binding* named "AI"
 * (configured in wrangler.jsonc) — no API key is needed and nothing secret is
 * ever sent to the browser.
 *
 * Fallback (e.g. running the evaluation script or `next dev` without wrangler):
 * the Workers AI REST API, using CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_API_TOKEN
 * (server-side secrets).
 *
 * If neither is available, getImageEmbedder() returns null and photos stay
 * "pending" — the app says matching isn't available instead of faking it.
 */

interface AiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

export interface ImageEmbedder {
  model: string;
  version: string;
  dims: number;
  via: "binding" | "rest";
  embedImage(jpegBytes: Uint8Array): Promise<number[]>;
}

const TIMEOUT_MS = 25_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new EmbeddingError("The AI service took too long to respond.", true)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function findBinding(): Promise<AiBinding | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const ai = (env as unknown as { AI?: AiBinding }).AI;
    return ai && typeof ai.run === "function" ? ai : null;
  } catch {
    return null; // not running on Cloudflare (e.g. plain `next dev`)
  }
}

export async function getImageEmbedder(): Promise<ImageEmbedder | null> {
  const version = process.env.EMBEDDING_MODEL_VERSION || DEFAULT_MODEL_VERSION;
  const binding = await findBinding();
  if (binding) {
    return {
      model: EMBEDDING_MODEL,
      version,
      dims: EMBEDDING_DIMS,
      via: "binding",
      async embedImage(bytes) {
        const raw = await withTimeout(binding.run(EMBEDDING_MODEL, imageEmbeddingRequest(bytes)), TIMEOUT_MS);
        const [vec] = extractEmbeddings(raw);
        return normaliseEmbedding(vec);
      },
    };
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_AI_API_TOKEN;
  if (accountId && token) {
    return {
      model: EMBEDDING_MODEL,
      version,
      dims: EMBEDDING_DIMS,
      via: "rest",
      async embedImage(bytes) {
        const res = await withTimeout(
          fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${EMBEDDING_MODEL}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(imageEmbeddingRequest(bytes)),
          }),
          TIMEOUT_MS,
        );
        if (!res.ok) {
          const text = (await res.text()).slice(0, 300);
          throw new EmbeddingError(
            `Workers AI returned HTTP ${res.status}: ${text}`,
            res.status === 429 || res.status >= 500,
          );
        }
        const [vec] = extractEmbeddings(await res.json());
        return normaliseEmbedding(vec);
      },
    };
  }
  return null;
}
