# Handoff: mobile-feature, two-phone sync (M5, CC-06), 2026-10-26

Status: **code, unit tests and the live integration test are done. The held-driver rule cannot work with the current
database rules (blocker, see "Blockers"). No device run** (rule: no emulator, Metro, Gradle or build). Nothing committed or
pushed. `supabase/`, `server/`, `src/engine/`, `src/data/`, `src/parse/`, `src/results/` were not touched. Single-phone mode
is unchanged (no join = local evening, as before).

## What was built (the protocol, as the code does it)

1. **Dashboard = authoritative** (`src/backend/dashboardSession.ts`). Its run row (already created by `eveningSync`) is read
   back for the 6-character `join_code`, shown large on the dashboard. The clock is written on start, pause, seek, speed
   change and rewind, plus a heartbeat every 10 s while running (`clock_minute`, `clock_running`, `seconds_per_minute`,
   `clock_updated_at`). Writes are latest-wins; a failed write is retried on the next pass (no tight retry loop offline).
2. **Inputs**: every input of the dashboard's run is appended to `session_inputs` in log order with the next `seq` (one
   ordered queue; a network failure keeps it and the next pass retries; a refused write is dropped and shown as a warning).
3. **Requests**: a follower's action is an `input_requests` row (`LOT_POSTED` for its own donor id, `DRIVER_RESPONSE` for its
   own driver id). The dashboard reads the pending rows for its session (on the realtime INSERT and on every pass), stamps
   each through `LiveEvening.postLot` / `answerDriver`, appends the `session_inputs` row, and marks the request `applied`
   (with `applied_seq`) or `rejected` (with the reason). A rebuilt lot takes its kg and load from the dashboard's catalog
   (`src/backend/requests.ts`); a phone cannot choose them. The lots row is written by the existing `eveningSync` outbox
   (the DB does not link it to the input log).
4. **Followers** (`src/backend/follower.ts`): `join_session(code)` (RPC), then the session row and all `session_inputs`,
   then realtime (`live_sessions` UPDATE, `session_inputs` INSERT). A gap in `seq` re-reads everything. `LiveEvening` runs in
   follower mode (`follow`, `followInputs`, `followClock`, `followHeld`, `leaveFollow` in `src/live/evening.ts`): its inputs
   are the session rows only, its policy and held drivers come from the row, its clock follows the shared clock.
   Follower-side `postLot`, `cancelDriver`, `setPolicy`, `replayUnder`, `seek`, `start`, `pause`, `setSpeed`, `answerDriver`
   do nothing (or return a refusal). Local controls are shown locked (`SimControl locked`).
5. **Offline follower**: state `offline` ("Hindi konektado · Not connected"), the clock freezes where it was, the last state
   stays on screen; on reconnect it re-reads the session and all inputs and replays. A clock silent for 30 s while running
   also freezes the follower (`staleMs`). Unsent requests are kept in memory and sent again.
6. **Ended session**: the dashboard ends a run on a rewind or a policy change (existing rule). A follower sees `ended_at`,
   freezes, and must join again with the new code.
7. **Driver watch-only**: a driver phone that joins after the clock has moved (or an input exists) is `watchOnly`; the screen
   hides its answer buttons and shows the note. The database does not enforce this (see Risks).

## Files

New: `src/backend/sessionApi.ts` (SessionApi interface + supabase-js implementation, no Expo imports),
`src/backend/requests.ts`, `src/backend/dashboardSession.ts`, `src/backend/follower.ts`, `src/backend/sessionMode.ts`,
`src/backend/useSession.ts`, `src/components/SessionBanner.tsx`, `src/i18n/sync.ts`,
`src/backend/__tests__/fakeSessionBus.ts`, `src/backend/__tests__/twoPhone.test.ts`,
`src/backend/__tests__/clockFollow.test.ts`, `src/backend/__tests__/heldDrivers.test.ts`,
`src/backend/__tests__/sessionIT.test.ts`, `jest.sync-it.config.js` (node-only config for the live test).

