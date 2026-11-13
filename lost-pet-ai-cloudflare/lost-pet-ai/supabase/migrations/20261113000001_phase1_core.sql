-- =====================================================================
-- Lost Pet AI — Phase 1 core schema
-- Run in the Supabase SQL editor (or `npx supabase db push`).
--
-- Privacy design:
--   * pet_reports       -> public, non-identifying information only
--                          (approximate ~500 m location, no contact details)
--   * report_private    -> exact location, contact details, microchip number.
--                          Only the report's owner and admins can read it.
--   * report_messages   -> messages sent to a reporter. The sender's contact
--                          details are only visible to the report's owner.
-- All anonymous writes (found reports from people without accounts, messages,
-- flags, partner applications) go through server API routes that validate
-- input and apply rate limits before using the service role.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Types ----------------------------------------------------
create type public.user_role         as enum ('user', 'partner', 'admin');
create type public.report_kind       as enum ('lost', 'found');
create type public.report_status     as enum ('active', 'reunited', 'closed');
create type public.moderation_state  as enum ('visible', 'hidden');
create type public.species           as enum ('dog', 'cat');
create type public.pet_size          as enum ('small', 'medium', 'large', 'unknown');
create type public.pet_sex           as enum ('male', 'female', 'unknown');
create type public.age_group         as enum ('baby', 'young', 'adult', 'senior', 'unknown');
create type public.animal_location   as enum ('with_finder', 'with_vet', 'with_shelter', 'with_council', 'not_contained');
create type public.reporter_type     as enum ('owner', 'finder', 'partner');
create type public.contact_method    as enum ('email', 'phone', 'either');

-- ---------- Organisations (vets, shelters, councils) -----------------
create table public.organisations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 120),
  org_type    text not null check (org_type in ('vet_clinic', 'animal_shelter', 'council', 'rescue_group', 'other')),
  suburb      text check (char_length(suburb) <= 60),
  website     text check (char_length(website) <= 200),
  verified    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------- Profiles (one per auth user) -----------------------------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  display_name     text check (char_length(display_name) <= 80),
  role             public.user_role not null default 'user',
  organisation_id  uuid references public.organisations (id) on delete set null,
  created_at       timestamptz not null default now()
);

-- Helper functions used by row-level security policies.
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_partner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    join public.organisations o on o.id = p.organisation_id
    where p.id = auth.uid() and p.role in ('partner', 'admin') and o.verified
  );
$$;

-- Create a profile automatically when someone signs up. Role is always 'user';
-- only an admin (via the server) can promote someone.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Pet reports (public part) --------------------------------
create table public.pet_reports (
  id                  uuid primary key default gen_random_uuid(),
  kind                public.report_kind not null,
  status              public.report_status not null default 'active',
  moderation          public.moderation_state not null default 'visible',
  species             public.species not null,
  pet_name            text check (char_length(pet_name) <= 60),
  breed               text check (char_length(breed) <= 80),
  primary_colour      text not null check (char_length(primary_colour) between 1 and 40),
  secondary_colour    text check (char_length(secondary_colour) <= 40),
  size                public.pet_size not null default 'unknown',
  age_group           public.age_group not null default 'unknown',
  sex                 public.pet_sex not null default 'unknown',
  desexed             boolean,
  collar_description  text check (char_length(collar_description) <= 200),
  markings            text check (char_length(markings) <= 500),
  description         text check (char_length(description) <= 2000),
  event_at            timestamptz not null,           -- last seen (lost) / found (found)
  suburb              text not null check (char_length(suburb) between 2 and 60),
  postcode            text check (postcode ~ '^[0-9]{4}$'),
  public_lat          double precision not null check (public_lat between -44 and -10),
  public_lng          double precision not null check (public_lng between 112 and 154),
  animal_location     public.animal_location,          -- found reports: where the animal is now
  reporter_type       public.reporter_type not null,
  owner_id            uuid references auth.users (id) on delete set null,
  organisation_id     uuid references public.organisations (id) on delete set null,
  microchip_checked   boolean,
  is_demo             boolean not null default false,
  reunited_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint found_has_animal_location check (kind = 'lost' or animal_location is not null),
  constraint lost_has_owner check (kind = 'found' or owner_id is not null or is_demo),
  constraint event_not_in_future check (event_at <= created_at + interval '1 day')
);

create index pet_reports_public_idx on public.pet_reports (kind, species, status, event_at desc)
  where moderation = 'visible';
