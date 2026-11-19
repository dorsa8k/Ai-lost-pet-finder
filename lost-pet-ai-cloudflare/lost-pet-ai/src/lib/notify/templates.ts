/**
 * Notification wording — pure, unit-tested. Never includes contact details,
 * exact locations or microchip numbers.
 */
import { LABELS, type ReportKind, type Species } from "../types";

export interface MatchNotice {
  recipientKind: ReportKind;
  recipientPetName: string | null;
  otherSpecies: Species;
  otherSuburb: string;
  link: string; // absolute URL to review the match
  unsubscribeUrl: string;
  hasAccount: boolean;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function matchNoticeText(n: MatchNotice) {
  const animal = LABELS.species[n.otherSpecies].toLowerCase();
  const title =
    n.recipientKind === "lost"
      ? `Possible match for ${n.recipientPetName || "your lost pet"}`
      : `A lost ${animal} may match the one you found`;
  const body =
    n.recipientKind === "lost"
      ? `A ${animal} reported as found in ${n.otherSuburb} looks similar to your report. Please review it — AI suggestions can be wrong.`
      : `A ${animal} reported lost near ${n.otherSuburb} looks similar to the animal you found. Please review it — AI suggestions can be wrong.`;
  return { title, body };
}

export function matchNoticeEmail(n: MatchNotice, appName: string) {
  const { title, body } = matchNoticeText(n);
  const review = n.hasAccount
    ? `Review the possible match: ${n.link}`
    : `Review it using the private manage link you saved when you made your report. You can also view the other report here: ${n.link}`;
  const text = [
    title,
    "",
    body,
    "",
    review,
    "",
    "Important: this is an automated suggestion based on photos and descriptions. It doesn't prove it's the same animal or who owns it. Councils, vets and shelters confirm ownership, for example by microchip.",
    "",
    `Stop these emails: ${n.unsubscribeUrl}`,
    `— ${appName}`,
  ].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#102b2d;max-width:560px">
<h1 style="font-size:22px;color:#0e4a4f">${escapeHtml(title)}</h1>
<p>${escapeHtml(body)}</p>
<p><a href="${escapeHtml(n.link)}" style="display:inline-block;background:#0e4a4f;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">${
    n.hasAccount ? "Review possible match" : "View the other report"
  }</a></p>
${n.hasAccount ? "" : "<p>To see all suggestions, open the private manage link you saved when you made your report.</p>"}
<p style="font-size:14px;color:#4d6466">This is an automated suggestion based on photos and descriptions. It doesn't prove it's the same animal or who owns it. Councils, vets and shelters confirm ownership, for example by microchip.</p>
<p style="font-size:13px;color:#4d6466"><a href="${escapeHtml(n.unsubscribeUrl)}">Stop these emails</a> · ${escapeHtml(appName)}</p>
</div>`;
  return { subject: title, text, html };
}
