# Handoff: mobile-feature, M3 part 1 "a live evening on one phone" (2026-10-13)

Agent: mobile-feature. Scope: the live store for one simulated evening, its tests, the donor home wired to it, a demo play control, and three M2 review fixes. No commit, no push. Nothing under `src/engine/**`, `src/data/**`, `scripts/**` or `docs/decisions.md` was touched (`git diff` on those paths: 0 lines).

Evening played: E05 (tuning, simulated). Policy: salo. Params: UNTUNED_PARAMS (TODO in code: replace after tuning, M6). Donor on screen: D01 Karinderya ni Aling Oning.

## Files changed

New:
- `src/live/evening.ts`: `LiveEvening` class. Clock (17:00 start, stops 21:30, 6 s per simulated minute), start/pause/setSpeed/tick, `postLot` (LIVE-<n>), `cancelDriver` (only when FINAL at the clock), `setPolicy` (same inputs), `visibleLog`, `lotViews`, `stateOf`, `subscribe`/`getSnapshot`. The engine runs only when inputs or policy change (memoized; `runCount` exposed for tests). Pilot and main evenings are refused in the constructor.
- `src/live/lotViews.ts`: `LotView` type and `foldLotViews`, moved from `src/donor/tonight.ts`. One pass over the log instead of one pass per lot.
- `src/live/useLive.ts`: the single app-wide `liveEvening` instance; hooks `useLiveSnapshot`, `useLotViews(donorId)` (both `useSyncExternalStore`), and `useLiveTicker` (setInterval 250 ms while running).
- `src/live/__tests__/evening.test.ts`: 21 jest tests.
- `src/components/SimControl.tsx`: the demo play/pause control ("Simulasyon: ▶/❚❚", outlined on the tarp, 48 dp tall, accessible label changes with state).

Changed:
- `src/app/donor/index.tsx`: reads the live store (no fixed 17:45 snapshot). TarpBar clock = live minute; heading uses the English plural; the play control sits in the tarp header.
- `src/app/_layout.tsx`: `useLiveTicker()` in `Shell`, so the clock keeps running across screens.
- `src/components/TarpBar.tsx`: optional `children` under the subtitle.
- `src/components/PostFab.tsx`: at fontScale >= 1.5 it becomes a 56 dp round icon-only button; the accessibility label is unchanged.
- `src/i18n/strings.ts`: `lotCountEn` ("1 lot", "2 lots"). Filipino "lot" unchanged.
- `src/donor/tonight.ts`: now only `hhmm` and a type re-export of `LotView`. `donorTonight` removed (its only caller was the donor screen).

Review screenshots: `.impeccable/review/m3-donor-running-1.png`, `m3-donor-running-2.png`, `m3-tentative.png` (all three are real captures from the emulator; each was viewed).

## Commands and real results

| Step | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0, no errors |
| Lint | `npx expo lint` | exit 0, no output |
| Live tests | `npx jest src/live` | 21 passed, 0 failed |
| Full tests | `npx jest` | 6 suites passed, 1 skipped (`report.test.ts`, gated by `REPORT=1`, skipped before this work too). 82 tests passed, 1 skipped, 83 total. |
| Emulator | `adb devices` | `emulator-5554 device` (already running) |
| Metro | `curl localhost:8081/status` | `packager-status:running` (already running; not restarted) |
| Port | `adb reverse tcp:8081 tcp:8081` | ran; app loaded its JS from Metro (development build) |
| Relaunch | `adb shell am force-stop com.arjhinety.salo; adb shell monkey -p com.arjhinety.salo -c android.intent.category.LAUNCHER 1` | `Events injected: 1` |

A temporary probe test was used to choose the scenarios (live lot at 18:20 for D01; L0211 final at 18:05). It was deleted before the real tests were written.

Bug found by the tests and fixed: the displayed minute could lag one tick behind (5/6 + 1/6 of a minute summed to 1020.9999999999999). `minute()` now floors `clock + 1e-9`. The failing test ("notifies subscribers only when the whole minute changes") now passes.

## Screenshots (device 1080x2400, font 1.0, night off)

