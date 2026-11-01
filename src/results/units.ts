/**
 * The one set of units the Results screen writes numbers in. The verdict, the main and supporting rows and the post-hoc
 * note all format through here, so one interval reads the same wherever it appears (decisions.md, M6 finish review):
 * food in kg with one decimal, need met as points of the percentage with one decimal, both signed.
 * Pure: no React imports. Nothing is computed here beyond the unit change and the rounding.
 */
export const MINUS = '−';

export function signed(x: number, digits: number): string {
  return `${x >= 0 ? '+' : MINUS}${Math.abs(x).toFixed(digits)}`;
}

/** Food rescued or wasted, in kg per evening: "−2.8". */
export const kgValue = (x: number): string => signed(x, 1);

/** Worst-served need met, a fraction, shown in points of the percentage: 0.053 reads "+5.3". */
export const pointsValue = (fraction: number): string => signed(fraction * 100, 1);

/** A food interval as the screen writes it: "[−2.8, +1.8] kg". */
export const kgInterval = (low: number, high: number): string => `[${kgValue(low)}, ${kgValue(high)}] kg`;

/** A need-met interval as the screen writes it: "[−2.6, +5.3] points". */
export const pointsInterval = (low: number, high: number): string => `[${pointsValue(low)}, ${pointsValue(high)}] points`;
