import Link from "next/link";
import { PetCard, PosterCard } from "@/components/PetCard";
import { SearchForm } from "@/components/SearchForm";
import { isSupabaseConfigured, APP_NAME } from "@/lib/config";
import { getImageEmbedder } from "@/lib/ai/embeddings";
import { getPublicCounts, getRecentReports } from "@/lib/reports";
import type { ReportWithPhotos } from "@/lib/types";

const FAQ = [
  {
    q: "Does it cost anything?",
    a: "No. Reporting, searching and messaging are free for pet owners and people who find pets.",
  },
  {
    q: "I found a dog or cat. Can I just give it back to the owner?",
    a: "In Victoria you need to take a found dog or cat to the local council, a participating vet or an animal shelter as soon as reasonably possible. They scan for a microchip and confirm ownership. Report it here too, so the owner knows where to look.",
  },
  {
    q: "Who can see my phone number and address?",
    a: "Nobody. Contact details, microchip numbers and exact locations are private. Reports show the suburb and an approximate area of about 500 metres.",
  },
  {
    q: "How does AI matching work?",
    a: "Each photo is turned into a numeric 'fingerprint' by an AI image model (Google's EmbeddingGemma 2) and compared with photos of pets reported nearby. That's combined with species, colour, size, distance and dates to suggest the top five possible matches, with the reasons. Suggestions always need a person to check them — they're never proof of identity or ownership.",
  },
  {
    q: "Which areas do you cover?",
    a: "We're starting in Knox — Rowville, Ferntree Gully, Boronia, Wantirna and nearby suburbs — and plan to expand across Victoria.",
  },
  {
    q: "Is this run by the council or RSPCA?",
    a: `No. ${APP_NAME} is an independent service. It doesn't replace council pounds, vets or shelters — it helps people find them.`,
  },
];

async function loadHomeData(): Promise<{ recent: ReportWithPhotos[]; counts: { lost: number; found: number; reunited: number } | null }> {
  if (!isSupabaseConfigured()) return { recent: [], counts: null };
  try {
    const [recent, counts] = await Promise.all([getRecentReports(8), getPublicCounts()]);
    return { recent, counts };
  } catch {
    return { recent: [], counts: null };
  }
}

