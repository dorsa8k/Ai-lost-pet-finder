"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { FormStatus, useApiSubmit } from "./ApiForm";
import { SUBURB_NAMES } from "@/lib/suburbs";
import { AGE_GROUPS, ANIMAL_LOCATIONS, LABELS, SEXES, SIZES } from "@/lib/types";

const MAX_PHOTOS = 5;
const MAX_EDGE = 1600;

interface Picked {
  id: string;
  name: string;
  blob: Blob;
  thumb: Blob;
  url: string;
}

const THUMB_EDGE = 480;

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality),
  );
}

/**
 * Prepares a photo in the browser: applies the camera's rotation, shrinks it,
 * and saves a fresh JPEG plus a square thumbnail. Re-drawing drops the
 * camera's hidden metadata (including GPS); the server double-checks.
 */
async function preparePhoto(file: File): Promise<{ full: Blob; thumb: Blob }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const full = document.createElement("canvas");
    full.width = Math.round(bitmap.width * scale);
    full.height = Math.round(bitmap.height * scale);
    full.getContext("2d")!.drawImage(bitmap, 0, 0, full.width, full.height);

    // Square thumbnail cropped from the centre
    const side = Math.min(bitmap.width, bitmap.height);
    const thumb = document.createElement("canvas");
    thumb.width = Math.min(THUMB_EDGE, side);
    thumb.height = thumb.width;
    thumb
      .getContext("2d")!
      .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, thumb.width, thumb.height);

    return { full: await canvasToJpeg(full, 0.85), thumb: await canvasToJpeg(thumb, 0.8) };
  } finally {
    bitmap.close();
  }
}

function localDateTimeValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function Field({
  label,
  hint,
  htmlFor,
  required,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="field-label">
        {label}
        {!required && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {hint && (
        <span className="field-hint" id={`${htmlFor}-hint`}>
          {hint}
        </span>
      )}
      {children}
    </div>
  );
}

export function ReportForm({
  kind,
  defaultEmail = "",
  defaultName = "",
  isPartner = false,
}: {
  kind: "lost" | "found";
  defaultEmail?: string;
  defaultName?: string;
  isPartner?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const { submit, pending, message, errors } = useApiSubmit("/api/reports");
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);
  const [maxDate, setMaxDate] = useState<string>("");
  const lost = kind === "lost";

  useEffect(() => setMaxDate(localDateTimeValue(new Date())), []);
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  async function onPickPhotos(files: FileList | null) {
    if (!files?.length) return;
    setPhotoError(null);
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) setPhotoError(`You can add up to ${MAX_PHOTOS} photos. Extra photos were skipped.`);
    setProcessing(true);
    const added: Picked[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      try {
        const { full, thumb } = await preparePhoto(file);
        added.push({ id: crypto.randomUUID(), name: file.name, blob: full, thumb, url: URL.createObjectURL(thumb) });
      } catch {
        setPhotoError(`We couldn't open "${file.name}". Please use a JPG, PNG or WebP photo.`);
      }
    }
    setPhotos((prev) => [...prev, ...added]);
    setProcessing(false);
  }

  function removePhoto(id: string) {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  }

  function shareLocation() {
    if (!("geolocation" in navigator)) {
      setGeoStatus("Your browser can't share a location. Choosing a suburb is enough.");
      return;
    }
    setGeoStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)) });
        setGeoStatus("Location added. Only an approximate area (about 500 m) will be shown publicly.");
      },
      () => setGeoStatus("Location wasn't shared. That's fine — the suburb is enough."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    fd.delete("photoPicker");
    fd.set("kind", kind);
    const local = String(fd.get("eventLocal") || "");
    fd.delete("eventLocal");
    if (local) {
      const d = new Date(local); // interpreted in the visitor's own timezone
      if (!Number.isNaN(d.getTime())) fd.set("eventAt", d.toISOString());
    }
    if (coords) {
      fd.set("lat", String(coords.lat));
      fd.set("lng", String(coords.lng));
    }
    photos.forEach((p, i) => {
      fd.append("photos", p.blob, `photo-${i + 1}.jpg`);
      fd.append("thumbs", p.thumb, `thumb-${i + 1}.jpg`);
    });
    void submit(form, fd);
  }

  const err = (name: string) => (errors[name] ? { "aria-invalid": true as const } : {});

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <FormStatus message={message} errors={errors} />

      <fieldset className="bg-paper rounded-2xl border border-line p-5 sm:p-7 flex flex-col gap-5">
        <legend className="font-display text-2xl font-bold text-teal px-1">Photos</legend>
        <p className="text-muted -mt-2">
          {lost
            ? "Clear photos are the most useful thing you can add. Include the face, full body and any markings. At least one photo is required."
            : "If you can take a photo safely, add one — it helps the owner recognise their pet. Avoid showing your house number or car registration."}
        </p>
        <div>
          <label htmlFor="photoPicker" className="btn btn-outline cursor-pointer">
            {photos.length ? "Add more photos" : "Choose photos"}
          </label>
          <input
            id="photoPicker"
            name="photoPicker"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              void onPickPhotos(e.target.files);
              e.target.value = "";
            }}
            disabled={photos.length >= MAX_PHOTOS || processing}
            aria-describedby="photo-help"
            {...err("photos")}
          />
          <p id="photo-help" className="text-sm text-muted mt-2">
            Up to {MAX_PHOTOS} photos. Location data stored inside photos is removed when they upload.
          </p>
          {processing && <p role="status">Preparing photos…</p>}
          {photoError && (
            <p role="alert" className="text-coral-deep font-semibold mt-2">
              {photoError}
            </p>
          )}
        </div>
        {photos.length > 0 && (
          <ul className="grid grid-cols-2 sm:grid-cols-5 gap-3" aria-label="Selected photos">
            {photos.map((p, i) => (
              <li key={p.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={`Selected photo ${i + 1}`} className="aspect-square w-full object-cover rounded-lg" />
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  className="mt-1 text-sm underline text-teal"
                  aria-label={`Remove photo ${i + 1}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      <fieldset className="bg-paper rounded-2xl border border-line p-5 sm:p-7 grid gap-5 sm:grid-cols-2">
        <legend className="font-display text-2xl font-bold text-teal px-1">About the {lost ? "pet" : "animal"}</legend>
        <div className="sm:col-span-2">
          <span className="field-label" id="species-label">
            Dog or cat?
          </span>
          <div role="radiogroup" aria-labelledby="species-label" className="flex gap-3">
            {(["dog", "cat"] as const).map((s) => (
              <label key={s} className="flex items-center gap-2 border-[1.5px] border-[#b9c7c2] rounded-full px-5 py-2.5 cursor-pointer has-[:checked]:bg-mint has-[:checked]:border-teal">
                <input type="radio" name="species" value={s} required {...err("species")} />
                {LABELS.species[s]}
              </label>
            ))}
          </div>
        </div>
        <Field label={lost ? "Pet's name" : "Name on tag"} htmlFor="petName" required={lost} hint={lost ? undefined : "Only if the animal has a name tag."}>
          <input id="petName" name="petName" className="input" maxLength={60} autoComplete="off" {...err("petName")} />
        </Field>
        <Field label="Breed" htmlFor="breed" hint="Write “mixed” or “not sure” if unknown.">
          <input id="breed" name="breed" className="input" maxLength={80} {...err("breed")} />
        </Field>
        <Field label="Main colour" htmlFor="primaryColour" required>
          <input id="primaryColour" name="primaryColour" className="input" maxLength={40} placeholder="e.g. Black, Apricot, Tabby" {...err("primaryColour")} />
        </Field>
        <Field label="Second colour" htmlFor="secondaryColour">
          <input id="secondaryColour" name="secondaryColour" className="input" maxLength={40} {...err("secondaryColour")} />
        </Field>
        <Field label="Size" htmlFor="size">
          <select id="size" name="size" className="input" defaultValue="unknown">
            {SIZES.map((s) => (
              <option key={s} value={s}>{LABELS.size[s]}</option>
            ))}
          </select>
        </Field>
        <Field label="Approximate age" htmlFor="ageGroup">
          <select id="ageGroup" name="ageGroup" className="input" defaultValue="unknown">
            {AGE_GROUPS.map((s) => (
              <option key={s} value={s}>{LABELS.ageGroup[s]}</option>
            ))}
          </select>
        </Field>
        <Field label="Sex" htmlFor="sex">
          <select id="sex" name="sex" className="input" defaultValue="unknown">
            {SEXES.map((s) => (
              <option key={s} value={s}>{LABELS.sex[s]}</option>
            ))}
          </select>
        </Field>
        {lost && (
          <Field label="Desexed" htmlFor="desexed">
            <select id="desexed" name="desexed" className="input" defaultValue="">
              <option value="">Prefer not to say</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </Field>
        )}
        <Field label="Collar" htmlFor="collarDescription" hint="Colour, tags, harness — or “no collar”.">
          <input id="collarDescription" name="collarDescription" className="input" maxLength={200} {...err("collarDescription")} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Distinguishing markings" htmlFor="markings" hint="Patches, scars, ear notches, eye colour, anything unusual.">
            <textarea id="markings" name="markings" className="input" maxLength={500} {...err("markings")} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="bg-paper rounded-2xl border border-line p-5 sm:p-7 grid gap-5 sm:grid-cols-2">
        <legend className="font-display text-2xl font-bold text-teal px-1">{lost ? "Where and when they went missing" : "Where and when you found it"}</legend>
        <Field label={lost ? "Last seen" : "Found"} htmlFor="eventLocal" required hint="Date and time — a best guess is fine.">
          <input id="eventLocal" name="eventLocal" type="datetime-local" className="input" max={maxDate || undefined} required {...err("eventAt")} />
        </Field>
        <Field label="Suburb" htmlFor="suburb" required hint="Start typing and choose from the list.">
          <input id="suburb" name="suburb" className="input" list="suburb-list" autoComplete="off" required {...err("suburb")} />
          <datalist id="suburb-list">
            {SUBURB_NAMES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <div className="sm:col-span-2">
          <span className="field-label">Precise location</span>
          <span className="field-hint">
            If you&apos;re standing where {lost ? "your pet was last seen" : "you found the animal"}, you can share your location.
            It&apos;s kept private. The public only sees an area of about 500&nbsp;m.
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-outline btn-small" onClick={shareLocation}>
              Use my current location
            </button>
            {coords && (
              <button type="button" className="underline text-teal" onClick={() => { setCoords(null); setGeoStatus("Precise location removed."); }}>
                Remove precise location
              </button>
            )}
          </div>
          {geoStatus && <p role="status" className="text-sm mt-2">{geoStatus}</p>}
        </div>
        <div className="sm:col-span-2">
          <Field label="Location notes" htmlFor="locationNotes" hint="Private. e.g. “near the playground on Kelletts Rd”.">
            <input id="locationNotes" name="locationNotes" className="input" maxLength={300} {...err("locationNotes")} />
          </Field>
        </div>
        {!lost && (
          <div className="sm:col-span-2">
            <span className="field-label" id="animalLocation-label">Where is the animal now?</span>
            <div role="radiogroup" aria-labelledby="animalLocation-label" className="grid gap-2 sm:grid-cols-2">
              {ANIMAL_LOCATIONS.map((a) => (
                <label key={a} className="flex items-center gap-2 border-[1.5px] border-[#b9c7c2] rounded-lg px-3 py-2.5 cursor-pointer has-[:checked]:bg-mint has-[:checked]:border-teal">
                  <input type="radio" name="animalLocation" value={a} {...err("animalLocation")} />
                  {LABELS.animalLocation[a]}
                </label>
              ))}
            </div>
          </div>
        )}
        {!lost && isPartner && (
          <label className="sm:col-span-2 flex items-center gap-2">
            <input type="checkbox" name="microchipChecked" />
            We have scanned this animal for a microchip
          </label>
        )}
        <div className="sm:col-span-2">
          <Field label="Anything else that would help" htmlFor="description" hint="Temperament, medical needs, which way they were heading. This is shown publicly.">
            <textarea id="description" name="description" className="input" maxLength={2000} {...err("description")} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="bg-paper rounded-2xl border border-line p-5 sm:p-7 grid gap-5 sm:grid-cols-2">
        <legend className="font-display text-2xl font-bold text-teal px-1">How we reach you</legend>
        <p className="sm:col-span-2 text-muted -mt-2">
          Your details are never shown publicly. People who think they can help send a message through {""}
          this site, and you decide whether to reply.
        </p>
        <Field label="Your name" htmlFor="contactName">
          <input id="contactName" name="contactName" className="input" maxLength={80} defaultValue={defaultName} autoComplete="name" />
        </Field>
        <Field label="Email" htmlFor="contactEmail" required>
          <input id="contactEmail" name="contactEmail" type="email" className="input" defaultValue={defaultEmail} autoComplete="email" required {...err("contactEmail")} />
        </Field>
        <Field label="Phone" htmlFor="contactPhone">
          <input id="contactPhone" name="contactPhone" type="tel" className="input" autoComplete="tel" {...err("contactPhone")} />
        </Field>
        <Field label="Preferred contact method" htmlFor="preferredContact">
          <select id="preferredContact" name="preferredContact" className="input" defaultValue="email">
            <option value="email">Email</option>
            <option value="phone">Phone</option>
            <option value="either">Either</option>
          </select>
        </Field>
        {lost && (
          <div className="sm:col-span-2">
            <Field label="Microchip number" htmlFor="microchipNumber" hint="Private — never displayed. Helps vets and councils confirm ownership.">
              <input id="microchipNumber" name="microchipNumber" className="input" inputMode="numeric" maxLength={20} autoComplete="off" {...err("microchipNumber")} />
            </Field>
          </div>
        )}
      </fieldset>

      <label className="flex items-start gap-3 text-[1rem]">
        <input type="checkbox" name="consent" className="mt-1.5 size-5" {...err("consent")} />
        <span>
          The details are accurate to the best of my knowledge, and I agree to the{" "}
          <Link href="/terms" target="_blank">Terms of use</Link> and <Link href="/privacy" target="_blank">Privacy policy</Link>.
        </span>
      </label>

      <div>
        <button type="submit" className="btn btn-coral text-lg px-8 py-4" disabled={pending || processing}>
          {pending ? "Saving your report…" : lost ? "Publish lost pet report" : "Publish found pet report"}
        </button>
      </div>
    </form>
  );
}
