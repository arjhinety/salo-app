/// <reference types="node" />
/// <reference types="jest" />
// M6 main run (decisions.md, M6: "Main run approved (Arjhine, 2026-11-01, I approve all)"). Runs only when M6_MAIN=1.
// Calls the existing runner (runMainResults, runLearningComparison) with the frozen settings, on E21-E64 only: the gate
// refuses anything else, and this file asserts the list. Nothing here re-implements a measure or an interval.
// Sequential: one evening at a time, the four policies in turn; the engine's logs are dropped after each evening.
// Writes two files: src/results/mainResults.generated.ts (the committed record the Results screen reads) and
// docs/reports/m6-main.md. Both are checked by src/results/__tests__/persisted.test.ts on every normal test run.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATASET_VERSION, EVENINGS } from '../../data/dataset';
import { FROZEN_PARAMS } from '../../engine/frozenParams';
import { POLICY_IDS } from '../../engine/policies';
import { ceilingCounts } from '../../results/learning';
import { checksumParams, REGISTRATION } from '../../results/registration';
import type { PersistedMainResults } from '../../results/persisted';
import { mainEvenings, runLearningComparison, runMainResults } from '../../results/runner';
import { renderGeneratedModule, renderMainReport } from '../mainRender';

const run = process.env.M6_MAIN === '1' ? it : it.skip;
const ROOT = join(__dirname, '..', '..', '..');
const MAIN_IDS = Array.from({ length: 44 }, (_, i) => `E${21 + i}`);
/** The dataset repo's 17-file SHA256SUMS, as recorded in decisions.md (dataset v1.3, commit 9e140ca). */
const DATASET_REPO_MANIFEST = 'sha256:e183b81d595437d1d9c1f9e7f98ed6bdbb777ea8ab3ce7484bbfd941c023bc24';

run('M6 main run on E21-E64 (gated by M6_MAIN=1)', () => {
  const started = Date.now();

  // The evenings: exactly E21..E64, every one main_sample, 44 of them, the recorded count.
  const evenings = mainEvenings(EVENINGS);
  expect(evenings.map((e) => e.id)).toEqual(MAIN_IDS);
  expect(evenings.every((e) => e.split === 'main_sample')).toBe(true);
  expect(evenings).toHaveLength(44);
  expect(REGISTRATION.mainEveningCount).toBe(44);
  expect(checksumParams(FROZEN_PARAMS)).toBe(REGISTRATION.frozenParamsChecksum);
  expect(FROZEN_PARAMS.frozenOn).not.toBe('UNTUNED');

  // The main run. The runner checks the gate and the split before any evening runs.
  const main = runMainResults({ params: FROZEN_PARAMS });
  expect(main.evenings).toEqual(MAIN_IDS);
  for (const pid of POLICY_IDS) {
    expect(main.perEvening[pid].map((r) => r.evening)).toEqual(MAIN_IDS);
    expect(main.perEvening[pid].every((r) => r.split === 'main_sample')).toBe(true);
  }
  expect(main.comparisons.filter((c) => c.main)).toHaveLength(2);
  expect(main.comparisons.filter((c) => !c.main)).toHaveLength(10);

  // Supporting only: learning off (RES-07), and the food-ceiling counts.
  const learning = runLearningComparison({ params: FROZEN_PARAMS });
  const ceilings = ceilingCounts(main.perEvening, evenings);

  const bundledManifest = createHash('sha256')
    .update(readFileSync(join(ROOT, 'data', 'salo-evening-dataset', 'SHA256SUMS')))
    .digest('hex');
  const stored: PersistedMainResults = {
    schema: 1,
    generatedBy: 'src/tuning/__tests__/m6-main-run.test.ts (M6_MAIN=1), run 2026-11-01',
    dataset: {
      version: DATASET_VERSION,
      bundledTablesSha256: `sha256:${bundledManifest}`,
      datasetRepoManifestSha256: DATASET_REPO_MANIFEST,
      mainEvenings: MAIN_IDS,
    },
    frozenParamsChecksum: checksumParams(FROZEN_PARAMS),
    mainEveningCount: REGISTRATION.mainEveningCount!,
    resamples: REGISTRATION.resamples,
    seed: REGISTRATION.seed,
    main,
    learning,
    ceilings,
  };

  const runtimeSeconds = (Date.now() - started) / 1000;
  writeFileSync(join(ROOT, 'src', 'results', 'mainResults.generated.ts'), renderGeneratedModule(stored));
  mkdirSync(join(ROOT, 'docs', 'reports'), { recursive: true });
  writeFileSync(join(ROOT, 'docs', 'reports', 'm6-main.md'), renderMainReport(stored, { date: '2026-11-01', runtimeSeconds, evenings }));

  const food = main.comparisons.find((c) => c.main && c.measure === 'foodRescued')!;
  const fair = main.comparisons.find((c) => c.main && c.measure === 'needMet')!;
  process.stdout.write(
    `main: verdict ${main.verdict}; food [${food.low.toFixed(3)}, ${food.high.toFixed(3)}] kg; ` +
      `need met [${fair.low.toFixed(4)}, ${fair.high.toFixed(4)}]; ${runtimeSeconds.toFixed(1)} s; record and report written\n`,
  );
}, 60 * 60 * 1000);
