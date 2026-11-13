import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyToken } from "@/lib/tokens";
import { allowRequest, isSameOrigin, jsonError, SERVER_PROBLEM, TOO_MANY } from "@/lib/http";
import { log } from "@/lib/logger";

/**
 * Private "manage link" access for people who reported without an account.
 * The secret token travels in the request body (never in the URL the server
 * sees), and only its hash is stored.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return jsonError(503, "The database isn't connected yet.");
  if (!isSameOrigin(request)) return jsonError(403, "This request must come from the website.");
  if (!(await allowRequest(request, "manage_link", 60, 3600))) return jsonError(429, TOO_MANY);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return jsonError(404, "This link isn't valid.");

  let body: { token?: string; action?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Bad request.");
  }

  const admin = createAdminClient();
  const { data: priv } = await admin
    .from("report_private")
    .select("manage_token_hash, notify_email")
    .eq("report_id", id)
    .maybeSingle();
  if (!priv || !verifyToken(body.token ?? "", priv.manage_token_hash)) {
    return jsonError(403, "This manage link isn't valid. Check you copied the whole link.");
  }

  const action = body.action ?? "view";
  if (action === "reunited" || action === "closed" || action === "active") {
    const { error } = await admin
      .from("pet_reports")
      .update({ status: action, reunited_at: action === "reunited" ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) {
      log.error("manage_status_failed", { error: error.message });
      return jsonError(500, SERVER_PROBLEM);
    }
  } else if (action === "email_on" || action === "email_off") {
    const { error } = await admin.from("report_private").update({ notify_email: action === "email_on" }).eq("report_id", id);
    if (error) return jsonError(500, SERVER_PROBLEM);
    priv.notify_email = action === "email_on";
  } else if (action !== "view") {
    return jsonError(400, "Unknown action.");
  }

  const [{ data: report }, { data: messages }] = await Promise.all([
    admin
      .from("pet_reports")
      .select("id, kind, status, moderation, species, pet_name, breed, primary_colour, secondary_colour, suburb, event_at")
      .eq("id", id)
      .single(),
    admin
      .from("report_messages")
      .select("id, sender_name, sender_email, sender_phone, body, created_at")
      .eq("report_id", id)
      .order("created_at", { ascending: false }),
  ]);
  return NextResponse.json({ ok: true, report, messages: messages ?? [], notifyEmail: priv.notify_email !== false });
}
