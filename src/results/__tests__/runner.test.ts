/// <reference types="jest" />
// The Results runner (RES-01, RES-03, RES-06). runEvening is mocked everywhere: no evening is run in this file.
// Gate-closed tests assert that runEvening is never called. Gate-open tests use synthetic evenings and synthetic results.


import { EVENINGS } from '../../data/dataset';
import { FROZEN_PARAMS } from '../../engine/frozenParams';
import { UNTUNED_PARAMS } from '../../engine/params';
import { POLICY_IDS } from '../../engine/policies';
import { runEvening } from '../../engine/simulate';
import type { Evening, EveningResult, FrozenParams, PolicyId } from '../../engine/types';
import { checksumParams, type Registration, REGISTRATION } from '../registration';
import { mainEvenings, ResultsGateError, runLearningComparison, runMainResults, summarize } from '../runner';

jest.mock('../../engine/simulate', () => ({ runEvening: jest.fn() }));

const mockedRun = runEvening as unknown as jest.Mock;

const tuned: FrozenParams = {
  schema: 1,
  frozenOn: 'synthetic test parameters',
  tuningEvenings: [],
  salo: {
    utilityWeights: { need: 0.5, storage: 0.2, distance: 0.15, freshness: 0.15 },
    shareBudgetPerEvening: 40,
    shareBid: { kind: 'linear', scale: 17 },
  },
  centralGreedy: { utilityWeights: { need: 0.5, storage: 0.2, distance: 0.15, freshness: 0.15 }, transportPenaltyPerMinute: 0.005 },
};

const openReg = (count: number): Registration => ({
  mainEveningCount: count,
  pilotDone: true,
  frozenParamsChecksum: checksumParams(tuned),
  resamples: 10000,
  seed: 20260927,
});

const synthetic = (ids: string[], split: Evening['split'] = 'main_sample'): Evening[] =>
  ids.map((id, i) => ({
    id,
    seed: 100 + i,
    split,
    date: '2026-10-01',
    needs: [{ pantryId: 'P1', isOpen: true, needKg: 10 }],
    lots: [],
  }));

/** A fixed synthetic result per policy: salo rescues 10 kg, central greedy 9, the others 8, and so on. */
function fakeResult(evening: string, policy: PolicyId): EveningResult {
  const rescued = { salo: 10, central_greedy: 9, fcfs: 8, nearest: 8.5 }[policy];
  const met = { salo: 0.8, central_greedy: 0.6, fcfs: 0.5, nearest: 0.7 }[policy];
  return { evening, policy, split: 'main_sample', foodRescuedKg: rescued, foodWastedKg: 20 - rescued, worstNeedMet: met, strandedAwards: 1 };
}

beforeEach(() => {
  mockedRun.mockReset();
});

/** The record before the pilot: nothing recorded (a synthetic closed record; the real one is recorded now). */
const beforePilot: Registration = { ...REGISTRATION, pilotDone: false, mainEveningCount: null };

describe('the gate is closed before the pilot is recorded (RES-03, RES-06), with a synthetic closed record', () => {
  test('the untuned parameters: throws, and runEvening is never called', () => {
    expect(() => runMainResults({ params: UNTUNED_PARAMS, registration: beforePilot })).toThrow(ResultsGateError);
    expect(mockedRun).not.toHaveBeenCalled();
  });

  test('tuned-looking parameters with the record still closed: throws, and runEvening is never called', () => {
    expect(() => runMainResults({ params: tuned, registration: beforePilot })).toThrow(ResultsGateError);
    expect(mockedRun).not.toHaveBeenCalled();
  });

  test('the error says which conditions are missing', () => {
    expect(() => runMainResults({ params: UNTUNED_PARAMS, registration: beforePilot })).toThrow(/the pilot has not run/);
  });

  test('the default evenings are exactly E21 to E30, and no tuning or pilot evening is selected', () => {
    const ids = mainEvenings(EVENINGS).map((e) => e.id);
    expect(ids).toEqual(['E21', 'E22', 'E23', 'E24', 'E25', 'E26', 'E27', 'E28', 'E29', 'E30']);
    expect(mainEvenings(EVENINGS).every((e) => e.split === 'main_sample')).toBe(true);
    expect(mockedRun).not.toHaveBeenCalled();
  });
});

