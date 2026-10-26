-- live_sessions (tuning evenings only), lots (unique per session, donor-bound), events (creator-only).
begin;
select plan(32);

create function pg_temp.err_state(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return 'no error';
exception when others then
  return sqlstate;
end $$;

create function pg_temp.exec_rows(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

insert into auth.users (id, aud, role, is_anonymous) values
  ('00000000-0000-4000-8000-000000000c01', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-000000000a01', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-000000000b01', 'authenticated', 'authenticated', true);

insert into public.devices (id, role, profile_id) values
  ('00000000-0000-4000-8000-000000000c01', 'dashboard', null),
  ('00000000-0000-4000-8000-000000000a01', 'donor', 'D01'),
  ('00000000-0000-4000-8000-000000000b01', 'donor', 'D02');

-- The dashboard phone (C) opens sessions. Donor A posts for D01. Donor B posts for D02.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-000000000c01', 'role', 'authenticated', 'is_anonymous', true)::text,
  true);
set local role authenticated;

select lives_ok(
  $$ insert into public.live_sessions (id, evening_id, policy, created_by)
     values ('50000000-0000-4000-8000-000000000001', 'E01', 'salo', '00000000-0000-4000-8000-000000000c01') $$,
  'the dashboard opens a session for tuning evening E01'
);
select lives_ok(
  $$ insert into public.live_sessions (id, evening_id, policy, created_by)
     values ('50000000-0000-4000-8000-000000000002', 'E10', 'fcfs', '00000000-0000-4000-8000-000000000c01') $$,
  'the dashboard opens a session for tuning evening E10'
);
select is(
  pg_temp.err_state($$ insert into public.live_sessions (evening_id, policy, created_by)
                       values ('E11', 'salo', '00000000-0000-4000-8000-000000000c01') $$),
  '23514',
  'pilot evening E11 is rejected'
);
select is(
  pg_temp.err_state($$ insert into public.live_sessions (evening_id, policy, created_by)
                       values ('E21', 'salo', '00000000-0000-4000-8000-000000000c01') $$),
  '23514',
  'main evening E21 is rejected'
);
select is(
  pg_temp.err_state($$ insert into public.live_sessions (evening_id, policy, created_by)
                       values ('E30', 'salo', '00000000-0000-4000-8000-000000000c01') $$),
  '23514',
  'main evening E30 is rejected'
);
select is(
  pg_temp.err_state($$ insert into public.live_sessions (evening_id, policy, created_by)
                       values ('E05', 'proportional', '00000000-0000-4000-8000-000000000c01') $$),
  '23514',
  'an unknown policy id is rejected'
);
select is(
  pg_temp.exec_rows($$ update public.live_sessions set ended_at = now()
                        where id = '50000000-0000-4000-8000-000000000002' $$),
  1::bigint,
  'the creator can end its own session'
);
select is(
  pg_temp.err_state($$ update public.live_sessions set evening_id = 'E02'
                        where id = '50000000-0000-4000-8000-000000000001' $$),
  '42501',
  'only ended_at can be changed on a session'
);

reset role;

-- Donor A cannot open sessions, and cannot end the dashboard's session.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-000000000a01', 'role', 'authenticated', 'is_anonymous', true)::text,
  true);
set local role authenticated;

select is(
  pg_temp.err_state($$ insert into public.live_sessions (evening_id, policy, created_by)
                       values ('E02', 'salo', '00000000-0000-4000-8000-000000000a01') $$),
  '42501',
  'a donor device cannot open a session'
);
select is(
  pg_temp.exec_rows($$ update public.live_sessions set ended_at = now()
                        where id = '50000000-0000-4000-8000-000000000001' $$),
  0::bigint,
  'a donor device cannot end the dashboard session (0 rows touched)'
);
select is((select count(*) from public.live_sessions), 0::bigint, 'a device that has not joined sees no session');

