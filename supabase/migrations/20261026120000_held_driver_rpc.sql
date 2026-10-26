-- Held drivers and watch-only, enforced in the database (M5 gaps from the two-phone sync work).
--
-- 1. The creator (the dashboard) reads the driver phones that joined its session, with their driver ids, so it can
--    fill held_drivers at 17:00. session_members and devices are readable only for the device itself, so this is the
--    one way the creator sees its roster.
-- 2. A DRIVER_RESPONSE request is accepted only from a driver phone whose driver id is in the session's held_drivers
--    (on top of the own-driver-id rule). A driver who joined after the start is not held, so the database refuses it.

-- ---------------------------------------------------------------------------
-- 1. session_driver_members(session): creator only
-- ---------------------------------------------------------------------------
create function public.session_driver_members(p_session uuid)
returns table (device_id uuid, driver_id text, joined_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.live_sessions s
     where s.id = p_session and s.created_by = auth.uid()
  ) then
    raise exception 'session_driver_members: only the session creator can read its members'
      using errcode = '42501';
  end if;
  return query
    select m.device_id, d.profile_id, m.joined_at
      from public.session_members m
      join public.devices d on d.id = m.device_id
     where m.session_id = p_session
       and d.role = 'driver'
       and d.profile_id is not null
     order by m.joined_at, m.device_id;
end $$;

revoke execute on function public.session_driver_members(uuid) from public, anon, service_role;
grant execute on function public.session_driver_members(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. input_requests: a DRIVER_RESPONSE needs a held driver device
-- ---------------------------------------------------------------------------
drop policy input_requests_insert_member on public.input_requests;

create policy input_requests_insert_member on public.input_requests for insert to authenticated
  with check (
    device_id = (select auth.uid())
    and status = 'pending' and applied_seq is null and reason is null
    and exists (select 1 from public.session_members m
                where m.session_id = input_requests.session_id and m.device_id = (select auth.uid()))
    -- A driver response is sent only by a driver device whose driver id the session holds.
    and (
      input_requests.input->>'type' <> 'DRIVER_RESPONSE'
      or exists (
        select 1 from public.devices d
        join public.live_sessions s on s.id = input_requests.session_id
        where d.id = (select auth.uid())
          and d.role = 'driver'
          and d.profile_id = any (s.held_drivers)
      )
    )
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
