import { verdict as ruleVerdict, type Verdict } from '../engine/metrics';
import { kgInterval, pointsInterval } from './units';

export type { Verdict };

/** The verdict labels (RES-04). "Central greedy better" is an assumption: the guide does not name that case. */
export const VERDICT_LABEL: Record<Verdict, string> = {
  salo_better: 'Salo better',
  trade_off: 'Trade-off',
  central_greedy_better: 'Central greedy better',
  no_clear_difference: 'No clear difference',
};

export interface Interval {
  low: number;
  high: number;
}

/** The pre-registered rule (metrics.verdict) from the two main 97.5% intervals against central greedy. */
export function verdictOf(food: Interval, worstServed: Interval): Verdict {
  return ruleVerdict(food, worstServed);
}

/**
 * The verdict line, with the two intervals it used (RES-04). The intervals use the same units as the rows and the
 * post-hoc note (units.ts): kg to one decimal, need met in points to one decimal. The numbers are not changed here.
 */
export function verdictLine(food: Interval, worstServed: Interval): string {
  return `${VERDICT_LABEL[verdictOf(food, worstServed)]}: food rescued ${kgInterval(food.low, food.high)} per evening; worst-served need met ${pointsInterval(worstServed.low, worstServed.high)}.`;
}