-- Lots. Donors no longer post lots directly (they send input_requests, stamped by the dashboard).
select is(
  pg_temp.err_state($$ insert into public.lots (session_id, lot_id, donor_id, items, est_kg, load_units,
                              posted_minute, pickup_by_minute, created_by)
     values ('50000000-0000-4000-8000-000000000001', 'LIVE-1', 'D01',
             '[{"foodItem":"adobo","quantity":3,"unit":"tray"}]'::jsonb, 5.5, 1,
             1020, 1200, '00000000-0000-4000-8000-000000000a01') $$),
  '42501',
  'a donor device cannot post a lot directly (it sends a request instead)'
);
select is((select count(*) from public.lots where session_id = '50000000-0000-4000-8000-000000000001'),
  0::bigint, 'a device that has not joined reads no lots of the session');
select is(
  pg_temp.err_state($$ update public.lots set est_kg = 9 $$),
  '42501',
  'lots cannot be updated by clients'
);
select is(
  pg_temp.err_state($$ insert into public.lots (session_id, lot_id, donor_id, items, est_kg, load_units,
                              posted_minute, pickup_by_minute, created_by)
     values ('50000000-0000-4000-8000-000000000001', 'LIVE-2', 'D02',
             '[{"foodItem":"pandesal","quantity":20,"unit":"piece"}]'::jsonb, 1.0, 1,
             1020, 1200, '00000000-0000-4000-8000-000000000a01') $$),
  '42501',
  'a donor device cannot post a lot for another donor'
);

reset role;

-- The dashboard posts lots, and lot ids are unique per session.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-000000000c01', 'role', 'authenticated', 'is_anonymous', true)::text,
  true);
set local role authenticated;

select lives_ok(
  $$ insert into public.lots (session_id, lot_id, donor_id, items, est_kg, load_units,
                              posted_minute, pickup_by_minute, created_by)
     values ('50000000-0000-4000-8000-000000000001', 'LIVE-1', 'D01',
             '[{"foodItem":"adobo","quantity":3,"unit":"tray"}]'::jsonb, 5.5, 1,
             1020, 1200, '00000000-0000-4000-8000-000000000c01') $$,
  'the dashboard posts a lot for donor D01 (the stamped LOT_POSTED)'
);
select is(
  pg_temp.err_state($$ insert into public.lots (session_id, lot_id, donor_id, items, est_kg, load_units,
                              posted_minute, pickup_by_minute, created_by)
     values ('50000000-0000-4000-8000-000000000001', 'LIVE-1', 'D01',
             '[{"foodItem":"adobo","quantity":1,"unit":"tray"}]'::jsonb, 1.0, 1,
             1020, 1200, '00000000-0000-4000-8000-000000000c01') $$),
  '23505',
  'a lot id is unique within one session'
);
select lives_ok(
  $$ insert into public.lots (session_id, lot_id, donor_id, items, est_kg, load_units,
                              posted_minute, pickup_by_minute, created_by)
     values ('50000000-0000-4000-8000-000000000002', 'LIVE-1', 'D01',
             '[{"foodItem":"adobo","quantity":1,"unit":"tray"}]'::jsonb, 1.0, 1,
             1020, 1200, '00000000-0000-4000-8000-000000000c01') $$,
  'the same lot id may appear in another session'
);
select is(
  pg_temp.err_state($$ insert into public.lots (session_id, lot_id, donor_id, items, est_kg, load_units,
                              posted_minute, pickup_by_minute, created_by)
     values ('50000000-0000-4000-8000-000000000001', 'LIVE-3', 'D99',
             '[{"foodItem":"adobo","quantity":1,"unit":"tray"}]'::jsonb, 1.0, 1,
             1020, 1200, '00000000-0000-4000-8000-000000000c01') $$),
  '23503',
  'a lot must name an existing donor'
);
select is(
  pg_temp.err_state($$ insert into public.lots (session_id, lot_id, donor_id, items, est_kg, load_units,
                              posted_minute, pickup_by_minute, created_by)
     values ('50000000-0000-4000-8000-000000000001', 'LIVE-3', 'D01',
             '[{"foodItem":"adobo","quantity":1,"unit":"tray"}]'::jsonb, 1.0, 1,
             1020, 1020, '00000000-0000-4000-8000-000000000c01') $$),
  '23514',
  'pickup must be after posting'
);
select is(
  pg_temp.err_state($$ insert into public.lots (session_id, lot_id, donor_id, items, est_kg, load_units,
                              posted_minute, pickup_by_minute, created_by)
     values ('50000000-0000-4000-8000-000000000001', 'LOT-3', 'D01',
             '[{"foodItem":"adobo","quantity":1,"unit":"tray"}]'::jsonb, 1.0, 1,
             1020, 1200, '00000000-0000-4000-8000-000000000c01') $$),
  '23514',
  'lot ids must look like LIVE-n'
);
select is(
  pg_temp.err_state($$ insert into public.lots (session_id, lot_id, donor_id, items, est_kg, load_units,
                              posted_minute, pickup_by_minute, created_by)
     values ('50000000-0000-4000-8000-000000000001', 'LIVE-4', 'D01',
             '[{"foodItem":"adobo","quantity":1,"unit":"tray"}]'::jsonb, 1.0, 1,
             900, 1200, '00000000-0000-4000-8000-000000000c01') $$),
  '23514',
  'a lot cannot be posted before 16:00'
);
select is(
  pg_temp.err_state($$ insert into public.lots (session_id, lot_id, donor_id, items, est_kg, load_units,
                              posted_minute, pickup_by_minute, created_by)
     values ('50000000-0000-4000-8000-000000000001', 'LIVE-5', 'D01',
             '[]'::jsonb, 1.0, 1, 1020, 1200, '00000000-0000-4000-8000-000000000c01') $$),
  '23514',
  'a lot needs at least one item'
);

