import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import { verifyUnsubscribeToken } from "@/lib/notify/email";
import { allowRequest, isSameOrigin, jsonError, SERVER_PROBLEM, textFields, TOO_MANY } from "@/lib/http";

/** One-click email opt-out from the signed link in every alert email (works without logging in). */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return jsonError(503, "The database isn't connected yet.");
  if (!isSameOrigin(request)) return jsonError(403, "This request must come from the website.");
  if (!(await allowRequest(request, "unsubscribe", 20, 3600))) return jsonError(429, TOO_MANY);
  const f = textFields(await request.formData());
  const kind = f.k === "user" ? "user" : f.k === "report" ? "report" : null;
  if (!kind || !/^[0-9a-f-]{36}$/i.test(f.id ?? "") || !verifyUnsubscribeToken({ kind, id: f.id }, f.t ?? "")) {
    return jsonError(403, "This unsubscribe link isn't valid. Copy the whole link from the email.");
  }
  const admin = createAdminClient();
  const { error } =
    kind === "user"
      ? await admin.from("profiles").update({ notify_email: false }).eq("id", f.id)
      : await admin.from("report_private").update({ notify_email: false }).eq("report_id", f.id);
  if (error) return jsonError(500, SERVER_PROBLEM);
  return NextResponse.json({ ok: true, message: "Done — you won't get any more match emails." });
}
