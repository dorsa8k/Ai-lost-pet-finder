# Public launch checklist

## Product
- [ ] Phase 2 AI matching live, with a published evaluation (Recall@5/@10) and clear "possible match" wording
- [ ] Phase 3 email notifications live, with consent and unsubscribe
- [ ] Map live, using approximate locations only
- [ ] Demo records deleted (`delete from public.pet_reports where is_demo;`)
- [ ] Final product name chosen; domain and email address set up

## Technical
- [ ] Supabase on Pro (backups, no pausing), Sydney region
- [ ] Cloudflare Workers Paid plan; custom domain connected with HTTPS
- [ ] Custom SMTP (Resend) for login emails; sending domain verified (SPF/DKIM)
- [ ] All variables set in Cloudflare (build variables and runtime Variables & Secrets); service-role key stored as a Secret
- [ ] Supabase Auth: production Site URL and redirect URLs; leaked-password protection on
- [ ] `npm run check`, `npm run test:db` and `npm run test:e2e` all passing
- [ ] Error monitoring connected; alerts go to your email
- [ ] CAPTCHA on anonymous forms (recommended)
- [ ] Accessibility check (keyboard only, screen reader, colour contrast)
- [ ] Tested on real iPhone and Android phones

## Legal and privacy (with professional advice)
- [ ] Privacy policy and terms reviewed by a lawyer; "draft" banners removed
- [ ] Data breach response plan written
- [ ] Process for access, correction and deletion requests
- [ ] Found-animal guidance checked against current Agriculture Victoria advice
- [ ] Insurance in place

## Operations
- [ ] Daily admin routine: flags, partner applications, contact messages
- [ ] Partner verification procedure written (call clinics on their official numbers)
- [ ] Written permission for any partner names or logos shown on the site
- [ ] Impact metrics defined (what counts as a verified reunion)
