# Handoff: mobile-data, held-driver RPC and watch-only in the database (M5, 2026-10-26)

Project `salo`, ref `usslrxpftaupvropfkzl` (checked against `supabase/.temp/project-ref` before every remote command). Remote only. Nothing committed or pushed. `supabase config push` and `db reset --linked` were not run. No emulator, Metro, Gradle or app build.

This closes the two database gaps in the mobile-feature handoff (2026-10-26-mobile-feature-sync.md, "Blockers" 1 and 2):

1. The creator (dashboard) can read its joined driver phones, so held drivers can be set at 17:00.
2. A `DRIVER_RESPONSE` request is accepted only from a driver device whose driver id is in the session's `held_drivers`. A driver who joins after the start is refused by the database.

## What changed

### Database: `supabase/migrations/20261026120000_held_driver_rpc.sql` (new)

- `session_driver_members(p_session uuid) returns table (device_id uuid, driver_id text, joined_at timestamptz)`: `language plpgsql security definer set search_path = ''`. Raises `42501` unless `auth.uid()` is the session's `created_by`. Returns the members whose device role is `driver` with a non-null `profile_id`, ordered by `joined_at`. Execute revoked from `public`, `anon` and `service_role`; granted to `authenticated` only.
- `input_requests_insert_member` is dropped and recreated. New clause: when `input->>'type' = 'DRIVER_RESPONSE'`, the device must be a `driver` device whose `profile_id` is in `live_sessions.held_drivers` of that session. The existing own-driver-id rule for drivers is kept.
- Consequence: a `DRIVER_RESPONSE` request from the dashboard role is refused as well, because the dashboard has no driver id. The dashboard writes `session_inputs` directly and never needs to request one.

### Tests (pgTAP)

- `supabase/tests/50_held_driver_rpc.test.sql` (new, 24 assertions, one transaction, rolled back). It covers the creator getting the two driver members (not the donor member); the driver ids and device ids; a non-creator member refused; a non-member refused; the anon role refused; grants (authenticated yes, anon no, PUBLIC none); SECURITY DEFINER with a pinned search_path; a held driver's request accepted; a joined-but-unheld driver refused; the dashboard refused for `DRIVER_RESPONSE`; after the clock starts, a driver who joins late refused, the held driver still accepted; the creator still reads all three joined drivers after the start.
- Earlier files are unchanged. The 111 earlier assertions still pass (see results).

### App

- `src/backend/sessionApi.ts`: `readJoined` (which the RLS blocked) is replaced by `readDriverMembers(id): Promise<DriverMember[]>` (`DriverMember = { deviceId, driverId }`), implemented as `client.rpc('session_driver_members', { p_session: id })`. `JoinedDevice` is removed; nothing else used it.
- `src/backend/dashboardSession.ts`: `chooseHeldFromRoster` calls `readDriverMembers` instead of `readJoined`, dedupes the driver ids, and keeps the same rule (only at 17:00 with the clock stopped; once per session). Nothing else in the file changed.
- `src/backend/__tests__/fakeSessionBus.ts` (test helper): `readDriverMembers` is creator-only and returns the joined driver devices; `insertRequest` applies the held rule for `DRIVER_RESPONSE`; the `rosterVisible` switch is removed; the dashboard role cannot send `DRIVER_RESPONSE`.
- `src/backend/__tests__/sessionRpc.test.ts` (new, the RPC call-shape test): asserts `rpc('session_driver_members', { p_session })`, the row mapping, and that a `42501` becomes a `refused` SessionError.
- `src/backend/__tests__/heldDrivers.test.ts` and `twoPhone.test.ts`: expectations changed where the new database rule changes the outcome (see "Test expectations changed").

## Commands and real output

Project ref check: `usslrxpftaupvropfkzl` (match).

Dry run: `supabase db push --linked --dry-run` printed `Would push these migrations: • 20261026120000_held_driver_rpc.sql`.

Push: `supabase db push --linked --yes` (password from `supabase/.env` read in the same command, not printed). Output ended with `Finished supabase db push.`. Before that it printed an unrelated `event loop error ... pgdelta-target-ca.crt ENOENT` from the CLI's schema sidecar. The migration list below confirms the migration was applied.

`supabase migration list --linked`:

```
{"migrations":[{"local":"20261026100000","remote":"20261026100000",...},{"local":"20261026100100","remote":"20261026100100",...},{"local":"20261026100200","remote":"20261026100200",...},{"local":"20261026110000","remote":"20261026110000",...},{"local":"20261026120000","remote":"20261026120000","time":"2026-10-26 12:00:00"}],"message":"Migrations listed"}
```

