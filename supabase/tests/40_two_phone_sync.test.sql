-- Two-phone sync: join codes, membership, input log and request rules, the clock, held drivers,
-- and the realtime publication. Everything runs in one transaction and is rolled back.
begin;
select plan(53);

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

-- Act as a device (sub = uid) with the given database role. Resets the role first.
create function pg_temp.become(uid uuid, r text) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated', 'is_anonymous', true)::text, false);
  execute format('set local role %I', r);
end $$;

-- ---------------------------------------------------------------------------
-- Setup (table owner). Devices: dashboard, donors D01 and D02 (and D03 as an outsider), driver V01,
-- pantry P01, plus a user with no device row. Session S has a known join code.
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, is_anonymous) values
  ('00000000-0000-4000-8000-00000000d001', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-00000000d002', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-00000000d003', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-00000000d004', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-00000000d005', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-00000000d006', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-00000000d007', 'authenticated', 'authenticated', true);

insert into public.devices (id, role, profile_id) values
  ('00000000-0000-4000-8000-00000000d001', 'dashboard', null),
  ('00000000-0000-4000-8000-00000000d002', 'donor', 'D01'),
  ('00000000-0000-4000-8000-00000000d003', 'donor', 'D02'),
  ('00000000-0000-4000-8000-00000000d004', 'driver', 'V01'),
  ('00000000-0000-4000-8000-00000000d005', 'pantry', 'P01'),
  ('00000000-0000-4000-8000-00000000d006', 'donor', 'D03');
-- d007 has no devices row.

insert into public.live_sessions (id, evening_id, policy, created_by, join_code) values
  ('60000000-0000-4000-8000-000000000001', 'E01', 'salo', '00000000-0000-4000-8000-00000000d001', 'K7Q2MX');

-- ---------------------------------------------------------------------------
-- The dashboard (creator) opens a second session, and runs the clock and held drivers.
-- ---------------------------------------------------------------------------
select pg_temp.become('00000000-0000-4000-8000-00000000d001', 'authenticated');

select lives_ok(
  $$ insert into public.live_sessions (id, evening_id, policy, created_by)
     values ('60000000-0000-4000-8000-000000000002', 'E02', 'salo', '00000000-0000-4000-8000-00000000d001') $$,
  'the dashboard opens a second session without choosing a join code'
);
select ok(
  (select join_code ~ '^[A-Z0-9]{6}$' from public.live_sessions where id = '60000000-0000-4000-8000-000000000002'),
  'the server generates a six-character A-Z0-9 join code'
);
select is(
  pg_temp.err_state($$ insert into public.live_sessions (id, evening_id, policy, created_by, join_code)
     values ('60000000-0000-4000-8000-000000000003', 'E03', 'salo',
             '00000000-0000-4000-8000-00000000d001', 'HACKED') $$),
  '42501',
  'a client cannot choose a join code'
);
select is((select count(*) from public.live_sessions where id = '60000000-0000-4000-8000-000000000001'),
  1::bigint, 'the creator reads its own session row');
select is(
  pg_temp.err_state($$ update public.live_sessions set clock_minute = 1440
                        where id = '60000000-0000-4000-8000-000000000001' $$),
  '23514',
  'clock_minute must be a minute of the day (0-1439)'
);
select is(
  pg_temp.exec_rows($$ update public.live_sessions set held_drivers = array['V01']
                        where id = '60000000-0000-4000-8000-000000000001' $$),
  1::bigint,
  'the creator holds driver V01 while the clock is at 1020 and stopped'
);
select is(
  pg_temp.err_state($$ update public.live_sessions set held_drivers = array['V99']
                        where id = '60000000-0000-4000-8000-000000000001' $$),
  'P0001',
  'a held driver must be a real driver (V99 does not exist)'
);
select is(
  pg_temp.err_state($$ update public.live_sessions set clock_running = true, held_drivers = array['V02']
                        where id = '60000000-0000-4000-8000-000000000001' $$),
  'P0001',
  'held_drivers cannot change in the same update that starts the clock'
);
select is(
  pg_temp.exec_rows($$ update public.live_sessions set clock_running = true
                        where id = '60000000-0000-4000-8000-000000000001' $$),
  1::bigint,
  'the creator starts the clock (no held change)'
);
select is(
  pg_temp.err_state($$ update public.live_sessions set held_drivers = array['V02']
                        where id = '60000000-0000-4000-8000-000000000001' $$),
  'P0001',
  'held_drivers cannot change while the clock is running'
);
select is(
  pg_temp.exec_rows($$ update public.live_sessions set clock_running = false, clock_minute = 1021
                        where id = '60000000-0000-4000-8000-000000000001' $$),
  1::bigint,
  'the creator stops the clock and moves it to 1021'
);
select is(
  pg_temp.err_state($$ update public.live_sessions set held_drivers = array['V02']
                        where id = '60000000-0000-4000-8000-000000000001' $$),
  'P0001',
  'held_drivers cannot change once the clock has left 1020'
);
select is(
  pg_temp.exec_rows($$ update public.live_sessions set clock_minute = 1022, held_drivers = array['V01']
                        where id = '60000000-0000-4000-8000-000000000001' $$),
  1::bigint,
  'an unchanged held_drivers does not block clock moves'
);

