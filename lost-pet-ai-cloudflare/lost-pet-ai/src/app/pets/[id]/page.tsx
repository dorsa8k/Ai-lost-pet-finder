import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getReport } from "@/lib/reports";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured, publicPhotoUrl, SITE_URL } from "@/lib/config";
import { formatDateTime, reportTitle, shortDescription, timeAgo } from "@/lib/format";
import { FLAG_REASONS, LABELS } from "@/lib/types";
import { PetPhoto } from "@/components/PetPhoto";
import { DemoTag, KindTag } from "@/components/PetCard";
import { ActionButton, ApiForm } from "@/components/ApiForm";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { Callout, SetupNotice } from "@/components/Notices";
import { findSuburb } from "@/lib/suburbs";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isSupabaseConfigured()) return { title: "Pet report" };
  const report = await getReport((await params).id).catch(() => null);
  if (!report) return { title: "Report not found" };
  const title = reportTitle(report);
  const description = `${shortDescription(report)} — ${report.kind === "lost" ? "last seen" : "found"} in ${report.suburb}.`;
  const image = report.report_photos[0] ? publicPhotoUrl(report.report_photos[0].storage_path) : undefined;
  return { title, description, openGraph: { title, description, images: image ? [image] : undefined } };
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="py-2 border-b border-line grid grid-cols-[10rem_1fr] gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

