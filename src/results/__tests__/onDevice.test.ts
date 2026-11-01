/// <reference types="jest" />
// The on-device path (RES-01): the same runs, folds and comparison table as the runner, driven one run at a time with
// turns of the event loop. Checked against the stored record (a test fixture, docs/reports/m6-main/record.json) on all 44
// main evenings, byte for byte, and on small subsets for the rest (progress, yields, cancel, gate, sensitivity).
// The full run is real engine work: it takes tens of seconds in jest. Its time is printed.
import { EVENINGS } from '../../data/dataset';
import { FROZEN_PARAMS } from '../../engine/frozenParams';
import { UNTUNED_PARAMS } from '../../engine/params';
import type { Evening } from '../../engine/types';
import { postedCeilingCounts } from '../learning';
import { keepForSession, RunCancelledError, runOnDevice, sessionResults, type RunProgress } from '../onDevice';
import { REGISTRATION, ResultsGateError, type Registration } from '../registration';
import { mainEvenings, runLearningComparison, runMainResults } from '../runner';
import { loadRecord } from './recordFixture';

const MAIN = mainEvenings(EVENINGS);
const beforePilot: Registration = { ...REGISTRATION, pilotDone: false, mainEveningCount: null };
/** A subset of the main evenings with a registration of its own count. The gate checks the count against the evenings given. */
const subset = (n: number, resamples = 1000): { reg: Registration; evenings: Evening[] } => ({
  reg: { ...REGISTRATION, mainEveningCount: n, resamples },
  evenings: MAIN.slice(0, n),
});

/** Turns of the event loop, counted. The real yield is a zero-millisecond timer. */
function countingYield() {
  const state = { turns: 0 };
  const yieldTurn = async () => {
    state.turns++;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  };
  return { state, yieldTurn };
}

describe('the on-device path reproduces the stored record (all 44 main evenings)', () => {
  test('main, learning off and the ceiling counts are identical to the record, byte for byte', async () => {
    const record = loadRecord();
    const started = Date.now();
    const out = await runOnDevice({ params: FROZEN_PARAMS });
    const seconds = (Date.now() - started) / 1000;
    process.stdout.write(`on-device path, 44 main evenings (E21-E64), jest: ${seconds.toFixed(1)} s\n`);

    expect(JSON.stringify(out.main)).toBe(JSON.stringify(record.main));
    expect(JSON.stringify(out.learning)).toBe(JSON.stringify(record.learning));
    expect(out.postedCeilings).toEqual(postedCeilingCounts(record.main.perEvening, MAIN));
    expect(out.main.verdict).toBe(record.main.verdict);
  }, 10 * 60 * 1000);
});

describe('the on-device path matches the synchronous runner on a subset (same numbers, scheduled differently)', () => {
  test('main and learning are identical to runMainResults and runLearningComparison', async () => {
    const { reg, evenings } = subset(3);
    const out = await runOnDevice({ params: FROZEN_PARAMS, registration: reg, evenings });
    const sync = runMainResults({ params: FROZEN_PARAMS, registration: reg, evenings });
    const syncLearning = runLearningComparison({ params: FROZEN_PARAMS, registration: reg, evenings });
    expect(JSON.stringify(out.main)).toBe(JSON.stringify(sync));
    expect(JSON.stringify(out.learning)).toBe(JSON.stringify(syncLearning));
  }, 120000);

  test('the chunked bootstrap is not a different bootstrap: 10,000 resamples on the subset give the same intervals', async () => {
    const { reg, evenings } = subset(2, 10000);
    const out = await runOnDevice({ params: FROZEN_PARAMS, registration: reg, evenings, yieldTurn: async () => {} });
    const sync = runMainResults({ params: FROZEN_PARAMS, registration: reg, evenings });
    expect(JSON.stringify(out.main.comparisons)).toBe(JSON.stringify(sync.comparisons));
  }, 120000);
});

describe('the run yields to the event loop and reports progress', () => {
  test('one turn before each engine run (4 policies x learning on and off, per evening), and progress in order', async () => {
    const { reg, evenings } = subset(3);
    const { state, yieldTurn } = countingYield();
    const progress: RunProgress[] = [];
    await runOnDevice({ params: FROZEN_PARAMS, registration: reg, evenings, yieldTurn, onProgress: (p) => progress.push(p) });
    // 3 evenings x 8 runs = 24 turns before the runs, plus turns inside the bootstrap (chunks of 250 resamples).
    expect(state.turns).toBeGreaterThanOrEqual(24);
    expect(progress).toEqual([
      { phase: 'evenings', done: 1, total: 3 },
      { phase: 'evenings', done: 2, total: 3 },
      { phase: 'evenings', done: 3, total: 3 },
      { phase: 'intervals', done: 3, total: 3 },
    ]);
  }, 120000);
});

