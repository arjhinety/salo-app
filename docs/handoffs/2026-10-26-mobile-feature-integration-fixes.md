# Handoff: mobile-feature, integration fixes (2026-10-26)

Code and tests only. No emulator, Metro, Gradle or build was run (the orchestrator runs the combined device check). Nothing
committed, nothing pushed. Not touched: `src/engine/`, `src/data/`, `supabase/`, `server/`, `src/i18n/strings.ts`.

## Status

- Picker: Pantry and Driver rows are on (`/pantry`, `/driver`). Done.
- Driver chooser: winners of the no-hold E05 baseline first, default = top winner, lock after 17:00 or while running. Done.
- One phone, several roles: outbox flush with a 5 s wait before sign-out, unsent writes kept and shown on the picker,
  explicit discard. Done.
- Codex grammar fixes: applied as listed below. Done.
- Device check: NOT RUN (by rule).

## Commands and results (final run, after the last edit)

- `npx tsc --noEmit`: exit 0, no errors. (An earlier run in this session showed 2 errors in
  `src/engine/__tests__/no-shares-left.test.ts`, the engine agent's in-progress file. They were gone by the final run. Not touched.)
- `npx expo lint`: exit 0, no problems reported.
- `npx jest`: `Test Suites: 3 skipped, 31 passed, 31 of 34 total`; `Tests: 3 skipped, 418 passed, 421 total`. 0 failures.

## 1. Picker (`src/app/index.tsx`)

- Pantry row: `ready: true`, route `/pantry`, registers role `pantry` with profile `P01` (same behaviour via `pickRole`).
- Driver row: `ready: true`, route `/driver`. The picker does NOT register the driver. The schema needs the profile at
  registration (devices.profile_id must match the role prefix, and the profile must exist), so the driver screen registers the
  phone when a driver is chosen there (see 2).
- "SA SUSUNOD" is gone from both rows.
- New on the picker (see 3): the unsent-writes banner and its discard button.
- The Driver row's second line used to show V01's name. It now reads `Pipiliin sa susunod na screen` (choose on the next
  screen), because the default driver is no longer V01. New copy: needs Codex review.

## 2. Driver chooser (`src/driver/chooser.ts`, `src/app/driver/index.tsx`, `src/components/driver/DriverCards.tsx`)

- `chooserOrder(evening)`: drivers with at least one COMMIT in the no-hold baseline run (`runEvening`, salo, UNTUNED,
  no inputs) first, most COMMITs first, then id; then the other requested drivers in dataset order. Index 0 is the default.
  Nothing is hard-coded: the counts are read from the run's `MESSAGE` entries of type `COMMIT`.
- `requestDrivers` is unchanged (dataset order; the held-run cross-check in the chooser test uses it).
- Baseline COMMIT counts on E05 (from the run): V19 5 (L0227, L0245, L0211, L0228, L0214), V21 4, V34 4, V07 3, V37 3, others
  fewer. Default: **V19**.
  - Correction to the driver handoff: it said "V19: 3 wins in the baseline". That is wrong for the baseline. The 3 is the
    architect's held-offer scenario (V19 offering at its round minute). The baseline has 5 COMMITs.
- Lock: `chooserLocked({minute, running})` = `running || minute > 17:00`. Interpretation: "or is running" is read as locked
  while the clock runs (pause, then rewind to 17:00 to change the driver). Change it if only "past 17:00" was meant.
  When locked: chips other than the selected one are disabled, the screen shows the note `chooserLocked`, and the
  selection handler does nothing.
- The driver screen registers the phone with the chosen driver: its selection effect calls `pickRole('driver', id)` next
  to `holdDriver(id)`. Changing the driver before the lock signs out and registers a new user for that driver, because the
  devices row cannot change its profile.
- Tests (`src/driver/__tests__/chooser.test.ts`): the order equals an independent recomputation from a raw run (winners by
  COMMIT count then id, then the rest); the default equals the top winner and its count, asserted as `['V19', 5]`; the default
  is not V01; the lock is false at 17:00 paused and true when running or after 17:00.

## 3. One phone, several roles (`src/backend/outbox.ts`, `session.ts`, `runtime.ts`, `supabase.ts`)

- Before a role change signs out (`chooseRole`), `pickRole` now: releases the run (`eveningSync.release`), then
  `outbox.flushWithin(uid, 5000)` (resolves `done` or `timeout`; a pass already running is awaited first), then checks whether
  that user still has queued items.
- Queued items are not dropped. If the user has queued items, its session is kept in `salo.backend.kept.v1`, keyed by user id
  with its role and profile and its tokens. Then the phone signs out.
- Choosing that role again restores the kept session (`setSession`), so the queued writes go out. If it cannot be restored
  (offline), it stays kept and is tried the next time that role is chosen, even when it is the same role.
- Picker banner: when items of another user are queued, it shows `N na hindi pa naipapadala · N not sent yet`, a line that the
  items are kept until that role is chosen again, and the button `Burahin ang mga ito · Discard them`. The button is the only
  way items are removed (`outbox.discardStranded` plus `forgetKeptSessions`).
- `outbox.flush` keeps the pass in progress in `running`, so `flushWithin` can await it. The existing rule (a second flush
  while one runs returns an empty report) is unchanged.
- Tests: `outbox.test.ts` (flushWithin done; timeout keeps the items; waits for a pass in progress; stranded counts; discard);
  `session.test.ts` (kept when queued; restored with no new device row; not kept when empty; offline keep and retry; forget);
  `roleSwitch.test.ts` (the 5 s constant and the call with 5000; sent before sign-out; stays queued and is sent after the role
  is chosen again; discard). The fake client (`fakeSupabase.ts`) gained `setSession` and refresh tokens.
- Not verified on a real server: `setSession` with a stored refresh token for an anonymous user. The tests use the fake.

## 4. Codex grammar fixes (applied as listed)

Filipino side changed; the English after " · " is kept unless noted. Current values from the files:

`src/i18n/pantry.ts`
- awards.fil: `Mga lot na na-award sa amin`
- noAwards.fil: `Wala pang na-award na lot sa pantry na ito.`
- open.fil: `Mga lot na puwedeng i-bid`
- noOpen.fil: `Walang lot na puwedeng i-bid ngayon.`
- value.auto: `Awtomatikong nag-bid ang agent ng pantry. Hindi mababago ng coordinator ang bid sa bersyong ito. · The pantry agent bids automatically. The coordinator sees the bid and cannot change it in v1.`
- status.final.detail: `Pinal na ang award: may driver nang nag-commit. · Award is final: a driver has committed.`
- status.stranded.detail: `Walang driver na nag-commit bago ang takdang oras. · No driver committed in time.`
- reannounced.tentative: `Umatras ang naunang driver. Inanunsyo ulit ang delivery; nakalaan pa rin sa pantry ang lot. · The earlier driver withdrew. The delivery is re-announced; the pantry keeps its tentative award.`
- refuse.closed_before_earliest_arrival.fil: `Sarado na ang pantry bago pa makarating ang sinumang driver.`
- refuse.cannot_store_lot.fil: `Hindi kasya sa tuyong imbakan o sa ref.`
- whyLine.won (Filipino part): `{name} ang nakakuha ng lot dahil pinakamataas ang bid nito: {shares} shares batay sa value na {total} (kailangan: {need} + imbakan: {storage} + layo: {distance} + pagkasariwa: {freshness}). Natitirang shares: {left}. Layo: {km} km.`
- whyLine.outbid and whyLine.bidding: `mula sa value na` changed to `batay sa value na`.
- ADDED refuse.no_shares_left: `{ fil: 'Wala nang natitirang shares ngayong gabi.', en: 'No shares left tonight.' }`. The engine already has `no_shares_left` in `RefuseReason`.
- status.tentative.detail: unchanged, as asked.

`src/i18n/driver.ts` (Filipino part; English kept)
- simNote: `Gawa-gawa lang para sa simulasyon ang lahat ng tagahatid, lugar, at numero rito · Every driver, place and number here is fictional or simulated`
- chooserHint: `Pumili ng tagahatid na tatanggap ng mga request. Ikaw ang gaganap bilang napili mo · Choose a driver who gets requests. You hold the one you choose`
- requests: `Mga request · Requests`
- requestsEmpty: `Wala pang request sa ngayon · No requests right now`
- requestsEmptyHint: `Lalabas dito ang mga request habang umuusad ang oras sa simulasyon · A request appears here when the simulated clock calls you`
- stickerRequest: `Request · Request` (Filipino and English are both "Request", as specified)
- pickupFrom: `Kunin sa · Pick up at`
- dropoffAt: `Ihatid sa · Drop off at`
- routeLine: `Kunin sa {donor}, {donorStreet}. Ihatid sa {pantry}, {pantryStreet}. · Pick up at {donor}, {donorStreet}. Drop off at {pantry}, {pantryStreet}.`
- route: `Detalye ng ruta · Route, in words`
- before: `bago ang {t} · before {t}`
- offered: `Nag-alok ka bago ang {t} · Offered, by {t}` (the call sites pass the time: `hhmm(offer.arrive)` and `hhmm(ask.offerEtaMinute)`)
- picked: `Napili ka! Kumpirmahin ang paghatid sa loob ng {n} min · You were picked, commit within {n} min`
- commit: `Kumpirmahin ang paghatid · Commit`
- notPickedHint: `May ibang tagahatid na napili para sa lot na ito · Another driver won this lot`
- committed: `Nakumpirma na; maghahatid bago ang {t} · Committed, delivers before the {t} pickup deadline`
- pickedUp: `Nakuha noong {t} · Picked up at {t}`
- delivered: `Naihatid noong {t} · Delivered at {t}`
- late: `Lampas sa oras · Late`
- missedNote: `Mabibilang itong biyahe na hindi natuloy · Counts as a missed run`

Tests updated: `src/pantry/__tests__/pantry.test.ts` (the why sentence now asserts
`batay sa value na 0.85 (kailangan: 0.31 + imbakan: 0.30 + layo: 0.12 + pagkasariwa: 0.12). Natitirang shares: 9.`).
No driver test asserted the old driver copy.

## New copy added (needs Codex review, not in the brief)

- driver `chooserLocked`: `Hindi na mapapalitan ang tagahatid ngayong gabi. I-pause at i-rewind sa 5:00 PM para mapalitan · You cannot change the driver tonight. Pause and rewind to 5:00 PM to change it`
- picker, Driver row second line: `Pipiliin sa susunod na screen`
- picker banner explanation: `Nakatago ang mga ito at ipapadala kapag napili ulit ang tungkulin nila · Kept here; they are sent when you choose that role again.`
- picker discard button: `Burahin ang mga ito · Discard them` (accessibility label: `Burahin ang mga hindi pa naipapadala. Discard the writes not sent yet.`)

## Issues for a decision (not changed)

1. `committed` English still says "before the {t} pickup deadline", which contradicts the Filipino (the deadline is when the
   food must arrive). The brief said to keep English unless noted. Suggest "delivers before the {t} deadline".
2. `whyLine.outbid` still has "Natira ngayon: {left} shares", while `won` now says "Natitirang shares". Not in the brief, so
   left as is. Suggest "Natitirang shares" for consistency.
3. "Lock while running": see section 2. Confirm the reading.
4. A kept session stores its tokens in `expo-sqlite/kv-store`, the same storage Supabase already uses for the live session.
   It is written only when the user has queued writes.

## Open risks

- Device check not run: the picker, the banner, the driver chooser and the 5 s wait are not seen on a device.
- `setSession` restore is tested on the fake only; check it on the real project (anonymous refresh tokens) in the device check.
- A driver change registers a new anonymous user (the schema forbids changing a device's profile), so each driver change leaves
  one more devices row on the server. Acceptable for a demo; say if it should not be.
- `src/backend/supabase.ts` got two helpers appended (`sessionTokens`, `restoreKeptSession`). `session.ts`, `outbox.ts` and
  `runtime.ts` changed as well. These are the supabase-app agent's files; the change is additive.
- The locked chips are disabled for visual and accessibility purposes only; focus order not checked on a device.
