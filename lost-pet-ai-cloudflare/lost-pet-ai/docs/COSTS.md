# Estimated monthly operating costs (AUD)

Prices are in US dollars on the providers' sites. They're converted here at about
**US$1 = A$1.45** (November 2026, rounded to cover exchange movement and card fees).
Check the current pricing pages before committing. Prices exclude GST.

## Stage 1 — Building and demonstrating (now)
| Item | Plan | Monthly |
|---|---|---|
| Supabase | Free (2 projects, 500 MB database, pauses after 7 days idle, no backups) | A$0 |
| Cloudflare Workers | Free (100,000 requests/day; small app-size and processing limits) — or Paid from the start | A$0 (or ~A$7) |
| Resend email (Phase 3) | Free: 3,000 emails/month, 100/day | A$0 |
| AI embedding service (Phase 2) | Pay-per-use, scale-to-zero | ~A$0–10 |
| Domain name | You already own it | ~A$2–3 |
| **Total** | | **~A$3–20** |

## Stage 2 — Public launch in Knox
| Item | Plan | Monthly |
|---|---|---|
| Supabase | Pro: US$25 (8 GB database, 100 GB files, daily backups, no pausing) | ~A$36 |
| Cloudflare Workers | Paid: US$5 (10M requests + 30M CPU-ms included, then usage-based) | ~A$7 |
| Resend | Free until >100 emails/day, then Pro US$20 (50,000 emails) | A$0–29 |
| AI embedding service | Low volume, scale-to-zero CPU inference | ~A$0–30 |
| Domain | | ~A$3 |
| **Total** | | **~A$46–105** |

## What makes costs grow
- **Photos and traffic**: Supabase Pro includes 250 GB/month of outbound data,
  then about US$0.09/GB. Thumbnails are used in lists to keep this low.
- **Email volume**: match alerts to many users. Resend's paid tiers scale per email.
- **AI**: cost per photo is tiny, but an always-on GPU would be ~A$100s/month. The
  plan avoids this.
- **Cloudflare usage**: past the included 10 million requests or 30 million CPU-milliseconds a month, Workers Paid charges small overage fees. Pilot traffic is far below this.
- **Cloudflare is cheaper than Vercel Pro** (US$5 vs US$20/month) and has no per-seat charge, which saves roughly A$22 a month.

## Possibly free or discounted
Startup and non-profit programs from these providers change often. Ask each
provider directly when you're ready to launch.
