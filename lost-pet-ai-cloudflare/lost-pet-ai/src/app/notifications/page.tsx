import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createUserClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/config";
import { timeAgo } from "@/lib/format";
import { ActionButton, ApiForm } from "@/components/ApiForm";
import { Callout, LoadError, SetupNotice } from "@/components/Notices";
import { isEmailConfigured } from "@/lib/notify/email";

export const metadata: Metadata = { title: "Alerts", robots: { index: false } };

export default async function NotificationsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <SetupNotice feature="Alerts" />
      </div>
    );
  }
  const user = await requireUser("/notifications");
  const supabase = await createUserClient();
  const [{ data: items, error }, { data: profile }] = await Promise.all([
    supabase.from("notifications").select("id, title, body, link, read_at, created_at").order("created_at", { ascending: false }).limit(50),
    supabase.from("profiles").select("notify_in_app, notify_email").eq("id", user.id).maybeSingle(),
  ]);
  const inApp = profile?.notify_in_app !== false;
  const visible = (items ?? []).filter((n) => inApp || !n.read_at);
  const unread = visible.filter((n) => !n.read_at).length;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl sm:text-5xl font-extrabold">Alerts</h1>
        {unread > 0 && <ActionButton action="/api/notifications" values={{}} label="Mark all as read" />}
      </div>

      {error ? (
        <LoadError />
      ) : !inApp ? (
        <Callout title="In-app alerts are turned off">
          <p>Turn them back on below. Your possible matches are still listed on each report&apos;s matches page.</p>
        </Callout>
      ) : visible.length === 0 ? (
        <p>No alerts yet. When a newly reported pet looks like a promising match for one of your reports, it will appear here.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((n) => (
            <li key={n.id} className={`rounded-xl p-4 border ${n.read_at ? "bg-paper border-line" : "bg-mint border-mint-deep"}`}>
              <p className="font-bold">
                <Link href={n.link}>{n.title}</Link>
              </p>
              <p className="mt-1">{n.body}</p>
              <p className="text-sm text-muted mt-1">{timeAgo(n.created_at)}</p>
              {!n.read_at && (
                <div className="mt-2">
                  <ActionButton action="/api/notifications" values={{ id: n.id }} label="Mark as read" />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="prefs-heading" className="bg-paper border border-line rounded-2xl p-6">
        <h2 id="prefs-heading" className="text-2xl font-bold mb-3">Alert settings</h2>
        <ApiForm action="/api/account/notifications" submitLabel="Save settings">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="notifyInApp" defaultChecked={inApp} className="mt-1.5 size-5" />
            <span>Show alerts here when a promising possible match is found</span>
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="notifyEmail" defaultChecked={profile?.notify_email !== false} className="mt-1.5 size-5" />
            <span>
              Email me about promising possible matches
              {!isEmailConfigured() && (
                <span className="block text-sm text-muted">Email alerts aren&apos;t switched on for this site yet — your choice is saved for when they are.</span>
              )}
            </span>
          </label>
        </ApiForm>
      </section>
    </div>
  );
}
