/// <reference types="jest" />
// Paired intervals (RES-03). The reference bounds were computed outside the app with numpy 2.3.5
// (numpy.percentile, method='linear') on the fixed diffs and the eight hand-written resample rows below.

import { bootstrapIndices, pairedInterval } from '../../engine/metrics';
import type { EveningResult, PolicyId } from '../../engine/types';
import { BASELINES, COMPARISONS, compareAll, pairedDiffs, readingOf } from '../intervals';
import { BOOTSTRAP_SEED, RESAMPLES } from '../registration';

const DIFFS = [2.0, -1.5, 4.25, 0.5, 3.0, -2.5, 1.0, 5.5, -0.75, 2.25];
const ROWS: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [9, 9, 8, 8, 7, 7, 6, 6, 5, 5],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [1, 3, 5, 7, 9, 0, 2, 4, 6, 8],
  [4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  [2, 2, 3, 3, 5, 5, 7, 7, 9, 9],
  [0, 2, 4, 6, 8, 8, 6, 4, 2, 0],
  [9, 0, 9, 0, 9, 0, 9, 0, 9, 0],
];

describe('pairedInterval against an outside reference', () => {
  test('point estimate is the mean of the diffs: 1.375', () => {
    expect(pairedInterval(DIFFS, ROWS, 0.95).mean).toBeCloseTo(1.375, 12);
  });

  test('95% bounds: [1.148125, 2.846875]', () => {
    const r = pairedInterval(DIFFS, ROWS, 0.95);
    expect(r.low).toBeCloseTo(1.148125, 9);
    expect(r.high).toBeCloseTo(2.846875, 9);
  });

  test('97.5% bounds (the main results): [1.1240625, 2.9234375]', () => {
    const r = pairedInterval(DIFFS, ROWS, 0.975);
    expect(r.low).toBeCloseTo(1.1240625, 9);
    expect(r.high).toBeCloseTo(2.9234375, 9);
  });

  test('the 97.5% interval is wider than the 95% one, on both sides', () => {
    const wide = pairedInterval(DIFFS, ROWS, 0.975);
    const narrow = pairedInterval(DIFFS, ROWS, 0.95);
    expect(wide.low).toBeLessThan(narrow.low);
    expect(wide.high).toBeGreaterThan(narrow.high);
  });
});

describe('seeded resamples', () => {
  test('the default count is 10,000 and the same seed gives the same rows', () => {
    const a = bootstrapIndices(10, RESAMPLES, BOOTSTRAP_SEED);
    const b = bootstrapIndices(10, RESAMPLES, BOOTSTRAP_SEED);
    expect(a).toHaveLength(10000);
    expect(a).toEqual(b);
    expect(a.every((row) => row.length === 10 && row.every((i) => i >= 0 && i < 10))).toBe(true);
  });

  test('a different seed gives different rows', () => {
    expect(bootstrapIndices(10, 50, BOOTSTRAP_SEED)).not.toEqual(bootstrapIndices(10, 50, BOOTSTRAP_SEED + 1));
  });
});

describe('readingOf: direction-aware, and no clear difference when zero is inside', () => {
  test('food rescued above zero is "Salo better"; below zero is "baseline better"', () => {
    expect(readingOf('foodRescued', 1, 2)).toBe('salo_better');
    expect(readingOf('foodRescued', -2, -1)).toBe('baseline_better');
  });

  test('food wasted is lower-is-better: an interval below zero favours Salo', () => {
    expect(readingOf('foodWasted', -2, -1)).toBe('salo_better');
    expect(readingOf('foodWasted', 1, 2)).toBe('baseline_better');
  });

  test('stranded awards is lower-is-better too', () => {
    expect(readingOf('stranded', -1, -0.2)).toBe('salo_better');
    expect(readingOf('stranded', 0.2, 1)).toBe('baseline_better');
  });

  test('an interval that touches or contains zero is "no clear difference"', () => {
    expect(readingOf('needMet', -0.01, 0.2)).toBe('no_clear_difference');
    expect(readingOf('needMet', 0, 0.2)).toBe('no_clear_difference');
    expect(readingOf('foodRescued', -1, 3)).toBe('no_clear_difference');
  });
});

