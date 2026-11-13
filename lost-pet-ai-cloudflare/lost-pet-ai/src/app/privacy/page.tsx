import type { Metadata } from "next";
import Link from "next/link";
import { Callout, PageIntro } from "@/components/Notices";
import { APP_NAME } from "@/lib/config";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <>
      <PageIntro title="Privacy policy" />
      <div className="mx-auto max-w-3xl px-4 sm:px-6 flex flex-col gap-5">
        <Callout title="Draft — pending legal review" tone="coral">
          <p>This policy describes how the software currently works. It must be reviewed by a qualified privacy lawyer before public launch.</p>
        </Callout>
        <h2 className="text-2xl font-bold">What we collect</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Account details: email address, first name and password (stored securely by our authentication provider).</li>
          <li>Pet reports: photos, description, suburb, date and time, and optionally a precise location.</li>
          <li>Contact details you provide: name, email, phone, preferred contact method and microchip number.</li>
          <li>Messages you send through the site, and the contact details you choose to share with them.</li>
          <li>Technical data: an anonymised (one-way hashed) version of your IP address for spam prevention, and server logs.</li>
        </ul>
        <h2 className="text-2xl font-bold">What is public</h2>
        <p>
          Photos, description, suburb, postcode and an approximate area of about 500 metres. We never publish names,
          email addresses, phone numbers, microchip numbers or exact locations. Location data embedded in photos is
          removed when they are uploaded.
        </p>
        <h2 className="text-2xl font-bold">How we use it</h2>
        <p>
          To publish reports, help people contact you about your report, prevent misuse, moderate content, and produce
          anonymised statistics (for example, number of reports per suburb). We don&apos;t sell personal information or
          use it for advertising.
        </p>
        <h2 className="text-2xl font-bold">Who we share it with</h2>
        <p>
          When someone sends you a message, you see the contact details they chose to share. Your details are only
          shared if you reply. Our service providers store data on our behalf (database and file storage, hosting, and
          later email delivery); some may store data outside Australia.
        </p>
        <h2 className="text-2xl font-bold">Your choices</h2>
        <p>
          You can close your reports at any time. To access, correct or delete your information or account,{" "}
          <Link href="/contact">contact us</Link>. You can also complain to the Office of the Australian Information
          Commissioner (OAIC).
        </p>
        <h2 className="text-2xl font-bold">Contact</h2>
        <p>{APP_NAME} privacy enquiries: use the <Link href="/contact">contact form</Link>.</p>
      </div>
    </>
  );
}
