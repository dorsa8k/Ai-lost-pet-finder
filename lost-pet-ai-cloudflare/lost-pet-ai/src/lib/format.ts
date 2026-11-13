import { LABELS, type PetReport } from "./types";

const TZ = "Australia/Melbourne";

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  return formatDate(iso);
}

/** "Apricot Cavoodle" / "Grey & white cat" */
export function shortDescription(r: Pick<PetReport, "primary_colour" | "secondary_colour" | "breed" | "species">) {
  const colour = r.secondary_colour ? `${r.primary_colour} & ${r.secondary_colour.toLowerCase()}` : r.primary_colour;
  return `${colour} ${r.breed || LABELS.species[r.species].toLowerCase()}`;
}

export function reportTitle(r: Pick<PetReport, "kind" | "pet_name" | "species" | "primary_colour" | "secondary_colour" | "breed">) {
  if (r.kind === "lost" && r.pet_name) return `${r.pet_name} — lost ${LABELS.species[r.species].toLowerCase()}`;
  return `Found: ${shortDescription(r).toLowerCase()}`;
}
