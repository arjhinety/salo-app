/// <reference types="jest" />
// The screen model (RES-01, RES-03, RES-04, RES-06, RES-07) and the Results screen source. No React rendering: the model is
// pure. The open screen is checked with the record's numbers (test fixture) and with synthetic runs.

import { readFileSync } from 'fs';
import { join } from 'path';
import { EVENINGS } from '../../data/dataset';
import { FROZEN_PARAMS } from '../../engine/frozenParams';
import type { EveningResult, PolicyId } from '../../engine/types';
import { RESULTS_COPY, NOT_MEASURED, RESULTS_ROUTE } from '../copy';
import { COMPARISONS, type Comparison } from '../intervals';
import { postedCeilingCounts } from '../learning';
import { formatCell, formatComparison, closedModel, currentModel, openModel } from '../model';
import { type OnDeviceResults } from '../onDevice';
import { REGISTRATION, type Registration } from '../registration';
import { mainEvenings, summarize } from '../runner';
import { VERDICT_LABEL } from '../verdict';
import { loadRecord } from './recordFixture';

// Pilot (E01-E20) and tuning ids. None may appear on the Results screen (RES-06). E21-E64 are allowed.
const PILOT_OR_TUNING_ID = /\bE(0[1-9]|1[0-9]|20)\b/;

/** The record before the pilot: nothing recorded. A synthetic closed record, to prove the closed-gate copy. */
const beforePilot: Registration = { ...REGISTRATION, pilotDone: false, mainEveningCount: null };

/** The results of a run, as the on-device path returns them, built from the stored record (the record is a test fixture). */
function recordRun(): OnDeviceResults {
  const record = loadRecord();
  return {
    main: record.main,
    learning: record.learning,
    postedCeilings: postedCeilingCounts(record.main.perEvening, mainEvenings(EVENINGS)),
  };
}

describe('the results of a run on the screen (the gate is open and a run is shown)', () => {
  const run = recordRun();
  const m = currentModel(run);
  const record = loadRecord();

  test('is open: the run is shown, with no gate line, no reason, and no run button', () => {
    expect(m.open).toBe(true);
    expect(m.canRun).toBe(false);
    expect(m.gateLine).toBeNull();
    expect(m.reasons).toEqual([]);
  });

  test('every policy cell is the run value, formatted (no cell reads "Not measured yet")', () => {
    expect(m.policies.map((p) => p.label)).toEqual(['Agents (Salo)', 'First come first served', 'Nearest pantry', 'Central greedy']);
    for (const p of m.policies) {
      expect(p.cells.map((c) => c.label)).toEqual(['Food rescued', 'Food wasted', 'Need met, worst-served pantry', 'Stranded awards']);
    }
    expect(m.policies[0].cells[0].value).toBe(formatCell('foodRescued', record.main.cells.salo.foodRescued));
    expect(m.policies[3].cells[2].value).toBe(formatCell('needMet', record.main.cells.central_greedy.needMet));
    expect(m.policies.flatMap((p) => p.cells).some((c) => c.value === NOT_MEASURED)).toBe(false);
  });

  test('the two main results are the 97.5% rows, the ten supporting ones are 95%, and each shows its interval', () => {
    expect(m.mainRows).toHaveLength(2);
    expect(m.supportingRows).toHaveLength(10);
    expect(m.mainRows.every((r) => r.value.includes('['))).toBe(true);
    expect(m.supportingRows.every((r) => r.label.endsWith('(95%)'))).toBe(true);
  });

  test('the verdict is the pre-registered label, followed by the two intervals it used (RES-04)', () => {
    expect(m.verdict.startsWith(VERDICT_LABEL[record.main.verdict])).toBe(true);
    expect(m.verdict).toContain('food rescued [');
    expect(m.verdict).toContain('worst-served need met [');
  });

  test('learning off and the ceiling row are present, labelled as supporting', () => {
    expect(m.learningRows).toHaveLength(4);
    expect(m.learningRows.every((r) => r.label.includes(RESULTS_COPY.learningRow))).toBe(true);
    expect(m.learningRows.some((r) => r.value === NOT_MEASURED)).toBe(false);
    expect(RESULTS_COPY.learningHeading).toBe('Supporting: learning off');
  });

  test('the ceiling row is the second definition (all posted food rescued): 0 of 44 for every policy, as computed on the record', () => {
    expect(m.ceilingRows.map((r) => r.value)).toEqual(['0 of 44 evenings', '0 of 44 evenings', '0 of 44 evenings', '0 of 44 evenings']);
    expect(RESULTS_COPY.ceilingHeading).toBe('Supporting: food ceiling hit (all posted food rescued)');
    expect(RESULTS_COPY.ceilingNote).toBe('Supporting diagnostic only. The main result does not depend on it.');
  });

  test('the footer shows the dataset version, the resamples, the seed and the frozen parameters checksum', () => {
    expect(m.footer).toEqual([
      { label: 'Dataset', value: 'v1.3' },
      { label: 'Resamples', value: '10,000' },
      { label: 'Random seed', value: '20260927' },
      { label: 'Frozen parameters checksum', value: REGISTRATION.frozenParamsChecksum },
    ]);
  });

  test('no pilot or tuning evening id appears anywhere in the screen model or its copy (RES-06)', () => {
    const text = JSON.stringify(m) + JSON.stringify(RESULTS_COPY);
    expect(text).not.toMatch(PILOT_OR_TUNING_ID);
    expect(text).toContain('E21 to E64');
  });
});

