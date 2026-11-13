import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { parseFlag } from "@/lib/validation";
import { allowRequest, isSameOrigin, jsonError, SERVER_PROBLEM, textFields, TOO_MANY } from "@/lib/http";
import { log } from "@/lib/logger";

/** Lets anyone report a listing for moderator review. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return jsonError(503, "The database isn't connected yet.");
  if (!isSameOrigin(request)) return jsonError(403, "This form must be sent from the website.");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, "That report doesn't exist.");
  if (!(await allowRequest(request, "flag_report", 10, 3600))) return jsonError(429, TOO_MANY);

  const parsed = parseFlag(textFields(await request.formData()));
  if (!parsed.ok) return jsonError(422, "Please choose a reason.", parsed.errors);

  const admin = createAdminClient();
  const { data: report } = await admin.from("pet_reports").select("id").eq("id", id).maybeSingle();
  if (!report) return jsonError(404, "That report doesn't exist.");
  const user = await getCurrentUser();
  const { error } = await admin.from("moderation_flags").insert({
    report_id: id,
    reason: parsed.data.reason,
    details: parsed.data.details,
    flagged_by: user?.id ?? null,
  });
  if (error) {
    log.error("flag_failed", { error: error.message });
    return jsonError(500, SERVER_PROBLEM);
  }
  return NextResponse.json({ ok: true, message: "Thanks — a moderator will review this report." });
}