-- Events: only the dashboard that created the session writes them.
select lives_ok(
  $$ insert into public.events (session_id, seq, at_minute, policy, event)
     values ('50000000-0000-4000-8000-000000000001', 1, 1020, 'salo',
             '{"type":"AWARD_STATE","lotId":"LIVE-1","state":"announced"}'::jsonb) $$,
  'the session creator writes an event'
);
select is(
  pg_temp.err_state($$ insert into public.events (session_id, seq, at_minute, policy, event)
     values ('50000000-0000-4000-8000-000000000001', 2, 1021, 'fcfs',
             '{"type":"AWARD_STATE","lotId":"LIVE-1","state":"tentative"}'::jsonb) $$),
  '23503',
  'an event must carry the session policy'
);
select is(
  pg_temp.err_state($$ insert into public.events (session_id, seq, at_minute, policy, event)
     values ('50000000-0000-4000-8000-000000000001', 1, 1020, 'salo',
             '{"type":"AWARD_STATE","lotId":"LIVE-1","state":"final"}'::jsonb) $$),
  '23505',
  'seq is unique within a session'
);
select is(
  pg_temp.err_state($$ insert into public.events (session_id, seq, at_minute, policy, event)
     values ('50000000-0000-4000-8000-000000000001', 2, 1021, 'salo', '["not","an","object"]'::jsonb) $$),
  '23514',
  'an event must be a JSON object'
);
select is(
  pg_temp.err_state($$ insert into public.events (session_id, seq, at_minute, policy, event)
     values ('50000000-0000-4000-8000-000000000001', 2, 1021, 'salo', '{"lotId":"LIVE-1"}'::jsonb) $$),
  '23514',
  'an event must carry a type'
);
select is(
  pg_temp.err_state($$ update public.events set at_minute = 1 $$),
  '42501',
  'events cannot be updated'
);

reset role;

-- Donor A is not the creator, so it cannot write events into the dashboard's session.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-000000000a01', 'role', 'authenticated', 'is_anonymous', true)::text,
  true);
set local role authenticated;

select is(
  pg_temp.err_state($$ insert into public.events (session_id, seq, at_minute, policy, event)
     values ('50000000-0000-4000-8000-000000000001', 3, 1022, 'salo',
             '{"type":"AWARD_STATE","lotId":"LIVE-1","state":"final"}'::jsonb) $$),
  '42501',
  'a device that did not create the session cannot write its events'
);

reset role;

select ok(
  exists (select 1 from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lots'),
  'lots is in the supabase_realtime publication'
);
select ok(
  exists (select 1 from pg_publication_tables
           where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'),
  'events is in the supabase_realtime publication'
);

select * from finish();
rollback;
