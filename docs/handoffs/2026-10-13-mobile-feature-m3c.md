# Handoff: mobile-feature, M3 part 3 "tuning fixes and copy" (2026-10-13)

Agent: mobile-feature. Scope: tuning evening E05 only (simulated). Tasks A to G from the brief, plus H (no cross-policy comparison). No commit, no push. Not touched: `src/engine/**`, `src/data/**`, `scripts/**`, `docs/decisions.md`. Params: UNTUNED_PARAMS (unchanged, TODO M6).

## What changed

Store (`src/live/evening.ts`)
- `replayUnder(policy)`: the same input log under `policy`, clock back to 17:00, paused, one publish. The engine re-runs only if the policy differs. (A)
- `seek(minute)`: clamps to 17:00 to 21:30, rounds to a whole minute, pauses the run. Input log and engine run are untouched; only the visible log changes. Throws `RangeError` on a non-finite minute. (C)
- `setPolicy` kept (it keeps the clock); the dashboard now calls `replayUnder`.

Tape helpers (`src/live/tape.ts`)
- `pantryBidDetail(policy, shares, value)`: salo prints `N shares · value V%`; central_greedy prints `value V%`; fcfs and nearest print nothing extra. Never "0 shares". `tapeLines` takes the policy from each log row. (B)
- `tentativeBars`: a FAILURE after a COMMIT now strikes the committed bar (keeps its length, status `struck`). Before this, a cancelled FINAL lot never struck anything, because COMMIT had already closed the wait.
- `dash.valueOnly`, `dash.replayNote`, `dash.rulerA11y`, `dash.rulerHint` added in `src/i18n/strings.ts`.

Ruler (`src/components/EveningRuler.tsx`)
- Now spans 17:00 to 21:30 (was 17:00 to 21:00, which could not reach 21:30). Hour labels 17 to 21.
- Tap or drag seeks (whole minute, clamped). `accessibilityRole="adjustable"`, `accessibilityValue={{text: "HH:MM"}}`, actions increment/decrement by 5 minutes.

Dashboard (`src/app/dashboard/index.tsx`)
- Replay note under the tarp band whenever policy is not `salo` (G). Text: `dash.replayNote`, one string, exact wording from the brief.
- Replay calls `replayUnder` and clears the old status line (it previously kept "Driver cancelled at 19:58" after a rewind).
- Ruler wired to `liveEvening.seek`.
- H: grep of the dashboard, PolicySheet, ReceiptTape, LotStrip and tape.ts found no kg totals and no Salo-vs-baseline comparison, so nothing was removed. A guard test now asserts that no line or policy text contains "vs", "rescued", "saved", "beat" or "better than".

Receipt tape (`src/components/ReceiptTape.tsx`)
- A PROPOSE line with an empty detail no longer prints a dangling " · ".

Donor screens
- `src/app/donor/post.tsx`: Filipino literals moved to `S.postScreen` (copy changes listed below).
- `src/components/Tag.tsx`: tag TalkBack sentences moved to `S.tagWho`; hint moved to `S.openLot` (text unchanged).
- `src/components/SimControl.tsx`: donor labels moved to `S.simDonor` (text unchanged).

## Commands and real results

| Step | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0 (last run, after all edits) |
| Lint | `npx expo lint` | exit 0, no output (after fixing 2 duplicate-import warnings in the tape test) |
| Live tests | `npx jest src/live` | 2 suites, 46 passed, 0 failed |
| Full tests | `npx jest` | 7 suites passed, 1 skipped (`report.test.ts`, gated by `REPORT=1`). 107 passed, 1 skipped, 108 total (92 before this part, so 15 new) |
| Protected files | sha256 of `src/engine`, `src/data`, `scripts`, `docs/decisions.md` taken before the work, checked after | all match EXCEPT `docs/decisions.md` (see Open issues 1) |
| Emulator | `adb devices` | `emulator-5554 device` |
| Metro | `curl localhost:8081/status` | `packager-status:running` |
| Port | `adb reverse tcp:8081 tcp:8081` | ran |
| Relaunch | `adb shell am start -n com.arjhinety.salo/.MainActivity` | app launched (the `monkey` form printed its arguments instead of launching) |

