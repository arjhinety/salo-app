# Mobile UI finish fixes: the eight material fixes from the finish review

Role: mobile-ui-designer. Scope: code, tests, DESIGN.md, the Codex queue and this handoff. No engine, results computation, parse, server or Supabase change. The computed numbers and the verdict label are unchanged. Nothing committed. No emulator, Metro or Gradle run (the machine is out of memory), so every device behaviour below is unverified and listed under "Open risks".

Rules followed: DESIGN.md "The Bilingual Pair Rule", "Tarp Ink" and "One Live Stamp" (lime unchanged), "The Roles Not Sizes Rule" (only theme type roles used, no new sizes).

## Fix 1: one unit system on the Results screen

- **Files:** `src/results/units.ts` (new: the one formatter), `src/results/verdict.ts`, `src/results/model.ts`, `src/results/copy.ts` (`insideGapsNote`). Tests: `src/results/__tests__/verdict.test.ts`, `model.test.ts`, `units.test.ts` (new).
- **Before:** rows "+1.4 points [−2.6, +5.3]" and "[−2.8, +1.8]" kg; verdict "... food rescued [−2.78, +1.79] kg per evening; worst-served need met [−0.03, +0.05]."; post-hoc note "±6 kg and ±0.10".
- **After:** verdict "No clear difference: food rescued [−2.8, +1.8] kg per evening; worst-served need met [−2.6, +5.3] points." Post-hoc note "... inside ±6 kg and ±10 points ...". Food is kg to one decimal, need met is points (fraction times 100) to one decimal, everywhere.
- **Tests:** the verdict fixture asserts the exact line `No clear difference: food rescued [−2.8, +1.8] kg per evening; worst-served need met [−2.6, +5.3] points.` and that no two-decimal number appears. The model test takes the brackets from the main rows of the recorded run and checks they appear in the verdict with the units "kg" and "points". The note's gaps are checked against `WIDTH_GAP_FOOD_KG` and `WIDTH_GAP_NEED_MET`.
- **Report record:** `docs/reports/m6-main.md` is untouched. Its line 9 keeps the old two-decimal verdict line as the record. `src/tuning/mainRender.ts` builds that line from `verdictLine`, so a regenerated report (gated `M6_MAIN=1`) would print the new format. Not regenerated, on purpose.

## Fix 2: Results hierarchy

- **File:** `src/app/results.tsx`.
- **Before:** gate line, evenings line, run block, four-policy table, main rows, verdict, supporting, learning, ceiling, footer.
- **After:** gate line, evenings line, run block, then the verdict (Title role) and the main comparison on a receipt box (`c.tape` with `c.onTape` ink), then the post-hoc note under the box (Small, starting "Post-hoc check, not pre-registered:"), then the supporting, learning and ceiling sections, the footer (method, resamples, seed, checksum), and the four-policy table last.
- **Tests:** none for the render (jest only runs `**/__tests__/**/*.test.ts`, so screens are not rendered in tests). The model order is what the screen reads; the screen source is checked by the existing `model.test.ts` source tests.

## Fix 3: dark-mode contrast of the run button, progress and selected states

- **Tokens:** `src/theme/tokens.ts` gains `selectFill` and `onSelect`. Light: tarp fill with white text (as before). Dark: tarp ink `#78a3f8` fill with ground-night `#0b1328` text.
- **Run button:** filled primary, tarp fill, 2dp tarp-ink edge (`c.tarpInk`), white label, 52dp. Progress fill is `c.tarpInk`.
- **Selected states:** driver chooser chips (`src/components/driver/DriverCards.tsx`, chip), dashboard view tabs (`src/app/dashboard/index.tsx`, `ViewChoice`), donor post chips (`src/app/donor/post.tsx`, the item chips and the pickup radio chips).
- **Ratios (computed with the WCAG formula):** the old night selected fill tarp-night on the night ground was 1.50:1 (fails 3:1); the old white label on it 12.30:1. The new night selected fill tarp ink on the night ground is 7.38:1, and the ground text on it 7.38:1. Old run-button edge tarp on night ground 1.50:1; new tarp ink 7.38:1.
- **Tests:** `src/theme/__tests__/contrast.test.ts` adds text pairs (selected chip label at bodyStrong and label roles, selected dashboard view label, run button label on tarp, cancel label on ground, failed or cancelled red line on ground) and a non-text group at 3:1 (selected fill on ground and raised ground, run button edge, progress fill), each in both themes, plus checks that the night selected fill is the ink step.
- **DESIGN.md:** the Tarp Blue, Primary, Choice chips and Driver chooser chips facts are amended for the night selected state.

