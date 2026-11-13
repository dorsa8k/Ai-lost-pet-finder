import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { createUserClient } from "@/lib/supabase/server";
import { isSameOrigin, jsonError, SERVER_PROBLEM, textFields } from "@/lib/http";
import { log } from "@/lib/logger";

const ALLOWED = ["active", "reunited", "closed"] as const;

/**
 * Report owner changes the status (e.g. "Reunited").
 * Uses the signed-in user's own database permissions, so row-level security
 * guarantees people can only change their own reports.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return jsonError(503, "The database isn't connected yet.");
  if (!isSameOrigin(request)) return jsonError(403, "This form must be sent from the website.");
  const { id } = await params;
  const status = textFields(await request.formData()).status as (typeof ALLOWED)[number];
  if (!ALLOWED.includes(status)) return jsonError(422, "Unknown status.");

  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError(401, "Please log in again.");

  const { data, error } = await supabase
    .from("pet_reports")
    .update({ status, reunited_at: status === "reunited" ? new Date().toISOString() : null })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id");
  if (error) {
    log.error("status_update_failed", { error: error.message });
    return jsonError(500, SERVER_PROBLEM);
  }
  if (!data?.length) return jsonError(404, "We couldn't find that report in your account.");
  const message =
    status === "reunited"
      ? "Wonderful news! The report is marked as reunited and removed from active searches."
      : status === "closed"
        ? "Report closed and removed from active searches."
        : "Report reopened and visible in searches again.";
  return NextResponse.json({ ok: true, message });
}