create index pet_reports_owner_idx on public.pet_reports (owner_id);
create index pet_reports_suburb_idx on public.pet_reports (lower(suburb));

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

create trigger pet_reports_touch before update on public.pet_reports
  for each row execute function public.touch_updated_at();

-- ---------- Private report details -----------------------------------
create table public.report_private (
  report_id          uuid primary key references public.pet_reports (id) on delete cascade,
  exact_lat          double precision check (exact_lat between -44 and -10),
  exact_lng          double precision check (exact_lng between 112 and 154),
  location_notes     text check (char_length(location_notes) <= 300),
  contact_name       text check (char_length(contact_name) <= 80),
  contact_email      text check (char_length(contact_email) <= 254),
  contact_phone      text check (char_length(contact_phone) <= 20),
  preferred_contact  public.contact_method not null default 'email',
  microchip_number   text check (microchip_number ~ '^[0-9]{9,15}$'),
  manage_token_hash  text,     -- SHA-256 of the secret "manage link" token for people without accounts
  created_at         timestamptz not null default now()
);

-- ---------- Photos ---------------------------------------------------
create table public.report_photos (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.pet_reports (id) on delete cascade,
  storage_path  text not null unique,
  position      smallint not null default 0 check (position between 0 and 9),
  width         integer,
  height        integer,
  created_at    timestamptz not null default now()
);
create index report_photos_report_idx on public.report_photos (report_id, position);

-- ---------- Messages to a reporter (privacy-safe contact) ------------
create table public.report_messages (
  id               uuid primary key default gen_random_uuid(),
  report_id        uuid not null references public.pet_reports (id) on delete cascade,
  sender_user_id   uuid references auth.users (id) on delete set null,
  sender_name      text not null check (char_length(sender_name) between 1 and 80),
  sender_email     text check (char_length(sender_email) <= 254),
  sender_phone     text check (char_length(sender_phone) <= 20),
  body             text not null check (char_length(body) between 10 and 2000),
  consent_to_share boolean not null check (consent_to_share),
  read_at          timestamptz,
  created_at       timestamptz not null default now(),
  constraint message_has_contact check (sender_email is not null or sender_phone is not null)
);
create index report_messages_report_idx on public.report_messages (report_id, created_at desc);

-- ---------- Moderation flags -----------------------------------------
create table public.moderation_flags (
  id               uuid primary key default gen_random_uuid(),
  report_id        uuid not null references public.pet_reports (id) on delete cascade,
  reason           text not null check (reason in ('wrong_information', 'suspected_scam', 'inappropriate', 'duplicate', 'already_reunited', 'other')),
  details          text check (char_length(details) <= 1000),
  flagged_by       uuid references auth.users (id) on delete set null,
  status           text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by      uuid references auth.users (id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now()
);

-- ---------- Partner applications -------------------------------------
create table public.partner_applications (
  id                 uuid primary key default gen_random_uuid(),
  organisation_name  text not null check (char_length(organisation_name) between 2 and 120),
  organisation_type  text not null check (organisation_type in ('vet_clinic', 'animal_shelter', 'council', 'rescue_group', 'other')),
  contact_name       text not null check (char_length(contact_name) between 2 and 80),
  email              text not null check (char_length(email) <= 254),
  phone              text check (char_length(phone) <= 20),
  suburb             text check (char_length(suburb) <= 60),
  website            text check (char_length(website) <= 200),
  message            text check (char_length(message) <= 2000),
  status             text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  organisation_id    uuid references public.organisations (id) on delete set null,
  reviewed_by        uuid references auth.users (id) on delete set null,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now()
);

-- ---------- General contact form -------------------------------------
create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  email       text not null check (char_length(email) <= 254),
  subject     text not null check (char_length(subject) between 2 and 120),
  message     text not null check (char_length(message) between 10 and 4000),
  handled     boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------- Rate limiting (works across serverless instances) --------
create table public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (key, window_start)
);

-- Returns true if the action is allowed, false if the limit is exceeded.
create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  -- opportunistic clean-up of old windows
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_max;
end;
$$;

-- =====================================================================
-- Privileges and row-level security
-- =====================================================================
alter table public.organisations        enable row level security;
alter table public.profiles             enable row level security;
alter table public.pet_reports          enable row level security;
alter table public.report_private       enable row level security;
alter table public.report_photos        enable row level security;
alter table public.report_messages      enable row level security;
alter table public.moderation_flags     enable row level security;
alter table public.partner_applications enable row level security;
alter table public.contact_messages     enable row level security;
alter table public.rate_limits          enable row level security;

