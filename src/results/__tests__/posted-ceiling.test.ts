/// <reference types="jest" />
// The second food-ceiling definition (RES-07, added 2026-11-01): ceiling hit = all posted food was rescued that evening,
// food rescued equals total posted kg within 0.001 kg. Literal numbers, then the stored record (test fixture).
import { EVENINGS } from '../../data/dataset';
import type { EveningResult } from '../../engine/types';
import { POSTED_CEILING_TOLERANCE_KG, postedCeilingCounts, postedKgOf, reachedFoodCeiling, reachedPostedCeiling } from '../learning';
import { mainEvenings } from '../runner';
import { loadRecord } from './recordFixture';

const result = (rescued: number, wasted = 0): EveningResult => ({
  evening: 'E21',
  policy: 'salo',
  split: 'main_sample',
  foodRescuedKg: rescued,
  foodWastedKg: wasted,
  worstNeedMet: 0.5,
  strandedAwards: 0,
});

describe('reachedPostedCeiling, worked numbers', () => {
  test('the tolerance is 0.001 kg', () => {
    expect(POSTED_CEILING_TOLERANCE_KG).toBe(0.001);
  });

  test('posted 12.000 kg, rescued 12.0005 kg: hit (0.0005 kg apart)', () => {
    expect(reachedPostedCeiling(result(12.0005), 12)).toBe(true);
  });

  test('posted 12.000 kg, rescued exactly 12.000 kg: hit', () => {
    expect(reachedPostedCeiling(result(12), 12)).toBe(true);
  });

  test('posted 12.000 kg, rescued 11.999 kg: hit at exactly 0.001 kg apart (within, not beyond)', () => {
    expect(reachedPostedCeiling(result(11.999), 12)).toBe(true);
  });

  test('posted 12.000 kg, rescued 11.998 kg: not hit (0.002 kg short)', () => {
    expect(reachedPostedCeiling(result(11.998), 12)).toBe(false);
  });

  test('posted 12.000 kg, rescued 12.002 kg: not hit (0.002 kg apart, on the other side)', () => {
    expect(reachedPostedCeiling(result(12.002), 12)).toBe(false);
  });

  test('the second definition uses posted kg, the first uses need: needs 20 kg, posted and rescued 10 kg', () => {
    // Needs 20 kg, posted 10 kg, rescued 10 kg: the second definition is hit, the first (need fully met) is not.
    const needs = [{ pantryId: 'P1', isOpen: true, needKg: 20 }];
    expect(reachedPostedCeiling(result(10), 10)).toBe(true);
    expect(reachedFoodCeiling(result(10), needs)).toBe(false);
  });
});

describe('postedKgOf: the posted total of an evening', () => {
  test('sums its lots\' estimated kg: 4.5 + 7.25 = 11.75 kg', () => {
    const lots = [
      { estKg: 4.5 },
      { estKg: 7.25 },
    ] as unknown as Parameters<typeof postedKgOf>[0]['lots'];
    expect(postedKgOf({ lots })).toBe(11.75);
  });
});

describe('the stored record (main E21-E64)', () => {
  const record = loadRecord();
  const main = mainEvenings(EVENINGS);
  const policies = ['salo', 'fcfs', 'nearest', 'central_greedy'] as const;

  test('the engine\'s posted kg is the sum of the evening\'s lots: rescued + wasted = posted, on every run', () => {
    for (const p of policies) {
      record.main.perEvening[p].forEach((r, i) => {
        const posted = postedKgOf(main[i]);
        expect(main[i].id).toBe(r.evening);
        expect(Math.abs(r.foodRescuedKg + r.foodWastedKg - posted)).toBeLessThan(1e-9);
      });
    }
  });

  test('no main evening hits the second definition for any policy: the smallest food wasted is above 0.001 kg', () => {
    for (const p of policies) {
      const smallest = Math.min(...record.main.perEvening[p].map((r) => r.foodWastedKg));
      expect(smallest).toBeGreaterThan(POSTED_CEILING_TOLERANCE_KG);
    }
  });

  test('the counts under the second definition are 0 for every policy (so the screen reads 0 of 44)', () => {
    expect(postedCeilingCounts(record.main.perEvening, main)).toEqual({ salo: 0, fcfs: 0, nearest: 0, central_greedy: 0 });
  });
});
