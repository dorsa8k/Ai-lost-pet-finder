/**
 * Server-side validation for every form in the app.
 * Written without external libraries so it is easy to read and unit-test.
 * Each parser returns either { ok: true, data } or { ok: false, errors },
 * where `errors` maps a form field name to a plain-English message.
 */
import { findSuburb } from "./suburbs";
import { isInVictoria } from "./geo";
import {
  AGE_GROUPS,
  ANIMAL_LOCATIONS,
  CONTACT_METHODS,
  FLAG_REASONS,
  ORG_TYPES,
  SEXES,
  SIZES,
  SPECIES,
  type AgeGroup,
  type AnimalLocation,
  type ContactMethod,
  type FlagReason,
  type OrgType,
  type PetSex,
  type PetSize,
  type ReportKind,
  type Species,
} from "./types";

export type Fields = Record<string, string | undefined>;
export type Errors = Record<string, string>;
export type Result<T> = { ok: true; data: T } | { ok: false; errors: Errors };

// ---------- small helpers ---------------------------------------------

/** Trim, collapse internal whitespace (except newlines) and strip control characters. */
export function clean(value: string | undefined | null): string {
  if (!value) return "";
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

/** Australian phone numbers: 8–12 digits after removing spaces, brackets, dashes and a leading +61. */
export function normalisePhone(value: string): string | null {
  const stripped = value.replace(/[\s()-]/g, "");
  if (!/^\+?\d+$/.test(stripped)) return null;
  const digits = stripped.startsWith("+61") ? "0" + stripped.slice(3) : stripped.replace(/^\+/, "");
  if (digits.length < 8 || digits.length > 12) return null;
  return digits;
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | null {
  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function optionalText(
  fields: Fields,
  key: string,
  max: number,
  errors: Errors,
  label: string,
): string | null {
  const v = clean(fields[key]);
  if (!v) return null;
  if (v.length > max) {
    errors[key] = `${label} must be ${max} characters or fewer.`;
    return null;
  }
  return v;
}

function requiredText(
  fields: Fields,
  key: string,
  min: number,
  max: number,
  errors: Errors,
  label: string,
): string {
  const v = clean(fields[key]);
  if (v.length < min) errors[key] = min <= 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`;
  else if (v.length > max) errors[key] = `${label} must be ${max} characters or fewer.`;
  return v;
}

function checkbox(fields: Fields, key: string): boolean {
  const v = fields[key];
  return v === "on" || v === "true" || v === "yes";
}

// ---------- pet reports -------------------------------------------------

export interface ReportInput {
  kind: ReportKind;
  species: Species;
  petName: string | null;
  breed: string | null;
  primaryColour: string;
  secondaryColour: string | null;
  size: PetSize;
  ageGroup: AgeGroup;
  sex: PetSex;
  desexed: boolean | null;
  collarDescription: string | null;
  markings: string | null;
  description: string | null;
  eventAt: Date;
  suburb: string;
  postcode: string;
  /** Exact point if the reporter shared one; otherwise the suburb centre. */
  lat: number;
  lng: number;
  locationIsExact: boolean;
  locationNotes: string | null;
  animalLocation: AnimalLocation | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  preferredContact: ContactMethod;
  microchipNumber: string | null;
}

export const MAX_EVENT_AGE_DAYS = 365;

export function parseReport(fields: Fields, kind: ReportKind, now: Date = new Date()): Result<ReportInput> {
  const errors: Errors = {};

  const species = oneOf(clean(fields.species), SPECIES);
  if (!species) errors.species = "Please choose dog or cat.";

  const petName =
    kind === "lost"
      ? requiredText(fields, "petName", 1, 60, errors, "Pet name")
      : optionalText(fields, "petName", 60, errors, "Name on tag");
  const breed = optionalText(fields, "breed", 80, errors, "Breed");
  const primaryColour = requiredText(fields, "primaryColour", 1, 40, errors, "Main colour");
  const secondaryColour = optionalText(fields, "secondaryColour", 40, errors, "Second colour");
  const size = oneOf(clean(fields.size) || "unknown", SIZES) ?? "unknown";
  const ageGroup = oneOf(clean(fields.ageGroup) || "unknown", AGE_GROUPS) ?? "unknown";
  const sex = oneOf(clean(fields.sex) || "unknown", SEXES) ?? "unknown";
  const desexedRaw = clean(fields.desexed);
  const desexed = desexedRaw === "yes" ? true : desexedRaw === "no" ? false : null;
  const collarDescription = optionalText(fields, "collarDescription", 200, errors, "Collar description");
  const markings = optionalText(fields, "markings", 500, errors, "Markings");
  const description = optionalText(fields, "description", 2000, errors, "Additional notes");
  const locationNotes = optionalText(fields, "locationNotes", 300, errors, "Location notes");

  // Date/time: the browser sends an ISO string with timezone.
  const eventLabel = kind === "lost" ? "Date last seen" : "Date found";
  const eventAt = new Date(clean(fields.eventAt));
  if (!clean(fields.eventAt) || Number.isNaN(eventAt.getTime())) {
    errors.eventAt = `${eventLabel} is required.`;
  } else if (eventAt.getTime() > now.getTime() + 10 * 60 * 1000) {
    errors.eventAt = `${eventLabel} can't be in the future.`;
  } else if (now.getTime() - eventAt.getTime() > MAX_EVENT_AGE_DAYS * 86_400_000) {
    errors.eventAt = `${eventLabel} must be within the last 12 months.`;
  }

  // Suburb and location
  const suburb = findSuburb(clean(fields.suburb));
  if (!suburb) {
    errors.suburb = "Please choose a suburb from the list. We currently cover Knox and nearby suburbs.";
  }
  let lat = suburb?.lat ?? 0;
  let lng = suburb?.lng ?? 0;
  let locationIsExact = false;
  const latRaw = clean(fields.lat);
  const lngRaw = clean(fields.lng);
  if (latRaw || lngRaw) {
    const pLat = Number(latRaw);
    const pLng = Number(lngRaw);
    if (!isInVictoria(pLat, pLng)) {
      errors.lat = "The shared location doesn't look right. Remove it and choose a suburb instead.";
    } else {
      lat = pLat;
      lng = pLng;
      locationIsExact = true;
    }
  }

  // Where the animal is now (found reports only)
  let animalLocation: AnimalLocation | null = null;
  if (kind === "found") {
    animalLocation = oneOf(clean(fields.animalLocation), ANIMAL_LOCATIONS);
    if (!animalLocation) errors.animalLocation = "Please tell us where the animal is now.";
  }

  // Contact details (kept private)
  const contactName = optionalText(fields, "contactName", 80, errors, "Your name");
  const emailRaw = clean(fields.contactEmail).toLowerCase();
  let contactEmail: string | null = null;
  if (emailRaw) {
    if (isValidEmail(emailRaw)) contactEmail = emailRaw;
    else errors.contactEmail = "Please enter a valid email address.";
  } else {
    errors.contactEmail = "An email address is required so we can reach you privately.";
  }
  const phoneRaw = clean(fields.contactPhone);
  let contactPhone: string | null = null;
  if (phoneRaw) {
    contactPhone = normalisePhone(phoneRaw);
    if (!contactPhone) errors.contactPhone = "Please enter a valid Australian phone number.";
  }
  const preferredContact = oneOf(clean(fields.preferredContact) || "email", CONTACT_METHODS) ?? "email";
  if ((preferredContact === "phone" || preferredContact === "either") && !phoneRaw) {
    errors.contactPhone = "Add a phone number, or choose email as your preferred contact method.";
  }

  // Microchip (lost reports; never shown publicly)
  let microchipNumber: string | null = null;
  const chipRaw = clean(fields.microchipNumber).replace(/\s/g, "");
  if (chipRaw) {
    if (/^\d{9,15}$/.test(chipRaw)) microchipNumber = chipRaw;
    else errors.microchipNumber = "Microchip numbers are 9–15 digits (usually 15).";
  }

  if (!checkbox(fields, "consent")) {
    errors.consent = "Please confirm the details are accurate and that you agree to the Terms and Privacy Policy.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      kind,
      species: species!,
      petName: petName || null,
      breed,
      primaryColour,
      secondaryColour,
      size,
      ageGroup,
      sex,
      desexed,
      collarDescription,
      markings,
      description,
      eventAt,
      suburb: suburb!.name,
      postcode: suburb!.postcode,
      lat,
      lng,
      locationIsExact,
      locationNotes,
      animalLocation,
      contactName,
      contactEmail,
      contactPhone,
      preferredContact,
      microchipNumber,
    },
  };
}

// ---------- messages to a reporter -----------------------------------

export interface MessageInput {
  senderName: string;
  senderEmail: string | null;
  senderPhone: string | null;
  body: string;
}

export function parseMessage(fields: Fields): Result<MessageInput> {
  const errors: Errors = {};
  const senderName = requiredText(fields, "senderName", 1, 80, errors, "Your name");
  const body = requiredText(fields, "body", 10, 2000, errors, "Message");
  const emailRaw = clean(fields.senderEmail).toLowerCase();
  const phoneRaw = clean(fields.senderPhone);
  let senderEmail: string | null = null;
  let senderPhone: string | null = null;
  if (emailRaw) {
    if (isValidEmail(emailRaw)) senderEmail = emailRaw;
    else errors.senderEmail = "Please enter a valid email address.";
  }
  if (phoneRaw) {
    senderPhone = normalisePhone(phoneRaw);
    if (!senderPhone) errors.senderPhone = "Please enter a valid Australian phone number.";
  }
  if (!emailRaw && !phoneRaw) errors.senderEmail = "Add an email or phone number so the reporter can reply.";
  if (!checkbox(fields, "consent")) errors.consent = "Please agree to share your contact details with the reporter.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { senderName, senderEmail, senderPhone, body } };
}

// ---------- moderation flags ------------------------------------------

export function parseFlag(fields: Fields): Result<{ reason: FlagReason; details: string | null }> {
  const errors: Errors = {};
  const reason = oneOf(clean(fields.reason), FLAG_REASONS);
  if (!reason) errors.reason = "Please choose a reason.";
  const details = optionalText(fields, "details", 1000, errors, "Details");
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { reason: reason!, details } };
}

