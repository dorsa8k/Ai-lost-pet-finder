import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getReport } from "@/lib/reports";
import { getCurrentUser } from "@/lib/auth";
import { ManageLinkPanel } from "@/components/ManageLinkPanel";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { SITE_URL } from "@/lib/config";

export const metadata: Metadata = { title: "Report published", robots: { index: false } };

export default async function SubmittedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) notFound();
  const user = await getCurrentUser();
  const publicUrl = `${SITE_URL}/pets/${report.id}`;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 flex flex-col gap-6">
      <h1 className="text-4xl sm:text-5xl font-extrabold">Your report is live</h1>
      <p className="text-lg">
        {report.kind === "lost"
          ? "People searching nearby can now see your pet. Share the link below in local community groups."
          : "Thank you. The owner can now find out where this animal is."}
      </p>

      <div className="bg-paper border border-line rounded-2xl p-6 flex flex-col gap-3">
        <h2 className="text-2xl font-bold">Share the public page</h2>
        <p className="break-all font-semibold">{publicUrl}</p>
        <div className="flex flex-wrap gap-3">
          <CopyLinkButton url={publicUrl} />
          <Link href={`/pets/${report.id}`} className="btn btn-outline">
            View public page
          </Link>
        </div>
      </div>

      {user && report.owner_id === user.id ? (
        <div className="bg-mint rounded-2xl p-6">
          <h2 className="text-2xl font-bold">Manage it from your dashboard</h2>
          <p className="mt-2">Read messages and mark your report as reunited from your dashboard.</p>
          <Link href="/dashboard" className="btn btn-teal mt-4">
            Go to my dashboard
          </Link>
        </div>
      ) : (
        <ManageLinkPanel reportId={report.id} />
      )}

      <p className="text-muted">
        Photo matching isn&apos;t available yet. Until it launches, check the{" "}
        <Link href={`/search?kind=${report.kind === "lost" ? "found" : "lost"}&species=${report.species}`}>
          {report.kind === "lost" ? "found" : "lost"} {report.species}s already reported
        </Link>
        .
      </p>
    </div>
  );
}
