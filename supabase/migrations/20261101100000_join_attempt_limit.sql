-- Join attempt limit: a device may fail to join at most 5 times in any 10 minutes.
--
-- A wrong code returns NULL (no error) so that the failed try is recorded: in PostgreSQL an error raised by a function
-- rolls back everything the function wrote, so a recorded failure must not come with an error. The app turns NULL into
-- "no session has that code". The lockout raises, and that refused try is not recorded (its write would roll back).
-- Successful joins are not counted. Unregistered devices are refused before anything is counted.

-- ---------------------------------------------------------------------------
-- join_attempts: one row per try by a registered device. Written and read only by join_session().
-- ---------------------------------------------------------------------------
create table public.join_attempts (
  device_id uuid not null references public.devices (id) on delete cascade,
  attempted_at timestamptz not null default now(),
  ok boolean not null
);

create index join_attempts_device_time_idx on public.join_attempts (device_id, attempted_at);

alter table public.join_attempts enable row level security;
-- No policy and no client grant: clients cannot read or write it. join_session() (the owner) does.
revoke all on public.join_attempts from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- join_session: same signature and return type as before, with the attempt limit.
-- ---------------------------------------------------------------------------
create or replace function public.join_session(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_session uuid;
  v_recent_failures int;
begin
  if v_me is null or not exists (select 1 from public.devices d where d.id = v_me) then
    raise exception 'join_session: register the device first' using errcode = '42501';
  end if;

  -- One join at a time per device, so parallel calls cannot all pass the count before any of them is recorded.
  perform pg_advisory_xact_lock(hashtextextended(v_me::text, 0));

  delete from public.join_attempts a
   where a.device_id = v_me and a.attempted_at < now() - interval '1 day';

  select count(*) into v_recent_failures from public.join_attempts a
   where a.device_id = v_me and not a.ok and a.attempted_at > now() - interval '10 minutes';
  if v_recent_failures >= 5 then
    raise exception 'join_session: too many attempts. Wait 10 minutes and try again.' using errcode = '53400';
  end if;

  select s.id into v_session from public.live_sessions s
   where s.join_code = upper(trim(p_code));

  insert into public.join_attempts (device_id, ok) values (v_me, v_session is not null);

  if v_session is null then
    return null;
  end if;

  insert into public.session_members (session_id, device_id) values (v_session, v_me)
    on conflict (session_id, device_id) do nothing;
  return v_session;
end $$;

revoke execute on function public.join_session(text) from public, anon;
grant execute on function public.join_session(text) to authenticated;
