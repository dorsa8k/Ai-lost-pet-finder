import type { Metadata } from "next";
import { ApiForm } from "@/components/ApiForm";

export const metadata: Metadata = { title: "Stop match emails", robots: { index: false, follow: false } };

/** Landing page for the "Stop these emails" link. A button (not the link itself) makes the change, so email scanners can't unsubscribe people by accident. */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { k = "", id = "", t = "" } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-4xl font-extrabold mb-4">Stop match emails</h1>
      <p className="mb-6">You&apos;ll stop receiving emails about possible matches. Your report stays active, and you can still check its matches page.</p>
      <ApiForm action="/api/unsubscribe" submitLabel="Stop match emails" buttonClass="btn btn-coral">
        <input type="hidden" name="k" value={k} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="t" value={t} />
      </ApiForm>
    </div>
  );
}
