import { createHmac, timingSafeEqual } from "node:crypto";

/** Signed "stop these emails" links, so people can opt out without logging in. */
function signingKey(): string {
  return process.env.NOTIFICATION_SIGNING_SECRET || process.env.RATE_LIMIT_SALT || "dev-only-signing-key";
}

export type UnsubscribeTarget = { kind: "user" | "report"; id: string };

export function unsubscribeToken(t: UnsubscribeTarget): string {
  return createHmac("sha256", signingKey()).update(`unsubscribe:${t.kind}:${t.id}`).digest("base64url");
}

export function verifyUnsubscribeToken(t: UnsubscribeTarget, token: string): boolean {
  const expected = Buffer.from(unsubscribeToken(t));
  const given = Buffer.from(token || "");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
