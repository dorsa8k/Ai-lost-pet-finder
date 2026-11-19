import "server-only";
import { log } from "../logger";

/**
 * Email alerts via Resend (https://resend.com). Optional: if RESEND_API_KEY
 * or EMAIL_FROM isn't set, emails are skipped (in-app notifications still work)
 * and nothing pretends an email was sent.
 */
export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

export async function sendEmail(msg: { to: string; subject: string; text: string; html: string }): Promise<"sent" | "skipped" | "failed"> {
  if (!isEmailConfigured()) return "skipped";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
    });
    if (!res.ok) {
      log.error("email_failed", { status: res.status });
      return "failed";
    }
    return "sent";
  } catch (e) {
    log.error("email_failed", { error: e instanceof Error ? e.message : String(e) });
    return "failed";
  }
}

export { unsubscribeToken, verifyUnsubscribeToken, type UnsubscribeTarget } from "./unsubscribe";
