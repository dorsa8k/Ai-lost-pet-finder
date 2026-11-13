-- Phase 2 database tests: pgvector matching search, privacy of AI data,
-- notification de-duplication and preferences.
-- Runs after rls_test.sql (re-uses its users: alice …0a, bob …0b, admin …ad).
\set ON_ERROR_STOP 1
\set QUIET 1

-- A deterministic fake "fingerprint": a 768-number vector built from a seed.
-- Same seed (+ small noise) = same animal; different seed = different animal.
create function pg_temp.fp(seed float8, noise float8 default 0, mix_seed float8 default null, mix float8 default 0)
returns extensions.vector language sql immutable as $$
  select (array_agg(
            (1 - mix) * sin(i * seed) + noise * cos(i * 7.31)
            + case when mix_seed is null then 0 else mix * sin(i * mix_seed) end
          order by i))::extensions.vector(768)
  from generate_series(1, 768) as i
$$;

create function pg_temp.add_report(p_id uuid, p_kind public.report_kind, p_species public.species, p_lat float8, p_lng float8,
                                   p_days_ago float8, p_owner uuid default null, p_demo boolean default false,
                                   p_moderation public.moderation_state default 'visible')
returns void language sql as $$
  insert into public.pet_reports (id, kind, species, primary_colour, event_at, suburb, public_lat, public_lng,
                                  reporter_type, owner_id, is_demo, moderation, animal_location)
  values (p_id, p_kind, p_species, 'Apricot', now() - make_interval(secs => p_days_ago * 86400), 'Rowville',
          p_lat, p_lng, case when p_kind = 'lost' then 'owner'::public.reporter_type else 'finder'::public.reporter_type end,
          p_owner, p_demo, p_moderation, case when p_kind = 'found' then 'with_vet'::public.animal_location end)
$$;

create function pg_temp.add_photo(p_report uuid, p_photo uuid, p_vec extensions.vector)
returns void language sql as $$
  insert into public.report_photos (id, report_id, storage_path) values (p_photo, p_report, 'reports/' || p_report || '/' || p_photo || '.jpg');
  insert into public.photo_embeddings (photo_id, report_id, status, model, model_version, dims, embedding)
  values (p_photo, p_report, 'done', '@cf/google/embeddinggemma-2', 'test', 768, p_vec);
$$;

\o /dev/null
-- Lost dog owned by Alice, last seen 3 days ago in Rowville, two photos of the same dog.
select pg_temp.add_report('a0000000-0000-0000-0000-000000000001', 'lost', 'dog', -37.9265, 145.2335, 3, '00000000-0000-0000-0000-00000000000a');
select pg_temp.add_photo('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', pg_temp.fp(1.1));
select pg_temp.add_photo('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', pg_temp.fp(1.1, 0.15));

-- Found reports
select pg_temp.add_report('f0000000-0000-0000-0000-000000000001', 'found', 'dog', -37.9355, 145.2995, 1, '00000000-0000-0000-0000-00000000000b'); -- same dog, owned by Bob
select pg_temp.add_photo('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', pg_temp.fp(1.1, 0.25));
select pg_temp.add_report('f0000000-0000-0000-0000-000000000002', 'found', 'dog', -37.8905, 145.2490, 1);  -- lookalike
select pg_temp.add_photo('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', pg_temp.fp(2.2, 0, 1.1, 0.55));
select pg_temp.add_report('f0000000-0000-0000-0000-000000000003', 'found', 'dog', -37.9005, 145.2335, 2);  -- different dog
select pg_temp.add_photo('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', pg_temp.fp(3.3));
select pg_temp.add_report('f0000000-0000-0000-0000-000000000004', 'found', 'dog', -37.8605, 145.2855, 1);  -- no photos
select pg_temp.add_report('f0000000-0000-0000-0000-000000000005', 'found', 'cat', -37.9265, 145.2335, 1);  -- wrong species
select pg_temp.add_photo('f0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000005', pg_temp.fp(1.1));
select pg_temp.add_report('f0000000-0000-0000-0000-000000000006', 'found', 'dog', -37.9265, 145.2335, 10); -- found BEFORE it was lost
select pg_temp.add_photo('f0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000006', pg_temp.fp(1.1));
select pg_temp.add_report('f0000000-0000-0000-0000-000000000007', 'found', 'dog', -38.1499, 144.3617, 1);  -- Geelong, too far
select pg_temp.add_photo('f0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000007', pg_temp.fp(1.1));
select pg_temp.add_report('f0000000-0000-0000-0000-000000000008', 'found', 'dog', -37.9265, 145.2335, 1, null, false, 'hidden'); -- hidden
select pg_temp.add_photo('f0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000008', pg_temp.fp(1.1));
select pg_temp.add_report('f0000000-0000-0000-0000-000000000009', 'found', 'dog', -37.9265, 145.2335, 1, null, true); -- demo
select pg_temp.add_photo('f0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000009', pg_temp.fp(1.1));