// ---------- partner applications --------------------------------------

export interface PartnerApplicationInput {
  organisationName: string;
  organisationType: OrgType;
  contactName: string;
  email: string;
  phone: string | null;
  suburb: string | null;
  website: string | null;
  message: string | null;
}

export function parsePartnerApplication(fields: Fields): Result<PartnerApplicationInput> {
  const errors: Errors = {};
  const organisationName = requiredText(fields, "organisationName", 2, 120, errors, "Organisation name");
  const organisationType = oneOf(clean(fields.organisationType), ORG_TYPES);
  if (!organisationType) errors.organisationType = "Please choose an organisation type.";
  const contactName = requiredText(fields, "contactName", 2, 80, errors, "Contact name");
  const email = clean(fields.email).toLowerCase();
  if (!isValidEmail(email)) errors.email = "Please enter a valid business email address.";
  const phoneRaw = clean(fields.phone);
  let phone: string | null = null;
  if (phoneRaw) {
    phone = normalisePhone(phoneRaw);
    if (!phone) errors.phone = "Please enter a valid Australian phone number.";
  }
  const suburb = optionalText(fields, "suburb", 60, errors, "Suburb");
  let website = optionalText(fields, "website", 200, errors, "Website");
  if (website) {
    if (!/^https?:\/\//i.test(website)) website = `https://${website}`;
    try {
      const u = new URL(website);
      if (!u.hostname.includes(".")) throw new Error("bad host");
      website = u.toString();
    } catch {
      errors.website = "Please enter a valid website address.";
    }
  }
  const message = optionalText(fields, "message", 2000, errors, "Message");
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    data: { organisationName, organisationType: organisationType!, contactName, email, phone, suburb, website, message },
  };
}

