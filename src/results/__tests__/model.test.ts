/// <reference types="jest" />
// The screen model (RES-01, RES-03, RES-06) and the Results screen source. No React rendering: the model is pure.

import { readFileSync } from 'fs';
import { join } from 'path';
import type { EveningResult, PolicyId } from '../../engine/types';
import { RESULTS_COPY, NOT_MEASURED, RESULTS_ROUTE } from '../copy';
import { formatCell, formatComparison, closedModel, currentModel, openModel } from '../model';
import { REGISTRATION } from '../registration';
import { summarize } from '../runner';
import { COMPARISONS, type Comparison } from '../intervals';

// Pilot (E01-E20) and tuning ids. None may appear on the Results screen (RES-06). E21-E30 are allowed.
const PILOT_OR_TUNING_ID = /\bE(0[1-9]|1[0-9]|20)\b/;

describe('closed screen (the gate is shut today)', () => {
  const m = currentModel();

  test('is closed, with the one plain gate line from the stories', () => {
    expect(m.open).toBe(false);
    expect(m.gateLine).toBe('Main results appear after the pilot has run and the number of main evenings is recorded (guide p.19).');
  });

  test('every policy cell reads "Not measured yet": four policies by four measures', () => {
    expect(m.policies.map((p) => p.label)).toEqual([
      'Agents (Salo)',
      'First come first served',
      'Nearest pantry',
      'Central greedy',
    ]);
    expect(m.policies).toHaveLength(4);
    for (const p of m.policies) {
      expect(p.cells.map((c) => c.label)).toEqual(['Food rescued', 'Food wasted', 'Need met, worst-served pantry', 'Stranded awards']);
      expect(p.cells.every((c) => c.value === NOT_MEASURED)).toBe(true);
    }
  });

  test('the two main results and the ten supporting ones are listed, all "Not measured yet"', () => {
    expect(m.mainRows).toHaveLength(2);
    expect(m.supportingRows).toHaveLength(10);
    expect([...m.mainRows, ...m.supportingRows, ...m.learningRows, ...m.ceilingRows].every((r) => r.value === NOT_MEASURED)).toBe(true);
    expect(m.verdict).toBe(NOT_MEASURED);
  });

  test('the footer shows the resample count, the seed and the checksum; the checksum is not recorded yet', () => {
    expect(m.footer).toEqual([
      { label: 'Resamples', value: '10,000' },
      { label: 'Random seed', value: '20260927' },
      { label: 'Frozen parameters checksum', value: NOT_MEASURED },
    ]);
    expect(REGISTRATION.frozenParamsChecksum).toBeNull();
  });

  test('the closed reasons cover all four missing conditions', () => {
    expect(m.reasons).toHaveLength(4);
  });

  test('no pilot or tuning evening id appears anywhere in the screen model or its copy (RES-06)', () => {
    const text = JSON.stringify(m) + JSON.stringify(RESULTS_COPY);
    expect(text).not.toMatch(PILOT_OR_TUNING_ID);
    expect(text).toContain('E21 to E30');
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
    expect(m.verdict).toBe('Salo better');
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