## Fix 4: Bilingual Pair

- **Component:** `Bi` moved to `src/components/Bi.tsx` (DriverCards re-exports it). New: `size="small"` (both lines Small), `title` (Filipino in Title), `tone="alert"` (red), `nativeID`.
- **size small** (hints and state notes): `chooserHint`, `chooserLocked` (`DriverCards.tsx` chooser), `requestsEmptyHint`, `runsEmpty`, `simNote` (`src/app/driver/index.tsx`).
- **Pantry shares box:** `PANTRY_COPY.budget.line` as a Title + Small pair; the note as a Small pair (`src/app/pantry/index.tsx`).
- **Picker join title:** `SYNC.join.title` split by `splitBi` inside `Bi` as Title + Small (`src/app/index.tsx`).
- **Donor post:** every " / " pair now uses the pair layout (`src/app/donor/post.tsx`); the question is a Title pair, the example a Small pair; group labels are Body Strong pairs.
- **Missing English added:** "Ano ang natira?" (`S.postScreen.question`), its example hint (`S.postScreen.example`), the donor home empty state (`S.emptyTonight`: the empty line now renders its English half; the hint has English) (`src/app/donor/index.tsx`, `src/i18n/strings.ts`).
- **Full stops:** `src/i18n/driver.ts` lines 8, 10, 11 and 15 (the four hint strings that now read Small). Line 10 is the one the review named. `runsEmpty` is a state label, not a sentence, so it has no full stop added.
- **Separator:** the " / " pairs in `S.postForm` (hint, full, noItems, pickupNote, pickupClosed, becomes, pickFirst, problems) are " · " now. The Filipino text is unchanged.
- **Tests:** `src/i18n/__tests__/copy.test.ts` (the requests hint now ends in a full stop; new checks for the four hints, the donor copy and the join placeholder), `src/donor/__tests__/postForm.test.ts` (the three `becomes` strings with " · ").

### Filipino text changed or added (verbatim; all queued in `docs/copy-review/pending-codex.md`)

- `DRV.simNote`: `Gawa-gawa lang para sa simulasyon ang lahat ng tagahatid, lugar, at numero rito. · Every driver, place and number here is fictional or simulated.` (full stop added)
- `DRV.chooserHint`: `Pumili ng tagahatid na tatanggap ng mga request. Ikaw ang gaganap bilang napili mo. · Choose a driver who gets requests. You hold the one you choose.` (full stop added)
- `DRV.chooserLocked`: `Hindi na mapapalitan ang tagahatid ngayong gabi. I-pause at i-rewind sa 5:00 PM para mapalitan. · You cannot change the driver tonight. Pause and rewind to 5:00 PM to change it.` (full stop added)
- `DRV.requestsEmptyHint`: `Lalabas dito ang mga request habang umuusad ang oras sa simulasyon. · Requests appear here as the simulated clock moves.` (full stop added)
- `SYNC.join.placeholder`: `Hal. ABC123 · e.g. ABC123` (was `ABC123`; "Hal." is the Filipino abbreviation of "halimbawa", the new word)
- English-only additions, no Filipino changed (not queued): `S.postScreen.question` ("Ano ang natira? · What is left?"), `S.postScreen.example` (English after " · "), `S.emptyTonight.hint` (English after " · ").
- Separator only, Filipino unchanged: the nine `S.postForm` strings listed above.

## Fix 5: before a run

- **Closed screen:** every table (verdict and main comparison, supporting, learning, ceiling, four-policy) is one dashed 2dp zinc box with "Run the main evenings to fill this table." instead of its "Not measured yet" rows. The footer keeps its rows (the checksum reads "Not measured yet" until a run).
- **Model unchanged:** `NOT_MEASURED` semantics stay in `model.ts`. The closed-gate tests still assert that every number reads "Not measured yet" and that the verdict and post-hoc note are empty, so the gate tests still prove no number is shown.
- **Run button:** filled primary, tarp fill, tarp-ink edge, white label, 52dp, stretched across the content.
- **Internal references removed from the copy:** "(main_sample)" from the evenings line; "(guide p.19)" from the four gate lines. Code comments keep their references. `model.test.ts` asserts that no guide page or split name is in `RESULTS_COPY`.

## Fix 6: run states a11y

