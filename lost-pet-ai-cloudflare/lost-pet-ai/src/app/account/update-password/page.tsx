import type { Metadata } from "next";
import { UpdatePasswordForm } from "@/components/AuthForms";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function UpdatePasswordPage() {
  await requireUser("/account/update-password");
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-4xl font-extrabold mb-6">Choose a new password</h1>
      <div className="bg-paper border border-line rounded-2xl p-6">
        <UpdatePasswordForm />
      </div>
    </div>
  );
}
