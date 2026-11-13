import Link from "next/link";
import { APP_NAME } from "@/lib/config";

export function SiteFooter() {
  return (
    <footer className="bg-teal text-mint mt-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 grid gap-10 md:grid-cols-[2fr_1fr_1fr]">
        <div>
          <p className="font-display text-2xl font-bold text-white">{APP_NAME}</p>
          <p className="mt-2 max-w-md">
            An independent community service helping reunite lost dogs and cats with their families in Knox, Rowville
            and Melbourne&apos;s outer east.
          </p>
          <p className="mt-4 text-sm max-w-md">
            Found a dog or cat? Victorian law requires you to take it to the local council, a participating vet or an
            animal shelter as soon as reasonably possible.{" "}
            <Link href="/report/found#what-to-do" className="text-white underline">
              What to do
            </Link>
          </p>
        </div>
        <nav aria-label="Footer: services" className="flex flex-col gap-2">
          <Link className="text-white" href="/report/lost">I&apos;ve lost a pet</Link>
          <Link className="text-white" href="/report/found">I&apos;ve found a pet</Link>
          <Link className="text-white" href="/search">Search lost and found pets</Link>
          <Link className="text-white" href="/partner">For vets and shelters</Link>
        </nav>
        <nav aria-label="Footer: about" className="flex flex-col gap-2">
          <Link className="text-white" href="/about">About us</Link>
          <Link className="text-white" href="/contact">Contact</Link>
          <Link className="text-white" href="/privacy">Privacy policy</Link>
          <Link className="text-white" href="/terms">Terms of use</Link>
        </nav>
      </div>
      <div className="border-t border-teal-soft">
        <p className="mx-auto max-w-6xl px-4 sm:px-6 py-4 text-sm">
          © {new Date().getFullYear()} {APP_NAME}. Not affiliated with any council, RSPCA Victoria or government agency.
        </p>
      </div>
    </footer>
  );
}
