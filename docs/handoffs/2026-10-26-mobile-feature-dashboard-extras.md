# Handoff: mobile-feature, dashboard extras (DSH-03, DSH-06, DSH-07, DRV-06, copy fixes)

Date: 2026-10-26. Agent: mobile-feature. Not committed, not pushed (orchestrator owns git).
Scope: dashboard extras on the E05 tuning evening only. No pilot or main evening, no dataset messages, no engine change.
Verification is code and tests only (memory rule): no emulator, Metro, Gradle or APK build. Nothing has been seen on a device.

## What was done

1. **DSH-03, bid list.** Under the ruler, a new "Tape | Bids | Map | Drivers" switch (default Tape, so the first viewport is unchanged). The Bids view lists every pantry bid for the selected lot, largest share count first under Salo (ties: earlier bid first). Each row: `name · N shares · Has a fridge | No fridge · X.X km · Values it at 0.NN`. A bid overtaken as leader is struck and stamped `Re-marked at HH:MM when <new leader> outbid <old leader>`; its spoken label reads `was N shares`. Refusals follow the bids as `REFUSED` with the PAN-03 reason. Baselines (fcfs, nearest, central greedy) have no shares: arrival order, values only, nothing struck.
2. **DSH-06, schematic map and table.** `Map | Table` switch in the Map view. SVG drawn from bundled coordinates (react-native-svg), labelled "Schematic, not to scale". No tile server, no Maps key. Equirectangular projection (cos of mid-latitude), north up, one fixed frame over every bundled place so positions do not move during the evening. Legend: Donor with surplus; Pantry; Volunteer driver; Tentative route, plus a note that solid = final and that no roads are drawn because the roads file is not bundled (routes are straight donor-to-pantry lines). Routes: one per lot with an award at the clock; dashed while tentative, solid when final or delivered. Table: Name, Role, Where (street), Right now, From, stacked per place so it does not scroll sideways at 200%.
3. **DSH-07, driver track record.** Driver Track view: "Showed up X of Y runs (estimate Z)" from `tuningShows` / `tuningRuns` through the engine's `reliability()`; "New volunteer, no history yet (estimate 0.50)" when Y = 0. Lists the drivers asked tonight (the same set as the map table).
4. **DRV-06, maps link.** `src/driver/maps.ts` now builds `…/maps/dir/?api=1&origin=lat,lon&destination=lat,lon&travelmode=driving` from coordinates. `placeText` removed. `DriverCards.openDirections` looks up coordinates by id and returns without opening a link if a place has none (every bundled place has one).
5. **Copy fixes** applied (see the verbatim strings below).
6. **Data pipeline (coordinates only).** `scripts/build-data.mjs` adds `lat`, `lon` to donors and pantries and `homeLat`, `homeLon` to drivers. `src/data/rawTypes.ts` types them (`LatLon`). `src/data/places.ts` holds the lookups. `src/data/dataset.generated.ts` regenerated. The engine types are untouched; the engine never reads coordinates.

## Files

Changed:
- `scripts/build-data.mjs` (+3 lines: the coordinate fields)
- `src/data/dataset.generated.ts` (regenerated; see the diff proof below)
- `src/data/rawTypes.ts` (LatLon type; RawDataset donors/pantries/drivers extended)
- `src/app/dashboard/index.tsx` (view switch, body views, `ViewChoice`)
- `src/components/driver/DriverCards.tsx` (`openDirections` by coordinates)
- `src/driver/maps.ts`, `src/driver/__tests__/maps.test.ts`
- `src/i18n/strings.ts` (new English `dash` keys for the views, bids, map, drivers; type import of `AwardState`)
- `src/i18n/sync.ts`, `src/i18n/driver.ts`, `src/i18n/pantry.ts` (copy fixes)

New:
- `src/data/places.ts` (coordinate lookups, `ALL_POSITIONS`)
- `src/live/bids.ts` (bid rows and text, pure)
- `src/live/drivers.ts` (driver track, pure)
- `src/live/schematic.ts` (projection, route rules, places involved, table rows; pure)
- `src/components/BidList.tsx`, `src/components/MapPanel.tsx` (map, legend, table), `src/components/DriverTrackPanel.tsx`
- Tests: `src/live/__tests__/bids.test.ts`, `src/live/__tests__/drivers.test.ts`, `src/live/__tests__/schematic.test.ts`, `src/data/__tests__/places.test.ts`, `src/i18n/__tests__/copy.test.ts`

Not touched (checked with `git diff --stat`): `src/engine/`, `supabase/`, `server/`, `src/backend/`, `src/results/`, `src/parse/`, and no pilot or main data.

## Data-bundle diff proof

`npm run build-data` ran and wrote the file. Its SHA256 gate (every CSV checked against `SHA256SUMS`) passed. The CSVs were not changed.

