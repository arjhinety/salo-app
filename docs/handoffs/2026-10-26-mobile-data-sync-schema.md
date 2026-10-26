# Handoff: mobile-data, two-phone sync schema (M5, 2026-10-26)

Project `salo`, ref `usslrxpftaupvropfkzl` (checked against `supabase/.temp/project-ref` before every remote command). Remote only. No local stack. Nothing committed or pushed. `supabase config push` and `db reset --linked` were not run. No emulator, Metro, Gradle or app build. `src/`, `server/` and `supabase/functions/` were not touched.

## Results (remote)

| Step | Command | Result |
|---|---|---|
| Migration | `supabase db push --linked --yes` (password from `supabase/.env` in the same command) | applied `20261026110000_two_phone_sync.sql`. The first attempt failed with a connection EOF before anything was applied; the second succeeded. |
| Migration list | `supabase migration list --linked` | `20261026100000`, `20261026100100`, `20261026100200`, `20261026110000`, all remote |
| pgTAP | `supabase test db --linked supabase/tests` | `Files=5, Tests=111 ... Result: PASS` (00: 8, 10: 8, 20: 10, 30: 32, 40: 53). The first two tries failed on connection timeouts; Docker Desktop was down for the `pg_prove` runner image, so I started it (it is still running). |
| Cleanliness | pgTAP check run after the tests (rolled back) | 0 anonymous users, 0 rows in devices, live_sessions, session_members, session_inputs, input_requests, lots, events, parse_requests; reference rows 50+30+40 |

Every test file runs in one transaction and is rolled back, so no test rows remain.

## The protocol, in plain words

1. The dashboard opens a session. The server gives it a 6-character join code (A-Z, 0-9). The dashboard is the only creator, and the only one that moves the clock.
2. Other phones join with the code by calling `join_session(code)`. That makes them members. Members can read the session row, the input log, the lots and the events. Anyone else sees nothing.
3. A donor phone asks for a lot by inserting an `input_requests` row (`LOT_POSTED` for its own donor id). A driver phone asks for a `DRIVER_RESPONSE` for its own driver id. Pantry phones can send nothing. Requests start `pending`.
4. The dashboard reads the pending requests and, for each one, either appends the input to `session_inputs` (next `seq`, `at_minute` = its current clock minute) and marks the request `applied` with `applied_seq`, or marks it `rejected` with a reason and writes no input.
5. Every phone, the dashboard included, replays `session_inputs` in `seq` order with the same engine. The same inputs give the same screens. Realtime tells phones about new inputs and clock changes.
6. The clock is stored on `live_sessions` (`clock_minute`, `clock_running`, `seconds_per_minute`, `clock_updated_at`). Phones compute the displayed time from those fields. `held_drivers` can be changed only while `clock_minute = 1020` and the clock is stopped, before and after the change.

## Tables (new or changed)

| Table | Notes |
|---|---|
| `live_sessions` (changed) | new columns `join_code` (unique, `^[A-Z0-9]{6}$`, default `generate_join_code()`), `clock_minute` (0-1439, default 1020), `clock_running` (default false), `seconds_per_minute` (> 0, default 6), `clock_updated_at`, `held_drivers text[]` (default `{}`, format `V\d{2}`). The E01-E10 check and `unique (id, policy)` are unchanged. |
| `session_members` (new) | pk (`session_id`, `device_id`), `joined_at`. No client insert. |
| `session_inputs` (new) | pk (`session_id`, `seq`), `at_minute` 0-1439, `input jsonb` checked by `is_engine_input()` (LOT_POSTED with a `lot` object, CANCEL_DRIVER with `lotId`, DRIVER_RESPONSE with `driverId`, `lotId`, and an `answer` of offer/decline/commit/withdraw). |
| `input_requests` (new) | `id` identity, `session_id`, `device_id`, `input` (same check), `requested_at`, `status` (pending/applied/rejected, default pending), `applied_seq` (composite FK to `session_inputs`), `reason` (≤ 300). Check: pending has no `applied_seq` or reason; applied has `applied_seq`; rejected has a reason. Index (`session_id`, `status`). |

Not changed: `devices`, `donors`, `pantries`, `drivers`, `parse_requests`, `events` (columns).

## RLS

