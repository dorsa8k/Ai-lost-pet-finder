"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiForm } from "./ApiForm";

interface OtherReport {
  id: string;
  kind: "lost" | "found";
  species: "dog" | "cat";
  petName: string | null;
  breed: string | null;
  primaryColour: string;
  secondaryColour: string | null;
  size: string;
  suburb: string;
  eventAt: string;
  animalLocation: string | null;
  isDemo: boolean;
  fromPartner: boolean;
  photo: string | null;
}
interface Match {
  id: string;
  rank: number;
  band: string;
  bandLabel: string;
  comparedPairs: number;
  distanceKm: number | null;
  reasons: string[];
  cautions: string[];
  verdict: "likely_same" | "not_same" | "unsure" | null;
  myPhoto: string | null;
  other: OtherReport;
}
interface Data {
  report: { id: string; kind: "lost" | "found"; species: "dog" | "cat"; petName: string | null; status: string };
  viewer: "owner" | "manage_link" | "admin";
  processing: { total: number; done: number; pending: number; failed: number; aiAvailable: boolean };
  dismissedCount: number;
  matches: Match[];
}

const WHERE_NOW: Record<string, string> = {
  with_finder: "Safe with the person who found it",
  with_vet: "At a vet clinic",
  with_shelter: "At an animal shelter",
  with_council: "With the council",
  not_contained: "Seen but not contained",
};

function when(iso: string) {
  return new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Melbourne", day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );
}

function Photo({ src, species, label }: { src: string | null; species: string; label: string }) {
  return (
    <figure className="flex-1 min-w-0">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={label} className="w-full aspect-square object-cover rounded-lg bg-mint" />
      ) : (
        <div className="w-full aspect-square rounded-lg bg-mint flex flex-col items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/demo/${species}.svg`} alt="" className="w-1/2" />
          <span className="text-sm">No photo</span>
        </div>
      )}
      <figcaption className="text-sm text-muted mt-1">{label}</figcaption>
    </figure>
  );
}

