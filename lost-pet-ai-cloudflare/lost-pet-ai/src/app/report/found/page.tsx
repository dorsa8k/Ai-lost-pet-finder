import type { Metadata } from "next";
import { ReportForm } from "@/components/ReportForm";
import { Callout, PageIntro, SetupNotice } from "@/components/Notices";
import { isSupabaseConfigured } from "@/lib/config";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "I found a pet" };

function WhatToDo() {
  return (
    <section id="what-to-do" aria-labelledby="what-to-do-heading" className="bg-paper rounded-2xl border-2 border-teal p-5 sm:p-7">
      <h2 id="what-to-do-heading" className="text-2xl font-bold">
        What to do with a lost dog or cat in Victoria
      </h2>
      <ol className="list-decimal pl-5 mt-3 space-y-2">
        <li>
          <strong>If it&apos;s injured, take it straight to the nearest vet.</strong>
        </li>
        <li>
          As soon as reasonably possible, take the animal to <strong>the local council</strong> where you found it (or
          ask council to collect it), <strong>a vet that accepts lost pets</strong>, or <strong>an animal shelter</strong>.
          Phone the vet first to check they accept lost pets.
        </li>
        <li>They can scan for a microchip and contact the registered owner through official records.</li>
        <li>
          Report it here as well, so the owner can find out where their pet is — even if it doesn&apos;t have a
          microchip.
        </li>
      </ol>
      <p className="mt-4">
        <strong>Please don&apos;t hand the animal to someone directly</strong>, even if they say it&apos;s theirs. A
        photo or this website can&apos;t prove ownership, and returning a pet outside the official process can lead to
        a fine. Let the council, vet or shelter confirm ownership.
      </p>
      <p className="mt-3 text-sm text-muted">
        Source:{" "}
        <a
          href="https://agriculture.vic.gov.au/livestock-and-animals/animal-welfare-victoria/animal-welfare/stray-and-unwanted-animals/ive-found-a-lost-stray-or-injured-animal"
          target="_blank"
          rel="noreferrer"
        >
          Agriculture Victoria — I&apos;ve found a lost, stray or injured animal
        </a>
        . This is general guidance, not legal advice.
      </p>
    </section>
  );
}

export default async function ReportFoundPage() {
  const configured = isSupabaseConfigured();
  const user = configured ? await getCurrentUser().catch(() => null) : null;
  const isPartner = !!user && (user.role === "partner" || user.role === "admin") && !!user.organisationId;
  return (
    <>
      <PageIntro title="I found a pet">
        Thank you for helping. You don&apos;t need an account. Start with what the law asks you to do, then tell us
        about the animal so its owner can find out where it is.
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col gap-8">
        <WhatToDo />
        {configured ? (
          <div className="grid gap-8 lg:grid-cols-[1fr_320px] items-start">
            <ReportForm kind="found" defaultEmail={user?.email} defaultName={user?.displayName} isPartner={isPartner} />
            <div className="flex flex-col gap-5 lg:sticky lg:top-6">
              <Callout title="Your privacy">
                <p>
                  We publish the description, photos, suburb and an approximate area only. Your name, email, phone and
                  exact location stay private.
                </p>
              </Callout>
              <Callout title="No account?">
                <p>
                  After you submit, you&apos;ll get a private link to manage your report and read messages. Keep it
                  safe — anyone with the link can manage the report.
                </p>
              </Callout>
            </div>
          </div>
        ) : (
          <SetupNotice feature="Reporting a found pet" />
        )}
      </div>
    </>
  );
}
