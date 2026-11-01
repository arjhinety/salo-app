# Handoff: dataset v1.3 (main_sample 44, E21–E64), mobile-data, 2026-11-01

## Summary

- Dataset v1.3 generated: `main_sample` goes from 10 evenings (E21–E30) to 44 (E21–E64), the count the pilot recorded. Arjhine's decision (`docs/decisions.md`, M6): "more main evenings, a new pinned dataset version with new seeds from the same generator."
- Append-only: every v1.2 row is kept byte for byte in the same order. E01–E30 are unchanged. Reference tables and `driver_runs` are byte-identical.
- Dataset repo commit `9e140ca` (author `arjhinety`). **Not pushed. No Hugging Face upload.**
- App: v1.3 bundled into `src/data/dataset.generated.ts`. Nothing committed in the app (you commit).
- No main evening (E21–E64) was run through the engine.

## Dataset repo: `C:\Users\arro\Downloads\project\salo-evening-dataset-repo` (commit `9e140ca`)

**Source data:** nothing new is needed. The generator takes each evening's date from `2026-10-01 + (n − 1) days`, the weekday factor from that date, and rain from the evening's seed. No external weather or holiday data is used, so the 34 extra dates are covered.

**Committed:** `README.md` (v1.3 changelog, build table), `SHA256SUMS` (five lines), `build_dataset.py` (`N_EVENINGS` main_sample 10 → 44; the `donor_messages.split` provenance text now says E21–E64), `export_hf.py` (card text, v1.3 changelog), `check_append_only.py` (new).

**Regenerated locally, gitignored (not committed):** `salo-evening-dataset/` (13 files), `salo-evening-dataset.xlsx` (12 sheets; `evenings` has 64 rows), `hf/` (export only, `hash.txt` included). `hf/` names commit `9e140ca`.

| table | v1.2 rows | v1.3 rows | added |
|---|---|---|---|
| evenings | 30 | 64 | 34 (E31–E64) |
| pantry_needs | 900 | 1,920 | 1,020 |
| food_offers | 1,436 | 3,072 | 1,636 |
| donor_messages | 510 | 1,088 | 578 (M0511–M1088, all `main_sample`) |

Nothing else changed in row counts. `verify.py` checks 17 files: 4 sources, 11 tables, `sources.csv`, `parameters.csv`.

### Commands and results (dataset repo)

1. **Snapshot.** Copied `salo-evening-dataset/`, `hf/`, the xlsx and `SHA256SUMS` to `C:\Users\arro\AppData\Local\Temp\claude\C--Users-arro-Downloads-project\18b3e653-8dfc-4340-bc77-528be4ba6250\scratchpad\v12-snapshot`. Its `SHA256SUMS` equals the one at `75d6ff7` (sha256 `d8aa7041…16c4`).
2. **Pinned environment.** Python 3.12.0 venv in the scratchpad (`…\scratchpad\venv`), `pip install -r requirements.txt`: pandas 3.0.5, numpy 2.3.5, pyarrow 25.0.0, openpyxl 3.1.5.
3. **Baseline.** `verify.py` on untouched v1.2: `17 of 17 files match SHA256SUMS`.
4. **Build.** `build_dataset.py` with main_sample 44: exit 0. 64 evenings, 1,088 donor messages, `food_offers` 3,072 rows.
5. **Append-only check.** `python check_append_only.py --old <v12-snapshot>\salo-evening-dataset`, exit 0:

