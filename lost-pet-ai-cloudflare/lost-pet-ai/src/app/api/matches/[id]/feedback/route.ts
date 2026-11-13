import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveReportAccess } from "@/lib/matching/access";
import { allowRequest, isSameOrigin, jsonError, SERVER_PROBLEM, TOO_MANY } from "@/lib/http";

const VERDICTS = ["likely_same", "not_same", "unsure"] as const;

/** Stores a reporter's "Looks like my pet / Not my pet / Unsure" answer (used to evaluate the AI). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return jsonError(503, "The database isn't connected yet.");
  if (!isSameOrigin(request)) return jsonError(403, "This request must come from the website.");
  if (!(await allowRequest(request, "match_feedback", 60, 3600))) return jsonError(429, TOO_MANY);
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { reportId?: string; token?: string; verdict?: string };
  if (!VERDICTS.includes(body.verdict as (typeof VERDICTS)[number])) return jsonError(422, "Unknown answer.");

  const access = await resolveReportAccess(body.reportId ?? "", body.token);
  if (!access || access.via === "admin") return jsonError(403, "Only the person who made this report can answer.");
  const admin = createAdminClient();
  const { data: match } = await admin.from("report_matches").select("id, lost_report_id, found_report_id").eq("id", id).maybeSingle();
  const side = match?.lost_report_id === access.report.id ? "lost" : match?.found_report_id === access.report.id ? "found" : null;
  if (!match || !side) return jsonError(404, "That match isn't linked to your report.");

  const { error } = await admin
    .from("match_feedback")
    .upsert({ match_id: id, side, verdict: body.verdict, user_id: access.userId }, { onConflict: "match_id,side" });
  if (error) return jsonError(500, SERVER_PROBLEM);
  const message =
    body.verdict === "not_same"
      ? "Thanks — we've hidden this suggestion from your list."
      : body.verdict === "likely_same"
        ? "Thanks. Next, contact the other reporter — and remember a vet, shelter or council should confirm ownership (for example by microchip)."
        : "Thanks — saved as unsure.";
  return NextResponse.json({ ok: true, message });
}