describe('cancel (leaving the screen) stops the run and keeps nothing', () => {
  test('cancelled after the second evening starts: rejects with RunCancelledError and no third evening is reported', async () => {
    const { reg, evenings } = subset(3);
    let cancelled = false;
    const seen: number[] = [];
    const run = runOnDevice({
      params: FROZEN_PARAMS,
      registration: reg,
      evenings,
      isCancelled: () => cancelled,
      onProgress: (p) => {
        seen.push(p.done);
        if (p.done === 2) cancelled = true;
      },
    });
    await expect(run).rejects.toBeInstanceOf(RunCancelledError);
    expect(seen).toEqual([1, 2]);
  }, 120000);

  test('cancelled before the first run: rejects, and the session keeps nothing', async () => {
    const { reg, evenings } = subset(2);
    keepForSession(null);
    await expect(runOnDevice({ params: FROZEN_PARAMS, registration: reg, evenings, isCancelled: () => true })).rejects.toBeInstanceOf(
      RunCancelledError,
    );
    expect(sessionResults()).toBeNull();
  }, 120000);
});

describe('the gate is checked before any evening runs (the same check as the runner)', () => {
  test('untuned parameters: rejects with ResultsGateError, and no progress is reported', async () => {
    const seen: RunProgress[] = [];
    await expect(runOnDevice({ params: UNTUNED_PARAMS, onProgress: (p) => seen.push(p) })).rejects.toBeInstanceOf(ResultsGateError);
    expect(seen).toEqual([]);
  });

  test('the pilot not recorded: rejects with the reason, and no progress is reported', async () => {
    const seen: RunProgress[] = [];
    await expect(runOnDevice({ params: FROZEN_PARAMS, registration: beforePilot, onProgress: (p) => seen.push(p) })).rejects.toThrow(
      /the pilot has not run/,
    );
    expect(seen).toEqual([]);
  });

  test('a pilot or tuning evening is refused before any run', async () => {
    const pilot = { ...MAIN[0], id: 'E11', split: 'pilot' as const };
    await expect(runOnDevice({ params: FROZEN_PARAMS, registration: { ...REGISTRATION, mainEveningCount: 1 }, evenings: [pilot] })).rejects.toThrow(
      'Only main_sample evenings are reported.',
    );
  });
});

describe('RES-01 sensitivity on the device path: change the seed or one pantry\'s need and the numbers change', () => {
  test('changing one evening\'s seed changes that evening\'s runs and the cells', async () => {
    const { reg, evenings } = subset(2);
    const base = await runOnDevice({ params: FROZEN_PARAMS, registration: reg, evenings });
    const changed = [{ ...evenings[0], seed: evenings[0].seed + 1 }, evenings[1]];
    const out = await runOnDevice({ params: FROZEN_PARAMS, registration: reg, evenings: changed });
    expect(out.main.perEvening.salo[0]).not.toEqual(base.main.perEvening.salo[0]);
    expect(JSON.stringify(out.main.cells)).not.toBe(JSON.stringify(base.main.cells));
  }, 120000);

  test('halving one pantry\'s need on one evening changes that evening\'s results and the cells', async () => {
    const { reg, evenings } = subset(2);
    const base = await runOnDevice({ params: FROZEN_PARAMS, registration: reg, evenings });
    const first = evenings[0];
    const pantry = [...first.needs].sort((a, b) => b.needKg - a.needKg)[0];
    const needs = first.needs.map((n) => (n.pantryId === pantry.pantryId ? { ...n, needKg: n.needKg / 2 } : n));
    const out = await runOnDevice({ params: FROZEN_PARAMS, registration: reg, evenings: [{ ...first, needs }, evenings[1]] });
    expect(JSON.stringify(out.main.perEvening)).not.toBe(JSON.stringify(base.main.perEvening));
    expect(JSON.stringify(out.main.cells)).not.toBe(JSON.stringify(base.main.cells));
  }, 120000);

  test('changing the bootstrap seed changes the intervals but not the runs (8 evenings: with 2 the bounds are discrete)', async () => {
    const { reg, evenings } = subset(8);
    const base = await runOnDevice({ params: FROZEN_PARAMS, registration: reg, evenings });
    const out = await runOnDevice({ params: FROZEN_PARAMS, registration: { ...reg, seed: reg.seed + 1 }, evenings });
    expect(out.main.perEvening).toEqual(base.main.perEvening);
    expect(JSON.stringify(out.main.comparisons)).not.toBe(JSON.stringify(base.main.comparisons));
  }, 120000);
});

describe('the session keeps the results in memory only', () => {
  test('keepForSession holds the last run, and a null clears it', () => {
    keepForSession(null);
    expect(sessionResults()).toBeNull();
    const record = loadRecord();
    const fake = { main: record.main, learning: record.learning, postedCeilings: { salo: 0, fcfs: 0, nearest: 0, central_greedy: 0 } };
    keepForSession(fake);
    expect(sessionResults()).toBe(fake);
    keepForSession(null);
    expect(sessionResults()).toBeNull();
  });

});