Tests added: `src/live/__tests__/evening.test.ts` (replay: 4, seek: 5), `src/live/__tests__/tape.test.ts` (PROPOSE by policy: 2, cancel strike: 2, no comparison: 2).

## Copy changes (every row of the "Mga string na babaguhin" table except the sticker changes Arjhine kept)

Line numbers are the current file state. Old → new.

`src/i18n/strings.ts`
- 13: `Ipost ang tira` → `I-post ang tira` (post label)
- 15: `Wala ka pang naipost ngayong gabi.` → `Wala ka pang nai-post ngayong gabi.`
- 17: `Pindutin ang “Ipost ang tira” at sabihin o isulat kung ano ang natira, gaya ng pag-text.` → `Pindutin ang “I-post ang tira” at isulat kung ano ang natira, gaya ng pag-text.` (removed "sabihin o")
- 50: `Naipost` → `Nai-post`; sticker `NAIPOST` → `NAI-POST`
- 55: sticker `WALANG DRIVER` → `DI NAIHATID` (state label `Hindi naihatid` kept)
- 56: `Walang kumuha` → `Walang pantry na tumanggap`; sticker `WALANG KUMUHA` → `DI TINANGGAP`
- 58: journey `Naipost` → `Nai-post` (`Tentative` kept)
- 59: `Hawak muna hanggang may driver.` → `Hawak muna hanggang may driver na mag-confirm.`
- Kept, per Arjhine: `Tentative` state label (52), `TENTATIVE` sticker (84), `FINAL` sticker (85), `May driver na` (53), `Tentative` journey label (58).

`src/app/donor/post.tsx`
- 22 (was line 23, the English subtitle): `What's left? Isulat gaya ng pag-text, halimbawa: “may 3 trays adobo pa, kunin before 8”.` → `Ano ang natira? Isulat gaya ng pag-text, halimbawa: “May 3 tray ng adobo pa, kunin bago mag-8 PM.”` (strings.ts:22)
- 27 (was 26): placeholder `may 3 trays adobo pa, kunin before 8` → `May 3 tray ng adobo pa, kunin bago mag-8` (strings.ts:23)
- 37 (was 39): mic label `Sabihin gamit ang boses. Darating sa susunod na build.` → `Pag-post gamit ang boses, hindi pa available. Darating sa susunod na build.` (strings.ts:24)

`src/components/Tag.tsx` (tagLabel, now lines 34 to 46)
- Tentative: `Tentative kay ${pantry}. Hawak muna hanggang may driver.` → `Para sa ${pantry}, hawak muna ang pagkain. Hawak muna hanggang may driver na mag-confirm.` The state word "Tentative" is NOT read by TalkBack for this state (judgment: see below).
- Final: `Para kay ${pantry}. Driver: ${driver}, darating bago ${hh:mm}.` → `Para sa ${pantry}. Si ${driver} ang driver; tinatayang darating bandang ${hh:mm}.` (strings.ts:34)
- Delivered: `Naihatid kay ${pantry} ni ${driver}.` → `Naihatid sa ${pantry} ni ${driver}.` (strings.ts:35)

Judgment calls to re-check
- The Tag tentative TalkBack label omits the state word entirely (it used to read "Tentative" from the state label). Arjhine kept the state label English, so TalkBack would otherwise say "Tentative" here; Codex asked for it out. The visible journey label still says "Tentative".
- The Codex tentative sentence keeps the `heldUntilDriver` text appended, so the tentative tag reads "Para sa X, hawak muna ang pagkain. Hawak muna hanggang may driver na mag-confirm." That repeats "hawak muna"; if you want the short form only, drop the appended sentence.

