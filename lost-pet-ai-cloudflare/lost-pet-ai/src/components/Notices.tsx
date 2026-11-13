import type { ReactNode } from "react";

export function SetupNotice({ feature = "This page" }: { feature?: string }) {
  return (
    <div role="alert" className="rounded-xl border-2 border-coral bg-[#fff6f4] p-5 max-w-2xl">
      <p className="font-bold text-lg">{feature} needs the database to be connected.</p>
      <p className="mt-2">
        The Supabase settings are missing, so nothing can be loaded or saved yet. Follow “Set up Supabase” in
        README.md, add the values to <code>.env.local</code>, then restart the app.
      </p>
    </div>
  );
}

export function Callout({ title, children, tone = "mint" }: { title: string; children: ReactNode; tone?: "mint" | "coral" }) {
  return (
    <aside
      className={`rounded-xl p-5 border-l-4 ${tone === "coral" ? "border-coral bg-[#fff6f4]" : "border-teal bg-mint"}`}
    >
      <p className="font-bold text-teal">{title}</p>
      <div className="mt-1 space-y-2">{children}</div>
    </aside>
  );
}

export function PageIntro({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-6">
      <h1 className="text-4xl sm:text-5xl font-extrabold">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-lg text-muted">{children}</div>}
    </div>
  );
}

export function LoadError() {
  return (
    <div role="alert" className="rounded-xl border-2 border-coral bg-[#fff6f4] p-5 max-w-2xl">
      <p className="font-bold">We couldn&apos;t load this information.</p>
      <p className="mt-1">The database didn&apos;t respond. Refresh the page in a minute. If it keeps happening, contact us.</p>
    </div>
  );
}
