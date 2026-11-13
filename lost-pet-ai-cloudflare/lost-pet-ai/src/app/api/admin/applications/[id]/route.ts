import { NextResponse } from "next/server";
import { adminGuard } from "@/lib/admin-guard";
import { createAdminClient } from "@/lib/supabase/server";
import { jsonError, SERVER_PROBLEM, textFields } from "@/lib/http";
import { log } from "@/lib/logger";

/**
 * Admin approves or rejects a partner application.
 * Approving creates a verified organisation. The organisation's staff then
 * sign up for normal accounts and the admin links them under "Users".
 * Only approve after checking the organisation is real (e.g. phone the clinic
 * on a number from its official website, not one from the application).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await adminGuard(request);
  if ("response" in guard) return guard.response;
  const { id } = await params;
  const decision = textFields(await request.formData()).decision;
  if (decision !== "approved" && decision !== "rejected") return jsonError(422, "Unknown decision.");

  const admin = createAdminClient();
  const { data: app } = await admin.from("partner_applications").select("*").eq("id", id).maybeSingle();
  if (!app) return jsonError(404, "Application not found.");
  if (app.status !== "pending") return jsonError(409, `This application was already ${app.status}.`);

  let organisationId: string | null = null;
  if (decision === "approved") {
    const { data: org, error } = await admin
      .from("organisations")
      .insert({
        name: app.organisation_name,
        org_type: app.organisation_type,
        suburb: app.suburb,
        website: app.website,
        verified: true,
      })
      .select("id")
      .single();
    if (error) return jsonError(500, SERVER_PROBLEM);
    organisationId = org.id;
  }
  const { error } = await admin
    .from("partner_applications")
    .update({ status: decision, organisation_id: organisationId, reviewed_by: guard.admin.id, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return jsonError(500, SERVER_PROBLEM);
  log.info("partner_application_reviewed", { admin: guard.admin.id, decision });
  return NextResponse.json({
    ok: true,
    message:
      decision === "approved"
        ? "Approved and organisation created. Link staff accounts to it in the Users section."
        : "Application rejected.",
  });
}
