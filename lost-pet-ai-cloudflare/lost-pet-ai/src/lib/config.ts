/**
 * Central configuration. All secrets come from environment variables
 * (see .env.example). Nothing secret is hard-coded.
 */

/** The product name shown across the site. Change it in .env.local without touching code. */
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Lost Pet AI";

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export const PHOTO_BUCKET = "pet-photos";

export function getPublicSupabaseEnv(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** True when the minimum settings needed to run the app are present. */
export function isSupabaseConfigured(): boolean {
  return getPublicSupabaseEnv() !== null && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Photos are stored in a PRIVATE bucket and served through the app's own
 * /photos/... route, which checks the report is visible to the viewer first.
 */
export function publicPhotoUrl(storagePath: string): string {
  return `/photos/${storagePath}`;
}

/** Absolute URL for places outside the site (link previews, emails). */
export function absolutePhotoUrl(storagePath: string): string {
  return `${SITE_URL}${publicPhotoUrl(storagePath)}`;
}