// ---------- contact form ---------------------------------------------

export function parseContact(fields: Fields): Result<{ name: string; email: string; subject: string; message: string }> {
  const errors: Errors = {};
  const name = requiredText(fields, "name", 1, 80, errors, "Name");
  const email = clean(fields.email).toLowerCase();
  if (!isValidEmail(email)) errors.email = "Please enter a valid email address.";
  const subject = requiredText(fields, "subject", 2, 120, errors, "Subject");
  const message = requiredText(fields, "message", 10, 4000, errors, "Message");
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, data: { name, email, subject, message } };
}

// ---------- search filters --------------------------------------------

export interface SearchFilters {
  kind: ReportKind | null;
  species: Species | null;
  suburb: string | null;
  days: number | null;
  q: string | null;
  page: number;
}

/** Search params are untrusted: anything invalid is ignored rather than erroring. */
export function parseSearchParams(params: Record<string, string | string[] | undefined>): SearchFilters {
  const get = (k: string) => {
    const v = params[k];
    return clean(Array.isArray(v) ? v[0] : v);
  };
  const kind = get("kind") === "lost" || get("kind") === "found" ? (get("kind") as ReportKind) : null;
  const species = oneOf(get("species"), SPECIES);
  const suburbInput = get("suburb");
  const suburb =
    findSuburb(suburbInput)?.name ??
    (/^\d{4}$/.test(suburbInput) ? suburbInput : null); // allow a postcode
  const daysNum = Number(get("days"));
  const days = [1, 3, 7, 14, 30, 90].includes(daysNum) ? daysNum : null;
  const q = get("q").slice(0, 60).replace(/[%_,()]/g, " ").trim() || null;
  const pageNum = Math.floor(Number(get("page")));
  const page = Number.isFinite(pageNum) && pageNum >= 1 && pageNum <= 100 ? pageNum : 1;
  return { kind, species, suburb, days, q, page };
}
