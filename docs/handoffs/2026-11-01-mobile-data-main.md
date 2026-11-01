# Handoff: M6 main run (E21–E64), mobile-data, 2026-11-01

## Summary

- The main run is done on the 44 main_sample evenings E21–E64 (dataset v1.3), with the frozen settings (`sha256:5d0ef9b5…`), learning on, 10,000 resamples, seed 20260927. Approved by Arjhine ("I approve all"). Gate and count were recorded before the run (`registration.ts`: pilotDone true, mainEveningCount 44, checksum).
- **Verdict (pre-registered rule): No clear difference.**
  - Food rescued, Salo minus central greedy: mean −0.44 kg per evening, 97.5% interval [−2.78, +1.79] kg.
  - Worst-served need met, Salo minus central greedy: mean +0.014, 97.5% interval [−0.026, +0.053]. Both contain zero.
- **Width check:** food interval full width 4.57 kg, below the 6 kg gap (YES). Fairness interval full width 0.079, below the 0.10 gap (YES).
- The Results screen now shows the stored record, with the verdict line and both intervals. No evening is computed at app start. Not run on a device or emulator (none run, per the rules).
- No engine or parameter change. Nothing re-tuned. No commit. No paid call.

## Files touched

New:
- `src/tuning/__tests__/m6-main-run.test.ts`: gated runner (`M6_MAIN=1`). Calls the existing `runMainResults` and `runLearningComparison` on `FROZEN_PARAMS`. Asserts E21–E64, all main_sample, exactly 44. Writes the two files below.
- `src/tuning/mainRender.ts`: pure renderers for the generated module and the report. Includes `supplyRatios`.
- `src/results/mainResults.generated.ts`: the committed record (generated, do not hand-edit). Holds dataset version and checksums, frozen-params checksum, count, resamples, seed, per-evening measures per policy, the 12 comparisons with intervals, verdict, learning-off comparisons (with the off values) and ceiling counts.
- `src/results/persisted.ts`: `PersistedMainResults` type and `persistedMismatch` (stale check).
- `src/results/width.ts`: width check (`widthCheck`, gaps 6 kg and 0.10, strict).
- `src/results/__tests__/persisted.test.ts`: recomputes every stored number from the stored per-evening runs (`summarize`, `learningComparison`, `ceilingCounts`); checks the record against the registration, frozen params, and the bundled CSVs against `SHA256SUMS`; checks the food-wasted 95% mirror.
- `src/results/__tests__/width.test.ts`: hand-worked boundary cases.
- `docs/reports/m6-main.md`: the report.

Modified:
- `src/results/runner.ts`: `MainResults` gains `perEvening` (the finished runs). No change to measures or intervals.
- `src/results/learning.ts`: `LearningComparison` gains `offFoodKg` (learning-off values per evening).
- `src/results/model.ts`: `currentModel(stored, reg, params)` shows the stored record only when the gate is open and `persistedMismatch` is empty; otherwise closed (with `gateStale` line when the record is stale). Verdict row is the verdict label plus the two intervals (RES-04). Learning rows per policy. Ceiling rows as "N of 44 evenings". Footer adds the dataset version.
- `src/results/copy.ts`: new strings (below).
- `src/app/results.tsx`: header comment only.
- `src/results/__tests__/model.test.ts`: the "closed today" block replaced by stored-result and stale-record tests.
- `docs/decisions.md`: one bullet at the end of the M6 section.

Not touched: `src/engine/**`, `src/data/**`, `data/**`, `src/parse/**`, `server/eval/**`, `frozenParams.ts`, `registration.ts`, `src/tuning/*` except the new files above. Verified with `git status` / `git diff --stat`. `docs/reports/claude-tuning-edge/` is another agent's untracked output; left alone.

## New user-visible strings (English; `copy.ts` has no Filipino strings, so no Codex review)

Verbatim:
- `gateStale`: "The stored main results do not match the current registration, parameters or dataset, so no main result is shown (guide p.19)."
- `learningRow`: "Food rescued, learning on minus off (95%)"
- `ceilingOf(n, total)`: "`${n} of ${total} evenings`" (e.g. "0 of 44 evenings")
- `dataset`: "Dataset"

Existing English strings reused in the verdict line come from `src/results/verdict.ts` (unchanged).

## Commands and results

1. `M6_MAIN=1 npx jest src/tuning/__tests__/m6-main-run.test.ts --maxWorkers=1`: PASS, exit 0, 19.6 s (first run); second run 20.8 s. Output: `main: verdict no_clear_difference; food [-2.783, 1.789] kg; need met [-0.0265, 0.0526]`.
2. Re-run of the same gated test: the regenerated `mainResults.generated.ts` is byte-identical to run 1 (`cmp`). Deterministic.
3. `npx tsc --noEmit`: exit 0.
4. `npx expo lint`: exit 0, no warnings (three of mine fixed: unused import, duplicate imports).
5. `npx jest --maxWorkers=2`: 66 suites passed, 8 skipped (the gated M6 runs), 775 tests passed, exit 0.

## Findings (not changed; reported)

1. **Story conflict, needs Arjhine's decision.** RES-01 says "Numbers are computed on the device … The build contains no stored results table." The instruction for this step (and the gate design) stores the computed numbers in a committed generated file. The screen shows the stored record, and every number still comes from the engine run, verified by recomputation in tests. Either RES-01 is amended to allow this record, or the record is removed and the screen is closed until an on-device run exists.
2. **Food ceiling is structural.** Posted food is below total need on all 44 main evenings (supply ratio 0.60–0.88). The assumed ceiling (every pantry's need fully met) therefore cannot be reached, and the 0 of 44 counts for all four policies say nothing about the policies. Open question: the guide's "how often the food runs out" may mean something else (for example, all posted food rescued). Not changed; no evening hits "all posted food rescued" either (minimum wasted: Salo 4.52 kg, central greedy 1.30 kg).
3. **Identical need-met rows for FCFS and nearest.** Worst-served need met is 0 on all 44 evenings for both, so their comparisons with Salo are identical (+0.090 [+0.058, +0.124]). Consistent with the pilot (zero on all 10 pilot evenings for both), not a bug.
4. **Stale story text.** RES-03 and RES-06 still say the main evenings are E21–E30. The dataset (v1.3) and the copy say E21–E64. Not edited.
5. **Dataset checksum.** The recorded `sha256:e183b81d…` is the dataset repo's 17-file manifest (verified in the sibling repo). The app bundles 10 tables, whose manifest hashes to `sha256:a5aab7…`. The tests check the bundled files against the bundled manifest; `e183b81d` is recorded but can only be checked in the dataset repo.
6. **Fairness gap limitation** is printed next to the fairness result in the report, as decided. The tuned fairness floor was not reached (0.151 / 0.166), also stated.

## Open risks

- The stored record must be regenerated (gated run) whenever the frozen parameters, count, seed, or dataset change; the screen then closes automatically (stale check). Tested.
- The on-device rendering of the longer verdict line and the new rows has not been seen (no emulator, per the rules).
- Verdict is a pre-registered rule on two intervals; it does not say how big the gap is.
