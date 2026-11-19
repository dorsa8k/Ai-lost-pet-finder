import "server-only";
import { createAdminClient } from "../supabase/server";
import { getImageEmbedder } from "../ai/embeddings";
import { describeProviderError, toPgVector } from "../ai/embedding-core";
import { isPromising, loadMatchConfig, scoreMatch, type ScoredMatch } from "./score";
import { matchNoticeEmail, matchNoticeText } from "../notify/templates";
import { sendEmail, unsubscribeToken } from "../notify/email";
import { APP_NAME, PHOTO_BUCKET, SITE_URL } from "../config";
import { log } from "../logger";
import type { PetReport } from "../types";

/**
 * The matching pipeline for one report:
 *   1. analyse its photos with the AI model (store embeddings)
 *   2. flag re-used photos (duplicates / copied-photo scams) for moderators
 *   3. search for candidates of the opposite kind and score them
 *   4. save the top suggestions, and alert reporters about promising ones
 * Every step is safe to re-run.
 */

export const MAX_ATTEMPTS = 3;
const KEEP_PER_REPORT = 10; // stored; the results page shows the top 5

export interface PipelineSummary {
  aiAvailable: boolean;
  photosAnalysed: number;
  photosFailed: number;
  photosPending: number;
  candidatesConsidered: number;
  matchesSaved: number;
  notificationsCreated: number;
  duplicatesFlagged: number;
}

type Admin = ReturnType<typeof createAdminClient>;
const REPORT_FIELDS =
  "id, kind, status, moderation, species, pet_name, breed, primary_colour, secondary_colour, size, sex, markings, collar_description, description, event_at, suburb, owner_id, is_demo";
type MiniReport = Pick<
  PetReport,
  | "id"
  | "kind"
  | "status"
  | "moderation"
  | "species"
  | "pet_name"
  | "breed"
  | "primary_colour"
  | "secondary_colour"
  | "size"
  | "sex"
  | "markings"
  | "collar_description"
  | "description"
  | "event_at"
  | "suburb"
  | "owner_id"
  | "is_demo"
>;

// ---------- 1. photo analysis ------------------------------------------------
export async function analysePhotos(
  admin: Admin,
  reportId: string,
  fresh?: Map<string, Uint8Array>,
): Promise<{ aiAvailable: boolean; analysed: number; failed: number; pending: number }> {
  const { data: rows, error } = await admin
    .from("photo_embeddings")
    .select("photo_id, status, attempts, report_photos(storage_path)")
    .eq("report_id", reportId)
    .in("status", ["pending", "failed"])
    .lt("attempts", MAX_ATTEMPTS);
  if (error) throw error;
  if (!rows?.length) return { aiAvailable: true, analysed: 0, failed: 0, pending: 0 };

  const embedder = await getImageEmbedder();
  if (!embedder) {
    log.warn("ai_not_configured", { reportId });
    return { aiAvailable: false, analysed: 0, failed: 0, pending: rows.length };
  }

  let analysed = 0;
  let failed = 0;
  await Promise.all(
    rows.map(async (row) => {
      const photo = row.report_photos as unknown as { storage_path: string } | null;
      try {
        let bytes = fresh?.get(row.photo_id);
        if (!bytes) {
          if (!photo) throw new Error("photo record missing");
          const { data: blob, error: dlError } = await admin.storage.from(PHOTO_BUCKET).download(photo.storage_path);
          if (dlError || !blob) throw new Error(`couldn't load the stored photo: ${dlError?.message ?? "empty"}`);
          bytes = new Uint8Array(await blob.arrayBuffer());
        }
        const vector = await embedder.embedImage(bytes);
        const { error: upError } = await admin
          .from("photo_embeddings")
          .update({
            status: "done",
            model: embedder.model,
            model_version: embedder.version,
            dims: embedder.dims,
            embedding: toPgVector(vector),
            attempts: row.attempts + 1,
            last_error: null,
          })
          .eq("photo_id", row.photo_id);
        if (upError) throw upError;
        analysed++;
      } catch (e) {
        const { message, retryable } = describeProviderError(e);
        failed++;
        log.error("photo_analysis_failed", { reportId, photoId: row.photo_id, retryable, error: message });
        await admin
          .from("photo_embeddings")
          .update({
            status: "failed",
            attempts: retryable ? row.attempts + 1 : MAX_ATTEMPTS,
            last_error: message,
          })
          .eq("photo_id", row.photo_id);
      }
    }),
  );
  return { aiAvailable: true, analysed, failed, pending: 0 };
}

