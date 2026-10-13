# Handoff: mobile-feature, M3 part 4 "Codex re-check copy and review defects" (2026-10-13)

Agent: mobile-feature. Scope: tuning evening E05 only (simulated). Input: `docs/copy-review/2026-10-13-codex-filipino-recheck.md` ("Strings still to change" table plus the two "consider" items) and the review defects a to d. No commit, no push. Not touched: `src/engine/**`, `src/data/**`, `scripts/**`, `docs/decisions.md` (`git diff HEAD` on those paths: 0 lines). English sticker words TENTATIVE and FINAL and the state label "Tentative" are unchanged. Units are unchanged.

## Files changed

- `src/i18n/strings.ts`: Filipino copy (table below); `dash.awardHeld` added.
- `src/app/donor/post.tsx`: live clock on the TarpBar (defect b); Back button `accessibilityLabel="Bumalik"`.
- `src/components/Tag.tsx`: tentative sentence no longer appends `heldUntilDriver`; delivered sentence no longer prefixed with `Naihatid.`.
- `src/live/tape.ts`: `tentativeDetail(policy, shares)` (defect c); `cancelledAtMinute(inputs, lotId, clock)` (defect a).
- `src/app/dashboard/index.tsx`: status line derived from the cancel event via `cancelledAtMinute`; refusal is the only React state; replay and seek clear the refusal; seek wired through a handler that clears it.
- `src/live/__tests__/tape.test.ts`: +4 tests (baseline TENTATIVE detail, cancel status by clock).
- `src/live/__tests__/evening.test.ts`: +1 test (cancel at 18:06, replay to 17:00 and seek to 18:05 hide it; input stays in the log).

## Filipino strings changed (file:line old → new)

Line numbers are the current file state.

`src/i18n/strings.ts`
- 22 `postScreen.example`: `Ano ang natira? Isulat gaya ng pag-text, halimbawa: “May 3 tray ng adobo pa, kunin bago mag-8 PM.”` → `Isulat gaya ng pag-text. Halimbawa: “May 3 tray ng adobo pa, kunin bago mag-8 PM.”`
- 24 `postScreen.voiceSoon`: `Pag-post gamit ang boses, hindi pa available. Darating sa susunod na build.` → `Hindi pa puwedeng mag-post gamit ang boses. Sa susunod na bersyon pa ito.`
- 25 `postScreen.voiceBody`: `Ang pag-unawa sa mensahe at boses ay darating sa susunod na build. Babasahin ito ni Salo at gagawing tag na iyong kukumpirmahin.` → `Sa susunod na bersyon, mauunawaan ni Salo ang text o boses mo at gagawa ng mga tag na kukumpirmahin mo.`
- 33 `tagWho.tentative`: `Para sa ${pantry}, hawak muna ang pagkain. ${held}` → `Para sa ${pantry} muna ang pagkain hanggang may driver na mag-confirm.` (`held` parameter removed; Tag.tsx:38 no longer passes `heldUntilDriver`)
- 34 `tagWho.final`: `Para sa ${pantry}. Si ${driver} ang driver; tinatayang darating bandang ${eta}.` → `Para sa ${pantry} ang pagkain. Si ${driver} ang driver at darating bandang ${eta}.`
- 39 `simDonor.finished`: `Tapos na ang simulasyon. Simulation finished.` → `Tapos na ang simulasyon.`
- 40 `simDonor.pause`: `Ihinto ang simulasyon. Pause the simulation.` → `I-pause ang simulasyon. Pause the simulation.`
- 56 `states.unawarded.sticker`: `DI TINANGGAP` → `WALANG PANTRY` (state label `Walang pantry na tumanggap` unchanged)

`src/components/Tag.tsx`
- 38 tentative sentence: no longer appends the held sentence (see 33).
- 42 delivered sentence: `Naihatid. Naihatid sa ${pantry} ni ${driver}.` → `Naihatid sa ${pantry} ni ${driver}.` (the `S.states.delivered.fil` prefix removed).

`src/app/donor/post.tsx`
- 52 Back button: added `accessibilityLabel="Bumalik"`. Visible text stays `Bumalik · Back`.

Not changed, per instructions: units (`loaf: tinapay` etc.), Tag.tsx:40 and :44 "consider" items (left as they were; the table did not list them), `heldUntilDriver` constant at strings.ts:59 (its `fil` is now unused; left in place).

## Review defects

