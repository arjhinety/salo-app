/// <reference types="jest" />
// The screen model (RES-01, RES-03, RES-04, RES-06, RES-07) and the Results screen source. No React rendering: the model is pure.

import { readFileSync } from 'fs';
import { join } from 'path';
import type { EveningResult, PolicyId } from '../../engine/types';
import { RESULTS_COPY, NOT_MEASURED, RESULTS_ROUTE } from '../copy';
import { formatCell, formatComparison, closedModel, currentModel, openModel } from '../model';
import { FROZEN_PARAMS } from '../../engine/frozenParams';
import { PERSISTED_MAIN_RESULTS } from '../mainResults.generated';
import { REGISTRATION, type Registration } from '../registration';
import { summarize } from '../runner';
import { COMPARISONS, type Comparison } from '../intervals';
import { VERDICT_LABEL } from '../verdict';

// Pilot (E01-E20) and tuning ids. None may appear on the Results screen (RES-06). E21-E64 are allowed.
const PILOT_OR_TUNING_ID = /\bE(0[1-9]|1[0-9]|20)\b/;

/** The record before the pilot: nothing recorded. A synthetic closed record, to prove the closed-gate copy. */
const beforePilot: Registration = { ...REGISTRATION, pilotDone: false, mainEveningCount: null };