// ---------- 2. re-used photos ----------------------------------------------------
async function flagReusedPhotos(admin: Admin, report: MiniReport): Promise<{ count: number; excluded: Set<string> }> {
  const excluded = new Set<string>();
  const { data: mine } = await admin.from("report_photos").select("content_hash").eq("report_id", report.id).not("content_hash", "is", null);
  const hashes = [...new Set((mine ?? []).map((p) => p.content_hash as string))];
  if (!hashes.length) return { count: 0, excluded };
  const { data: others } = await admin
    .from("report_photos")
    .select("report_id, pet_reports(kind, owner_id)")
    .in("content_hash", hashes)
    .neq("report_id", report.id);
  let count = 0;
  for (const otherId of new Set<string>((others ?? []).map((o: { report_id: string }) => o.report_id))) {
    excluded.add(otherId);
    const other = (others ?? []).find((o) => o.report_id === otherId)?.pet_reports as unknown as
      | { kind: string; owner_id: string | null }
      | undefined;
    const sameOwner = !!report.owner_id && other?.owner_id === report.owner_id;
    const reason = !sameOwner && other && other.kind !== report.kind ? "suspected_scam" : "duplicate";
    const details = `Automatic check: this report uses exactly the same photo as report ${otherId}.${
      reason === "suspected_scam" ? " A found report re-using a lost report's photo can be a reward scam." : ""
    }`;
    const { data: existing } = await admin
      .from("moderation_flags")
      .select("id")
      .eq("report_id", report.id)
      .eq("details", details)
      .limit(1);
    if (!existing?.length) {
      await admin.from("moderation_flags").insert({ report_id: report.id, reason, details });
      count++;
    }
  }
  return { count, excluded };
}

// ---------- 3 + 4. matching and notifications ---------------------------------
interface CandidateRow {
  candidate_id: string;
  best_similarity: number | null;
  mean_best_similarity: number | null;
  source_photo_id: string | null;
  candidate_photo_id: string | null;
  compared_pairs: number;
  distance_km: number | null;
}

export async function runMatching(
  admin: Admin,
  report: MiniReport,
  excluded: Set<string>,
): Promise<{ considered: number; saved: number; notifications: number }> {
  const cfg = loadMatchConfig();
  const { data: cands, error } = await admin.rpc("match_candidates", {
    p_report_id: report.id,
    p_max_km: cfg.maxDistanceKm,
    p_max_days: 180,
    p_limit: 50,
  });
  if (error) throw error;
  const rows = (cands ?? []) as CandidateRow[];
  if (!rows.length) return { considered: 0, saved: 0, notifications: 0 };

  const { data: candReports } = await admin.from("pet_reports").select(REPORT_FIELDS).in(
    "id",
    rows.map((r) => r.candidate_id),
  );
  const byId = new Map((candReports as MiniReport[] | null ?? []).map((r) => [r.id, r]));

  const scored = rows
    .filter((r) => byId.has(r.candidate_id) && !excluded.has(r.candidate_id))
    .map((r) => {
      const cand = byId.get(r.candidate_id)!;
      const s = scoreMatch(report, cand, {
        bestSimilarity: r.best_similarity,
        meanBestSimilarity: r.mean_best_similarity,
        comparedPairs: r.compared_pairs,
        distanceKm: r.distance_km,
      });
      return { row: r, cand, s };
    })
    .filter((x) => !x.s.identicalPhoto) // copied photos go to moderators, not to users as "matches"
    .sort((a, b) => b.s.score - a.s.score)
    .slice(0, KEEP_PER_REPORT);

  let saved = 0;
  let notifications = 0;
  for (const [index, { row, cand, s }] of scored.entries()) {
    const lostId = report.kind === "lost" ? report.id : cand.id;
    const foundId = report.kind === "lost" ? cand.id : report.id;
    const { data: match, error: upError } = await admin
      .from("report_matches")
      .upsert(
        {
          lost_report_id: lostId,
          found_report_id: foundId,
          score: s.score,
          visual_similarity: row.best_similarity,
          visual_band: s.band,
          compared_pairs: row.compared_pairs,
          distance_km: row.distance_km,
          days_apart: Number(s.daysApart.toFixed(2)),
          reasons: s.reasons,
          cautions: s.cautions,
          lost_photo_id: report.kind === "lost" ? row.source_photo_id : row.candidate_photo_id,
          found_photo_id: report.kind === "lost" ? row.candidate_photo_id : row.source_photo_id,
          model: row.best_similarity !== null ? "@cf/google/embeddinggemma-2" : null,
        },
        { onConflict: "lost_report_id,found_report_id" },
      )
      .select("id")
      .single();
    if (upError || !match) {
      log.error("match_save_failed", { error: upError?.message });
      continue;
    }
    saved++;
    if (report.is_demo) continue; // never alert anyone about fictional demo records

    // Alert this report's reporter if it's in their top 3…
    if (isPromising(s, index + 1, row.distance_km, cfg)) {
      notifications += await notify(admin, report, cand, match.id);
    }
    // …and the other reporter, if it's in THEIR top 3.
    const otherRank = await rankFor(admin, cand, match.id);
    if (otherRank !== null && isPromising(s, otherRank, row.distance_km, cfg)) {
      notifications += await notify(admin, cand, report, match.id);
    }
  }
  return { considered: rows.length, saved, notifications };
}