describe('no result is shown when the gate is closed, whatever run is given', () => {
  const run = recordRun();
  const expectClosed = (m: ReturnType<typeof currentModel>) => {
    expect(m.open).toBe(false);
    expect(m.canRun).toBe(false);
    expect(m.policies.every((p) => p.cells.every((c) => c.value === NOT_MEASURED))).toBe(true);
    expect(m.verdict).toBe(NOT_MEASURED);
    expect(m.mainRows.every((r) => r.value === NOT_MEASURED)).toBe(true);
    expect(m.ceilingRows.every((r) => r.value === NOT_MEASURED)).toBe(true);
  };

  test('the gate closed (no pilot recorded): closed, no button, with the gate line', () => {
    const m = currentModel(run, beforePilot, FROZEN_PARAMS);
    expectClosed(m);
    expect(m.gateLine).toBe('Main results appear after the pilot has run and the number of main evenings is recorded (guide p.19).');
  });

  test('no frozen parameters in the build: closed', () => {
    expectClosed(currentModel(run, REGISTRATION, null));
  });

  test('a recorded count that differs from the dataset is closed with the count line', () => {
    const mismatch = { ...REGISTRATION, mainEveningCount: 10 };
    const m = currentModel(run, mismatch, FROZEN_PARAMS);
    expectClosed(m);
    expect(m.gateLine).toBe(
      'The recorded main-evening count does not match the main evenings in the dataset, so no main result is shown (guide p.19).',
    );
    expect(m.reasons).toEqual(['the recorded count is 10, not the 44 main evenings in the dataset']);
  });

  test('the screen source never imports the runner or the engine: the model computes nothing', () => {
    const model = readFileSync(join(__dirname, '../model.ts'), 'utf8');
    expect(model).not.toMatch(/runMainResults|runEvening|runLearningComparison|runOnDevice|engine\/simulate/);
  });
});

describe('closed screen: the gate is open and no run has been made yet', () => {
  const m = currentModel(null);

  test('is closed with the run button offered; the line says the main evenings are not run yet', () => {
    expect(m.open).toBe(false);
    expect(m.canRun).toBe(true);
    expect(m.gateLine).toBe(
      'The pilot has run and the main-evening count is recorded. No main result is shown until the main evenings are run on this phone (guide p.19).',
    );
    expect(m.reasons).toEqual([]);
  });

  test('every policy cell reads "Not measured yet": four policies by four measures', () => {
    expect(m.policies).toHaveLength(4);
    for (const p of m.policies) {
      expect(p.cells.every((c) => c.value === NOT_MEASURED)).toBe(true);
    }
  });

  test('the two main results and the ten supporting ones are listed, all "Not measured yet"', () => {
    expect(m.mainRows).toHaveLength(2);
    expect(m.supportingRows).toHaveLength(10);
    expect([...m.mainRows, ...m.supportingRows, ...m.learningRows, ...m.ceilingRows].every((r) => r.value === NOT_MEASURED)).toBe(true);
    expect(m.verdict).toBe(NOT_MEASURED);
  });

  test('the footer shows the resample count and the seed; the checksum row reads "Not measured yet" while closed', () => {
    expect(m.footer).toEqual([
      { label: 'Resamples', value: '10,000' },
      { label: 'Random seed', value: '20260927' },
      { label: 'Frozen parameters checksum', value: NOT_MEASURED },
    ]);
  });

  test('before the pilot is recorded, the screen shows the one plain gate line, with the two reasons', () => {
    const before = closedModel(beforePilot, FROZEN_PARAMS);
    expect(before.open).toBe(false);
    expect(before.canRun).toBe(false);
    expect(before.gateLine).toBe('Main results appear after the pilot has run and the number of main evenings is recorded (guide p.19).');
    expect(before.reasons).toEqual(['the pilot has not run', 'the number of main evenings is not recorded']);
  });

  test('the closed model names no pilot id', () => {
    expect(JSON.stringify(closedModel())).not.toMatch(PILOT_OR_TUNING_ID);
  });
});

describe('the Results screen source (src/app/results.tsx)', () => {
  const screen = readFileSync(join(__dirname, '../../app/results.tsx'), 'utf8');

  test('contains no pilot or tuning evening id (RES-06)', () => {
    expect(screen).not.toMatch(PILOT_OR_TUNING_ID);
  });

  test('computes only through the on-device path (onDevice.ts) and never imports the engine directly', () => {
    expect(screen).toContain("from '../results/onDevice'");
    expect(screen).toContain('runOnDevice(');
    expect(screen).not.toMatch(/runMainResults|runEvening|runLearningComparison|engine\/simulate/);
  });

  test('the run button is offered by the model only while the gate is open; the screen reads currentModel(results)', () => {
    expect(screen).toContain('currentModel(results)');
    expect(screen).toContain('m.canRun');
    expect(screen).toContain('C.runButton');
  });

  test('is registered at the route the dashboard links to', () => {
    expect(RESULTS_ROUTE).toBe('/results');
  });
});

