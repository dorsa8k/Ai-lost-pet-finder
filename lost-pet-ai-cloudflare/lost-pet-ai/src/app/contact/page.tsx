import type { Metadata } from "next";
import { ApiForm } from "@/components/ApiForm";
import { Callout, PageIntro, SetupNotice } from "@/components/Notices";
import { isSupabaseConfigured } from "@/lib/config";

export const metadata: Metadata = { title: "Contact us" };

export default function ContactPage() {
  return (
    <>
      <PageIntro title="Contact us">Questions, feedback, privacy requests or partnership ideas — we read every message.</PageIntro>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 grid gap-10 lg:grid-cols-[1fr_340px] items-start">
        <div className="bg-paper border border-line rounded-2xl p-6">
          {isSupabaseConfigured() ? (
            <ApiForm action="/api/contact" submitLabel="Send message">
              <div>
                <label htmlFor="name" className="field-label">Your name</label>
                <input id="name" name="name" className="input" maxLength={80} autoComplete="name" />
              </div>
              <div>
                <label htmlFor="email" className="field-label">Email</label>
                <input id="email" name="email" type="email" className="input" autoComplete="email" />
              </div>
              <div>
                <label htmlFor="subject" className="field-label">Subject</label>
                <input id="subject" name="subject" className="input" maxLength={120} />
              </div>
              <div>
                <label htmlFor="message" className="field-label">Message</label>
                <textarea id="message" name="message" className="input" maxLength={4000} />
              </div>
            </ApiForm>
          ) : (
            <SetupNotice feature="The contact form" />
          )}
        </div>
        <Callout title="Animal emergency?">
          <p>
            If an animal is injured, take it to the nearest vet. For an animal at large or an after-hours emergency,
            call your local council. We can&apos;t respond to emergencies through this form.
          </p>
        </Callout>
      </div>
    </>
  );
}
