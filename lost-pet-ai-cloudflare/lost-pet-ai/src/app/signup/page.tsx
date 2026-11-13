import type { Metadata } from "next";
import { SignupForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-4xl font-extrabold mb-2">Create your free account</h1>
      <p className="text-muted">
        An account lets you report a lost pet, edit your report, read messages from people who may have seen your pet,
        and mark your pet as home.
      </p>
      <div className="bg-paper border border-line rounded-2xl p-6 mt-6">
        <SignupForm next={next} />
      </div>
    </div>
  );
}