-- The dashboard's official input log (seq 1-2 at minute 1022).
select lives_ok(
  $$ insert into public.session_inputs (session_id, seq, at_minute, input) values
     ('60000000-0000-4000-8000-000000000001', 1, 1022,
      '{"type":"LOT_POSTED","lot":{"id":"LIVE-1","donorId":"D01","items":[{"foodItem":"adobo","quantity":3,"unit":"tray"}],"estKg":5.5,"loadUnits":1,"postedMinute":1020,"pickupByMinute":1200,"origin":"live"}}'::jsonb) $$,
  'the creator appends a LOT_POSTED input'
);
select lives_ok(
  $$ insert into public.session_inputs (session_id, seq, at_minute, input) values
     ('60000000-0000-4000-8000-000000000001', 2, 1022, '{"type":"CANCEL_DRIVER","lotId":"LIVE-9"}'::jsonb) $$,
  'the creator appends a CANCEL_DRIVER input'
);
select is(
  pg_temp.err_state($$ insert into public.session_inputs (session_id, seq, at_minute, input) values
     ('60000000-0000-4000-8000-000000000001', 3, 1022, '{"type":"BOGUS"}'::jsonb) $$),
  '23514',
  'an input must be an EngineInput (LOT_POSTED, CANCEL_DRIVER or DRIVER_RESPONSE)'
);
select is(
  pg_temp.err_state($$ insert into public.session_inputs (session_id, seq, at_minute, input) values
     ('60000000-0000-4000-8000-000000000001', 1, 1022, '{"type":"CANCEL_DRIVER","lotId":"LIVE-9"}'::jsonb) $$),
  '23505',
  'seq is unique within a session'
);

-- ---------------------------------------------------------------------------
-- Donor D01 (device d002) joins with the code, requests, and reads.
-- ---------------------------------------------------------------------------
select pg_temp.become('00000000-0000-4000-8000-00000000d002', 'authenticated');

select is(
  public.join_session('NOPE00'),
  null::uuid,
  'a join with an unknown code returns no session (NULL), so the failed try is recorded'
);
select is(public.join_session('k7q2mx'), '60000000-0000-4000-8000-000000000001'::uuid,
  'a donor joins with the code (case and spacing do not matter)');
select is(public.join_session('K7Q2MX'), '60000000-0000-4000-8000-000000000001'::uuid,
  'joining the same session again is harmless');
select is((select count(*) from public.live_sessions), 1::bigint, 'a member reads the session row');
select is((select count(*) from public.session_inputs), 2::bigint, 'a member reads the input log');

select lives_ok(
  $$ insert into public.input_requests (session_id, device_id, input) values
     ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d002',
      '{"type":"LOT_POSTED","lot":{"id":"LIVE-2","donorId":"D01","items":[{"foodItem":"pandesal","quantity":20,"unit":"piece"}],"estKg":1.0,"loadUnits":1,"postedMinute":1030,"pickupByMinute":1200,"origin":"live"}}'::jsonb) $$,
  'a donor requests a LOT_POSTED for its own donor id'
);
select is(
  pg_temp.err_state($$ insert into public.input_requests (session_id, device_id, input) values
     ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d002',
      '{"type":"LOT_POSTED","lot":{"id":"LIVE-3","donorId":"D02","items":[{"foodItem":"adobo","quantity":1,"unit":"tray"}],"estKg":1.0,"loadUnits":1,"postedMinute":1030,"pickupByMinute":1200,"origin":"live"}}'::jsonb) $$),
  '42501',
  'a donor cannot request a LOT_POSTED for another donor'
);
select is(
  pg_temp.err_state($$ insert into public.input_requests (session_id, device_id, input) values
     ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d002',
      '{"type":"DRIVER_RESPONSE","driverId":"V01","lotId":"LIVE-1","answer":"commit"}'::jsonb) $$),
  '42501',
  'a donor cannot request a DRIVER_RESPONSE'
);
select is(
  pg_temp.err_state($$ insert into public.input_requests (session_id, device_id, input) values
     ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d003',
      '{"type":"LOT_POSTED","lot":{"id":"LIVE-4","donorId":"D02","items":[{"foodItem":"adobo","quantity":1,"unit":"tray"}],"estKg":1.0,"loadUnits":1,"postedMinute":1030,"pickupByMinute":1200,"origin":"live"}}'::jsonb) $$),
  '42501',
  'a device cannot request as another device'
);
select is((select count(*) from public.input_requests), 1::bigint,
  'a member reads only its own requests');
