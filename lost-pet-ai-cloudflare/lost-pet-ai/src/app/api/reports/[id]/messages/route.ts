import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { parseMessage } from "@/lib/validation";
import { allowRequest, isSameOrigin, jsonError, SERVER_PROBLEM, textFields, TOO_MANY } from "@/lib/http";
import { log } from "@/lib/logger";

/** Sends a private message to whoever made a report. Their contact details are never revealed. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return jsonError(503, "The database isn't connected yet.");
  if (!isSameOrigin(request)) return jsonError(403, "This form must be sent from the website.");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, "That report doesn't exist.");
  if (!(await allowRequest(request, "send_message", 8, 3600))) return jsonError(429, TOO_MANY);

  const parsed = parseMessage(textFields(await request.formData()));
  if (!parsed.ok) return jsonError(422, "Please check the highlighted details.", parsed.errors);

  const admin = createAdminClient();
  const { data: report } = await admin
    .from("pet_reports")
    .select("id, status, moderation, is_demo, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!report || report.moderation !== "visible") return jsonError(404, "That report doesn't exist or has been removed.");
  if (report.status !== "active") return jsonError(409, "This report is closed, so it can't receive new messages.");
  if (report.is_demo) {
    return jsonError(409, "This is a fictional demo record, so messages can't be sent to it. Try a real report.");
  }
  const user = await getCurrentUser();
  if (user && report.owner_id === user.id) return jsonError(409, "This is your own report.");

  const { error } = await admin.from("report_messages").insert({
    report_id: id,
    sender_user_id: user?.id ?? null,
    sender_name: parsed.data.senderName,
    sender_email: parsed.data.senderEmail,
    sender_phone: parsed.data.senderPhone,
    body: parsed.data.body,
    consent_to_share: true,
  });
  if (error) {
    log.error("send_message_failed", { error: error.message });
    return jsonError(500, SERVER_PROBLEM);
  }
  return NextResponse.json({
    ok: true,
    message:
      "Message sent. The reporter will see it next time they check their report, along with the contact details you shared.",
  });
}
