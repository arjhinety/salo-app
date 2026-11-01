# Handoff: mobile-data, learning-off run (RES-07, P2)

Date: 2026-11-01. Agent: mobile-data. Scope: the `learning` engine option, its tests, the runner wiring for the learning-off comparison, and the two docs. Supporting evidence only: the learning-off run is never a main result (guide p.15). The Results gate is closed and stays closed. No pilot (E11-E20) or main (E21-E30) evening was run, not even in a test. Tuning E01-E10 only. Nothing committed, nothing pushed.

## 1. What was built

- **Option:** `learning?: boolean` in `RunOptions` (`src/engine/simulate.ts`). Default true.
- **Learning off:** every driver's reliability estimate is fixed at `LEARNING_OFF_ESTIMATE` = `reliability(0, 0)` = 0.50 for the whole evening. The estimate is read in three places: driver offers in a round (`driverRound`), offers from held drivers (`offerHeld`), and the `estimate` field of `RELIABILITY_UPDATED`. The D-Q1 selection (`decide`) reads the offers' `rel`, so its tie-breaks see 0.50 too.
- **Outcomes unchanged:** show and no-show outcomes still come from `truth[driverId]` (the hidden true show rate) through the same `u01` and `intBelow` draws in the same order. Nothing in the RNG, the streams, the lateness draw or the withdrawal draw changed.
- **Counts still update:** `ds.shows` and `ds.runs` keep counting the real outcomes. Only the agents' estimate is fixed. `RELIABILITY_UPDATED` therefore carries the real `shows`/`runs` and `estimate: 0.5`. See decision D1 in section 6.
- **Byte-identical when absent or true:** `learning ?? true` takes the old branch, `reliability(ds.shows, ds.runs)`, which is the same expression as before. The existing fixtures pass unchanged.
- **Runner:** `runLearningComparison` in `src/results/runner.ts` runs the four policies on the main evenings with learning on and with learning off, then calls `learningComparison` per policy. It goes through the same gate as `runMainResults`. The gate code was moved into `openGate` without changes to its checks.

## 2. Engine diff, hunk by hunk (`src/engine/simulate.ts`, 6 hunks)

Command: `git diff -- src/engine/simulate.ts` (HEAD c98b31c). Only these lines changed.

1. `@@ -62,6 +62,12 @@` in `RunOptions`: adds the `learning?: boolean` field with its doc comment (+6). It sits after `humanDrivers`, in the same options object.
2. `@@ -77,6 +83,9 @@` after `RunOutput`: adds `export const LEARNING_OFF_ESTIMATE = reliability(0, 0);` with a doc comment (+3). `reliability` is the existing import from `./reliability`. Defining it as `reliability(0, 0)` ties the value to the Beta(1,1) prior rather than a typed-in 0.5. It evaluates to exactly 0.5.
3. `@@ -216,6 +225,9 @@` in `runEvening`, after `humans`: adds `const learning = opts.learning ?? true;` and `const estimateOf = (ds) => (learning ? reliability(ds.shows, ds.runs) : LEARNING_OFF_ESTIMATE);` (+3). This is the only place the option is read.
4. `@@ -365,7 +377,7 @@` in `updateReliability`: `estimate: reliability(ds.shows, ds.runs)` becomes `estimate: estimateOf(ds)`. `runs += 1` and `shows += 1` are unchanged.
5. `@@ -391,7 +403,7 @@` in `driverRound`: `const rel = reliability(ds.shows, ds.runs);` becomes `const rel = estimateOf(ds);`. The offer's `rel` feeds `decide`, and the PROPOSE message's `reliability` field.
6. `@@ -535,7 +547,7 @@` in `offerHeld`: the same substitution for a held driver's offer.

Not changed, deliberately: the RNG streams and draws, `truth`, the withdrawal and lateness draws, the share logic, the policies, `resultFromLog`, the `driverRuleStats` counters, and `src/engine/reliability.ts` (the formula is untouched).

