# Handoff: mobile-feature, M3 manual post flow (2026-10-13)

Agent: mobile-feature. Scope: the last coding piece of M3, a donor can post a lot from the phone (manual form; parsing is M4). No commit, no push. Nothing under `src/engine/**`, `src/data/**`, `scripts/**`, `data/**` or `docs/decisions.md` was touched by this work (`git diff` on those paths: 0 lines at handoff time). The engine was changed by another agent and committed as `44e596a`; I rebuilt the APK from that tree.

## What changed

| File | Change |
|---|---|
| `src/donor/catalog.ts` (new) | Catalog derived at runtime from `EVENINGS`: one entry per (foodItem, unit), with kgPerUnit (median of estKg/quantity), minQty, maxQty, needsFridgeIfKept, maxHoursUnrefrigerated. `estKgFor`, `loadUnitsFor` (assumption that mirrors `build_dataset.py` ~420-424, documented in the doc comment), `amountLimits` (1 to maxQty). |
| `src/donor/postForm.ts` (new) | Pure logic: `DraftItem`, `pickupChoices(nowMinute)`, `donorItemKeys`, `splitPicker` (D01's own items first), `newDraftItem` (amount starts at minQty), `clampAmount`, `lotItemFor`, `lotDrafts` (one LiveLotDraft per card), `submitLots` (double-tap guard, one lot per draft). |
| `src/components/DraftCards.tsx` (new) | Reusable kraft confirm cards, fed by a plain `DraftItem[]` and reporting the next array through `onChange`. −/+ stepper (48 dp), announces the new amount, × remove with a TalkBack label, storage line, kg line. Stacks vertically when `width / fontScale < 360`. |
| `src/app/donor/post.tsx` | Text box and mic unchanged. Added the manual section below them: picker chips, cards, pickup chips with the DON-03 sub-line, the "Magiging LIVE-n" line, "Tama, i-post" (disabled with no items or no valid pickup), and a polite alert line when postLot refuses. Posting calls `router.back()`. |
| `src/live/evening.ts` | Added `nextLiveIds(count)` (read-only preview of the ids the next posts get). |
| `src/i18n/strings.ts` | Added the `postForm` key. |
| `src/donor/__tests__/catalog.test.ts` (new, 11 tests) | Catalog, kg, load-unit and picker-order literals. |
| `src/donor/__tests__/postForm.test.ts` (new, 13 tests) | Pickup chips with literal results, copy check for "expiry", lot drafts, double-tap guard, failure leaves guard open. |
| `src/live/__tests__/post.test.ts` (new, 5 tests) | Two cards post as LIVE-1 and LIVE-2, one CALL_FOR_PROPOSALS each at the post minute, D01 donor view includes both. |

Decisions I made where the brief was open:
- **Pickup after 21:00 is dropped, not capped.** At clock 20:30 no chip is offered, so the form says pickups are closed. The brief said both "never after 21:00" and "drop anything after 21:00", and the drop reading was the later instruction. The dataset generator caps at 21:00 instead (`min(21*60, ...)`), which would offer a 21:00 chip at 20:30. One-line change in `pickupChoices` if the orchestrator prefers the cap.
- **Default amount is the smallest quantity seen in the dataset** (minQty), not 1. Stepper limits are still 1 to maxQty.
- **Sardines kgPerUnit is 0.155** (median), because the dataset rounds estKg to two decimals.
- **Several lots:** the id line reads "LIVE-1, LIVE-2 at LIVE-3" for three cards, and English "and" before the last id. The brief only gave the two-card form.
- Posting is one synchronous call, so all cards get the same posting minute. If `postLot` refuses, it refuses on the first card (donor and pickup are shared), so nothing is posted.
- Item chips are disabled once five cards exist; an item already on the form is shown selected and cannot be added twice. Changing an amount uses the stepper; there is no "Baguhin" edit control and no "May mali" action (not in the M3 brief).

## Filipino strings for the grammar review (verbatim, from `src/i18n/strings.ts`, key `postForm`)

- `O piliin dito · Or pick here`
- `Pumili ng hanggang 5 item, ilagay ang dami, at piliin ang oras ng pagkuha. / Pick up to 5 items, set the amounts, and choose a pickup time.`
- `Galing sa mga na-post mo dati · From your earlier posts`
- `Iba pa · Others`
- `Idagdag ang {item}. Add {item in English}.` (function, `addA11y`)
- `Hanggang 5 item lang sa isang post. / Up to 5 items per post.`
- `Wala pang napiling item. / No items picked yet.`
- `Dami · Amount`
- `Bawasan ang dami ng {item}. Decrease the amount of {item in English}.` (function, `decreaseA11y`)
- `Dagdagan ang dami ng {item}. Increase the amount of {item in English}.` (function, `increaseA11y`)
- `Dami: {n} {unit}. Amount: {n} {unit in English}.` (function, `amountSaid`; TalkBack announcement)
- `Mga {kg} kg · about {kg} kg` (function, `kg`; "Mga" is my choice for "about")
- `Imbakan · Storage`
- `Kailangan ng ref kung itatabi · if kept`
- `Walang ref · no fridge needed`
- `Alisin ang {item}. Remove {item in English}.` (function, `removeA11y`)
- `Oras ng pagkuha · Pickup time`
- `Kunin bago {time}` (function, `pickupChip`)
- `Oras ito ng pagkuha, hindi expiry. / This is a pickup time, not an expiry date.` (the only place "expiry" appears; the test checks it)
- `Sarado na ang pagkuha ngayong gabi. / Pickups are closed for tonight.`
- `Magiging {ids} ito. / This becomes {ids in English}.` (function, `becomes`: "LIVE-1 ito", "LIVE-1 at LIVE-2 ito", "LIVE-1, LIVE-2 at LIVE-3 ito")
- `Tama, i-post · Correct, post it`
- `Pumili muna ng item. / Pick an item first.`
- `Hindi pa ma-post ngayon. Tingnan ang oras ng pagkuha at subukan ulit. / Not able to post yet. Check the pickup time and try again.`

Reviewer notes: the English of the problems line says "Not able to post yet"; the Filipino is the primary text. "Mga" in the kg line may read oddly to a native speaker. Unit words are the Filipino ones already in `S.units` (tray, piraso, bilao, kg, tinapay, kaldero, pakete, lata), so "20 piraso" appears on cards.

## Checks run (exact results)

Run after the engine commit `44e596a`, with the working tree as it is now:

- `npx tsc --noEmit`: exit 0.
- `npx expo lint`: exit 0.
- `npx jest`: **Test Suites: 1 skipped, 11 passed, 11 of 12 total; Tests: 1 skipped, 160 passed, 161 total.** That includes my 29 new tests (`src/donor/__tests__/` and `src/live/__tests__/post.test.ts`) and 14 in `src/engine/__tests__/reannounce.test.ts`, which came with the engine commit. Before my work the baseline was 117 passed, 1 skipped.
- `git diff --stat -- src/engine src/data scripts data docs/decisions.md`: empty at handoff time. Earlier in the session it showed `src/engine/simulate.ts` changes by another agent (before commit `44e596a`), and that was not mine.

Earlier run (before the engine commit, same new tests): tsc exit 0, lint exit 0, jest 146 passed, 1 skipped.

## Screenshots (`.impeccable/review/`, emulator `vel_phone`, dev build on Metro, and the release build offline)

- `post-form-empty.png`: post form with the picker and no cards.
- `post-form-cards.png`: two cards (pork adobo 3 trays, pandesal 20), pickup chips, "Magiging LIVE-1 at LIVE-2 ito.", post button.
- `post-done-donor.png`: donor home after posting, two tags.
- `release-post.png`: release build, offline, donor home at 5:45 PM with the two LIVE tags plus dataset lots L0211 and L0218.
- `release-cancel-paused.png`: release build, offline, dashboard paused at 18:29 after Cancel driver on FINAL lot L0246 (monay). The tape shows FAILURE at 18:29 and the lot reads "tentative, held until a driver commits".

Only the required three dev-build captures were taken; the post-done-donor and release-post captures did not need a retake. The cards capture was re-checked after it was taken and is correct.

## Release build and offline run

- `cd android && ./gradlew assembleRelease -x lintVitalAnalyzeRelease`: BUILD SUCCESSFUL in 2m 13s (rebuild from the current tree; `packageRelease` up to date).
- APK: `android/app/build/outputs/apk/release/app-release.apk`, 110,935,113 bytes, SHA-256 `8a0d4323fef167308b5562255828ddf21b0c322c9295e582734c74f2f25ff648`. JS bundle 2,722,696 bytes, contains the new copy.
- Offline (Metro stopped, Wi-Fi and data disabled): posted two lots as D01, watched them go MAY BID → TENTATIVE → FINAL → NAIHATID, passed 5:42 PM and saw L0211 and L0218 appear as tags, then paused the dashboard and cancelled the driver of FINAL lot L0246. The tape showed `18:29 FAILURE … driver cancelled by the operator`, the lot read tentative, and after play `18:31 COMMIT L. Mendoza · to Bayanihan Pantry · ETA 18:43`, two simulated minutes after the cancel (inside the engine's 1–3 minute re-announce delay). Wi-Fi and data re-enabled afterwards.
- `docs/release.md` updated: new size and SHA-256 in the Artifact section, and a new section "Offline run of the post flow".

## Open items and risks

- **Not run:** a double tap on "Tama, i-post" on the device (the guard is tested with `submitLots` in jest); Cancel driver while the donor clock runs (the dashboard was paused, as asked); a physical phone install (Arjhine's step).
- **Engine observation (not changed):** at 5:00 PM the two new lots showed "MAY BID" in the same minute they were posted, because the engine's pantry replies come in the post minute. That is the engine's timing, not the form's.
- **Pickup at 20:30 has no chip** (drop, not cap). See decisions above.
- **Dataset-derived catalog includes pilot and main evenings for metadata only.** The catalog and picker read every evening's lot fields; nothing runs an engine on those evenings.
- Load units are an assumption mirroring the generator, and the generator adds noise, so the inverse is approximate. Documented in `src/donor/catalog.ts`.
- The Metro dev build was replaced by the release build on the emulator; the emulator is now on the release APK.

## Fix batch (2026-10-13, second pass)

Scope: three fixes on the donor post flow, no commit, no push. Nothing under `src/engine/**`, `src/data/**`, `scripts/**`, `data/**` or `docs/decisions.md` touched (`git diff --stat` on those paths: empty).

### Changes

1. **Pickup chips cap at 21:00 instead of dropping** (`src/donor/postForm.ts`, `pickupChoices`). Now `t = min(PICKUP_LATEST, 15 * round((now + offset) / 15))`, kept if `t > now`, de-duplicated. Doc comment updated. Test updated (`src/donor/__tests__/postForm.test.ts`). Literal results:
   - 17:05 (1025) → 17:45, 18:00, 18:15, 18:30 (`[1065, 1080, 1095, 1110]`). Note: the brief's example `1050` for the first chip is not what the formula gives: 17:05 + 45 = 17:50, rounds to 17:45 (1065).
   - 20:30 (1230) → `[1260]`, shown as "9:00 PM".
   - 20:50 (1250) → `[1260]`.
   - 20:15 (1215) → `[1260]`.
   - 21:00 (1260) → `[]`; the form shows `Sarado na ang pagkuha ngayong gabi. / Pickups are closed for tonight.`
2. **Codex grammar strings** (`src/i18n/strings.ts`, key `postForm`):
   - `heading`: `O pumili rito · Or pick here`
   - `becomes` one id: `Ito ang magiging lot ID: LIVE-1. / This will be lot LIVE-1.`
   - `becomes` two ids: `Ito ang mga magiging lot ID: LIVE-1 at LIVE-2. / These will be lots LIVE-1 and LIVE-2.`
   - `becomes` three ids: `Ito ang mga magiging lot ID: LIVE-1, LIVE-2 at LIVE-3. / These will be lots LIVE-1, LIVE-2 and LIVE-3.`
   - `storage`, `noFridge`, `post`, `pickupNote` unchanged.
   Tests assert the literal strings for one, two and three ids and the heading.
3. **Gesture bar overlap** (`src/app/donor/post.tsx`): `useSafeAreaInsets` added; the ScrollView content uses `paddingBottom: SPACE.l + insets.bottom`. The donor home FAB ("I-post ang tira") was checked on the emulator: its bottom edge sits above the gesture handle.

### Checks (exact)

- `npx tsc --noEmit`: exit 0.
- `npx expo lint`: exit 0.
- `npx jest`: exit 0. `Test Suites: 1 skipped, 11 passed, 11 of 12 total`; `Tests: 1 skipped, 164 passed, 165 total`. Before this batch: 160 passed, 1 skipped (the difference is the `becomes` test split into three, plus the heading test and the 20:50 test).
- `git diff --stat -- src/engine src/data scripts data docs/decisions.md`: empty.

### Screenshots (`.impeccable/review/`, emulator `vel_phone`, dev build on Metro)

- `post-form-cards.png` (retaken): two cards (pork adobo 3 tray, pandesal 20 piraso), scrolled to the bottom. The "Tama, i-post · Correct, post it" button and the Back button both end above the gesture handle. Pickup chips 5:45 PM, 6:00 PM, 6:15 PM, 6:30 PM. Line: "Ito ang mga magiging lot ID: LIVE-1 at LIVE-2. / These will be lots LIVE-1 and LIVE-2."
- `post-form-late.png` (retaken once, first capture accepted): clock 8:30 PM, one card (adobo, 1 tray). Single chip "Kunin bago 9:00 PM", line "Ito ang magiging lot ID: LIVE-1. / This will be lot LIVE-1.", post button above the gesture bar.

Dev build: the debug APK at `android/app/build/outputs/apk/debug/app-debug.apk` (14:02, dev client) was installed over the release build on `vel_phone` with `adb install -r`; Metro ran on port 8081 with `adb reverse tcp:8081 tcp:8081`. No release rebuild and no paid build. The emulator now has the debug dev client, not the release APK.

### Open items

- Metro was stopped at the end of the batch.
- The new strings are Codex-reviewed as given; no further copy changes were made.