`supabase test db --linked supabase/tests` (second run; the first run failed on a transient DNS error for `aws-0-ap-southeast-1.pooler.supabase.com` in files 00 and 10, which were then rerun):

```
/.../00_schema_guard.test.sql ............... ok
/.../10_devices_rls.test.sql ................ ok
/.../20_parse_requests.test.sql ............. ok
/.../30_live_sessions_lots_events.test.sql .. ok
/.../40_two_phone_sync.test.sql ............. ok
/.../50_held_driver_rpc.test.sql ............ ok
All tests successful.
Files=6, Tests=135, 62 wallclock secs
Result: PASS
```

135 = 111 earlier + 24 new. The output is also saved in the scratchpad (`pgtap_2.txt`).

`npx tsc --noEmit`: exit 0, no output.

`npx jest src/backend`: `Test Suites: 1 skipped, 9 passed, 9 of 10 total` and `Tests: 1 skipped, 85 passed, 86 total`. The skipped one is `sessionIT.test.ts` (live, needs `SYNC_IT=1`).

## Test expectations changed (for review)

These are forced by the new database rule. The fake now refuses what the database refuses.

1. `heldDrivers.test.ts`, "the roster is the creator's alone": was "under the current rules the creator cannot read the members, so no driver is held". Now a non-creator member gets the RPC refusal.
2. `heldDrivers.test.ts`, "from the roster": the `rosterVisible` switch is gone; the creator reads the roster through the RPC, so the joined driver is held at 17:00.
3. `heldDrivers.test.ts`, late driver: the refused answer is no longer a request row with a dashboard reason. The database refuses the insert (`input_requests: this role may not send that input`), so no row reaches the dashboard and the follower shows that reason.
4. `twoPhone.test.ts`, "an unheld driver is refused": same change as 3. The rejection with "driver V21 is not held in this session" now comes from the database; the dashboard-side rejection stays in the code as a second check.

## Decisions for review

1. **Dashboard cannot send `DRIVER_RESPONSE` requests.** The rule was "allowed only if the driver id is held", and the dashboard has no driver id, so it is refused. This matches the app (the dashboard writes `session_inputs` directly).
2. **The held set at 17:00 is the joined driver phones.** The dashboard replaces `held_drivers` with the roster on each pass while the clock is at 17:00 and stopped (the existing design). Nothing in `src/` sets held drivers by hand (only `chooseHeldFromRoster` calls `setHeldDrivers`), so the roster is the only source. The earlier code, with the roster unreadable, would have written an empty set on each pass; now it writes the real set.
3. `session_driver_members` returns `joined_at`; the app maps only the device id and the driver id.

## Not run

- `SYNC_IT=1` live integration test (`sessionIT.test.ts`). It writes rows to the remote, and I did not re-run it after this change. The RPC path it would exercise is covered only by the stub-client test (`sessionRpc.test.ts`) and by pgTAP 50 on the database side.
- Any app build, emulator or device check (memory rule).

## Risks and open items

- **Join-code guessing** (unchanged from the schema handoff): no attempt limit on `join_session`.
- **Held set is still written by the dashboard**, not checked by the database against the roster. The database checks only that held ids are real drivers and that the set changes at 17:00 stopped. A dashboard can hold any real driver id.
- **A driver device is held by its self-declared profile id** (unchanged). The held rule trusts the profile id on the device row, which the device declares itself.
- **Rows from earlier integration runs** are still in the remote (two `live_sessions` rows from the SYNC_IT run, listed in the mobile-feature handoff for the orchestrator to delete). This work's tests create no rows (each file rolls back).
- `session_driver_members` returns every joined driver, including drivers who joined after the start. The dashboard uses the list only at 17:00 stopped; later the held set is fixed by the store.
- The CLI's pg-delta sidecar printed a certificate error during `db push` (see Commands). The migration was applied and verified with `migration list`.

## Files touched

- `supabase/migrations/20261026120000_held_driver_rpc.sql` (new)
- `supabase/tests/50_held_driver_rpc.test.sql` (new, 24)
- `src/backend/sessionApi.ts`
- `src/backend/dashboardSession.ts`
- `src/backend/__tests__/fakeSessionBus.ts` (test helper)
- `src/backend/__tests__/sessionRpc.test.ts` (new)
- `src/backend/__tests__/heldDrivers.test.ts` (expectations listed above)
- `src/backend/__tests__/twoPhone.test.ts` (one test, expectations listed above)
- `docs/handoffs/2026-10-26-mobile-data-held-driver-rpc.md` (this file)

Not touched: other `src/` files, `server/`, `supabase/functions/`, `supabase/config.toml`, `supabase/.env`, `supabase/seed.sql`, git.