- **Announcer:** `src/results/announce.ts` (new, pure): `announcementOf` speaks the start, every tenth evening (10, 20, 30, 40) and the start of the intervals, and nothing else. `src/app/results.tsx` renders the visible progress line as plain text, with a visually empty polite live region for the announcements. Test: `src/results/__tests__/announce.test.ts` (over a whole 44-evening run, exactly six announcements).
- **Progress bar:** `accessibilityRole="progressbar"`, `accessibilityValue={{ min: 0, max: total, now: done }}`, with the progress line as its label.
- **Failed and cancelled lines:** Body role in `c.red`.
- **Supporting heading:** "Supporting comparisons (95%)"; "Supporting only, never a win on their own." is now the first sentence of its note.
- **Learning readings:** "Learning helps" and "Learning hurts", matching "Salo better" (`copy.ts`, `model.ts`).

## Fix 7: 200% layout

- **Results:** the band (back link, title, subtitle) is the first item inside the ScrollView.
- **Dashboard:** at `fontScale >= 1.5` (`LARGE_TEXT`), the replay note, the backend line, the evening code box, the ruler and the view tabs sit in a ScrollView above a tape that takes 55% of the window height (`TAPE_SHARE`). Below 1.5 the JSX is the same as before, only wrapped in fragments. The evening-code collapse into a chip was not done (the "and/or" option; the scroll alone is the change).
- **DESIGN.md:** the tape and the results-band facts are amended.

## Fix 8: picker

- **Placeholder:** "Hal. ABC123 · e.g. ABC123" in Small, as an overlay Text over the empty field (TextInput's own placeholder cannot change its type role). Hidden from TalkBack; shown only while the box is empty.
- **Colour deviation:** the placeholder is `c.textMuted`, not `c.zinc`. Zinc on the ground is 2.44:1 in light (fails 4.5:1 for Small text); it passes at night (5.43:1) but the colour follows the theme, so zinc cannot be used. Muted ink is 7.53:1 in light. Flagged for the orchestrator.
- **Doubled hairline:** the join block's bottom border is removed; the role list's top rule remains.
- **Keyboard:** `Keyboard.dismiss()` runs before a role row navigates.

## DESIGN.md (recorded facts changed)

- Tarp Blue: at night a selected chip or view is tarp ink with ground-night text.
- Primary: at night the fill is tarp-night with a 2dp tarp-ink edge; "Run the main evenings" is a primary.
- Choice chips and Driver chooser chips: the night selected state.
- Layout: the tape's height at 150% and above; the results band scrolls.

## Commands run

- `npx tsc --noEmit`: exit 0, no output (after two fixes found by the first run: a missing `ScrollView` import on the dashboard, and `StyleSheet.absoluteFillObject`, which does not exist in this RN version; the overlay now uses explicit absolute edges).
- `npx jest --maxWorkers=1 src/theme src/results src/i18n src/donor` (before the final lint fix): 20 suites, 338 tests, all passed.
- `npx expo lint`: first run 0 errors, 1 warning (an unused `RunProgress` type import in `results.tsx`), removed. Final run: exit 0, no warnings.
- `npx jest --maxWorkers=1` (full suite, final tree): exit 0. 73 suites passed, 11 skipped; 919 tests passed, 13 skipped. The 11 skipped suites are the env-gated runs (`REPORT`, `EVAL`, `EVAL_CLAUDE`, `EVAL_CLAUDE_EDGE`, `EVAL_HELDOUT`, `SYNC_IT`, `M6_CEILING`, `M6_MAIN`, `M6_PILOT`, `M6_TUNING`), so no report or record was regenerated.
- `npx tsc --noEmit` (final tree): exit 0.

## Not changed

- `docs/reports/m6-main.md` (the record).
- `.impeccable/design.json` (its colour metadata has no selection tokens; the new tokens are derived, not in the frontmatter).
- `server/eval/`, `src/parse/`, `docs/reports/parser-*`: other agents' work. `server/eval/record-tuning.js` and `src/parse/eval/claudeTuning.ts` were already modified in the working tree before this task. Not touched.
- No engine, results computation, parse, server or Supabase file changed.

## Open risks

- **Device unverified:** no emulator run. Unknown: whether TalkBack speaks the opacity-0, 1 by 1 announcer (the phase and every-tenth-evening lines); the progress bar's reading; the nested scroll at 200% on the dashboard (the tape's own ScrollView inside the outer one, with a fixed height); the 200% Results band; the night contrast by eye; the picker's Keyboard.dismiss timing.
- **Verdict format in the report:** `docs/reports/m6-main.md` line 9 uses the old format, and the regenerated report would differ from it.
- **Codex:** the Filipino changes above are in the queue and not yet reviewed.
