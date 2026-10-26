-- Held drivers: session_driver_members (creator only) and the held-driver rule for DRIVER_RESPONSE requests.
-- Everything runs in one transaction and is rolled back.
begin;
select plan(24);

create function pg_temp.err_state(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return 'no error';
exception when others then
  return sqlstate;
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
-- Setup (table owner). Session H with code HLD001, created by the dashboard e001, holds driver V11.
-- Members will be: driver V11 (e002, held), driver V12 (e003, not held), donor D11 (e004).
-- Donor D12 (e005) never joins. Driver V13 (e006) joins after the start.
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, is_anonymous) values
  ('00000000-0000-4000-8000-00000000e001', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-00000000e002', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-00000000e003', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-00000000e004', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-00000000e005', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-00000000e006', 'authenticated', 'authenticated', true);

insert into public.devices (id, role, profile_id) values
  ('00000000-0000-4000-8000-00000000e001', 'dashboard', null),
  ('00000000-0000-4000-8000-00000000e002', 'driver', 'V11'),
  ('00000000-0000-4000-8000-00000000e003', 'driver', 'V12'),
  ('00000000-0000-4000-8000-00000000e004', 'donor', 'D11'),
  ('00000000-0000-4000-8000-00000000e005', 'donor', 'D12'),
  ('00000000-0000-4000-8000-00000000e006', 'driver', 'V13');

insert into public.live_sessions (id, evening_id, policy, created_by, join_code, held_drivers) values
  ('70000000-0000-4000-8000-000000000001', 'E01', 'salo', '00000000-0000-4000-8000-00000000e001', 'HLD001',
   array['V11']);

-- ---------------------------------------------------------------------------
-- session_driver_members: the creator reads the joined driver devices
-- ---------------------------------------------------------------------------
select pg_temp.become('00000000-0000-4000-8000-00000000e002', 'authenticated');
select is(public.join_session('HLD001'), '70000000-0000-4000-8000-000000000001'::uuid,
  'driver V11 joins the session');
select pg_temp.become('00000000-0000-4000-8000-00000000e003', 'authenticated');
select is(public.join_session('HLD001'), '70000000-0000-4000-8000-000000000001'::uuid,
  'driver V12 joins the session');
select pg_temp.become('00000000-0000-4000-8000-00000000e004', 'authenticated');
select is(public.join_session('HLD001'), '70000000-0000-4000-8000-000000000001'::uuid,
  'donor D11 joins the session');

select pg_temp.become('00000000-0000-4000-8000-00000000e001', 'authenticated');
select is(
  (select count(*) from public.session_driver_members('70000000-0000-4000-8000-000000000001')),
  2::bigint,
  'the creator gets the two driver members and not the donor member'
);
select is(
  (select array_agg(driver_id::text order by driver_id) from public.session_driver_members('70000000-0000-4000-8000-000000000001')),
  array['V11', 'V12'],
  'the creator gets the driver ids of the joined driver phones'
);
select is(
  (select array_agg(device_id order by device_id) from public.session_driver_members('70000000-0000-4000-8000-000000000001')),
  array['00000000-0000-4000-8000-00000000e002'::uuid, '00000000-0000-4000-8000-00000000e003'::uuid],
  'the creator gets the device ids of those members'
);

-- A member that is not the creator gets an error (42501). So does a non-member, and the anon role.
select pg_temp.become('00000000-0000-4000-8000-00000000e004', 'authenticated');
select is(
  pg_temp.err_state($$ select * from public.session_driver_members('70000000-0000-4000-8000-000000000001') $$),
  '42501',
  'a member that is not the creator cannot read the driver members'
);
select pg_temp.become('00000000-0000-4000-8000-00000000e005', 'authenticated');
select is(
  pg_temp.err_state($$ select * from public.session_driver_members('70000000-0000-4000-8000-000000000001') $$),
  '42501',
  'a non-member cannot read the driver members'
);
select pg_temp.become('00000000-0000-4000-8000-00000000e005', 'anon');
select is(
  pg_temp.err_state($$ select * from public.session_driver_members('70000000-0000-4000-8000-000000000001') $$),
  '42501',
  'the anon role cannot call session_driver_members'
);

-- Grants and definer settings
reset role;
select ok(
  has_function_privilege('authenticated', 'public.session_driver_members(uuid)', 'EXECUTE'),
  'authenticated may execute session_driver_members'
);
select ok(
  not has_function_privilege('anon', 'public.session_driver_members(uuid)', 'EXECUTE'),
  'anon may not execute session_driver_members'
);
select is(
  (select count(*) from pg_proc p cross join lateral aclexplode(p.proacl) a
    where p.oid = 'public.session_driver_members(uuid)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  0::bigint,
  'PUBLIC has no execute grant on session_driver_members'
);
select ok(
  (select p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=%'
     from pg_proc p where p.oid = 'public.session_driver_members(uuid)'::regprocedure),
  'session_driver_members is SECURITY DEFINER with a fixed search_path'
);

-- ---------------------------------------------------------------------------
-- DRIVER_RESPONSE requests: only a held driver device may send one
-- ---------------------------------------------------------------------------
select pg_temp.become('00000000-0000-4000-8000-00000000e002', 'authenticated');
select lives_ok(
  $$ insert into public.input_requests (session_id, device_id, input) values
     ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000e002',
      '{"type":"DRIVER_RESPONSE","driverId":"V11","lotId":"LIVE-1","answer":"offer"}'::jsonb) $$,
  'a held driver (V11) requests a DRIVER_RESPONSE'
);

select pg_temp.become('00000000-0000-4000-8000-00000000e003', 'authenticated');
select is(
  pg_temp.err_state($$ insert into public.input_requests (session_id, device_id, input) values
     ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000e003',
      '{"type":"DRIVER_RESPONSE","driverId":"V12","lotId":"LIVE-1","answer":"offer"}'::jsonb) $$),
  '42501',
  'a driver that joined but is not held (V12) is refused'
);