\o
-- 1. The matching search ranks correctly and applies every hard filter
do $$
declare
  ids uuid[];
  top record;
begin
  select array_agg(candidate_id order by ord) into ids
  from (select candidate_id, row_number() over () as ord
        from public.match_candidates('a0000000-0000-0000-0000-000000000001')) t;
  assert ids = array[
    'f0000000-0000-0000-0000-000000000001',
    'f0000000-0000-0000-0000-000000000002',
    'f0000000-0000-0000-0000-000000000003',
    'f0000000-0000-0000-0000-000000000004'
  ]::uuid[], format('FAIL: wrong candidates/order: %s', ids);

  select * into top from public.match_candidates('a0000000-0000-0000-0000-000000000001') limit 1;
  assert top.best_similarity > 0.9, format('FAIL: same dog similarity too low: %s', top.best_similarity);
  assert top.compared_pairs = 2, 'FAIL: should compare both lost photos with the found photo';
  assert top.source_photo_id in ('b0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002');
  assert top.candidate_photo_id = 'c0000000-0000-0000-0000-000000000001';
  assert top.distance_km between 5 and 8, format('FAIL: distance %s', top.distance_km);

  assert (select best_similarity from public.match_candidates('a0000000-0000-0000-0000-000000000001')
          where candidate_id = 'f0000000-0000-0000-0000-000000000004') is null, 'FAIL: no-photo report should have null similarity';

  -- Reverse direction: the found report finds the lost report
  assert (select candidate_id from public.match_candidates('f0000000-0000-0000-0000-000000000001') limit 1)
         = 'a0000000-0000-0000-0000-000000000001', 'FAIL: reverse matching';
  -- Demo records only match demo records
  assert not exists (select 1 from public.match_candidates('f0000000-0000-0000-0000-000000000009')
                     where candidate_id = 'a0000000-0000-0000-0000-000000000001'), 'FAIL: demo matched a real report';
  -- The vector index exists
  assert exists (select 1 from pg_indexes where indexname = 'photo_embeddings_vector_idx'), 'FAIL: missing vector index';
end $$;

