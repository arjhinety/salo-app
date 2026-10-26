-- Devices and live play: the anonymous identity of each phone, live sessions (tuning evenings only),
-- posted lots and the engine event log written by the dashboard phone.
-- Anonymous users are `authenticated` with auth.jwt() ->> 'is_anonymous' = 'true'. Ownership is
-- checked through auth.uid(). A device's role and profile are self-declared (no login links a
-- person to a donor id); the protection here is ownership of rows, not identity.

-- ---------------------------------------------------------------------------
-- devices: one row per anonymous user
-- ---------------------------------------------------------------------------
create table public.devices (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('donor', 'pantry', 'driver', 'dashboard')),
  profile_id text,
  created_at timestamptz not null default now(),
  constraint devices_profile_matches_role check (
    (role = 'dashboard' and profile_id is null)
    or (role = 'donor' and profile_id is not null and profile_id ~ '^D[0-9]{2}$')
    or (role = 'pantry' and profile_id is not null and profile_id ~ '^P[0-9]{2}$')
    or (role = 'driver' and profile_id is not null and profile_id ~ '^V[0-9]{2}$')
  )
);

-- Role, profile and identity are fixed once a device exists, and the profile must be a real row.
create function public.devices_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.role is distinct from old.role
    or new.profile_id is distinct from old.profile_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'devices: id, role, profile_id and created_at cannot change';
  end if;
  if new.role = 'donor' and not exists (select 1 from public.donors where id = new.profile_id) then
    raise exception 'devices: unknown donor %', new.profile_id;
  end if;
  if new.role = 'pantry' and not exists (select 1 from public.pantries where id = new.profile_id) then
    raise exception 'devices: unknown pantry %', new.profile_id;
  end if;
  if new.role = 'driver' and not exists (select 1 from public.drivers where id = new.profile_id) then
    raise exception 'devices: unknown driver %', new.profile_id;
  end if;
  return new;
end $$;

create trigger devices_guard before insert or update on public.devices
  for each row execute function public.devices_guard();

revoke execute on function public.devices_guard() from public, anon, authenticated;

alter table public.devices enable row level security;
revoke all on public.devices from anon, authenticated;
grant select, insert, update on public.devices to authenticated;
grant select on public.devices to service_role;

create policy devices_select_own on public.devices for select to authenticated
  using (id = (select auth.uid()));
create policy devices_insert_own on public.devices for insert to authenticated
  with check (id = (select auth.uid()));
create policy devices_update_own on public.devices for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- live_sessions: one per live play of a tuning evening (E01-E10 only, decision D-06 and docs/decisions.md)
-- ---------------------------------------------------------------------------
create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  evening_id text not null check (evening_id in ('E01', 'E02', 'E03', 'E04', 'E05',
    'E06', 'E07', 'E08', 'E09', 'E10')),
  policy text not null check (policy in ('salo', 'fcfs', 'nearest', 'central_greedy')),
  created_by uuid not null references public.devices (id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at),
  -- Lets events reference the session's policy, so an event cannot carry another policy.
  unique (id, policy)
);

alter table public.live_sessions enable row level security;
revoke all on public.live_sessions from anon, authenticated;
grant select, insert on public.live_sessions to authenticated;
grant update (ended_at) on public.live_sessions to authenticated;
grant select on public.live_sessions to service_role;

create policy live_sessions_read on public.live_sessions for select to authenticated using (true);
-- Only a dashboard device may open a session, and only as itself.
create policy live_sessions_insert_dashboard on public.live_sessions for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (select 1 from public.devices d
                where d.id = (select auth.uid()) and d.role = 'dashboard')
  );
-- The creator may end its own session. Only ended_at is grantable, so nothing else changes.
create policy live_sessions_end_own on public.live_sessions for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- lots: one row per live lot, posted by a donor phone (or the dashboard, which runs the demo)
-- ---------------------------------------------------------------------------
create table public.lots (
  session_id uuid not null references public.live_sessions (id) on delete cascade,
  lot_id text not null check (lot_id ~ '^LIVE-[0-9]+$'),
  donor_id text not null references public.donors (id),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 10),
  est_kg numeric not null check (est_kg > 0),
  load_units int not null check (load_units > 0),
  posted_minute int not null check (posted_minute between 960 and 1320),
  pickup_by_minute int not null check (pickup_by_minute between 960 and 1320
    and pickup_by_minute > posted_minute),
  origin text not null default 'live' check (origin = 'live'),
  created_by uuid not null references public.devices (id),
  created_at timestamptz not null default now(),
  -- One lot id per session. The same LIVE-n may appear in another session.
  primary key (session_id, lot_id)
);

alter table public.lots enable row level security;
revoke all on public.lots from anon, authenticated;
grant select, insert on public.lots to authenticated;
grant select on public.lots to service_role;

create policy lots_read on public.lots for select to authenticated using (true);
-- A lot is posted by its creator: the dashboard, or a donor phone for its own donor id only.
create policy lots_insert_creator on public.lots for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.devices d
      where d.id = (select auth.uid())
        and (d.role = 'dashboard' or (d.role = 'donor' and d.profile_id = lots.donor_id))
    )
  );

-- ---------------------------------------------------------------------------
-- events: the engine log. Only the dashboard phone that created the session writes it (decision D-03).
-- ---------------------------------------------------------------------------
create table public.events (
  session_id uuid not null,
  seq int not null check (seq >= 1),
  at_minute int not null check (at_minute between 0 and 1439),
  policy text not null,
  event jsonb not null check (jsonb_typeof(event) = 'object' and event ? 'type'),
  created_at timestamptz not null default now(),
  primary key (session_id, seq),
  foreign key (session_id, policy) references public.live_sessions (id, policy) on delete cascade
);

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;
grant select, insert on public.events to authenticated;
grant select on public.events to service_role;

create policy events_read on public.events for select to authenticated using (true);
create policy events_insert_session_creator on public.events for insert to authenticated
  with check (
    exists (select 1 from public.live_sessions s
            where s.id = events.session_id and s.created_by = (select auth.uid()))
  );

-- Realtime (M5 sync): phones subscribe to lot and event changes.
alter publication supabase_realtime add table public.lots, public.events;
