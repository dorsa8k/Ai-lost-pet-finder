import Link from "next/link";
import { PetPhoto } from "./PetPhoto";
import { LABELS, type ReportWithPhotos } from "@/lib/types";
import { reportTitle, shortDescription, timeAgo } from "@/lib/format";

export function KindTag({ kind }: { kind: "lost" | "found" }) {
  return kind === "lost" ? (
    <span className="inline-block rounded-md bg-coral px-2 py-0.5 text-sm font-bold text-white">Lost</span>
  ) : (
    <span className="inline-block rounded-md bg-teal px-2 py-0.5 text-sm font-bold text-white">Found</span>
  );
}

export function DemoTag() {
  return (
    <span
      className="inline-block rounded-md border border-dashed border-muted px-2 py-0.5 text-sm text-muted"
      title="Fictional record for demonstration only"
    >
      Demo record
    </span>
  );
}

/** Compact card used in search results and lists. */
export function PetCard({ report }: { report: ReportWithPhotos }) {
  const title = reportTitle(report);
  return (
    <article className="bg-paper rounded-xl border border-line overflow-hidden flex flex-col">
      <Link href={`/pets/${report.id}`} className="block no-underline text-inherit group">
        <PetPhoto
          photo={report.report_photos[0]}
          species={report.species}
          alt={title}
          className="aspect-[4/3] w-full"
        />
        <div className="p-4 flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-2 items-center">
            <KindTag kind={report.kind} />
            {report.is_demo && <DemoTag />}
          </div>
          <h3 className="text-lg font-bold group-hover:underline">
            {report.kind === "lost" && report.pet_name ? report.pet_name : shortDescription(report)}
          </h3>
          {report.kind === "lost" && <p className="text-muted">{shortDescription(report)}</p>}
          <p className="text-muted text-[0.95rem]">
            {report.kind === "lost" ? "Last seen" : "Found"} in {report.suburb}, {timeAgo(report.event_at)}
          </p>
          {report.kind === "found" && report.animal_location && (
            <p className="text-[0.95rem]">{LABELS.animalLocation[report.animal_location]}</p>
          )}
        </div>
      </Link>
    </article>
  );
}

/** Hero "paper poster" card — the home page's signature element. */
export function PosterCard({ report, tilt = 0, delay = 0 }: { report: ReportWithPhotos; tilt?: number; delay?: number }) {
  const heading = report.kind === "lost" ? `Lost ${LABELS.species[report.species].toLowerCase()}` : `Found ${LABELS.species[report.species].toLowerCase()}`;
  return (
    <Link
      href={`/pets/${report.id}`}
      className="poster poster-drop block no-underline text-ink p-3 pb-4 w-full"
      style={{ ["--tilt" as string]: `${tilt}deg`, transform: `rotate(${tilt}deg)`, animationDelay: `${delay}ms` }}
    >
      <p
        className={`font-display font-extrabold text-[1.7rem] leading-none text-center pt-2 pb-2 ${report.kind === "lost" ? "text-coral" : "text-teal"}`}
      >
        {heading}
      </p>
      <PetPhoto
        photo={report.report_photos[0]}
        species={report.species}
        alt={reportTitle(report)}
        className="aspect-square w-full"
      />
      <p className="font-display font-bold text-xl mt-2 text-teal">
        {report.kind === "lost" && report.pet_name ? report.pet_name : shortDescription(report)}
      </p>
      <p className="text-[0.95rem] text-muted">
        {report.suburb}, {timeAgo(report.event_at)}
      </p>
      {report.is_demo && <p className="text-sm text-muted mt-1">Demo record</p>}
    </Link>
  );
}
