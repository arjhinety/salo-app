/// <reference types="node" />
/// <reference types="jest" />
// M6 tuning runner (milestone M6 step 1). Runs only when M6_TUNING=1 (skipped in normal test runs, like report.test.ts).
// Tuning evenings E01-E10 only: assertTuningEvenings refuses anything else, and no pilot or main evening is selected.
// Sequential, one evening at a time, no worker threads. Writes:
//   docs/reports/m6-tuning.md, docs/reports/m6-tuning/settings.csv, docs/reports/m6-tuning/chosen-params.json
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENINGS, WORLD } from '../../data/dataset';
import { UNTUNED_PARAMS } from '../../engine/params';
import { indexWorld } from '../../engine/world';
import type { FrozenParams } from '../../engine/types';
import { assertTuningEvenings, TUNING_EVENING_IDS } from '../objective';
import { baselineDetails, tunePolicy, type EveningDetail } from '../run';
import { renderReport, renderSettingsCsv, type TuningReport } from '../render';
import { sampleSettings, TUNING_BUDGET, TUNING_SEED } from '../search';

const run = process.env.M6_TUNING === '1' ? it : it.skip;
const ROOT = join(__dirname, '..', '..', '..');
const REPORT_DIR = join(ROOT, 'docs', 'reports');

run('M6 tuning on E01-E10 (gated by M6_TUNING=1)', () => {
  const started = Date.now();
  const evenings = EVENINGS.filter((e) => e.split === 'tuning');
  assertTuningEvenings(evenings);
  const wx = indexWorld(WORLD);
  const progress = (label: string) => (done: number, total: number) => {
    if (done % 50 === 0 || done === total) process.stdout.write(`${label} ${done}/${total}\n`);
  };

  const salo = tunePolicy(wx, evenings, 'salo', sampleSettings('salo'), progress('salo'));
  const cg = tunePolicy(wx, evenings, 'central_greedy', sampleSettings('central_greedy'), progress('central_greedy'));
  const fcfs: EveningDetail[] = baselineDetails(wx, evenings, 'fcfs', UNTUNED_PARAMS);
  const nearest: EveningDetail[] = baselineDetails(wx, evenings, 'nearest', UNTUNED_PARAMS);

  // Cross-check: the per-evening table of the chosen setting agrees with its sweep mean.
  for (const p of [salo, cg]) {
    const mean = p.chosenDetails.reduce((s, d) => s + d.foodKg, 0) / p.chosenDetails.length;
    if (Math.abs(mean - p.chosen.means.foodKg) > 1e-9) throw new Error(`${p.policy}: per-evening mean ${mean} != sweep mean ${p.chosen.means.foodKg}`);
  }
  expect(salo.evaluated).toBe(TUNING_BUDGET + 1);
  expect(cg.evaluated).toBe(TUNING_BUDGET + 1);

  const frozenCandidate: FrozenParams = {
    schema: 1,
    frozenOn: '2026-11-01',
    tuningEvenings: [...TUNING_EVENING_IDS],
    salo: salo.chosenParams.salo,
    centralGreedy: cg.chosenParams.centralGreedy,
  };

  const rep: TuningReport = {
    date: '2026-11-01',
    seed: TUNING_SEED,
    budget: TUNING_BUDGET,
    runtimeSeconds: (Date.now() - started) / 1000,
    salo,
    centralGreedy: cg,
    fcfs,
    nearest,
  };
  mkdirSync(join(REPORT_DIR, 'm6-tuning'), { recursive: true });
  writeFileSync(join(REPORT_DIR, 'm6-tuning.md'), renderReport(rep));
  writeFileSync(join(REPORT_DIR, 'm6-tuning', 'settings.csv'), renderSettingsCsv(salo, cg));
  writeFileSync(join(REPORT_DIR, 'm6-tuning', 'chosen-params.json'), JSON.stringify(frozenCandidate, null, 2) + '\n');
  process.stdout.write(`done in ${rep.runtimeSeconds.toFixed(1)} s\n`);
}, 60 * 60 * 1000);
