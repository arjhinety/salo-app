import { bootstrapIndices, pairedInterval } from '../engine/metrics';
import type { Evening, EveningResult, PantryNeed, PolicyId } from '../engine/types';
import { pairedDiffs, readingOf } from './intervals';
import { REGISTRATION, requireRecordOpen, type Registration } from './registration';

/**
 * Supporting checks (RES-07). Labelled supporting, never a main result (guide p.13, p.15).
 * Functions only: the learning-off run needs an engine option that does not exist yet (see the handoff).
 */

const TOLERANCE_KG = 1e-9;

/**
 * Assumption: the food ceiling is reached when every pantry's need is fully met, so food rescued equals total need.
 * The guide (p.13) asks for how often each method hits the ceiling but does not define it (open question).
 */
export function reachedFoodCeiling(result: EveningResult, needs: readonly PantryNeed[]): boolean {
  const total = needs.reduce((s, n) => s + n.needKg, 0);
  return total > 0 && result.foodRescuedKg >= total - TOLERANCE_KG;
}

/** Evenings that reached the food ceiling, per policy. Each policy's runs must cover the same evenings. */
export function ceilingCounts(
  runs: Record<PolicyId, readonly EveningResult[]>,
  evenings: readonly Evening[],
  reg: Registration = REGISTRATION,
): Record<PolicyId, number> {
  requireRecordOpen(reg);
  const byId = new Map(evenings.map((e) => [e.id, e]));
  const count = (rs: readonly EveningResult[]) =>
    rs.filter((r) => {
      const e = byId.get(r.evening);
      if (!e) throw new Error(`no evening ${r.evening}`);
      return reachedFoodCeiling(r, e.needs);
    }).length;
  return {
    salo: count(runs.salo),
    fcfs: count(runs.fcfs),
    nearest: count(runs.nearest),
    central_greedy: count(runs.central_greedy),
  };
}

export interface LearningComparison {
  evenings: number;
  /** Food rescued with learning on minus learning off, per evening (kg). */
  mean: number;
  low: number;
  high: number;
  /** Supporting: 95%, never a main result. */
  level: 0.95;
  reading: 'learning_helps' | 'learning_hurts' | 'no_clear_difference';
}

/** Evening-by-evening comparison of the same policy with learning on and off (paired bootstrap, supporting). */
export function learningComparison(
  on: readonly EveningResult[],
  off: readonly EveningResult[],
  reg: Registration = REGISTRATION,
): LearningComparison {
  requireRecordOpen(reg);
  const diffs = pairedDiffs(on, off, 'foodRescued');
  if (diffs.length === 0) throw new Error('no evenings to compare');
  const { mean, low, high } = pairedInterval(diffs, bootstrapIndices(diffs.length, reg.resamples, reg.seed), 0.95);
  const r = readingOf('foodRescued', low, high);
  const reading = r === 'salo_better' ? 'learning_helps' : r === 'baseline_better' ? 'learning_hurts' : 'no_clear_difference';
  return { evenings: diffs.length, mean, low, high, level: 0.95, reading };
}
