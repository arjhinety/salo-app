-- Schema guard: the table set, the forbidden columns, RLS, seeded reference counts, and anon access.
begin;
select plan(8);

select is(
  (select array_agg(table_name::text order by table_name)
     from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'),
  array['devices', 'donors', 'drivers', 'events', 'input_requests', 'live_sessions', 'lots', 'pantries',
        'parse_requests', 'session_inputs', 'session_members'],
  'public holds exactly the eleven planned tables (no dataset messages, no pilot or main evening tables)'
);

select is(
  (select count(*) from information_schema.columns
    where table_schema = 'public'
      and (column_name = 'message_text' or left(column_name, 5) = 'gold_')),
  0::bigint,
  'no column named message_text or gold_* in public'
);

select ok(
  not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  'RLS is enabled on every public table'
);

select is((select count(*) from public.donors), 50::bigint, 'donors: 50 rows, as in donors.csv');
select is((select count(*) from public.pantries), 30::bigint, 'pantries: 30 rows, as in pantries.csv');
select is((select count(*) from public.drivers), 40::bigint, 'drivers: 40 rows, as in drivers.csv');

select is(
  (select count(*) from (
     select row_to_json(x)::text as t from public.donors x
     union all select row_to_json(x)::text from public.pantries x
     union all select row_to_json(x)::text from public.drivers x) s
   where s.t ~ '\mE(1[1-9]|2[0-9]|30)\M'),
  0::bigint,
  'reference data holds no pilot or main evening ids (E11-E30)'
);

select is(
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'),
  0::bigint,
  'anon has no table privileges in public'
);

select * from finish();
rollback;
