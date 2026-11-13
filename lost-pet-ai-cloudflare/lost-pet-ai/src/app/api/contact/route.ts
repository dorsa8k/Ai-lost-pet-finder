import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import { parseContact } from "@/lib/validation";
import { allowRequest, isSameOrigin, jsonError, SERVER_PROBLEM, textFields, TOO_MANY } from "@/lib/http";
import { log } from "@/lib/logger";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return jsonError(503, "The database isn't connected yet.");
  if (!isSameOrigin(request)) return jsonError(403, "This form must be sent from the website.");
  if (!(await allowRequest(request, "contact_form", 5, 3600))) return jsonError(429, TOO_MANY);
  const parsed = parseContact(textFields(await request.formData()));
  if (!parsed.ok) return jsonError(422, "Please check the highlighted details.", parsed.errors);
  const { error } = await createAdminClient().from("contact_messages").insert(parsed.data);
  if (error) {
    log.error("contact_failed", { error: error.message });
    return jsonError(500, SERVER_PROBLEM);
  }
  return NextResponse.json({ ok: true, message: "Message received. We'll reply to the email address you gave." });
}