describe('the gate can open only with a complete record (checked with synthetic data)', () => {
  // The gate-open tests call the runner with a registration object of their own. They do not touch REGISTRATION.

  test('a record with the pilot, the count and the checksum, but untuned parameters: throws, no run', () => {
    const reg = { ...openReg(2), frozenParamsChecksum: 'fnv1a32:00000000' };
    expect(() => runMainResults({ params: UNTUNED_PARAMS, registration: reg, evenings: synthetic(['M1', 'M2']) })).toThrow(
      ResultsGateError,
    );
    expect(mockedRun).not.toHaveBeenCalled();
  });

  test('a recorded count that differs from the evenings given: throws, no run', () => {
    expect(() => runMainResults({ params: tuned, registration: openReg(3), evenings: synthetic(['M1', 'M2']) })).toThrow(
      /recorded count is 3/,
    );
    expect(mockedRun).not.toHaveBeenCalled();
  });

  test('a pilot or tuning evening can never be given to the runner: throws, no run', () => {
    expect(() =>
      runMainResults({ params: tuned, registration: openReg(1), evenings: synthetic(['P1'], 'pilot') }),
    ).toThrow('Only main_sample evenings are reported.');
    expect(mockedRun).not.toHaveBeenCalled();
  });
});

describe('with an open gate, the runner runs each policy on the main evenings only', () => {
  test('four policies x two evenings = eight runs, all main_sample; the summary has twelve comparisons', () => {
    mockedRun.mockImplementation((_wx: unknown, e: Evening, opts: { policy: PolicyId }) => ({
      result: fakeResult(e.id, opts.policy),
    }));
    const evenings = synthetic(['M1', 'M2']);
    const out = runMainResults({ params: tuned, registration: openReg(2), evenings });

    expect(mockedRun).toHaveBeenCalledTimes(8);
    for (const call of mockedRun.mock.calls) {
      expect(call[1].split).toBe('main_sample');
      expect(POLICY_IDS).toContain(call[2].policy);
    }
    expect(out.evenings).toEqual(['M1', 'M2']);
    expect(out.comparisons).toHaveLength(12);
    // Food rescued: salo 10 vs central greedy 9, every evening, so the interval is [1, 1] and Salo is clearly ahead.
    // Need met: salo 0.8 vs central greedy 0.6, so [0.2, 0.2], also clearly ahead.
    expect(out.verdict).toBe('salo_better');
    const food = out.comparisons.find((c) => c.main && c.measure === 'foodRescued')!;
    expect(food.mean).toBeCloseTo(1, 12);
    expect(food.low).toBeCloseTo(1, 12);
    expect(food.high).toBeCloseTo(1, 12);
    expect(food.reading).toBe('salo_better');
  });
});

describe('summarize (no engine call)', () => {
  test('per-evening means and need-met means that skip missing values', () => {
    const salo: EveningResult[] = [
      { ...fakeResult('M1', 'salo'), worstNeedMet: 0.6 },
      { ...fakeResult('M2', 'salo'), worstNeedMet: null },
    ];
    const cg = [fakeResult('M1', 'central_greedy'), fakeResult('M2', 'central_greedy')];
    const runs = {
      salo,
      fcfs: [fakeResult('M1', 'fcfs'), fakeResult('M2', 'fcfs')],
      nearest: [fakeResult('M1', 'nearest'), fakeResult('M2', 'nearest')],
      central_greedy: cg,
    } as Record<PolicyId, EveningResult[]>;
    const out = summarize(runs, { resamples: 50, seed: 20260927 } as Pick<Registration, 'resamples' | 'seed'>);
    expect(out.cells.salo.foodRescued).toBe(10);
    expect(out.cells.salo.stranded).toBe(1);
    expect(out.cells.salo.needMet).toBeCloseTo(0.6, 12);
    expect(out.cells.central_greedy.needMet).toBeCloseTo(0.6, 12);
  });

});

