-- parse_requests: written only by the service role (the Edge Function). Clients read their own rows only.
begin;
select plan(10);

create function pg_temp.err_state(stmt text) returns text language plpgsql as $$
begin
  execute stmt;
  return 'no error';
exception when others then
  return sqlstate;
end $$;

insert into auth.users (id, aud, role, is_anonymous) values
  ('00000000-0000-4000-8000-000000000a01', 'authenticated', 'authenticated', true),
  ('00000000-0000-4000-8000-000000000b01', 'authenticated', 'authenticated', true);

insert into public.devices (id, role, profile_id) values
  ('00000000-0000-4000-8000-000000000a01', 'donor', 'D01'),
  ('00000000-0000-4000-8000-000000000b01', 'donor', 'D02');

-- The Edge Function writes rows with the service role.
set local role service_role;
select lives_ok(
  $$ insert into public.parse_requests (device_id, text, http_status, model, request_config_sha256)
     values ('00000000-0000-4000-8000-000000000a01', 'may 3 trays adobo', 200, 'claude-haiku-5-5',
             repeat('a', 64)),
            ('00000000-0000-4000-8000-000000000b01', 'bread 10 pcs before 8', 200, 'claude-haiku-5-5',
             repeat('a', 64)) $$,
  'the service role inserts parse requests'
);
select is(
  pg_temp.err_state($$ insert into public.parse_requests (device_id, text)
                       values ('00000000-0000-4000-8000-000000000a01', repeat('x', 501)) $$),
  '23514',
  'text longer than 500 characters is rejected'
);
reset role;

-- Device A reads its own rows only.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-4000-8000-000000000a01', 'role', 'authenticated', 'is_anonymous', true)::text,
  true);
set local role authenticated;

select is((select count(*) from public.parse_requests), 1::bigint, 'a client sees only its own parse requests');
select is((select count(*) from public.parse_requests
            where device_id = '00000000-0000-4000-8000-000000000b01'), 0::bigint,
  'a client cannot see another device''s parse requests');

select is(
  pg_temp.err_state($$ insert into public.parse_requests (device_id, text)
                       values ('00000000-0000-4000-8000-000000000a01', 'forged row') $$),
  '42501',
  'a client cannot insert a parse request'
);
select is(
  pg_temp.err_state($$ update public.parse_requests set http_status = 500 $$),
  '42501',
  'a client cannot update parse requests'
);
select is(
  pg_temp.err_state($$ delete from public.parse_requests $$),
  '42501',
  'a client cannot delete parse requests'
);

reset role;
set local role anon;
select is(
  pg_temp.err_state('select count(*) from public.parse_requests'),
  '42501',
  'anon cannot read parse requests'
);
reset role;

select ok(
  exists (select 1 from pg_indexes
           where schemaname = 'public' and tablename = 'parse_requests'
             and indexname = 'parse_requests_device_created_idx'),
  'index (device_id, created_at) exists for the rate limit'
);
select ok(
  exists (select 1 from pg_indexes
           where schemaname = 'public' and tablename = 'parse_requests'
             and indexname = 'parse_requests_created_idx'),
  'index (created_at) exists for the global rate limit'
);

select * from finish();
rollback;