export default async function HomePage() {
  const { recent, counts } = await loadHomeData();
  const matchingLive = isSupabaseConfigured() && (await getImageEmbedder()) !== null;
  const posters = recent.slice(0, 3);
  const tilts = [-3, 2, -1.5];

  return (
    <>
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-16 grid gap-12 lg:grid-cols-[1.15fr_1fr] items-center">
        <div>
          <h1 className="font-display font-extrabold text-[3.1rem] sm:text-[4.4rem] leading-[0.95] tracking-[-0.02em]">
            Lost pets.
            <br />
            Found faster.
          </h1>
          <p className="mt-6 text-xl max-w-xl">
            AI-powered pet matching to help reunite lost dogs and cats with their families.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <Link href="/report/lost" className="btn btn-coral text-lg px-7 py-4">
              I&apos;ve Lost a Pet
            </Link>
            <Link href="/report/found" className="btn btn-coral text-lg px-7 py-4">
              I&apos;ve Found a Pet
            </Link>
          </div>
          <p className="mt-5 text-muted max-w-xl">
            Serving Rowville, Knox and Melbourne&apos;s outer east.{" "}
            {matchingLive
              ? "AI photo matching is live in early testing — every suggestion is checked by people."
              : "Reporting and search are live now; photo matching is being switched on."}
          </p>
        </div>

        <div aria-label="Recently reported pets" className="relative">
          {posters.length > 0 ? (
            <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-2 pt-3">
              {posters.map((r, i) => (
                <li key={r.id} className={i === 2 ? "col-span-2 sm:col-span-1 lg:col-span-2 lg:w-1/2 lg:mx-auto" : ""}>
                  <PosterCard report={r} tilt={tilts[i]} delay={i * 120} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="poster p-8 text-center">
              <p className="font-display text-2xl font-bold text-teal">No active reports right now</p>
              <p className="mt-2">When someone reports a lost or found pet nearby, it will appear here.</p>
            </div>
          )}
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how-heading" className="bg-teal text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16">
          <h2 id="how-heading" className="text-4xl font-extrabold text-white">How {APP_NAME} works</h2>
          <ol className="mt-10 grid gap-10 md:grid-cols-3">
            {[
              ["Report it", "Add photos, a description and the suburb. It takes about five minutes and goes live straight away."],
              ["Search nearby", "Owners and finders search lost and found reports in one place, by suburb, date and description."],
              ["Connect safely", "Send a private message without revealing anyone's phone or address. Councils, vets and shelters confirm ownership."],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-4">
                <span className="font-display text-5xl font-extrabold text-mint-deep leading-none" aria-hidden="true">{i + 1}</span>
                <div>
                  <h3 className="text-2xl font-bold text-white">{title}</h3>
                  <p className="mt-2 text-mint">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Search */}
      <section aria-labelledby="search-heading" className="mx-auto max-w-6xl px-4 sm:px-6 pt-16">
        <h2 id="search-heading" className="text-4xl font-extrabold">Search lost and found pets</h2>
        <div className="mt-6">
          <SearchForm compact />
        </div>
      </section>

      {/* Recent */}
      <section aria-labelledby="recent-heading" className="mx-auto max-w-6xl px-4 sm:px-6 pt-16">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <h2 id="recent-heading" className="text-4xl font-extrabold">Recently reported</h2>
          <Link href="/search" className="font-semibold">See all reports</Link>
        </div>
        {recent.length > 0 ? (
          <>
            {recent.some((r) => r.is_demo) && (
              <p className="mt-2 text-muted">Records marked “Demo record” are fictional examples.</p>
            )}
            <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {recent.map((r) => (
                <li key={r.id}>
                  <PetCard report={r} />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-4">{isSupabaseConfigured() ? "No active reports yet." : "Reports will appear here once the database is connected."}</p>
        )}
      </section>

      {/* AI matching explained */}
      <section aria-labelledby="ai-heading" className="mx-auto max-w-6xl px-4 sm:px-6 pt-20 grid gap-10 lg:grid-cols-2 items-start">
        <div>
          <h2 id="ai-heading" className="text-4xl font-extrabold">Photo matching, explained honestly</h2>
          <p className="mt-4 text-lg">
            Descriptions like “brown dog” match hundreds of pets. Photos carry much more detail. Our matching system
            turns each photo into a numeric fingerprint and compares it with pets reported nearby, combined with
            species, colour, distance and dates.
          </p>
          <p className="mt-4">
            Every result is a <strong>possible match for a person to check</strong>, never proof of identity or
            ownership. We&apos;ll publish how accurate it is on real test photos before relying on it.
          </p>
        </div>
        <div className="bg-mint rounded-2xl p-6">
          {matchingLive ? (
            <>
              <p className="font-display text-2xl font-bold text-teal">Status: live, in early testing</p>
              <p className="mt-2">
                When you report a pet with photos, we automatically suggest up to five possible matches and keep checking
                as new reports arrive. We&apos;re still measuring accuracy on real test photos, so treat every suggestion
                as a lead to check — not an answer.
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-2xl font-bold text-teal">Status: being switched on</p>
              <p className="mt-2">
                Photo matching isn&apos;t running on this site yet. Photos you upload now are stored and will be
                analysed once it is, so reporting today still helps.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Vets and shelters */}
      <section aria-labelledby="partners-heading" className="mx-auto max-w-6xl px-4 sm:px-6 pt-20">
        <div className="rounded-3xl border-2 border-teal p-8 sm:p-10 grid gap-6 lg:grid-cols-[2fr_1fr] items-center">
          <div>
            <h2 id="partners-heading" className="text-4xl font-extrabold">For vets and shelters</h2>
            <p className="mt-3 text-lg max-w-2xl">
              Check animals brought into your care against local lost-pet reports, and help owners find out where their
              pet is — without phone tag or Facebook scrolling. Free for participating clinics during the pilot.
            </p>
          </div>
          <div>
            <Link href="/partner" className="btn btn-teal text-lg">Partner with us</Link>
          </div>
        </div>
      </section>

      {/* Impact */}
      <section aria-labelledby="impact-heading" className="mx-auto max-w-6xl px-4 sm:px-6 pt-20">
        <h2 id="impact-heading" className="text-4xl font-extrabold">Community impact</h2>
        {counts && counts.lost + counts.found > 0 ? (
          <>
            <dl className="mt-6 grid gap-6 sm:grid-cols-3">
              {[
                ["Lost pets reported", counts.lost],
                ["Found pets reported", counts.found],
                ["Marked as reunited by their reporters", counts.reunited],
              ].map(([label, n]) => (
                <div key={label as string} className="border-t-4 border-teal pt-3">
                  <dd className="font-display text-5xl font-extrabold text-teal">{n}</dd>
                  <dt className="mt-1">{label}</dt>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-muted">Live figures from real reports. Demo records are excluded.</p>
          </>
        ) : (
          <p className="mt-4 text-lg max-w-2xl">
            We&apos;re just getting started. This section will show live figures from real reports — we don&apos;t
            count demo records or estimate numbers.
          </p>
        )}
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-heading" className="mx-auto max-w-3xl px-4 sm:px-6 pt-20">
        <h2 id="faq-heading" className="text-4xl font-extrabold">Questions</h2>
        <div className="mt-6 divide-y divide-line border-y border-line">
          {FAQ.map((item) => (
            <details key={item.q} className="py-4 group">
              <summary className="cursor-pointer font-semibold text-lg list-none flex justify-between gap-4">
                {item.q}
                <span aria-hidden="true" className="text-teal group-open:rotate-45 transition-transform">+</span>
              </summary>
              <p className="mt-3">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8">
          Still have a question? <Link href="/contact">Contact us</Link>.
        </p>
      </section>
    </>
  );
}
