# Handoff: mobile-feature, Results screen (RES-01 to RES-07)

Date: 2026-10-26. Agent: mobile-feature. Scope: stories RES-01 to RES-07 (docs/stories.md), gated so that no main number is shown.

## 1. The gate

Record: `src/results/registration.ts`, `REGISTRATION` = `{ mainEveningCount: null, pilotDone: false, frozenParamsChecksum: null, resamples: 10000, seed: 20260927 }`. The seed is the one documented in docs/decisions.md (`bootstrapIndices(10, 10000, 20260927)`).

What is refused and when:
- `runMainResults` (src/results/runner.ts) throws `ResultsGateError` before any evening runs unless all of these hold:
  - `pilotDone` is true;
  - `mainEveningCount` is set and equals the number of evenings given;
  - `frozenParamsChecksum` is set and equals `checksumParams(params)`;
  - the params are not `UNTUNED_PARAMS` and `frozenOn !== 'UNTUNED'`;
  - every evening given has `split === 'main_sample'`.
- `ceilingCounts` and `learningComparison` (src/results/learning.ts, RES-07) throw while the record is incomplete (`requireRecordOpen`).
- The screen reads `currentModel()`, which is closed today. Its reasons: the pilot has not run; the main-evening count is not recorded; the checksum is not recorded; no frozen parameters are in the build.

Tests that prove it: `src/results/__tests__/runner.test.ts` mocks `runEvening` and asserts it is never called while the gate is closed (default record with `UNTUNED_PARAMS`, tuned-looking params, untuned params with a complete record, count mismatch, a pilot-split evening). The default evening list is asserted to be exactly E21 to E30.

## 2. What opens it (in this order)

1. The pilot on E11 to E20 runs and its checks are done (guide p.19). This is Arjhine's step. No agent runs it.
2. Arjhine writes the main-evening count and sets `pilotDone: true` in `registration.ts`, in a commit, before any main run. The runner refuses if the count differs from the evenings given. If the pilot asks for more than 10 main evenings, the dataset is regenerated first (decisions.md).
3. Tuning freezes the parameters into a frozen-params source. No such module exists yet, so the screen passes `null` and stays closed. Then `frozenParamsChecksum` is set to `checksumParams(frozen)`.
4. Wiring the open screen: `openModel(summarize-or-runMainResults output, REGISTRATION, checksum)` is built and tested with synthetic runs, but the screen does not call it yet, because step 3 has no source. This is the one follow-up before the open state can show numbers.

## 3. Formulas and the test literal for each

