# Handoff: mobile-feature, app connected to Supabase (2026-10-26)

Status: **code and unit tests done; on-device checks NOT completed** (the Android bundle never finished building in this
session, see "Device verification"). Nothing committed or pushed. Supabase project `salo` only (ref `usslrxpftaupvropfkzl`).

## What the app stores, and when

| What | Table | When it is written |
|---|---|---|
| Role of this phone's anonymous user | `devices` | On choosing a role in the picker, once the user is signed in (upsert, `ON CONFLICT DO NOTHING`) |
| One evening run | `live_sessions` | When the dashboard user is signed in (start of the evening), and on each "Replay with baseline" (new run) |
| Run end | `live_sessions.ended_at` | When a run ends: replay, seek back, policy change, changed past, another dashboard user, sign-out |
| Engine log entries | `events` | Entries with `atMinute < clock minute`, in seq order, never twice; batched per flush (about every 3 s) |
| Live lots | `lots` | Each `LOT_POSTED` input of the run (backfilled if the run opened later); written under the posting user |
| Parse requests | `parse_requests` | By the Edge Function, for every `/parse` call (the app only sends) |

Not written: `donor_messages`, pilot/main evenings (the app plays only E05, a tuning evening, and the schema limits sessions to E01–E10).

## Session and role rules

- Auth: anonymous sign-in, session stored in `expo-sqlite/kv-store` (`salo.backend.role.v1` for role state, Supabase auth key for the session).
- One user per role on a phone. The schema makes `devices.role` and `profile_id` immutable, so choosing a different role
  **signs out on this device and creates a new anonymous user**, which then registers for the new role. Same role again: nothing changes.
- Before that sign-out, the current run is released: its remaining events and lots are queued under the old user, then the
  run row gets `ended_at`.
- Offline: choosing a role never waits more than 2.5 s (`CONNECT_WAIT_MS` in the picker); navigation happens regardless.
  Registration retries every 3 s in the background loop when a role is chosen and the user is not registered.
- Lots and events are written only after the run row is delivered (foreign keys). Events are written only while the run's own
  user is signed in (RLS: only the session creator may insert events). Lots may be written by the donor user.

## Outbox (`src/backend/outbox.ts`)

- Every write goes to the queue first; the UI never waits. Queue key `salo.outbox.v1` in `expo-sqlite/kv-store`, restored on start.
- Flush (every 3 s, one pass at a time): only items of the user who is signed in now; order kept; consecutive upserts to the
  same table with the same conflict key go out as one request.
- Retryable (no response, 401, 429, 5xx): the flush stops and the status goes offline. Permanent refusal (other 4xx): the
  group is dropped, counted as `rejected`, and a console warning is logged, so one bad row cannot block the queue.
- Status line on the dashboard (English): `Database: connected`, `Database: connected, queued N`, `Database: offline, queued N`,
  `Database: connecting` (before the first attempt).

## Parse (Edge Function)

- `src/config/server.ts`: `PARSE_BASE_URL = ${EXPO_PUBLIC_SUPABASE_URL}/functions/v1`, `PARSE_TIMEOUT_MS = 8000`. The laptop
  address (`SERVER_URL`, `EXPO_PUBLIC_SALO_SERVER`, `10.0.2.2:8787`) is removed from the app code.
- `src/parse/client.ts`: new optional `headers` option, sent with the request. Only change in `src/parse/`.
- Headers: `apikey` (publishable key) and `Authorization: Bearer <access token>` when signed in (`parseAuthHeaders`).
- Any non-200 (401, 403, 429, 503 included) falls back to the rule parser. Online with the key set, Basahin returns Claude's
  cards (source `llm`); offline it falls back to the rules.

## Files

New: `src/backend/supabase.ts` (client, `ensureSession`, `registerDevice`, `parseAuthHeaders`, `sendOutboxGroup`, `signOutLocal`),
`src/backend/session.ts` (role state, `chooseRole`, `connect`), `src/backend/eveningSync.ts` (runs, uploads, prefix check, lots),
`src/backend/outbox.ts` (queue, status line, `outcomeOf`), `src/backend/runtime.ts` (singletons, background loop, hooks),
`src/backend/types.ts`; tests in `src/backend/__tests__/` (`eveningSync`, `outbox`, `session`, `parseHeaders` tests and
`fakeSupabase.ts`, a stand-in for the client and the store).