Known wording effect (no code change): `driverRuleStats` still counts `decidedByReliability` and `etaTiesBrokenByReliability` the same way. With learning off all estimates are equal, so an ETA tie is broken by driver id, not by reliability, yet `etaTiesBrokenByReliability` still counts it. These stats are diagnostics for D-Q1 and do not feed results. Under learning off, read them as "ETA ties", not "ties broken by reliability".

## 3. Runner and results files

- `src/results/runner.ts`: imports `learningComparison` and `LearningComparison`. `runMainResults` keeps its signature and its checks; the gate is now `openGate` (same conditions, same error texts). `runPolicies(params, evenings, learning)` is the one loop over the four policies. The on-run now passes `learning: true`, which is the default, so its results are identical. `runLearningComparison(input)` runs `openGate` once, then `runPolicies` with `true` and `false`, and returns `Record<PolicyId, LearningComparison>`.
- `src/results/learning.ts`: the header comment only. It no longer says the option does not exist. No logic changed.
- `src/results/__tests__/runner.test.ts`: the import line gains `runLearningComparison`. Four tests are appended (section 4). The existing tests are unchanged.

## 4. Tests and commands

New file `src/engine/__tests__/learning-off.test.ts` (10 tests):

- **(a) Estimate exactly 0.5.** A hand-built world (one donor DN1, one pantry P1 needing 100 kg, one driver D1 with true show rate 0, lots L0001 posted 1000 and L0002 posted 1100, policy fcfs, untuned parameters, `trueShowRate: {D1: 0}`). Seed 1 was found by scanning seeds 1 to 3000 (the first seed where the driver commits twice and no-shows both times, never withdraws). Learning on: the estimates in log order are `[0.5, 1/3, 1/3, 0.25]`. The no-shows are at 1012 (L0001) and 1111 (L0002). `(0+1)/(2+2) = 0.25` is the estimate after the second no-show. Learning off: `[0.5, 0.5, 0.5, 0.5]`, the RELIABILITY_UPDATED counts are `(0,1)` and `(0,2)`, and the failures are the same minutes, lots and reasons as with learning on.
- **(b) Valid run.** For E01-E10 x four policies with learning off: two-phase commit, accounting `rescued + wasted = posted` within 1e-6, worst-served in [0, 1], and every estimate in the log equals 0.5. A companion check confirms learning on shows estimates other than 0.5, so the option is not a no-op.
- **(c) Byte-identical.** For E01-E10 x four policies: the digest with `learning` absent equals the digest with `learning: true`, and both equal the value in `head-digests.json`.

`src/results/__tests__/runner.test.ts` gains 4 tests: the gate-closed default and tuned cases throw with `runEvening` never called; a count mismatch throws with no run; a pilot evening is refused; and with an open synthetic gate, sixteen calls split 8 on and 8 off, salo's mean difference is 2.0 (`learning_helps`), and central greedy's is 0 (`no_clear_difference`).

Commands and results (all from `C:\Users\arro\Downloads\project\salo-app`):

- `npx jest src/engine src/results --maxWorkers=2`: 16 suites passed, 1 skipped (`report.test.ts`, skipped unless `REPORT=1`, as at HEAD). Tests: 183 passed, 1 skipped, 184 total.
- `npx tsc --noEmit`: exit 0, no output.
- `npx expo lint`: exit 0, no warnings printed.
- `npx jest --maxWorkers=2` (full): 55 suites passed, 4 skipped. Tests: 603 passed, 4 skipped, 607 total, no failing suite. The baseline in the brief was 583 passed and 4 skipped. My 14 new tests (10 + 4) are part of the difference. The remaining difference is not mine, and I did not trace it.
- The four skipped suites are pre-existing skips: `src/backend/__tests__/sessionIT.test.ts`, `src/engine/__tests__/report.test.ts`, `src/parse/__tests__/eval-claude-tuning.test.ts`, `src/parse/__tests__/eval-parser-tuning.test.ts`.
- Not run: any emulator, Metro, Gradle, or build. No pilot or main evening.

