/// <reference types="jest" />
// Independent SPEC tests for metrics.ts. Expected numbers derived by hand from the spec.

import {
  eveningMeasures,
  cappedMean,
  quantileSorted,
  bootstrapIndices,
  pairedInterval,
  verdict,
} from '../metrics';

describe('eveningMeasures', () => {
  test('(a) need 10, received 12 -> rescued 10, worst ratio capped at 1, wasted = 12 - 10 = 2', () => {
    const r = eveningMeasures(
      [{ pantryId: 'P1', isOpen: true, needKg: 10 }],
      12,
      new Map([['P1', 12]]),
    );
    expect(r.foodRescuedKg).toBe(10);
    expect(r.worstNeedMet).toBe(1);
    expect(r.foodWastedKg).toBe(2);
  });

  test('(b) needs 10,20,5 received 6,18,5 -> ratios 0.6,0.9,1.0, worst 0.6, rescued 29, wasted 11 (posted 40)', () => {
    const r = eveningMeasures(
      [
        { pantryId: 'P1', isOpen: true, needKg: 10 },
        { pantryId: 'P2', isOpen: true, needKg: 20 },
        { pantryId: 'P3', isOpen: true, needKg: 5 },
      ],
      40,
      new Map([
        ['P1', 6],
        ['P2', 18],
        ['P3', 5],
      ]),
    );
    expect(r.worstNeedMet).toBeCloseTo(0.6, 10);
    expect(r.foodRescuedKg).toBe(29);
    expect(r.foodWastedKg).toBe(11);
  });

  test('(c) all needs 0 -> worstNeedMet null, rescued 0 (posted 7 -> wasted 7)', () => {
    const r = eveningMeasures(
      [
        { pantryId: 'P1', isOpen: true, needKg: 0 },
        { pantryId: 'P2', isOpen: true, needKg: 0 },
      ],
      7,
      new Map([
        ['P1', 4],
        ['P2', 3],
      ]),
    );
    expect(r.worstNeedMet).toBeNull();
    expect(r.foodRescuedKg).toBe(0);
    expect(r.foodWastedKg).toBe(7);
  });

  test('a need-0 pantry adds 0 rescued and is left out of worstNeedMet (posted 10)', () => {
    const r = eveningMeasures(
      [
        { pantryId: 'P1', isOpen: true, needKg: 0 },
        { pantryId: 'P2', isOpen: true, needKg: 10 },
      ],
      10,
      new Map([
        ['P1', 3],
        ['P2', 4],
      ]),
    );
    expect(r.foodRescuedKg).toBe(4);
    expect(r.worstNeedMet).toBeCloseTo(0.4, 10);
    expect(r.foodWastedKg).toBe(6);
  });
});

describe('cappedMean', () => {
  test('[1.4, 0.0] -> capped [1, 0] -> 0.5 (uncapped would be 0.7)', () => {
    expect(cappedMean([1.4, 0.0])).toBe(0.5);
  });

  test('[null, 0.4] -> 0.4', () => {
    expect(cappedMean([null, 0.4])).toBeCloseTo(0.4, 10);
  });

  test('[] -> null', () => {
    expect(cappedMean([])).toBeNull();
  });

  test('[null] -> null', () => {
    expect(cappedMean([null])).toBeNull();
  });

  test('[0.5, 1.5, null] -> capped [0.5, 1] -> 0.75', () => {
    expect(cappedMean([0.5, 1.5, null])).toBeCloseTo(0.75, 10);
  });

  test('explicit cap 3: [2, 4] -> capped [2, 3] -> 2.5', () => {
    expect(cappedMean([2, 4], 3)).toBeCloseTo(2.5, 10);
  });
});

