/**
 * A held driver's requests and runs, folded from the engine's log (decision D-Q5, mobile-feature DRV-01 to DRV-05).
 * Pure TypeScript: no React, no Expo.
 *
 * The engine does not log "asked". This file replays one driver's own state from the log, in processing order, with
 * the same rules as src/engine/simulate.ts: a driver round asks a held driver when that driver is not excluded for the
 * lot, is not picked for another lot, can carry the load and can arrive before the deadline (trip rule below). The
 * reply window is HUMAN_REPLY_WINDOW_MIN minutes and is not logged, so it is closed here. The engine logs an offer
 * (PROPOSE) and the COMMIT, FAILURE and DELIVERY events, so those are read directly. A pick is not logged; it is read
 * from what follows the offer (see `pickedAfter`). Gaps are listed in docs/handoffs/2026-10-26-mobile-feature-driver.md.
 *
 * Only the visible part of the log is read, so the same function serves the live clock and the tests.
 */
import { HUMAN_REPLY_WINDOW_MIN } from '../engine/params';
import type { Driver, LogEntry, Lot, LotId, Minute, PantryId } from '../engine/types';
import type { WorldIndex } from '../engine/world';

export type AskStatus =
  | 'asked'
  | 'picked'
  | 'not_picked'
  | 'committed'
  | 'delivered'
  | 'declined'
  | 'expired'
  | 'withdrawn'
  | 'no_reply'
  | 'cancelled';

export interface Ask {
  lot: Lot;
  pantryId: PantryId;
  askedMinute: Minute;
  /** The reply window ends here: askedMinute + HUMAN_REPLY_WINDOW_MIN. */
  closesMinute: Minute;
  status: AskStatus;
  statusMinute: Minute;
  /** The ETA on this driver's PROPOSE (the engine's ETA), once offered. */
  offerEtaMinute: Minute | null;
  /** Pickup minute from the engine's trip rule at the pick. The log has no pickup event, so this is an estimate. */
  pickupMinute: Minute | null;
  commitMinute: Minute | null;
  commitEtaMinute: Minute | null;
  deliveredMinute: Minute | null;
  onTime: boolean | null;
  minutesLate: number | null;
}

export interface Trip {
  pickup: Minute;
  arrive: Minute;
  deadline: Minute;
}

export interface DriverBoard {
  driverId: string;
  /** Every ask so far, in order. Statuses are as of the last visible entry. */
  asks: readonly Ask[];
  /**
   * The engine's trip for offering on this ask now, or null when the engine would not accept an offer: the window is
   * closed, the driver is already picked for another lot, or the driver cannot arrive before the deadline.
   */
  offerTrip(ask: Ask): Trip | null;
}

export interface BoardInput {
  /** Visible log entries (atMinute <= the clock), in engine order. */
  log: readonly LogEntry[];
  driver: Driver;
  wx: WorldIndex;
  lots: ReadonlyMap<LotId, Lot>;
  /** The whole minute on the clock. */
  now: Minute;
}

interface Hand {
  /** Engine freeAt: the minute the driver is free after the last run. */
  freeAt: Minute;
  /** Pantry the driver last delivered to, or null while at home. */
  loc: PantryId | null;
}