- a. Stale status after replay. The status line is derived from the store's CANCEL_DRIVER input: visible only when the clock is at or after that cancel's minute, for the selected lot. A rewind or seek before the cancel hides it without extra state. Behaviour change: the status is per selected lot (before, it was global until the next replay). Jest: `cancelledAtMinute` tests in tape.test.ts and the evening.test.ts case. Device: after a cancel at 18:06 and "First come first served", the clock is 17:00 and the status line is absent (UI dump of `dash-replay-rewound2.png`).
- b. Post screen clock: `TarpBar clock={hhmm(sim.minute)}` (same source as the donor home). Device: post screen shows `5:30 PM` while the donor home shows `5:30 PM`.
- c. Baseline TENTATIVE lines: `tentativeDetail(policy, shares)`: salo prints `N shares, award held`; other policies print `award held`. Jest only (two tests). Not seen on device in this run.
- d. Struck bar and re-announcement CALL in one frame: NOT MET. See Open issues 1.

## Commands and real results

| Step | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0, no output |
| Lint | `npx expo lint` | exit 0, no output |
| Full tests | `npx jest` | 7 suites passed, 1 skipped (`report.test.ts`, gated by `REPORT=1`). Tests: 112 passed, 1 skipped, 113 total (107 passed, 1 skipped, 108 total before this part; +5 new). |
| Protected files | `git diff HEAD -- src/engine src/data scripts docs/decisions.md \| wc -l` | 0 |
| Emulator | `adb devices` | `emulator-5554 device` |
| Metro | `curl localhost:8081/status` | `packager-status:running` |
| Port | `adb reverse tcp:8081 tcp:8081` | ran |
| Relaunch | `adb shell am force-stop` + `am start -n com.arjhinety.salo/.MainActivity` | app launched |
| UI reads | `adb shell uiautomator dump` + pull, parsed for text and content-desc | used to verify text and clock values |

## Screenshots (`.impeccable/review/`, 1080x2400, emulator)

- `dash-replay-rewound2.png`: replay under First come first served; clock 17:00; no status line. Text verified by UI dump; not visually inspected after capture.
- `post-copy2.png`: post screen; live clock 5:30 PM; new example line, voice-disabled text, Back label. Text verified by UI dump; not visually inspected.
- `donor-copy2.png`: donor home at 6:20 PM with 2 lots ("Tonight · 2 lots"); tag sentences read `Naihatid sa Pag-asa Kusina ni I. Del Rosario.` with no `Naihatid.` prefix. Text verified by UI dump; not visually inspected.
- `dash-cancel-strike-attempt.png`: NOT the requested dash-cancel-strike.png. Cancel at 18:06 on L0247. Shows FAILURE, COMMIT, and the re-announcement CALL. The struck bar is not in view.

Capture rounds: this part went over the allowance. About ten screenshots were taken while finding a frame, plus a stale-dump episode caused by a path-conversion error in Git Bash (the first dumps were of an old file). Recorded here instead of hidden.

## Open issues

1. **Defect d not met.** On lots L0247 and L0215 the struck bar sits under the TENTATIVE line, which is followed by a long run of PROPOSE rows (about eight, most wrapping to two lines) before COMMIT, FAILURE and CALL. The span from TENTATIVE to CALL is taller than the tape viewport on the dashboard. Reducing row spacing (as the brief allowed) would not close that gap on these lots. Options for Arjhine's decision: (a) give the tape more height on the dashboard (shrink the tarp or ruler), (b) keep one frame for the bar and a second for the CALL, (c) choose a lot where the wait has no PROPOSE rows. No ruler seek was used to find a frame in this run.
2. Replay with baseline on device was only checked for the status line. The baseline TENTATIVE "award held" line was not seen on device.
3. Not run on device: TalkBack (Bumalik label, sticker text), dark theme, font scale 2x for the new post screen clock.
4. `heldUntilDriver` (strings.ts:59) is unused in code now; decide whether to delete it.
5. Earlier open issues (M5 two-phone sync, M6 results and tuned params) remain out of scope.

## Git state (for the orchestrator)

Modified: `src/i18n/strings.ts`, `src/app/donor/post.tsx`, `src/components/Tag.tsx`, `src/live/tape.ts`, `src/app/dashboard/index.tsx`, `src/live/__tests__/tape.test.ts`, `src/live/__tests__/evening.test.ts`. New: `.impeccable/review/dash-replay-rewound2.png`, `post-copy2.png`, `donor-copy2.png`, `dash-cancel-strike-attempt.png`, this handoff. Nothing committed.