describe('quantileSorted (numpy linear, h = (n-1) q)', () => {
  test('[1,2,3,4] at q 0.5 -> 2.5', () => {
    expect(quantileSorted([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 10);
  });

  test('[1,2,3,4] at q 0.25 -> 1.75', () => {
    expect(quantileSorted([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 10);
  });

  test('[1,2,3,4] at q 0.75 -> 3.25', () => {
    expect(quantileSorted([1, 2, 3, 4], 0.75)).toBeCloseTo(3.25, 10);
  });

  test('endpoints: q 0 -> 1, q 1 -> 4', () => {
    expect(quantileSorted([1, 2, 3, 4], 0)).toBeCloseTo(1, 10);
    expect(quantileSorted([1, 2, 3, 4], 1)).toBeCloseTo(4, 10);
  });
});

describe('bootstrapIndices', () => {
  const n = 3;
  const resamples = 200;
  const idx = bootstrapIndices(n, resamples, 12345);

  test('returns one row per resample, each row of length n', () => {
    expect(idx).toHaveLength(resamples);
    for (const row of idx) {
      expect(row).toHaveLength(n);
    }
  });

  test('every index is an integer in [0, n)', () => {
    for (const row of idx) {
      for (const i of row) {
        expect(Number.isInteger(i)).toBe(true);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(n);
      }
    }
  });

  test('same seed -> identical indices', () => {
    expect(bootstrapIndices(n, resamples, 12345)).toEqual(idx);
  });

  test('different seed -> different indices', () => {
    expect(bootstrapIndices(n, resamples, 999)).not.toEqual(idx);
  });
});

describe('pairedInterval', () => {
  const diffs = [2, 4, 9];
  const idx = bootstrapIndices(3, 200, 12345);

  test('mean equals the plain mean of diffs: [2,4,9] -> 5', () => {
    expect(pairedInterval(diffs, idx, 0.9).mean).toBeCloseTo(5, 10);
  });

  test('non-degenerate: low < high, both inside the resample-mean range [2, 9], and low <= 5 <= high', () => {
    const { mean, low, high } = pairedInterval(diffs, idx, 0.9);
    expect(low).toBeLessThan(high);
    expect(low).toBeGreaterThanOrEqual(2);
    expect(high).toBeLessThanOrEqual(9);
    expect(low).toBeLessThanOrEqual(mean);
    expect(mean).toBeLessThanOrEqual(high);
  });

  test('MIRROR (D-Q3): same indices, negated diffs -> low = -high and high = -low', () => {
    const diffs2 = [2, 4, 9, -1, 3];
    const idx2 = bootstrapIndices(5, 300, 4242);
    const a = pairedInterval(diffs2, idx2, 0.9);
    const b = pairedInterval(diffs2.map((d) => -d), idx2, 0.9);
    expect(b.low).toBeCloseTo(-a.high, 10);
    expect(b.high).toBeCloseTo(-a.low, 10);
    expect(b.mean).toBeCloseTo(-a.mean, 10);
  });

  test('constant diffs [3,3,3,3] -> low = high = 3', () => {
    const r = pairedInterval([3, 3, 3, 3], bootstrapIndices(4, 100, 7), 0.9);
    expect(r.low).toBeCloseTo(3, 10);
    expect(r.high).toBeCloseTo(3, 10);
  });
});

describe('verdict', () => {
  test('RES-04: food [+2,+8] & fair [-0.01,+0.20] -> salo_better', () => {
    expect(verdict({ low: 2, high: 8 }, { low: -0.01, high: 0.2 })).toBe('salo_better');
  });

  test('RES-04: food [-5,-1] & fair [+0.10,+0.20] -> trade_off', () => {
    expect(verdict({ low: -5, high: -1 }, { low: 0.1, high: 0.2 })).toBe('trade_off');
  });

  test('RES-04: food [-1,+3] & fair [-0.05,+0.05] -> no_clear_difference', () => {
    expect(verdict({ low: -1, high: 3 }, { low: -0.05, high: 0.05 })).toBe('no_clear_difference');
  });

  test('RES-04: food [-5,-1] & fair [-0.05,+0.05] -> central_greedy_better', () => {
    expect(verdict({ low: -5, high: -1 }, { low: -0.05, high: 0.05 })).toBe('central_greedy_better');
  });

  test('food [-1,+3] & fair [+0.10,+0.20] -> salo_better (fair favors Salo, none favors central)', () => {
    expect(verdict({ low: -1, high: 3 }, { low: 0.1, high: 0.2 })).toBe('salo_better');
  });

  test('food [-5,-1] & fair [-0.30,-0.10] -> central_greedy_better (both favor central)', () => {
    expect(verdict({ low: -5, high: -1 }, { low: -0.3, high: -0.1 })).toBe('central_greedy_better');
  });
});
