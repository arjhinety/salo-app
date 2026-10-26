import { bootstrapIndices, pairedInterval } from '../engine/metrics';
import type { EveningResult, PolicyId } from '../engine/types';
import { higherIsBetter, measureValue, MEASURES, type MeasureId } from './measures';
import { BOOTSTRAP_SEED, RESAMPLES } from './registration';

export type Baseline = Exclude<PolicyId, 'salo'>;
export const BASELINES: readonly Baseline[] = ['fcfs', 'nearest', 'central_greedy'];

export type Reading = 'salo_better' | 'baseline_better' | 'no_clear_difference';

export interface PairSpec {
  measure: MeasureId;
  baseline: Baseline;
  /** The two main results (RES-03): 97.5%. The other ten are supporting: 95%. */
  main: boolean;
  level: 0.975 | 0.95;
}

/** The two main results, fixed before any run: Salo minus central greedy on food rescued and on need met. */
const MAIN: readonly PairSpec[] = [
  { measure: 'foodRescued', baseline: 'central_greedy', main: true, level: 0.975 },
  { measure: 'needMet', baseline: 'central_greedy', main: true, level: 0.975 },
];

/** All twelve comparisons (4 measures x 3 baselines): the two main ones, then the ten supporting ones at 95%. */
export const COMPARISONS: readonly PairSpec[] = [
  ...MAIN,
  ...MEASURES.flatMap((measure) =>
    BASELINES.map((baseline): PairSpec => ({ measure, baseline, main: false, level: 0.95 })),
  ).filter((p) => !MAIN.some((m) => m.measure === p.measure && m.baseline === p.baseline)),
];

export interface Comparison extends PairSpec {
  /** Evenings used. Fewer than the run's evenings only when a need-met value is missing. */
  evenings: number;
  /** Mean of Salo minus baseline per evening, in the measure's own unit (kg, ratio, or awards). */
  mean: number;
  low: number;
  high: number;
  reading: Reading;
}

/**
 * Salo minus the baseline, evening by evening (paired). Evenings where either value is missing are left out.
 * The two runs must cover the same evenings in the same order.
 */
export function pairedDiffs(
  salo: readonly EveningResult[],
  baseline: readonly EveningResult[],
  measure: MeasureId,
): number[] {
  if (salo.length !== baseline.length) throw new Error('paired runs must cover the same evenings');
  const diffs: number[] = [];
  for (let i = 0; i < salo.length; i++) {
    if (salo[i].evening !== baseline[i].evening) throw new Error(`evening order differs at ${i}`);
    const a = measureValue(salo[i], measure);
    const b = measureValue(baseline[i], measure);
    if (a !== null && b !== null) diffs.push(a - b);
  }
  return diffs;
}

/**
 * "Salo better" and "baseline better" only when the whole interval is on one side of zero, read in the
 * measure's direction (lower wasted and fewer stranded awards are better). An interval containing zero is
 * "no clear difference".
 */
export function readingOf(measure: MeasureId, low: number, high: number): Reading {
  const sign = higherIsBetter(measure) ? 1 : -1;
  const a = sign * low;
  const b = sign * high;
  if (Math.min(a, b) > 0) return 'salo_better';
  if (Math.max(a, b) < 0) return 'baseline_better';
  return 'no_clear_difference';
}

/**
 * All twelve paired comparisons from one set of runs. Every measure shares the same resample indices for a
 * given evening count, so food wasted intervals are exact mirrors of food rescued ones (decision D-Q3).
 */
export function compareAll(
  runs: Record<PolicyId, readonly EveningResult[]>,
  resamples: number = RESAMPLES,
  seed: number = BOOTSTRAP_SEED,
): Comparison[] {
  const indexCache = new Map<number, number[][]>();
  return COMPARISONS.map((spec) => {
    const diffs = pairedDiffs(runs.salo, runs[spec.baseline], spec.measure);
    if (diffs.length === 0) throw new Error(`no evenings to compare for ${spec.measure} vs ${spec.baseline}`);
    let indices = indexCache.get(diffs.length);
    if (!indices) {
      indices = bootstrapIndices(diffs.length, resamples, seed);
      indexCache.set(diffs.length, indices);
    }
    const { mean, low, high } = pairedInterval(diffs, indices, spec.level);
    return { ...spec, evenings: diffs.length, mean, low, high, reading: readingOf(spec.measure, low, high) };
  });
}