describe('the recorded state (pilot done, count 44): the runner still refuses the real main evenings', () => {
  test('the real record and the frozen parameters: the gate checks pass, but 44 is not the 10 evenings given, so it throws before any run', () => {
    expect(REGISTRATION).toMatchObject({ pilotDone: true, mainEveningCount: 44 });
    expect(() => runMainResults({ params: FROZEN_PARAMS })).toThrow('The recorded count is 44 but 10 evenings were given.');
    expect(mockedRun).not.toHaveBeenCalled();
  });

  test('the real record with the untuned parameters: throws on the parameters, no run', () => {
    expect(() => runMainResults({ params: UNTUNED_PARAMS })).toThrow(/the parameters are untuned/);
    expect(mockedRun).not.toHaveBeenCalled();
  });
});

describe('the learning-off comparison (RES-07) goes through the same gate', () => {
  test('gate closed (synthetic record before the pilot, untuned parameters): throws, and runEvening is never called', () => {
    expect(() => runLearningComparison({ params: UNTUNED_PARAMS, registration: beforePilot })).toThrow(ResultsGateError);
    expect(() => runLearningComparison({ params: tuned, registration: beforePilot })).toThrow(/the pilot has not run/);
    expect(() => runLearningComparison({ params: FROZEN_PARAMS })).toThrow('The recorded count is 44 but 10 evenings were given.');
    expect(mockedRun).not.toHaveBeenCalled();
  });

  test('a count that differs from the evenings given: throws, and runEvening is never called', () => {
    expect(() => runLearningComparison({ params: tuned, registration: openReg(3), evenings: synthetic(['M1', 'M2']) })).toThrow(
      /recorded count is 3/,
    );
    expect(mockedRun).not.toHaveBeenCalled();
  });

  test('a pilot evening is refused before any run', () => {
    expect(() =>
      runLearningComparison({ params: tuned, registration: openReg(1), evenings: synthetic(['P1'], 'pilot') }),
    ).toThrow('Only main_sample evenings are reported.');
    expect(mockedRun).not.toHaveBeenCalled();
  });

  test('gate open (synthetic): each policy runs twice per evening, learning on and off, and the pairs are compared', () => {
    // Learning off rescues 2 kg less per evening for salo, and the same food for the other policies.
    mockedRun.mockImplementation((_wx: unknown, e: Evening, opts: { policy: PolicyId; learning?: boolean }) => {
      const r = fakeResult(e.id, opts.policy);
      if (opts.learning === false && opts.policy === 'salo') return { result: { ...r, foodRescuedKg: 8 } };
      return { result: r };
    });
    const out = runLearningComparison({ params: tuned, registration: openReg(2), evenings: synthetic(['M1', 'M2']) });

    expect(mockedRun).toHaveBeenCalledTimes(16);
    expect(mockedRun.mock.calls.filter((c) => c[2].learning === true)).toHaveLength(8);
    expect(mockedRun.mock.calls.filter((c) => c[2].learning === false)).toHaveLength(8);
    // Salo: learning on minus off is 10 - 8 = 2 kg on each of the two evenings, so the interval is [2, 2] and learning helps.
    expect(out.salo.evenings).toBe(2);
    expect(out.salo.mean).toBeCloseTo(2, 12);
    expect(out.salo.reading).toBe('learning_helps');
    // The other policies: no difference, so the interval touches zero.
    expect(out.central_greedy.mean).toBeCloseTo(0, 12);
    expect(out.central_greedy.reading).toBe('no_clear_difference');
    expect(out.salo.level).toBe(0.95);
  });
});
