-- Join attempt limit (migration 20261101100000): 5 failed tries in 10 minutes lock a device out of join_session, including
-- the right code; other devices, successes, and old tries do not count; clients cannot touch join_attempts; an
-- unregistered user is refused and nothing is recorded. Everything runs in one transaction and is rolled back.
begin;
select plan(34);

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

-- Read and change join_attempts as its owner (the security definer runs as the owner), whatever role the test is in.
create function pg_temp.attempts(uid uuid, only_failed boolean) returns bigint language plpgsql security definer set search_path = '' as $$
declare n bigint;
begin
  select count(*) into n from public.join_attempts a
   where a.device_id = uid and (not only_failed or not a.ok);
  return n;
end $$;

create function pg_temp.older_than_day(uid uuid) returns bigint language plpgsql security definer set search_path = '' as $$
declare n bigint;
begin
  select count(*) into n from public.join_attempts a
   where a.device_id = uid and a.attempted_at < now() - interval '1 day';
  return n;
end $$;

create function pg_temp.age_attempts(uid uuid, back interval) returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.join_attempts set attempted_at = attempted_at - back where device_id = uid;
end $$;

create function pg_temp.add_old_attempt(uid uuid, back interval) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.join_attempts (device_id, attempted_at, ok) values (uid, now() - back, false);
end $$;

-- ---------------------------------------------------------------------------
-- Setup (table owner). Devices: dashboard a001; donor devices a002 (D01), a003 (D02), a004 (D03); a005 has no device row.
-- Session with code LIM007, created by the dashboard.
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, is_anonymous) values
  ('00000000-0000-4000-8000-00000000a001', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-00000000a002', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-00000000a003', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-00000000a004', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-00000000a005', 'authenticated', 'authenticated', true);

insert into public.devices (id, role, profile_id) values
  ('00000000-0000-4000-8000-00000000a001', 'dashboard', null),
  ('00000000-0000-4000-8000-00000000a002', 'donor', 'D01'),
  ('00000000-0000-4000-8000-00000000a003', 'donor', 'D02'),
  ('00000000-0000-4000-8000-00000000a004', 'donor', 'D03');
-- a005 has no devices row.

insert into public.live_sessions (id, evening_id, policy, created_by, join_code) values
  ('80000000-0000-4000-8000-000000000001', 'E01', 'salo', '00000000-0000-4000-8000-00000000a001', 'LIM007');

-- ---------------------------------------------------------------------------
-- 1. Five wrong codes are allowed; the sixth try is refused, even with the right code.
-- ---------------------------------------------------------------------------
select pg_temp.become('00000000-0000-4000-8000-00000000a002', 'authenticated');

select is(public.join_session('WRN001'), null::uuid, 'wrong code 1 returns no session (NULL)');
select is(public.join_session('WRN002'), null::uuid, 'wrong code 2 returns no session (NULL)');
select is(public.join_session('WRN003'), null::uuid, 'wrong code 3 returns no session (NULL)');
select is(public.join_session('WRN004'), null::uuid, 'wrong code 4 returns no session (NULL)');
select is(public.join_session('WRN005'), null::uuid, 'wrong code 5 returns no session (NULL)');
select is(pg_temp.attempts('00000000-0000-4000-8000-00000000a002', true), 5::bigint,
  'the five failed tries are recorded');
select throws_ok(
  $$ select public.join_session('LIM007') $$,
  '53400',
  'join_session: too many attempts. Wait 10 minutes and try again.',
  'the sixth try is refused with the lockout error, even with the right code'
);
select is(pg_temp.attempts('00000000-0000-4000-8000-00000000a002', true), 5::bigint,
  'the refused sixth try is not recorded (its error rolls back its write)');

-- ---------------------------------------------------------------------------
-- 2. Another device is unaffected by the first device's failures.
-- ---------------------------------------------------------------------------
select pg_temp.become('00000000-0000-4000-8000-00000000a003', 'authenticated');
select is(public.join_session('LIM007'), '80000000-0000-4000-8000-000000000001'::uuid,
  'another device joins with the right code while the first is locked out');
select is(pg_temp.attempts('00000000-0000-4000-8000-00000000a003', true), 0::bigint,
  'the other device has no failed tries');

-- ---------------------------------------------------------------------------
-- 3. Successful joins do not count. Five successes, then four failures, still leave the device free.
-- ---------------------------------------------------------------------------
select pg_temp.become('00000000-0000-4000-8000-00000000a004', 'authenticated');
select is(
  (select count(*) from (select public.join_session('LIM007') from generate_series(1, 5)) s where s.join_session is not null),
  5::bigint,
  'five successful joins'
);
select is(
  (select count(*) from (select public.join_session('NOPE01') from generate_series(1, 4)) s where s.join_session is null),
  4::bigint,
  'four failed tries after five successes are all allowed'
);
select is(public.join_session('LIM007'), '80000000-0000-4000-8000-000000000001'::uuid,
  'the device can still join: the successes did not count');
