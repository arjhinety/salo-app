/// <reference types="jest" />
// The M6 sampler (seed 20261101, budget 400). Literal values come from an independent plain-JS replica of the engine
// counter-based RNG (u01), not from the module under test.
import { UNTUNED_PARAMS } from '../../engine/params';
import { TUNING_EVENING_IDS } from '../objective';
import {
  centralPenalty, dirichletWeights, paramsFor, PENALTY_MAX, sampleSettings, saloScale, SCALE_MAX, SCALE_MIN,
  TUNING_BUDGET, TUNING_SEED,
} from '../search';

describe('sampler constants', () => {
  test('seed, budget, scale range and penalty range are the decided values', () => {
    expect(TUNING_SEED).toBe(20261101);
    expect(TUNING_BUDGET).toBe(400);
    expect([SCALE_MIN, SCALE_MAX]).toEqual([5, 40]);
    expect(PENALTY_MAX).toBe(0.02);
  });
});

describe('sampler reproducibility and literal draws', () => {
  test('weights for settings 1, 2 and 400 match the reference draws', () => {
    const w1 = dirichletWeights(TUNING_SEED, 1);
    expect(w1.need).toBeCloseTo(0.15411667209569069, 12);
    expect(w1.storage).toBeCloseTo(0.0026224670139572796, 12);
    expect(w1.distance).toBeCloseTo(0.25949913404611308, 12);
    expect(w1.freshness).toBeCloseTo(0.58376172684423899, 12);
    const w2 = dirichletWeights(TUNING_SEED, 2);
    expect(w2.need).toBeCloseTo(0.051542755185037821, 12);
    expect(w2.storage).toBeCloseTo(0.43814490841808468, 12);
    const w400 = dirichletWeights(TUNING_SEED, 400);
    expect(w400.need).toBeCloseTo(0.032234733305192262, 12);
    expect(w400.freshness).toBeCloseTo(0.37471804852699048, 12);
  });

  test('scales for settings 1, 2 and 400 are 10, 12 and 6 (whole numbers)', () => {
    expect([saloScale(TUNING_SEED, 1), saloScale(TUNING_SEED, 2), saloScale(TUNING_SEED, 400)]).toEqual([10, 12, 6]);
  });

  test('penalties for settings 1, 2 and 400 match the reference draws', () => {
    expect(centralPenalty(TUNING_SEED, 1)).toBeCloseTo(0.014498945758678019, 12);
    expect(centralPenalty(TUNING_SEED, 2)).toBeCloseTo(0.012450894587673247, 12);
    expect(centralPenalty(TUNING_SEED, 400)).toBeCloseTo(0.015342986304312944, 12);
  });

  test('the whole list is reproducible: two calls give identical settings', () => {
    expect(sampleSettings('salo')).toEqual(sampleSettings('salo'));
    expect(sampleSettings('central_greedy')).toEqual(sampleSettings('central_greedy'));
  });
});

describe('sampler properties', () => {
  const salo = sampleSettings('salo');
  const cg = sampleSettings('central_greedy');

  test('401 settings per policy: index 0 untuned, then 1..400', () => {
    expect(salo).toHaveLength(401);
    expect(cg).toHaveLength(401);
    expect(salo.map((s) => s.index)).toEqual(Array.from({ length: 401 }, (_, i) => i));
    expect(salo[0].weights).toEqual(UNTUNED_PARAMS.salo.utilityWeights);
    expect(salo[0].knob).toBe(17);
    expect(cg[0].knob).toBe(0.005);
  });

  test('every weight vector sums to 1 within 1e-12 and has no negative part', () => {
    for (const s of salo.slice(1)) {
      const w = s.weights;
      const sum = w.need + w.storage + w.distance + w.freshness;
      expect(Math.abs(sum - 1)).toBeLessThan(1e-12);
      expect(Math.min(w.need, w.storage, w.distance, w.freshness)).toBeGreaterThanOrEqual(0);
    }
  });

  test('Salo scales are whole numbers from 5 to 40; central greedy penalties lie in [0, 0.02)', () => {
    for (const s of salo.slice(1)) {
      expect(Number.isInteger(s.knob)).toBe(true);
      expect(s.knob).toBeGreaterThanOrEqual(5);
      expect(s.knob).toBeLessThanOrEqual(40);
    }
    for (const s of cg.slice(1)) {
      expect(s.knob).toBeGreaterThanOrEqual(0);
      expect(s.knob).toBeLessThan(0.02);
    }
  });

  test('both policies draw the same weight vector at every index (same stream structure, equal effort)', () => {
    expect(cg.map((s) => s.weights)).toEqual(salo.map((s) => s.weights));
  });

  test('the knob streams differ, so the scale and the penalty are not the same draw', () => {
    expect(salo[1].knob).toBe(10);
    expect(cg[1].knob).toBeCloseTo(0.014498945758678019, 12);
  });
});

describe('paramsFor', () => {
  test('a Salo setting fills the Salo block and keeps the untuned central greedy block', () => {
    const p = paramsFor('salo', { index: 5, weights: { need: 0.1, storage: 0.2, distance: 0.3, freshness: 0.4 }, knob: 22 });
    expect(p.salo.shareBid).toEqual({ kind: 'linear', scale: 22 });
    expect(p.salo.shareBudgetPerEvening).toBe(40);
    expect(p.centralGreedy).toEqual(UNTUNED_PARAMS.centralGreedy);
    expect(p.tuningEvenings).toEqual(TUNING_EVENING_IDS);
  });

  test('a central greedy setting fills its block and keeps the untuned Salo block', () => {
    const p = paramsFor('central_greedy', { index: 5, weights: { need: 0.1, storage: 0.2, distance: 0.3, freshness: 0.4 }, knob: 0.0125 });
    expect(p.centralGreedy).toEqual({ utilityWeights: { need: 0.1, storage: 0.2, distance: 0.3, freshness: 0.4 }, transportPenaltyPerMinute: 0.0125 });
    expect(p.salo).toEqual(UNTUNED_PARAMS.salo);
  });
});
