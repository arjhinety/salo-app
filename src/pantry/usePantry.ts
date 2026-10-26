import { useMemo } from 'react';
import { WORLD } from '../data/dataset';
import { liveEvening, useLiveSnapshot } from '../live/useLive';
import { indexWorld } from '../engine/world';
import type { Pantry, PantryId } from '../engine/types';
import { pantryLotViews, sharesLeft, type PantryLotView } from './model';

/** The pantry profile when the link names none. Bukal Community Kitchen (P01) is the default. */
export const DEFAULT_PANTRY_ID: PantryId = 'P01';

const WX = indexWorld(WORLD);

/** Road km between a donor and a pantry, from the world data (the same leg the engine uses). */
export const roadKm = (donorId: string, pantryId: PantryId): number => WX.road(donorId, pantryId).roadKm;

/** The pantry for a profile id, or undefined when the id is not in the dataset. */
export function findPantry(id: string | undefined): Pantry | undefined {
  return WORLD.pantries.find((p) => p.id === (id ?? DEFAULT_PANTRY_ID));
}

export interface PantryFeed {
  pantry: Pantry | undefined;
  clock: number;
  views: PantryLotView[];
  sharesLeft: number;
}

/**
 * This pantry's lots and shares, folded from the shared live store (the same store the donor and dashboard read).
 * Recomputed only when the store publishes a change.
 */
export function usePantryFeed(profile: string | undefined): PantryFeed {
  const sim = useLiveSnapshot();
  const pantry = findPantry(profile);
  const pantryId = pantry?.id ?? DEFAULT_PANTRY_ID;
  return useMemo(() => {
    const clock = sim.minute;
    const log = liveEvening.visibleLog();
    const views = pantryLotViews({
      lots: liveEvening.postedLots(),
      log,
      pantryId,
      clock,
      roadKm,
    });
    return { pantry, clock, views, sharesLeft: sharesLeft(log, pantryId, clock) };
    // sim.revision changes on every store publish; the store's data is read fresh inside.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.revision, sim.minute, pantryId, pantry]);
}