export function driverBoard(input: BoardInput): DriverBoard {
  const { log, driver, wx, lots, now } = input;
  const pantries = new Map(wx.world.pantries.map((p) => [p.id, p]));
  const asks: Ask[] = [];
  const hand: Hand = { freeAt: 0, loc: null };
  const pantryOf = new Map<LotId, PantryId>();
  const excluded = new Set<LotId>();
  /** Open rounds this driver is waiting in: lot -> ask index. */
  const waiting = new Map<LotId, number>();
  /** The pick waiting for COMMIT (the engine's `awaiting`): ask index, or null. */
  let picked: number | null = null;
  /** The commit for each lot: lot -> ask index. */
  const committed = new Map<LotId, number>();

  const tripFor = (lot: Lot, pantryId: PantryId, from: Minute): Trip => {
    const pantry = pantries.get(pantryId);
    if (!pantry) throw new Error(`no pantry ${pantryId}`);
    const start = Math.max(from, driver.availableFromMinute, hand.freeAt);
    const toDonor =
      hand.loc === null
        ? wx.homeToDonor(driver.id, lot.donorId)
        : wx.pantryToDonor(hand.loc, lot.donorId, driver.vehicle);
    const pickup = start + Math.ceil(toDonor);
    const arrive = Math.ceil(start + toDonor + wx.road(lot.donorId, pantryId).minutes[driver.vehicle]);
    const deadline = Math.min(driver.availableToMinute, lot.pickupByMinute, pantry.closesMinute);
    return { pickup, arrive, deadline };
  };
  const canCarry = (lot: Lot) => driver.capacityLoadUnits >= lot.loadUnits;

  /** Closes every open round whose window ended before `limit` (the engine's roundClose, which is not logged). */
  const sweep = (limit: Minute, strictlyBefore: boolean) => {
    for (const [lotId, idx] of [...waiting]) {
      const ask = asks[idx];
      const ended = strictlyBefore ? ask.closesMinute < limit : ask.closesMinute <= limit;
      if (!ended) continue;
      ask.status = 'expired';
      ask.statusMinute = ask.closesMinute;
      excluded.add(lotId);
      waiting.delete(lotId);
    }
  };

  for (let i = 0; i < log.length; i++) {
    const entry = log[i];
    // The window of a round closes after every entry of its own minute, so only later entries see it closed.
    sweep(entry.atMinute, true);
    const ev = entry.event;
    if (ev.type === 'MESSAGE') {
      const m = ev.message;
      if (m.type === 'TENTATIVE_ACCEPT') {
        pantryOf.set(m.lotId, m.pantryId);
      } else if (m.type === 'CALL_FOR_PROPOSALS' && m.target === 'driver') {
        const lot = lots.get(m.lotId);
        const pantryId = pantryOf.get(m.lotId);
        if (!lot || pantryId === undefined) continue;
        if (excluded.has(m.lotId) || picked !== null || !canCarry(lot)) continue;
        const t = tripFor(lot, pantryId, entry.atMinute);
        if (t.arrive > t.deadline) continue;
        asks.push({
          lot, pantryId, askedMinute: entry.atMinute, closesMinute: entry.atMinute + HUMAN_REPLY_WINDOW_MIN,
          status: 'asked', statusMinute: entry.atMinute, offerEtaMinute: null, pickupMinute: null,
          commitMinute: null, commitEtaMinute: null, deliveredMinute: null, onTime: null, minutesLate: null,
        });
        waiting.set(m.lotId, asks.length - 1);
      } else if (m.type === 'PROPOSE' && m.proposer === 'driver' && m.driverId === driver.id) {
        const idx = waiting.get(m.lotId);
        if (idx === undefined) continue;
        const ask = asks[idx];
        waiting.delete(m.lotId);
        ask.offerEtaMinute = m.etaMinute;
        if (pickedAfter(log, i, m.lotId)) {
          picked = idx;
          ask.status = 'picked';
          ask.statusMinute = entry.atMinute;
          ask.pickupMinute = tripFor(ask.lot, ask.pantryId, entry.atMinute).pickup;
        } else {
          ask.status = 'not_picked';
          ask.statusMinute = entry.atMinute;
        }
      } else if (m.type === 'COMMIT' && m.driverId === driver.id) {
        if (picked === null || asks[picked].lot.id !== m.lotId) continue;
        const ask = asks[picked];
        ask.status = 'committed';
        ask.statusMinute = entry.atMinute;
        ask.commitMinute = entry.atMinute;
        ask.commitEtaMinute = m.etaMinute;
        // The engine: the driver is busy until max(ETA, commit minute), the arrival.
        hand.freeAt = Math.max(m.etaMinute, entry.atMinute);
        committed.set(m.lotId, picked);
        picked = null;
      } else if (m.type === 'FAILURE' && m.driverId === driver.id) {
        if (m.reason === 'withdrew_before_commit' || m.reason === 'no_reply') {
          if (picked === null || asks[picked].lot.id !== m.lotId) continue;
          const ask = asks[picked];
          ask.status = m.reason === 'no_reply' ? 'no_reply' : 'withdrawn';
          ask.statusMinute = entry.atMinute;
          excluded.add(m.lotId);
          picked = null;
        } else {
          // cancelled_by_operator or no_show: a committed run ends.
          const idx = committed.get(m.lotId);
          if (idx === undefined) continue;
          const ask = asks[idx];
          ask.status = 'cancelled';
          ask.statusMinute = entry.atMinute;
          hand.freeAt = entry.atMinute;
          excluded.add(m.lotId);
          committed.delete(m.lotId);
        }
      }
    } else if (ev.type === 'INPUT') {
      const inp = ev.input;
      if (inp.type === 'DRIVER_RESPONSE' && inp.driverId === driver.id && inp.answer === 'decline') {
        const idx = waiting.get(inp.lotId);
        if (idx === undefined) continue;
        asks[idx].status = 'declined';
        asks[idx].statusMinute = entry.atMinute;
        excluded.add(inp.lotId);
        waiting.delete(inp.lotId);
      }
    } else if (ev.type === 'DELIVERY' && ev.driverId === driver.id) {
      const idx = committed.get(ev.lotId);
      if (idx === undefined) continue;
      const ask = asks[idx];
      ask.status = 'delivered';
      ask.statusMinute = entry.atMinute;
      ask.deliveredMinute = entry.atMinute;
      ask.onTime = ev.onTime;
      ask.minutesLate = ev.minutesLate;
      hand.loc = ev.pantryId;
      committed.delete(ev.lotId);
    }
  }
  // A window that ends at the clock's minute is already over: the screen drops that request at the same minute.
  sweep(now, false);

  return {
    driverId: driver.id,
    asks,
    offerTrip(ask: Ask): Trip | null {
      if (ask.status !== 'asked' || now >= ask.closesMinute || picked !== null) return null;
      const t = tripFor(ask.lot, ask.pantryId, now);
      return t.arrive <= t.deadline ? t : null;
    },
  };
}

/**
 * Whether the offer logged at `index` was picked. The engine decides at once when this driver was the last one
 * waited for: a pick logs nothing, and any other outcome (a COMMIT, a FAILURE or a stranded lot) for the same lot is
 * logged in the same processing step, right after the PROPOSE. So a next entry that is not one of those means a pick.
 */
function pickedAfter(log: readonly LogEntry[], index: number, lotId: LotId): boolean {
  const next = log[index + 1];
  if (!next) return true;
  const e = next.event;
  if (e.type === 'AWARD_STATE') return e.lotId !== lotId;
  if (e.type === 'MESSAGE') {
    const m = e.message;
    if ((m.type === 'COMMIT' || m.type === 'FAILURE') && m.lotId === lotId) return false;
  }
  return true;
}