export function MatchResults({ reportId }: { reportId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [openContact, setOpenContact] = useState<string | null>(null);

  const load = useCallback(
    async (t: string | null) => {
      try {
        const res = await fetch(`/api/reports/${reportId}/matches`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: t }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setError(json.message || "We couldn't load the possible matches.");
          return;
        }
        setData(json);
        setError(null);
      } catch {
        setError("We couldn't reach the server. Check your connection and refresh the page.");
      }
    },
    [reportId],
  );

  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get("t");
    setToken(t);
    void load(t);
  }, [load]);

  // While photos are still being analysed, refresh every 10 seconds (up to ~2 minutes).
  useEffect(() => {
    if (!data || data.processing.pending === 0 || !data.processing.aiAvailable) return;
    let n = 0;
    const timer = setInterval(() => {
      n++;
      void load(token);
      if (n >= 12) clearInterval(timer);
    }, 10_000);
    return () => clearInterval(timer);
  }, [data, load, token]);

  async function checkAgain() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/rematch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json();
      setNotice(json.message || (res.ok ? "Done." : "Something went wrong."));
      await load(token);
    } catch {
      setNotice("We couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function answer(matchId: string, verdict: Match["verdict"]) {
    const res = await fetch(`/api/matches/${matchId}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reportId, token, verdict }),
    });
    const json = await res.json().catch(() => ({}));
    setNotice(json.message || (res.ok ? "Saved." : "We couldn't save your answer."));
    await load(token);
  }

  if (error)
    return (
      <div role="alert" className="rounded-xl border-2 border-coral bg-[#fff6f4] p-5">
        <p className="font-semibold">{error}</p>
        <p className="mt-2">
          <Link href={`/login?next=${encodeURIComponent(`/pets/${reportId}/matches`)}`}>Log in</Link> or open the private
          manage link you saved when you made the report.
        </p>
      </div>
    );
  if (!data) return <p role="status">Loading possible matches…</p>;

  const { processing, matches, report } = data;
  const lost = report.kind === "lost";
  const otherWord = lost ? "found" : "lost";
  const animal = report.species === "dog" ? "dogs" : "cats";

  return (
    <div className="flex flex-col gap-6">
      <aside className="rounded-xl border-l-4 border-coral bg-[#fff6f4] p-5">
        <p className="font-bold text-teal">These are AI suggestions, not confirmed matches</p>
        <p className="mt-1">
          Our AI compares photos and descriptions to suggest {otherWord} {animal} that look similar. Lookalike animals
          are common, so a suggestion doesn&apos;t mean it&apos;s the same {report.species} — and a photo never proves who
          owns an animal. Councils, vets and shelters confirm ownership, for example by microchip.
        </p>
      </aside>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <p role="status" className="text-[0.95rem]">
          {!processing.aiAvailable && processing.total > 0
            ? "Photo analysis isn't switched on yet, so suggestions are based on descriptions only."
            : processing.pending > 0
              ? `Analysing ${processing.pending} photo${processing.pending === 1 ? "" : "s"}… this page updates by itself.`
              : processing.failed > 0
                ? `${processing.failed} photo${processing.failed === 1 ? "" : "s"} couldn't be analysed. Use “Check again” to retry.`
                : processing.total > 0
                  ? `All ${processing.total} photo${processing.total === 1 ? "" : "s"} analysed.`
                  : "This report has no photos, so suggestions are based on the description only."}
        </p>
        {data.viewer !== "admin" && report.status === "active" && (
          <button type="button" className="btn btn-outline btn-small" onClick={checkAgain} disabled={busy}>
            {busy ? "Checking…" : "Check again now"}
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="rounded-xl border-2 border-teal bg-mint p-4 font-semibold">
          {notice}
        </p>
      )}

      {matches.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl p-8">
          <h2 className="text-2xl font-bold">No possible matches yet</h2>
          <p className="mt-2">
            We haven&apos;t found a {otherWord} {report.species} nearby that looks similar. That&apos;s common in the first
            days. Every new {otherWord} report is checked against yours automatically
            {data.viewer === "owner" ? ", and we'll alert you if a promising one appears" : ""}.
          </p>
          <ul className="list-disc pl-5 mt-3 space-y-1">
            {lost ? (
              <>
                <li>Call local vets, shelters and your council — found pets are often handed in there.</li>
                <li>Share your report link in local community groups.</li>
              </>
            ) : (
              <li>Make sure the animal has been taken to a vet, shelter or the council so it can be scanned for a microchip.</li>
            )}
            <li>
              <Link href={`/search?kind=${otherWord}&species=${report.species}`}>Browse all {otherWord} {animal}</Link> yourself — the AI
              can miss things.
            </li>
          </ul>
        </div>
      ) : (
        <ol className="flex flex-col gap-6">
          {matches.map((m) => (
            <li key={m.id} className="bg-paper border border-line rounded-2xl overflow-hidden">
              <div className="p-5 flex flex-wrap items-center gap-3 border-b border-line">
                <span className="rounded-md bg-teal text-white font-bold px-2 py-0.5">AI suggestion #{m.rank}</span>
                <span className="rounded-md bg-mint px-2 py-0.5">{m.bandLabel}</span>
                {m.other.isDemo && <span className="rounded-md border border-dashed border-muted px-2 py-0.5 text-muted">Demo record</span>}
                {m.verdict === "likely_same" && <span className="rounded-md bg-coral text-white px-2 py-0.5">You said: looks like {lost ? "my pet" : "the same animal"}</span>}
                {m.verdict === "unsure" && <span className="rounded-md border border-line px-2 py-0.5">You said: unsure</span>}
              </div>
              <div className="p-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="flex gap-3">
                  <Photo src={m.myPhoto} species={report.species} label={`Your ${report.kind} report`} />
                  <Photo src={m.other.photo} species={m.other.species} label={`${m.other.kind === "found" ? "Found" : "Lost"} in ${m.other.suburb}`} />
                </div>
                <div>
                  <h3 className="text-xl font-bold">
                    {m.other.kind === "found" ? "Found" : "Lost"}:{" "}
                    {m.other.petName || `${m.other.primaryColour}${m.other.secondaryColour ? ` & ${m.other.secondaryColour.toLowerCase()}` : ""} ${m.other.breed || m.other.species}`}
                  </h3>
                  <p className="text-muted">
                    {m.other.kind === "found" ? "Found" : "Last seen"} in {m.other.suburb} on {when(m.other.eventAt)}
                  </p>
                  {m.other.animalLocation && <p className="mt-1 font-semibold">Now: {WHERE_NOW[m.other.animalLocation] ?? m.other.animalLocation}</p>}
                  {m.other.fromPartner && <p className="mt-1">Reported by a verified partner organisation</p>}
                  {m.reasons.length > 0 && (
                    <>
                      <p className="font-semibold mt-4">Why it was suggested</p>
                      <ul className="list-disc pl-5 space-y-0.5">
                        {m.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {m.cautions.length > 0 && (
                    <>
                      <p className="font-semibold mt-3">Things to check</p>
                      <ul className="list-disc pl-5 space-y-0.5">
                        {m.cautions.map((c) => (
                          <li key={c}>{c}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
              <div className="px-5 pb-5 flex flex-col gap-4">
                <div className="flex flex-wrap gap-3">
                  <Link href={`/pets/${m.other.id}`} className="btn btn-teal btn-small">
                    Review details
                  </Link>
                  {!m.other.isDemo && data.viewer !== "admin" && (
                    <button type="button" className="btn btn-outline btn-small" onClick={() => setOpenContact(openContact === m.id ? null : m.id)}>
                      {openContact === m.id ? "Hide message form" : "Contact the other reporter"}
                    </button>
                  )}
                </div>
                {openContact === m.id && (
                  <div className="bg-cream rounded-xl p-4">
                    <p className="mb-3 text-[0.95rem]">
                      Your message goes through this site. The other reporter sees your message and the contact details
                      you choose to share — not anyone&apos;s address. Never pay money before an animal is safely
                      confirmed and returned through a vet, shelter or council.
                    </p>
                    <ApiForm action={`/api/reports/${m.other.id}/messages`} submitLabel="Send message">
                      <div>
                        <label htmlFor={`n-${m.id}`} className="field-label">Your name</label>
                        <input id={`n-${m.id}`} name="senderName" className="input" maxLength={80} autoComplete="name" />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor={`e-${m.id}`} className="field-label">Email</label>
                          <input id={`e-${m.id}`} name="senderEmail" type="email" className="input" autoComplete="email" />
                        </div>
                        <div>
                          <label htmlFor={`p-${m.id}`} className="field-label">Phone <span className="font-normal text-muted">(optional)</span></label>
                          <input id={`p-${m.id}`} name="senderPhone" type="tel" className="input" autoComplete="tel" />
                        </div>
                      </div>
                      <div>
                        <label htmlFor={`b-${m.id}`} className="field-label">Message</label>
                        <textarea
                          id={`b-${m.id}`}
                          name="body"
                          className="input"
                          maxLength={2000}
                          defaultValue={
                            lost
                              ? "Hi, our website suggested your found report might be my missing pet. Could we compare details? Which vet, shelter or council is caring for the animal?"
                              : "Hi, our website suggested the animal I found might be your missing pet. It's currently being cared for as described in my report."
                          }
                        />
                      </div>
                      <label className="flex items-start gap-3">
                        <input type="checkbox" name="consent" className="mt-1.5 size-5" />
                        <span>I agree to share my name and contact details with the other reporter.</span>
                      </label>
                    </ApiForm>
                  </div>
                )}
                {data.viewer !== "admin" && (
                  <div>
                    <p className="text-[0.95rem] font-semibold mb-2">Your feedback helps us improve the AI</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn btn-outline btn-small" onClick={() => answer(m.id, "likely_same")}>
                        {lost ? "Looks like my pet" : "Looks like the same animal"}
                      </button>
                      <button type="button" className="btn btn-outline btn-small" onClick={() => answer(m.id, "not_same")}>
                        {lost ? "Not my pet" : "Not the same animal"}
                      </button>
                      <button type="button" className="btn btn-outline btn-small" onClick={() => answer(m.id, "unsure")}>
                        Unsure
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {data.dismissedCount > 0 && (
        <p className="text-muted text-[0.95rem]">
          {data.dismissedCount} suggestion{data.dismissedCount === 1 ? "" : "s"} you marked as “not” {lost ? "your pet" : "the same animal"} {data.dismissedCount === 1 ? "is" : "are"} hidden.
        </p>
      )}
    </div>
  );
}
