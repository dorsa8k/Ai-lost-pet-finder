"use client";
import { useEffect, useState } from "react";
import { CopyLinkButton } from "./CopyLinkButton";

/**
 * Shows the private manage link once, straight after submitting.
 * The secret is kept in this browser tab's sessionStorage and put after "#"
 * in the link, so it is never sent to (or logged by) the server in a URL.
 */
export function ManageLinkPanel({ reportId }: { reportId: string }) {
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    const token = sessionStorage.getItem(`manage:${reportId}`);
    if (token) setLink(`${window.location.origin}/manage/${reportId}#t=${token}`);
  }, [reportId]);

  return (
    <div className="bg-paper border-2 border-coral rounded-2xl p-6 flex flex-col gap-3">
      <h2 className="text-2xl font-bold">Save your private manage link</h2>
      {link ? (
        <>
          <p>
            Use this link to read messages from people who think it&apos;s their pet, and to close the report. We
            can&apos;t email it to you yet, so <strong>bookmark it or copy it somewhere safe now</strong>. Don&apos;t share
            it — anyone with it can manage your report.
          </p>
          <p className="break-all bg-cream rounded-lg p-3 font-mono text-sm">{link}</p>
          <CopyLinkButton url={link} label="Copy private link" />
        </>
      ) : (
        <p>
          The private manage link is only shown in the browser tab you used to submit the report. If you&apos;ve lost
          it, contact us and we&apos;ll help you close the report.
        </p>
      )}
    </div>
  );
}