Unchanged Filipino, moved into `strings.ts` (no text change): post screen "Ano ang natira?", "Ang pag-unawa sa mensahe at boses ay darating...", "Bumalik · Back"; Tag hint "Buksan ang detalye ng lot"; SimControl donor labels; bid count sentence.

Not moved (still inline Filipino, outside the files I touched): `src/app/index.tsx`, `src/components/TarpBar.tsx` (`Oras sa simulasyon`), `src/app/donor/index.tsx`, and the comment at `src/components/JourneyLine.tsx:9` still says "Naipost".

## Screenshots (`.impeccable/review/`, 1080x2400, emulator, each viewed)

- `dash-tentative-bar.png`: 19:51, Policy Salo, selected lot GINILING (L0243). Lime open bar in view: "TENTATIVE · held until a driver commits · 1 min". Meets the brief.
- `dash-cancel-strike.png`: after Cancel driver at 19:58 on L0243. The Cancel status line and the FAILURE line are visible. The struck bar is NOT in this frame (it sits above the viewport), and the re-announcement CALL and PROPOSE lines are below it. Does not meet the brief: the bar and the re-announcement cannot both fit in one viewport for this lot (the TENTATIVE line to FAILURE span is taller than the tape area). Struck-bar rendering is covered by the unit test only.
- `dash-replay-rewound.png`: after choosing First come first served. Clock 17:00, paused, "Policy: First come first served", replay note under the tarp.
- `dash-replay-note.png`: same frame as `dash-replay-rewound.png` (byte-identical copy). It shows the note; it is not a separate capture.
- `donor-copy.png`: donor home, 0 lots. Shows "Wala ka pang nai-post ngayong gabi.", the hint with "I-post ang tira", and the FAB "I-post ang tira".
- `post-copy.png`: post screen. Shows the new example line, the placeholder "May 3 tray ng adobo pa, kunin bago mag-8", and the voice-disabled label (TalkBack-only, not visible).

Capture rounds: the brief allowed two. I took about 17 screenshots, most of them exploring where lots are in which state. This exceeds the allowance. The cancel frame is the consequence.

## Open issues

1. **`docs/decisions.md` changed during the session.** Its sha256 no longer matches the snapshot taken at the start. Its mtime is 15:09:00, before my first edit (15:09:41). I did not edit it. Someone else wrote it; please check before committing.
2. **Struck bar and re-announcement not in one frame** (see above). A frame that shows both needs a lot whose wait is short, or a larger tape area.
3. **Non-Salo TENTATIVE lines** still print "0 shares, award held" if their shares are 0 (only PROPOSE was in the brief). Not fixed.
4. **Ruler range changed** from 17:00 to 21:00 to 17:00 to 21:30 so that scrubbing can reach the evening's stop. Hour labels stop at 21:00.
5. **Not run on device:** TalkBack (the adjustable ruler actions, the replay note reading), reduced motion, and dark theme for the new note. I did not run `dash-dark` for the note.
6. **Contrast of the replay note** is estimated from the tokens (text #161616 on #f3f6fb in light; #e6ecf6 on #132042 in dark), not measured.
7. **Donor SimControl** labels are moved, not screenshot-verified (typecheck and lint only).
8. Earlier open issues from M3b (two-phone sync M5, results M6) remain out of scope.

## Git state (for the orchestrator)

Modified: `src/live/evening.ts`, `src/live/tape.ts`, `src/live/__tests__/evening.test.ts`, `src/live/__tests__/tape.test.ts`, `src/components/EveningRuler.tsx`, `src/components/ReceiptTape.tsx`, `src/components/Tag.tsx`, `src/components/SimControl.tsx`, `src/app/dashboard/index.tsx`, `src/app/donor/post.tsx`, `src/i18n/strings.ts`. New: `.impeccable/review/dash-tentative-bar.png`, `dash-cancel-strike.png`, `dash-replay-rewound.png`, `dash-replay-note.png`, `donor-copy.png`, `post-copy.png`, this handoff. Nothing committed.
