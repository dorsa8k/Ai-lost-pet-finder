import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { formatDateTime, reportTitle, timeAgo } from "@/lib/format";
import { LABELS, type FlagReason, type OrgType, type PetReport } from "@/lib/types";
import { ActionButton, ApiForm } from "@/components/ApiForm";
import { SetupNotice } from "@/components/Notices";
import { isSupabaseConfigured } from "@/lib/config";
import { getImageEmbedder } from "@/lib/ai/embeddings";
import { isEmailConfigured } from "@/lib/notify/email";
import { loadMatchConfig } from "@/lib/matching/score";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

function Stat({ label, real, demo }: { label: string; real: number; demo?: number }) {
  return (
    <div className="bg-paper border border-line rounded-xl p-4">
      <dt className="text-muted">{label}</dt>
      <dd className="font-display text-4xl font-extrabold text-teal">{real}</dd>
      {demo !== undefined && <dd className="text-sm text-muted">+ {demo} demo (excluded)</dd>}
    </div>
  );
}

export default async function AdminPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <SetupNotice feature="The admin dashboard" />
      </div>
    );
  }
  const me = await requireRole(["admin"], "/admin");
  const db = createAdminClient();

  const count = async (table: string, filter?: (q: any) => any) => {
    let q: any = db.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count } = await q;
    return count ?? 0;
  };

  const [
    lostReal, lostDemo, foundReal, foundDemo, reunitedReal, messagesCount, partnersCount,
    { data: applications }, { data: flags }, { data: reports }, { data: orgs }, { data: profiles },
    usersResult, { data: contacts },
  ] = await Promise.all([
    count("pet_reports", (q) => q.eq("kind", "lost").eq("is_demo", false)),
    count("pet_reports", (q) => q.eq("kind", "lost").eq("is_demo", true)),
    count("pet_reports", (q) => q.eq("kind", "found").eq("is_demo", false)),
    count("pet_reports", (q) => q.eq("kind", "found").eq("is_demo", true)),
    count("pet_reports", (q) => q.eq("status", "reunited").eq("is_demo", false)),
    count("report_messages"),
    count("organisations", (q) => q.eq("verified", true)),
    db.from("partner_applications").select("*").eq("status", "pending").order("created_at"),
    db.from("moderation_flags").select("*, pet_reports(id, kind, pet_name, species, primary_colour, secondary_colour, breed, moderation)").eq("status", "open").order("created_at"),
    db.from("pet_reports").select("*").order("created_at", { ascending: false }).limit(40),
    db.from("organisations").select("id, name, verified").eq("verified", true).order("name"),
    db.from("profiles").select("id, display_name, role, organisation_id, created_at"),
    db.auth.admin.listUsers({ page: 1, perPage: 200 }),
    db.from("contact_messages").select("*").order("created_at", { ascending: false }).limit(20),
  ]);

  const [embDone, embPending, embFailed, matchCount, fbSame, fbNot, fbUnsure, notifCount, emailSent, embedder] = await Promise.all([
    count("photo_embeddings", (q) => q.eq("status", "done")),
    count("photo_embeddings", (q) => q.eq("status", "pending")),
    count("photo_embeddings", (q) => q.eq("status", "failed")),
    count("report_matches"),
    count("match_feedback", (q) => q.eq("verdict", "likely_same")),
    count("match_feedback", (q) => q.eq("verdict", "not_same")),
    count("match_feedback", (q) => q.eq("verdict", "unsure")),
    count("notifications"),
    count("notifications", (q) => q.eq("email_status", "sent")),
    getImageEmbedder(),
  ]);
  const matchCfg = loadMatchConfig();

  const emailById = new Map((usersResult.data?.users ?? []).map((u) => [u.id, u.email ?? ""]));
  const orgName = new Map((orgs ?? []).map((o) => [o.id, o.name]));

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 flex flex-col gap-12">
      <div>
        <h1 className="text-4xl sm:text-5xl font-extrabold">Admin</h1>
        <p className="text-muted mt-1">Signed in as {me.email}. Everything you do here is logged.</p>
      </div>

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="text-2xl font-bold mb-4">Platform statistics</h2>
        <dl className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Stat label="Lost reports" real={lostReal} demo={lostDemo} />
          <Stat label="Found reports" real={foundReal} demo={foundDemo} />
          <Stat label="Marked reunited (self-reported)" real={reunitedReal} />
          <Stat label="Verified partner organisations" real={partnersCount} />
          <Stat label="Messages sent" real={messagesCount} />
          <Stat label="Registered users" real={profiles?.length ?? 0} />
        </dl>
        <p className="text-sm text-muted mt-3">
          Reunions are reported by users and are not independently verified. AI match statistics and CSV export arrive in later phases.
        </p>
      </section>

      <section aria-labelledby="ai-heading">
        <h2 id="ai-heading" className="text-2xl font-bold mb-2">AI photo matching</h2>
        <ul className="mb-4 space-y-1">
          <li>
            Photo analysis:{" "}
            <strong>{embedder ? `on (${embedder.model}, via ${embedder.via === "binding" ? "Workers AI binding" : "Workers AI REST API"})` : "OFF — Workers AI binding not found (see README)"}</strong>
          </li>
          <li>
            Resemblance labels:{" "}
            <strong>{matchCfg.strongAt !== null ? `calibrated (strong ≥ ${matchCfg.strongAt}, moderate ≥ ${matchCfg.moderateAt})` : "not calibrated yet — users see rankings only"}</strong>
          </li>
          <li>
            Email alerts: <strong>{isEmailConfigured() ? "on (Resend)" : "off — RESEND_API_KEY / EMAIL_FROM not set"}</strong>
          </li>
        </ul>
        <dl className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Stat label="Photos analysed" real={embDone} />
          <Stat label="Photos waiting" real={embPending} />
          <Stat label="Photos failed" real={embFailed} />
          <Stat label="Possible matches suggested" real={matchCount} />
          <Stat label="Feedback: looks like the same" real={fbSame} />
          <Stat label="Feedback: not the same" real={fbNot} />
          <Stat label="Feedback: unsure" real={fbUnsure} />
          <Stat label="Alerts created (emails sent)" real={notifCount} />
        </dl>
        <p className="text-sm text-muted mt-2">{emailSent} alert emails sent. Counts include demo records. Feedback is self-reported and not verified.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          {(embPending > 0 || embFailed > 0) && (
            <ActionButton action="/api/admin/ai" values={{}} label="Retry photo analysis" className="btn btn-teal btn-small" pendingLabel="Analysing…" />
          )}
          <ActionButton action="/api/admin/ai" values={{ mode: "rematch_recent" }} label="Re-run matching for recent reports" pendingLabel="Matching…" />
        </div>
      </section>

      <section aria-labelledby="apps-heading">
        <h2 id="apps-heading" className="text-2xl font-bold mb-4">Partner applications ({applications?.length ?? 0} pending)</h2>
        {applications?.length ? (
          <ul className="flex flex-col gap-4">
            {applications.map((a) => (
              <li key={a.id} className="bg-paper border border-line rounded-xl p-5">
                <p className="font-bold text-lg">{a.organisation_name} <span className="font-normal text-muted">({LABELS.orgType[a.organisation_type as OrgType]})</span></p>
                <p>{a.contact_name}, <a href={`mailto:${a.email}`}>{a.email}</a>{a.phone ? `, ${a.phone}` : ""}</p>
                <p className="text-muted">{a.suburb} {a.website && <a href={a.website} target="_blank" rel="noreferrer">{a.website}</a>}</p>
                {a.message && <p className="mt-2 whitespace-pre-line">{a.message}</p>}
                <p className="text-sm mt-2">Before approving, confirm the organisation is real using contact details from its official website.</p>
                <div className="flex gap-3 mt-3">
                  <ActionButton action={`/api/admin/applications/${a.id}`} values={{ decision: "approved" }} label="Approve" className="btn btn-teal btn-small" />
                  <ActionButton action={`/api/admin/applications/${a.id}`} values={{ decision: "rejected" }} label="Reject" confirmText="Reject this application?" />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>No pending applications.</p>
        )}
      </section>

      <section aria-labelledby="flags-heading">
        <h2 id="flags-heading" className="text-2xl font-bold mb-4">Flagged reports ({flags?.length ?? 0} open)</h2>
        {flags?.length ? (
          <ul className="flex flex-col gap-4">
            {flags.map((f) => {
              const r = f.pet_reports as PetReport | null;
              return (
                <li key={f.id} className="bg-paper border border-line rounded-xl p-5">
                  <p className="font-bold">{LABELS.flagReason[f.reason as FlagReason]}</p>
                  {r && <p><Link href={`/pets/${r.id}`}>{reportTitle(r)}</Link> ({r.moderation})</p>}
                  {f.details && <p className="mt-1 whitespace-pre-line">{f.details}</p>}
                  <p className="text-sm text-muted">{timeAgo(f.created_at)}</p>
                  <div className="flex flex-wrap gap-3 mt-3">
                    {r && r.moderation === "visible" && (
                      <ActionButton action={`/api/admin/reports/${r.id}`} values={{ moderation: "hidden" }} label="Hide report" className="btn btn-coral btn-small" />
                    )}
                    <ActionButton action={`/api/admin/flags/${f.id}`} values={{ status: "resolved" }} label="Mark resolved" />
                    <ActionButton action={`/api/admin/flags/${f.id}`} values={{ status: "dismissed" }} label="Dismiss" />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>No open flags.</p>
        )}
      </section>

      <section aria-labelledby="reports-heading">
        <h2 id="reports-heading" className="text-2xl font-bold mb-4">Latest 40 reports</h2>
        <div className="overflow-x-auto bg-paper border border-line rounded-xl">
          <table className="w-full text-left text-[0.95rem]">
            <thead className="bg-mint">
              <tr>
                <th className="p-3">Report</th>
                <th className="p-3">Suburb</th>
                <th className="p-3">Created</th>
                <th className="p-3">Status</th>
                <th className="p-3">Visibility</th>
              </tr>
            </thead>
            <tbody>
              {(reports as PetReport[] | null)?.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="p-3"><Link href={`/pets/${r.id}`}>{reportTitle(r)}</Link>{r.is_demo && <span className="text-muted"> (demo)</span>}</td>
                  <td className="p-3">{r.suburb}</td>
                  <td className="p-3">{formatDateTime(r.created_at)}</td>
                  <td className="p-3">{LABELS.status[r.status]}</td>
                  <td className="p-3">
                    <ActionButton
                      action={`/api/admin/reports/${r.id}`}
                      values={{ moderation: r.moderation === "visible" ? "hidden" : "visible" }}
                      label={r.moderation === "visible" ? "Hide" : "Unhide"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="users-heading">
        <h2 id="users-heading" className="text-2xl font-bold mb-4">Users and roles</h2>
        <div className="grid gap-6 lg:grid-cols-[1fr_360px] items-start">
          <div className="overflow-x-auto bg-paper border border-line rounded-xl">
            <table className="w-full text-left text-[0.95rem]">
              <thead className="bg-mint">
                <tr><th className="p-3">Email</th><th className="p-3">Name</th><th className="p-3">Role</th><th className="p-3">Organisation</th></tr>
              </thead>
              <tbody>
                {profiles?.map((p) => (
                  <tr key={p.id} className="border-t border-line">
                    <td className="p-3">{emailById.get(p.id)}</td>
                    <td className="p-3">{p.display_name}</td>
                    <td className="p-3">{p.role}</td>
                    <td className="p-3">{p.organisation_id ? orgName.get(p.organisation_id) ?? "(unverified)" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="bg-paper border border-line rounded-xl p-5">
            <h3 className="text-xl font-bold mb-3">Change a user&apos;s role</h3>
            <ApiForm action="/api/admin/users" submitLabel="Update user">
              <div>
                <label htmlFor="userId" className="field-label">User</label>
                <select id="userId" name="userId" className="input" defaultValue="">
                  <option value="" disabled>Choose a user</option>
                  {profiles?.map((p) => (
                    <option key={p.id} value={p.id}>{emailById.get(p.id) || p.id}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="role" className="field-label">Role</label>
                <select id="role" name="role" className="input" defaultValue="partner">
                  <option value="user">User</option>
                  <option value="partner">Partner</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label htmlFor="organisationId" className="field-label">Organisation (partners)</label>
                <select id="organisationId" name="organisationId" className="input" defaultValue="">
                  <option value="">None</option>
                  {orgs?.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            </ApiForm>
          </div>
        </div>
      </section>

      <section aria-labelledby="contact-heading">
        <h2 id="contact-heading" className="text-2xl font-bold mb-4">Contact form messages (latest 20)</h2>
        {contacts?.length ? (
          <ul className="flex flex-col gap-3">
            {contacts.map((c) => (
              <li key={c.id} className="bg-paper border border-line rounded-xl p-4">
                <p className="font-bold">{c.subject}</p>
                <p className="text-sm text-muted">{c.name}, <a href={`mailto:${c.email}`}>{c.email}</a>, {timeAgo(c.created_at)}</p>
                <p className="mt-2 whitespace-pre-line">{c.message}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p>No messages.</p>
        )}
      </section>
    </div>
  );
}