describe('the stored main results on the screen (the gate is open and the record matches)', () => {
  const m = currentModel();
  const stored = PERSISTED_MAIN_RESULTS;

  test('is open: the stored results are shown, with no gate line and no reason', () => {
    expect(m.open).toBe(true);
    expect(m.gateLine).toBeNull();
    expect(m.reasons).toEqual([]);
  });

  test('every policy cell is the stored value, formatted (no cell reads "Not measured yet")', () => {
    expect(m.policies.map((p) => p.label)).toEqual(['Agents (Salo)', 'First come first served', 'Nearest pantry', 'Central greedy']);
    for (const p of m.policies) {
      expect(p.cells.map((c) => c.label)).toEqual(['Food rescued', 'Food wasted', 'Need met, worst-served pantry', 'Stranded awards']);
    }
    expect(m.policies[0].cells[0].value).toBe(formatCell('foodRescued', stored.main.cells.salo.foodRescued));
    expect(m.policies[3].cells[2].value).toBe(formatCell('needMet', stored.main.cells.central_greedy.needMet));
    expect(m.policies.flatMap((p) => p.cells).some((c) => c.value === NOT_MEASURED)).toBe(false);
  });

  test('the two main results are the 97.5% rows, the ten supporting ones are 95%, and each shows its interval', () => {
    expect(m.mainRows).toHaveLength(2);
    expect(m.supportingRows).toHaveLength(10);
    expect(m.mainRows.every((r) => r.value.includes('['))).toBe(true);
    expect(m.supportingRows.every((r) => r.label.endsWith('(95%)'))).toBe(true);
  });

  test('the verdict is the pre-registered label, followed by the two intervals it used (RES-04)', () => {
    expect(m.verdict.startsWith(VERDICT_LABEL[stored.main.verdict])).toBe(true);
    expect(m.verdict).toContain('food rescued [');
    expect(m.verdict).toContain('worst-served need met [');
  });

  test('learning off and the ceiling counts are present, labelled as supporting by their headings', () => {
    expect(m.learningRows).toHaveLength(4);
    expect(m.learningRows.every((r) => r.label.includes(RESULTS_COPY.learningRow))).toBe(true);
    expect(m.learningRows.some((r) => r.value === NOT_MEASURED)).toBe(false);
    expect(m.ceilingRows.map((r) => r.value)).toEqual(['0 of 44 evenings', '0 of 44 evenings', '0 of 44 evenings', '0 of 44 evenings']);
    expect(RESULTS_COPY.learningHeading).toBe('Supporting: learning off');
    expect(RESULTS_COPY.ceilingHeading).toBe('Supporting: evenings that reached the food ceiling');
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

describe('the stored results never show when the gate or the record is not right', () => {
  const stored = PERSISTED_MAIN_RESULTS;
  const expectClosed = (m: ReturnType<typeof currentModel>) => {
    expect(m.open).toBe(false);
    expect(m.policies.every((p) => p.cells.every((c) => c.value === NOT_MEASURED))).toBe(true);
    expect(m.verdict).toBe(NOT_MEASURED);
    expect(m.mainRows.every((r) => r.value === NOT_MEASURED)).toBe(true);
  };

  test('the gate closed (no pilot recorded): closed, with the gate line', () => {
    const m = currentModel(stored, beforePilot, FROZEN_PARAMS);
    expectClosed(m);
    expect(m.gateLine).toBe('Main results appear after the pilot has run and the number of main evenings is recorded (guide p.19).');
  });

  test('no frozen parameters in the build: closed', () => {
    expectClosed(currentModel(stored, REGISTRATION, null));
  });

  test('a stored checksum that is not the frozen parameters checksum: closed, with the stale line, and the reason says why', () => {
    const m = currentModel({ ...stored, frozenParamsChecksum: 'sha256:' + '0'.repeat(64) }, REGISTRATION, FROZEN_PARAMS);
    expectClosed(m);
    expect(m.gateLine).toBe(RESULTS_COPY.gateStale);
    expect(m.reasons.length).toBeGreaterThan(0);
  });

  test('a stored record from another dataset version: closed', () => {
    expectClosed(currentModel({ ...stored, dataset: { ...stored.dataset, version: 'v1.2' } }, REGISTRATION, FROZEN_PARAMS));
  });

  test('a stored record with a different seed: closed', () => {
    expectClosed(currentModel({ ...stored, seed: 1 }, REGISTRATION, FROZEN_PARAMS));
  });

  test('a recorded count that differs from the dataset is closed with the count line, whatever is stored', () => {
    const mismatch = closedModel({ ...REGISTRATION, mainEveningCount: 10 }, FROZEN_PARAMS);
    expect(mismatch.open).toBe(false);
    expect(mismatch.gateLine).toBe(
      'The recorded main-evening count does not match the main evenings in the dataset, so no main result is shown (guide p.19).',
    );
    expect(mismatch.reasons).toEqual(['the recorded count is 10, not the 44 main evenings in the dataset']);
    expectClosed(currentModel(stored, { ...REGISTRATION, mainEveningCount: 10 }, FROZEN_PARAMS));
  });

  test('the screen source never imports the runner or the engine: nothing is computed when it opens', () => {
    const model = readFileSync(join(__dirname, '../model.ts'), 'utf8');
    expect(model).not.toMatch(/runMainResults|runEvening|runLearningComparison|engine\/simulate/);
  });
});

describe('closed screen (the closed model with the pilot recorded and the count matching the dataset)', () => {
  const m = closedModel(REGISTRATION, FROZEN_PARAMS);

  test('is closed: no main result is shown, and the line says the main evenings have not been run', () => {
    expect(m.open).toBe(false);
    expect(m.gateLine).toBe(
      'The pilot has run and the main-evening count is recorded. The main evenings have not been run, so no main result is shown (guide p.19).',
    );
    expect(m.reasons).toEqual([]);
  });

  test('a recorded count that differs from the dataset is still refused, with the count reason', () => {
    const mismatch = closedModel({ ...REGISTRATION, mainEveningCount: 10 }, FROZEN_PARAMS);
    expect(mismatch.open).toBe(false);
    expect(mismatch.reasons).toEqual(['the recorded count is 10, not the 44 main evenings in the dataset']);
  });

  test('before the pilot is recorded, the screen keeps the one plain gate line from the stories, with the two reasons', () => {
    const before = closedModel(beforePilot, FROZEN_PARAMS);
    expect(before.open).toBe(false);
    expect(before.gateLine).toBe('Main results appear after the pilot has run and the number of main evenings is recorded (guide p.19).');
    expect(before.reasons).toEqual(['the pilot has not run', 'the number of main evenings is not recorded']);
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
});

describe('the Results screen source (src/app/results.tsx)', () => {
  const screen = readFileSync(join(__dirname, '../../app/results.tsx'), 'utf8');

  test('contains no pilot or tuning evening id (RES-06)', () => {
    expect(screen).not.toMatch(PILOT_OR_TUNING_ID);
  });

  test('never imports the runner or the engine: the screen cannot start an evening', () => {
    expect(screen).not.toMatch(/runMainResults|runEvening|engine\//);
  });

  test('is registered at the route the dashboard links to', () => {
    expect(RESULTS_ROUTE).toBe('/results');
    expect(screen).toContain('currentModel()');
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

  test('fills every cell and interval from the summary, and gives the verdict its label', () => {
    const main = summarize(runs, { resamples: 200, seed: 20260927 } as const);
    const m = openModel(main, { ...REGISTRATION, mainEveningCount: 2, pilotDone: true, frozenParamsChecksum: 'fnv1a32:00000001', resamples: 200 }, 'fnv1a32:00000001');
    expect(m.open).toBe(true);
    expect(m.gateLine).toBeNull();
    expect(m.verdict.startsWith('Salo better')).toBe(true);
    expect(m.policies[0].cells[0].value).toBe('11.0 kg');
    expect(m.policies[0].cells[2].value).toBe('80%');
    expect(m.mainRows).toHaveLength(2);
    expect(m.supportingRows).toHaveLength(10);
    expect(m.learningRows[0].value).toBe(NOT_MEASURED);
    expect(m.footer[2].value).toBe('fnv1a32:00000001');
  });

  test('the closed model with a recorded checksum still names no pilot id', () => {
    expect(JSON.stringify(closedModel())).not.toMatch(PILOT_OR_TUNING_ID);
  });
});
