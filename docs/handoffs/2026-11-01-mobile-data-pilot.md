# Handoff: mobile-data, M6 step 2 (pilot on E11-E20, main-evening count)

Date: 2026-11-01. Agent: mobile-data. Scope: the pilot on E11-E20 with the frozen settings, the main-evening count, and the registration record. No main evening (E21-E30) was run, computed or counted. Nothing committed, nothing pushed. No paid calls. No emulator, Metro or Gradle.

Label for every table in this work: pilot evenings, used only to set the main-evening count, not a result.

**Escalation (required line):** count exceeds the 10 main evenings in dataset v1.2 → more main evenings must be generated (Arjhine's decision). Nothing was generated here.

## 1. Result

| Measure | Gap | Mean of d (Salo minus central greedy) | Sample SD s | s_U = 1.2934 × s | n = ceil((2 × 2.2414 × s_U / gap)²) |
|---|---|---|---|---|---|
| Food rescued | 6 kg | −2.82 kg | 6.1778 kg | 7.9903 kg | **36** |
| Worst-served need met | 0.10 | −0.019 | 0.1136 | 0.1470 | **44** |

**Main-evening count = max(36, 44, 10) = 44.** Recorded in `src/results/registration.ts`: `pilotDone: true`, `mainEveningCount: 44`, checksum unchanged.

Food-ceiling frequency (pilot, 10 evenings each): Salo 0, central greedy 0, first come first served 0, nearest pantry 0.

The count is above the 10 main evenings in dataset v1.2, so the main run cannot start until more main evenings are generated (Arjhine's decision). The runner refuses it: "The recorded count is 44 but 10 evenings were given."

## 2. What was built

- `src/tuning/pilotCount.ts`: pure count module. Constants (Z 2.2414, χ² lower 20% for 9 df 5.380053, factor √(9/5.380053) = 1.293385), `assertPilotEvenings` (exactly E11..E20, split `pilot`), `sampleSd`, `upperSd`, `requiredEvenings`, `measureCount`, `pilotCount` (max of n_food, n_fair, 10).
- `src/tuning/pilotRender.ts`: markdown for the pilot report. Title line is the required label. No bootstrap, no interval, no verdict.
- `src/tuning/__tests__/m6-pilot-run.test.ts`: gated runner (`M6_PILOT=1`). Filters `split === 'pilot'`, asserts E11..E20, uses `FROZEN_PARAMS` only, learning on (engine default), four policies. Writes `docs/reports/m6-pilot.md`. If the count is recorded, it asserts the re-run reproduces it.
- `src/tuning/run.ts`: refactor only. The per-evening measure moved to `measureEvening` (no split check), and `detailOf` now calls it after the tuning guard. `EveningDetail` gained `foodWastedKg`. Tuning behaviour is unchanged (tuning test and report not re-run).
- `src/tuning/__tests__/pilotCount.test.ts`: literal tests. Hand-worked values are checked against an independent Node calculation (see section 5).
- `src/tuning/__tests__/reliability-carry-over.test.ts`: the guide p.15 check, on tuning evenings E01/E02 only.
- `src/results/registration.ts`: `REGISTRATION` = `pilotDone: true`, `mainEveningCount: 44`. Adds `MAIN_EVENINGS_IN_DATASET = 10`.
- `src/results/model.ts`, `src/results/copy.ts`: the screen state (section 4).
- `src/results/__tests__/registration.test.ts`, `model.test.ts`, `runner.test.ts`, `learning.test.ts`: updated to the recorded state. Gate logic is still proven with synthetic closed records.
- `docs/reports/m6-pilot.md`: the pilot report.
- `docs/decisions.md`: one bullet appended at the end of the M6 section (CRLF kept). The "Smallest fairness gap" bullet was not touched.

## 3. Guide rule: no learning carried between evenings

Checked, and the engine already does this. `runEvening` (src/engine/simulate.ts) builds each driver's state from `world.drivers` at the start of every evening, with `shows: d.tuningShows, runs: d.tuningRuns` (the dataset's frozen tuning counts). All state is local to the call. The new test checks two things: (a) E02's log and result are identical whether or not E01 ran first, under all four policies; (b) the first driver estimate in an evening equals `(tuningShows + 1) / (tuningRuns + 2)`. No engine file was changed.

## 4. Results screen state

- The gate's own checks pass with the real record and the frozen parameters (`gateOpen` = true).
- `currentModel()` still never runs an evening, and `src/app/results.tsx` is untouched. The screen shows no main result.
- Because the recorded count (44) is not the dataset's 10 main evenings, the screen reads the new line: "The recorded main-evening count does not match the main evenings in the dataset, so no main result is shown (guide p.19)." The screen model's `reasons` list names the count.
- If the count were 10, the screen would read "The pilot has run and the main-evening count is recorded. The main evenings have not been run, so no main result is shown" (tested with a synthetic record).
- Footer: resamples 10,000 and seed 20260927 as values. The checksum row still reads "Not measured yet" (unchanged).

## 5. Commands and results

- `M6_PILOT=1 npx jest src/tuning/__tests__/m6-pilot-run.test.ts --runInBand`: first run (count not yet recorded) wrote the report, n_food 36, n_fair 44, count 44. Second run after recording: passed, reproduces 44.
- Independent check of the report's numbers: recomputed the SDs, s_U and n from the printed per-evening differences in Node. Gives 6.1778 / 7.9903 / 36 and 0.1136 / 0.1470 / 44. Matches.
- Worked literals: 1..10 gives s = 3.02765, s_U = 3.91592, n_food = 9 (raw 8.5598). Fairness branch 0.05 × (1..10) gives 78. Food branch 10 × (1..10) gives 856. Floor: with fairness n = 4, count = 10.
- Chi-square check: the 20% lower quantile for 9 df computed numerically = 5.380053. √(9/5.380053) = 1.2933855.
- Jest, targeted: `npx jest src/tuning src/results --maxWorkers=2`: all pass except `learning.test.ts`, which was then fixed (explicit closed record). Re-run: 9 passed.
- Final, after all edits:
  - `npx tsc --noEmit`: exit 0.
  - `npx expo lint`: exit 0.
  - `npx jest --maxWorkers=2`: 64 suites passed, 7 skipped (gated runners and pre-existing skips). 740 tests passed, 7 skipped, 0 failed.

## 6. Files touched

Created: `src/tuning/pilotCount.ts`, `src/tuning/pilotRender.ts`, `src/tuning/__tests__/m6-pilot-run.test.ts`, `src/tuning/__tests__/pilotCount.test.ts`, `src/tuning/__tests__/reliability-carry-over.test.ts`, `docs/reports/m6-pilot.md`, this handoff.
Edited: `src/tuning/run.ts`, `src/results/registration.ts`, `src/results/model.ts`, `src/results/copy.ts`, `src/results/__tests__/registration.test.ts`, `src/results/__tests__/model.test.ts`, `src/results/__tests__/runner.test.ts`, `src/results/__tests__/learning.test.ts`, `docs/decisions.md`.

Not touched: `src/engine/*` (SHA-256 snapshot taken before the work and compared afterwards: no change), `src/engine/frozenParams.ts`, `docs/reports/m6-tuning.md`, `src/app/`, `src/components/`, `src/parse/`, `server/eval/`, `src/theme/`, `DESIGN.md`.

Note: `docs/reports/claude-tuning-edge/pass-1.jsonl` differs from the snapshot. It is another agent's file, and I did not touch it.

## 7. Open risks and items for Arjhine

1. **Count 44 versus 10 main evenings.** Generate more main evenings (new pinned dataset version, same generator, new seeds) until the count is met. This is Arjhine's decision. The main run cannot start until then.
2. **Example in the brief.** The brief's example gives s_U = 3.91593. The computed value is 3.915919, which rounds to 3.91592. Its n_food is 9, not 10. The tests use the computed values.
3. **Pilot numbers are in memory.** The dataset module holds all 30 evenings. The pilot code filters by split and asserts E11..E20 before anything runs. The screen's default main-evening list (existing runner code) and the registration test count main rows by split only. No main evening was run or computed.
4. **Screen copy.** The copy for the count mismatch is new text. It needs the copy reviewer's eye. It names no evening ids.
5. The pilot ran with the frozen settings only. Learning on. Driver reliability starts from the tuning counts on each evening.
