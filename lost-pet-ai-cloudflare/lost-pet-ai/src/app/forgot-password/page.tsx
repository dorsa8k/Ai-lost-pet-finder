import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/AuthForms";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-4xl font-extrabold mb-2">Reset your password</h1>
      <p className="text-muted">Enter your email and we&apos;ll send you a link to choose a new password.</p>
      <div className="bg-paper border border-line rounded-2xl p-6 mt-6">
        <ForgotPasswordForm />
      </div>
    </div>
  );
}
