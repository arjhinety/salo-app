# Handoff: volunteer driver phone (DRV-01 to DRV-06), mobile-feature

Date: 2026-10-26. Scope: the driver screen and its pure logic. Code and tests only. No device run in this handoff: the orchestrator runs one combined device check later (see "Not done"). Nothing committed, nothing pushed, no Supabase writes, no pilot or main evening, no dataset messages.

## What was built

| File | Purpose |
|---|---|
| `src/driver/board.ts` | Pure. Folds one held driver's requests and runs from the engine's visible log (`driverBoard`). Holds the rule that makes an ask exact. |
| `src/driver/chooser.ts` | Pure. The E05 drivers who receive at least one request (`requestDrivers`). |
| `src/driver/maps.ts` | Pure. Google Maps directions URL builder and `placeText`. |
| `src/i18n/driver.ts` | All driver-screen copy (`DRV`, `splitBi`). Filipino first, English after " · ". |
| `src/components/driver/DriverCards.tsx` | Request card, run card, bilingual line, button, chooser row, `openDirections`. |
| `src/app/driver/index.tsx` | The route `salo://driver` (and `?driver=V..`). Holds the profile while open. |
| `src/live/evening.ts` | Only the hold: `holdDriver(id | null)`, `heldDriver()`, and passing `humanDrivers` into `runEvening` in `ensureRun`. Nothing else changed. |
| `src/driver/__tests__/board.test.ts` | Derivation on real E05 runs, including the 48-round agreement test. |
| `src/driver/__tests__/chooser.test.ts` | Chooser list, default, and the per-driver held-run cross-check. |
| `src/driver/__tests__/maps.test.ts` | Directions URL, literal. |
| `src/driver/__tests__/hold.test.ts` | `holdDriver` on the live store: asks, offer and commit through the live answer path, release. |

Not touched: `src/engine/`, `src/data/`, `src/parse/`, `supabase/`, `server/`, `src/app/index.tsx`, `src/app/donor/`, `src/app/dashboard/`, `src/app/pantry/`, `src/pantry/`, `src/i18n/strings.ts`, `src/i18n/pantry.ts`.

## How a request is known (the derivation)

The engine does not log "asked", and it does not log a pickup for a held driver. `driverBoard` replays one held driver's state from the visible log, in processing order, using the engine's own rules:

- A round (`CALL_FOR_PROPOSALS` to drivers) asks the driver when the driver is not excluded for the lot, is not picked for another lot, can carry the load, and the trip arrives by the deadline. The trip is the engine's rule: start = max(minute, available-from, freeAt); pickup = start + ceil(to donor); arrival = ceil(start + to donor + road minutes); deadline = min(available-to, pickup-by, pantry close).
- The window is `HUMAN_REPLY_WINDOW_MIN` (3 minutes). The close is not logged, so the board closes it itself. A window that ends with no answer is `expired`, and the card is removed at that minute (D-Q5).
- A pick is not logged. It is read from what follows the driver's PROPOSE: the engine logs a COMMIT, FAILURE or AWARD_STATE for the same lot straight after an offer that was not picked. Anything else means the driver was picked.
- Pickup time for "Picked up" is the engine's trip pickup at the pick minute, clamped to the commit minute. It is an estimate: the engine logs no pickup event.

Exactness check: `board.test.ts` runs a single offer at every one of the 48 driver rounds of E05 and requires the engine to accept it exactly where the board says the driver was asked. Result: match on all 48 rounds (40 asked, 40 accepted). The same test covers the board, not a copy of the rule.

## Engine facts that shape the screen (E05, untuned)

- Every one of the 40 drivers receives at least one request on E05, and on every tuning evening E01 to E10. So the chooser lists all 40, not "a short list". It is a horizontal row of chips.
- The default (first in the list) is V01 (R. Dizon). V01 gets 40 requests and never wins a round when offering at its round minute (architect handoff). The demo should pick a driver from the row that wins work, for example V19 (Q. Pascual): 3 wins in the baseline, the first at 1031 on L0227.
- Chooser built from one all-simulated run (fast on a phone). A held run is identical to that run up to a driver's first PROPOSE, so "at least one request" is the same test. `chooser.test.ts` checks it against a held run per driver (40 runs).