## 5. Tuning means: food rescued, learning on vs off (E01-E10, supporting evidence only)

Method: a temporary test file called `runEvening` directly on E01-E10 (the 10 tuning evenings) with `UNTUNED_PARAMS` (the untuned starting values, not frozen), once with learning absent and once with `learning: false`, for each policy. The file was deleted after the run. Output: `C:\Users\arro\AppData\Local\Temp\claude\C--Users-arro-Downloads-project\18b3e653-8dfc-4340-bc77-528be4ba6250\scratchpad\tuning-means.json`.

Food rescued, kg per evening, mean over the 10 tuning evenings. "On minus off" is the mean of the per-evening differences. "Stranded" is the total of stranded awards over the 10 evenings.

| Policy | Learning on (kg/evening) | Learning off (kg/evening) | On minus off (kg/evening) | Stranded on / off |
|---|---|---|---|---|
| Agents (Salo) | 148.961 | 149.014 | -0.053 | 10 / 10 |
| First come first served | 133.338 | 130.299 | +3.039 | 8 / 11 |
| Nearest pantry | 143.384 | 142.659 | +0.725 | 5 / 7 |
| Central greedy | 151.701 | 150.162 | +1.539 | 6 / 9 |

Reading: in-sample, untuned, 10 evenings, no interval computed and no verdict drawn. The sign differs by policy: Salo's difference is within 0.1 kg of zero, while the other three are positive. These are not results: they come from tuning evenings, with untuned parameters, and they are not on the screen. Any reading belongs with the pilot and main runs, and the gate stays closed.

## 6. Decisions for the reviewer

- **D1, counts vs estimate.** With learning off, `shows` and `runs` still count the real outcomes. Only the estimate is fixed at 0.50. The reading is that the event log records what happened, and the estimate is what the agents believe. The alternative is to freeze the counts too. Tell me if you want that.
- **D2, the value.** `LEARNING_OFF_ESTIMATE = reliability(0, 0)` makes 0.5 the Beta prior rather than a magic number. The test asserts the literal 0.5.
- **D3, the runner's on-run.** It now passes `learning: true`. This is the default, and the fixtures confirm it does not change the results.
- **D4, scope of the option.** The engine accepts `learning` on any evening, as it does `humanDrivers`. The runner is what limits learning-off runs to main evenings, behind the gate.
- **D5, the stats wording.** See section 2. No code change.

## 7. Files touched

Changed:
- `src/engine/simulate.ts`: 6 hunks, section 2.
- `src/results/runner.ts`: `openGate`, `runPolicies`, `runLearningComparison`, the gate body moved unchanged.
- `src/results/learning.ts`: header comment only.
- `src/results/__tests__/runner.test.ts`: import line and 4 tests added.
- `docs/decisions.md`: the "Learning-off run (RES-07, P2): not built yet" bullet replaced with what was built.

New:
- `src/engine/__tests__/learning-off.test.ts`.
- `docs/handoffs/2026-11-01-mobile-data-learning-off.md` (this file).

Not touched: `src/engine/__tests__/fixtures/*` (not regenerated), `src/results/registration.ts` (gate closed, `pilotDone: false`), `src/engine/reliability.ts`, `docs/stories.md`, and every other agent's file. The working tree also holds other agents' changes (`src/backend/*`, `src/components/SessionBanner.tsx`, `src/i18n/sync.ts`, an untracked `joinLimit.test.ts` and `notification-icon.png`). Another agent also added an "M6 tuning and pilot" section at the end of `docs/decisions.md`. Both are outside this task and left as they are.

## 8. Open risks

- The tuning means use the untuned parameters. They will change once tuning freezes the parameters.
- `runLearningComparison` has been tested only with mocked `runEvening`. It has not run on any real evening, and it must not run until the gate opens.
- The stats wording in section 2 can mislead a reader of learning-off `driverRuleStats`.
- The hand-built world in test (a) uses seed 1, chosen by a scan to produce the two-no-show pattern. It is a fixture for the test, not a sample of the population.
