"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-4xl font-extrabold">This page didn&apos;t load</h1>
      <p className="mt-4 text-lg">
        Something went wrong on our side. Nothing you entered was lost unless you were part-way through a form — try
        again in a moment.
      </p>
      <button type="button" onClick={reset} className="btn btn-teal mt-8">
        Try again
      </button>
    </div>
  );
}
