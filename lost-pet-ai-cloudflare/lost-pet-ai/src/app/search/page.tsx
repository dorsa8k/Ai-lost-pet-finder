import type { Metadata } from "next";
import Link from "next/link";
import { PetCard } from "@/components/PetCard";
import { LoadError, PageIntro, SetupNotice } from "@/components/Notices";
import { isSupabaseConfigured } from "@/lib/config";
import { PAGE_SIZE, searchReports } from "@/lib/reports";
import { parseSearchParams, type SearchFilters } from "@/lib/validation";
import { SearchForm } from "@/components/SearchForm";
import type { ReportWithPhotos } from "@/lib/types";

export const metadata: Metadata = { title: "Search lost and found pets" };

function pageHref(f: SearchFilters, page: number) {
  const p = new URLSearchParams();
  if (f.kind) p.set("kind", f.kind);
  if (f.species) p.set("species", f.species);
  if (f.suburb) p.set("suburb", f.suburb);
  if (f.days) p.set("days", String(f.days));
  if (f.q) p.set("q", f.q);
  p.set("page", String(page));
  return `/search?${p.toString()}`;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = parseSearchParams(await searchParams);
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10">
        <SetupNotice feature="Search" />
      </div>
    );
  }
  let result: { rows: ReportWithPhotos[]; total: number } | null = null;
  try {
    result = await searchReports(f);
  } catch {
    result = null;
  }
  const pages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageIntro title="Search lost and found pets">
        Active reports from Knox and nearby suburbs. Locations are approximate to protect people&apos;s privacy.
      </PageIntro>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col gap-6">
        <SearchForm f={f} />
        {!result ? (
          <LoadError />
        ) : result.rows.length === 0 ? (
          <div className="bg-paper border border-line rounded-2xl p-8">
            <h2 className="text-2xl font-bold">No matching reports</h2>
            <p className="mt-2">
              Try a nearby suburb, a longer time period, or fewer words. Pets can travel several kilometres.
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              <Link href="/search" className="btn btn-outline">Clear filters</Link>
              <Link href="/report/lost" className="btn btn-coral">Report a lost pet</Link>
              <Link href="/report/found" className="btn btn-coral">Report a found pet</Link>
            </div>
          </div>
        ) : (
          <>
            <p role="status">
              {result.total} report{result.total === 1 ? "" : "s"} found
              {result.rows.some((r) => r.is_demo) && " (includes fictional demo records)"}
            </p>
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {result.rows.map((r) => (
                <li key={r.id}>
                  <PetCard report={r} />
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <nav aria-label="Pagination" className="flex items-center gap-4 justify-center">
                {f.page > 1 && <Link className="btn btn-outline btn-small" href={pageHref(f, f.page - 1)}>Previous</Link>}
                <span>Page {f.page} of {pages}</span>
                {f.page < pages && <Link className="btn btn-outline btn-small" href={pageHref(f, f.page + 1)}>Next</Link>}
              </nav>
            )}
          </>
        )}
      </div>
    </>
  );
}