Proof script (scratchpad `diff-data.mjs`): the committed `dataset.generated.ts` (from `git show HEAD`) against the regenerated one, with the 8 added fields removed from each row:
- Header (first two comment lines and the import) identical: yes.
- Added fields: donors 50 rows x 2 = 100 values; pantries 30 x 2 = 60; drivers 40 x 2 = 80. Total 240 values, all numbers.
- Deep JSON comparison of the old RAW against the new RAW minus those fields: **equal**.
- Counts unchanged: 30 pantries, 50 donors, 40 drivers, 1500 road legs, 2000 driver legs, 30 evenings, 1436 lots, 42 late-minute samples.
- Example: `{"id":"D01",…,"closingMinute":1050,"anchor":true,"lat":14.621697,"lon":121.050233}`.

## Commands and results (after all changes)

- `npx tsc --noEmit`: exit 0, no errors. (Baseline before my changes: exit 0.)
- `npx expo lint`: exit 0, no lint messages.
- `npx jest`: **51 suites passed, 4 skipped; 577 tests passed, 4 skipped, 581 total; exit 0.** Baseline before my changes: 41 suites passed, 514 tests passed, 4 skipped. A run earlier in this session had one failure in `src/notify/__tests__/noPush.test.ts` (a `zz_guard_probe/google-services.json` file, not mine); it passed on the final run.
- `npm run build-data`: ran, SHA gate passed.

New tests (31 at first run, all passing): literal E05 values for L0211 (29 bids, 30 rows, the Bukal row `Bukal Community Kitchen · 16 shares · Has a fridge · 1.1 km · Values it at 0.94`, the Pag-asa Kusina strike `Re-marked at 17:37 when Alalay Pantry outbid Pag-asa Kusina`, the REFUSED row `no remaining need today`); a synthetic Socorro-9 then Bukal-14 rule test with the strike, tie and baseline cases; driver estimates 0 of 0 = 0.50, 10 of 11 = 0.85, 10 of 12 = 0.79, R. Dizon's line, and all 40 drivers matching `reliability_frozen` at two decimals; projection order for every pair of places; route dashed/solid rules and a dashed-to-solid COMMIT case; E05 at 21:30 places (31 donors, 30 pantries, 40 drivers), 42 route legs, none dashed; coordinates from the CSV; copy strings.

## Verbatim Filipino strings (changed copy)

- `SYNC.join.title`: `Sumali sa sesyon ngayong gabi · Join an evening`
- `SYNC.state.offlineHint`: `Nananatili sa screen ang huling estado. Maa-update ito kapag bumalik ang koneksyon. · The last state stays on screen. It catches up when the connection returns.`
- `SYNC.state.stale`: `Matagal nang walang update sa oras mula sa dashboard · The dashboard has not sent the clock for a while.`
- `SYNC.state.watchOnly`: `Nanonood ka lang: sumali ka matapos magsimula ang sesyon · You are watching only: you joined after the evening started.`
- `DRV.requestsEmptyHint`: `Lalabas dito ang mga request habang umuusad ang oras sa simulasyon · Requests appear here as the simulated clock moves`
- `PANTRY_COPY.whyLine.outbid` (Filipino part): `Nag-bid ang {name} ng {shares} shares batay sa value na {total}, pero mas mataas ang bid ng ibang pantry. Natitirang shares: {left}.`

No new Filipino strings were added. The dashboard additions are English only, per the decision that the dashboard is English.

## Decisions and deviations (please review)

1. **Three sync strings keep their English subtitle.** The brief gave `join.title`, `state.offlineHint` and `state.stale` as Filipino-only. I kept the existing English after " · " so the file's Filipino-then-English convention holds. `watchOnly` also keeps its English, as the brief said. If you want the Filipino alone, say so and I will drop the English.
2. **Bid rows omit "feeds count".** The DSH-03 story lists it, but the brief's row example does not have it, and the engine's `Pantry` type does not carry `households_served`. Not added.
3. **Re-mark time is HH:MM**, as the brief says. The story example has seconds; the engine's clock is in whole minutes, so seconds cannot be shown honestly.
4. **Baselines do not rank or strike.** Salo-only ranking and striking, as the story is about shares.
5. **Table "From" column** is the donor of the lot a pantry is involved with, or the pickup donor of a driver's latest offer, commit or failure. The brief did not define it.
6. **Reliability panel** shows only the drivers asked tonight (the table's set), not all 40 drivers up front. The post-run update is not built (the story marks it as an assumption after the evening).
7. **New view switch** under the ruler (Tape | Bids | Map | Drivers). This is a layout decision beyond the brief's explicit list. The default first viewport is the tape as before.
8. **Maps link fallback**: `openDirections` returns without opening anything if a place has no coordinates. The browser fallback that already exists still applies to the Linking failure.

## Open risks

- **Not checked on a device.** Layout at phone width, the 200% font scale, TalkBack reading, and the SVG rendering are unverified. There are no component render tests in this repo; the tests cover the pure logic only. Projector legibility is untested.
- **No roads.** The schematic draws straight lines. The legend says so.
- **E05 literal tests** depend on the store's untuned parameters (the live store runs them on tuning evenings only). If the engine rules change, the literals in `bids.test.ts` and `schematic.test.ts` change with them, on purpose.
- **Dashboard performance** has not been measured. Bid rows and the places set are computed on each publish only when their view is open; a full E05 log is about 3,400 entries.