-- Start from "no access" for browser roles, then grant precisely.
revoke all on all tables in schema public from anon, authenticated;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;

-- Organisations: anyone can see verified organisations; admins see all.
grant select on public.organisations to anon, authenticated;
create policy "verified organisations are public" on public.organisations
  for select using (verified or public.is_admin());

-- Profiles: you can read your own profile and change your display name only.
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
create policy "read own profile" on public.profiles
  for select using (id = auth.uid() or public.is_admin());
create policy "update own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Pet reports: visible reports are public. Owners see and edit their own.
grant select on public.pet_reports to anon, authenticated;
grant insert on public.pet_reports to authenticated;
grant update (status, reunited_at, pet_name, breed, primary_colour, secondary_colour, size,
              age_group, sex, desexed, collar_description, markings, description,
              animal_location, microchip_checked)
  on public.pet_reports to authenticated;
grant delete on public.pet_reports to authenticated;

create policy "public can read visible reports" on public.pet_reports
  for select using (moderation = 'visible' or owner_id = auth.uid() or public.is_admin());
create policy "signed-in users create their own reports" on public.pet_reports
  for insert to authenticated with check (
    owner_id = auth.uid()
    and is_demo = false
    and moderation = 'visible'
    and (reporter_type <> 'partner' or public.is_partner())
  );
create policy "owners update their reports" on public.pet_reports
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners delete their reports" on public.pet_reports
  for delete to authenticated using (owner_id = auth.uid() or public.is_admin());

-- Private details: report owner and admins only.
grant select, insert, update on public.report_private to authenticated;
create policy "owner reads private details" on public.report_private
  for select using (
    public.is_admin() or exists (select 1 from public.pet_reports r where r.id = report_id and r.owner_id = auth.uid())
  );
create policy "owner inserts private details" on public.report_private
  for insert to authenticated with check (
    exists (select 1 from public.pet_reports r where r.id = report_id and r.owner_id = auth.uid())
  );
create policy "owner updates private details" on public.report_private
  for update to authenticated using (
    exists (select 1 from public.pet_reports r where r.id = report_id and r.owner_id = auth.uid())
  );

-- Photos: readable when the report is readable (the sub-select applies pet_reports RLS).
grant select on public.report_photos to anon, authenticated;
grant insert, delete on public.report_photos to authenticated;
create policy "photos follow report visibility" on public.report_photos
  for select using (exists (select 1 from public.pet_reports r where r.id = report_id));
create policy "owner adds photos" on public.report_photos
  for insert to authenticated with check (
    exists (select 1 from public.pet_reports r where r.id = report_id and r.owner_id = auth.uid())
  );
create policy "owner deletes photos" on public.report_photos
  for delete to authenticated using (
    exists (select 1 from public.pet_reports r where r.id = report_id and r.owner_id = auth.uid())
  );

-- Messages: inserted by the server only. Report owner reads them; senders read their own.
grant select on public.report_messages to authenticated;
grant update (read_at) on public.report_messages to authenticated;
create policy "owner or sender reads messages" on public.report_messages
  for select using (
    sender_user_id = auth.uid()
    or public.is_admin()
    or exists (select 1 from public.pet_reports r where r.id = report_id and r.owner_id = auth.uid())
  );
create policy "owner marks messages read" on public.report_messages
  for update to authenticated using (
    exists (select 1 from public.pet_reports r where r.id = report_id and r.owner_id = auth.uid())
  );

-- Moderation flags, partner applications, contact messages: admins read; server writes.
grant select on public.moderation_flags, public.partner_applications, public.contact_messages to authenticated;
create policy "admins read flags" on public.moderation_flags for select using (public.is_admin());
create policy "admins read partner applications" on public.partner_applications for select using (public.is_admin());
create policy "admins read contact messages" on public.contact_messages for select using (public.is_admin());

-- rate_limits: no browser access at all (no grants, no policies).

-- =====================================================================
-- Storage bucket for pet photos.
-- Uploads happen only through the server (which re-encodes images and strips
-- GPS/EXIF metadata). The bucket is public-read so photos can be shown on
-- shareable report pages and posters.
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pet-photos', 'pet-photos', true, 5242880, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;
