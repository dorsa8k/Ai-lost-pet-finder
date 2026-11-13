import { NextResponse } from "next/server";
import { isSupabaseConfigured, publicPhotoUrl } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveReportAccess } from "@/lib/matching/access";
import { getImageEmbedder } from "@/lib/ai/embeddings";
import { BAND_LABEL, type VisualBand } from "@/lib/matching/score";
import { thumbPathFor } from "@/lib/images-paths";
import { allowRequest, isSameOrigin, jsonError, TOO_MANY } from "@/lib/http";

const RESULTS_SHOWN = 5;

interface OtherRow {
  id: string;
  kind: "lost" | "found";
  species: "dog" | "cat";
  pet_name: string | null;
  breed: string | null;
  primary_colour: string;
  secondary_colour: string | null;
  size: string;
  sex: string;
  suburb: string;
  event_at: string;
  animal_location: string | null;
  status: string;
  moderation: string;
  is_demo: boolean;
  reporter_type: string;
}
interface PhotoRow {
  id: string;
  report_id: string;
  storage_path: string;
  position: number;
}

/**
 * Returns the top AI-suggested possible matches for one report.
 * POST so the private manage-link token travels in the body, not the URL.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return jsonError(503, "The database isn't connected yet.");
  if (!isSameOrigin(request)) return jsonError(403, "This request must come from the website.");
  if (!(await allowRequest(request, "view_matches", 120, 3600))) return jsonError(429, TOO_MANY);
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { token?: string };
  const access = await resolveReportAccess(id, body.token);
  if (!access) {
    return jsonError(403, "Only the person who made this report can see its possible matches. Log in, or open your private manage link.");
  }
  const { report } = access;
  const side = report.kind; // "lost" or "found"
  const admin = createAdminClient();

  // Photo analysis status for this report
  const { data: emb } = await admin.from("photo_embeddings").select("status, attempts").eq("report_id", id);
  const processing = {
    total: emb?.length ?? 0,
    done: emb?.filter((e) => e.status === "done").length ?? 0,
    pending: emb?.filter((e) => e.status === "pending").length ?? 0,
    failed: emb?.filter((e) => e.status === "failed").length ?? 0,
    aiAvailable: (await getImageEmbedder()) !== null,
  };

  const mine = side === "lost" ? "lost_report_id" : "found_report_id";
  const theirs = side === "lost" ? "found_report_id" : "lost_report_id";
  const { data: matchRows } = await admin
    .from("report_matches")
    .select("*")
    .eq(mine, id)
    .order("score", { ascending: false })
    .limit(20);

  const otherIds = (matchRows ?? []).map((m) => m[theirs] as string);
  const matchIds = (matchRows ?? []).map((m) => m.id as string);
  const [{ data: others }, { data: feedback }, { data: photos }] = await Promise.all([
    otherIds.length
      ? admin
          .from("pet_reports")
          .select("id, kind, species, pet_name, breed, primary_colour, secondary_colour, size, sex, suburb, event_at, animal_location, status, moderation, is_demo, reporter_type")
          .in("id", otherIds)
      : Promise.resolve({ data: [] }),
    matchIds.length
      ? admin.from("match_feedback").select("match_id, verdict").eq("side", side).in("match_id", matchIds)
      : Promise.resolve({ data: [] }),
    otherIds.length
      ? admin.from("report_photos").select("id, report_id, storage_path, position").in("report_id", [id, ...otherIds])
      : Promise.resolve({ data: [] }),
  ]);
  const otherById = new Map(((others ?? []) as OtherRow[]).map((o) => [o.id, o]));
  const verdictBy = new Map(((feedback ?? []) as { match_id: string; verdict: string }[]).map((f) => [f.match_id, f.verdict]));
  const photoList = (photos ?? []) as PhotoRow[];
  const photoById = new Map(photoList.map((p) => [p.id, p]));
  const firstPhoto = (reportId: string) =>
    photoList.filter((p) => p.report_id === reportId).sort((a, b) => a.position - b.position)[0];
  const photoUrl = (p?: { storage_path: string } | null) => (p ? publicPhotoUrl(thumbPathFor(p.storage_path)) : null);

  const usable = (matchRows ?? []).filter((m) => {
    const o = otherById.get(m[theirs]);
    return o && o.status === "active" && o.moderation === "visible";
  });
  const dismissed = usable.filter((m) => verdictBy.get(m.id) === "not_same");
  const shown = usable.filter((m) => verdictBy.get(m.id) !== "not_same").slice(0, RESULTS_SHOWN);

  return NextResponse.json({
    ok: true,
    report: { id: report.id, kind: report.kind, species: report.species, petName: report.pet_name, status: report.status },
    viewer: access.via,
    processing,
    dismissedCount: dismissed.length,
    matches: shown.map((m, i) => {
      const o = otherById.get(m[theirs])!;
      const myPhotoId = side === "lost" ? m.lost_photo_id : m.found_photo_id;
      const theirPhotoId = side === "lost" ? m.found_photo_id : m.lost_photo_id;
      const band = (m.visual_band ?? "none") as VisualBand;
      return {
        id: m.id,
        rank: i + 1,
        band,
        bandLabel: BAND_LABEL[band],
        comparedPairs: m.compared_pairs,
        distanceKm: m.distance_km,
        daysApart: m.days_apart,
        reasons: m.reasons,
        cautions: m.cautions,
        verdict: verdictBy.get(m.id) ?? null,
        myPhoto: photoUrl(photoById.get(myPhotoId) ?? firstPhoto(id)),
        other: {
          id: o.id,
          kind: o.kind,
          species: o.species,
          petName: o.kind === "lost" ? o.pet_name : null,
          breed: o.breed,
          primaryColour: o.primary_colour,
          secondaryColour: o.secondary_colour,
          size: o.size,
          sex: o.sex,
          suburb: o.suburb,
          eventAt: o.event_at,
          animalLocation: o.animal_location,
          isDemo: o.is_demo,
          fromPartner: o.reporter_type === "partner",
          photo: photoUrl(photoById.get(theirPhotoId) ?? firstPhoto(o.id)),
        },
      };
    }),
  });
}
