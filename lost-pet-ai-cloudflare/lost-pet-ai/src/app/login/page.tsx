import type { Metadata } from "next";
import { LoginForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-4xl font-extrabold mb-2">Log in</h1>
      {next?.startsWith("/report/lost") && (
        <p className="mb-4 text-muted">Log in to report a lost pet, so you can update it and read messages later.</p>
      )}
      <div className="bg-paper border border-line rounded-2xl p-6 mt-4">
        <LoginForm next={next} />
      </div>
    </div>
  );
}
