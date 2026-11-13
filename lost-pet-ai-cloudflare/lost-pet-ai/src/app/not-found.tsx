import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="text-5xl font-extrabold">Page not found</h1>
      <p className="mt-4 text-lg">This page doesn&apos;t exist, or the report has been removed.</p>
      <div className="mt-8 flex flex-wrap gap-3 justify-center">
        <Link href="/search" className="btn btn-teal">Search reports</Link>
        <Link href="/" className="btn btn-outline">Go to the home page</Link>
      </div>
    </div>
  );
}
