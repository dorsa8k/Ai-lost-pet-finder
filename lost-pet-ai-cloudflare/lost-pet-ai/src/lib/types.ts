// Shared types and human-readable labels. These mirror the database enums in
// supabase/migrations/20261113000001_phase1_core.sql — keep them in sync.

export const SPECIES = ["dog", "cat"] as const;
export const SIZES = ["small", "medium", "large", "unknown"] as const;
export const SEXES = ["male", "female", "unknown"] as const;
export const AGE_GROUPS = ["baby", "young", "adult", "senior", "unknown"] as const;
export const ANIMAL_LOCATIONS = ["with_finder", "with_vet", "with_shelter", "with_council", "not_contained"] as const;
export const CONTACT_METHODS = ["email", "phone", "either"] as const;
export const REPORT_KINDS = ["lost", "found"] as const;
export const REPORT_STATUSES = ["active", "reunited", "closed"] as const;
export const ORG_TYPES = ["vet_clinic", "animal_shelter", "council", "rescue_group", "other"] as const;
export const FLAG_REASONS = [
  "wrong_information",
  "suspected_scam",
  "inappropriate",
  "duplicate",
  "already_reunited",
  "other",
] as const;

export type Species = (typeof SPECIES)[number];
export type PetSize = (typeof SIZES)[number];
export type PetSex = (typeof SEXES)[number];
export type AgeGroup = (typeof AGE_GROUPS)[number];
export type AnimalLocation = (typeof ANIMAL_LOCATIONS)[number];
export type ContactMethod = (typeof CONTACT_METHODS)[number];
export type ReportKind = (typeof REPORT_KINDS)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export type OrgType = (typeof ORG_TYPES)[number];
export type FlagReason = (typeof FLAG_REASONS)[number];
export type UserRole = "user" | "partner" | "admin";

export const LABELS = {
  species: { dog: "Dog", cat: "Cat" } satisfies Record<Species, string>,
  size: { small: "Small", medium: "Medium", large: "Large", unknown: "Not sure" } satisfies Record<PetSize, string>,
  sex: { male: "Male", female: "Female", unknown: "Not sure" } satisfies Record<PetSex, string>,
  ageGroup: {
    baby: "Puppy / kitten",
    young: "Young (under 2)",
    adult: "Adult",
    senior: "Senior",
    unknown: "Not sure",
  } satisfies Record<AgeGroup, string>,
  animalLocation: {
    with_finder: "Safe with the person who found it",
    with_vet: "At a vet clinic",
    with_shelter: "At an animal shelter",
    with_council: "With the council",
    not_contained: "Seen but not contained",
  } satisfies Record<AnimalLocation, string>,
  contactMethod: { email: "Email", phone: "Phone", either: "Email or phone" } satisfies Record<ContactMethod, string>,
  kind: { lost: "Lost", found: "Found" } satisfies Record<ReportKind, string>,
  status: { active: "Active", reunited: "Reunited", closed: "Closed" } satisfies Record<ReportStatus, string>,
  orgType: {
    vet_clinic: "Veterinary clinic",
    animal_shelter: "Animal shelter",
    council: "Local council",
    rescue_group: "Rescue group",
    other: "Other",
  } satisfies Record<OrgType, string>,
  flagReason: {
    wrong_information: "Information looks wrong",
    suspected_scam: "Suspected scam or fake claim",
    inappropriate: "Inappropriate content",
    duplicate: "Duplicate report",
    already_reunited: "Pet already reunited",
    other: "Something else",
  } satisfies Record<FlagReason, string>,
};

/** Row shape of public.pet_reports as returned to the app. */
export interface PetReport {
  id: string;
  kind: ReportKind;
  status: ReportStatus;
  moderation: "visible" | "hidden";
  species: Species;
  pet_name: string | null;
  breed: string | null;
  primary_colour: string;
  secondary_colour: string | null;
  size: PetSize;
  age_group: AgeGroup;
  sex: PetSex;
  desexed: boolean | null;
  collar_description: string | null;
  markings: string | null;
  description: string | null;
  event_at: string;
  suburb: string;
  postcode: string | null;
  public_lat: number;
  public_lng: number;
  animal_location: AnimalLocation | null;
  reporter_type: "owner" | "finder" | "partner";
  owner_id: string | null;
  organisation_id: string | null;
  microchip_checked: boolean | null;
  is_demo: boolean;
  reunited_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportPhoto {
  id: string;
  report_id: string;
  storage_path: string;
  position: number;
  width: number | null;
  height: number | null;
}

export type ReportWithPhotos = PetReport & { report_photos: ReportPhoto[] };
