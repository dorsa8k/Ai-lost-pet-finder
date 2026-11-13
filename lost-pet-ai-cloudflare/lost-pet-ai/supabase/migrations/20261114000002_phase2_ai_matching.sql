-- =====================================================================
-- Lost Pet AI — Phase 2: AI photo matching
-- Run in the Supabase SQL editor AFTER 20261113000001_phase1_core.sql.
-- Safe to run once; it only adds new things (plus makes the photo bucket private).
--
-- What this adds
--   * pgvector extension (stores AI image "fingerprints" = embeddings)
--   * photo_embeddings  -> one embedding per photo, with model id + version.
--                          Server-only: never readable from the browser.
--   * report_matches    -> AI-suggested possible matches between a lost and a
--                          found report. Only the two reporters and admins see them.
--   * match_feedback    -> "Looks like my pet / Not my pet / Unsure" answers,
--                          kept for evaluating the model.
--   * notifications     -> one alert per (report, match), never repeated.
--   * notification preferences on profiles and report_private.
--   * report_photos.content_hash -> detects re-used photos (duplicates/scams).
--   * match_candidates() -> the SQL search used by the matching engine.
--   * The pet-photos bucket becomes PRIVATE. Photos are now served through the
--     app (/photos/...), which checks the report is visible first.
-- =====================================================================

create extension if not exists vector with schema extensions;

-- ---------- Photo fingerprints ----------------------------------------
alter table public.report_photos add column if not exists content_hash text
  check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$');
create index if not exists report_photos_hash_idx on public.report_photos (content_hash);

create table public.photo_embeddings (
  photo_id       uuid primary key references public.report_photos (id) on delete cascade,
  report_id      uuid not null references public.pet_reports (id) on delete cascade,
  status         text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  model          text check (char_length(model) <= 100),
  model_version  text check (char_length(model_version) <= 100),
  dims           integer,
  embedding      extensions.vector(768),
  attempts       integer not null default 0,
  last_error     text check (char_length(last_error) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint done_has_embedding check (status <> 'done' or (embedding is not null and model is not null and dims = 768))
);
create index photo_embeddings_report_idx on public.photo_embeddings (report_id, status);
create index photo_embeddings_vector_idx on public.photo_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);
create trigger photo_embeddings_touch before update on public.photo_embeddings
  for each row execute function public.touch_updated_at();

-- ---------- Possible matches --------------------------------------------
create table public.report_matches (
  id                 uuid primary key default gen_random_uuid(),
  lost_report_id     uuid not null references public.pet_reports (id) on delete cascade,
  found_report_id    uuid not null references public.pet_reports (id) on delete cascade,
  -- Internal ranking value between 0 and 1. NOT a probability that the animals are the same.
  score              real not null check (score between 0 and 1),
  -- Best cosine similarity between any photo of each report (null if either has no analysed photos).
  visual_similarity  real check (visual_similarity between -1 and 1),
  visual_band        text check (visual_band in ('strong', 'moderate', 'weak', 'uncalibrated', 'none')),
  compared_pairs     integer not null default 0,
  distance_km        real,
  days_apart         real,
  reasons            jsonb not null default '[]'::jsonb,
  cautions           jsonb not null default '[]'::jsonb,
  lost_photo_id      uuid references public.report_photos (id) on delete set null,
  found_photo_id     uuid references public.report_photos (id) on delete set null,
  model              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (lost_report_id, found_report_id),
  constraint different_reports check (lost_report_id <> found_report_id)
);
create index report_matches_lost_idx on public.report_matches (lost_report_id, score desc);
create index report_matches_found_idx on public.report_matches (found_report_id, score desc);
create trigger report_matches_touch before update on public.report_matches
  for each row execute function public.touch_updated_at();

-- ---------- Reporter feedback on a match -------------------------------
create table public.match_feedback (
  id          uuid primary key default gen_random_uuid(),
  match_id    uuid not null references public.report_matches (id) on delete cascade,
  side        text not null check (side in ('lost', 'found')),
  verdict     text not null check (verdict in ('likely_same', 'not_same', 'unsure')),
  user_id     uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (match_id, side)
);
create trigger match_feedback_touch before update on public.match_feedback
  for each row execute function public.touch_updated_at();

-- ---------- Notifications ---------------------------------------------
create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete cascade,  -- null for reporters without an account
  report_id     uuid not null references public.pet_reports (id) on delete cascade,
  match_id      uuid references public.report_matches (id) on delete cascade,
  kind          text not null default 'possible_match' check (kind in ('possible_match')),
  title         text not null check (char_length(title) <= 160),
  body          text not null check (char_length(body) <= 600),
  link          text not null check (char_length(link) <= 300),
  read_at       timestamptz,
  email_status  text not null default 'not_sent' check (email_status in ('not_sent', 'sent', 'skipped', 'failed')),
  emailed_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (report_id, match_id)   -- the same match never notifies the same report twice
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------- Notification preferences -------------------------------------
alter table public.profiles add column if not exists notify_in_app boolean not null default true;
alter table public.profiles add column if not exists notify_email boolean not null default true;
alter table public.report_private add column if not exists notify_email boolean not null default true;

