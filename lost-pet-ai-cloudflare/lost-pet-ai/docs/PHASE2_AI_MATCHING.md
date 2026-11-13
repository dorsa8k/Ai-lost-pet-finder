# Phase 2 — AI photo matching

## How it works (plain English)
1. Someone reports a lost or found pet with photos. Photos are cleaned (GPS
   removed) and stored in a **private** Supabase bucket.
2. Straight after the report is saved, each photo is sent to **Google
   EmbeddingGemma 2** running on **Cloudflare Workers AI**. The model turns the
   photo into a list of 768 numbers (an *embedding*). Photos that look alike get
   similar lists. Only the image is sent — no text — so these are genuine visual
   embeddings. The model id, version and embedding are saved for each photo.
3. The database (Supabase + **pgvector**) compares the new report's photos with
   photos of nearby reports of the **opposite kind** (lost ↔ found), **same
   species**, at **sensible dates** (an animal can't be found well before it went
   missing), within 40 km. Every photo is compared with every photo.
4. The best photo similarity is combined with colour, size, distance, timing and
   shared words in markings/collar/breed. The top 10 are saved and the top 5 are
   shown, each with plain-English reasons and things to check.
5. If a suggestion is promising, the reporter gets an in-app alert and, if email
   is set up, an email — once per match, never repeated, and they can turn
   alerts off.
6. Every new report re-checks older ones, so matching continues as new reports arrive.

## What the AI can and can't do
- EmbeddingGemma 2 is a **general-purpose** image model. It's good at "same kind
  of animal, same colours and look". It was not trained specifically to tell
  apart two individual lookalike animals.
- So results are always labelled **AI suggestions — possible matches that need
  human checking**. Scores are used only for ordering and are never shown as
  percentages. "Strong / some / weak resemblance" labels only appear after you
  have calibrated the thresholds with the evaluation script (below). Until then,
  users see the ranking and the reasons only.
- A photo match never proves ownership. Councils, vets and shelters confirm it
  (for example by microchip), and the app says so on every match.

## Safety features
- Embeddings, matches, feedback and notifications are protected by row-level
  security: only the two reporters (and admins) can see a match. Embeddings are
  never readable from the browser at all.
- Photos are served through `/photos/...`, which checks the report is visible.
  Hiding a report now hides its photos too.
- **Re-used photos** are detected by fingerprinting the image file. A found
  report that re-uses a lost report's photo (a known reward scam) is
  automatically flagged to moderators as a suspected scam and never shown as a
  match. Re-used photos within the same kind are flagged as duplicates.
- Fictional demo records only ever match other demo records.
- Users can answer "Looks like my pet / Not my pet / Unsure". "Not my pet"
  hides the suggestion and stops alerts about it. Answers are stored for evaluation.

## Deployment steps (do them in this order, on the same day)
1. **Supabase → SQL Editor → New snippet:** paste all of
   `supabase/migrations/20261114000002_phase2_ai_matching.sql` and click **Run**.
   Expect "Success. No rows returned".
   *Note: this makes the photo bucket private, so photos won't display on the
   live site until step 2 is deployed.*
2. **Upload the changed files to GitHub** (list below). Cloudflare rebuilds
   automatically. The Workers AI connection is set in `wrangler.jsonc`, so
   there's no key to add.
3. **Check it works:** report a found pet with a photo → open its matches page
   from the private manage link. Within about a minute the status should say
   "All 1 photo analysed". In **Admin → AI photo matching**, "Photo analysis"
   should say **on**.
4. **Run matching for the existing reports:** Admin → **Re-run matching for
   recent reports** (and **Retry photo analysis** if any photos are waiting).
5. *(Optional)* **Email alerts** — see below.
6. *(Later)* **Evaluate and calibrate** — see below.

## New environment variables
None are required. Everything below is optional. Add them in Cloudflare →
Worker → **Settings → Variables and Secrets** (runtime). None are needed as
build variables. Existing secrets are not changed.

| Name | Type | Purpose |
|---|---|---|
| `RESEND_API_KEY` | Secret | Turns on email alerts (Resend) |
| `EMAIL_FROM` | Text | Sender, e.g. `Lost Pet AI <alerts@lostpetfinder.com.au>` (domain must be verified in Resend) |
| `NOTIFICATION_SIGNING_SECRET` | Secret | Signs "stop these emails" links. If unset, `RATE_LIMIT_SALT` is used |
| `MATCH_VISUAL_STRONG` / `MATCH_VISUAL_MODERATE` | Text | Similarity thresholds from the evaluation report. Resemblance labels appear only when both are set |
| `MATCH_VISUAL_FLOOR` / `MATCH_VISUAL_CEIL` | Text | How photo similarity is scaled for ranking (defaults 0.5 / 0.95) |
| `MATCH_NOTIFY_MIN_SCORE` | Text | Minimum ranking score before alerts (default 0.55) |
| `MATCH_MAX_DISTANCE_KM` | Text | Search radius (default 40) |
| `EMBEDDING_MODEL_VERSION` | Text | Version label saved with each embedding (default `workers-ai/embeddinggemma-2@2026-11-12`) |
| `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_AI_API_TOKEN` | Secret | Only for the evaluation script, or local development without wrangler. Not needed on Cloudflare |

**Cloudflare binding** (in `wrangler.jsonc`, not a variable): `"ai": { "binding": "AI" }`.

