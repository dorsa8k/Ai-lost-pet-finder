
# Lost Pet AI — Phases 1–2 (MVP + AI photo matching)

A lost-and-found pet platform for Knox, Rowville and Melbourne's outer east.
People can report lost and found dogs and cats with photos, search reports, and
contact each other privately. Vets, shelters and councils get a partner portal,
and you get an admin dashboard.

> **Product name:** set `NEXT_PUBLIC_APP_NAME` in `.env.local` to rename the
> site everywhere (e.g. "PawFind AI") — no code changes needed.

**Contents**
1. [What's working in Phase 1](#1-whats-working-in-phase-1)
2. [Accounts you need to create](#2-accounts-you-need-to-create)
3. [Set up Supabase (database, logins, photo storage)](#3-set-up-supabase)
4. [Run the app on your computer](#4-run-the-app-on-your-computer)
5. [Make yourself the administrator](#5-make-yourself-the-administrator)
6. [Try every user journey](#6-try-every-user-journey)
7. [Run the tests](#7-run-the-tests)
8. [Put it online (Cloudflare)](#8-put-it-online-cloudflare)
9. [Day-to-day operation](#9-day-to-day-operation)
10. [Project structure](#10-project-structure)

**AI photo matching (Phase 2): setup, deployment, evaluation → [`docs/PHASE2_AI_MATCHING.md`](docs/PHASE2_AI_MATCHING.md)**

Also read: [`docs/COSTS.md`](docs/COSTS.md), [`docs/LIMITATIONS_AND_RISKS.md`](docs/LIMITATIONS_AND_RISKS.md),
[`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md), [`docs/PLAN.md`](docs/PLAN.md).

---

## 1. What's working in Phase 1

| Feature | Status |
|---|---|
| Home page with live recent reports and live statistics | Built |
| Sign up, log in, log out, password reset (email + password) | Built |
| Report a lost pet (account required) with up to 5 photos | Built |
| Report a found pet (no account needed) with a private manage link | Built |
| Victorian "what to do if you found a pet" guidance | Built |
| Search by lost/found, dog/cat, suburb or postcode, date, keywords | Built |
| Pet detail pages with share button | Built |
| Private messaging to reporters (contact details never public) | Built |
| Owner dashboard: reports, messages, mark reunited/closed/reopen | Built |
| Report-a-listing (moderation flags) | Built |
| Partner application form + partner portal | Built (basic) |
| Admin dashboard: stats, approve partners, moderate, set roles, read contact messages | Built |
| About, Contact, Privacy (draft), Terms (draft) | Built |
| Photo privacy: photos resized in the browser; server strips GPS/EXIF from every upload | Built and tested |
| Approximate public locations (~500 m) | Built and tested |
| Database security rules (row-level security) | Built and tested |
| AI photo matching: photo embeddings (EmbeddingGemma 2 on Workers AI), pgvector search, top-5 suggestions with reasons, feedback buttons | Built (Phase 2) — see `docs/PHASE2_AI_MATCHING.md` |
| In-app alerts and optional email alerts (Resend), with opt-out | Built (Phase 2) |
| Private photo storage, re-used photo / scam detection | Built (Phase 2) |
| Interactive map, QR posters | **Phase 3 — not built yet** |
| CSV export, error monitoring, account self-deletion | **Phase 4 — not built yet** |

Nothing on the site pretends a later-phase feature works. There are no dead buttons.

---

## 2. Accounts you need to create

All free to start. Use a password manager.

1. **Supabase** — https://supabase.com (database, logins, photo storage)
2. **GitHub** — https://github.com (stores your code; Cloudflare builds the site from it)
3. **Cloudflare** — https://dash.cloudflare.com (puts the website online, and manages your domain)
4. **Node.js** — https://nodejs.org — download and install the **LTS** version (needed only to run the app on your computer)

You'll never need to paste a secret key into a chat. Keys go only into `.env.local` (on your computer) and the Cloudflare dashboard.

---

## 3. Set up Supabase

1. In Supabase, click **New project**.
   - Name: `lost-pet-ai`
   - Region: **Sydney (ap-southeast-2)** — keeps data in Australia, which helps with privacy obligations.
   - Database password: generate one and save it in your password manager.
2. When it's ready, open **SQL Editor → New query**.
   - Open `supabase/migrations/20261113000001_phase1_core.sql` from this project in a text editor, copy **all** of it, paste it in, click **Run**. You should see "Success. No rows returned".
   - New query again: paste all of `supabase/seed.sql`, click **Run**. This adds 15 clearly-labelled fictional demo reports.
3. Open **Project Settings → API** (may be called **API Keys**). You need three values:
   - **Project URL**
   - **anon / publishable key** (safe for browsers)
   - **service_role / secret key** (**secret** — treat it like a bank password)
4. Open **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` (change to your real domain later)
   - Redirect URLs: add `http://localhost:3000/auth/callback`
5. Check **Storage**: a bucket called `pet-photos` should exist (the SQL created it).

> **Email sending note:** Supabase's built-in email (sign-up confirmation, password reset) is limited to a handful of emails per hour — fine for testing. Before launch, connect a proper email provider (Resend) under **Authentication → SMTP Settings**. That's part of Phase 3.

---

## 4. Run the app on your computer

1. Unzip the project somewhere easy, e.g. `Documents/lost-pet-ai`.
2. Open a terminal in that folder (Mac: right-click the folder in Finder → *New Terminal at Folder*; Windows: open the folder, type `cmd` in the address bar, press Enter).
3. Install everything (first time only, takes a few minutes):
   ```bash
   npm install
   ```
4. Create your settings file: copy `.env.example` to a new file called `.env.local` and fill in the three Supabase values from step 3.3, plus a long random `RATE_LIMIT_SALT`.
5. Start the app:
   ```bash
   npm run dev
   ```
6. Open http://localhost:3000 in your browser.

If a setting is missing, the pages tell you so instead of pretending to work.

> **First run:** this code was written and partly tested in a sandbox without internet access, so `npm install` and the first `npm run dev` have **never been run**. If you see an error, copy the error text (not your keys) and send it to me — first-run fixes are normal.

---

## 5. Make yourself the administrator

1. In the app, click **Sign up** and create your account. Confirm your email.
2. In Supabase **SQL Editor**, run (with your email):
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
3. Log out and back in. You'll see **Admin** in the header.

To give a vet clinic access: they apply on the **For vets & shelters** page → you approve it in Admin (after phoning the clinic on the number from its official website) → a staff member signs up → in Admin → *Users and roles*, set them to **Partner** and choose the organisation.

---

## 6. Try every user journey

| Journey | How to test it |
|---|---|
| Found pet, no account | Log out → **I've Found a Pet** → fill in, add a photo → publish → copy the private manage link → open it in a new tab → close the report |
| Lost pet | **I've Lost a Pet** → it asks you to log in → fill in with photo → publish → check **My dashboard** |
| Messaging | Log out (or use a private window) → open your lost pet report → send a message → log back in → message appears in your dashboard |
| Privacy | Open your public report page: no email, phone or microchip number should appear anywhere |
| Moderation | On any report, open **Report a problem** → submit → see it in Admin → hide the report → check it vanished from Search |
| Partner | Apply on **For vets & shelters** → approve in Admin → set a test account to Partner → open **Partner portal** |
| Demo records | Demo reports show a "Demo record" badge and refuse messages |

---

## 7. Run the tests

| Command | What it checks | Status when delivered |
|---|---|---|
| `npm test` | 49 unit tests: form validation, location privacy, manage-link security, photo cleaning, AI matching scores and explanations, notification rules, AI response handling | **All passing** (run in the build sandbox) |
| `npm run test:db` | Database security and AI matching search: Phase 1 (35 checks) + Phase 2 (vector ranking, filters, privacy of matches/alerts). Needs PostgreSQL with pgvector | **All passing** (run in the build sandbox against PostgreSQL 16). Needs PostgreSQL installed locally — optional for you |
| `npm run typecheck` | TypeScript type checking | Checked in the sandbox with stand-in library types; run it for real after `npm install` |
| `npm run test:e2e` | 15 browser tests of the main journeys and match privacy, on desktop and mobile sizes | **Written but not yet run** — needs the app running with Supabase. First run: `npx playwright install` |

For the signed-in browser tests, create a confirmed test account and run:
```bash
E2E_USER_EMAIL=test@example.com E2E_USER_PASSWORD=... npm run test:e2e
```
Use a **separate test Supabase project** for this — the tests create real records.

To run the browser tests against your live site instead: `E2E_BASE_URL=https://yourdomain.com.au npm run test:e2e`.

---

## 8. Put it online (Cloudflare)

The site runs on **Cloudflare Workers** using the OpenNext adapter. The easiest
setup is to let Cloudflare build the site straight from GitHub. It works the same
whether you use a Mac or Windows, and every change you upload goes live automatically.

### Step A — Put the code on GitHub
Create a **private** repository and upload this folder (GitHub Desktop is the
easiest way). `.env.local` is excluded automatically — never upload it.

### Step B — Make sure your domain is on Cloudflare
- **Bought through Cloudflare?** Skip this step.
- **Bought elsewhere** (e.g. a .com.au registrar)? In Cloudflare click **Add a domain**,
  choose the **Free** plan, and follow the instructions to change your domain's
  nameservers at your registrar. Wait until Cloudflare shows the domain as **Active**
  (usually under an hour, sometimes up to a day).

### Step C — Create the Worker from GitHub
Cloudflare dashboard → **Workers & Pages → Create → Import a repository** → connect
GitHub → choose your repository. Then set:

| Setting | Value |
|---|---|
| Project name | `lost-pet-ai` (must match `name` in `wrangler.jsonc`) |
| Build command | `npx opennextjs-cloudflare build` |
| Deploy command | `npx opennextjs-cloudflare deploy` |

Under **Build variables** (on the same screen, or later in *Settings → Build → Variables and secrets*), add:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_APP_NAME` | Your product name |
| `NEXT_PUBLIC_SITE_URL` | `https://yourdomain.com.au` |
| `NEXT_PUBLIC_SUPABASE_URL` | From Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | From Supabase |

The first build may fail at this point because the runtime secrets are still missing. That's expected.

### Step D — Add the runtime settings
Worker → **Settings → Variables and Secrets** → add:

| Name | Type | Value |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Text | Same as above |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Text | Same as above |
| `NEXT_PUBLIC_SITE_URL` | Text | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | From Supabase (service_role / secret key) |
| `RATE_LIMIT_SALT` | **Secret** | A long random string |

Then go to **Deployments** and click **Retry build** (or upload any small change to GitHub).

### Step E — Connect your domain
Worker → **Settings → Domains & Routes → Add → Custom domain** → enter
`yourdomain.com.au`. Add `www.yourdomain.com.au` too if you want it. Cloudflare creates the DNS
record and HTTPS certificate for you.

### Step F — Tell Supabase about your domain
Supabase → **Authentication → URL Configuration**:
- Site URL: `https://yourdomain.com.au`
- Redirect URLs: add `https://yourdomain.com.au/auth/callback` (keep the localhost one for testing)

### Step G — Check it works
Open your domain, sign up, confirm your email, and report a found pet with a
photo. If something fails, open Worker → **Observability / Logs** — the app's
logs explain what went wrong without showing personal details.

### Which Cloudflare plan?
- **Workers Free** may be enough for a quick test. It limits the app's size
  (3 MiB) and allows very little processing time per request (10 ms). If the deploy fails
  with a size error, or pages sometimes fail to load, that's the limit.
- **Workers Paid (US$5/month)** removes those problems. Switch to it before you
  demo to vets or councils. See `docs/COSTS.md`.

### Alternative: deploy from your own computer
Mac or Linux only (Windows needs WSL): run `npx wrangler login`, then `npm run deploy`.
The Git-based method above is recommended. It keeps your secret key off your
build machine and works on any computer.

### Testing the Cloudflare version locally
`npm run dev` is the fastest way to work on the site. `npm run preview` builds and runs
it inside Cloudflare's runtime on your computer, so you can catch Cloudflare-specific
problems before deploying.

## 9. Day-to-day operation

- **Check Admin daily:** new partner applications, flagged reports, contact messages.
- **Remove demo data before launch:** in Supabase SQL Editor run `delete from public.pet_reports where is_demo;`
- **Add suburbs:** edit `src/lib/suburbs.ts` (name, postcode, approximate centre, council).
- **Backups:** Supabase Pro includes daily backups. On the Free plan there are none, and projects pause after a week of inactivity.
- **Logs:** Cloudflare → Workers & Pages → lost-pet-ai → Observability. Logs never contain names, emails or phone numbers.

---

## 10. Project structure

```
src/
  app/                    Pages (each folder = a web address) and API routes
    api/                  Server endpoints: create reports, messages, flags, admin actions
    report/lost|found     The two reporting journeys
    pets/[id]             Public pet pages
    dashboard, partner/dashboard, admin   The three dashboards
  components/             Reusable UI pieces (forms, cards, header, footer)
  lib/                    Validation, privacy helpers, database access, security
  middleware.ts           Keeps logins fresh; blocks signed-out access to private pages
supabase/
  migrations/             Database structure and security rules
  seed.sql                Fictional demo data (clearly labelled)
tests/
  unit/                   Fast tests of the core logic
  db/                     Database security tests
  e2e/                    Browser tests of the user journeys
docs/                     Plan, costs, risks, launch checklist
```

**Technology:** Next.js 16 + React 19 + TypeScript + Tailwind CSS 4, hosted on Cloudflare Workers via OpenNext; Supabase (PostgreSQL, Auth, Storage); Playwright for browser tests.

**Cloudflare files:** `wrangler.jsonc` (Worker settings) and `open-next.config.ts` (adapter settings).