-- =====================================================================
-- Matching search (called by the server with the service role only)
-- Returns candidate reports of the opposite kind with the best photo
-- similarity. Hard filters: same species, active + visible, within
-- p_max_km (approximate public locations), sensible date order, and real
-- reports never match fictional demo records (and vice versa).
-- =====================================================================
create or replace function public.match_candidates(
  p_report_id uuid,
  p_max_km double precision default 40,
  p_max_days integer default 180,
  p_limit integer default 50
)
returns table (
  candidate_id uuid,
  best_similarity real,
  mean_best_similarity real,
  source_photo_id uuid,
  candidate_photo_id uuid,
  compared_pairs integer,
  distance_km real
)
language sql stable security definer set search_path = public, extensions as $$
  with src as (
    select * from public.pet_reports where id = p_report_id
  ),
  cands as (
    select c.id,
           (2 * 6371 * asin(sqrt(
              power(sin(radians(c.public_lat - s.public_lat) / 2), 2) +
              cos(radians(s.public_lat)) * cos(radians(c.public_lat)) *
              power(sin(radians(c.public_lng - s.public_lng) / 2), 2)
           )))::real as km
    from public.pet_reports c
    cross join src s
    where c.id <> s.id
      and c.kind <> s.kind
      and c.species = s.species
      and c.status = 'active'
      and c.moderation = 'visible'
      and c.is_demo = s.is_demo
      and abs(extract(epoch from (c.event_at - s.event_at))) <= p_max_days * 86400
      -- an animal can't be found (much) before it went missing
      and case when s.kind = 'lost' then c.event_at >= s.event_at - interval '2 days'
               else c.event_at <= s.event_at + interval '2 days' end
  ),
  near as (
    select * from cands where km <= p_max_km
  ),
  pairs as (
    select ce.report_id as cid, se.photo_id as sp, ce.photo_id as cp,
           (1 - (se.embedding <=> ce.embedding))::real as sim
    from public.photo_embeddings se
    join public.photo_embeddings ce
      on ce.report_id in (select id from near)
     and ce.status = 'done'
     and ce.model = se.model
    where se.report_id = p_report_id
      and se.status = 'done'
  ),
  best_per_source_photo as (
    select cid, sp, max(sim) as best from pairs group by cid, sp
  ),
  agg as (
    select cid, max(best) as best_sim, avg(best)::real as mean_best from best_per_source_photo group by cid
  ),
  best_pair as (
    select distinct on (cid) cid, sp, cp from pairs order by cid, sim desc
  ),
  pair_counts as (
    select cid, count(*)::integer as n from pairs group by cid
  )
  select n.id, a.best_sim, a.mean_best, bp.sp, bp.cp, coalesce(pc.n, 0), n.km
  from near n
  left join agg a on a.cid = n.id
  left join best_pair bp on bp.cid = n.id
  left join pair_counts pc on pc.cid = n.id
  order by a.best_sim desc nulls last, n.km asc
  limit greatest(1, least(p_limit, 200));
$$;

-- =====================================================================
-- Privileges and row-level security
-- (Supabase grants new tables to browser roles by default — revoke first.)
-- =====================================================================
alter table public.photo_embeddings enable row level security;
alter table public.report_matches   enable row level security;
alter table public.match_feedback   enable row level security;
alter table public.notifications    enable row level security;

revoke all on public.photo_embeddings, public.report_matches, public.match_feedback, public.notifications
  from anon, authenticated;
revoke execute on function public.match_candidates(uuid, double precision, integer, integer)
  from public, anon, authenticated;

-- Embeddings: server only (no grants, no policies).

-- Matches: visible only to the owner of either report, and admins.
grant select on public.report_matches to authenticated;
create policy "reporters read their own matches" on public.report_matches
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.pet_reports r
               where r.id in (lost_report_id, found_report_id) and r.owner_id = auth.uid())
  );

-- Feedback: you can read your own; admins read all. Written by the server.
grant select on public.match_feedback to authenticated;
create policy "read own feedback" on public.match_feedback
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- Notifications: your own only; you may mark them read.
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy "read own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "mark own notifications read" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Users may change their own notification preferences (and display name, as before).
grant update (display_name, notify_in_app, notify_email) on public.profiles to authenticated;

-- =====================================================================
-- Make the photo bucket private. The app serves photos through /photos/…,
-- which only returns a photo when its report is visible to the viewer.
-- =====================================================================
update storage.buckets set public = false where id = 'pet-photos';
