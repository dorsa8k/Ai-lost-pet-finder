import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { LABELS, type ReportWithPhotos } from "@/lib/types";
import { PetCard } from "@/components/PetCard";
import { Callout, SetupNotice } from "@/components/Notices";
import { SearchForm } from "@/components/SearchForm";
import { isSupabaseConfigured } from "@/lib/config";

export const metadata: Metadata = { title: "Partner portal", robots: { index: false } };

export default async function PartnerDashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <SetupNotice feature="The partner portal" />
      </div>
    );
  }
  const user = await requireRole(["partner", "admin"], "/partner/dashboard");
  const org = user.organisationId
    ? (await createAdminClient().from("organisations").select("name, org_type, suburb, verified").eq("id", user.organisationId).maybeSingle()).data
    : null;

  const supabase = await createUserClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data: lostRecent }, { data: ours }] = await Promise.all([
    supabase
      .from("pet_reports")
      .select("*, report_photos(id, report_id, storage_path, position, width, height)")
      .eq("kind", "lost")
      .eq("status", "active")
      .gte("event_at", sevenDaysAgo)
      .order("event_at", { ascending: false })
      .limit(12),
    supabase
      .from("pet_reports")
      .select("*, report_photos(id, report_id, storage_path, position, width, height)")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 flex flex-col gap-10">
      <div>
        <h1 className="text-4xl sm:text-5xl font-extrabold">Partner portal</h1>
        {org ? (
          <p className="text-lg mt-2">
            {org.name} — {LABELS.orgType[org.org_type as keyof typeof LABELS.orgType]}
            {org.suburb ? `, ${org.suburb}` : ""} {org.verified ? "(verified)" : "(awaiting verification)"}
          </p>
        ) : (
          <Callout title="Your account isn't linked to an organisation yet" tone="coral">
            <p>An administrator needs to link your account to your approved organisation before you can report as a partner.</p>
          </Callout>
        )}
      </div>

      <section aria-labelledby="intake-heading" className="grid gap-6 lg:grid-cols-[2fr_1fr] items-start">
        <div className="bg-paper border border-line rounded-2xl p-6">
          <h2 id="intake-heading" className="text-2xl font-bold">An animal has come into your care</h2>
          <ol className="list-decimal pl-5 mt-3 space-y-1">
            <li>Scan for a microchip and check the council registration tag, following your usual process.</li>
            <li>Search recent lost reports below for a possible match.</li>
            <li>Report it here so its owner can find out where it is. Reports show as from a verified partner.</li>
          </ol>
          <Link href="/report/found" className="btn btn-coral mt-5">Report an animal in our care</Link>
        </div>
        <Callout title="Contacting owners">
          <p>Use the message form on a lost report. The owner sees your message and the contact details you share; their details stay private until they reply.</p>
        </Callout>
      </section>

      <section aria-labelledby="search-heading">
        <h2 id="search-heading" className="text-2xl font-bold mb-4">Search all reports</h2>
        <SearchForm />
      </section>

      <section aria-labelledby="lost-heading">
        <h2 id="lost-heading" className="text-2xl font-bold mb-4">Lost in the past 7 days</h2>
        {lostRecent?.length ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {(lostRecent as ReportWithPhotos[]).map((r) => (
              <li key={r.id}><PetCard report={r} /></li>
            ))}
          </ul>
        ) : (
          <p>No lost pets reported in the past week.</p>
        )}
      </section>

      <section aria-labelledby="ours-heading">
        <h2 id="ours-heading" className="text-2xl font-bold mb-4">Reports made from this account</h2>
        {ours?.length ? (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {(ours as ReportWithPhotos[]).map((r) => (
              <li key={r.id}><PetCard report={r} /></li>
            ))}
          </ul>
        ) : (
          <p>None yet. Manage status and messages from <Link href="/dashboard">your dashboard</Link>.</p>
        )}
      </section>
    </div>
  );
}
