import { useEffect, useSyncExternalStore } from 'react';
import type { DonorId } from '../engine/types';
import { LiveEvening, type LiveSnapshot } from './evening';
import type { LotView } from './lotViews';

/** The one simulated evening on this phone. Every screen reads this same store. */
export const liveEvening = new LiveEvening();

/** The clock and run state. Re-renders only when the whole minute, the run state or the inputs change. */
export function useLiveSnapshot(): LiveSnapshot {
  return useSyncExternalStore(liveEvening.subscribe, liveEvening.getSnapshot, liveEvening.getSnapshot);
}

/** One donor's lots as the donor sees them now. The array is cached in the store until the next change. */
export function useLotViews(donorId: DonorId): LotView[] {
  const read = () => liveEvening.lotViews(donorId);
  return useSyncExternalStore(liveEvening.subscribe, read, read);
}

/** Advances the clock every 250 ms while it runs. Mount once, app-wide, so navigation does not stop the evening. */
export function useLiveTicker(): void {
  const running = useLiveSnapshot().running;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => liveEvening.tick(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);
}