describe('the twelve comparisons', () => {
  test('there are twelve: two main at 97.5%, ten supporting at 95%', () => {
    expect(COMPARISONS).toHaveLength(12);
    const main = COMPARISONS.filter((c) => c.main);
    const supporting = COMPARISONS.filter((c) => !c.main);
    expect(main.map((c) => [c.measure, c.baseline, c.level])).toEqual([
      ['foodRescued', 'central_greedy', 0.975],
      ['needMet', 'central_greedy', 0.975],
    ]);
    expect(supporting).toHaveLength(10);
    expect(supporting.every((c) => c.level === 0.95)).toBe(true);
  });

  test('no comparison is listed twice, and every baseline is one of the three', () => {
    const keys = COMPARISONS.map((c) => `${c.measure}|${c.baseline}`);
    expect(new Set(keys).size).toBe(12);
    expect(COMPARISONS.every((c) => BASELINES.includes(c.baseline))).toBe(true);
  });
});

describe('pairedDiffs and compareAll', () => {
  const r = (evening: string, policy: PolicyId, rescued: number, needMet: number | null, stranded = 0): EveningResult => ({
    evening,
    policy,
    split: 'main_sample',
    foodRescuedKg: rescued,
    foodWastedKg: 100 - rescued,
    worstNeedMet: needMet,
    strandedAwards: stranded,
  });

  test('pairedDiffs drops an evening where need met is missing for either policy', () => {
    const salo = [r('E21', 'salo', 50, 0.5), r('E22', 'salo', 40, null)];
    const cg = [r('E21', 'central_greedy', 48, 0.4), r('E22', 'central_greedy', 41, 0.3)];
    expect(pairedDiffs(salo, cg, 'needMet')).toEqual([0.5 - 0.4]);
    expect(pairedDiffs(salo, cg, 'foodRescued')).toEqual([2, -1]);
  });

  test('pairedDiffs refuses runs that cover different evenings', () => {
    const salo = [r('E21', 'salo', 50, 0.5)];
    const cg = [r('E22', 'central_greedy', 48, 0.4)];
    expect(() => pairedDiffs(salo, cg, 'foodRescued')).toThrow('evening order differs');
  });

  // Ten evenings with fixed values, so the output is the same on every run.
  const ten = (f: (i: number) => number, p: PolicyId, n: (i: number) => number | null = () => 0.5) =>
    Array.from({ length: 10 }, (_, i) => r(`E${21 + i}`, p, f(i), n(i)));
  const runs = {
    salo: ten((i) => 50 + i * 1.5, 'salo', (i) => 0.5 + 0.02 * i),
    fcfs: ten((i) => 48 + (i % 3), 'fcfs', (i) => 0.5 + 0.01 * (i % 4)),
    nearest: ten((i) => 49 + (i % 4) * 0.5, 'nearest'),
    central_greedy: ten((i) => 47 + (i % 5) * 0.8, 'central_greedy', (i) => 0.45 + 0.01 * i),
  };

  test('compareAll returns twelve rows with the right levels and evening counts', () => {
    const out = compareAll(runs);
    expect(out).toHaveLength(12);
    expect(out.filter((c) => c.main).every((c) => c.level === 0.975 && c.evenings === 10)).toBe(true);
    expect(out.filter((c) => !c.main).every((c) => c.level === 0.95)).toBe(true);
  });

  test('food wasted intervals are the exact mirror of food rescued ones (shared resamples, decision D-Q3)', () => {
    const out = compareAll(runs);
    const rescued = out.find((c) => c.measure === 'foodRescued' && c.baseline === 'fcfs')!;
    const wasted = out.find((c) => c.measure === 'foodWasted' && c.baseline === 'fcfs')!;
    expect(wasted.mean).toBeCloseTo(-rescued.mean, 9);
    expect(wasted.low).toBeCloseTo(-rescued.high, 9);
    expect(wasted.high).toBeCloseTo(-rescued.low, 9);
  });

  test('compareAll is deterministic: the same runs give the same bounds', () => {
    expect(compareAll(runs)).toEqual(compareAll(runs));
  });
});
