-- Row-level security and privacy tests.
-- Each block raises an exception (and stops the run) if a rule is broken.
\set ON_ERROR_STOP 1
\set QUIET 1

-- Test users
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.test', '{"display_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.test',   '{"display_name":"Bob"}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@example.test', '{}');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000ad';

-- 1. Profiles are created automatically with role 'user'
do $$ begin
  assert (select count(*) from public.profiles) = 3, 'profiles not auto-created';
  assert (select role from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'user', 'new user should be role user';
  assert (select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'Alice', 'display name not copied';
end $$;

-- 2. Anonymous visitors
set role anon;
do $$ begin
  assert (select count(*) from public.pet_reports) = 15, 'anon should see 15 demo reports';
  begin
    perform * from public.report_private;
    raise exception 'FAIL: anon read report_private';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.pet_reports (kind, species, primary_colour, event_at, suburb, public_lat, public_lng, reporter_type, animal_location)
    values ('found', 'dog', 'Black', now(), 'Rowville', -37.9, 145.2, 'finder', 'with_finder');
    raise exception 'FAIL: anon inserted a report directly';
  exception when insufficient_privilege then null; end;
  begin
    perform * from public.report_messages;
    raise exception 'FAIL: anon read messages';
  exception when insufficient_privilege then null; end;
  begin
    perform public.check_rate_limit('x', 1, 60);
    raise exception 'FAIL: anon called rate limiter';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- 3. Alice (signed in) creates a lost report
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$
declare v_id uuid;
begin
  insert into public.pet_reports (id, kind, species, pet_name, primary_colour, event_at, suburb, public_lat, public_lng, reporter_type, owner_id)
  values ('11111111-1111-1111-1111-111111111111', 'lost', 'dog', 'Simba', 'Cream', now(), 'Rowville', -37.925, 145.235, 'owner',
          '00000000-0000-0000-0000-00000000000a');
  insert into public.report_private (report_id, exact_lat, exact_lng, contact_email, microchip_number)
  values ('11111111-1111-1111-1111-111111111111', -37.92611, 145.23422, 'alice@example.test', '956000012345678');

  -- cannot create a report on someone else's behalf
  begin
    insert into public.pet_reports (kind, species, primary_colour, event_at, suburb, public_lat, public_lng, reporter_type, owner_id)
    values ('lost', 'dog', 'Black', now(), 'Rowville', -37.9, 145.2, 'owner', '00000000-0000-0000-0000-00000000000b');
    raise exception 'FAIL: inserted report for another user';
  exception when insufficient_privilege then null; end;

  -- cannot create demo records or pose as a partner
  begin
    insert into public.pet_reports (kind, species, primary_colour, event_at, suburb, public_lat, public_lng, reporter_type, owner_id, is_demo)
    values ('lost', 'dog', 'Black', now(), 'Rowville', -37.9, 145.2, 'owner', '00000000-0000-0000-0000-00000000000a', true);
    raise exception 'FAIL: user created demo record';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.pet_reports (kind, species, primary_colour, event_at, suburb, public_lat, public_lng, reporter_type, owner_id, animal_location)
    values ('found', 'dog', 'Black', now(), 'Rowville', -37.9, 145.2, 'partner', '00000000-0000-0000-0000-00000000000a', 'with_vet');
    raise exception 'FAIL: unverified user posted as partner';
  exception when insufficient_privilege then null; end;

  -- cannot un-hide or change moderation of own report
  begin
    update public.pet_reports set moderation = 'hidden' where id = '11111111-1111-1111-1111-111111111111';
    raise exception 'FAIL: owner changed moderation column';
  exception when insufficient_privilege then null; end;

  -- cannot promote self to admin
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
    raise exception 'FAIL: user changed own role';
  exception when insufficient_privilege then null; end;
  update public.profiles set display_name = 'Alice K' where id = '00000000-0000-0000-0000-00000000000a';

  -- can read own private details
  assert (select count(*) from public.report_private) = 1, 'owner should read own private row';
  -- can mark reunited
  update public.pet_reports set status = 'reunited', reunited_at = now() where id = '11111111-1111-1111-1111-111111111111';
  update public.pet_reports set status = 'active', reunited_at = null where id = '11111111-1111-1111-1111-111111111111';
end $$;

-- 4. Bob cannot see Alice's private data or edit her report
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$
declare n int;
begin
  assert (select count(*) from public.report_private) = 0, 'FAIL: bob read alice private details';
  update public.pet_reports set pet_name = 'Hacked' where id = '11111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  assert n = 0, 'FAIL: bob updated alice report';
  assert (select count(*) from public.profiles) = 1, 'FAIL: bob can see other profiles';
  assert (select count(*) from public.pet_reports where id = '11111111-1111-1111-1111-111111111111') = 1, 'public report should be visible to bob';
end $$;
reset role;
reset request.jwt.claim.sub;

-- 5. Server (service role) writes a message and hides a report
set role service_role;
do $$ begin
  insert into public.report_messages (report_id, sender_name, sender_email, body, consent_to_share)
  values ('11111111-1111-1111-1111-111111111111', 'Finder', 'finder@example.test', 'I think I saw your dog near the park.', true);
  begin
    insert into public.report_messages (report_id, sender_name, sender_email, body, consent_to_share)
    values ('11111111-1111-1111-1111-111111111111', 'Finder', 'finder@example.test', 'No consent given here.', false);
    raise exception 'FAIL: message saved without consent';
  exception when check_violation then null; end;
  assert public.check_rate_limit('test-key', 2, 60) = true;
  assert public.check_rate_limit('test-key', 2, 60) = true;
  assert public.check_rate_limit('test-key', 2, 60) = false, 'FAIL: rate limit not enforced';
  insert into public.report_photos (report_id, storage_path) values ('11111111-1111-1111-1111-111111111111', 'reports/1111/a.jpg');
  update public.pet_reports set moderation = 'hidden' where id = '11111111-1111-1111-1111-111111111111';
end $$;
reset role;

-- 6. Hidden report: invisible to public and Bob, still visible to Alice and admin
set role anon;
do $$ begin
  assert (select count(*) from public.pet_reports where id = '11111111-1111-1111-1111-111111111111') = 0, 'FAIL: anon sees hidden report';
  assert (select count(*) from public.report_photos where report_id = '11111111-1111-1111-1111-111111111111') = 0, 'FAIL: anon sees hidden photos';
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  assert (select count(*) from public.pet_reports where id = '11111111-1111-1111-1111-111111111111') = 0, 'FAIL: bob sees hidden report';
  assert (select count(*) from public.report_messages) = 0, 'FAIL: bob reads alice messages';
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  assert (select count(*) from public.pet_reports where id = '11111111-1111-1111-1111-111111111111') = 1, 'owner should still see hidden report';
  assert (select count(*) from public.report_messages) = 1, 'owner should read message';
  update public.report_messages set read_at = now();
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000ad';
do $$ begin
  assert (select count(*) from public.pet_reports) = 16, 'admin should see all 16 reports';
  assert (select count(*) from public.report_private) = 1, 'admin should read private details';
  assert (select count(*) from public.profiles) = 3, 'admin should see all profiles';
end $$;
reset role;
reset request.jwt.claim.sub;

-- 7. Constraints
do $$ begin
  begin
    insert into public.pet_reports (kind, species, primary_colour, event_at, suburb, public_lat, public_lng, reporter_type)
    values ('lost', 'dog', 'Black', now(), 'Rowville', -37.9, 145.2, 'owner');
    raise exception 'FAIL: lost report without owner accepted';
  exception when check_violation then null; end;
  begin
    insert into public.pet_reports (kind, species, primary_colour, event_at, suburb, public_lat, public_lng, reporter_type)
    values ('found', 'dog', 'Black', now(), 'Rowville', -37.9, 145.2, 'finder');
    raise exception 'FAIL: found report without animal location accepted';
  exception when check_violation then null; end;
  begin
    insert into public.pet_reports (kind, species, primary_colour, event_at, suburb, public_lat, public_lng, reporter_type, animal_location)
    values ('found', 'dog', 'Black', now(), 'Rowville', 51.5, -0.1, 'finder', 'with_finder');
    raise exception 'FAIL: location outside Australia accepted';
  exception when check_violation then null; end;
  begin
    insert into public.report_private (report_id, microchip_number) values ('11111111-1111-1111-1111-111111111111', 'abc');
    raise exception 'FAIL: invalid microchip accepted';
  exception when check_violation or unique_violation then null; end;
end $$;

\echo 'ALL DATABASE TESTS PASSED'
