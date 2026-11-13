import type { Metadata } from "next";
import { ReportForm } from "@/components/ReportForm";
import { Callout, PageIntro, SetupNotice } from "@/components/Notices";
import { isSupabaseConfigured } from "@/lib/config";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Find my lost pet" };

export default async function ReportLostPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <SetupNotice feature="Reporting a lost pet" />
      </div>
    );
  }
  const user = await requireUser("/report/lost");
  return (
    <>
      <PageIntro title="Find my lost pet">
        Tell us about your pet and where they were last seen. Your report goes live straight away and you can update it
        from your dashboard.
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 grid gap-8 lg:grid-cols-[1fr_320px] items-start">
        <ReportForm kind="lost" defaultEmail={user.email} defaultName={user.displayName} />
        <div className="flex flex-col gap-5 lg:sticky lg:top-6">
          <Callout title="Do these today, too">
            <ul className="list-disc pl-5 space-y-1">
              <li>Call your local council and nearby vets — found pets are often taken there.</li>
              <li>Check your microchip registry details are current. Update them if not.</li>
              <li>Search your home, garage and sheds. Scared pets hide quietly.</li>
              <li>
                Search this site for{" "}
                <a href="/search?kind=found">pets that have already been found</a>.
              </li>
            </ul>
          </Callout>
          <Callout title="What's shown publicly">
            <p>
              Photos, description, suburb and an approximate area (about 500&nbsp;m). Your name, email, phone,
              microchip number and exact location stay private.
            </p>
          </Callout>
        </div>
      </div>
    </>
  );
}
