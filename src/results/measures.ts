import type { EveningResult, PantryNeed } from '../engine/types';

// RES-02 is computed by the engine's metrics (guide p.14, p.19; decision D-Q3). Nothing is recomputed here.
export { cappedMean, eveningMeasures, resultFromLog } from '../engine/metrics';

/** The four measures on the Results screen (RES-01). */
export type MeasureId = 'foodRescued' | 'foodWasted' | 'needMet' | 'stranded';
export const MEASURES: readonly MeasureId[] = ['foodRescued', 'foodWasted', 'needMet', 'stranded'];

/** One evening's value of a measure. Null only for needMet on an evening where no pantry needed anything. */
export function measureValue(result: EveningResult, m: MeasureId): number | null {
  switch (m) {
    case 'foodRescued':
      return result.foodRescuedKg;
    case 'foodWasted':
      return result.foodWastedKg;
    case 'needMet':
      return result.worstNeedMet;
    case 'stranded':
      return result.strandedAwards;
  }
}

/** Food rescued and need met: more is better. Food wasted and stranded awards: less is better. */
export function higherIsBetter(m: MeasureId): boolean {
  return m === 'foodRescued' || m === 'needMet';
}

/**
 * Need met per pantry (RES-02): delivered / need, capped at 1.0, for pantries with need > 0 only.
 * A zero-need pantry is left out of the ratios.
 */
export function needMetRatios(needs: readonly PantryNeed[], onTimeKgByPantry: ReadonlyMap<string, number>): number[] {
  const out: number[] = [];
  for (const n of needs) {
    if (n.needKg > 0) out.push(Math.min(1, (onTimeKgByPantry.get(n.pantryId) ?? 0) / n.needKg));
  }
  return out;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('median of no values');
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
