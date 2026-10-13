/**
 * The donor's view of each lot, folded from the visible part of one evening's event log (decision D-04,
 * architecture 2.9). Pure TypeScript: no React, no Expo. Moved here from src/donor/tonight.ts in M3.
 */
import { WORLD } from '../data/dataset';
import type { AwardState, DonorId, LogEntry, Lot, LotId, Minute } from '../engine/types';

/** Where one of the donor's lots stands at the clock, folded from the engine's event log. */
export interface LotView {
  lot: Lot;
  /** 0 posted, 1 bids in, 2 tentative, 3 driver committed, 4 delivered. */
  station: 0 | 1 | 2 | 3 | 4;
  state: AwardState | 'bids';
  bids: number;
  pantryName: string | null;
  driverName: string | null;
  etaMinute: Minute | null;
}

const pantryName = new Map(WORLD.pantries.map((p) => [p.id, p.name]));
const driverName = new Map(WORLD.drivers.map((d) => [d.id, d.name]));

interface Acc {
  state: AwardState;
  bids: number;
  pantry: string | null;
  driver: string | null;
  eta: Minute | null;
}

/**
 * One pass over the visible log. `lots` is every lot posted by the clock (dataset and live); only
 * those belonging to `donorId` are returned, in the order given.
 */
export function foldLotViews(lots: readonly Lot[], log: readonly LogEntry[], donorId: DonorId): LotView[] {
  const acc = new Map<LotId, Acc>();
  const get = (id: LotId): Acc => {
    let a = acc.get(id);
    if (!a) {
      a = { state: 'announced', bids: 0, pantry: null, driver: null, eta: null };
      acc.set(id, a);
    }
    return a;
  };
  for (const { event } of log) {
    if (event.type === 'AWARD_STATE') {
      get(event.lotId).state = event.state;
    } else if (event.type === 'MESSAGE') {
      const m = event.message;
      const a = get(m.lotId);
      if (m.type === 'PROPOSE' && m.proposer === 'pantry') a.bids++;
      if (m.type === 'TENTATIVE_ACCEPT') a.pantry = m.pantryId;
      if (m.type === 'COMMIT') {
        a.driver = m.driverId;
        a.eta = m.etaMinute;
      }
      if (m.type === 'FAILURE') {
        a.driver = null;
        a.eta = null;
      }
    }
  }
  return lots
    .filter((lot) => lot.donorId === donorId)
    .map((lot) => {
      const a = get(lot.id);
      const state: LotView['state'] = a.state === 'announced' && a.bids > 0 ? 'bids' : a.state;
      const station = ({ announced: 0, bids: 1, tentative: 2, final: 3, delivered: 4, stranded: 2, unawarded: 1 } as const)[state];
      return {
        lot,
        station,
        state,
        bids: a.bids,
        pantryName: a.pantry ? pantryName.get(a.pantry) ?? a.pantry : null,
        driverName: a.driver ? driverName.get(a.driver) ?? a.driver : null,
        etaMinute: a.eta,
      };
    });
}
