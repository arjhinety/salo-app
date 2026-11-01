# Handoff: mobile-security, join attempt limit on join_session (2026-11-01)

Status: **done.** Migration applied to project `salo` (ref `usslrxpftaupvropfkzl`, checked against
`supabase/.temp/project-ref` before the push). pgTAP suite green on salo: 169 tests. App tests, tsc and lint green.
Nothing committed or pushed. `supabase config push` was not run. No other Supabase project was touched.

## What the limit does (decided, option A, approved by the coordinator 2026-11-01)

- A registered device may make at most **5 failed `join_session` tries in any 10 minutes**. A failed try is a wrong code.
- During the lockout, **even the right code is refused** with `join_session: too many attempts. Wait 10 minutes and try
  again.` (SQLSTATE `53400`).
- **Successful joins do not count.**
- A wrong code **returns NULL** (no error), so the failed try can be recorded. The app turns NULL into the existing
  `not-found` error and shows "No session has that code." as before.
- A try by an **unregistered** device is refused first (`42501`, as before) and is not counted.
- Tries older than one day are deleted by the next call.

Why NULL and not an error: in PostgreSQL an error raised by a function rolls back everything the function wrote. A
recorded failure cannot come with a raised error. Checked on salo with a rolled-back probe before the decision.

Consequence: the lockout refusal is not recorded (its write rolls back), so a locked device does not extend its own
lockout. The lockout ends 10 minutes after the 5th failure, not after the last try.

## Residual risk (for the decision record)

- **Per device, not per IP.** A guesser can make new anonymous devices. Anonymous sign-ins are capped at 30 per hour per
  IP address (`supabase/config.toml`, `[auth.rate_limit] anonymous_users = 30`), so one IP reaches about 150 guesses an
  hour. The code space is 36^6, about 2.2 billion, so guessing is still impractical. A per-IP limit is not in this change.
- Concurrent calls from one device are serialised by a transaction advisory lock, so parallel requests cannot all pass
  the count before any is recorded.

## Database

`supabase/migrations/20261101100000_join_attempt_limit.sql` (new):
- `public.join_attempts (device_id uuid not null references devices(id) on delete cascade, attempted_at timestamptz not
  null default now(), ok boolean not null)`, index on (`device_id`, `attempted_at`), RLS enabled, `revoke all` from
  `public, anon, authenticated, service_role`, no policies.
- `join_session(p_code text) returns uuid`, `create or replace`, same signature, security definer, `search_path = ''`.
  Order: registration check (42501) → advisory lock per device → delete this device's tries older than 1 day → count
  failures in the last 10 minutes; 5 or more raises 53400 → look up the code → record `ok` → NULL for an unknown code,
  otherwise the session id (membership written as before).
- Grants unchanged: `execute` revoked from `public, anon`, granted to `authenticated`.

## Tests

- `supabase/tests/07_join_attempt_limit.test.sql` (new, 34 assertions): five wrong codes return NULL and are recorded;
  the sixth try (right code) is refused with the lockout error and not recorded; another device joins while the first
  is locked; five successes then four failures leave the device free; failures 11 minutes old do not count; a try two
  days old is deleted by the next call; authenticated and anon cannot select, insert, update or delete `join_attempts`;
  an unregistered user is refused and nothing is recorded; RLS on; no privilege for authenticated, anon, service_role;
  `join_session` still security definer with a fixed search path and returns `uuid`.
- `supabase/tests/40_two_phone_sync.test.sql` line 165 (approved): the unknown-code assertion changed from `P0002` to
  "returns no session (NULL)". Plan unchanged (53).
- `supabase/tests/00_schema_guard.test.sql` (**not on the approved list; flagged**): the expected public table set gains
  `join_attempts` (eleven → twelve tables, description updated). Without this the existing schema guard fails on the new
  table. Revert only if the new table is not wanted.

### Commands and real output

`supabase db push --linked --dry-run`:
```
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 20261101100000_join_attempt_limit.sql
Finished supabase db push.
```

`supabase db push --linked --yes` (password loaded from `supabase/.env` in the same command, not printed): exit 0,
`Finished supabase db push.` It printed the same `pg-delta` certificate `ENOENT` sidecar message as the earlier pushes
(not an error for the migration).

`supabase migration list --linked`: all six migrations have `remote` set, including `20261101100000`.

