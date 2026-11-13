import type { Metadata } from "next";
import { ApiForm } from "@/components/ApiForm";
import { Callout, PageIntro, SetupNotice } from "@/components/Notices";
import { APP_NAME, isSupabaseConfigured } from "@/lib/config";
import { LABELS, ORG_TYPES } from "@/lib/types";

export const metadata: Metadata = { title: `Partner with ${APP_NAME}` };

const BENEFITS = [
  ["Search lost-pet reports", "See lost dogs and cats reported nearby, with photos, in one place."],
  ["Report animals in your care", "Owners searching online can learn their pet is safe with you."],
  ["Spot possible matches", "Photo matching (in development) will suggest lost reports that look similar."],
  ["Contact owners privately", "Message owners through the site without exposing anyone's personal details."],
  ["Record reunions", "Close reports when pets go home, building a clear record of outcomes."],
  ["Spend less time searching", "Fewer phone calls and less scrolling through community Facebook groups."],
];

export default function PartnerPage() {
  return (
    <>
      <PageIntro title={`Partner with ${APP_NAME}`}>
        For veterinary clinics, animal shelters, rescue groups and councils in Knox and the outer east. Free during
        the pilot.
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 grid gap-12 lg:grid-cols-[1fr_440px] items-start">
        <div className="flex flex-col gap-8">
          <dl className="grid gap-6 sm:grid-cols-2">
            {BENEFITS.map(([t, d]) => (
              <div key={t} className="border-t-4 border-mint-deep pt-3">
                <dt className="font-display text-xl font-bold text-teal">{t}</dt>
                <dd className="mt-1">{d}</dd>
              </div>
            ))}
          </dl>
          <Callout title="Designed to work with your existing process">
            <p>
              {APP_NAME} doesn&apos;t replace microchip checks, council notification or your reunification procedures
              under the Domestic Animals Act. It helps owners find out where their pet is, so they contact you sooner.
            </p>
          </Callout>
          <Callout title="Verification">
            <p>
              We confirm every organisation using contact details from its official website before giving staff
              partner access. Partner reports are labelled as coming from a verified organisation.
            </p>
          </Callout>
        </div>

        <section aria-labelledby="apply-heading" className="bg-paper border border-line rounded-2xl p-6">
          <h2 id="apply-heading" className="text-2xl font-bold mb-4">Register your interest</h2>
          {isSupabaseConfigured() ? (
            <ApiForm action="/api/partner-applications" submitLabel="Send application" buttonClass="btn btn-coral">
              <div>
                <label htmlFor="organisationName" className="field-label">Organisation name</label>
                <input id="organisationName" name="organisationName" className="input" maxLength={120} autoComplete="organization" />
              </div>
              <div>
                <label htmlFor="organisationType" className="field-label">Organisation type</label>
                <select id="organisationType" name="organisationType" className="input" defaultValue="">
                  <option value="" disabled>Choose one</option>
                  {ORG_TYPES.map((t) => (
                    <option key={t} value={t}>{LABELS.orgType[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="contactName" className="field-label">Contact person</label>
                <input id="contactName" name="contactName" className="input" maxLength={80} autoComplete="name" />
              </div>
              <div>
                <label htmlFor="email" className="field-label">Business email</label>
                <input id="email" name="email" type="email" className="input" autoComplete="email" />
              </div>
              <div>
                <label htmlFor="phone" className="field-label">Phone <span className="font-normal text-muted">(optional)</span></label>
                <input id="phone" name="phone" type="tel" className="input" autoComplete="tel" />
              </div>
              <div>
                <label htmlFor="suburb" className="field-label">Suburb <span className="font-normal text-muted">(optional)</span></label>
                <input id="suburb" name="suburb" className="input" maxLength={60} />
              </div>
              <div>
                <label htmlFor="website" className="field-label">Website <span className="font-normal text-muted">(optional)</span></label>
                <input id="website" name="website" className="input" maxLength={200} autoComplete="url" />
              </div>
              <div>
                <label htmlFor="message" className="field-label">Message <span className="font-normal text-muted">(optional)</span></label>
                <textarea id="message" name="message" className="input" maxLength={2000} />
              </div>
            </ApiForm>
          ) : (
            <SetupNotice feature="The partner application form" />
          )}
        </section>
      </div>
    </>
  );
}