Changed: `src/config/server.ts`, `src/parse/client.ts`, `src/parse/__tests__/client.test.ts` (headers test added),
`src/app/index.tsx` (picker), `src/app/donor/post.tsx` (parse headers and base URL), `src/app/dashboard/index.tsx` (status
line; replay calls `startNewRun()`), `src/app/_layout.tsx` (`useBackendSync()` next to `useLiveTicker()`).

Not touched: `supabase/`, `server/`, `src/engine/`, `src/data/`, `src/pantry/`, `src/app/pantry/`, `src/i18n/pantry.ts`.
`src/live/evening.ts` shows as modified in git, but this agent did not change it (another agent's uncommitted work).

Dependency: `@supabase/supabase-js` 2.118.0 added with `npx expo install` (JS only; no native code, so no dev-client rebuild).
`package.json` and `package-lock.json` changed for it.

## Tests and checks (real output)

- `npx jest src/backend src/parse/__tests__/client.test.ts src/parse/__tests__/imports.test.ts`: **6 suites, 81 passed, 0 failed.**
- `npx jest` (whole repo, last run): **369 passed, 3 skipped, 8 failed** in 1 suite, `src/engine/__tests__/human-drivers.test.ts`
  (engine work in progress, imports `src/engine/simulate.ts`, not changed by this agent). Baseline in the brief: 292 passed, 3 skipped.
- `npx tsc --noEmit`: no errors in the files above. Three errors elsewhere, not from this work: `src/app/pantry/index.tsx`
  and `src/app/pantry/lot/[id].tsx` (route types for pantry screens in progress), `src/live/tape.ts` line 78 (`no_reply` not in
  `FailureReason`, engine types in progress).
- `npx expo lint`: 0 errors, 1 warning (`src/engine/simulate.ts`, unused `DriverAnswer`, not this agent's).
- `npx expo-doctor`: before this work 20/21 passed, failing on patch-version mismatches (`@expo/ui`, `expo`, `expo-constants`,
  `expo-linking`, `expo-router`). Not fixed here (pre-existing, outside this task). The new package did not add a failure.

## Device verification: not completed

- Device: `emulator-5556` = AVD `vel_phone` (confirmed with `adb -s emulator-5556 emu avd name` → `vel_phone`). This agent
  started it (`emulator -avd vel_phone`, without `-no-snapshot-save`). It has internet after about 20 s. The app
  `com.arjhinety.salo` was already installed.
- The two serials `127.0.0.1:16384` and `emulator-5554` are Arjhine's MuMu device (per coordinator). This agent ran only read-only
  `getprop` and `ping` on them, and installed nothing.
- Metro (`expo start --dev-client --port 8081`) started with `adb reverse tcp:8081 tcp:8081`. The first run served the picker,
  but the phone showed an **"Address ng laptop" row that is not in the current source**. That suggests a stale bundle, cause not
  confirmed. The second run (`--clear`) never finished the Android bundle: the bundle request ran for more than 270 s with no
  progress in the Metro log. Metro was stopped by this agent (its own process, PID checked by command line).
- Not run: dashboard play-through, rows in `live_sessions` / `events` / `lots` / `parse_requests`, donor post, Basahin, the
  screenshots `.impeccable/review/supabase-dashboard.png` and `supabase-donor-post.png`.
- **Real parse calls made: 0** (of the 3 allowed). No test rows created in `salo` by this agent.

## Open risks

1. Device flow untested: Metro bundling hangs in this session; the first real run may show errors not caught by the unit tests.
2. One phone, two roles: events for a dashboard run wait while a donor user is signed in, and items queued under a user who is
   later signed out wait forever (`queued N` never drops). The fix is a product decision (for example, keep the dashboard user
   signed in, or a second device).
3. Permanent refusals are dropped and only counted in memory (`rejected`), not shown on screen.
4. The run is opened only for a registered dashboard user; a donor-only phone shows no session. Offline first use registers later.
5. Prefix check compares the uploaded entries' JSON with the engine log. A cancel that rewrites the past ends the run (by design),
   but this path is covered only by the fake-live tests, not on device.
6. `docs/release.md` still describes `EXPO_PUBLIC_SALO_SERVER` and the laptop proxy (stale; not edited).
7. `supabase/config.toml` (schema agent's note) still has `[storage.vector] enabled = true` and changed auth settings; not touched here.
