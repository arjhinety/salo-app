import { STREAM, intBelow } from './rng';
import type { EveningResult, LogEntry, PantryNeed, PolicyId, Split } from './types';

/**
 * Per-evening measures (guide page 19, with page 14's caps and decision D-Q3).
 * Food rescued: per pantry, on-time kg received, capped at its seeded need, summed (zero-need adds 0).
 * Food wasted: posted kg minus food rescued.
 * Worst-served need met: min over pantries with need > 0 of min(1, on-time kg / need); null if none.
 * Stranded awards: lots that got a TENTATIVE_ACCEPT but never a DELIVERY.
 */
export function eveningMeasures(
  needs: readonly PantryNeed[],
  postedKg: number,
  onTimeKgByPantry: ReadonlyMap<string, number>,
): { foodRescuedKg: number; foodWastedKg: number; worstNeedMet: number | null } {
  let rescued = 0;
  let worst: number | null = null;
  for (const n of needs) {
    const got = onTimeKgByPantry.get(n.pantryId) ?? 0;
    if (n.needKg > 0) {
      rescued += Math.min(got, n.needKg);
      const met = Math.min(1, got / n.needKg);
      worst = worst === null ? met : Math.min(worst, met);
    }
  }
  return { foodRescuedKg: rescued, foodWastedKg: postedKg - rescued, worstNeedMet: worst };
}

/** Folds one run's log into its EveningResult (decision D-04: every number comes from the log). */
export function resultFromLog(
  log: readonly LogEntry[],
  needs: readonly PantryNeed[],
  postedKg: number,
  evening: string,
  policy: PolicyId,
  split: Split,
): EveningResult {
  const onTime = new Map<string, number>();
  const awarded = new Set<string>();
  const delivered = new Set<string>();
  for (const { event } of log) {
    if (event.type === 'MESSAGE' && event.message.type === 'TENTATIVE_ACCEPT') awarded.add(event.message.lotId);
    if (event.type === 'DELIVERY') {
      delivered.add(event.lotId);
      if (event.onTime) onTime.set(event.pantryId, (onTime.get(event.pantryId) ?? 0) + event.kg);
    }
  }
  let stranded = 0;
  for (const id of awarded) if (!delivered.has(id)) stranded++;
  return { evening, policy, split, ...eveningMeasures(needs, postedKg, onTime), strandedAwards: stranded };
}

/**
 * Average of per-evening values after capping each at `cap` (guide page 14: evenings at 1.4 and 0.0
 * average 0.5 capped, not 0.7). Null values (no pantry needed anything) are left out.
 */
export function cappedMean(values: readonly (number | null)[], cap = 1): number | null {
  const kept = values.filter((v): v is number => v !== null).map((v) => Math.min(cap, v));
  return kept.length ? kept.reduce((s, v) => s + v, 0) / kept.length : null;
}

/**
 * One shared set of bootstrap resamples (decision D-Q3 consequence): every measure is resampled with
 * the same evening indices, so the food-wasted intervals are exact mirrors of the food-rescued ones.
 */
export function bootstrapIndices(nEvenings: number, resamples: number, seed: number): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < resamples; r++) {
    const row: number[] = [];
    for (let i = 0; i < nEvenings; i++) row.push(intBelow(nEvenings, seed, STREAM.bootstrap, r, i));
    out.push(row);
  }
  return out;
}

/** Linear-interpolation quantile of a sorted array (the same rule as numpy's default). */
export function quantileSorted(sorted: readonly number[], q: number): number {
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.min(sorted.length - 1, lo + 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

/**
 * Paired percentile-bootstrap interval for the mean of per-evening differences (Salo minus a baseline),
 * evening by evening (guide page 19). `level` is 0.975 for the two main results and 0.95 otherwise.
 */
export function pairedInterval(
  diffs: readonly number[],
  indices: readonly (readonly number[])[],
  level: number,
): { mean: number; low: number; high: number } {
  const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  const means = indices.map((row) => row.reduce((s, i) => s + diffs[i], 0) / row.length).sort((a, b) => a - b);
  const a = (1 - level) / 2;
  return { mean, low: quantileSorted(means, a), high: quantileSorted(means, 1 - a) };
}

export type Verdict = 'salo_better' | 'trade_off' | 'central_greedy_better' | 'no_clear_difference';

/**
 * Pre-registered verdict (guide pages 16 and 19), from the two main 97.5% intervals against central
 * greedy. "Clearly favors" means the whole interval is on one side of zero.
 */
export function verdict(food: { low: number; high: number }, fair: { low: number; high: number }): Verdict {
  const forSalo = [food, fair].filter((i) => i.low > 0).length;
  const forCg = [food, fair].filter((i) => i.high < 0).length;
  if (forSalo > 0 && forCg === 0) return 'salo_better';
  if (forSalo > 0 && forCg > 0) return 'trade_off';
  if (forCg > 0) return 'central_greedy_better';
  return 'no_clear_difference';
}