- `live_sessions`: select for the creator and for members. Insert by a dashboard device as creator, and only the columns `id, evening_id, policy, created_by, started_at` (no client `join_code`, no clock fields). Update only by the creator, and only `ended_at, clock_minute, clock_running, seconds_per_minute, clock_updated_at, held_drivers`. Guard trigger `live_sessions_guard` (not executable by API roles) enforces the held-driver rule and that every held id is a real driver.
- `session_members`: a device reads its own rows only. No insert, update or delete for clients.
- `session_inputs`: select for the creator and members. Insert only by the creator. No update or delete.
- `input_requests`: select own rows, or every row if the device is the creator. Insert only as the device itself, only as a member, only `pending`, and only the kinds its role may send: donor `LOT_POSTED` for its own donor id; driver `DRIVER_RESPONSE` for its own driver id; dashboard any kind; pantry none. Update (status, applied_seq, reason) only by the creator.
- `lots`: select for the creator and members. Insert only by the dashboard creator (donors no longer post lots directly).
- `events`: select for the creator and members. Insert unchanged (creator only).
- `devices`, `donors`, `pantries`, `drivers`: unchanged.

## RPC

`join_session(p_code text) returns uuid`, SECURITY DEFINER, `search_path = ''`. Caller must have a `devices` row (else 42501). The code is trimmed and upper-cased. Unknown code: `P0002`. Valid code: inserts the membership (idempotent) and returns the session id. Execute granted to `authenticated` only (revoked from `public` and `anon`).

## Realtime

Publication `supabase_realtime` now holds `lots`, `events`, `live_sessions`, `session_inputs`, `input_requests`. Realtime respects RLS, so phones receive only what their RLS allows.

## Changes to earlier tests (needed by the new rules)

All earlier assertions were kept except these:

1. `00_schema_guard`: the expected table set grows from 8 to 11 (`input_requests`, `session_inputs`, `session_members`). Description updated.
2. `30_live_sessions_lots_events`:
   - "authenticated devices can read sessions" (count 2 for a non-member donor) is now "a device that has not joined sees no session" (0). Reason: `join_code` must not be readable by non-members, or the join gate means nothing.
   - "a donor device posts a lot for its own donor id" (lives_ok) is now "a donor device cannot post a lot directly" (42501). Reason: other phones must not write official data; they request.
   - "an authenticated device reads the posted lot" is now a non-member read of 0 rows.
   - The lot uniqueness test now first has the dashboard post `LIVE-1` (lives_ok), so the duplicate check still means something. Plan 31 → 32.

## Decisions and risks

1. **Join-code guessing.** There is no attempt limit on `join_session`. The code space is about 2.2 billion, but any registered device can try codes without limit. Mitigation to add later: a rate limit per device, or a short expiry on codes.
2. **Self-declared profiles.** A device still declares its donor, driver or pantry id by itself (as before). The protection is that a device acts only for the id it declared, not that it is the real donor or driver.
3. **`lots` is a copy, not enforced by the database.** Nothing ties `lots` rows to `session_inputs`. The dashboard must write both. A trigger that derives lots from LOT_POSTED would remove that risk.
4. **`seq` is chosen by the client (the dashboard).** The primary key stops duplicates; nothing checks that `seq` is contiguous. Only the creator writes, so one writer is assumed.
5. **`at_minute` is not checked against `clock_minute`** (only 0-1439). The dashboard stamps at its own clock; the database does not verify it.
6. **Join-code collision.** `generate_join_code()` does not check for an existing code. A collision would fail the insert with 23505 (probability about n/2.2e9 for n sessions).
7. **Requests are not limited in number.** A member can insert any number of pending requests. Rate limiting is not in place.
8. **Remote only.** As agreed, nothing was run against a local stack. The remote is the tested copy.
9. **Free plan and Docker.** `supabase test db --linked` needs Docker Desktop for the `pg_prove` image. Docker Desktop is running on this machine now.

## Files touched

- `supabase/migrations/20261026110000_two_phone_sync.sql` (new)
- `supabase/tests/40_two_phone_sync.test.sql` (new, 53 assertions)
- `supabase/tests/00_schema_guard.test.sql` (table set 8 → 11)
- `supabase/tests/30_live_sessions_lots_events.test.sql` (changes listed above, plan 32)
- `docs/handoffs/2026-10-26-mobile-data-sync-schema.md` (this file)

Not touched: `src/`, `server/`, `supabase/functions/`, `supabase/config.toml`, `supabase/.env`, `supabase/seed.sql`, git.
