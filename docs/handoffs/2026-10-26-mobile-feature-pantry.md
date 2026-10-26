# Handoff: mobile-feature, pantry coordinator (PAN-01 to PAN-07)

Date: 2026-10-26. Profile: P01 Bukal Community Kitchen by default (`?profile=P<id>` on the link picks another pantry). Simulated evening E05 (tuning, UNTUNED_PARAMS), labelled simulated. No commit, no push.

## Status

- Code and tests: done. `npx tsc --noEmit` clean. `npx expo lint` no problems. `npx jest` 29 suites passed, 3 skipped (pre-existing), 396 tests passed (the pantry suite is 20 of them).
- Device step: NOT RUN. The orchestrator will run one combined device check later (screenshots `pantry-lots.png`, `pantry-why.png`, `pantry-200.png` are not produced). No emulator, Metro, Gradle or build was run in the final session, by rule.

## What was built

| Story | Where | What |
|---|---|---|
| PAN-01 open lots | `src/app/pantry/index.tsx`, `src/pantry/model.ts` `openLots` | Open lots (posted, clock not past pickup-by, not awarded to this pantry), each with item, amount, storage, pickup-by, distance in km. Text, not color alone. |
| PAN-02 value and bid | `src/app/pantry/lot/[id].tsx`, `src/components/pantry/ValueTable.tsx` | Four parts and total to two decimals (total = sum of the displayed parts), shares bid, the auto-bid note. Read-only. |
| PAN-03 refusal | `lot/[id].tsx`, `model.ts` | REFUSED sticker, engine reason, no value and no parts. |
| PAN-04 shares left | `index.tsx` budget line, `model.sharesLeft` | 40 minus winning bids (TENTATIVE_ACCEPT), updating with the clock. |
| PAN-05 / PAN-06 status | `model.ts` `pantryLotViews`, `PantryTag.tsx` | Bidding, Outbid, Tentative, Final, Delivered, Stranded, Refused, from the visible log. Re-announcement note after a driver failure. |
| PAN-07 why | `lot/[id].tsx`, `src/pantry/format.ts` `whySentence` | Fixed template filled with the numbers. |

Engine values are read from the log: the parts are the engine's `UtilityBreakdown` on the pantry's PROPOSE, the shares are the bid, awards are TENTATIVE_ACCEPT, refusals are REFUSE. Nothing is re-derived. No engine file was edited.

Routes: `src/app/pantry/index.tsx` (`salo://pantry`, `salo://pantry?profile=P01`), `src/app/pantry/lot/[id].tsx`. Navigation uses string hrefs cast to `Href` because typed routes regenerate only when the dev server runs.

Files (all mine):
- `src/i18n/pantry.ts` (new strings file)
- `src/pantry/model.ts`, `src/pantry/format.ts`, `src/pantry/lotText.ts`, `src/pantry/usePantry.ts`
- `src/pantry/__tests__/pantry.test.ts`
- `src/components/pantry/PantryTag.tsx`, `src/components/pantry/ValueTable.tsx`
- `src/app/pantry/index.tsx`, `src/app/pantry/lot/[id].tsx`
- this handoff

## Tests (literal values from a real E05 run, UNTUNED_PARAMS)

The pantry suite runs the engine on E05 and checks these literals (not Lot 14):

- L0216 (P01 won, delivered): parts need 0.40, storage 0.30, distance 0.13, freshness 0.13, total 0.96; engine total 0.9644422700587084; 16 shares; road 0.53 km from D03.
- L0247 (P01 won): 0.31 + 0.30 + 0.12 + 0.12 = 0.85; engine total 0.8534108699519658; 15 shares.
- L0207 (P01 bidding at 17:25, outbid at 17:28 by P13): 0.40 + 0.30 + 0.12 + 0.12 = 0.94; engine total 0.9396135029354207.
- Every P01 bid on E05: displayed parts add up exactly to the displayed total, and the total is within 0.02 of the engine total.
- Shares: 40 before any award, a losing bid spends nothing (D-Q4); 40 - 16 = 24 after L0216; 40 - 16 - 15 = 9 after L0247.
- Status: tentative, final, delivered for L0216; tentative with re-announce note at 18:05, final at 18:08 for L0247; P24 stranded on L0230 at 19:22; P10 refuses L0206 at 19:06 with no value.
- Live path: `LiveEvening.cancelDriver('L0216')` at 17:50 gives tentative with the re-announce note; a new driver commits at 17:52 (final, note kept); a second driver failure at 17:57 gives tentative again at 17:58; the lot is delivered at 18:20. The test checks 17:50, 17:52 and 18:20. The shares are 9 at 18:20 (L0216 16 and L0247 15 are both won in this run).
- Open lot leaves the open list after its pickup-by minute; awards are kept whatever their deadline.
- Why sentence: changing one part (need 0.85 to 0.75) changes the total and the sentence.