describe('the run copy (src/results/copy.ts)', () => {
  test('the button, progress, cancelled and in-memory lines are as listed in the handoff', () => {
    expect(RESULTS_COPY.runButton).toBe('Run the main evenings');
    expect(RESULTS_COPY.runProgress(12, 44)).toBe('Evening 12 of 44 …');
    expect(RESULTS_COPY.runIntervals).toBe('Working out the intervals and the verdict …');
    expect(RESULTS_COPY.runCancel).toBe('Cancel run');
    expect(RESULTS_COPY.runCancelled).toBe('The run was cancelled. No main result is shown.');
    expect(RESULTS_COPY.runInMemory).toBe('The numbers are computed on this phone when you run them, and kept in memory for this session only.');
  });
});

describe('number formatting', () => {
  test('food in kg with one decimal, need met as a whole percentage, stranded awards with two decimals', () => {
    expect(formatCell('foodRescued', 142.345)).toBe('142.3 kg');
    expect(formatCell('foodWasted', 11)).toBe('11.0 kg');
    expect(formatCell('needMet', 0.6)).toBe('60%');
    expect(formatCell('stranded', 1.5)).toBe('1.50 awards');
    expect(formatCell('foodRescued', null)).toBe(NOT_MEASURED);
  });

  test('a comparison shows its mean and both bounds, and the reading', () => {
    const c: Comparison = {
      ...COMPARISONS[0],
      evenings: 10,
      mean: 1.36,
      low: 1.1,
      high: 2.9,
      reading: 'salo_better',
    };
    expect(formatComparison(c)).toBe('+1.4 kg [+1.1, +2.9] · Salo better');
  });

  test('need met comparisons are shown in points of the percentage', () => {
    const c: Comparison = {
      ...COMPARISONS[1],
      evenings: 10,
      mean: -0.05,
      low: -0.1,
      high: 0.02,
      reading: 'no_clear_difference',
    };
    expect(formatComparison(c)).toBe('−5.0 points [−10.0, +2.0] · No clear difference');
  });
});

describe('open screen (with synthetic runs, never real evenings)', () => {
  const r = (evening: string, policy: PolicyId, rescued: number, met: number): EveningResult => ({
    evening,
    policy,
    split: 'main_sample',
    foodRescuedKg: rescued,
    foodWastedKg: 20 - rescued,
    worstNeedMet: met,
    strandedAwards: 0,
  });
  const runs = {
    salo: [r('E21', 'salo', 10, 0.8), r('E22', 'salo', 12, 0.8)],
    fcfs: [r('E21', 'fcfs', 8, 0.5), r('E22', 'fcfs', 8, 0.5)],
    nearest: [r('E21', 'nearest', 9, 0.6), r('E22', 'nearest', 9, 0.6)],
    central_greedy: [r('E21', 'central_greedy', 9, 0.6), r('E22', 'central_greedy', 9, 0.6)],
  } as Record<PolicyId, EveningResult[]>;
  const synthetic: OnDeviceResults = {
    main: summarize(runs, { resamples: 200, seed: 20260927 }),
    learning: Object.fromEntries(
      (['salo', 'fcfs', 'nearest', 'central_greedy'] as PolicyId[]).map((p) => [
        p,
        { evenings: 2, mean: 0, low: -1, high: 1, level: 0.95, reading: 'no_clear_difference', offFoodKg: [8, 8] },
      ]),
    ) as OnDeviceResults['learning'],
    postedCeilings: { salo: 1, fcfs: 0, nearest: 0, central_greedy: 2 },
  };

  test('fills every cell and interval from the run, and gives the verdict its label', () => {
    const reg = { ...REGISTRATION, mainEveningCount: 2, pilotDone: true, frozenParamsChecksum: 'sha256:' + '1'.repeat(64), resamples: 200 };
    const m = openModel(synthetic, reg);
    expect(m.open).toBe(true);
    expect(m.gateLine).toBeNull();
    expect(m.verdict.startsWith('Salo better')).toBe(true);
    expect(m.policies[0].cells[0].value).toBe('11.0 kg');
    expect(m.policies[0].cells[2].value).toBe('80%');
    expect(m.mainRows).toHaveLength(2);
    expect(m.supportingRows).toHaveLength(10);
    expect(m.footer[3].value).toBe('sha256:' + '1'.repeat(64));
  });

  test('the ceiling row counts come from the run, out of the evenings it covers', () => {
    const m = openModel(synthetic, { ...REGISTRATION, mainEveningCount: 2, resamples: 200 });
    expect(m.ceilingRows.map((x) => x.value)).toEqual(['1 of 2 evenings', '0 of 2 evenings', '0 of 2 evenings', '2 of 2 evenings']);
  });
});
