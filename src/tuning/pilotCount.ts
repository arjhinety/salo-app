/**
 * M6 main-evening count (docs/decisions.md, "M6 tuning and pilot", "Main-evening count (amended by Arjhine,
 * 2026-11-01, before any pilot run)"). Pure TypeScript: no engine, no data, no file access.
 *
 * Input: the pilot's ten per-evening differences d (Salo minus central greedy) for one main measure.
 *   s   = sample SD of d (n - 1 = 9 degrees of freedom)
 *   s_U = s × √(9 / χ²₀.₂₀,₉)   the one-sided 80% upper confidence limit of the SD (= 1.2934 × s)
 *   n   = ceil((2 × 2.2414 × s_U / gap)²)   gap 6 kg (food rescued), 0.10 (worst-served need met)
 *   count = max(n_food, n_fair, 10)
 */

/** The pilot evenings (split 'pilot'). Tuning and main evenings are refused here. */
export const PILOT_EVENING_IDS: readonly string[] = ['E11', 'E12', 'E13', 'E14', 'E15', 'E16', 'E17', 'E18', 'E19', 'E20'];

/** Two-sided 97.5% normal quantile (decisions.md). */
export const Z_975 = 2.2414;

/** Lower 20% quantile of the chi-square distribution with 9 degrees of freedom (decisions.md). */
export const CHI2_LOWER_20_DF9 = 5.380053;

/** √(9 / χ²₀.₂₀,₉) = 1.2934 (decisions.md). */
export const SD_UPPER_FACTOR = Math.sqrt(9 / CHI2_LOWER_20_DF9);

/** Smallest gaps worth caring about (decisions.md, M6 tuning and pilot). */
export const GAP_FOOD_KG = 6;
export const GAP_FAIR = 0.1;

/** The count is never below this (decisions.md). */
export const MIN_MAIN_EVENINGS = 10;

/** Throws unless the evening is a pilot evening (split 'pilot' and one of E11-E20). */
export function assertPilotEvening(ev: { id: string; split: string }): void {
  if (ev.split !== 'pilot') {
    throw new Error(`pilot code refuses evening ${ev.id}: its split is ${ev.split}, only pilot evenings may be used`);
  }
  if (!PILOT_EVENING_IDS.includes(ev.id)) {
    throw new Error(`pilot code refuses evening ${ev.id}: only E11-E20 may be used`);
  }
}

/** Throws unless the list is exactly E11..E20 in order, every one a pilot evening. */
export function assertPilotEvenings(evs: readonly { id: string; split: string }[]): void {
  const ids = evs.map((e) => e.id);
  if (ids.length !== PILOT_EVENING_IDS.length || ids.some((id, i) => id !== PILOT_EVENING_IDS[i])) {
    throw new Error(`pilot needs exactly ${PILOT_EVENING_IDS.join(' ')}, got ${ids.join(' ')}`);
  }
  evs.forEach(assertPilotEvening);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) throw new Error('mean of no values');
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/** Sample standard deviation (divides by n - 1). */
export function sampleSd(values: readonly number[]): number {
  if (values.length < 2) throw new Error('a sample SD needs at least two values');
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1));
}

/** s_U = s × √(9 / χ²₀.₂₀,₉): the 80% one-sided upper limit of the SD, from ten pilot evenings (9 df). */
export function upperSd(sd: number): number {
  return sd * SD_UPPER_FACTOR;
}

/** n = ceil((2 × 2.2414 × s_U / gap)²). */
export function requiredEvenings(sU: number, gap: number): number {
  return Math.ceil((((2 * Z_975 * sU) / gap) ** 2));
}

export interface MeasureCount {
  /** The ten per-evening differences, in evening order (Salo minus central greedy). */
  diffs: readonly number[];
  mean: number;
  /** Sample SD (n - 1). */
  sd: number;
  /** One-sided 80% upper limit of the SD. */
  sU: number;
  gap: number;
  /** Evenings this measure needs. */
  n: number;
}

/** One main measure's count from the ten pilot differences. Refuses anything but ten finite numbers. */
export function measureCount(diffs: readonly number[], gap: number): MeasureCount {
  if (diffs.length !== PILOT_EVENING_IDS.length) {
    throw new Error(`need ${PILOT_EVENING_IDS.length} pilot differences, got ${diffs.length}`);
  }
  if (diffs.some((d) => !Number.isFinite(d))) throw new Error('a pilot difference is not a finite number');
  if (!(gap > 0)) throw new Error('the gap must be positive');
  const sd = sampleSd(diffs);
  const sU = upperSd(sd);
  return { diffs, mean: mean(diffs), sd, sU, gap, n: requiredEvenings(sU, gap) };
}

export interface PilotCount {
  food: MeasureCount;
  fair: MeasureCount;
  /** max(n_food, n_fair, 10). */
  count: number;
}

/** The main-evening count from the two pilot difference lists (food rescued kg, worst-served need met). */
export function pilotCount(foodDiffs: readonly number[], fairDiffs: readonly number[]): PilotCount {
  const food = measureCount(foodDiffs, GAP_FOOD_KG);
  const fair = measureCount(fairDiffs, GAP_FAIR);
  return { food, fair, count: Math.max(food.n, fair.n, MIN_MAIN_EVENINGS) };
}
