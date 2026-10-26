-- devices: RLS (own row only), role and profile are frozen, profile must exist, anon has no access.
begin;
select plan(8);

-- Returns the SQLSTATE a statement raises, or 'no error'. Lets each assertion name its error code exactly.
create function pg_temp.err_state(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return 'no error';
exception when others then
  return sqlstate;
end $$;

-- Returns the number of rows a data-modifying statement touched (RLS filtering shows up here).
create function pg_temp.exec_rows(stmt text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;

-- Anonymous users (is_anonymous = true) and their devices. Setup runs as the table owner.
insert into auth.users (id, aud, role, is_anonymous) values
  ('00000000-0000-4000-8000-000000000a01', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-000000000b01', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-000000000c01', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-000000000e01', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-000000000f01', 'authenticated', 'authenticated', true);

insert into public.devices (id, role, profile_id) values
  ('00000000-0000-4000-8000-000000000a01', 'donor', 'D01'),
  ('00000000-0000-4000-8000-000000000b01', 'donor', 'D02'),
  ('00000000-0000-4000-8000-000000000c01', 'dashboard', null);

-- Device A (donor D01) acts as an anonymous authenticated user.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-000000000a01', 'role', 'authenticated', 'is_anonymous', true)::text,
  true);
set local role authenticated;

select is((select count(*) from public.devices), 1::bigint, 'a device sees only its own row');
select is((select id from public.devices), '00000000-0000-4000-8000-000000000a01'::uuid, 'the visible row is its own');

select is(
  pg_temp.err_state($$ insert into public.devices (id, role, profile_id)
                       values ('00000000-0000-4000-8000-000000000f01', 'donor', 'D03') $$),
  '42501',
  'a device cannot insert a row for another user'
);

select is(
  pg_temp.err_state($$ update public.devices set role = 'dashboard', profile_id = null
                        where id = '00000000-0000-4000-8000-000000000a01' $$),
  'P0001',
  'role and profile_id cannot change after the device exists (trigger)'
);

select is(
  pg_temp.exec_rows($$ update public.devices set profile_id = 'D03'
                        where id = '00000000-0000-4000-8000-000000000b01' $$),
  0::bigint,
  'a device cannot update another device (0 rows touched)'
);

-- Device E has no row yet: a donor device must name a real donor.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-000000000e01', 'role', 'authenticated', 'is_anonymous', true)::text,
  true);

select is(
  pg_temp.err_state($$ insert into public.devices (id, role, profile_id)
                       values ('00000000-0000-4000-8000-000000000e01', 'donor', 'D99') $$),
  'P0001',
  'a donor device must name an existing donor (trigger)'
);

select lives_ok(
  $$ insert into public.devices (id, role, profile_id)
     values ('00000000-0000-4000-8000-000000000e01', 'donor', 'D03') $$,
  'a device may insert its own row for an existing donor'
);

reset role;
set local role anon;
select is(
  pg_temp.err_state('select count(*) from public.devices'),
  '42501',
  'anon cannot read devices'
);

select * from finish();
rollback;
