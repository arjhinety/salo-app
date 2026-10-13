import type { Minute } from '../engine/types';

/**
 * Donor-facing helpers. The lot fold moved to src/live/lotViews.ts in M3 (it now reads the live store's
 * visible log); the type is re-exported here so existing imports keep working.
 */
export type { LotView } from '../live/lotViews';

export const hhmm = (m: Minute) => {
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return `${h > 12 ? h - 12 : h}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
};
