"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

function Status({ error, success }: { error: string | null; success: string | null }) {
  if (error)
    return (
      <p role="alert" className="rounded-xl border-2 border-coral bg-[#fff6f4] p-4 font-semibold">
        {error}
      </p>
    );
  if (success)
    return (
      <p role="status" className="rounded-xl border-2 border-teal bg-mint p-4 font-semibold">
        {success}
      </p>
    );
  return null;
}

const NOT_CONFIGURED = "Accounts aren't available yet because the database isn't connected (see README).";

function friendly(message: string): string {
  if (/invalid login credentials/i.test(message)) return "That email and password don't match. Check them and try again.";
  if (/email not confirmed/i.test(message)) return "Please confirm your email first — check your inbox for the link we sent.";
  if (/already registered/i.test(message)) return "There's already an account with that email. Try logging in instead.";
  if (/rate limit/i.test(message)) return "Too many attempts. Please wait a few minutes and try again.";
  return message;
}

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const supabase = createBrowserSupabase();
    if (!supabase) return setError(NOT_CONFIGURED);
    const fd = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email") || "").trim(),
      password: String(fd.get("password") || ""),
    });
    setPending(false);
    if (error) return setError(friendly(error.message));
    router.push(safeNext(next));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Status error={error} success={null} />
      <div>
        <label htmlFor="email" className="field-label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <div>
        <label htmlFor="password" className="field-label">Password</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <button className="btn btn-teal" disabled={pending}>{pending ? "Logging in…" : "Log in"}</button>
      <p>
        <Link href="/forgot-password">Forgot your password?</Link>
      </p>
      <p>
        New here? <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`}>Create a free account</Link>
      </p>
    </form>
  );
}

export function SignupForm({ next }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const supabase = createBrowserSupabase();
    if (!supabase) return setError(NOT_CONFIGURED);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") || "");
    if (password.length < 10) return setError("Please choose a password of at least 10 characters.");
    if (!fd.get("consent")) return setError("Please agree to the Terms of use and Privacy policy.");
    setPending(true);
    setError(null);
    const { data, error } = await supabase.auth.signUp({
      email: String(fd.get("email") || "").trim(),
      password,
      options: {
        data: { display_name: String(fd.get("displayName") || "").trim().slice(0, 80) },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`,
      },
    });
    setPending(false);
    if (error) return setError(friendly(error.message));
    if (data.session) {
      window.location.href = safeNext(next);
      return;
    }
    setSuccess("Almost done — we've emailed you a link. Open it to confirm your account, then you can log in.");
    e.currentTarget.reset();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Status error={error} success={success} />
      <div>
        <label htmlFor="displayName" className="field-label">Your first name</label>
        <input id="displayName" name="displayName" autoComplete="given-name" maxLength={80} className="input" />
      </div>
      <div>
        <label htmlFor="email" className="field-label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <div>
        <label htmlFor="password" className="field-label">Password</label>
        <span className="field-hint">At least 10 characters.</span>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="input" />
      </div>
      <label className="flex items-start gap-3">
        <input type="checkbox" name="consent" className="mt-1.5 size-5" />
        <span>
          I agree to the <Link href="/terms" target="_blank">Terms of use</Link> and{" "}
          <Link href="/privacy" target="_blank">Privacy policy</Link>.
        </span>
      </label>
      <button className="btn btn-teal" disabled={pending}>{pending ? "Creating account…" : "Create account"}</button>
      <p>
        Already have an account? <Link href="/login">Log in</Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const supabase = createBrowserSupabase();
    if (!supabase) return setError(NOT_CONFIGURED);
    const email = String(new FormData(e.currentTarget).get("email") || "").trim();
    setPending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/account/update-password`,
    });
    setPending(false);
    if (error) return setError(friendly(error.message));
    setError(null);
    setSuccess("If there's an account with that email, we've sent a link to reset your password.");
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Status error={error} success={success} />
      <div>
        <label htmlFor="email" className="field-label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <button className="btn btn-teal" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
    </form>
  );
}

export function UpdatePasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const supabase = createBrowserSupabase();
    if (!supabase) return setError(NOT_CONFIGURED);
    const password = String(new FormData(e.currentTarget).get("password") || "");
    if (password.length < 10) return setError("Please choose a password of at least 10 characters.");
    setPending(true);
    const { error } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (error) return setError(friendly(error.message));
    router.push("/dashboard?passwordUpdated=1");
    router.refresh();
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Status error={error} success={null} />
      <div>
        <label htmlFor="password" className="field-label">New password</label>
        <span className="field-hint">At least 10 characters.</span>
        <input id="password" name="password" type="password" autoComplete="new-password" required className="input" />
      </div>
      <button className="btn btn-teal" disabled={pending}>{pending ? "Saving…" : "Save new password"}</button>
    </form>
  );
}
