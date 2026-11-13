import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import { parsePartnerApplication } from "@/lib/validation";
import { allowRequest, isSameOrigin, jsonError, SERVER_PROBLEM, textFields, TOO_MANY } from "@/lib/http";
import { log } from "@/lib/logger";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return jsonError(503, "The database isn't connected yet.");
  if (!isSameOrigin(request)) return jsonError(403, "This form must be sent from the website.");
  if (!(await allowRequest(request, "partner_application", 3, 3600))) return jsonError(429, TOO_MANY);
  const parsed = parsePartnerApplication(textFields(await request.formData()));
  if (!parsed.ok) return jsonError(422, "Please check the highlighted details.", parsed.errors);
  const d = parsed.data;
  const { error } = await createAdminClient().from("partner_applications").insert({
    organisation_name: d.organisationName,
    organisation_type: d.organisationType,
    contact_name: d.contactName,
    email: d.email,
    phone: d.phone,
    suburb: d.suburb,
    website: d.website,
    message: d.message,
  });
  if (error) {
    log.error("partner_application_failed", { error: error.message });
    return jsonError(500, SERVER_PROBLEM);
  }
  log.info("partner_application_received");
  return NextResponse.json({
    ok: true,
    message: "Application received. We'll review it and contact you at the email address you provided.",
  });
}