select pg_temp.become('00000000-0000-4000-8000-00000000e001', 'authenticated');
-- The dashboard joins its own session, so the refusal below comes from the held-driver rule, not from membership.
do $$ begin perform public.join_session('HLD001'); end $$;
select is(
  pg_temp.err_state($$ insert into public.input_requests (session_id, device_id, input) values
     ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000e001',
      '{"type":"DRIVER_RESPONSE","driverId":"V11","lotId":"LIVE-1","answer":"offer"}'::jsonb) $$),
  '42501',
  'the dashboard cannot send a DRIVER_RESPONSE request (it is not a driver device)'
);

-- The evening starts: the clock runs. A driver who joins now is not held and cannot answer.
reset role;
select lives_ok(
  $$ update public.live_sessions set clock_running = true where id = '70000000-0000-4000-8000-000000000001' $$,
  'the clock starts (owner update for the test)'
);

select pg_temp.become('00000000-0000-4000-8000-00000000e006', 'authenticated');
select is(public.join_session('HLD001'), '70000000-0000-4000-8000-000000000001'::uuid,
  'driver V13 joins after the start');
select is(
  pg_temp.err_state($$ insert into public.input_requests (session_id, device_id, input) values
     ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000e006',
      '{"type":"DRIVER_RESPONSE","driverId":"V13","lotId":"LIVE-1","answer":"commit"}'::jsonb) $$),
  '42501',
  'a driver who joined after the start is refused by the database'
);

select pg_temp.become('00000000-0000-4000-8000-00000000e002', 'authenticated');
select lives_ok(
  $$ insert into public.input_requests (session_id, device_id, input) values
     ('70000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-00000000e002',
      '{"type":"DRIVER_RESPONSE","driverId":"V11","lotId":"LIVE-1","answer":"commit"}'::jsonb) $$,
  'the held driver V11 still answers after the start'
);

-- The creator still reads every joined driver phone (the dashboard uses the held set only at 17:00, stopped).
select pg_temp.become('00000000-0000-4000-8000-00000000e001', 'authenticated');
select is(
  (select count(*) from public.session_driver_members('70000000-0000-4000-8000-000000000001')),
  3::bigint,
  'after the start the creator still reads every joined driver phone'
);

-- Owner check: only the two accepted requests were written, and none from a device that is not held.
reset role;
select is(
  (select count(*) from public.input_requests where session_id = '70000000-0000-4000-8000-000000000001'),
  2::bigint,
  'only the two requests from held driver V11 were written'
);
select is(
  (select count(*) from public.input_requests
    where session_id = '70000000-0000-4000-8000-000000000001'
      and device_id <> '00000000-0000-4000-8000-00000000e002'),
  0::bigint,
  'no request from a device other than V11 was written'
);
select is(
  (select count(*) from public.session_members where session_id = '70000000-0000-4000-8000-000000000001'),
  5::bigint,
  'five members joined (V11, V12, D11, V13, and the dashboard that tried in the test)'
);

select * from finish();
rollback;