Test corrections made during the work, for the record: the first version of the distance test used D01 (L0216's donor is D03), and two comment times were wrong. Both are fixed in the test file. No literal was changed to match the code.

## Strings (verbatim, from `src/i18n/pantry.ts`)

Filipino first, English after " · ". Every line below is in the file.

```
PANTRY_UNITS_EN: tray trays | piece pieces | bilao bilao | kg kg | loaf loaves | pot pots | pack packs | can cans
PANTRY_UNITS_FIL: tray tray | piece piraso | bilao bilao | kg kg | loaf tinapay | pot kaldero | pack pakete | can lata

home: Mga lot ngayong gabi · Lots tonight
back: Bumalik · Back
openLot: Buksan ang detalye ng lot. · Open the lot details.
budget.line(left, total): Shares na natira: {left} sa {total}. · Shares left: {left} of {total}.
budget.note: Para ito sa gabing ito. Ang nanalong bid lang ang nagbabawas. · These are for tonight. Only a winning bid uses them up.
awards: Mga award ko · My awards
open: Mga bukas na lot · Open lots
noOpen: Walang bukas na lot ngayon. · No open lots right now.
noAwards: Wala pang award ang pantry na ito. · This pantry has no award yet.
unknownPantry: Hindi namin mahanap ang pantry na ito. · We could not find this pantry.
lotNotFound: Wala pa ang lot na ito ngayong gabi. · This lot is not posted yet tonight.
fields: Dami · Amount | Imbakan · Storage | Kunin bago · Pick up by | Layo · Distance
fridge.pantryHas: May ref ang pantry · The pantry has a fridge
fridge.pantryNone: Walang ref ang pantry · The pantry has no fridge
storage.fridge: Kailangan ng ref kung itatabi · Needs a fridge if kept
storage.dry: Hindi kailangan ng ref · No fridge needed
amountLine(qty, unitFil, unitEn): {qty} {unitFil} · {qty} {unitEn}
fact.amount(v): Dami · Amount: {v}
fact.storage(v): Imbakan · Storage: {v}
fact.pickupBy(v): Kunin bago · Pick up by: {v}
fact.distance(km): Layo · Distance: {km} km
fact.lot(id): Lot {id}
pickupBy(time): Kunin bago {time} · Pick up by {time}
parts.need: Kailangan ngayong gabi · Need tonight
parts.storage: Kayang itabi · Can store
parts.distance: Layo · Distance
parts.freshness: Sariwa pa · Freshness
parts.total: Kabuuan · Total
value.heading: Value ng lot para sa pantry · Value of this lot for the pantry
value.bidShares(n): Shares na na-bid: {n} · Shares bid: {n}
value.sharesLeft(n): Shares na natira: {n} · Shares left: {n}
value.auto: Awtomatikong nag-bid ang agent ng pantry. Hindi ito mababago ng coordinator sa v1. · The pantry agent bids automatically. The coordinator sees the bid and cannot change it in v1.
value.noValue: Walang value: tinanggihan ang lot. · No value: the lot was refused.
value.noBidYet: Hindi pa nag-bid ang agent. · The agent has not bid yet.
why.heading: Bakit sa amin ito? · Why did you get this lot?

status.bidding: sticker BIDDING | Nagbi-bid · Bidding | Nagbi-bid ang agent ng pantry. Bukas pa ang round. · The pantry agent is bidding. The round is still open.
status.outbid: sticker OUTBID | Natalo sa bid · Outbid | May ibang pantry na mas mataas ang bid. · Another pantry bid higher.
status.tentative: sticker TENTATIVE | Tentative · Tentative | Hawak muna hanggang may driver na mag-confirm · Held until a driver commits
status.final: sticker FINAL | Final · Final | Tapos na ang award: may driver na nag-commit. · Award is final: a driver has committed.
status.delivered: sticker DELIVERED | Naihatid · Delivered | Naihatid na ang lot. · The lot has been delivered.
status.stranded: sticker STRANDED | Hindi naihatid · Not delivered | Walang driver na nag-commit bago matapos ang oras. · No driver committed in time.
status.refused: sticker REFUSED | Tinanggihan · Refused | Hindi kayang tanggapin ng pantry ang lot na ito. · The pantry cannot take this lot.

reannounced.tentative: Umatras ang naunang driver. Ini-announce ulit ang delivery; hawak pa rin ng pantry ang award. · The earlier driver withdrew. The delivery is re-announced; the pantry keeps its tentative award.
reannounced.committed: Umatras ang naunang driver; may bagong driver na nag-commit. · The earlier driver withdrew; a new driver committed.

refuse.closed_before_earliest_arrival: Sarado na bago makarating ang driver. · Closed before any driver could arrive.
refuse.cannot_store_lot: Hindi kasya sa tuyo o ref na imbakan. · Too big for dry and fridge storage.
refuse.no_remaining_need: Wala nang kailangan ngayong araw. · No remaining need today.

whyLine.won: {name} ang nakakuha ng lot dahil pinakamataas ang bid nito: {shares} shares mula sa value na {total} ({need} kailangan + {storage} imbakan + {distance} layo + {freshness} sariwa). Natira ngayon: {left} shares. Layo: {km} km. · {name} got this lot because its bid was the highest: {shares} shares from a value of {total} ({need} need + {storage} storage + {distance} distance + {freshness} freshness). Shares left now: {left}. Distance: {km} km.
whyLine.outbid: Nag-bid ang {name} ng {shares} shares mula sa value na {total}, pero mas mataas ang bid ng ibang pantry. Natira ngayon: {left} shares. · {name} bid {shares} shares from a value of {total}, but another pantry's bid was higher. Shares left now: {left}.
whyLine.bidding: Nag-bid ang {name} ng {shares} shares mula sa value na {total}. Bukas pa ang round. · {name} has bid {shares} shares from a value of {total}. The round is still open.
```

Strings composed in code (not in the copy file), for review:

- Lot screen back label: `‹ Bumalik · Back` (a glyph and the copy `back`, joined in `src/app/pantry/lot/[id].tsx`). Consider moving it into the copy file.
- Tag TalkBack label (`tagLabel` in `src/pantry/lotText.ts`): `{Lot id}, {item}. {amount}. {storage}. {pickupBy}. {distance}. {STICKER}: {fil} · {en}.`
- Tag hint: `openLot` above. Budget a11y label: budget line, then budget note.
- Tag status line: `{status.fil} · {status.en}` in `PantryTag.tsx`.
- Refuse line on the lot screen: `{refuse.fil} · {refuse.en}`.
- Section counts: `{title.en} · {count}`.
- Unknown-profile, not-found and empty states use the copy keys above.

## Engine requests (not edited)

1. PAN-04 acceptance: with 0 shares left the engine still sends PROPOSE with 0 shares (`shareBid` returns 0) and does not REFUSE "no shares left". The screen shows the engine's log as it is. Request: a REFUSE reason for zero shares, or confirm that 0-share bids are allowed.
2. Before a pantry's reply (up to 5 minutes after posting) the screen cannot show the value parts, because the engine computes them inside `reply()` and only logs them on PROPOSE. Request (optional): an exported `pantryValue(lot, pantry, clock)` for a preview.
3. Driver failure after commit (`no_show`, `cancelled_by_operator`) also triggers the re-announce note. Wording follows PAN-06 ("the earlier driver withdrew"), which is a little loose for a no-show. Confirm the wording.

## Open risks and decisions

- Device step not run (see Status). Layouts at 200% font scale and the TalkBack pass are unverified on device.
- Reduced motion (CC-10): none of the new screens animate, so nothing needs to calm down. The `reduceMotion` setting is not read on these screens.
- PAN-05 "advance the clock 10 minutes after TENTATIVE_ACCEPT, still Tentative" is not tested as a live posting. The dataset run covers the Tentative state only for 1 to 2 minutes in L0216 and for L0247 in 4 minutes. The Cancel-driver test covers the held award.
- Unknown `profile` param shows the "could not find this pantry" screen. No profile param defaults to P01.
- Display rounding: each part is rounded to cents and the total is the sum of the rounded parts, so the screen always adds up. The engine total can differ by up to 0.02 (the test asserts this bound).
- Pantry app shows the Filipino refusal wording ("Sarado na bago makarating ang driver."), not the engine's English reason. Codex review requested.
- `src/live/tape.ts` and `src/engine/__tests__/human-drivers.test.ts` had typecheck errors earlier in this session from other agents' in-progress work. At the last run both were clean. Not touched.

## Environment notes (for the orchestrator)

- `android/` was cleared and regenerated by `npx expo run:android` (prebuild, Continuous Native Generation). It is not tracked by git (0 tracked files), so nothing in git changed. Any hand-made native settings in `android/` before this would be gone.
- Read-only adb queries (`getprop`, `pm list packages`) ran against the two adb entries `127.0.0.1:16384` and `emulator-5554` before the stop message. No install, reverse or launch ran on either. One `expo run:android` attempt resolved devices and failed before any install.
- `vel_phone` was started as `emulator-5556`, booted, and confirmed with `emu avd name` = `vel_phone`. It was then gone (the kill attempt was refused, so it had already exited, probably the memory crash). Nothing was installed on it.
- A Gradle debug build was started and stopped with `./gradlew --stop`. No APK was produced or installed.
