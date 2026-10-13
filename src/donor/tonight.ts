import { EVENINGS, WORLD } from '../data/dataset';
import { UNTUNED_PARAMS } from '../engine/params';
import { runEvening } from '../engine/simulate';
import type { AwardState, DonorId, LogEntry, Lot, Minute } from '../engine/types';
import { indexWorld } from '../engine/world';

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

const wx = indexWorld(WORLD);
const pantryName = new Map(WORLD.pantries.map((p) => [p.id, p.name]));
const driverName = new Map(WORLD.drivers.map((d) => [d.id, d.name]));

/** One evening's log, run once and cached. M2 shows the engine's simulated evening; M3 makes it live. */
const runs = new Map<string, LogEntry[]>();
function logFor(eveningId: string): LogEntry[] {
  let log = runs.get(eveningId);
  if (!log) {
    const ev = EVENINGS.find((e) => e.id === eveningId);
    if (!ev) throw new Error(`no evening ${eveningId}`);
    log = runEvening(wx, ev, { policy: 'salo', params: UNTUNED_PARAMS }).log;
    runs.set(eveningId, log);
  }
  return log;
}

export function donorTonight(eveningId: string, donorId: DonorId, clock: Minute): LotView[] {
  const ev = EVENINGS.find((e) => e.id === eveningId)!;
  const mine = ev.lots.filter((l) => l.donorId === donorId && l.postedMinute <= clock);
  const log = logFor(eveningId).filter((e) => e.atMinute <= clock);
  return mine.map((lot) => {
    let state: LotView['state'] = 'announced';
    let bids = 0;
    let pantry: string | null = null;
    let driver: string | null = null;
    let eta: Minute | null = null;
    for (const { event } of log) {
      if (event.type === 'AWARD_STATE' && event.lotId === lot.id) state = event.state;
      if (event.type !== 'MESSAGE' || event.message.lotId !== lot.id) continue;
      const m = event.message;
      if (m.type === 'PROPOSE' && m.proposer === 'pantry') bids++;
      if (m.type === 'TENTATIVE_ACCEPT') pantry = m.pantryId;
      if (m.type === 'COMMIT') { driver = m.driverId; eta = m.etaMinute; }
      if (m.type === 'FAILURE') { driver = null; eta = null; }
    }
    if (state === 'announced' && bids > 0) state = 'bids';
    const station = ({ announced: 0, bids: 1, tentative: 2, final: 3, delivered: 4, stranded: 2, unawarded: 1 } as const)[state];
    return {
      lot, station, state, bids,
      pantryName: pantry ? pantryName.get(pantry) ?? pantry : null,
      driverName: driver ? driverName.get(driver) ?? driver : null,
      etaMinute: eta,
    };
  });
}

export const hhmm = (m: Minute) => {
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return `${h > 12 ? h - 12 : h}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
};
