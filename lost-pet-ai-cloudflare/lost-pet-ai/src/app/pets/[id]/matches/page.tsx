import type { Metadata } from "next";
import Link from "next/link";
import { MatchResults } from "@/components/MatchResults";
import { SetupNotice } from "@/components/Notices";
import { isSupabaseConfigured } from "@/lib/config";

export const metadata: Metadata = { title: "Possible matches", robots: { index: false, follow: false } };

export default async function MatchesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
      <p>
        <Link href={`/pets/${id}`}>Back to the report</Link>
      </p>
      <h1 className="text-4xl sm:text-5xl font-extrabold mt-2 mb-6">Possible matches</h1>
      {isSupabaseConfigured() ? <MatchResults reportId={id} /> : <SetupNotice feature="AI matching" />}
    </div>
  );
}