## Email alerts (optional, free tier)
1. Create a free account at resend.com → **Domains → Add domain** →
   `lostpetfinder.com.au`. Add the DNS records Resend shows in Cloudflare → your
   domain → **DNS**, and wait for "Verified".
2. Resend → **API Keys → Create** (sending access).
3. Cloudflare Worker → Settings → Variables and Secrets: add `RESEND_API_KEY`
   (Secret) and `EMAIL_FROM` (Text), e.g. `Lost Pet AI <alerts@lostpetfinder.com.au>`.
Without these, alerts still appear in people's accounts; nothing pretends an
email was sent.

## Evaluating accuracy (Recall@5 and false matches)
1. Collect photos you have **consent or a licence** to use: several photos
   of the same pet taken at different times, places and lighting. Friends' and
   family's pets work well, with their permission. Aim for 50+ pets, and
   include lookalikes (several apricot cavoodles, several black cats).
   Put them in `eval-photos/dog/<pet-name>/` and `eval-photos/cat/<pet-name>/`.
   Single photos of other lookalike animals can go in `eval-photos/dog/_distractors/`.
2. In Cloudflare: **My Profile → API Tokens → Create token** with the
   *Workers AI: Read* permission. Copy your Account ID from the Workers overview page.
3. On your computer, in the project folder:
   ```bash
   npm install
   CLOUDFLARE_ACCOUNT_ID=xxx CLOUDFLARE_AI_API_TOKEN=yyy npm run evaluate -- eval-photos
   ```
   (Windows PowerShell: `$env:CLOUDFLARE_ACCOUNT_ID="xxx"; $env:CLOUDFLARE_AI_API_TOKEN="yyy"; npm run evaluate -- eval-photos`)
4. Read `eval-report.md`: Recall@1/5/10, false-match rates and suggested
   `MATCH_VISUAL_*` settings. Add those in Cloudflare only if the test set was
   big and realistic. Never describe the system as identifying individual
   animals unless the report supports it.

## Tests
| Command | Covers | Status at delivery |
|---|---|---|
| `npm test` | 49 unit tests, including 21 new: scoring, explanations, notification rules, AI response parsing, error handling, email wording, signed unsubscribe links | **All passing** (sandbox) |
| `npm run test:db` | Phase 1 + Phase 2 database tests: vector search ranking and all hard filters, RLS on matches/notifications/embeddings, de-duplication, cascade deletes | **All passing** (sandbox, PostgreSQL 16 + pgvector 0.8 built from source) |
| `npm run test:e2e` | Adds 5 browser tests: match privacy, rematch/feedback permissions, photo route, forged unsubscribe links, found-report → matches page | Written, **not yet run** |
| `npm run evaluate -- --mock` | Checks the evaluation script itself (not the AI) | Ran on synthetic images |

**Not verified in the sandbox (no Cloudflare access):** a real call to
EmbeddingGemma 2. The request format follows Cloudflare's published example,
and the response reader accepts every documented embedding format. If the live
model answers in an unexpected format, photos show as "failed" with a clear
error in the logs and on the admin page — nothing is faked.

## Changed files
New:
```
supabase/migrations/20261114000002_phase2_ai_matching.sql
src/lib/ai/embedding-core.ts
src/lib/ai/embeddings.ts
src/lib/matching/score.ts
src/lib/matching/engine.ts
src/lib/matching/access.ts
src/lib/notify/email.ts
src/lib/notify/templates.ts
src/lib/notify/unsubscribe.ts
src/components/MatchResults.tsx
src/app/pets/[id]/matches/page.tsx
src/app/notifications/page.tsx
src/app/unsubscribe/page.tsx
src/app/photos/[...path]/route.ts
src/app/api/reports/[id]/matches/route.ts
src/app/api/reports/[id]/rematch/route.ts
src/app/api/matches/[id]/feedback/route.ts
src/app/api/notifications/route.ts
src/app/api/account/notifications/route.ts
src/app/api/unsubscribe/route.ts
src/app/api/admin/ai/route.ts
scripts/evaluate-matching.ts
tests/unit/matching.test.ts
tests/db/phase2_test.sql
tests/e2e/matching.spec.ts
docs/PHASE2_AI_MATCHING.md
.gitignore            (was missing from GitHub)
.env.example          (was missing from GitHub)
```
Changed:
```
wrangler.jsonc                       Workers AI binding
next.config.ts                       Cloudflare bindings in local dev
package.json                         "evaluate" script
src/app/api/reports/route.ts         queue photos for AI, photo fingerprints, run matching after saving
src/app/api/manage/[id]/route.ts     email alert on/off for people without accounts
src/lib/config.ts                    photos served via /photos (private bucket)
src/app/pets/[id]/page.tsx           "See possible matches" for owners; absolute photo URL for link previews
src/app/report/submitted/[id]/page.tsx   matching status and link
src/app/dashboard/page.tsx           "Possible matches" button per report
src/app/admin/page.tsx               AI status, statistics, retry and re-run buttons
src/app/page.tsx                     honest live status of photo matching
src/components/SiteHeader.tsx        Alerts link with unread count
src/components/ManageReport.tsx      matches link and email toggle
src/components/Notices.tsx           setup message mentions Cloudflare settings
scripts/test-db.sh, tests/db/supabase_stub.sql   run the Phase 2 database tests
README.md, docs/COSTS.md, docs/LIMITATIONS_AND_RISKS.md, docs/PLAN.md, .env.example
```