`supabase test db --linked supabase/tests` (output saved at `C:\Users\arro\AppData\Local\Temp\claude\C--Users-arro-Downloads-project\18b3e653-8dfc-4340-bc77-528be4ba6250\scratchpad\pgtap_3.txt`):
```
00_schema_guard.test.sql ............... ok
07_join_attempt_limit.test.sql ......... ok
10_devices_rls.test.sql ................ ok
20_parse_requests.test.sql ............. ok
30_live_sessions_lots_events.test.sql .. ok
40_two_phone_sync.test.sql ............. ok
50_held_driver_rpc.test.sql ............ ok
All tests successful.
Files=7, Tests=169, 15 wallclock secs
Result: PASS
```
169 = 135 before (00: 8, 10: 8, 20: 10, 30: 32, 40: 53, 50: 24) + 34 new (07). Docker Desktop was not running and was
started for the pgTAP runner.

Cleanliness after the run (`supabase db query --linked`, read-only): live_sessions 0, devices 0, session_members 0,
session_inputs 0, input_requests 0, lots 0, events 0, parse_requests 0, join_attempts 0, auth.users 0. Reference rows
kept: drivers 40, donors 50, pantries 30.

A write check (not on salo's data): a `do` block with a temp table, which is dropped at the end of its session,
showed that a row inserted before a raised error is gone afterwards (the reason for the NULL return).

## App

- `src/backend/sessionApi.ts`: `SessionErrorKind` gains `'limited'`; `JOIN_LIMIT_MESSAGE`; `toSessionError` maps the
  lockout message to `limited` (checked before `P0002`). `join()` turns a NULL result into `SessionError('not-found')`,
  so the phone shows "No session has that code." as before.
- `src/backend/follower.ts` (`tryJoin`): on `limited`, the code is dropped and the follower leaves the session, so the
  loop does not retry. State `refused`, message `Too many tries. Wait 10 minutes.`
- `src/components/SessionBanner.tsx`: a `refused` state with that message shows `SYNC.join.tooMany`. It appears on the
  role screen the phone opens after joining, same place as the existing "No session has that code." line; the join
  picker itself shows no follower state today.
- `src/i18n/sync.ts`: `SYNC.join.tooMany`, verbatim (for Codex review):

```
Masyadong maraming subok. Maghintay ng 10 minuto. · Too many tries. Wait 10 minutes.
```

- `src/backend/__tests__/joinLimit.test.ts` (new, 6 tests): NULL maps to `not-found`; a session id passes through; the
  lockout error maps to `limited`; other refusals keep their kinds; a locked phone stops retrying on the loop; the copy
  line.

Jest for these files: `npx jest src/backend/__tests__/joinLimit.test.ts src/backend/__tests__/sessionRpc.test.ts src/backend/__tests__/twoPhone.test.ts`
→ `Test Suites: 3 passed, 3 total`, `Tests: 15 passed, 15 total`.

## Docs

`docs/decisions.md`: one bullet added at the end of the "Hosted backend: Supabase replaces the laptop" section, after
"Secrets". It records the limit, the NULL return, the lockout rule and the per-IP residual risk. No other bullet touched.

## Final checks (real output)

- `npx tsc --noEmit`: exit 0, no output.
- `npx expo lint`: exit 0, no problems printed.
- `npx jest --maxWorkers=2`: `Test Suites: 4 skipped, 58 passed, 58 of 62 total`; `Tests: 4 skipped, 618 passed, 622 total`.
  The count includes other agents' tests; the baseline in the brief was 583 passed / 4 skipped.

## Files touched

- `supabase/migrations/20261101100000_join_attempt_limit.sql` (new)
- `supabase/tests/07_join_attempt_limit.test.sql` (new)
- `supabase/tests/40_two_phone_sync.test.sql` (line 165, approved)
- `supabase/tests/00_schema_guard.test.sql` (table set 11 → 12; **flagged, not on the approved list**)
- `src/backend/sessionApi.ts`
- `src/backend/follower.ts`
- `src/components/SessionBanner.tsx`
- `src/i18n/sync.ts`
- `src/backend/__tests__/joinLimit.test.ts` (new)
- `docs/decisions.md` (one bullet)
- `docs/handoffs/2026-11-01-mobile-security-join-limit.md` (this file)

Not touched: `supabase/.env`, `supabase/config.toml`, git, other migrations, other source files.
