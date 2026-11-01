# Handoff: held-out parser scoring, pilot and main (mobile-testing, 2026-11-01)

## What was done

The Edge Function `parse` (Claude path) and the rule-based fallback were scored once on the held-out pilot (E11 to E20, 170 messages) and main (E21 to E64, 748 messages) splits of dataset v1.3. Scores are on the raw `ParseResponse`. The prompt, schema, rules, vocabulary and the Edge Function were not changed, and no pilot or main message was used to improve anything. Everything is template-generated, so every number is an optimistic upper bound.

Results are in `docs/reports/parser-heldout.md`.

## Results (summary)

- Claude Edge, mean (min to max over 3 completed passes):
  - pilot: food 97.8%, quantity 99.4%, unit 99.4%, pickup_by 98.8%, all four 95.5% (95.3% to 95.9%)
  - main: food 94.7%, quantity 97.0%, unit 97.3%, pickup_by 98.7%, all four 91.1% (90.8% to 91.4%)
- Fallback (one deterministic run):
  - pilot: food 96.5%, quantity 95.9%, unit 96.5%, pickup_by 99.4%, all four 95.3%
  - main: food 97.2%, quantity 96.5%, unit 97.3%, pickup_by 99.5%, all four 95.7%
- Spend (logged usage): pilot $0.102897, main $0.455026, held-out total $0.557923. Total across all report folders $0.7916.

## Files touched

Recorder and loader (server/):
- `server/eval/record-tuning.js`: `--split pilot|main` (edge only), `--cost-cap`, per-folder caps (pilot $0.40, main $1.50; tuning default unchanged at $0.60). The cost guard re-reads the folder before every send and reserves the worst case of 3 calls, so concurrent passes cannot overspend. It skips an unfinished last line another pass is still writing. Its output folders are `docs/reports/claude-pilot-edge/` and `docs/reports/claude-main-edge/`.
- `server/eval/heldout.js` (new): split loader. It asserts the evening-to-split mapping and the counts (170 and 748), and refuses a mismatched split. The dataset folder comes from `SALO_EVENING_DATASET_DIR`, defaulting to the sibling folder `salo-evening-dataset-repo/salo-evening-dataset` (no user path in code). It lives in `eval/` rather than `src/` because `test/prompt.test.js` forbids `server/src` from naming the dataset files.
- `server/test/heldout-split.test.js` (new, 19 tests, fake datasets and fake responses).
- `server/src/`: not touched.

Scorer (src/parse/):
- `src/parse/eval/claudeTuning.ts`: universe size and report labels generalised. Golden check, laptop and edge tuning reports unchanged.
- `src/parse/eval/heldout.ts` (new), `src/parse/__tests__/heldoutCorpus.ts` (new, dataset helper, default path repo-relative).
- `src/parse/__tests__/eval-claude-heldout-edge.test.ts`, `eval-parser-heldout.test.ts` (both gated by `EVAL_HELDOUT=1`), `claude-heldout-scorer.test.ts`, `heldout-loader.test.ts` (always on, fake data).

Reports (docs/reports/): `parser-claude-pilot-edge.md`, `parser-claude-main-edge.md`, `parser-fallback-pilot.md`, `parser-fallback-main.md`, `parser-heldout.md`, and the raw pass folders `claude-pilot-edge/` and `claude-main-edge/` (`pass-1..3.jsonl` each).

Other: `docs/decisions.md` (bullet appended at the end of the M6 section); this handoff. Nothing in `src/results/`, `src/app/results.tsx`, `docs/reports/m6-main.md`, `docs/stories.md` or `supabase/` was touched. Nothing committed.

## Run record

