import type { Metadata } from "next";
import { ManageReport } from "@/components/ManageReport";

export const metadata: Metadata = { title: "Manage your report", robots: { index: false, follow: false } };

export default async function ManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <h1 className="text-4xl font-extrabold mb-6">Manage your report</h1>
      <ManageReport reportId={id} />
    </div>
  );
}
