import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";
import { formatDateTime, reportTitle, timeAgo } from "@/lib/format";
import { LABELS, type ReportWithPhotos } from "@/lib/types";
import { PetPhoto } from "@/components/PetPhoto";
import { ActionButton } from "@/components/ApiForm";
import { Callout, LoadError, SetupNotice } from "@/components/Notices";
import { isSupabaseConfigured } from "@/lib/config";

export const metadata: Metadata = { title: "My dashboard", robots: { index: false } };

interface Msg {
  id: string;
  sender_name: string;
  sender_email: string | null;
  sender_phone: string | null;
  body: string;
  read_at: string | null;
  created_at: string;
}
type Row = ReportWithPhotos & { report_messages: Msg[] };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <SetupNotice feature="Your dashboard" />
      </div>
    );
  }
  const sp = await searchParams;
  const user = await requireUser("/dashboard");
  const supabase = await createUserClient();
  const { data, error } = await supabase
    .from("pet_reports")
    .select("*, report_photos(id, report_id, storage_path, position, width, height), report_messages(id, sender_name, sender_email, sender_phone, body, read_at, created_at)")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  const reports = (data ?? []) as Row[];

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10 flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl sm:text-5xl font-extrabold">Hi {user.displayName}</h1>
          <p className="text-muted mt-1">Your reports and the messages people have sent you.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Link href="/report/lost" className="btn btn-coral">Report a lost pet</Link>
          <Link href="/report/found" className="btn btn-outline">Report a found pet</Link>
        </div>
      </div>

      {sp.denied && (
        <Callout title="That page is for partners or administrators" tone="coral">
          <p>Your account doesn&apos;t have access. If you work at a vet or shelter, <Link href="/partner">apply to become a partner</Link>.</p>
        </Callout>
      )}
      {sp.passwordUpdated && (
        <Callout title="Password updated">
          <p>Your new password is saved.</p>
        </Callout>
      )}

      <Callout title="Checking for messages">
        <p>Email alerts aren&apos;t switched on yet, so check back here regularly for new messages about your pet.</p>
      </Callout>

      {error ? (
        <LoadError />
      ) : reports.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl p-8">
          <h2 className="text-2xl font-bold">You haven&apos;t made any reports yet</h2>
          <p className="mt-2">If your pet is missing, report it now — the sooner, the better.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-6">
          {reports.map((r) => {
            const msgs = [...r.report_messages].sort((a, b) => b.created_at.localeCompare(a.created_at));
            const unread = msgs.filter((m) => !m.read_at).length;
            return (
              <li key={r.id} className="bg-paper border border-line rounded-2xl overflow-hidden">
                <div className="grid sm:grid-cols-[180px_1fr]">
                  <PetPhoto photo={r.report_photos[0]} species={r.species} alt={reportTitle(r)} className="w-full aspect-square sm:h-full" />
                  <div className="p-5">
                    <div className="flex flex-wrap gap-2 items-center text-sm">
                      <span className="font-bold">{LABELS.kind[r.kind]}</span>
                      <span className="rounded-md bg-mint px-2 py-0.5">{LABELS.status[r.status]}</span>
                      {r.moderation === "hidden" && <span className="rounded-md bg-[#fff6f4] text-coral-deep px-2 py-0.5">Hidden by moderator</span>}
                      <span className="text-muted">Reported {timeAgo(r.created_at)}</span>
                    </div>
                    <h2 className="text-2xl font-bold mt-1">
                      <Link href={`/pets/${r.id}`}>{reportTitle(r)}</Link>
                    </h2>
                    <p className="text-muted">{r.suburb}, {formatDateTime(r.event_at)}</p>
                    <div className="flex flex-wrap gap-3 mt-4">
                      {r.status === "active" ? (
                        <>
                          <ActionButton action={`/api/reports/${r.id}/status`} values={{ status: "reunited" }} label="Mark as reunited" className="btn btn-teal btn-small" />
                          <ActionButton action={`/api/reports/${r.id}/status`} values={{ status: "closed" }} label="Close report" confirmText="Close this report? It will stop appearing in searches." />
                        </>
                      ) : (
                        <ActionButton action={`/api/reports/${r.id}/status`} values={{ status: "active" }} label="Reopen report" />
                      )}
                    </div>
                  </div>
                </div>
                <details className="border-t border-line p-5" open={unread > 0}>
                  <summary className="cursor-pointer font-semibold">
                    Messages ({msgs.length}){unread > 0 && <span className="ml-2 rounded-full bg-coral text-white px-2 text-sm">{unread} new</span>}
                  </summary>
                  {msgs.length === 0 ? (
                    <p className="mt-3 text-muted">No messages yet.</p>
                  ) : (
                    <ul className="mt-4 flex flex-col gap-4">
                      {msgs.map((m) => (
                        <li key={m.id} className={`rounded-xl p-4 ${m.read_at ? "bg-cream" : "bg-mint"}`}>
                          <p className="font-bold">{m.sender_name} <span className="font-normal text-sm text-muted">{timeAgo(m.created_at)}</span></p>
                          <p className="mt-1 whitespace-pre-line">{m.body}</p>
                          <p className="mt-2 text-[0.95rem]">
                            {m.sender_email && <>Email: <a href={`mailto:${m.sender_email}`}>{m.sender_email}</a> </>}
                            {m.sender_phone && <>Phone: <a href={`tel:${m.sender_phone}`}>{m.sender_phone}</a></>}
                          </p>
                          {!m.read_at && (
                            <div className="mt-2">
                              <ActionButton action={`/api/messages/${m.id}/read`} values={{}} label="Mark as read" />
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-4 text-sm text-muted">
                    Be cautious of anyone asking for money or a reward up front. Meet at a vet clinic or council office.
                  </p>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