- `m3-donor-running-1.png`: clock 5:45 PM, LUMPIANG SHANGHAI FINAL, ADOBONG BABOY MAY BID.
- `m3-donor-running-2.png`: clock 5:51 PM, both lots FINAL. Taken about 40 real seconds after the first (estimated from the capture loop, not timed). The clock moved about 6 minutes, and the second tag's state changed from MAY BID to FINAL.
- `m3-tentative.png`: clock 5:43 PM, LUMPIANG SHANGHAI TENTATIVE with the lime sticker, ADOBONG BABOY MAY BID.
- Also checked, not saved to the review folder: 200% font at 5:00 PM with no lots. The FAB is the 56 dp round icon-only button, "Tonight · 0 lots", and the header wraps cleanly. The font scale was restored to 1.0 afterwards (`adb shell settings get system font_scale` returned `1.0`).

What the screenshots show: the clock advances at about 6 s per simulated minute (5:00 to 5:10 PM in about 60 real seconds); lots appear at their posting minute (17:37, 17:42); tags move MAY BID, TENTATIVE, FINAL, NAIHATID as the evening runs; the lime sticker appears only in TENTATIVE.

Not seen on the emulator: the 1-3 minute reply delay gives TENTATIVE only about 6 to 18 real seconds, so a 7-second sampling missed it. A 1-second burst (60 frames, `b-*`) caught it.

## Not done, and why

- **Navigation state across a font-size change (item 5c): not done.** On Android the activity is recreated on a font-scale change, which returns the app to the picker. This was observed in M2 (`docs/handoffs/2026-10-13-mobile-feature.md`). I did not re-observe it in this session: I set the font scale and force-stopped the app instead of changing the scale live. A fix needs `fontScale` in the activity's `android:configChanges`, and that needs a config plugin in `app.json`. `android/` is generated (CNG) and not tracked by git, so a hand edit is not allowed. Not simple, so left out.
- **`cancelDriver` on the emulator: not run.** Covered by the jest tests only (the cancel path is in `evening.test.ts`). No play-screen UI exists for cancel yet.
- **Release APK: not built.** `docs/milestones.md` requires a release APK with the laptop off at M3 exit. This is part 1, and the brief asked for the dev-build flow. M3 is not exited.
- **`npx expo-doctor`: not run.**

## Deviations from the brief (for review)

- `postLot` and `cancelDriver` return `LiveResult` (`{ok, value}` or `{ok:false, problems}`) instead of throwing or returning a bare value. The UI can show the problems.
- `start`, `pause`, `tick`, `setSpeed` accept an optional `nowMs` (default `Date.now()`) so tests are deterministic.
- The ticker sits in the root `Shell`, not on the donor screen, so the evening keeps its clock on other screens.
- Closing time is not checked on live posts. The brief listed three checks (donor exists, pickup after clock, items non-empty), and the `types.ts` comment mentions closing as well. D01 closes at 17:30 but has dataset lots posted at 17:37 and 17:42, so the closing rule would reject lots the dataset itself contains. Decision needed.

## Open issues

1. **Closing-time rule** (see above). Needs a decision before live posting (M4) uses it.
2. **Clock catch-up after backgrounding.** `setInterval` stops when the app is in the background. On return, the next tick adds the real elapsed time, so the clock can jump. Not tested on the device.
3. **Post screen** (`src/app/donor/post.tsx`) still shows a hardcoded "5:45 PM" and does not post into the store. The brief scoped this to the donor home. `postLot` has no UI caller yet.
4. **Demo play control.** It is demo-only. Whether it stays in the demo-day release build is open.
5. **Reply-delay window.** TENTATIVE lasts 6 to 18 real seconds at the default speed. Fine for the demo, but brief enough to miss in a quick glance. Worth noting for the demo script.
6. **Uncommitted, untracked files from another agent:** `.impeccable/surfaces/salo-app-src-app-dashboard-index-tsx.md` was already untracked before this work. I did not touch it.

## Git state (for the orchestrator)

Modified: `src/app/_layout.tsx`, `src/app/donor/index.tsx`, `src/components/PostFab.tsx`, `src/components/TarpBar.tsx`, `src/donor/tonight.ts`, `src/i18n/strings.ts`. New: `src/components/SimControl.tsx`, `src/live/` (evening.ts, lotViews.ts, useLive.ts, __tests__/evening.test.ts), `.impeccable/review/m3-*.png`, this handoff. Nothing committed.
