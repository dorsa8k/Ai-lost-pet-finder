import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { isSupabaseConfigured, PHOTO_BUCKET } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth";
import { parseReport } from "@/lib/validation";
import { approximateLocation } from "@/lib/geo";
import { generateManageToken } from "@/lib/tokens";
import { MAX_PHOTOS, PhotoError, photoPaths, processPhoto, type ProcessedPhoto } from "@/lib/images";
import { allowRequest, isSameOrigin, jsonError, SERVER_PROBLEM, textFields, TOO_MANY } from "@/lib/http";
import { log } from "@/lib/logger";


/** Creates a lost or found pet report, with photos. */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return jsonError(503, "The database isn't connected yet. See README → Set up Supabase.");
  if (!isSameOrigin(request)) return jsonError(403, "This form must be sent from the website.");

  const length = Number(request.headers.get("content-length") || 0);
  if (length > 17_000_000) return jsonError(413, "Those photos are too large together. Please remove one or two and try again.");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "We couldn't read the form. Please try again.");
  }
  const fields = textFields(form);
  const kind = fields.kind === "lost" ? "lost" : fields.kind === "found" ? "found" : null;
  if (!kind) return jsonError(400, "Unknown report type.");

  const user = await getCurrentUser();
  if (kind === "lost" && !user) {
    return jsonError(401, "Please log in or create a free account to report a lost pet, so you can manage your report later.");
  }

  if (!(await allowRequest(request, "create_report", 6, 3600))) return jsonError(429, TOO_MANY);

  const parsed = parseReport(fields, kind);
  const files = form.getAll("photos").filter((f): f is File => typeof f !== "string");
  const thumbs = form.getAll("thumbs").filter((f): f is File => typeof f !== "string");
  const errors: Record<string, string> = parsed.ok ? {} : { ...parsed.errors };
  if (files.length > MAX_PHOTOS) errors.photos = `Please add no more than ${MAX_PHOTOS} photos.`;
  if (kind === "lost" && files.length === 0) errors.photos = "Please add at least one photo of your pet.";
  if (files.length !== thumbs.length) errors.photos = "The photos didn't upload correctly. Please refresh the page and try again.";

  // Check and clean every photo before saving anything, so a bad photo can't leave a half-saved report.
  const processed: ProcessedPhoto[] = [];
  if (!errors.photos) {
    for (const [i, file] of files.entries()) {
      try {
        processed.push(
          processPhoto(new Uint8Array(await file.arrayBuffer()), new Uint8Array(await thumbs[i].arrayBuffer()), `Photo ${i + 1}`),
        );
      } catch (e) {
        errors.photos = e instanceof PhotoError ? e.message : "One of the photos couldn't be processed.";
        break;
      }
    }
  }
  if (!parsed.ok || Object.keys(errors).length > 0) {
    return jsonError(422, "Please check the highlighted details.", errors);
  }
  const d = parsed.data;

  const admin = createAdminClient();
  let isVerifiedPartner = false;
  if (user?.organisationId && (user.role === "partner" || user.role === "admin")) {
    const { data: org } = await admin.from("organisations").select("verified").eq("id", user.organisationId).maybeSingle();
    isVerifiedPartner = org?.verified === true;
  }
  const reporterType = kind === "lost" ? "owner" : isVerifiedPartner ? "partner" : "finder";
  const publicPoint = approximateLocation(d.lat, d.lng);
  const reportId = randomUUID();
  const { token, hash } = generateManageToken();
  const uploaded: string[] = [];

  try {
    const { error: reportError } = await admin.from("pet_reports").insert({
      id: reportId,
      kind,
      species: d.species,
      pet_name: d.petName,
      breed: d.breed,
      primary_colour: d.primaryColour,
      secondary_colour: d.secondaryColour,
      size: d.size,
      age_group: d.ageGroup,
      sex: d.sex,
      desexed: d.desexed,
      collar_description: d.collarDescription,
      markings: d.markings,
      description: d.description,
      event_at: d.eventAt.toISOString(),
      suburb: d.suburb,
      postcode: d.postcode,
      public_lat: publicPoint.lat,
      public_lng: publicPoint.lng,
      animal_location: d.animalLocation,
      reporter_type: reporterType,
      owner_id: user?.id ?? null,
      organisation_id: reporterType === "partner" ? user!.organisationId : null,
      microchip_checked: reporterType === "partner" ? fields.microchipChecked === "on" : null,
      is_demo: false,
    });
    if (reportError) throw reportError;

    const { error: privateError } = await admin.from("report_private").insert({
      report_id: reportId,
      exact_lat: d.locationIsExact ? d.lat : null,
      exact_lng: d.locationIsExact ? d.lng : null,
      location_notes: d.locationNotes,
      contact_name: d.contactName,
      contact_email: d.contactEmail,
      contact_phone: d.contactPhone,
      preferred_contact: d.preferredContact,
      microchip_number: d.microchipNumber,
      manage_token_hash: hash,
    });
    if (privateError) throw privateError;

    for (const [i, photo] of processed.entries()) {
      const photoId = randomUUID();
      const paths = photoPaths(reportId, photoId);
      for (const [path, body] of [
        [paths.full, photo.full],
        [paths.thumb, photo.thumb],
      ] as const) {
        const { error } = await admin.storage.from(PHOTO_BUCKET).upload(path, body, {
          contentType: "image/jpeg",
          cacheControl: "31536000",
          upsert: false,
        });
        if (error) throw error;
        uploaded.push(path);
      }
      const { error: photoError } = await admin.from("report_photos").insert({
        id: photoId,
        report_id: reportId,
        storage_path: paths.full,
        position: i,
        width: photo.width,
        height: photo.height,
      });
      if (photoError) throw photoError;
    }
  } catch (e) {
    log.error("create_report_failed", { kind, error: e instanceof Error ? e.message : String(e) });
    // Roll back: remove anything partially saved.
    await admin.from("pet_reports").delete().eq("id", reportId);
    if (uploaded.length) await admin.storage.from(PHOTO_BUCKET).remove(uploaded);
    return jsonError(500, SERVER_PROBLEM);
  }

  log.info("report_created", { kind, reporterType, photos: processed.length });
  return NextResponse.json({
    ok: true,
    redirect: `/report/submitted/${reportId}`,
    store: { [`manage:${reportId}`]: token },
  });
}