-- 2. Constraints on embeddings and matches
do $$ begin
  begin
    insert into public.photo_embeddings (photo_id, report_id, status) values ('c0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000004', 'done');
    raise exception 'FAIL: done without embedding accepted';
  exception when check_violation or foreign_key_violation then null; end;
  insert into public.report_matches (id, lost_report_id, found_report_id, score, visual_similarity, visual_band)
  values ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 0.9, 0.97, 'uncalibrated');
  begin
    insert into public.report_matches (lost_report_id, found_report_id, score)
    values ('a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 0.5);
    raise exception 'FAIL: duplicate match row accepted';
  exception when unique_violation then null; end;
  begin
    insert into public.report_matches (lost_report_id, found_report_id, score)
    values ('a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 1.5);
    raise exception 'FAIL: score above 1 accepted';
  exception when check_violation then null; end;

  insert into public.notifications (user_id, report_id, match_id, title, body, link)
  values ('00000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
          'Possible match', 'A found dog may match your report.', '/pets/a0000000-0000-0000-0000-000000000001/matches');
  begin
    insert into public.notifications (user_id, report_id, match_id, title, body, link)
    values ('00000000-0000-0000-0000-00000000000a', 'a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'x', 'x', '/x');
    raise exception 'FAIL: repeated notification accepted';
  exception when unique_violation then null; end;
  insert into public.notifications (user_id, report_id, match_id, title, body, link)
  values ('00000000-0000-0000-0000-00000000000b', 'f0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001',
          'Possible match', 'A lost dog may match the animal you found.', '/pets/f0000000-0000-0000-0000-000000000001/matches');
  insert into public.match_feedback (match_id, side, verdict, user_id)
  values ('d0000000-0000-0000-0000-000000000001', 'lost', 'likely_same', '00000000-0000-0000-0000-00000000000a');
  assert (select public from storage.buckets where id = 'pet-photos') = false, 'FAIL: photo bucket still public';
end $$;

-- 3. Anonymous visitors can't see any AI data
set role anon;
do $$ begin
  begin perform * from public.photo_embeddings; raise exception 'FAIL: anon read embeddings';
  exception when insufficient_privilege then null; end;
  begin perform * from public.report_matches; raise exception 'FAIL: anon read matches';
  exception when insufficient_privilege then null; end;
  begin perform * from public.notifications; raise exception 'FAIL: anon read notifications';
  exception when insufficient_privilege then null; end;
  begin perform public.match_candidates('a0000000-0000-0000-0000-000000000001'); raise exception 'FAIL: anon ran matching';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 4. Signed-in users: only their own matches and notifications
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';   -- Alice (lost report owner)
do $$ begin
  assert (select count(*) from public.report_matches) = 1, 'FAIL: alice should see her match';
  assert (select count(*) from public.notifications) = 1, 'FAIL: alice should see only her notification';
  assert (select count(*) from public.match_feedback) = 1, 'FAIL: alice should see her feedback';
  update public.notifications set read_at = now();
  begin
    update public.notifications set title = 'changed';
    raise exception 'FAIL: user edited notification text';
  exception when insufficient_privilege then null; end;
  begin perform * from public.photo_embeddings; raise exception 'FAIL: user read embeddings';
  exception when insufficient_privilege then null; end;
  begin perform public.match_candidates('a0000000-0000-0000-0000-000000000001'); raise exception 'FAIL: user ran matching directly';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.report_matches (lost_report_id, found_report_id, score)
    values ('a0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 0.99);
    raise exception 'FAIL: user created a match';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.match_feedback (match_id, side, verdict) values ('d0000000-0000-0000-0000-000000000001', 'found', 'not_same');
    raise exception 'FAIL: user wrote feedback directly';
  exception when insufficient_privilege then null; end;
  -- preferences: allowed; role: still not allowed
  update public.profiles set notify_email = false, notify_in_app = true where id = '00000000-0000-0000-0000-00000000000a';
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL: user changed own role';
  exception when insufficient_privilege then null; end;
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';   -- Bob (found report owner)
do $$ begin
  assert (select count(*) from public.report_matches) = 1, 'FAIL: bob should see the match on his found report';
  assert (select count(*) from public.notifications) = 1, 'FAIL: bob should see only his notification';
  assert (select count(*) from public.match_feedback) = 0, 'FAIL: bob should not see alice''s feedback';
end $$;

reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000cc', 'carol@example.test');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000cc';   -- Carol (unrelated)
do $$ begin
  assert (select count(*) from public.report_matches) = 0, 'FAIL: carol sees someone else''s match';
  assert (select count(*) from public.notifications) = 0, 'FAIL: carol sees someone else''s notifications';
end $$;

set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000ad';   -- Admin
do $$ begin
  assert (select count(*) from public.report_matches) = 1, 'FAIL: admin should see matches';
  assert (select count(*) from public.match_feedback) = 1, 'FAIL: admin should see feedback';
end $$;
reset role;
reset request.jwt.claim.sub;

-- 5. Deleting a report removes its AI data
delete from public.pet_reports where id = 'f0000000-0000-0000-0000-000000000001';
do $$ begin
  assert not exists (select 1 from public.photo_embeddings where report_id = 'f0000000-0000-0000-0000-000000000001'), 'FAIL: embeddings left behind';
  assert not exists (select 1 from public.report_matches where found_report_id = 'f0000000-0000-0000-0000-000000000001'), 'FAIL: match left behind';
  assert (select count(*) from public.notifications) = 0, 'FAIL: notifications left behind';
end $$;

\echo 'ALL PHASE 2 DATABASE TESTS PASSED'