Changed: `src/live/evening.ts` (follower mode, session-held drivers, `answerProblems`, `setSessionHeld`; the single-phone
behaviour is unchanged, `src/live/__tests__/evening.test.ts` still passes), `src/backend/eveningSync.ts` (`onRunChange`
listener only), `src/backend/runtime.ts` (singletons, loop calls `dashboard.pass()` and `follower.pass()`),
`src/components/SimControl.tsx` (`locked` prop), `src/app/index.tsx` (join code field; the code goes with the role chosen),
`src/app/dashboard/index.tsx` (join code block, write warning), `src/app/donor/index.tsx` and `src/app/donor/post.tsx`
(banner; a joined post is a request), `src/app/driver/index.tsx` (requests when joined, watch-only, locked controls),
`src/app/pantry/index.tsx` (banner, locked control).

## Checks (real output)

- `npx tsc --noEmit`: exit 0, no output.
- `npx expo lint`: exit 0, no problems (after the last edit).
- `npx jest` (whole repo, last run): `Test Suites: 4 skipped, 41 passed, 41 of 45 total`;
  `Tests: 4 skipped, 514 passed, 518 total`. The 4 skipped: three that were skipped before this work, and the live test
  (skipped without `SYNC_IT=1`).
- New suites: `twoPhone` (8 tests), `clockFollow` (5), `heldDrivers` (7). With `src/backend` and `src/live` only: 145 passed.
- Unit tests run on `FakeSessionBus` (`src/backend/__tests__/fakeSessionBus.ts`), which applies the migration's rules:
  creator-only writes, members-only reads, role check on requests, held drivers only at 17:00 stopped, seq unique.
  Its `readJoined` mirrors the real RLS (see Blockers).
- `SYNC_IT=1` (live, against project `salo`, ref `usslrxpftaupvropfkzl`), run command:
  `SYNC_IT=1 npx jest --config jest.sync-it.config.js --forceExit`. Output of the passing run, verbatim:

