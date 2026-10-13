import type { FrozenParams } from './types';

/** Fixed by the guide, never tuned (page 12). */
export const SHARE_BUDGET_PER_EVENING = 40;
/** Decision D-a: first-come-first-served replies arrive 0-5 minutes after posting; round 1 closes at 5. */
export const BID_WINDOW_MINUTES = 5;
/** Show-outcome mix, the same as the dataset's driver_runs generator: 12% of shows are late. */
export const LATE_SHARE_OF_SHOWS = 0.12;
/** Non-shows split evenly between withdrawing before commit and not showing after commit. */
export const WITHDRAW_SHARE_OF_MISSES = 0.5;

/**
 * UNTUNED starting values, for development only. Tuning on E01-E10 (milestone M6) replaces them and
 * writes the frozen file before any pilot run; pilot and main runs refuse to start with these.
 */
export const UNTUNED_PARAMS: FrozenParams = {
  schema: 1,
  frozenOn: 'UNTUNED',
  tuningEvenings: [],
  salo: {
    utilityWeights: { need: 0.4, storage: 0.3, distance: 0.15, freshness: 0.15 },
    shareBudgetPerEvening: SHARE_BUDGET_PER_EVENING,
    shareBid: { kind: 'linear', scale: 17 },
  },
  centralGreedy: {
    utilityWeights: { need: 0.4, storage: 0.3, distance: 0.15, freshness: 0.15 },
    transportPenaltyPerMinute: 0.005,
  },
};