export default async function PetPage({ params }: Props) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <SetupNotice feature="Pet details" />
      </div>
    );
  }
  const { id } = await params;
  const report = await getReport(id);
  if (!report) notFound();
  const user = await getCurrentUser();
  const isOwner = !!user && report.owner_id === user.id;
  const title = reportTitle(report);
  const [main, ...rest] = report.report_photos;
  const council = findSuburb(report.suburb)?.council;

  return (
    <article className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
      {report.is_demo && (
        <div className="mb-6">
          <Callout title="This is a fictional demonstration record" tone="coral">
            <p>It shows how reports work. The pet and details are made up.</p>
          </Callout>
        </div>
      )}
      {report.status !== "active" && (
        <div className="mb-6">
          <Callout title={report.status === "reunited" ? "This pet is back home" : "This report is closed"}>
            <p>{report.status === "reunited" ? "The reporter has marked this pet as reunited." : "It is no longer being actively searched for."}</p>
          </Callout>
        </div>
      )}
      {report.moderation === "hidden" && (
        <div className="mb-6">
          <Callout title="Hidden by a moderator" tone="coral">
            <p>Only you and administrators can see this report. Contact us if you think this is a mistake.</p>
          </Callout>
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col gap-3">
          <div className="poster p-3">
            <PetPhoto photo={main} species={report.species} alt={title} size="full" className="w-full aspect-[4/3]" />
          </div>
          {rest.length > 0 && (
            <ul className="grid grid-cols-4 gap-3" aria-label="More photos">
              {rest.map((p, i) => (
                <li key={p.id}>
                  <a href={publicPhotoUrl(p.storage_path)} target="_blank" rel="noreferrer">
                    <PetPhoto photo={p} species={report.species} alt={`${title}, photo ${i + 2}`} className="w-full aspect-square rounded-lg" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="flex flex-wrap gap-2 items-center">
            <KindTag kind={report.kind} />
            {report.is_demo && <DemoTag />}
            <span className="text-muted">Reported {timeAgo(report.created_at)}</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold mt-3">
            {report.kind === "lost" && report.pet_name ? report.pet_name : shortDescription(report)}
          </h1>
          <p className="text-xl mt-2">
            {report.kind === "lost" ? "Last seen" : "Found"} in <strong>{report.suburb}</strong> on {formatDateTime(report.event_at)}
          </p>
          {report.kind === "found" && report.animal_location && (
            <p className="mt-3 inline-block bg-mint rounded-lg px-3 py-2 font-semibold">
              Now: {LABELS.animalLocation[report.animal_location]}
            </p>
          )}

          <dl className="mt-6">
            <Fact label="Animal" value={LABELS.species[report.species]} />
            <Fact label="Breed" value={report.breed} />
            <Fact label="Colour" value={report.secondary_colour ? `${report.primary_colour} and ${report.secondary_colour}` : report.primary_colour} />
            <Fact label="Size" value={report.size !== "unknown" ? LABELS.size[report.size] : null} />
            <Fact label="Age" value={report.age_group !== "unknown" ? LABELS.ageGroup[report.age_group] : null} />
            <Fact label="Sex" value={report.sex !== "unknown" ? LABELS.sex[report.sex] : null} />
            <Fact label="Desexed" value={report.desexed === null ? null : report.desexed ? "Yes" : "No"} />
            <Fact label="Collar" value={report.collar_description} />
            <Fact label="Markings" value={report.markings} />
            <Fact label="Area" value={`${report.suburb}${report.postcode ? ` ${report.postcode}` : ""} (approximate)`} />
            {report.reporter_type === "partner" && (
              <Fact label="Reported by" value={`A verified partner organisation${report.microchip_checked ? " — microchip scanned" : ""}`} />
            )}
          </dl>
          {report.description && <p className="mt-5 whitespace-pre-line">{report.description}</p>}

          <div className="mt-6 flex flex-wrap gap-3">
            <CopyLinkButton url={`${SITE_URL}/pets/${report.id}`} label="Share this report" />
          </div>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] mt-12">
        <section aria-labelledby="contact-heading">
          {isOwner ? (
            <div className="bg-mint rounded-2xl p-6">
              <h2 id="contact-heading" className="text-2xl font-bold">This is your report</h2>
              <p className="mt-2">Read messages and update the status from your dashboard.</p>
              <div className="flex flex-wrap gap-3 mt-4">
                <Link href="/dashboard" className="btn btn-teal">Go to my dashboard</Link>
                {report.status === "active" && (
                  <ActionButton action={`/api/reports/${report.id}/status`} values={{ status: "reunited" }} label="Mark as reunited" className="btn btn-outline" />
                )}
              </div>
            </div>
          ) : report.status === "active" && !report.is_demo ? (
            <div className="bg-paper border border-line rounded-2xl p-6">
              <h2 id="contact-heading" className="text-2xl font-bold">
                {report.kind === "lost" ? "Seen this pet?" : "Think this is your pet?"}
              </h2>
              <p className="mt-2 text-muted">
                Send a private message. The reporter&apos;s details stay hidden — they&apos;ll see your message and the contact
                details you share, and can get in touch.
              </p>
              {report.kind === "found" && (
                <p className="mt-2">
                  If this is your pet, also contact {council ? <strong>{council}</strong> : "the local council"} and local
                  vets. They will confirm ownership — for example by microchip — before releasing an animal.
                </p>
              )}
              <ApiForm action={`/api/reports/${report.id}/messages`} submitLabel="Send message" className="mt-5">
                <div>
                  <label htmlFor="senderName" className="field-label">Your name</label>
                  <input id="senderName" name="senderName" className="input" maxLength={80} defaultValue={user?.displayName ?? ""} autoComplete="name" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="senderEmail" className="field-label">Email</label>
                    <input id="senderEmail" name="senderEmail" type="email" className="input" defaultValue={user?.email ?? ""} autoComplete="email" />
                  </div>
                  <div>
                    <label htmlFor="senderPhone" className="field-label">Phone <span className="font-normal text-muted">(optional)</span></label>
                    <input id="senderPhone" name="senderPhone" type="tel" className="input" autoComplete="tel" />
                  </div>
                </div>
                <div>
                  <label htmlFor="body" className="field-label">Message</label>
                  <span className="field-hint">Where and when, and anything that would help. Don&apos;t include bank details or ask for money.</span>
                  <textarea id="body" name="body" className="input" maxLength={2000} />
                </div>
                <label className="flex items-start gap-3">
                  <input type="checkbox" name="consent" className="mt-1.5 size-5" />
                  <span>I agree to share my name and contact details with the person who made this report.</span>
                </label>
              </ApiForm>
            </div>
          ) : (
            <h2 id="contact-heading" className="sr-only">Contact</h2>
          )}
        </section>

        <aside className="flex flex-col gap-5">
          <Callout title="Stay safe">
            <ul className="list-disc pl-5 space-y-1">
              <li>Never pay a “reward” before your pet is safely back with you.</li>
              <li>A photo doesn&apos;t prove ownership. Councils, vets and shelters confirm ownership by microchip and records.</li>
              <li>Meet at a vet clinic or council office, not at someone&apos;s home.</li>
            </ul>
          </Callout>
          {!isOwner && (
            <details className="bg-paper border border-line rounded-2xl p-5">
              <summary className="cursor-pointer font-semibold">Report a problem with this listing</summary>
              <ApiForm action={`/api/reports/${report.id}/flag`} submitLabel="Send to moderators" buttonClass="btn btn-outline btn-small" className="mt-4">
                <div>
                  <label htmlFor="reason" className="field-label">What&apos;s wrong?</label>
                  <select id="reason" name="reason" className="input" defaultValue="">
                    <option value="" disabled>Choose a reason</option>
                    {FLAG_REASONS.map((r) => (
                      <option key={r} value={r}>{LABELS.flagReason[r]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="details" className="field-label">Details <span className="font-normal text-muted">(optional)</span></label>
                  <textarea id="details" name="details" className="input" maxLength={1000} />
                </div>
              </ApiForm>
            </details>
          )}
        </aside>
      </div>
    </article>
  );
}