```
SYNC_IT created: {"dashboardUser":"4698cd90-62da-44ed-8a14-b11843341dc6","donorUser":"dc25fec8-3423-4f32-83b9-9f31251f2949","windowStartedAt":"2026-10-26T14:09:25.052Z","sessionId":"1c5ab460-e94b-440c-9d42-378513a17c61","joinCode":"SX0DNT","realtimeLatencyMs":1915,"requests":[{"status":"applied","reason":null,"appliedSeq":1},{"status":"rejected","reason":"pickup time must be later than the clock","appliedSeq":null}],"logsMatchAtMinute":1051,"visibleEntries":387}
PASS src/backend/__tests__/sessionIT.test.ts (18.283 s)
  two phones against the real project (SYNC_IT=1)
    √ a donor request is applied by the dashboard and replayed on the donor phone; the logs match (17265 ms)
Test Suites: 1 passed, 1 total
Tests: 1 passed, 1 total
```

  Meaning: a donor phone joined with the code, followed the shared clock to 17:31, sent a valid lot (applied at seq 1) and a
  lot with a past pickup (rejected with the engine's reason). The donor received the `session_inputs` row over Realtime
  1.9 s after the request. Both visible logs are equal at 17:31 (387 entries).

- **Two runs against `salo` happened, not one.** Run 1 reached the database and then failed on my own digest check: `jsonb`
  reorders object keys, so raw-JSON digests differed. Run 1 also never flushed the outbox, so its events and lots did not
  upload. The digest is now canonical (sorted keys) and the test flushes the outbox. Run 1 jest also hung on exit (open
  realtime handles); it was stopped by hand. Run 2 is the one above. Its jest also needs `--forceExit` (open handles remain
  after the test; not yet traced).
- Not run: any app build, emulator or device check (memory rule). The screens are typechecked and linted only.

## Rows created in `salo` by the integration runs (for deletion by the orchestrator)

Deleting the two `live_sessions` rows cascades to `session_members`, `session_inputs`, `input_requests`, `lots` and `events`.
The devices rows go with the users.

| Kind | Id | Notes |
|---|---|---|
| live_sessions | `dae657a8-489b-4dfa-b2a0-61264f7cc1ca` | run 1 (failed); join code 64EKG9; clock 1051 |
| live_sessions | `1c5ab460-e94b-440c-9d42-378513a17c61` | run 2 (passed); join code SX0DNT |
| auth user (dashboard) | `a7e06bb8-dcc4-467d-b308-8945ae938a30` | run 1, anonymous |
| auth user (donor) | `5ed86d71-0a11-461a-9f48-ae40e6ea7abf` | run 1, anonymous |
| auth user (dashboard) | `4698cd90-62da-44ed-8a14-b11843341dc6` | run 2, anonymous |
| auth user (donor) | `dc25fec8-3423-4f32-83b9-9f31251f2949` | run 2, anonymous |
| auth user (stray) | `e51a6faa-750b-41b3-88bc-1a384bcba9a5` | anonymous, **no devices row**; my direct sign-in probe at 13:54 UTC, before run 1 (a probe, not the test) |

Also created: devices rows for the four users above (2 per run); `session_members` 2 (one per run); `session_inputs` 2
(seq 1 each); `input_requests` 4 (ids 21 rejected and 22 applied in run 1; ids 23 applied and 24 rejected in run 2); `lots` 1
(`LIVE-1`, run 2); `events` 376 (run 2). The first attempt, before the fetch fix, failed at sign-in and wrote nothing.

## Blockers (need a decision outside this agent)

1. **Held drivers cannot be set from the app.** `held_drivers` must be filled from the joined driver phones. The creator
   (dashboard) cannot read them: `session_members` is readable only for the device itself (`session_members_read_own`), and
   `devices` only for its own row (`devices_select_own`). So `readJoined` returns no members, and the held set stays empty.
   The logic is built and tested on a fake that allows the read (`bus.rosterVisible = true`), but the live path cannot
   produce a held driver. Fix options (schema, not changed here): a `SECURITY DEFINER` RPC that returns the members' roles
   and profiles to the session creator, or a readable view. Until then: no held driver can be played live.
2. **Whether a driver phone may answer** after the start is enforced only by the screen (watch-only flag). The database
   accepts a `DRIVER_RESPONSE` from any driver device whose profile matches. The dashboard refuses only an answer for a driver
   that is not held.

## Decisions I made (for review)

- A follower joins by code on the picker: the code is kept with the role chosen; the dashboard row ignores it.
- `watchOnly` = joined when the clock was not at 17:00 stopped, or an input existed. It cannot see "started and paused within
  the first minute", because the database has no started flag. Realistic case covered by a test (the clock moved past 17:00).
- Requests are not persisted on the phone: an unsent request is lost if the app is closed before it is sent.
- Dashboard clock writes are not in the ordered queue: latest-wins, one in flight. A reader sees at most one heartbeat of lag.
- A rewind (seek back) ends the run and opens a new session with a new code, as the existing rule says. The new session's
  `held_drivers` are written again (only allowed at 17:00 stopped).

## Risks and open items

- **Clock skew between phones.** A follower's minute uses `clock_updated_at` (written from the dashboard's phone clock) and
  its own phone clock. At 1x, 1 s of skew is 1/6 of a simulated minute. Phone clocks are usually within a second. A server
  time source would remove this (no way to read it with supabase-js today).
