import type { Comparison } from './intervals';

/**
 * The width check (Arjhine, decisions.md M6, guide p.19): each main 97.5% interval's full width (high minus low) must be
 * smaller than the smallest gap worth caring about. Food rescued: 6 kg per evening. Worst-served need met: 0.10.
 * Strict: a width equal to the gap fails the check.
 */
export const WIDTH_GAP_FOOD_KG = 6;
export const WIDTH_GAP_NEED_MET = 0.1;

export interface WidthCheck {
  width: number;
  gap: number;
  below: boolean;
}

/** The width check for one main comparison. Throws for a supporting comparison: the check is for the two main results only. */
/**
 * Post-hoc supporting reading (Arjhine, decisions.md M6, 2026-11-01), not a pre-registered equivalence test: true when the
 * main interval lies entirely inside plus or minus its gap, so a difference as large as the gap is unlikely either way.
 */
export function insideGap(c: Pick<Comparison, 'measure' | 'low' | 'high' | 'main'>): boolean {
  const { gap } = widthCheck(c);
  return c.low > -gap && c.high < gap;
}

export function widthCheck(c: Pick<Comparison, 'measure' | 'low' | 'high' | 'main'>): WidthCheck {
  if (!c.main) throw new Error('the width check applies to the two main results only');
  const gap = c.measure === 'foodRescued' ? WIDTH_GAP_FOOD_KG : c.measure === 'needMet' ? WIDTH_GAP_NEED_MET : NaN;
  if (Number.isNaN(gap)) throw new Error(`no width gap for ${c.measure}`);
  const width = c.high - c.low;
  return { width, gap, below: width < gap };
}
