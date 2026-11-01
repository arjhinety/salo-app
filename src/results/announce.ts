import { RESULTS_COPY as C } from './copy';
import type { RunProgress } from './onDevice';

/** The run as the Results screen shows it. The numbers stay in memory for this session (onDevice.ts keepForSession). */
export type RunView =
  | { status: 'idle' }
  | ({ status: 'running' } & RunProgress)
  | { status: 'cancelled' }
  | { status: 'failed' };

/** Every this many evenings the live announcer speaks. Phase changes are always spoken. */
export const ANNOUNCE_EVERY = 10;

/** The visible progress line: "Evening 12 of 44 …", or the intervals line once every evening is done. */
export function progressLine(p: RunProgress): string {
  return p.phase === 'evenings' ? C.runProgress(p.done, p.total) : C.runIntervals;
}

/**
 * What the live announcer says for a run. TalkBack hears the start, the start of the intervals, and every tenth evening,
 * not each of the 44 progress updates. The visible progress line changes every evening; it is not a live region. An
 * empty string means nothing is spoken for this update.
 */
export function announcementOf(run: RunView): string {
  if (run.status !== 'running') return '';
  if (run.phase === 'intervals') return C.runIntervals;
  if (run.done === 0) return C.runStarted;
  return run.done % ANNOUNCE_EVERY === 0 ? C.runProgress(run.done, run.total) : '';
}
