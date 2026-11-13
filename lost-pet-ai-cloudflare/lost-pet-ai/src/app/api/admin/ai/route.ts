import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { processReport } from "@/lib/matching/engine";
import { getImageEmbedder } from "@/lib/ai/embeddings";
import { jsonError, SERVER_PROBLEM, textFields } from "@/lib/http";
import { log } from "@/lib/logger";

/**
 * Admin: retry photo analysis for photos that are pending or failed, then
 * re-run matching for those reports. Processes up to 10 reports per click
 * to stay within Cloudflare's per-request limits.
 */
export async function POST(request: Request) {
  const guard = await adminGuard(request);
  if ("response" in guard) return guard.response;
  const mode = textFields(await request.formData()).mode;
  if (mode === "rematch_recent") return rematchRecent(guard.admin.id);
  if (!(await getImageEmbedder())) {
    return jsonError(409, "Photo analysis isn't available: the Workers AI binding isn't configured (see README).");
  }
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("photo_embeddings")
    .select("report_id")
    .in("status", ["pending", "failed"])
    .limit(200);
  if (error) return jsonError(500, SERVER_PROBLEM);
  const reportIds = [...new Set<string>((rows ?? []).map((r: { report_id: string }) => r.report_id))].slice(0, 10);
  if (!reportIds.length) return NextResponse.json({ ok: true, message: "Nothing to retry — every photo has been analysed." });

  // Give failed photos a fresh set of attempts.
  await admin.from("photo_embeddings").update({ status: "pending", attempts: 0 }).eq("status", "failed").in("report_id", reportIds);
  let analysed = 0;
  let failed = 0;
  for (const id of reportIds) {
    try {
      const s = await processReport(id);
      analysed += s.photosAnalysed;
      failed += s.photosFailed;
    } catch (e) {
      log.error("admin_retry_failed", { reportId: id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  log.info("admin_ai_retry", { admin: guard.admin.id, reports: reportIds.length, analysed, failed });
  return NextResponse.json({
    ok: true,
    message: `Processed ${reportIds.length} report(s): ${analysed} photo(s) analysed, ${failed} failed.${
      (rows?.length ?? 0) > reportIds.length ? " Click again to continue." : ""
    }`,
  });
}

/** Re-runs matching for the 25 most recently updated active reports (e.g. after changing thresholds). */
async function rematchRecent(adminId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("pet_reports")
    .select("id")
    .eq("status", "active")
    .eq("moderation", "visible")
    .order("updated_at", { ascending: false })
    .limit(25);
  if (error) return jsonError(500, SERVER_PROBLEM);
  let saved = 0;
  for (const r of data ?? []) {
    try {
      saved += (await processReport(r.id as string)).matchesSaved;
    } catch (e) {
      log.error("rematch_recent_failed", { reportId: r.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  log.info("admin_rematch_recent", { admin: adminId, reports: data?.length ?? 0, saved });
  return NextResponse.json({ ok: true, message: `Re-ran matching for ${data?.length ?? 0} report(s); ${saved} suggestion(s) saved or updated.` });
}
