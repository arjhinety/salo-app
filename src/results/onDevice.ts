import { WORLD } from '../data/dataset';
import { quantileSorted } from '../engine/metrics';
import { POLICY_IDS } from '../engine/policies';
import { intBelow, STREAM } from '../engine/rng';
import { runEvening } from '../engine/simulate';
import type { Evening, EveningResult, FrozenParams, PolicyId } from '../engine/types';
import { indexWorld } from '../engine/world';
import { COMPARISONS, pairedDiffs, readingOf, type Comparison } from './intervals';
import { postedCeilingCounts, type LearningComparison } from './learning';
import { foldResults, openGate, type GateInput, type MainResults } from './runner';
import { requireRecordOpen, type Registration } from './registration';

/**
 * The Results screen's run (RES-01): the four policies on the main evenings, with learning on (main) and off (supporting),
 * computed on the device. The same gate, engine calls, fold and comparison table as runner.ts (runMainResults and
 * runLearningComparison); what differs is the scheduling. Evenings run one policy at a time and the event loop gets a turn
 * before each run, and the bootstrap runs in chunks of resamples, so the screen stays responsive. A test checks that the
 * numbers are identical to the synchronous runner's (src/results/__tests__/onDevice.test.ts).
 *
 * Results are kept in memory for the session only (keepForSession). Nothing is stored in the build.
 */

/** Resamples per chunk of the bootstrap. Each chunk ends with a turn of the event loop. */
const CHUNK_RESAMPLES = 250;

export interface OnDeviceResults {
  /** The two main results and the ten supporting comparisons, with the per-evening runs they came from. */
  main: MainResults;
  /** Supporting (RES-07): learning on minus off, per policy. */
  learning: Record<PolicyId, LearningComparison>;
  /** Supporting (RES-07, second definition): evenings where all posted food was rescued, per policy. */
  postedCeilings: Record<PolicyId, number>;
}

export interface RunProgress {
  /** 'evenings': evening `done` of `total` is running. 'intervals': every evening is done, the intervals are worked out. */
  phase: 'evenings' | 'intervals';
  done: number;
  total: number;
}

export interface OnDeviceOptions extends GateInput {
  params: FrozenParams;
  onProgress?: (p: RunProgress) => void;
  /** Checked at every step. True stops the run before the next step (RunCancelledError). */
  isCancelled?: () => boolean;
  /** Gives the event loop a turn. Defaults to a zero-millisecond timer. */
  yieldTurn?: () => Promise<void>;
}

/** Thrown when the run is cancelled. Nothing is kept. */
export class RunCancelledError extends Error {
  constructor() {
    super('the run was cancelled');
    this.name = 'RunCancelledError';
  }
}

const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

type Tick = () => Promise<void>;

/** The bootstrap resamples for n evenings: the same rows as engine/metrics bootstrapIndices, built in chunks. */
async function indicesChunked(
  n: number,
  resamples: number,
  seed: number,
  cache: Map<number, number[][]>,
  tick: Tick,
): Promise<number[][]> {
  const known = cache.get(n);
  if (known) return known;
  const rows: number[][] = [];
  for (let r = 0; r < resamples; r++) {
    const row: number[] = [];
    for (let i = 0; i < n; i++) row.push(intBelow(n, seed, STREAM.bootstrap, r, i));
    rows.push(row);
    if (r % CHUNK_RESAMPLES === CHUNK_RESAMPLES - 1) await tick();
  }
  cache.set(n, rows);
  return rows;
}

/** The paired percentile interval of engine/metrics pairedInterval, with the resample means computed in chunks. */
async function pairedIntervalChunked(
  diffs: readonly number[],
  indices: readonly (readonly number[])[],
  level: number,
  tick: Tick,
): Promise<{ mean: number; low: number; high: number }> {
  const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  const means: number[] = [];
  for (let k = 0; k < indices.length; k++) {
    const row = indices[k];
    means.push(row.reduce((s, i) => s + diffs[i], 0) / row.length);
    if (k % CHUNK_RESAMPLES === CHUNK_RESAMPLES - 1) await tick();
  }
  means.sort((a, b) => a - b);
  const a = (1 - level) / 2;
  return { mean, low: quantileSorted(means, a), high: quantileSorted(means, 1 - a) };
}

