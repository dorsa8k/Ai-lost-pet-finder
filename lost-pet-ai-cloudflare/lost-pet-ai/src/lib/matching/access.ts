import "server-only";
import { createAdminClient } from "../supabase/server";
import { getCurrentUser } from "../auth";
import { verifyToken } from "../tokens";
import type { PetReport } from "../types";

export interface ReportAccess {
  report: Pick<PetReport, "id" | "kind" | "species" | "pet_name" | "status" | "moderation" | "owner_id" | "is_demo" | "suburb" | "event_at" | "primary_colour" | "breed">;
  userId: string | null;
  via: "owner" | "manage_link" | "admin";
}

/**
 * Who may see a report's AI matches? Only:
 *   - the signed-in owner of the report,
 *   - someone holding that report's private manage link (people without accounts),
 *   - administrators (read-only oversight).
 * Everyone else gets null. Matching data is never public.
 */
export async function resolveReportAccess(reportId: string, token?: string | null): Promise<ReportAccess | null> {
  if (!/^[0-9a-f-]{36}$/i.test(reportId)) return null;
  const admin = createAdminClient();
  const { data: report } = await admin
    .from("pet_reports")
    .select("id, kind, species, pet_name, status, moderation, owner_id, is_demo, suburb, event_at, primary_colour, breed")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return null;

  const user = await getCurrentUser().catch(() => null);
  if (user && report.owner_id === user.id) return { report, userId: user.id, via: "owner" };
  if (token) {
    const { data: priv } = await admin.from("report_private").select("manage_token_hash").eq("report_id", reportId).maybeSingle();
    if (priv && verifyToken(token, priv.manage_token_hash)) return { report, userId: user?.id ?? null, via: "manage_link" };
  }
  if (user?.role === "admin") return { report, userId: user.id, via: "admin" };
  return null;
}