select is(
  pg_temp.exec_rows($$ update public.live_sessions set clock_minute = 1100
                        where id = '60000000-0000-4000-8000-000000000001' $$),
  0::bigint,
  'a donor member cannot move the clock (0 rows)'
);

-- ---------------------------------------------------------------------------
-- Donor D02 (device d003) joins and requests. It cannot write the log, the requests' status, or membership.
-- ---------------------------------------------------------------------------
select pg_temp.become('00000000-0000-4000-8000-00000000d003', 'authenticated');

select is(public.join_session('K7Q2MX'), '60000000-0000-4000-8000-000000000001'::uuid,
  'a second donor joins the session');
select lives_ok(
  $$ insert into public.input_requests (session_id, device_id, input) values
     ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d003',
      '{"type":"LOT_POSTED","lot":{"id":"LIVE-5","donorId":"D02","items":[{"foodItem":"pan de sal","quantity":12,"unit":"piece"}],"estKg":1.2,"loadUnits":1,"postedMinute":1040,"pickupByMinute":1210,"origin":"live"}}'::jsonb) $$,
  'donor D02 requests a LOT_POSTED for its own donor id'
);
select is((select count(*) from public.input_requests), 1::bigint,
  'donor D02 reads only its own request, not donor D01s');
select is(
  pg_temp.err_state($$ insert into public.session_inputs (session_id, seq, at_minute, input) values
     ('60000000-0000-4000-8000-000000000001', 9, 1100, '{"type":"CANCEL_DRIVER","lotId":"LIVE-9"}'::jsonb) $$),
  '42501',
  'a member cannot write session_inputs (only the creator can)'
);
select is(
  pg_temp.exec_rows($$ update public.input_requests set status = 'applied', applied_seq = 1
                        where device_id = '00000000-0000-4000-8000-00000000d003' $$),
  0::bigint,
  'a member cannot change the status of its request (0 rows)'
);
select is(
  pg_temp.err_state($$ insert into public.session_members (session_id, device_id) values
     ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d006') $$),
  '42501',
  'membership is written only by join_session, not directly'
);
select is((select count(*) from public.session_members), 1::bigint,
  'a member reads only its own membership row');

-- ---------------------------------------------------------------------------
-- Driver V01 (device d004) joins: DRIVER_RESPONSE for its own driver id only.
-- ---------------------------------------------------------------------------
select pg_temp.become('00000000-0000-4000-8000-00000000d004', 'authenticated');

select is(public.join_session('K7Q2MX'), '60000000-0000-4000-8000-000000000001'::uuid,
  'driver V01 joins the session');
select lives_ok(
  $$ insert into public.input_requests (session_id, device_id, input) values
     ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d004',
      '{"type":"DRIVER_RESPONSE","driverId":"V01","lotId":"LIVE-1","answer":"commit"}'::jsonb) $$,
  'a driver requests a DRIVER_RESPONSE for its own driver id'
);
select is(
  pg_temp.err_state($$ insert into public.input_requests (session_id, device_id, input) values
     ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d004',
      '{"type":"DRIVER_RESPONSE","driverId":"V02","lotId":"LIVE-1","answer":"commit"}'::jsonb) $$),
  '42501',
  'a driver cannot respond for another driver'
);
select is(
  pg_temp.err_state($$ insert into public.input_requests (session_id, device_id, input) values
     ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d004',
      '{"type":"LOT_POSTED","lot":{"id":"LIVE-6","donorId":"D01","items":[{"foodItem":"adobo","quantity":1,"unit":"tray"}],"estKg":1.0,"loadUnits":1,"postedMinute":1040,"pickupByMinute":1200,"origin":"live"}}'::jsonb) $$),
  '42501',
  'a driver cannot request a LOT_POSTED'
);

