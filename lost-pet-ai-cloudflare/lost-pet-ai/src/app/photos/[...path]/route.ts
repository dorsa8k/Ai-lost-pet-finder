import { isSupabaseConfigured, PHOTO_BUCKET } from "@/lib/config";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { log } from "@/lib/logger";

const PATH_RE = /^reports\/([0-9a-f-]{36})\/([0-9a-f-]{36})(_thumb)?\.jpg$/i;

/**
 * Serves pet photos from the PRIVATE storage bucket.
 * A photo is only returned if the viewer may see its report: visible reports
 * for everyone; hidden reports only for their owner and admins (checked by the
 * database's row-level security, using the viewer's own login).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!isSupabaseConfigured()) return new Response("Not configured", { status: 503 });
  const path = (await params).path.join("/");
  const m = PATH_RE.exec(path);
  if (!m) return new Response("Not found", { status: 404 });
  const fullPath = `reports/${m[1]}/${m[2]}.jpg`;

  const supabase = await createUserClient();
  const { data: photo } = await supabase
    .from("report_photos")
    .select("id, pet_reports(moderation)")
    .eq("storage_path", fullPath)
    .maybeSingle();
  if (!photo) return new Response("Not found", { status: 404 });
  const isPublic = (photo.pet_reports as unknown as { moderation: string } | null)?.moderation === "visible";

  const { data: blob, error } = await createAdminClient().storage.from(PHOTO_BUCKET).download(path);
  if (error || !blob) {
    log.error("photo_download_failed", { error: error?.message });
    return new Response("Not found", { status: 404 });
  }
  return new Response(blob.stream(), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": isPublic ? "public, max-age=600" : "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
