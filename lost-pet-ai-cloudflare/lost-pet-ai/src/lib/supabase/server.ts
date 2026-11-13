import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { getPublicSupabaseEnv } from "../config";

/**
 * Supabase client that acts AS THE SIGNED-IN USER (or as an anonymous visitor).
 * Row-level security applies, so this client can only see what the user may see.
 * Use this by default.
 */
export async function createUserClient() {
  const env = getPublicSupabaseEnv();
  if (!env) throw new SetupError("Supabase is not configured. See README → 'Set up Supabase'.");
  const cookieStore = await cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component where cookies are read-only; the proxy refreshes sessions.
        }
      },
    },
  });
}

/**
 * Supabase client with the SERVICE ROLE key. It bypasses row-level security,
 * so it must only be used on the server, after the code has validated input
 * and checked permissions itself. Never import this into a client component.
 */
export function createAdminClient() {
  const env = getPublicSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !serviceKey) {
    throw new SetupError("SUPABASE_SERVICE_ROLE_KEY is missing. See README → 'Set up Supabase'.");
  }
  return createPlainClient(env.url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export class SetupError extends Error {}
