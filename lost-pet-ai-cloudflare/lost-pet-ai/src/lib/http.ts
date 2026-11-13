import "server-only";
import { NextResponse } from "next/server";
import { createAdminClient } from "./supabase/server";
import { hashIdentifier } from "./tokens";
import { log } from "./logger";
import type { Errors } from "./validation";

/**
 * The visitor's IP address, used only (hashed) for rate limiting.
 * On Cloudflare, `cf-connecting-ip` is set by Cloudflare itself and can't be
 * faked by the visitor; the other headers are fallbacks for local development.
 */
export function clientIp(request: Request): string {
  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const fwd = request.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || request.headers.get("x-real-ip") || "unknown").trim();
}

/**
 * Database-backed rate limiter shared by all server instances.
 * Returns true if the request may proceed. Fails CLOSED (blocks) if the check
 * itself errors, so an outage can't be used to flood the site with spam.
 */
export async function allowRequest(
  request: Request,
  action: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const salt = process.env.RATE_LIMIT_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev";
  const key = `${action}:${hashIdentifier(clientIp(request), salt)}`;
  const { data, error } = await createAdminClient().rpc("check_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    log.error("rate_limit_check_failed", { action, error: error.message });
    return false;
  }
  return data === true;
}

export function jsonError(status: number, message: string, errors?: Errors) {
  return NextResponse.json({ ok: false, message, errors: errors ?? {} }, { status });
}

export const TOO_MANY = "You've done that a few times in a short period. Please wait a little while and try again.";
export const SERVER_PROBLEM = "Something went wrong on our side and nothing was saved. Please try again in a minute.";

/** Converts FormData's text fields to a plain object (files are ignored). */
export function textFields(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

/** Rejects cross-site form posts (basic CSRF protection for JSON/form APIs). */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true; // same-origin fetches from older browsers may omit it
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}
