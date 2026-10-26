-- Two-phone sync (milestone M5, decision D-06: dashboard-authoritative deterministic replay).
--
-- The dashboard phone owns the simulated clock and the official input log of its live session.
-- Other phones never write official inputs. They write REQUESTS (input_requests). The dashboard
-- stamps each request at its current simulated minute, appends it to session_inputs and marks the
-- request applied (or rejected). Every phone replays session_inputs with the same engine.
--
-- Clients read through RLS. A session's data (row, inputs, lots, events) is visible only to its
-- creator (the dashboard) and to devices that joined it with join_session(code).

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- A 6-character join code, A-Z and 0-9, from the server's random uuid bytes.
create function public.generate_join_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  raw_bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  code text := '';
begin
  for i in 0..5 loop
    code := code || substr(alphabet, (get_byte(raw_bytes, i) % 36) + 1, 1);
  end loop;
  return code;
end $$;

-- Shape check for an EngineInput (src/engine/types.ts): LOT_POSTED, CANCEL_DRIVER, DRIVER_RESPONSE.
create function public.is_engine_input(j jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(j) = 'object' and case j->>'type'
    when 'LOT_POSTED' then jsonb_typeof(j->'lot') = 'object'
    when 'CANCEL_DRIVER' then j ? 'lotId'
    when 'DRIVER_RESPONSE' then j ? 'driverId' and j ? 'lotId'
      and j->>'answer' in ('offer', 'decline', 'commit', 'withdraw')
    else false
  end
$$;

-- ---------------------------------------------------------------------------
-- live_sessions: join code and the dashboard-owned simulated clock
-- ---------------------------------------------------------------------------
alter table public.live_sessions
  add column join_code text not null default public.generate_join_code() unique
    check (join_code ~ '^[A-Z0-9]{6}$'),
  -- Simulated minute of the day. 1020 = 17:00, the start of the evening (SIM_START_MINUTE).
  add column clock_minute int not null default 1020 check (clock_minute between 0 and 1439),
  add column clock_running boolean not null default false,
  add column seconds_per_minute numeric not null default 6 check (seconds_per_minute > 0),
  add column clock_updated_at timestamptz not null default now(),
  -- Driver ids (V01-V40) held by people. Only settable before the clock starts (see the guard below).
  add column held_drivers text[] not null default '{}'
    check (array_to_string(held_drivers, ',', '#') ~ '^(V[0-9]{2}(,V[0-9]{2})*)?$');

-- held_drivers may change only while clock_minute = 1020 and the clock is stopped (before and after
-- the change). Every held driver must be a real driver row.
create function public.live_sessions_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and cardinality(new.held_drivers) > 0
     and (new.clock_minute <> 1020 or new.clock_running) then
    raise exception 'live_sessions: held_drivers can be set only while the clock is at 1020 and stopped';
  end if;
  if tg_op = 'UPDATE' and new.held_drivers is distinct from old.held_drivers
     and (old.clock_minute <> 1020 or old.clock_running or new.clock_minute <> 1020 or new.clock_running) then
    raise exception 'live_sessions: held_drivers can change only while the clock is at 1020 and stopped';
  end if;
  if exists (select 1 from unnest(new.held_drivers) as h(id)
             where not exists (select 1 from public.drivers d where d.id = h.id)) then
    raise exception 'live_sessions: unknown driver in held_drivers';
  end if;
  return new;
end $$;

create trigger live_sessions_guard before insert or update on public.live_sessions
  for each row execute function public.live_sessions_guard();

revoke execute on function public.live_sessions_guard() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- session_members: which devices joined which session
-- ---------------------------------------------------------------------------
create table public.session_members (
  session_id uuid not null references public.live_sessions (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (session_id, device_id)
);

alter table public.session_members enable row level security;
revoke all on public.session_members from anon, authenticated;
grant select on public.session_members to authenticated;
grant select on public.session_members to service_role;
-- No insert, update or delete grant: membership is written only by join_session().

create policy session_members_read_own on public.session_members for select to authenticated
  using (device_id = (select auth.uid()));

-- Join a live session with its code. The caller must be a registered device.
create function public.join_session(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_session uuid;
begin
  if v_me is null or not exists (select 1 from public.devices d where d.id = v_me) then
    raise exception 'join_session: register the device first' using errcode = '42501';
  end if;
  select s.id into v_session from public.live_sessions s
   where s.join_code = upper(trim(p_code));
  if v_session is null then
    raise exception 'join_session: no session has that code' using errcode = 'P0002';
  end if;
  insert into public.session_members (session_id, device_id) values (v_session, v_me)
    on conflict (session_id, device_id) do nothing;
  return v_session;
end $$;

revoke execute on function public.join_session(text) from public, anon;
grant execute on function public.join_session(text) to authenticated;

-- ---------------------------------------------------------------------------
-- session_inputs: the official input log, written only by the session's creator (the dashboard)
-- ---------------------------------------------------------------------------
create table public.session_inputs (
  session_id uuid not null references public.live_sessions (id) on delete cascade,
  seq int not null check (seq >= 1),
  at_minute int not null check (at_minute between 0 and 1439),
  input jsonb not null check (public.is_engine_input(input)),
  created_at timestamptz not null default now(),
  primary key (session_id, seq)
);

alter table public.session_inputs enable row level security;
revoke all on public.session_inputs from anon, authenticated;
grant select, insert on public.session_inputs to authenticated;
grant select on public.session_inputs to service_role;

-- ---------------------------------------------------------------------------
-- input_requests: what other phones ask the dashboard to stamp
-- ---------------------------------------------------------------------------
create table public.input_requests (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.live_sessions (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  input jsonb not null check (public.is_engine_input(input)),
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  applied_seq int,
  reason text check (reason is null or char_length(reason) <= 300),
  constraint input_requests_applied_seq_fk foreign key (session_id, applied_seq)
    references public.session_inputs (session_id, seq),
  check (
    (status = 'pending' and applied_seq is null and reason is null)
    or (status = 'applied' and applied_seq is not null and reason is null)
    or (status = 'rejected' and applied_seq is null and reason is not null)
  )
);

create index input_requests_session_status_idx on public.input_requests (session_id, status);

alter table public.input_requests enable row level security;
revoke all on public.input_requests from anon, authenticated;
grant select, insert on public.input_requests to authenticated;
grant update (status, applied_seq, reason) on public.input_requests to authenticated;
grant usage on sequence public.input_requests_id_seq to authenticated;
grant select on public.input_requests to service_role;

-- ---------------------------------------------------------------------------
-- live_sessions: grants and RLS (sessions are visible to their creator and members)
-- ---------------------------------------------------------------------------
revoke insert on public.live_sessions from authenticated;
-- join_code and the clock defaults are server-side: a client cannot choose a join code.
grant insert (id, evening_id, policy, created_by, started_at) on public.live_sessions to authenticated;
revoke update on public.live_sessions from authenticated;
grant update (ended_at, clock_minute, clock_running, seconds_per_minute, clock_updated_at, held_drivers)
  on public.live_sessions to authenticated;

drop policy live_sessions_read on public.live_sessions;
drop policy live_sessions_end_own on public.live_sessions;

create policy live_sessions_read on public.live_sessions for select to authenticated
  using (
    created_by = (select auth.uid())
    or exists (select 1 from public.session_members m
               where m.session_id = live_sessions.id and m.device_id = (select auth.uid()))
  );
-- The creator (the dashboard) moves the clock, holds drivers and ends the session. Only granted columns change.
create policy live_sessions_update_creator on public.live_sessions for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- session_inputs RLS
-- ---------------------------------------------------------------------------
create policy session_inputs_read on public.session_inputs for select to authenticated
  using (
    exists (select 1 from public.live_sessions s
            where s.id = session_inputs.session_id and s.created_by = (select auth.uid()))
    or exists (select 1 from public.session_members m
               where m.session_id = session_inputs.session_id and m.device_id = (select auth.uid()))
  );
create policy session_inputs_insert_creator on public.session_inputs for insert to authenticated
  with check (
    exists (select 1 from public.live_sessions s
            where s.id = session_inputs.session_id and s.created_by = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- input_requests RLS
-- ---------------------------------------------------------------------------
-- Members read their own requests; the creator reads every request of its session.
create policy input_requests_read on public.input_requests for select to authenticated
  using (
    device_id = (select auth.uid())
    or exists (select 1 from public.live_sessions s
               where s.id = input_requests.session_id and s.created_by = (select auth.uid()))
  );
-- A member asks for an input of a kind its role may send, and only as itself, and only as a new pending row.
--   donor     -> LOT_POSTED for its own donor id
--   driver    -> DRIVER_RESPONSE for its own driver id
--   dashboard -> any engine input (it also writes session_inputs directly)
--   pantry    -> nothing
create policy input_requests_insert_member on public.input_requests for insert to authenticated
  with check (
    device_id = (select auth.uid())
    and status = 'pending' and applied_seq is null and reason is null
    and exists (select 1 from public.session_members m
                where m.session_id = input_requests.session_id and m.device_id = (select auth.uid()))
    and exists (
      select 1 from public.devices d
      where d.id = (select auth.uid())
        and (
          (d.role = 'donor' and input_requests.input->>'type' = 'LOT_POSTED'
             and input_requests.input#>>'{lot,donorId}' = d.profile_id)
          or (d.role = 'driver' and input_requests.input->>'type' = 'DRIVER_RESPONSE'
             and input_requests.input->>'driverId' = d.profile_id)
          or d.role = 'dashboard'
        )
    )
  );
-- The creator marks a request applied or rejected. Only status, applied_seq and reason are granted.
create policy input_requests_update_creator on public.input_requests for update to authenticated
  using (exists (select 1 from public.live_sessions s
                 where s.id = input_requests.session_id and s.created_by = (select auth.uid())))
  with check (exists (select 1 from public.live_sessions s
                      where s.id = input_requests.session_id and s.created_by = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- lots and events: members read, only the creator writes (lots: the dashboard only)
-- ---------------------------------------------------------------------------
drop policy lots_read on public.lots;
drop policy lots_insert_creator on public.lots;
drop policy events_read on public.events;

create policy lots_read on public.lots for select to authenticated
  using (
    exists (select 1 from public.live_sessions s
            where s.id = lots.session_id and s.created_by = (select auth.uid()))
    or exists (select 1 from public.session_members m
               where m.session_id = lots.session_id and m.device_id = (select auth.uid()))
  );
-- Donors no longer post lots directly: they send an input_requests row, and the dashboard stamps it.
create policy lots_insert_dashboard on public.lots for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.live_sessions s
                where s.id = lots.session_id and s.created_by = (select auth.uid()))
    and exists (select 1 from public.devices d
                where d.id = (select auth.uid()) and d.role = 'dashboard')
  );

create policy events_read on public.events for select to authenticated
  using (
    exists (select 1 from public.live_sessions s
            where s.id = events.session_id and s.created_by = (select auth.uid()))
    or exists (select 1 from public.session_members m
               where m.session_id = events.session_id and m.device_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Realtime (M5): phones follow the clock, the input log, the requests, and the lots and events.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.live_sessions, public.session_inputs, public.input_requests;
