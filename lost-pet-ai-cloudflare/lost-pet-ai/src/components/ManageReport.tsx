"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Message {
  id: string;
  sender_name: string;
  sender_email: string | null;
  sender_phone: string | null;
  body: string;
  created_at: string;
}
interface Summary {
  id: string;
  kind: "lost" | "found";
  status: "active" | "reunited" | "closed";
  moderation: string;
  pet_name: string | null;
  primary_colour: string;
  breed: string | null;
  species: string;
  suburb: string;
}

export function ManageReport({ reportId }: { reportId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string>("");
  const [report, setReport] = useState<Summary | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [busy, setBusy] = useState(false);

  const call = useCallback(
    async (action: string, t: string) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/manage/${reportId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: t, action }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.message || "Something went wrong.");
          setState("error");
          return;
        }
        setReport(data.report);
        setMessages(data.messages);
        setNotifyEmail(data.notifyEmail !== false);
        setState("ready");
        if (action !== "view")
          setNotice(
            action === "reunited"
              ? "Marked as reunited. Thank you!"
              : action === "closed"
                ? "Report closed."
                : action === "email_on"
                  ? "Match emails turned on."
                  : action === "email_off"
                    ? "Match emails turned off."
                    : "Report reopened.",
          );
      } catch {
        setError("We couldn't reach the server. Check your connection and refresh the page.");
        setState("error");
      } finally {
        setBusy(false);
      }
    },
    [reportId],
  );

  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get("t");
    if (!t) {
      setError("This link is missing its private code. Check you copied the whole link, including everything after #.");
      setState("error");
      return;
    }
    setToken(t);
    void call("view", t);
  }, [call]);

  if (state === "loading") return <p role="status">Loading your report…</p>;
  if (state === "error")
    return (
      <p role="alert" className="rounded-xl border-2 border-coral bg-[#fff6f4] p-4 font-semibold">
        {error}
      </p>
    );
  if (!report || !token) return null;

  const title = report.pet_name || `${report.primary_colour} ${report.breed || report.species}`;
  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <p role="status" className="rounded-xl border-2 border-teal bg-mint p-4 font-semibold">
          {notice}
        </p>
      )}
      <div className="bg-paper border border-line rounded-2xl p-6">
        <h2 className="text-2xl font-bold">
          {report.kind === "lost" ? "Lost" : "Found"}: {title}, {report.suburb}
        </h2>
        <p className="mt-1">
          Status: <strong>{report.status === "active" ? "Active" : report.status === "reunited" ? "Reunited" : "Closed"}</strong>
          {report.moderation === "hidden" && " (hidden by a moderator)"}
        </p>
        <div className="flex flex-wrap gap-3 mt-4">
          <Link href={`/pets/${report.id}`} className="btn btn-outline btn-small">
            View public page
          </Link>
          {report.status === "active" ? (
            <>
              <button className="btn btn-teal btn-small" disabled={busy} onClick={() => call("reunited", token)}>
                Mark as reunited
              </button>
              <button className="btn btn-outline btn-small" disabled={busy} onClick={() => call("closed", token)}>
                Close report
              </button>
            </>
          ) : (
            <button className="btn btn-outline btn-small" disabled={busy} onClick={() => call("active", token)}>
              Reopen report
            </button>
          )}
        </div>
      </div>

      <section aria-labelledby="matches-heading" className="bg-mint rounded-2xl p-6">
        <h2 id="matches-heading" className="text-2xl font-bold">AI possible matches</h2>
        <p className="mt-2">
          We compare your report with {report.kind === "lost" ? "found" : "lost"} reports nearby, including new ones as they
          arrive. Suggestions always need checking by a person.
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <a href={`/pets/${report.id}/matches#t=${token}`} className="btn btn-teal btn-small">
            View possible matches
          </a>
          <button
            type="button"
            className="btn btn-outline btn-small"
            disabled={busy}
            onClick={() => call(notifyEmail ? "email_off" : "email_on", token)}
          >
            {notifyEmail ? "Turn off match emails" : "Turn on match emails"}
          </button>
        </div>
      </section>

      <section aria-labelledby="messages-heading">
        <h2 id="messages-heading" className="text-2xl font-bold mb-3">
          Messages ({messages.length})
        </h2>
        {messages.length === 0 ? (
          <p className="text-muted">No messages yet. Check back here — we can&apos;t send email alerts yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {messages.map((m) => (
              <li key={m.id} className="bg-paper border border-line rounded-xl p-4">
                <p className="font-bold">{m.sender_name}</p>
                <p className="text-sm text-muted">{new Date(m.created_at).toLocaleString("en-AU")}</p>
                <p className="mt-2 whitespace-pre-line">{m.body}</p>
                <p className="mt-2 text-[0.95rem]">
                  {m.sender_email && <>Email: <a href={`mailto:${m.sender_email}`}>{m.sender_email}</a> </>}
                  {m.sender_phone && <>Phone: <a href={`tel:${m.sender_phone}`}>{m.sender_phone}</a></>}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-[0.95rem]">
          Someone says the animal is theirs? Ask them to contact the council, vet or shelter caring for it, who will
          confirm ownership (for example, by microchip). Don&apos;t hand an animal over yourself.
        </p>
      </section>
    </div>
  );
}