/** The twelve comparisons of runner.ts compareAll, in the same order and with the same arithmetic. */
async function compareAllChunked(
  runs: Record<PolicyId, readonly EveningResult[]>,
  reg: Pick<Registration, 'resamples' | 'seed'>,
  cache: Map<number, number[][]>,
  tick: Tick,
): Promise<Comparison[]> {
  const out: Comparison[] = [];
  for (const spec of COMPARISONS) {
    const diffs = pairedDiffs(runs.salo, runs[spec.baseline], spec.measure);
    if (diffs.length === 0) throw new Error(`no evenings to compare for ${spec.measure} vs ${spec.baseline}`);
    const indices = await indicesChunked(diffs.length, reg.resamples, reg.seed, cache, tick);
    const { mean, low, high } = await pairedIntervalChunked(diffs, indices, spec.level, tick);
    out.push({ ...spec, evenings: diffs.length, mean, low, high, reading: readingOf(spec.measure, low, high) });
  }
  return out;
}

/** The learning-off comparison of learning.ts learningComparison, chunked. */
async function learningChunked(
  on: readonly EveningResult[],
  off: readonly EveningResult[],
  reg: Registration,
  cache: Map<number, number[][]>,
  tick: Tick,
): Promise<LearningComparison> {
  requireRecordOpen(reg);
  const diffs = pairedDiffs(on, off, 'foodRescued');
  if (diffs.length === 0) throw new Error('no evenings to compare');
  const indices = await indicesChunked(diffs.length, reg.resamples, reg.seed, cache, tick);
  const { mean, low, high } = await pairedIntervalChunked(diffs, indices, 0.95, tick);
  const r = readingOf('foodRescued', low, high);
  const reading = r === 'salo_better' ? 'learning_helps' : r === 'baseline_better' ? 'learning_hurts' : 'no_clear_difference';
  return { evenings: diffs.length, mean, low, high, level: 0.95, reading, offFoodKg: off.map((x) => x.foodRescuedKg) };
}

const emptyRuns = (): Record<PolicyId, EveningResult[]> => ({ salo: [], fcfs: [], nearest: [], central_greedy: [] });

/**
 * Runs the main evenings on the device. Refuses (throws ResultsGateError, before any evening runs) unless the gate is open
 * (openGate, the runner's own check). Throws RunCancelledError when isCancelled() is true at a step.
 */
export async function runOnDevice(opts: OnDeviceOptions): Promise<OnDeviceResults> {
  const { reg, evenings } = openGate(opts);
  const yieldTurn = opts.yieldTurn ?? yieldToEventLoop;
  const cancelled = opts.isCancelled ?? (() => false);
  const tick: Tick = async () => {
    await yieldTurn();
    if (cancelled()) throw new RunCancelledError();
  };

  const wx = indexWorld(WORLD);
  const on = emptyRuns();
  const off = emptyRuns();
  for (let i = 0; i < evenings.length; i++) {
    const evening: Evening = evenings[i];
    opts.onProgress?.({ phase: 'evenings', done: i + 1, total: evenings.length });
    for (const learning of [true, false]) {
      for (const policy of POLICY_IDS) {
        await tick();
        const result = runEvening(wx, evening, { policy, params: opts.params, learning }).result;
        (learning ? on : off)[policy].push(result);
      }
    }
  }

  opts.onProgress?.({ phase: 'intervals', done: evenings.length, total: evenings.length });
  await tick();
  const cache = new Map<number, number[][]>();
  const main = foldResults(on, await compareAllChunked(on, reg, cache, tick));
  const learning = {} as Record<PolicyId, LearningComparison>;
  for (const p of POLICY_IDS) learning[p] = await learningChunked(on[p], off[p], reg, cache, tick);
  const postedCeilings = postedCeilingCounts(on, evenings, reg);
  return { main, learning, postedCeilings };
}

// In-memory only: the results of this session (the app process). Lost when the app is closed.
let session: OnDeviceResults | null = null;

export function sessionResults(): OnDeviceResults | null {
  return session;
}

export function keepForSession(results: OnDeviceResults | null): void {
  session = results;
}
