"use client";
import { useState } from "react";

export function CopyLinkButton({ url, label = "Copy link" }: { url: string; label?: string }) {
  const [status, setStatus] = useState<string | null>(null);
  async function copy() {
    try {
      if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
        await navigator.share({ url });
        setStatus(null);
        return;
      }
      await navigator.clipboard.writeText(url);
      setStatus("Link copied.");
    } catch {
      setStatus("Couldn't copy automatically — select the link and copy it.");
    }
  }
  return (
    <span className="inline-flex items-center gap-3">
      <button type="button" className="btn btn-teal" onClick={copy}>
        {label}
      </button>
      <span role="status" className="text-sm">
        {status}
      </span>
    </span>
  );
}