```
== reference tables (byte-identical)
PASS  pantries.csv: 30 rows, sha256 51750f323d3e2f43
PASS  donors.csv: 50 rows, sha256 3627a11639cca71c
PASS  drivers.csv: 40 rows, sha256 50e35f5c99a74515
PASS  road_distances.csv: 1500 rows, sha256 0c76bbb5ead2a0e2
PASS  driver_distances.csv: 2000 rows, sha256 df1d7a74a3ee3ab9
PASS  storage_rules.csv: 23 rows, sha256 112bc515e627c5b1
PASS  parameters.csv: 13 rows, sha256 1bbc31fb90b614b2
PASS  driver_runs.csv: 406 rows, sha256 66b3ab68d4ff8e15
== evening tables (append-only)
PASS  old evenings.csv has exactly E01-E30
PASS  evenings.csv: all old bytes kept, same order
        evenings.csv: 30 -> 64 rows (+34), sha256 fbfe9c31e4ae5ad9
PASS  evenings.csv: new rows cover E31-E64 exactly
PASS  pantry_needs.csv: all old bytes kept, same order
        pantry_needs.csv: 900 -> 1920 rows (+1020), sha256 0e4c9925eb38d786
PASS  pantry_needs.csv: new rows cover E31-E64 exactly
PASS  food_offers.csv: all old bytes kept, same order
        food_offers.csv: 1436 -> 3072 rows (+1636), sha256 ba6aa3eec0fd7b2d
PASS  food_offers.csv: new rows cover E31-E64 exactly
PASS  donor_messages.csv: all old bytes kept, same order
        donor_messages.csv: 510 -> 1088 rows (+578), sha256 cf3b32d0baf18e5f
PASS  donor_messages.csv: every new row is main_sample
PASS  donor_messages.csv: new message_ids continue M0511..M1088
PASS  donor_messages.csv: new messages come from the lots of E31-E64 only
== evenings
PASS  evenings.csv: E01-E64 in order, no gaps
PASS  splits: E01-E10 tuning, E11-E20 pilot, E21-E64 main_sample (44)
== sources.csv
PASS  identical except the donor_messages split row (E21-E30 -> E21-E64 main_sample)

SUMMARY: append-only OK
```

6. **Negative test of the check.** A copy with one byte changed in `donors.csv` and one field changed in `food_offers.csv` gives `FAIL` on both and exit 1. So the check can fail.
7. **Checksums.** `verify.py --update` wrote 17 checksums. Five changed: `donor_messages`, `evenings`, `food_offers`, `pantry_needs`, `sources`. Then `verify.py`: `17 of 17 files match SHA256SUMS`. The manifest's sha256 is `e183b81d595437d1d9c1f9e7f98ed6bdbb777ea8ab3ce7484bbfd941c023bc24`.
8. **HF export, local only.** `export_hf.py` (no `--push`) wrote `hf/`: 10,193 rows, commit `9e140ca`.
9. **Commit.** `git -c user.name=arjhinety -c user.email=arjhine@experimentalmachines.org commit` → `9e140ca`. Working tree clean afterwards.

**Only change in an existing data row:** `sources.csv`, the `donor_messages.split` provenance text, now reads E21–E64 instead of E21–E30. It is provenance text, not data. The check allows exactly that one change.

## App: `C:\Users\arro\Downloads\project\salo-app` (uncommitted)