Measures (per evening; `src/results/measures.ts` re-exports the engine's `src/engine/metrics.ts`, no duplicate logic):

| Formula | Engine / result code | Test literal (src/results/__tests__/measures.test.ts) |
|---|---|---|
| Food rescued = sum over pantries with need > 0 of min(on-time kg, need) | `eveningMeasures` | need 10, received 12 gives 10 kg |
| Need met per pantry = min(1, on-time kg / need), need > 0 only | `needMetRatios` | needs 10, 20, 5; received 6, 18, 5 give 0.6, 0.9, 1.0 |
| Worst-served need met = min of the per-pantry ratios | `eveningMeasures` (`worstNeedMet`) | 0.6 |
| Median of the ratios (fixture only, not on screen) | `median` | 0.9 |
| Zero-need pantry: left out of the ratios, adds 0 kg | `eveningMeasures` | need 0 with 7 kg received gives ratios [1] and rescued 10 |
| Evening with no pantry needing anything: worst is null, rescued 0 | `eveningMeasures` | rescued 0, wasted 5, worst null |
| Food wasted = posted kg minus food rescued (D-Q3) | `eveningMeasures` | 40 posted, 29 rescued gives 11; log example 25 posted, 10 rescued gives 15 |
| Stranded awards = lots with a TENTATIVE_ACCEPT and no DELIVERY (late delivery counts as delivered) | `resultFromLog` | log of 3 awards, 2 deliveries gives 1 stranded; one award, no delivery gives 1 |
| Evening capping: cap each evening at 1, then average the evenings with a value | `cappedMean` | [1.4, 0.0] gives 0.5, not 0.7; [1.4, null, 0.0] gives 0.5; [null] gives null |
| Cell on screen: mean per evening of each measure (need met uses the capped mean) | `summarize` (runner.ts) | synthetic: 10, 12 rescued gives 11.0 kg; need met 0.8 gives 80% |

Intervals (`src/results/intervals.ts`):

| Formula | Test literal (intervals.test.ts) |
|---|---|
| Paired difference = Salo minus baseline, per evening; an evening with a missing value is dropped | diffs [2, -1] from runs 50 vs 48 and 40 vs 41 |
| Paired percentile bootstrap: mean of resample means; bounds at (1 - level)/2 and 1 - (1 - level)/2, linear interpolation (`pairedInterval`) | Fixed diffs `[2.0, -1.5, 4.25, 0.5, 3.0, -2.5, 1.0, 5.5, -0.75, 2.25]`, eight hand-written resample rows. Mean 1.375. 97.5% bounds [1.1240625, 2.9234375]. 95% bounds [1.148125, 2.846875]. Computed with numpy 2.3.5 (`percentile`, method linear), outside the app, and the 95% lower bound checked by hand (1.1 + 0.175 x 0.275 = 1.148125). |
| Seeded resamples: `bootstrapIndices(n, 10000, 20260927)`; same seed gives the same rows, different seed differs | 10,000 rows of length n, all in range |
| Shared resamples per n: food wasted intervals are the exact negatives of food rescued intervals | `wasted.low = -rescued.high`, `wasted.high = -rescued.low` (to 9 decimals) |
| Reading: whole interval above zero in the measure's direction = "Salo better"; whole interval below = "Baseline better"; anything touching or containing zero = "No clear difference" (wasted and stranded are lower-is-better) | food rescued [1, 2] gives Salo better; wasted [-2, -1] gives Salo better; [0, 0.2] gives no clear difference |
| The 12 comparisons: 2 main (food rescued and need met, each vs central greedy, 97.5%) and 10 supporting (95%) | 12 rows, 2 main, 10 supporting, no duplicates |

Verdict (`src/results/verdict.ts`, uses `verdict` from metrics.ts):

| Case | Literal | Result |
|---|---|---|
| (a) | food [+2, +8], worst-served [-0.01, +0.20] | Salo better |
| (b) | food [-5, -1], worst-served [+0.10, +0.20] | Trade-off |
| (c) | food [-1, +3], worst-served [-0.05, +0.05] | No clear difference |
| Extra | food [-4, -0.5], worst-served [-0.02, +0.03] | Central greedy better (assumption: the guide does not name it) |
| Edge | food [0, 2] | No clear difference (touching zero is not clearly favouring) |

Supporting checks (RES-07, `src/results/learning.ts`, labelled supporting, functions only):

| Formula | Test literal (learning.test.ts) |
|---|---|
| Food ceiling reached (ASSUMPTION, guide p.13 does not define it): food rescued >= total need, total need > 0 | needs 10 + 20: 30 kg is reached, 29.5 kg is not; zero need is never reached |
| Ceiling count per policy | three evenings: salo 2, fcfs 0, nearest 1, central greedy 3 |
| Learning on minus learning off = food rescued difference per evening, paired 95%; "learning helps" when the interval is above zero | on 5..14, off 4 each: mean 5.5, learning helps |

Gate checksum (`checksumParams`): FNV-1a 32-bit over the JSON of the params with keys sorted, written `fnv1a32:xxxxxxxx`. Test: same params in any key order give the same checksum; one changed weight changes it.

## 4. Engine check (RES-02 against the engine)

`resultFromLog` and `eveningMeasures` in `src/engine/metrics.ts` match every RES-02 fixture. No disagreement found, so the engine was not changed. One point of definition: stranded counts any awarded lot with no DELIVERY at all, and a late delivery is a delivery (its kg is simply not rescued). That matches "no driver delivered" in RES-02.

## 5. Screen

- `src/app/results.tsx` (route `/results`). English. A tarp band with a back link, the gate line on a paper panel, the four policy blocks (Agents (Salo), First come first served, Nearest pantry, Central greedy) with four measures each, the two main results, the verdict, the ten supporting rows with a note that food wasted mirrors food rescued, learning off, ceiling counts, and the footer (10,000 resamples, seed 20260927, checksum). Every cell reads "Not measured yet".
- The only evening ids on the screen are "E21 to E30" (test in `model.test.ts` and in `results.tsx` source).
- The screen never imports the runner or the engine (source test).
- Dashboard: `src/app/dashboard/index.tsx` gets one link, "Results", as a Pressable in the tarp controls row, navigating to `/results`. That is the only change to the dashboard.

## 6. Files

New:
- `src/results/registration.ts`, `measures.ts`, `intervals.ts`, `verdict.ts`, `runner.ts`, `learning.ts`, `model.ts`, `copy.ts`
- `src/results/__tests__/registration.test.ts`, `measures.test.ts`, `intervals.test.ts`, `verdict.test.ts`, `learning.test.ts`, `runner.test.ts`, `model.test.ts`
- `src/app/results.tsx`
- `docs/handoffs/2026-10-26-mobile-feature-results.md` (this file)

Modified:
- `src/app/dashboard/index.tsx` (one import line, one Pressable, one style)

Not touched: `src/engine/`, `src/data/`, `supabase/`, `server/`, `src/i18n/strings.ts`, `src/i18n/pantry.ts`, `src/i18n/driver.ts`, `src/app/index.tsx`, `src/backend/`. Other agents' modified files in `git status` (supabase migration and tests, backend, driver, i18n) are theirs.

## 7. Commands run and results

- `npx jest src/results`: 7 suites, 76 tests, all passed.
- `npx jest` (full): 38 suites passed, 3 skipped; 494 tests passed, 3 skipped; 0 failing.
- `npx tsc --noEmit`: exit 0, no output.
- `npx expo lint`: exit 0. My first run had 10 warnings in my files (unused import, duplicate imports, jest.mock order); all fixed, final run clean.
- Not run, by the memory rule: emulator, Metro, Gradle, `expo start`, any build. The screen has not been rendered or looked at on a device.
- No evening was run. `runEvening` is mocked in the runner test and never called with a real evening.
- Python 3.12 with numpy 2.3.5 was used once, outside the repo, to compute the reference interval bounds. Nothing was committed.

## 8. Deviations and decisions for the orchestrator

1. Gate line. The brief quotes the gate line with "pilot on E11-E20". RES-06 and the "no pilot id anywhere on the screen" test rule forbid that. The screen says "after the pilot has run and the number of main evenings is recorded (guide p.19)." Revert the wording if the brief's line is preferred, and drop the pilot-id test for that line.
2. Resample count and seed are shown as their pre-registered values (10,000 and 20260927), not "Not measured yet". Only the checksum and all results read "Not measured yet". The stories ask for the count and seed on screen. The brief said all three read "Not measured yet". Flag for a decision.
3. The learning-off run is not produced. The engine has no option to fix each driver's estimate at 0.50: `simulate.ts` computes `reliability(ds.shows, ds.runs)` from driver counts that learn during the evening. A run needs an engine option, and `src/engine/` is read-only for me. RES-07 has the comparison and ceiling functions only.
4. Food ceiling is an assumption: total need fully met. Guide p.13 asks for the frequency and does not define the ceiling.
5. Bestgen citation page. decisions.md says guide p.20; stories RES-03 says p.21. The screen cites "Bestgen, 2022" with no page. Pick one.
6. RES-05 (replay under another policy) already exists on the dashboard (`replayUnder` in dashboard/index.tsx). Not re-implemented here.
7. Results copy lives in `src/results/copy.ts`, because `src/i18n/strings.ts` is off limits to me.
8. Typed routes: the file `.expo/types/router.d.ts` is generated and does not list `/results` yet. The link uses `RESULTS_ROUTE as Href`, the same cast the repo already uses for other routes. It is regenerated the next time Expo starts.
9. The open-state screen is not wired. See section 2, step 4.

## 9. Open risks

- The gate is a record in code. `pilotDone` is a boolean a person sets, and nothing checks that the pilot ran. The check is git history on `registration.ts`.
- The checksum is FNV-1a 32-bit. It is an integrity tag for "the params that were recorded", not a cryptographic hash, and collisions are possible.
- The screen has not been rendered on a device or emulator (memory rule), so its layout and legibility are unchecked. Only the model and the source are tested.
- Interval math is checked against numpy on fixed rows. The seeded index generator is tested for determinism and range only, not against an outside RNG.
- Food wasted intervals mirror food rescued intervals exactly (shared resamples, D-Q3). The screen says so; they are not independent support.
- The verdict label "Central greedy better" is an assumption (stories RES-04).
- Stories open question 8 (does a tentative lot never committed count as stranded?) is still listed as open in stories.md. The code counts it as stranded, matching RES-02 line 182.