select is(pg_temp.attempts('00000000-0000-4000-8000-00000000a004', true), 4::bigint,
  'only the four failed tries are recorded as failures');

-- ---------------------------------------------------------------------------
-- 4. Failures older than 10 minutes do not count: after 11 minutes the locked device can join.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select pg_temp.age_attempts('00000000-0000-4000-8000-00000000a002', interval '11 minutes') $$,
  'the first device failures are moved back 11 minutes (owner, test setup)'
);
select pg_temp.become('00000000-0000-4000-8000-00000000a002', 'authenticated');
select is(public.join_session('LIM007'), '80000000-0000-4000-8000-000000000001'::uuid,
  'after 11 minutes the device can join with the right code');

-- ---------------------------------------------------------------------------
-- 5. Tries older than one day are deleted by the next call.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select pg_temp.add_old_attempt('00000000-0000-4000-8000-00000000a003', interval '2 days') $$,
  'an old try two days back is added for the second device (owner, test setup)'
);
select is(pg_temp.older_than_day('00000000-0000-4000-8000-00000000a003'), 1::bigint,
  'the old try is in the table before the next call');
select pg_temp.become('00000000-0000-4000-8000-00000000a003', 'authenticated');
select is(public.join_session('LIM007'), '80000000-0000-4000-8000-000000000001'::uuid,
  'the device joins again');
select is(pg_temp.older_than_day('00000000-0000-4000-8000-00000000a003'), 0::bigint,
  'the try older than one day was deleted by join_session');

-- ---------------------------------------------------------------------------
-- 6. Clients cannot read or write join_attempts.
-- ---------------------------------------------------------------------------
select pg_temp.become('00000000-0000-4000-8000-00000000a002', 'authenticated');
select is(
  pg_temp.err_state($$ select count(*) from public.join_attempts $$),
  '42501',
  'an authenticated device cannot select join_attempts'
);
select is(
  pg_temp.err_state($$ insert into public.join_attempts (device_id, ok)
     values ('00000000-0000-4000-8000-00000000a002', true) $$),
  '42501',
  'an authenticated device cannot insert into join_attempts'
);
select is(
  pg_temp.err_state($$ update public.join_attempts set ok = true $$),
  '42501',
  'an authenticated device cannot update join_attempts'
);
select is(
  pg_temp.err_state($$ delete from public.join_attempts $$),
  '42501',
  'an authenticated device cannot delete from join_attempts'
);
select pg_temp.become('00000000-0000-4000-8000-00000000a002', 'anon');
select is(
  pg_temp.err_state($$ select count(*) from public.join_attempts $$),
  '42501',
  'the anon role cannot select join_attempts'
);

-- ---------------------------------------------------------------------------
-- 7. A signed-in user with no registered device is refused before anything is counted.
-- ---------------------------------------------------------------------------
select pg_temp.become('00000000-0000-4000-8000-00000000a005', 'authenticated');
select is(
  pg_temp.err_state($$ select public.join_session('LIM007') $$),
  '42501',
  'a signed-in user with no registered device cannot join, even with the right code'
);
select is(
  pg_temp.err_state($$ select public.join_session('WRN009') $$),
  '42501',
  'an unregistered user with a wrong code is refused the same way (not counted)'
);
select is(pg_temp.attempts('00000000-0000-4000-8000-00000000a005', false), 0::bigint,
  'nothing is recorded for the unregistered user');

-- ---------------------------------------------------------------------------
-- 8. Table and function settings (owner view).
-- ---------------------------------------------------------------------------
select ok(
  (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'join_attempts'),
  'RLS is enabled on join_attempts'
);
select ok(not has_table_privilege('authenticated', 'public.join_attempts', 'SELECT'),
  'authenticated has no privilege on join_attempts');
select ok(not has_table_privilege('anon', 'public.join_attempts', 'SELECT'),
  'anon has no privilege on join_attempts');
select ok(not has_table_privilege('service_role', 'public.join_attempts', 'SELECT'),
  'service_role has no privilege on join_attempts');
select ok(
  (select p.prosecdef and array_to_string(p.proconfig, ',') like '%search_path=%'
     from pg_proc p where p.oid = 'public.join_session(text)'::regprocedure),
  'join_session is still SECURITY DEFINER with a fixed search_path'
);
select is(pg_get_function_result('public.join_session(text)'::regprocedure), 'uuid',
  'join_session still returns uuid');

select * from finish();
rollback;