**Bundled data and generated files**
- `data/salo-evening-dataset/`: `evenings.csv`, `food_offers.csv`, `pantry_needs.csv` replaced with v1.3; `SHA256SUMS` lines for those three updated (the other seven files are byte-identical to v1.3, checked against the dataset repo's `SHA256SUMS`); `README.md` now says v1.3, commit `9e140ca`, and not yet published.
- `scripts/build-data.mjs`: version `v1.3`; comment points at v1.3 and says it is not yet published.
- `src/data/dataset.generated.ts`: regenerated by `node scripts/build-data.mjs`. Output: 64 evenings, 3,072 lots, 42 late-minute samples. Diff is the header and the RAW JSON line.
- `src/engine/hiddenTruth.generated.ts`: regenerated by `scripts/recover-true-show-rates.py ../salo-evening-dataset-repo`. The script verified 10 CSVs byte-identical to an instrumented v1.3 build and wrote 40 rates. **`git diff` is empty**: drivers did not change, so the true show rates did not change.
- `supabase/seed.sql`: `node scripts/gen-supabase-seed.mjs --check` → "up to date". The seed reads only donors, pantries and drivers. No database was touched.

**Results gate constant**
- `src/results/registration.ts`: `MAIN_EVENINGS_IN_DATASET` 10 → 44 (see Open risks, item 1).

### Commands and results (app)

- `node scripts/build-data.mjs`: wrote `dataset.generated.ts`, exit 0.
- `python scripts/recover-true-show-rates.py ../salo-evening-dataset-repo`: `verified 10 CSVs byte-identical; wrote 40 rates`, exit 0.
- `node scripts/gen-supabase-seed.mjs --check`: `supabase/seed.sql is up to date`, exit 0.
- `node --test scripts/gen-supabase-seed.test.mjs`: 9 pass, 0 fail.
- `npx tsc --noEmit`: exit 0.
- `npx expo lint`: exit 0 (only the `env: load .env` line printed).
- `npx jest --maxWorkers=2`: **742 passed, 7 skipped, 0 failed** (the 7 skipped are by design: the gated M6 pilot and tuning runners, and the integration and eval tests that skip without their flags). The first run had one failure, the donor catalog count, fixed as listed below. Then green.
- `M6_PILOT=1 npx jest src/tuning/__tests__/m6-pilot-run.test.ts`: 1 passed. The count reproduces: `Main-evening count = max(36, 44, 10) = 44`. The regenerated `docs/reports/m6-pilot.md` differed from the committed one in one sentence only (the dataset version and main-evening count sentence, now v1.3 wording). **I restored the committed report** because it is the pre-registration record. Git shows no change to it.

### E01–E20 unchanged: evidence

- Dataset: every v1.2 row for E01–E30 is byte-identical in v1.3 (`check_append_only.py`). The engine reads only those rows for E01–E20, so its inputs did not change.
- Engine fixtures (`src/engine/__tests__/fixtures/head-digests.json`, `head-results.json`) and their tests pass unchanged. The fixture files and `src/engine/frozenParams.ts` are not modified.
- The E01–E10 digest tests (`human-drivers`, `learning-off`, `reannounce`, `no-shares-left`, `simulate.smoke`) and the frozen-params checksum test (`frozen-params.test.ts`, `sha256:5d0ef9b5…`) pass.
- The pilot runner reproduces count 44 on E11–E20.

### Main evenings not run

Nothing ran E21–E64 through the engine. The runner tests mock `runEvening`. The only real engine calls are on E01–E20 (tuning and pilot tests). `runMainResults` and `runLearningComparison` are not called by the app, and no test calls them with real evenings any more.

## Test and copy changes (dataset facts only)

**Behaviour changed, because the count now matches the dataset:**
1. `src/results/__tests__/runner.test.ts`
   - "the default evenings are exactly E21 to E30" → E21–E64 (44 ids).
   - "44 is not the 10 evenings given, so it throws": after v1.3 the real count matches, so this would no longer throw. Replaced with a check that 44 recorded equals `mainEvenings(EVENINGS)` (44). The count mismatch is still tested with two synthetic evenings: `The recorded count is 44 but 2 evenings were given.`
   - `runLearningComparison` case: same change, with synthetic evenings.
2. `src/results/__tests__/model.test.ts`
   - Closed-screen describe: count 44 now matches, so the line is "The pilot has run and the main-evening count is recorded…" with no reasons. The mismatch case is kept with count 10.
   - `m10` uses `MAIN_EVENINGS_IN_DATASET`.
   - "E21 to E30" → "E21 to E64".
3. `src/donor/__tests__/catalog.test.ts`: the distinct items donor D01 posted across all evenings: 9 → 13. Checked against `food_offers.csv`: 9 in E01–E30, plus 4 that appear only in E31–E64.
4. `src/results/registration.ts`: `MAIN_EVENINGS_IN_DATASET` 10 → 44.

**Comments, copy and names that give the evening range or version:**
- `src/results/copy.ts`: "Evenings reported: E21 to E30" → E21 to E64 (shown in the open state).
- `src/app/results.tsx`, `src/results/model.ts`, `src/tuning/objective.ts`, `src/tuning/render.ts`, `src/tuning/__tests__/m6-pilot-run.test.ts`, `src/tuning/__tests__/pilotCount.test.ts` (title), `src/parse/rules/vocab.ts`, `src/parse/__tests__/tuningCorpus.ts`, `scripts/gen-parse-prompt-data.mjs`: comments → E21–E64.
- `src/tuning/pilotRender.ts`: text "dataset v1.2" → "v1.3". Only used if the report is regenerated.
- `src/data/dataset.ts`, `src/engine/types.ts`: comments → v1.3 and E01…E64.
- `scripts/gen-supabase-seed.test.mjs`: regex and title E11–E30 → E11–E64 (passes).
- `supabase/tests/00_schema_guard.test.sql`: same range (pgTAP file edited, not run, no database touched).
- `scripts/recover-true-show-rates.py`: docstring v1.2 → v1.3.

**Not changed, on purpose:** `MIN_MAIN_EVENINGS = 10` in `src/tuning/pilotCount.ts` (the pre-registered rule floor, not a dataset fact). The historical reports (`docs/reports/m6-tuning.md`, `docs/reports/m6-pilot.md`). Engine comments that say v1.2 added travel times, which is still true.

## Open risks and decisions for Arjhine

1. **The results gate's record now passes.** `mainEveningCount` 44 equals the 44 main evenings. `runMainResults` and `runLearningComparison` would run all 44 if called with the frozen parameters. Nothing calls them, and the Results screen shows "Not measured yet" with the line "The main evenings have not been run". Running them needs your go-ahead.
2. **Not published.** v1.3 is not on Hugging Face. The `hf/` card says so. The upload needs your OK, and `export_hf.py --push` needs the commit pushed first (it refuses on a dirty tree, and the card links the commit).
3. **Dataset repo git.** The CSVs, xlsx and `hf/` are gitignored. Commit `9e140ca` holds the code, README, `SHA256SUMS` and the check script. The data is reproduced by `build_dataset.py` and checked by `SHA256SUMS`.
4. **Donor catalog.** The donor picker and history read items from all evenings, including main ones. This was already true for E21–E30. It changed D01's history from 9 to 13 items. Whether main-evening lots should feed the donor UI is a product question; I did not change it.
5. **Simulated calendar.** Evening dates are `2026-10-01 + (n − 1)` days, so E32 is today (2026-11-01) and E33–E64 are later. The evenings are simulated, and the dates do not affect the engine.
6. **Pilot report.** The committed `docs/reports/m6-pilot.md` keeps the v1.2 sentence. A regenerated report would read v1.3.
7. **Not committed.** The app changes are uncommitted, as you asked. The untracked `docs/reports/claude-tuning-edge/` was there before this task, and I did not touch it.

## Files

Dataset repo: `C:\Users\arro\Downloads\project\salo-evening-dataset-repo\` (`README.md`, `SHA256SUMS`, `build_dataset.py`, `export_hf.py`, `check_append_only.py`, commit `9e140ca`).

App: `C:\Users\arro\Downloads\project\salo-app\`:
- `data\salo-evening-dataset\` (`evenings.csv`, `food_offers.csv`, `pantry_needs.csv`, `SHA256SUMS`, `README.md`)
- `scripts\build-data.mjs`, `scripts\recover-true-show-rates.py`, `scripts\gen-parse-prompt-data.mjs`, `scripts\gen-supabase-seed.test.mjs`
- `src\data\dataset.generated.ts`, `src\data\dataset.ts`, `src\engine\hiddenTruth.generated.ts` (unchanged), `src\engine\types.ts`
- `src\results\registration.ts`, `src\results\copy.ts`, `src\results\model.ts`, `src\app\results.tsx`
- `src\results\__tests__\runner.test.ts`, `src\results\__tests__\model.test.ts`, `src\donor\__tests__\catalog.test.ts`
- `src\tuning\objective.ts`, `src\tuning\pilotRender.ts`, `src\tuning\render.ts`, `src\tuning\__tests__\m6-pilot-run.test.ts`, `src\tuning\__tests__\pilotCount.test.ts`
- `src\parse\rules\vocab.ts`, `src\parse\__tests__\tuningCorpus.ts`
- `supabase\tests\00_schema_guard.test.sql`, `docs\decisions.md` (one bullet), this handoff

Scratchpad (not in repo): `C:\Users\arro\AppData\Local\Temp\claude\C--Users-arro-Downloads-project\18b3e653-8dfc-4340-bc77-528be4ba6250\scratchpad\` (v1.2 snapshot, venv, check output, jest logs).
