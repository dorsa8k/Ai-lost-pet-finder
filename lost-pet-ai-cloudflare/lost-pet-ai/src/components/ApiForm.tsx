"use client";
/**
 * A form that posts to one of the app's API routes and shows real results:
 *  - field errors (summary at the top + red outline on each invalid field)
 *  - a success message, or a redirect to the next page
 * Nothing says "success" unless the server confirmed the data was saved.
 */
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export interface ApiResponse {
  ok: boolean;
  message?: string;
  errors?: Record<string, string>;
  redirect?: string;
  store?: Record<string, string>; // values to keep in sessionStorage (e.g. a private manage link)
}

export function useApiSubmit(action: string) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(form: HTMLFormElement, body: FormData, onSuccess?: (r: ApiResponse) => void) {
    setPending(true);
    setMessage(null);
    setErrors({});
    form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    try {
      const res = await fetch(action, { method: "POST", body });
      let data: ApiResponse;
      try {
        data = (await res.json()) as ApiResponse;
      } catch {
        data = { ok: false, message: `The server returned an unexpected response (${res.status}). Nothing was saved.` };
      }
      if (!res.ok || !data.ok) {
        const errs = data.errors ?? {};
        setErrors(errs);
        for (const name of Object.keys(errs)) {
          form.querySelectorAll(`[name="${CSS.escape(name)}"]`).forEach((el) => el.setAttribute("aria-invalid", "true"));
        }
        setMessage({ kind: "error", text: data.message || "Please fix the problems below and try again." });
        requestAnimationFrame(() => form.querySelector<HTMLElement>("[data-form-status]")?.focus());
        return;
      }
      if (data.store) for (const [k, v] of Object.entries(data.store)) sessionStorage.setItem(k, v);
      onSuccess?.(data);
      if (data.redirect) {
        router.push(data.redirect);
        router.refresh();
        return;
      }
      setMessage({ kind: "success", text: data.message || "Saved." });
      form.reset();
      router.refresh();
      requestAnimationFrame(() => form.querySelector<HTMLElement>("[data-form-status]")?.focus());
    } catch {
      setMessage({
        kind: "error",
        text: "We couldn't reach the server. Check your internet connection and try again — nothing was saved.",
      });
    } finally {
      setPending(false);
    }
  }

  return { submit, pending, message, errors };
}

export function FormStatus({
  message,
  errors,
}: {
  message: { kind: "error" | "success"; text: string } | null;
  errors: Record<string, string>;
}) {
  if (!message) return <div data-form-status tabIndex={-1} aria-live="polite" />;
  const isError = message.kind === "error";
  return (
    <div
      data-form-status
      tabIndex={-1}
      role={isError ? "alert" : "status"}
      className={`rounded-xl p-4 border-2 ${isError ? "border-coral bg-[#fff6f4]" : "border-teal bg-mint"}`}
    >
      <p className="font-bold">{message.text}</p>
      {isError && Object.keys(errors).length > 0 && (
        <ul className="list-disc pl-5 mt-2">
          {Object.entries(errors).map(([field, text]) => (
            <li key={field}>{text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ApiForm({
  action,
  submitLabel,
  pendingLabel = "Sending…",
  children,
  className = "",
  buttonClass = "btn btn-teal",
}: {
  action: string;
  submitLabel: string;
  pendingLabel?: string;
  children: ReactNode;
  className?: string;
  buttonClass?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const { submit, pending, message, errors } = useApiSubmit(action);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ref.current) return;
    void submit(ref.current, new FormData(ref.current));
  }
  return (
    <form ref={ref} onSubmit={onSubmit} noValidate className={`flex flex-col gap-4 ${className}`}>
      <FormStatus message={message} errors={errors} />
      {children}
      <div>
        <button type="submit" className={buttonClass} disabled={pending}>
          {pending ? pendingLabel : submitLabel}
        </button>
      </div>
    </form>
  );
}

/** A single-button action (e.g. "Mark as reunited") that posts fixed values. */
export function ActionButton({
  action,
  values,
  label,
  pendingLabel = "Saving…",
  className = "btn btn-outline btn-small",
  confirmText,
}: {
  action: string;
  values: Record<string, string>;
  label: string;
  pendingLabel?: string;
  className?: string;
  confirmText?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const { submit, pending, message } = useApiSubmit(action);
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirmText && !window.confirm(confirmText)) return;
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) fd.set(k, v);
    if (ref.current) void submit(ref.current, fd);
  }
  return (
    <form ref={ref} onSubmit={onSubmit} className="inline-flex flex-col gap-1">
      <button type="submit" className={className} disabled={pending}>
        {pending ? pendingLabel : label}
      </button>
      {message && (
        <span role={message.kind === "error" ? "alert" : "status"} className="text-sm">
          {message.text}
        </span>
      )}
    </form>
  );
}
