/// <reference types="jest" />
// RES-07: the supporting checks, as functions only. No engine run.

import type { Evening, EveningResult, PolicyId } from '../../engine/types';
import { ceilingCounts, learningComparison, reachedFoodCeiling } from '../learning';
import { REGISTRATION, ResultsGateError, type Registration } from '../registration';

// The record before the pilot: nothing recorded (a synthetic closed record).
const beforePilot: Registration = { ...REGISTRATION, pilotDone: false, mainEveningCount: null };

// A record with every condition filled in: the functions run only when the record is complete.
const openRecord: Registration = { ...REGISTRATION, mainEveningCount: 10, pilotDone: true, frozenParamsChecksum: 'fnv1a32:00000002' };

const r = (evening: string, policy: PolicyId, rescued: number): EveningResult => ({
  evening,
  policy,
  split: 'main_sample',
  foodRescuedKg: rescued,
  foodWastedKg: 0,
  worstNeedMet: 1,
  strandedAwards: 0,
});

const evening = (id: string, needs: number[]): Evening => ({
  id,
  seed: 1,
  split: 'main_sample',
  date: '2026-10-01',
  needs: needs.map((needKg, i) => ({ pantryId: `P${i}`, isOpen: true, needKg })),
  lots: [],
});

describe('reachedFoodCeiling (assumption: every pantry fully met)', () => {
  const needs = [{ pantryId: 'P1', isOpen: true, needKg: 10 }, { pantryId: 'P2', isOpen: true, needKg: 20 }];

  test('reached when rescued equals total need (30 kg)', () => {
    expect(reachedFoodCeiling(r('E21', 'salo', 30), needs)).toBe(true);
  });

  test('not reached at 29.5 kg', () => {
    expect(reachedFoodCeiling(r('E21', 'salo', 29.5), needs)).toBe(false);
  });

  test('an evening with no need at all is never at the ceiling', () => {
    expect(reachedFoodCeiling(r('E21', 'salo', 0), [{ pantryId: 'P1', isOpen: true, needKg: 0 }])).toBe(false);
  });
});

describe('ceilingCounts', () => {
  test('counts the evenings at the ceiling for each policy (needs 10 + 20 = 30 kg)', () => {
    const evenings = [evening('E21', [10, 20]), evening('E22', [10, 20]), evening('E23', [10, 20])];
    const runs = {
      salo: [r('E21', 'salo', 30), r('E22', 'salo', 30), r('E23', 'salo', 25)],
      fcfs: [r('E21', 'fcfs', 28), r('E22', 'fcfs', 27), r('E23', 'fcfs', 26)],
      nearest: [r('E21', 'nearest', 30), r('E22', 'nearest', 29), r('E23', 'nearest', 29)],
      central_greedy: [r('E21', 'central_greedy', 30), r('E22', 'central_greedy', 30), r('E23', 'central_greedy', 30)],
    };
    expect(ceilingCounts(runs, evenings, openRecord)).toEqual({ salo: 2, fcfs: 0, nearest: 1, central_greedy: 3 });
  });

  test('refuses while the record is closed (RES-07 is gated too)', () => {
    const evenings = [evening('E21', [10, 20])];
    const runs = { salo: [r('E21', 'salo', 30)], fcfs: [r('E21', 'fcfs', 1)], nearest: [r('E21', 'nearest', 1)], central_greedy: [r('E21', 'central_greedy', 1)] };
    expect(() => ceilingCounts(runs, evenings, beforePilot)).toThrow(ResultsGateError);
  });
});

describe('learningComparison (supporting, 95%)', () => {
  test('learning on is above learning off on every evening: "learning helps"', () => {
    const on = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((x, i) => r(`E${21 + i}`, 'salo', x));
    const off = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4].map((x, i) => r(`E${21 + i}`, 'salo', x));
    const c = learningComparison(on, off, openRecord);
    expect(c.level).toBe(0.95);
    expect(c.evenings).toBe(10);
    expect(c.reading).toBe('learning_helps');
    expect(c.mean).toBeCloseTo(5.5, 9);
  });

  test('mixed differences that straddle zero: "no clear difference"', () => {
    const on = [1, -1, 2, -2, 1, -1, 2, -2, 1, -1].map((x, i) => r(`E${21 + i}`, 'salo', 10 + x));
    const off = Array.from({ length: 10 }, (_, i) => r(`E${21 + i}`, 'salo', 10));
    expect(learningComparison(on, off, openRecord).reading).toBe('no_clear_difference');
  });

  test('refuses while the record is closed', () => {
    expect(() => learningComparison([r('E21', 'salo', 1)], [r('E21', 'salo', 1)], beforePilot)).toThrow(ResultsGateError);
  });

  test('runs on different evenings are refused', () => {
    expect(() => learningComparison([r('E21', 'salo', 1)], [r('E22', 'salo', 1)], openRecord)).toThrow('evening order differs');
  });
});