- Pilot: three concurrent passes, all `completed`, 170 of 170 each. 555 attempts, 45 HTTP 429 (all retried), 0 unanswered, 0 outages.
- Main: three concurrent passes, all `completed`, 748 of 748 each. 2449 attempts, 205 HTTP 429 (all retried), 17 HTTP 503 `model_output_rejected` (real parse outcomes, not retried, counted as wrong), 0 `model_unavailable` outages, 0 unanswered.
- Dry runs (free, sign-in and `/health` only, no `/parse`): pilot loaded 170 messages, main loaded 748. Both matched the expected counts.
- The 429s came from the function's global 30-per-minute limit while three passes ran at once. They are not billed.
- Gate before main: logged spend $0.3366 plus projected main about $0.45 gave about $0.79, under the $2.00 gate. Even a full $1.50 main cap would stay under $2.00 total.

## Auth user ids (anonymous users created by these runs, for cleanup)

Main passes:
- `4ee78ec6-4f25-4c8b-851e-9cffd0deebd6`
- `d83d0669-1202-4202-86aa-16918ed413af`
- `b0bcf485-1ce1-4302-a174-9d1040bca08d`

Pilot passes:
- `39c749b8-888e-44b4-9730-6cddee51fa25`
- `7ebce959-6f16-4078-b065-de0cec05d524`
- `934e381c-d120-43cd-89c6-0e47eb176e05`

Dry runs:
- Main dry run: `9782ff9b-a36c-415c-b55f-c69ed2bfa582` (sign-in only, no devices row).
- Pilot dry run: **id not recorded**. My display filter masked it during the run. It is an anonymous user created today with no devices row. The orchestrator will clean up all anonymous users created today by date.

Each pass also registered one `devices` row under its user. Nothing was deleted by this task.

## Commands run and results

- `node server/eval/record-tuning.js --target edge --split pilot --pass 1 --dry-run`: plan printed, 170 messages.
- `node server/eval/record-tuning.js --target edge --split main --pass 1 --dry-run`: plan printed, 748 messages.
- Pilot passes 1 to 3, then main passes 1 to 3, each `node server/eval/record-tuning.js --target edge --split <split> --pass <n>` as a background process, concurrent within each split. All six ended `completed`.
- `node --test test/record-tuning.test.js test/record-tuning-edge.test.js test/heldout-split.test.js`: 68 of 68 (before the loader moved to `eval/`).
- `cd server && npm test`: 136 of 136 pass, 0 fail, 0 skipped.
- `npx jest src/parse/__tests__/claude-heldout-scorer.test.ts src/parse/__tests__/heldout-loader.test.ts src/parse/__tests__/imports.test.ts`: 49 of 49 pass.
- `EVAL_HELDOUT=1 npx jest --maxWorkers=1 src/parse/__tests__/eval-claude-heldout-edge.test.ts`: 2 of 2 pass. Writes both Claude reports.
- `npx tsc --noEmit`: exit 0.
- `npx expo lint`: exit 0.
- `npx jest --maxWorkers=1` (full): exit 0. Tests 919 passed, 13 skipped, 0 failed; suites 73 passed, 11 skipped (env-gated evals), 0 failed.

## Open risks and caveats

1. **Main Claude is below the fallback on all four (91.1% vs 95.7%).** The error types were not analysed in this task. That is the first thing to look at, and it needs a decision before any prompt change, since the held-out data must not feed back into the parser.
2. **Spread is only across passes.** The min to max does not include sampling error across messages. Approximate 95% intervals are about ±2.0 points for main all-four and ±3.1 for pilot all-four (normal approximation).
3. **Food list from tuning only.** Held-out items outside the 21 tuning foods cannot match, by design.
4. **Template-generated data**, so real donor wording will differ.
5. **Edge retry setting.** `SALO_SDK_MAX_RETRIES=0` on the function was stated by the orchestrator; the recorder cannot verify it because `/health` does not report it.
6. **Local git state changed during runs** (other agents committed). Grouping uses `request_config_sha256`, which was identical across all six held-out passes.
7. **One pilot dry-run user id is unrecorded** (see above).
