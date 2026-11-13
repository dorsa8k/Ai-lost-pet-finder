# Implementation plan and architecture

## Key product decision: work with Victorian law
In Victoria, someone who finds a lost dog or cat must take it to the local
council, a participating vet or an animal shelter as soon as reasonably possible.
Agriculture Victoria warns that reuniting an animal directly with its owner
instead of following this process can lead to a fine. The platform therefore:
- guides finders to council, vets and shelters first;
- records where a found animal is now ("at a vet", "with the council"…);
- never encourages finder-to-owner handovers, and states on every report that a
  photo or a match doesn't prove ownership.

This makes councils, vets and shelters natural partners: the platform sends
owners to them sooner.

## Architecture

```
Browser (mobile-first Next.js pages)
   │
   ▼
Next.js on Cloudflare Workers (OpenNext) ── server routes validate input, rate-limit, strip photo GPS
   │                  (service-role key only on the server)
   ▼
Supabase (Sydney region)
   ├─ PostgreSQL ── row-level security on every table
   │     pet_reports (public facts, ~500 m approximate location)
   │     report_private (contact details, exact location, microchip)  ← owner/admin only
   │     report_messages, moderation_flags, partner_applications, organisations, profiles
   ├─ Auth (email + password)
   └─ Storage (pet-photos bucket; re-encoded JPEGs only)

Phase 2 adds:
   Embedding service (Python, CLIP/SigLIP, CPU) ──► pgvector column + similarity search
Phase 3 adds:
   Resend (email), Leaflet + OpenStreetMap (map), QR posters
```

### Why these choices
- **Supabase**: database, logins and file storage in one service with a free
  tier, Sydney hosting, and database-level security rules.
- **Server-side writes**: anonymous submissions (found reports, messages, flags)
  go through server routes that validate, rate-limit and log before writing.
- **Approximate locations**: snapped to a ~500 m grid plus random offset; exact
  points stay in the private table.
- **Hosting**: Cloudflare Workers via the OpenNext adapter. It's cheaper than Vercel Pro
  (US$5 vs US$20/month), and the domain and DNS sit in the same place.
- **Photos**: resized and re-saved in the browser (fast on mobile data), then
  checked on the server, which strips all metadata (GPS, EXIF) in plain JavaScript
  because Workers can't run native image libraries.

## Phase 2 — AI matching (built — see docs/PHASE2_AI_MATCHING.md)
Original plan, kept for reference:
1. Benchmark 2–3 open models (CLIP ViT-B/32, SigLIP base, a pet re-identification
   model if a suitably licensed one exists) on a labelled, licensed test set of
   same-animal photo pairs. Report Recall@5 and Recall@10.
2. Deploy the winner as a small, separate service that sleeps when idle
   (candidates: Cloudflare Workers AI, Modal, Hugging Face Inference Endpoints).
   Cost target: under A$30/month at pilot volume. Model weights are too large to
   run inside the website's own Worker.
3. Add `vector` columns via pgvector, embed every photo on upload, and back-fill
   existing photos.
4. Rank candidates by combining visual similarity with species (hard filter),
   colour/size agreement, distance and date order (found after lost).
5. Match results page with "Looks like my pet / Not my pet / Unsure" feedback,
   stored for evaluation.
6. Label results as possible matches needing human confirmation. Don't present
   scores as probabilities.

## Phase 3 — Community features
Interactive Leaflet map (approximate pins, filters, radius), map location picker
on the report form, email notifications via Resend (with consent and de-duplication),
richer secure messaging (two-way threads), QR-code printable posters, fuller partner dashboard.

## Phase 4 — Launch readiness
Admin moderation tooling, account self-deletion and data export, anonymised CSV
export for grants, analytics (time-to-reunion), error monitoring (e.g. Sentry),
end-to-end tests in CI, legal/privacy review, performance and accessibility audit.
