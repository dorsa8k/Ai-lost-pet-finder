import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/config";
import { resolveReportAccess } from "@/lib/matching/access";
import { processReport } from "@/lib/matching/engine";
import { allowRequest, isSameOrigin, jsonError, SERVER_PROBLEM, TOO_MANY } from "@/lib/http";
import { log } from "@/lib/logger";

/** The reporter asks to check again now (also retries photos that failed analysis). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return jsonError(503, "The database isn't connected yet.");
  if (!isSameOrigin(request)) return jsonError(403, "This request must come from the website.");
  if (!(await allowRequest(request, "rematch", 10, 3600))) return jsonError(429, TOO_MANY);
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  const access = await resolveReportAccess(id, body.token);
  if (!access || access.via === "admin") return jsonError(403, "Only the person who made this report can do this.");
  if (access.report.status !== "active") return jsonError(409, "This report is closed, so it isn't being matched.");
  try {
    const s = await processReport(id);
    let message = s.matchesSaved
      ? `Checked again: ${s.matchesSaved} possible match${s.matchesSaved === 1 ? "" : "es"} found.`
      : "Checked again: no possible matches yet. We'll keep checking as new reports come in.";
    if (!s.aiAvailable) message += " Photo analysis isn't switched on yet, so matching used descriptions only.";
    if (s.photosFailed) message += ` ${s.photosFailed} photo(s) couldn't be analysed this time.`;
    return NextResponse.json({ ok: true, message, summary: s });
  } catch (e) {
    log.error("rematch_failed", { reportId: id, error: e instanceof Error ? e.message : String(e) });
    return jsonError(500, SERVER_PROBLEM);
  }
}
