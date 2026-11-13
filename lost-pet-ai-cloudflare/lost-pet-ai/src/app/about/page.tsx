import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/Notices";
import { APP_NAME } from "@/lib/config";

export const metadata: Metadata = { title: "About us" };

export default function AboutPage() {
  return (
    <>
      <PageIntro title={`About ${APP_NAME}`} />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 flex flex-col gap-5 text-lg">
        <p>
          When a pet goes missing, information ends up scattered across Facebook groups, council websites, vet clinics,
          shelters and community noticeboards. Owners check them all by hand, and people who find a pet often don&apos;t
          know where to report it.
        </p>
        <p>
          {APP_NAME} brings lost and found reports for Knox and Melbourne&apos;s outer east into one place, with
          privacy built in from the start. We&apos;re developing photo matching to suggest possible matches between
          lost and found pets, always for a person to confirm.
        </p>
        <h2 className="text-3xl font-bold mt-4">What we believe</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Nobody should need to publish their phone number or address to find their pet.</li>
          <li>Councils, vets and shelters are the right people to confirm ownership. We help people reach them.</li>
          <li>We report what our technology can and can&apos;t do, and we never invent results.</li>
        </ul>
        <h2 className="text-3xl font-bold mt-4">Who we are</h2>
        <p>
          {APP_NAME} is an independent, Melbourne-based startup. We aren&apos;t affiliated with any council, RSPCA
          Victoria or government agency. If you&apos;d like to work with us, see{" "}
          <Link href="/partner">partnering</Link> or <Link href="/contact">get in touch</Link>.
        </p>
      </div>
    </>
  );
}
