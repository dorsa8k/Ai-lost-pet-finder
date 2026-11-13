import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * "Manage links" let people without an account (e.g. someone who found a pet)
 * come back to their report. We store only a SHA-256 hash of the token, so a
 * database leak doesn't expose working links.
 */
export function generateManageToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function verifyToken(token: string, expectedHash: string | null | undefined): boolean {
  if (!token || !expectedHash || !/^[0-9a-f]{64}$/.test(expectedHash)) return false;
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** One-way hash of an IP address for rate limiting, so raw IPs are never stored. */
export function hashIdentifier(value: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${value}`, "utf8").digest("hex").slice(0, 32);
}
