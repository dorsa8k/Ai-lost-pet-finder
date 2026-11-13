import type { Metadata } from "next";
import { Callout, PageIntro } from "@/components/Notices";
import { APP_NAME } from "@/lib/config";

export const metadata: Metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <>
      <PageIntro title="Terms of use" />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 flex flex-col gap-5">
        <Callout title="Draft — pending legal review" tone="coral">
          <p>These terms must be reviewed by a qualified lawyer before public launch.</p>
        </Callout>
        <h2 className="text-2xl font-bold">Using {APP_NAME}</h2>
        <ul className="list-disc pl-6 space-y-2">
          <li>Only report animals you have genuinely lost, found or seen, and keep your information accurate.</li>
          <li>Only upload photos you took or have permission to use.</li>
          <li>Don&apos;t use the site to harass anyone, request payment, or claim an animal that isn&apos;t yours.</li>
          <li>We may hide or remove reports and accounts that break these terms.</li>
        </ul>
        <h2 className="text-2xl font-bold">Ownership and found animals</h2>
        <p>
          Nothing on this site — including a photo, a message or a possible match — proves who owns an animal. In
          Victoria, people who find a lost dog or cat must take it to the local council, a participating vet or an
          animal shelter. You are responsible for following the law that applies to you.
        </p>
        <h2 className="text-2xl font-bold">Photo matching</h2>
        <p>
          When photo matching launches, it will suggest possible matches based on similarity. It can be wrong and must
          always be checked by a person.
        </p>
        <h2 className="text-2xl font-bold">No guarantee</h2>
        <p>
          {APP_NAME} is provided to help, but we can&apos;t guarantee any pet will be found or that information
          supplied by other users is accurate. Your rights under the Australian Consumer Law are not affected.
        </p>
      </div>
    </>
  );
}