async function rankFor(admin: Admin, report: MiniReport, matchId: string): Promise<number | null> {
  const col = report.kind === "lost" ? "lost_report_id" : "found_report_id";
  const { data } = await admin.from("report_matches").select("id").eq(col, report.id).order("score", { ascending: false }).limit(3);
  const idx = (data ?? []).findIndex((m) => m.id === matchId);
  return idx === -1 ? null : idx + 1;
}

/** Creates one notification (at most once per report+match) and emails if allowed. Returns 1 if new. */
async function notify(admin: Admin, recipient: MiniReport, other: MiniReport, matchId: string): Promise<number> {
  if (recipient.status !== "active") return 0;
  // Respect "Not my pet" answers.
  const { data: fb } = await admin
    .from("match_feedback")
    .select("verdict")
    .eq("match_id", matchId)
    .eq("side", recipient.kind)
    .maybeSingle();
  if (fb?.verdict === "not_same") return 0;

  const [{ data: priv }, profileResult] = await Promise.all([
    admin.from("report_private").select("contact_email, notify_email").eq("report_id", recipient.id).maybeSingle(),
    recipient.owner_id
      ? admin.from("profiles").select("notify_in_app, notify_email").eq("id", recipient.owner_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const profile = profileResult.data as { notify_in_app: boolean; notify_email: boolean } | null;
  const hasAccount = !!recipient.owner_id;
  const link = hasAccount ? `${SITE_URL}/pets/${recipient.id}/matches` : `${SITE_URL}/pets/${other.id}`;
  const notice = {
    recipientKind: recipient.kind,
    recipientPetName: recipient.pet_name,
    otherSpecies: other.species,
    otherSuburb: other.suburb,
    link,
    hasAccount,
    unsubscribeUrl: hasAccount
      ? `${SITE_URL}/unsubscribe?k=user&id=${recipient.owner_id}&t=${unsubscribeToken({ kind: "user", id: recipient.owner_id! })}`
      : `${SITE_URL}/unsubscribe?k=report&id=${recipient.id}&t=${unsubscribeToken({ kind: "report", id: recipient.id })}`,
  };
  const { title, body } = matchNoticeText(notice);
  const { data: created, error } = await admin
    .from("notifications")
    .upsert(
      {
        user_id: recipient.owner_id,
        report_id: recipient.id,
        match_id: matchId,
        title,
        body,
        link: `/pets/${recipient.id}/matches`,
        // Users who turned in-app alerts off: keep the record (prevents repeats) but mark it read.
        read_at: hasAccount && profile && !profile.notify_in_app ? new Date().toISOString() : null,
      },
      { onConflict: "report_id,match_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) {
    log.error("notification_failed", { error: error.message });
    return 0;
  }
  if (!created?.length) return 0; // already notified about this match

  const wantsEmail = hasAccount ? profile?.notify_email !== false : priv?.notify_email !== false;
  let emailStatus: "sent" | "skipped" | "failed" = "skipped";
  if (wantsEmail && priv?.contact_email) {
    emailStatus = await sendEmail({ to: priv.contact_email, ...matchNoticeEmail(notice, APP_NAME) });
  }
  await admin
    .from("notifications")
    .update({ email_status: emailStatus, emailed_at: emailStatus === "sent" ? new Date().toISOString() : null })
    .eq("id", created[0].id);
  return 1;
}

// ---------- the whole pipeline ---------------------------------------------------
export async function processReport(reportId: string, fresh?: Map<string, Uint8Array>): Promise<PipelineSummary> {
  const admin = createAdminClient();
  const { data: report, error } = await admin.from("pet_reports").select(REPORT_FIELDS).eq("id", reportId).maybeSingle();
  if (error) throw error;
  const summary: PipelineSummary = {
    aiAvailable: true,
    photosAnalysed: 0,
    photosFailed: 0,
    photosPending: 0,
    candidatesConsidered: 0,
    matchesSaved: 0,
    notificationsCreated: 0,
    duplicatesFlagged: 0,
  };
  if (!report) return summary;

  const photos = await analysePhotos(admin, reportId, fresh);
  summary.aiAvailable = photos.aiAvailable;
  summary.photosAnalysed = photos.analysed;
  summary.photosFailed = photos.failed;
  summary.photosPending = photos.pending;

  const dup = await flagReusedPhotos(admin, report as MiniReport);
  summary.duplicatesFlagged = dup.count;

  if (report.status === "active" && report.moderation === "visible") {
    const m = await runMatching(admin, report as MiniReport, dup.excluded);
    summary.candidatesConsidered = m.considered;
    summary.matchesSaved = m.saved;
    summary.notificationsCreated = m.notifications;
  }
  log.info("matching_complete", { reportId, ...summary });
  return summary;
}

export type { ScoredMatch };