## Verified literals (E05, V19)

From the engine's log, checked against the architect handoff:

- Silent V19 is asked 40 times. First asks: L0207 at 1030 (closes 1033), L0227 at 1031 (closes 1034), L0242 at 1036 (closes 1039). All end expired.
- L0227 at 1031: pickup 1035, arrival 1038, deadline 1110 (pickup-by 1110, pantry P19 closes 1140, availability 1260).
- Offer 1031 + commit 1032: COMMIT V19 eta 1038 at 1032; DELIVERY V19 at 1038, on time.
- Offer 1031 + withdraw 1032: FAILURE withdrew_before_commit at 1032; reliability shows 6 of 7.
- Offer 1031, no commit: FAILURE no_reply at 1034.
- Decline 1031: no PROPOSE by V19 at 1031; COMMIT V34 eta 1039 at 1031.
- E05 has 48 driver rounds.

## Strings (every one verbatim, from `src/i18n/driver.ts`)

Format: `Filipino · English`. `{t}` is a time as `h:mm AM/PM` (from `hhmm` in `src/donor/tonight.ts`, the same 12-hour form the donor screen uses). `{n}` is a whole number of simulated minutes.

| Key | Text |
|---|---|
| title | Tagahatid · Volunteer driver |
| simNote | Kathang-isip at simulasyon ang lahat ng tagahatid, lugar at numero dito · Every driver, place and number here is fictional or simulated |
| chooserLabel | Sino ka sa simulasyon? · Who are you in the simulation? |
| chooserHint | Pumili ng tagahatid na may hiling. Ikaw ang napili · Choose a driver who gets requests. You hold the one you choose |
| chooserItem | Piliin si {name} · Choose {name} (TalkBack label of each chip) |
| requests | Mga hiling · Requests |
| requestsEmpty | Walang hiling sa ngayon · No requests right now |
| requestsEmptyHint | Lilitaw dito ang hiling kapag tinawag ka ng orasan ng simulasyon · A request appears here when the simulated clock calls you |
| pickupFrom | Kunin kay · Pick up at |
| dropoffAt | Ihatid kay · Drop off at |
| before | bago mag-{t} · before {t} |
| window | Sumagot sa loob ng {n} min · Reply within {n} min |
| offer | Mag-alok · Offer to deliver |
| offerNo | Hindi ka aabot bago ang oras · You cannot arrive before the deadline |
| decline | Tanggihan · Decline |
| offered | Naialok · Offered, by {t} |
| picked | Napili ka, i-commit sa loob ng {n} min · You were picked, commit within {n} min |
| commit | I-commit · Commit |
| withdraw | Bawiin · Withdraw |
| withdrawWarn | Mabibilang itong takbong hindi natuloy · Counts as a missed run |
| notPicked | Hindi napili · Not picked |
| notPickedHint | May ibang tagahatid na nanalo sa lot na ito · Another driver won this lot |
| committed | Naka-commit, maghahatid bago ang {t} · Committed, delivers before the {t} pickup deadline |
| runs | Mga takbo ko · My runs |
| runsEmpty | Wala ka pang takbo · No runs yet |
| pickedUp | Nakuha ng {t} · Picked up at {t} |
| delivered | Naihatid ng {t} · Delivered at {t} |
| onTime | Sa oras · On time |
| late | Huli na · Late |
| notYet | Hindi pa naihahatid · Not delivered yet |
| withdrewStatus | Binawi mo · You withdrew |
| noReplyStatus | Hindi nakapag-commit sa oras · No commit in time |
| cancelledStatus | Kinansela ng operator · Cancelled by the operator |
| missedNote | Bilang na hindi natuloy · Counts as a missed run |
| stickerRequest | Hiling · Request |
| stickerPicked | Napili · Picked |
| stickerCommitted | Naka-commit · Committed |
| stickerDelivered | Naihatid · Delivered |
| stickerNotPicked | Hindi napili · Not picked |
| stickerMissed | Hindi natuloy · Missed |
| maps | Buksan sa Google Maps · Open in Google Maps |
| route | Ruta, sa salita · Route, in words |
| routeLine | Kunin kay {donor}, {donorStreet}. Ihatid kay {pantry}, {pantryStreet}. · Pick up at {donor}, {donorStreet}. Drop off at {pantry}, {pantryStreet}. |
| lot | Lot {n} |

