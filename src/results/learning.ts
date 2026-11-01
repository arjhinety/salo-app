import { bootstrapIndices, pairedInterval } from '../engine/metrics';
import type { Evening, EveningResult, PantryNeed, PolicyId } from '../engine/types';
import { pairedDiffs, readingOf } from './intervals';
import { REGISTRATION, requireRecordOpen, type Registration } from './registration';

/**
 * Supporting checks (RES-07). Labelled supporting, never a main result (guide p.13, p.15).
 * These functions compare finished runs. The learning-off runs are produced by the runner (runLearningComparison),
 * which uses the engine option `learning: false` (every driver's estimate fixed at 0.50).
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

/** Tolerance of the second ceiling definition, in kg. */
export const POSTED_CEILING_TOLERANCE_KG = 0.001;

/** Total posted kg of an evening: the sum of its lots' estimated kg (the engine's own postedKg, simulate.ts). */
export function postedKgOf(evening: Pick<Evening, 'lots'>): number {
  return evening.lots.reduce((s, l) => s + l.estKg, 0);
}

/**
 * Second definition of the food ceiling (RES-07, added 2026-11-01 after the main run): ceiling hit = all posted food was
 * rescued that evening, i.e. food rescued equals total posted kg within 0.001 kg. Supporting diagnostic only.
 * The first definition (reachedFoodCeiling) is kept: it cannot be reached when posted food is below total need.
 */
export function reachedPostedCeiling(result: EveningResult, postedKg: number): boolean {
  return Math.abs(result.foodRescuedKg - postedKg) <= POSTED_CEILING_TOLERANCE_KG;
}

/** Evenings where all posted food was rescued (second definition), per policy. Each policy's runs must cover the same evenings. */
export function postedCeilingCounts(
  runs: Record<PolicyId, readonly EveningResult[]>,
  evenings: readonly Evening[],
  reg: Registration = REGISTRATION,
): Record<PolicyId, number> {
  requireRecordOpen(reg);
  const posted = new Map(evenings.map((e) => [e.id, postedKgOf(e)]));
  const count = (rs: readonly EveningResult[]) =>
    rs.filter((r) => {
      const kg = posted.get(r.evening);
      if (kg === undefined) throw new Error(`no evening ${r.evening}`);
      return reachedPostedCeiling(r, kg);
    }).length;
  return {
    salo: count(runs.salo),
    fcfs: count(runs.fcfs),
    nearest: count(runs.nearest),
    central_greedy: count(runs.central_greedy),
  };
}

/** Evenings that reached the food ceiling (first definition: every pantry's need fully met), per policy. Each policy's runs must cover the same evenings. */
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
  /** Food rescued per evening with learning off, in evening order (kg). Kept so the stored result can be re-derived. */
  offFoodKg: number[];
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
  return { evenings: diffs.length, mean, low, high, level: 0.95, reading, offFoodKg: off.map((r) => r.foodRescuedKg) };
}
