/// <reference types="jest" />
// The M6 select rule and the tuning-evening guard. Expected values are written out, not derived from the code under test.
import type { EveningResult } from '../../engine/types';
import {
  assertTuningEvening, assertTuningEvenings, meansOf, rankSettings, selectSetting, TUNING_EVENING_IDS, type Scored,
} from '../objective';

const row = (index: number, foodKg: number, worstNeedMet: number): Scored => ({ index, foodKg, worstNeedMet });

describe('select rule: feasible settings (worst-served mean >= 0.5)', () => {
  test('the most food among the feasible wins; a mean of exactly 0.50 is feasible; infeasible food is ignored', () => {
    const table = [
      row(0, 150, 0.4),   // infeasible
      row(1, 155, 0.55),  // feasible
      row(2, 160, 0.5),   // feasible at the boundary, and the most food among the feasible
      row(3, 170, 0.49),  // infeasible, more food than 2 but must not win
    ];
    expect(selectSetting(table).index).toBe(2);
  });

  test('a feasible tie on food goes to the higher worst-served mean', () => {
    expect(selectSetting([row(0, 100, 0.6), row(1, 100, 0.9)]).index).toBe(1);
  });

  test('a full tie on food and worst-served goes to the lower index', () => {
    expect(selectSetting([row(7, 100, 0.6), row(3, 100, 0.6)]).index).toBe(3);
  });
});

describe('select rule: no setting reaches 0.5', () => {
  test('infeasible-only table: the mean closest to 0.5 wins, and a tie in closeness goes to more food', () => {
    const table = [
      row(0, 100, 0.3),   // distance 0.20
      row(1, 90, 0.45),   // distance 0.05
      row(2, 200, 0.45),  // distance 0.05, more food: wins the tie
    ];
    expect(selectSetting(table).index).toBe(2);
  });

  test('closeness beats food: 0.48 with 10 kg beats 0.20 with 300 kg', () => {
    expect(selectSetting([row(0, 300, 0.2), row(1, 10, 0.48)]).index).toBe(1);
  });

  test('the full order: closest first, then more food, then lower index', () => {
    const table = [row(0, 100, 0.3), row(1, 90, 0.45), row(2, 200, 0.45), row(3, 50, 0.2)];
    expect(rankSettings(table).map((r) => r.index)).toEqual([2, 1, 0, 3]);
  });
});

describe('select rule guards', () => {
  test('an empty table and a non-finite mean are refused', () => {
    expect(() => rankSettings([])).toThrow('no settings to rank');
    expect(() => rankSettings([row(0, Number.NaN, 0.6)])).toThrow('non-finite');
  });
});

describe('meansOf: the two means over E01-E10', () => {
  const result = (evening: string, split: EveningResult['split'], food: number, worst: number | null): EveningResult => ({
    evening, policy: 'salo', split, foodRescuedKg: food, foodWastedKg: 0, worstNeedMet: worst, strandedAwards: 0,
  });
  const tuningSet = (food: number[], worst: number[]) =>
    TUNING_EVENING_IDS.map((id, i) => result(id, 'tuning', food[i], worst[i]));

  test('food 140..149 averages 144.5; worst 0.2 and 0.8 alternating averages exactly 0.5, which is feasible', () => {
    const m = meansOf(tuningSet([140, 141, 142, 143, 144, 145, 146, 147, 148, 149], [0.2, 0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8, 0.2, 0.8]));
    expect(m.foodKg).toBeCloseTo(144.5, 12);
    expect(m.worstNeedMet).toBeCloseTo(0.5, 12);
    expect(m.feasible).toBe(true);
  });

  test('a null evening (no need that day) is left out of the worst-served mean', () => {
    const worst = [0.6, null, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6];
    const m = meansOf(tuningSet([100, 100, 100, 100, 100, 100, 100, 100, 100, 100], worst as number[]));
    expect(m.worstNeedMet).toBeCloseTo(0.6, 12);
  });

  test('a pilot or main result is refused', () => {
    const rs = tuningSet([100, 100, 100, 100, 100, 100, 100, 100, 100, 100], Array(10).fill(0.6));
    rs[3] = result('E04', 'pilot', 100, 0.6);
    expect(() => meansOf(rs)).toThrow('not a tuning result');
  });
});

describe('the tuning evening guard (only E01-E10, split tuning)', () => {
  test('a tuning evening passes', () => {
    expect(() => assertTuningEvening({ id: 'E01', split: 'tuning' })).not.toThrow();
    expect(() => assertTuningEvening({ id: 'E10', split: 'tuning' })).not.toThrow();
  });

  test('a pilot evening and a main evening are refused', () => {
    expect(() => assertTuningEvening({ id: 'E11', split: 'pilot' })).toThrow('only tuning evenings may be used');
    expect(() => assertTuningEvening({ id: 'E21', split: 'main_sample' })).toThrow('only tuning evenings may be used');
  });

  test('a tuning-labelled evening outside E01-E10 is refused', () => {
    expect(() => assertTuningEvening({ id: 'E11', split: 'tuning' })).toThrow('only E01-E10 may be used');
  });

  test('the list must be exactly E01..E10 in order, nine evenings are refused', () => {
    const ten = TUNING_EVENING_IDS.map((id) => ({ id, split: 'tuning' }));
    expect(() => assertTuningEvenings(ten)).not.toThrow();
    expect(() => assertTuningEvenings(ten.slice(0, 9))).toThrow('exactly E01 E02');
    expect(() => assertTuningEvenings([...ten.slice(0, 9), { id: 'E11', split: 'pilot' }])).toThrow();
  });
});
