/// <reference types="jest" />
// Main-evening count (decisions.md, "M6 tuning and pilot", amended 2026-11-01). Expected values are hand-worked literals,
// checked against an independent calculation in Node; they are not derived from the code under test.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGISTRATION } from '../../results/registration';
import {
  assertPilotEvening,
  assertPilotEvenings,
  CHI2_LOWER_20_DF9,
  GAP_FAIR,
  GAP_FOOD_KG,
  MIN_MAIN_EVENINGS,
  measureCount,
  pilotCount,
  requiredEvenings,
  sampleSd,
  SD_UPPER_FACTOR,
  upperSd,
  Z_975,
} from '../pilotCount';

const ONE_TO_TEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const scaled = (k: number) => ONE_TO_TEN.map((x) => k * x);

describe('the constants (decisions.md)', () => {
  test('the chi-square lower 20% quantile with 9 degrees of freedom is 5.380053, and the two-sided 97.5% quantile is 2.2414', () => {
    expect(CHI2_LOWER_20_DF9).toBe(5.380053);
    expect(Z_975).toBe(2.2414);
    expect(GAP_FOOD_KG).toBe(6);
    expect(GAP_FAIR).toBe(0.1);
    expect(MIN_MAIN_EVENINGS).toBe(10);
  });

  test('the chi-square factor sqrt(9 / 5.380053) = 1.29339 (rounded to five places), and 1.2934 to four', () => {
    expect(Math.sqrt(9 / 5.380053)).toBeCloseTo(1.29339, 5);
    expect(SD_UPPER_FACTOR).toBeCloseTo(1.29339, 5);
    expect(SD_UPPER_FACTOR).toBeCloseTo(1.2934, 4);
  });
});

describe('sample SD and the upper limit, by hand', () => {
  test('the sample SD of 1..10 is 3.02765 (sum of squared deviations 82.5, divided by 9)', () => {
    expect(sampleSd(ONE_TO_TEN)).toBeCloseTo(3.02765, 5);
  });

  test('the sample SD of 2,4,4,4,5,5,7,9 is sqrt(32/7) = 2.13809 (the textbook example, n - 1)', () => {
    expect(sampleSd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 5);
  });

  test('s_U of 1..10 is 3.91592 (= 3.02765 × 1.29339)', () => {
    expect(upperSd(sampleSd(ONE_TO_TEN))).toBeCloseTo(3.91592, 5);
  });

  test('a single value has no SD and is refused', () => {
    expect(() => sampleSd([5])).toThrow('at least two values');
  });
});

describe('the count from literal inputs', () => {
  test('n = ceil((2 × 2.2414 × s_U / gap)²): for s_U = 3.91592 and gap 6 it is 8.5598, so 9 evenings', () => {
    expect(requiredEvenings(3.91592, 6)).toBe(9);
  });

  test('the ceiling is taken on the unrounded value: (2 × 2.2414 × 1 / 2)² = 5.02387, so 6 evenings', () => {
    expect(requiredEvenings(1, 2)).toBe(6);
  });

  test('food gap 6 kg on 1..10: n_food = 9, and the floor of 10 makes the count 10 when fairness needs only 4', () => {
    const food = measureCount(ONE_TO_TEN, GAP_FOOD_KG);
    expect(food.sd).toBeCloseTo(3.02765, 5);
    expect(food.sU).toBeCloseTo(3.91592, 5);
    expect(food.n).toBe(9);
    const fair = measureCount(scaled(0.01), GAP_FAIR); // SD 0.03028, s_U 0.03916, raw 3.0815 -> 4
    expect(fair.n).toBe(4);
    expect(pilotCount(ONE_TO_TEN, scaled(0.01))).toMatchObject({ count: 10 });
  });

  test('the fairness branch wins: fairness on 0.05 × (1..10) needs 78 (raw 77.0382), so the count is 78', () => {
    const r = pilotCount(ONE_TO_TEN, scaled(0.05));
    expect(r.food.n).toBe(9);
    expect(r.fair.n).toBe(78);
    expect(r.count).toBe(78);
  });

  test('the food branch wins: food on 10 × (1..10) needs 856 (raw 855.98), so the count is 856', () => {
    const r = pilotCount(scaled(10), scaled(0.01));
    expect(r.food.n).toBe(856);
    expect(r.count).toBe(856);
  });

  test('the count is the larger of the two n, and never below 10 (the floor applies to all-zero differences too)', () => {
    const r = pilotCount(ONE_TO_TEN.map(() => 0), ONE_TO_TEN.map(() => 0));
    expect(r.food.n).toBe(0);
    expect(r.count).toBe(10);
  });
});

describe('refusals (the count only takes ten pilot evenings and finite numbers)', () => {
  test('nine differences are refused', () => {
    expect(() => measureCount(ONE_TO_TEN.slice(0, 9), GAP_FOOD_KG)).toThrow('need 10 pilot differences, got 9');
  });

  test('a non-finite difference is refused', () => {
    expect(() => measureCount([...ONE_TO_TEN.slice(0, 9), NaN], GAP_FOOD_KG)).toThrow('not a finite number');
  });

  test('a zero or negative gap is refused', () => {
    expect(() => measureCount(ONE_TO_TEN, 0)).toThrow('the gap must be positive');
  });

  test('the pilot list must be exactly E11..E20 in order, every one a pilot evening', () => {
    const pilot = Array.from({ length: 10 }, (_, i) => ({ id: `E${11 + i}`, split: 'pilot' }));
    expect(() => assertPilotEvenings(pilot)).not.toThrow();
    const tuning = Array.from({ length: 10 }, (_, i) => ({ id: `E${String(1 + i).padStart(2, '0')}`, split: 'tuning' }));
    expect(() => assertPilotEvenings(tuning)).toThrow('pilot needs exactly E11');
    expect(() => assertPilotEvenings(pilot.slice(0, 9))).toThrow('pilot needs exactly');
  });

  test('a main evening (E21-E64) is refused, even with the pilot split', () => {
    expect(() => assertPilotEvening({ id: 'E21', split: 'main_sample' })).toThrow('refuses evening E21');
    expect(() => assertPilotEvening({ id: 'E21', split: 'pilot' })).toThrow('only E11-E20 may be used');
    expect(() => assertPilotEvening({ id: 'E11', split: 'tuning' })).toThrow('its split is tuning');
  });
});

describe('the recorded count matches the pilot report', () => {
  test('registration.ts records the count printed in docs/reports/m6-pilot.md', () => {
    const report = readFileSync(join(__dirname, '..', '..', '..', 'docs', 'reports', 'm6-pilot.md'), 'utf8');
    const m = /Main-evening count = max\((\d+), (\d+), (\d+)\) = (\d+)\./.exec(report);
    expect(m).not.toBeNull();
    expect(REGISTRATION.mainEveningCount).toBe(Number(m![4]));
    expect(REGISTRATION.pilotDone).toBe(true);
  });

  test('the report carries the pilot label on its first line, and shows no interval bounds and no verdict', () => {
    const report = readFileSync(join(__dirname, '..', '..', '..', 'docs', 'reports', 'm6-pilot.md'), 'utf8');
    expect(report.split('\n')[0]).toBe(
      '# Pilot evenings E11–E20: used only to set the main-evening count; not a result, never reported as one.',
    );
    // The report says that no interval or verdict is computed. It must not show any: no "[low, high]" bounds, no reading.
    expect(/\[[+−-]?\d/.test(report)).toBe(false);
    expect(/Salo better|Baseline better|No clear difference/.test(report)).toBe(false);
  });
});