- **Join-code guessing** (schema risk, unchanged): no attempt limit on `join_session`.
- **Ordering of the request outcome**: a request is marked applied after its `session_inputs` row is written (ordered
  queue). If the dashboard's app dies between the two writes, the request stays pending and is applied again on restart
  (a new run, so the request's session is no longer read). Not tested.
- `session_inputs` is read with `limit(5000)`, but PostgREST caps responses at its own `max_rows` (1000 by default). A session
  longer than that would replay partially. One evening is far below this today.
- The dashboard reads the roster every pass while the clock is at 17:00 and stopped (a small read every 3 s until the start).
- Follower tests use the fake bus; the realtime and RLS behaviour were checked only by the one live run above.
- Not done: the device screens (join field, banner, driver answers) were not seen on a phone.

## Copy (every new string, verbatim; for Codex review)

From `src/i18n/sync.ts` (Filipino · English, one string each):

```
join.title: Sumali sa gabi · Join an evening
join.hint: Ilagay ang kodigo mula sa dashboard, saka pumili ng tungkulin. · Type the code from the dashboard, then choose your role.
join.placeholder: ABC123
join.a11y: Kodigo ng gabi, anim na letra o numero. Evening code, six letters or digits.
join.badCode: Anim na letra o numero ang kodigo · The code has six letters or digits.
state.connecting: Kumokonekta… · Connecting…
state.offline: Hindi konektado · Not connected
state.offlineHint: Nananatili ang huling estado sa screen. Babalik ito kapag may koneksyon. · The last state stays on screen. It catches up when the connection returns.
state.ended: Tapos na ang sesyong ito · This session ended
state.endedHint: Sumali ulit gamit ang bagong kodigo · Join again with the new code.
state.refused: Walang sesyon na may ganitong kodigo · No session has that code.
state.stale: Hindi pa nagpapadala ng orasan ang dashboard · The dashboard has not sent the clock for a while.
state.watchOnly: Nanonood ka lang: sumali ka pagkatapos magsimula ang gabi · You are watching only: you joined after the evening started.
state.clockFromDashboard: Galing sa dashboard ang orasan · The clock comes from the dashboard
request.sending: Ipinapadala… · Sending…
request.unsent: Ipapadala kapag may koneksyon · Will be sent when connected
request.rejected(reason): Hindi tinanggap: {reason} · Not accepted: {reason}
request.sentToDashboard: Ipapadala sa dashboard ang bawat lot. · Each lot is sent to the dashboard.
dashboard.codeLabel: Kodigo ng gabi · Evening code
dashboard.codeHint: I-type ito sa ibang telepono para sumali. · Type this on another phone to join.
dashboard.codeWaiting: Kinukuha ang kodigo… · Getting the code…
dashboard.warning(message): Hindi naipadala: {message} · Not sent: {message}
```

Other English strings shown on screen (SimControl accessibility hint, English dashboard labels):
`The clock comes from the dashboard`.

Reasons shown through `request.rejected` (English, written by the store and the dashboard; Codex may want Filipino):

```
pickup time must be later than the clock            (LiveEvening, existing)
no donor {id}                                       (LiveEvening, existing)
a lot needs at least one item                       (LiveEvening, existing)
lot {id} is not posted yet
driver {id} is not held in this session
this change is made on the dashboard
this phone follows a session: send a request instead
held drivers are fixed once the evening has started
held drivers can be set only at 5:00 PM with the clock stopped
the request has no lot
the lot has no donor
the lot has no pickup time
a lot needs 1 to 5 items
not on the list: {foodItem} ({unit})
quantity out of range for {foodItem}
the request has no input
the driver answer is not complete
this kind of input is not sent by a phone
the input could not be logged
```

Internal `message` values (English, mapped to the copy above by the screens, not shown directly):
`the code has six letters or digits`, `Not connected.`, `No session has that code.`,
`This session ended. Join again with the new code.`, `The dashboard has not sent the clock for a while.`,
`the session is gone`, `join_session: ...` (database errors pass through as text).

## Commands used

- `npx tsc --noEmit`; `npx expo lint`; `npx jest` (full); `npx jest src/backend src/live`.
- `SYNC_IT=1 npx jest --config jest.sync-it.config.js --forceExit` (run 2, passing; run 1 used a scratchpad copy of the same config).
- `supabase db query --linked "select ..."` (read-only, to list rows for cleanup and to check `input_requests` outcomes).
