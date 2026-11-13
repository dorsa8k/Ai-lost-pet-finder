# Current limitations and risks (end of Phase 1)

## What hasn't been verified yet
- **The app has not been installed or run.** It was built in a sandbox with no
  internet access, so `npm install`, `npm run dev` and `npm run build` haven't run.
  Expect some first-run fixes.
- **Verified in the sandbox:** the database schema and 35 security checks
  (PostgreSQL 16 with a Supabase stand-in), 28 unit tests, and a TypeScript check
  of the app's own code using stand-in library types.
- **Not yet run:** the 10 browser (end-to-end) tests, and real Supabase
  Auth/Storage behaviour.

## Cloudflare hosting notes
- The Cloudflare build (`opennextjs-cloudflare build`) hasn't been run yet either.
- `middleware.ts` is used instead of Next.js 16's `proxy.ts` because the Cloudflare
  adapter doesn't support `proxy.ts` yet. Next.js shows a deprecation warning; switch
  back once OpenNext supports it.
- Photos are resized in the browser (Cloudflare can't run the `sharp` image library).
  The server still verifies every file is a real JPEG, checks its size and
  dimensions, and strips all metadata including GPS. Very old browsers that can't
  re-draw images won't be able to upload photos.
- The Workers Free plan's 3 MiB size and 10 ms processing limits may be too tight.
  Plan on Workers Paid (US$5/month) for demos and launch.
- Phase 2's AI model will run as a separate service anyway, so Cloudflare doesn't
  change the AI plan. Cloudflare's own Workers AI and Vectorize are options to evaluate then.

## Functional limitations
- No AI matching yet (Phase 2). The site says so.
- No email: people must check their dashboard or manage link for messages.
  Finders without an account must save their manage link — it can't be re-sent yet.
- One-way messages: the sender shares contact details and the reporter replies
  by email or phone outside the site.
- No map or map-based location picker yet (suburb list + optional GPS instead).
- Only 22 pilot suburbs are accepted on report forms.
- Users can't edit report details after publishing (only status). They can close and re-report.
- No self-service account or data deletion yet (handled via the Contact form).
- The admin user list shows the first 200 accounts only.
- Demo records have no photos, so they can't test AI matching. Phase 2 needs
  licensed same-animal photo pairs.

## Security and privacy risks
- **Public photo bucket**: photo URLs work for anyone who has them, even after a
  report is hidden. The URLs can't be guessed, but consider private storage with
  signed URLs before launch.
- **Spam and abuse**: rate limits are per IP. Determined abusers can rotate IPs.
  Consider CAPTCHA (e.g. Cloudflare Turnstile) on anonymous forms in Phase 4.
- **Fraudulent claims and scams**: people may pose as owners or demand rewards.
  The guidance and flagging help, but moderation load will grow with use.
- **Manage links**: anyone with a link can manage that report. Links are 256-bit
  random and stored hashed.
- **Supabase default email**: rate-limited and may land in spam. Use custom SMTP before launch.

## Legal and compliance matters needing professional review
1. **Privacy Act / Australian Privacy Principles**: whether they apply (turnover
   threshold, health or other triggers), the privacy policy, collection notices,
   overseas disclosure (US-based providers), data breach response plan.
2. **Domestic Animals Act 1994 (Vic)**: that the found-pet guidance is accurate
   and that the platform doesn't facilitate unlawful handovers.
3. **Terms of use**: liability limits, user-generated content, Australian Consumer
   Law wording, moderation rights.
4. **Photo copyright and consent**: user uploads, demo images, poster use.
5. **Partnerships**: data-sharing agreements with councils or vets before any
   integration; no use of logos without written permission.
6. **Grant reporting**: definitions of "verified reunion" and anonymisation standard for exports.
7. **Business structure and insurance**: public liability and professional
   indemnity, given the service involves animals and personal data.