-- ---------------------------------------------------------------------------
-- Pantry P01 (device d005) may join, but may not request any input.
-- ---------------------------------------------------------------------------
select pg_temp.become('00000000-0000-4000-8000-00000000d005', 'authenticated');

select is(public.join_session('K7Q2MX'), '60000000-0000-4000-8000-000000000001'::uuid,
  'pantry P01 joins the session');
select is(
  pg_temp.err_state($$ insert into public.input_requests (session_id, device_id, input) values
     ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d005',
      '{"type":"LOT_POSTED","lot":{"id":"LIVE-7","donorId":"D01","items":[{"foodItem":"adobo","quantity":1,"unit":"tray"}],"estKg":1.0,"loadUnits":1,"postedMinute":1040,"pickupByMinute":1200,"origin":"live"}}'::jsonb) $$),
  '42501',
  'a pantry cannot send any request'
);

-- ---------------------------------------------------------------------------
-- Outsider: donor D03 (device d006) never joined.
-- ---------------------------------------------------------------------------
select pg_temp.become('00000000-0000-4000-8000-00000000d006', 'authenticated');

select is((select count(*) from public.session_inputs), 0::bigint, 'a non-member reads no inputs');
select is(
  pg_temp.err_state($$ insert into public.input_requests (session_id, device_id, input) values
     ('60000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000d006',
      '{"type":"LOT_POSTED","lot":{"id":"LIVE-8","donorId":"D03","items":[{"foodItem":"adobo","quantity":1,"unit":"tray"}],"estKg":1.0,"loadUnits":1,"postedMinute":1040,"pickupByMinute":1200,"origin":"live"}}'::jsonb) $$),
  '42501',
  'a non-member cannot send a request'
);

-- ---------------------------------------------------------------------------
-- A user with no device row cannot join. Anonymous role cannot call join_session at all.
-- ---------------------------------------------------------------------------
select pg_temp.become('00000000-0000-4000-8000-00000000d007', 'authenticated');
select is(
  pg_temp.err_state($$ select public.join_session('K7Q2MX') $$),
  '42501',
  'a signed-in user with no registered device cannot join'
);

select pg_temp.become('00000000-0000-4000-8000-00000000d007', 'anon');
select is(
  pg_temp.err_state($$ select public.join_session('K7Q2MX') $$),
  '42501',
  'the anon role cannot call join_session'
);

-- ---------------------------------------------------------------------------
-- The dashboard reads the requests, stamps them, and answers them.
-- ---------------------------------------------------------------------------
select pg_temp.become('00000000-0000-4000-8000-00000000d001', 'authenticated');

select is((select count(*) from public.input_requests), 3::bigint,
  'the creator reads every request of its session (D01, D02, V01)');
select lives_ok(
  $$ insert into public.session_inputs (session_id, seq, at_minute, input)
     select session_id, 3, 1040, input from public.input_requests
      where device_id = '00000000-0000-4000-8000-00000000d002' $$,
  'the creator stamps donor D01 request at minute 1040 as input seq 3'
);
select is(
  pg_temp.exec_rows($$ update public.input_requests set status = 'applied', applied_seq = 3
                        where device_id = '00000000-0000-4000-8000-00000000d002' $$),
  1::bigint,
  'the creator marks that request applied with its seq'
);
select is(
  pg_temp.err_state($$ update public.input_requests set status = 'applied', applied_seq = 99
                        where device_id = '00000000-0000-4000-8000-00000000d003' $$),
  '23503',
  'applied_seq must name an existing input'
);
select is(
  pg_temp.err_state($$ update public.input_requests set status = 'rejected'
                        where device_id = '00000000-0000-4000-8000-00000000d004' $$),
  '23514',
  'a rejected request must carry a reason'
);
select is(
  pg_temp.exec_rows($$ update public.input_requests set status = 'rejected', reason = 'V01 was not offered this lot'
                        where device_id = '00000000-0000-4000-8000-00000000d004' $$),
  1::bigint,
  'the creator rejects the driver request with a reason (no input is written)'
);
select is((select count(*) from public.session_inputs where session_id = '60000000-0000-4000-8000-000000000001'),
  3::bigint, 'the input log holds seq 1-3: two dashboard inputs and the stamped donor request');

-- The realtime publication carries the five sync tables plus lots and events.
reset role;
select is(
  (select array_agg(tablename::text order by tablename) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('events', 'input_requests', 'live_sessions', 'lots', 'session_inputs')),
  array['events', 'input_requests', 'live_sessions', 'lots', 'session_inputs'],
  'the realtime publication contains live_sessions, session_inputs, input_requests, lots and events'
);

select * from finish();
rollback;