Reused from shared code (not in `driver.ts`): the tarp chip `SIMULASYON` and its label `Simulasyon. Simulated data.` (TarpBar); the play/pause control `Ituloy ang simulasyon. Play the simulation.`, `I-pause ang simulasyon.`, `Tapos na ang simulasyon.` (SimControl, from `src/i18n/strings.ts`). Lot items use `S.units` (for example `tray`) from the same file.

Spoken labels: the separator " · " is read as a pause (". "). Lot items read as `3 tray adobo`. Times in TalkBack come from the same `hhmm` output.

## Decisions I made (for review)

1. Chooser: all 40 drivers on E05 get requests, so the row is long and scrolls. The default is the first driver, V01, per the brief, which never wins work. Consider a default that wins work, or ask for the change.
2. "Withdraw" is shown only once the engine has picked the driver. An offer that was not picked has no withdraw, because the engine would ignore it.
3. "Picked up" uses the trip estimate at the pick (no pickup event in the log). It is labelled as the time the run is picked up; the donor and pantry screens are not affected.
4. Maps: the dataset has street names; coordinates exist only in the CSV files, not in the bundled data. The link is `https://www.google.com/maps/dir/?api=1&origin=…&destination=…&travelmode=driving` with "name, street, Quezon City" as the places. If no app takes the link, `expo-web-browser` opens it.
5. Holding changes the whole evening from the moment the held driver's rounds start. Leaving the screen releases the hold, and the engine then re-runs with that driver simulated. The past of the run can change. The screen holds on open, so pick the driver before playing.
6. The board only means something for the held driver. It treats an eligible driver in a run as asked, so it must only be read on a run where that driver is held. The screen only reads it after `heldDriver()` confirms the hold.

## Verification (commands and results)

Run in this session, after the last code change:

- `npx tsc --noEmit`: exit 0, no errors.
- `npx expo lint`: exit 0, no errors and no warnings.
- `npx jest`: `Test Suites: 3 skipped, 29 passed, 29 of 32 total`; `Tests: 3 skipped, 396 passed, 399 total`; 0 failures. The 3 skipped suites and tests were skipped before this feature; they are not in the driver files.
- Driver suites on their own: `board` (derivation, offer, commit, withdraw, no-reply, decline, 48-round engine agreement), `chooser` (40 drivers, default V01, held-run cross-check), `maps` (URL literal), `hold` (live store: asks, offer and commit through `answerDriver`, release, no republish on same driver).

Note on the test run: the first background chain (tsc, lint, jest) lost its lint and jest steps when the session crashed. The lint and jest results above come from a rerun of each on its own, after the tsc run had already exited 0 on the same code.

## Open risks

- Derivation rests on the engine's rules as they stand in `simulate.ts`. If the engine changes its round or pick logic, `board.test.ts` (the 48-round check) is the test that breaks first.
- No pickup event and no "asked" event in the engine. Request an engine log entry for `ASKED` and `PICKED_UP` for held drivers, so the screen need not derive them.
- TalkBack, 200% font scale, reduced motion and the screenshots are not verified on the device. The screen has no motion of its own; the Sticker has a fixed rotation only.
- The Taglish copy is not yet reviewed by Codex: send every string above to Codex.
- The device check was not run (see below).

## Not done (device and build, by instruction)

Per the coordinator, no emulator, Metro, Gradle build or screenshot was run in this pass. Before this pass, one build attempt failed (Expo's device resolver queried the MuMu device on `emulator-5554` and failed; nothing was installed there). A debug Gradle install to `emulator-5556` (vel_phone) was started and then stopped when the session ran out of memory. The earlier screenshots on disk show the old installed build: the route `salo://driver` is unmatched there, because the installed bundle predates this change. Those two files (`.impeccable/review/driver-try1.png`, `driver-try2.png`) are not the feature. The orchestrator's combined device check must rebuild before it can see this screen.
