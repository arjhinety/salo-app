/// <reference types="jest" />
// RES-02 with the story fixtures (docs/stories.md RES-02). Every expected number is written out by hand.

import type { EveningResult, LogEntry, PantryNeed } from '../../engine/types';
import { cappedMean, eveningMeasures, higherIsBetter, measureValue, median, needMetRatios, resultFromLog } from '../measures';

const need = (pantryId: string, needKg: number): PantryNeed => ({ pantryId, isOpen: true, needKg });

describe('RES-02 fixtures', () => {
  test('food rescued counts 10 kg when need is 10 and 12 kg arrived; the 2 kg extra is wasted', () => {
    const r = eveningMeasures([need('P1', 10)], 12, new Map([['P1', 12]]));
    expect(r.foodRescuedKg).toBe(10);
    expect(r.foodWastedKg).toBe(2);
    expect(r.worstNeedMet).toBe(1);
  });

  test('need met: needs 10, 20, 5 and received 6, 18, 5 give ratios 0.6, 0.9, 1.0; worst 0.6, median 0.9', () => {
    const needs = [need('P1', 10), need('P2', 20), need('P3', 5)];
    const got = new Map([
      ['P1', 6],
      ['P2', 18],
      ['P3', 5],
    ]);
    expect(needMetRatios(needs, got)).toEqual([0.6, 0.9, 1]);
    expect(median(needMetRatios(needs, got))).toBeCloseTo(0.9, 12);
    expect(eveningMeasures(needs, 40, got).worstNeedMet).toBeCloseTo(0.6, 12);
    expect(eveningMeasures(needs, 40, got).foodRescuedKg).toBe(29);
  });

  test('a pantry with zero need is left out of the fairness ratio and adds 0 kg', () => {
    const needs = [need('P1', 10), need('P2', 0)];
    const got = new Map([
      ['P1', 10],
      ['P2', 7],
    ]);
    expect(needMetRatios(needs, got)).toEqual([1]);
    const r = eveningMeasures(needs, 17, got);
    expect(r.foodRescuedKg).toBe(10);
    expect(r.worstNeedMet).toBe(1);
  });

  test('an evening where no pantry needed anything is left out of fairness: worst is null, rescued is 0', () => {
    const r = eveningMeasures([need('P1', 0)], 5, new Map([['P1', 5]]));
    expect(r.worstNeedMet).toBeNull();
    expect(r.foodRescuedKg).toBe(0);
    expect(r.foodWastedKg).toBe(5);
  });

  test('evening capping: evenings at 1.4 and 0.0 average 0.5 after capping, not 0.7', () => {
    expect(cappedMean([1.4, 0.0])).toBeCloseTo(0.5, 12);
    expect(cappedMean([1.4, 0.0])).not.toBeCloseTo(0.7, 6);
  });

  test('evening capping leaves out evenings with no value (null) and averages the rest', () => {
    expect(cappedMean([1.4, null, 0.0])).toBeCloseTo(0.5, 12);
    expect(cappedMean([null])).toBeNull();
  });

  test('food wasted is posted kg minus food rescued: 40 posted, 29 rescued, 11 wasted', () => {
    const needs = [need('P1', 10), need('P2', 20), need('P3', 5)];
    const got = new Map([
      ['P1', 6],
      ['P2', 18],
      ['P3', 5],
    ]);
    expect(eveningMeasures(needs, 40, got).foodWastedKg).toBe(11);
  });

  test('stranded awards in a log: awarded lots with no DELIVERY (a late delivery is still a delivery, and not on time)', () => {
    const needs = [need('P1', 10), need('P2', 20), need('P3', 5)];
    const log: LogEntry[] = [
      award(1, 'L1', 'P1'),
      award(2, 'L2', 'P2'),
      award(3, 'L3', 'P3'),
      delivery(4, 'L1', 'P1', 12, true),
      delivery(5, 'L3', 'P3', 5, false),
    ];
    const r = resultFromLog(log, needs, 25, 'E01', 'salo', 'tuning');
    // L1 on time, 12 kg to P1 (need 10): 10 kg rescued. L3 late: not on time, so 0 kg. L2 never delivered: stranded.
    expect(r.foodRescuedKg).toBe(10);
    expect(r.worstNeedMet).toBe(0);
    expect(r.foodWastedKg).toBe(15);
    expect(r.strandedAwards).toBe(1);
  });

  test('an awarded lot with no delivery counts as stranded, even if no driver ever committed', () => {
    const log: LogEntry[] = [award(1, 'L9', 'P1')];
    const r = resultFromLog(log, [need('P1', 10)], 8, 'E01', 'fcfs', 'tuning');
    expect(r.strandedAwards).toBe(1);
    expect(r.foodRescuedKg).toBe(0);
  });
});

describe('measure helpers', () => {
  const base: EveningResult = {
    evening: 'E21',
    policy: 'salo',
    split: 'main_sample',
    foodRescuedKg: 29,
    foodWastedKg: 11,
    worstNeedMet: 0.6,
    strandedAwards: 2,
  };

  test('measureValue reads the field of each measure', () => {
    expect(measureValue(base, 'foodRescued')).toBe(29);
    expect(measureValue(base, 'foodWasted')).toBe(11);
    expect(measureValue(base, 'needMet')).toBe(0.6);
    expect(measureValue(base, 'stranded')).toBe(2);
  });

  test('higher is better for food rescued and need met only', () => {
    expect(higherIsBetter('foodRescued')).toBe(true);
    expect(higherIsBetter('needMet')).toBe(true);
    expect(higherIsBetter('foodWasted')).toBe(false);
    expect(higherIsBetter('stranded')).toBe(false);
  });

  test('median of an even count is the mean of the two middle values', () => {
    expect(median([1, 4, 2, 3])).toBe(2.5);
  });
});

function award(seq: number, lotId: string, pantryId: string): LogEntry {
  return {
    seq,
    evening: 'E01',
    policy: 'salo',
    atMinute: 1000 + seq,
    event: {
      type: 'MESSAGE',
      message: { type: 'TENTATIVE_ACCEPT', lotId, atMinute: 1000 + seq, donorId: 'D01', pantryId, shares: 5 },
    },
  };
}

function delivery(seq: number, lotId: string, pantryId: string, kg: number, onTime: boolean): LogEntry {
  return {
    seq,
    evening: 'E01',
    policy: 'salo',
    atMinute: 1100 + seq,
    event: { type: 'DELIVERY', lotId, pantryId, driverId: 'DR1', kg, onTime, minutesLate: onTime ? 0 : 9 },
  };
}
