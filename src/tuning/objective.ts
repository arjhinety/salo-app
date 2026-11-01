import { cappedMean } from '../engine/metrics';
import type { EveningResult } from '../engine/types';

/**
 * M6 tuning objective and select rule (guide p.12; docs/decisions.md, "M6 tuning and pilot"). Pure TypeScript.
 *
 * Target: maximise the mean food rescued (kg per evening) over E01-E10, subject to the mean, over E01-E10, of each
 * evening's worst-served need met being at least 0.5. If no setting reaches 0.5, the setting whose mean is closest
 * to 0.5 is used, ties going to more food. The same rule for Salo and central greedy.
 */

/** The only evenings tuning may use (guide p.12, decisions.md). Pilot (E11-E20) and main (E21-E64) are refused. */
export const TUNING_EVENING_IDS: readonly string[] = ['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10'];

/** Guide p.12: the worst-served need met, averaged over the tuning evenings, must be at least this. */
export const WORST_TARGET = 0.5;

/** A mean that is 0.5 up to floating-point noise counts as reaching 0.5. */
const FEASIBILITY_TOLERANCE = 1e-12;

/** Throws unless the evening is a tuning evening (split 'tuning' and one of E01-E10). */
export function assertTuningEvening(ev: { id: string; split: string }): void {
  if (ev.split !== 'tuning') {
    throw new Error(`tuning code refuses evening ${ev.id}: its split is ${ev.split}, only tuning evenings may be used`);
  }
  if (!TUNING_EVENING_IDS.includes(ev.id)) {
    throw new Error(`tuning code refuses evening ${ev.id}: only E01-E10 may be used`);
  }
}

/** Throws unless the list is exactly E01..E10 in order, every one a tuning evening. */
export function assertTuningEvenings(evs: readonly { id: string; split: string }[]): void {
  const ids = evs.map((e) => e.id);
  if (ids.length !== TUNING_EVENING_IDS.length || ids.some((id, i) => id !== TUNING_EVENING_IDS[i])) {
    throw new Error(`tuning needs exactly ${TUNING_EVENING_IDS.join(' ')}, got ${ids.join(' ')}`);
  }
  evs.forEach(assertTuningEvening);
}

export interface SettingMeans {
  /** Mean food rescued per evening (kg). */
  foodKg: number;
  /** Mean over the evenings of each evening's worst-served need met (null evenings left out, as in cappedMean). */
  worstNeedMet: number;
  feasible: boolean;
}

/** The two means of one setting, from its ten tuning-evening results. */
export function meansOf(results: readonly EveningResult[]): SettingMeans {
  if (results.length !== TUNING_EVENING_IDS.length) throw new Error(`expected ${TUNING_EVENING_IDS.length} results, got ${results.length}`);
  for (const r of results) {
    if (r.split !== 'tuning' || !TUNING_EVENING_IDS.includes(r.evening)) throw new Error(`result for ${r.evening} (${r.split}) is not a tuning result`);
  }
  const foodKg = results.reduce((s, r) => s + r.foodRescuedKg, 0) / results.length;
  const worst = cappedMean(results.map((r) => r.worstNeedMet), 1);
  if (worst === null) throw new Error('no tuning evening has a worst-served value');
  return { foodKg, worstNeedMet: worst, feasible: worst >= WORST_TARGET - FEASIBILITY_TOLERANCE };
}

export interface Scored {
  index: number;
  foodKg: number;
  worstNeedMet: number;
}

export function isFeasible(s: Scored): boolean {
  return s.worstNeedMet >= WORST_TARGET - FEASIBILITY_TOLERANCE;
}

/**
 * Select order (negative = a is preferred over b). Feasible settings first: more food, then the higher worst-served
 * mean, then the lower index. If none is feasible, the settings are ordered by how close their worst-served mean is
 * to 0.5, then more food, then the lower index.
 */
export function compareSettings(a: Scored, b: Scored): number {
  const fa = isFeasible(a);
  const fb = isFeasible(b);
  if (fa !== fb) return fa ? -1 : 1;
  if (fa) return b.foodKg - a.foodKg || b.worstNeedMet - a.worstNeedMet || a.index - b.index;
  const closeA = Math.abs(a.worstNeedMet - WORST_TARGET);
  const closeB = Math.abs(b.worstNeedMet - WORST_TARGET);
  return closeA - closeB || b.foodKg - a.foodKg || a.index - b.index;
}

/** All settings in select order. The first entry is the chosen setting. */
export function rankSettings(rows: readonly Scored[]): Scored[] {
  if (!rows.length) throw new Error('no settings to rank');
  for (const r of rows) {
    if (!Number.isFinite(r.foodKg) || !Number.isFinite(r.worstNeedMet)) throw new Error(`setting ${r.index} has a non-finite mean`);
  }
  return [...rows].sort(compareSettings);
}

export function selectSetting(rows: readonly Scored[]): Scored {
  return rankSettings(rows)[0];
}
