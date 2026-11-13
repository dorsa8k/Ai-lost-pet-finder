import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { jsonError, SERVER_PROBLEM, textFields } from "@/lib/http";
import { log } from "@/lib/logger";

/** Admin hides or restores a report (moderation). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminGuard(request);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const moderation = textFields(await request.formData()).moderation;
  if (moderation !== "hidden" && moderation !== "visible") return jsonError(422, "Unknown action.");
  const { data, error } = await createAdminClient().from("pet_reports").update({ moderation }).eq("id", id).select("id");
  if (error) return jsonError(500, SERVER_PROBLEM);
  if (!data?.length) return jsonError(404, "Report not found.");
  log.info("admin_moderation", { admin: guard.admin.id, report: id, moderation });
  return NextResponse.json({ ok: true, message: moderation === "hidden" ? "Report hidden from the public." : "Report visible again." });
}
