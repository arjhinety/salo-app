/**
 * The receipt tape: one lot's negotiation printed as lines, and the TENTATIVE bars under it (M3 part 2).
 * Pure TypeScript: no React, no Expo. Every input is the visible part of the live log.
 *
 * Bar rule: a bar's length is exactly the simulated minutes it waited (fixed dp per minute in the UI).
 */
import { WORLD } from '../data/dataset';
import { dash } from '../i18n/strings';
import type { AwardState, FailureReason, LogEntry, LotId, Minute, PolicyId, RefuseReason } from '../engine/types';

export type TapeType = 'CALL' | 'PROPOSE' | 'REFUSE' | 'TENTATIVE' | 'COMMIT' | 'FAILURE' | 'DELIVERED';

/** One printed line. `seq` is the log row it came from, so lines and bars keep the engine's order. */
export interface TapeLine {
  seq: number;
  minute: Minute;
  type: TapeType;
  who: string;
  detail: string;
  /** Only a FAILURE is struck in marker red. */
  alert: boolean;
}

/** One TENTATIVE wait: from the TENTATIVE_ACCEPT (or the FAILURE that re-announced it) to a COMMIT or FAILURE. */
export interface TentativeBar {
  /** seq of the line the bar hangs under. */
  startSeq: number;
  startMinute: Minute;
  endMinute: Minute;
  /** open: still waiting at the clock. committed: capped at COMMIT. struck: a FAILURE ended this driver. */
  status: 'open' | 'committed' | 'struck';
  /** Whole simulated minutes waited. */
  minutes: number;
}

export interface NameLookup {
  donor(id: string): string;
  pantry(id: string): string;
  driver(id: string): string;
}

export const WORLD_NAMES: NameLookup = {
  donor: (id) => WORLD.donors.find((d) => d.id === id)?.name ?? id,
  pantry: (id) => WORLD.pantries.find((p) => p.id === id)?.name ?? id,
  driver: (id) => WORLD.drivers.find((d) => d.id === id)?.name ?? id,
};

/** 24-hour HH:MM, the clock format of the dashboard (the ruler and the tape agree). */
export function clock24(m: Minute): string {
  const h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Whole percent of a [0, 1] ratio. */
export const percent = (x: number): number => Math.round(x * 100);

/** Shares are shown whole when they are whole, one decimal otherwise. */
export function shareText(shares: number): string {
  return Number.isInteger(shares) ? String(shares) : shares.toFixed(1);
}

export function refuseWords(reason: RefuseReason): string {
  return dash.refuse[reason];
}

export function failureWords(reason: FailureReason): string {
  return dash.failure[reason];
}

/**
 * The detail of a pantry PROPOSE line. Only Salo has a share budget, so only Salo prints shares. Central greedy
 * prints its value. First come first served and nearest print nothing extra. Never "0 shares".
 */
export function pantryBidDetail(policy: PolicyId, shares: number, valuePercent: number): string {
  if (policy === 'salo') return dash.pantryBid(shareText(shares), valuePercent);
  if (policy === 'central_greedy') return dash.valueOnly(valuePercent);
  return '';
}

/** The tape lines for one lot, in log order. Pass the visible log so nothing after the clock appears. */
export function tapeLines(log: readonly LogEntry[], lotId: LotId, names: NameLookup = WORLD_NAMES): TapeLine[] {
  const lines: TapeLine[] = [];
  for (const { seq, atMinute, policy, event } of log) {
    if (event.type === 'DELIVERY') {
      if (event.lotId !== lotId) continue;
      lines.push({
        seq,
        minute: atMinute,
        type: 'DELIVERED',
        who: names.driver(event.driverId),
        detail: `${dash.to} ${names.pantry(event.pantryId)} · ${event.onTime ? dash.onTime : dash.minutesLate(event.minutesLate)}`,
        alert: false,
      });
      continue;
    }
    if (event.type !== 'MESSAGE' || event.message.lotId !== lotId) continue;
    const m = event.message;
    switch (m.type) {
      case 'CALL_FOR_PROPOSALS':
        lines.push({
          seq,
          minute: m.atMinute,
          type: 'CALL',
          who: names.donor(m.from),
          detail: m.target === 'pantry' ? dash.toPantries : dash.toDrivers,
          alert: false,
        });
        break;
      case 'PROPOSE':
        lines.push(
          m.proposer === 'pantry'
            ? {
                seq,
                minute: m.atMinute,
                type: 'PROPOSE',
                who: names.pantry(m.pantryId),
                detail: pantryBidDetail(policy, m.shares, percent(m.utility.total)),
                alert: false,
              }
            : {
                seq,
                minute: m.atMinute,
                type: 'PROPOSE',
                who: names.driver(m.driverId),
                detail: dash.driverBid(clock24(m.etaMinute), percent(m.reliability)),
                alert: false,
              },
        );
        break;
      case 'REFUSE':
        lines.push({ seq, minute: m.atMinute, type: 'REFUSE', who: names.pantry(m.pantryId), detail: refuseWords(m.reason), alert: false });
        break;
      case 'TENTATIVE_ACCEPT':
        lines.push({
          seq,
          minute: m.atMinute,
          type: 'TENTATIVE',
          who: names.pantry(m.pantryId),
          detail: dash.tentativeDetail(shareText(m.shares)),
          alert: false,
        });
        break;
      case 'COMMIT':
        lines.push({
          seq,
          minute: m.atMinute,
          type: 'COMMIT',
          who: names.driver(m.driverId),
          detail: `${dash.to} ${names.pantry(m.pantryId)} · ${dash.eta} ${clock24(m.etaMinute)}`,
          alert: false,
        });
        break;
      case 'FAILURE':
        lines.push({ seq, minute: m.atMinute, type: 'FAILURE', who: names.driver(m.driverId), detail: failureWords(m.reason), alert: true });
        break;
    }
  }
  return lines;
}

/**
 * The TENTATIVE bars of one lot. `state` is the lot's state at the clock; `clock` is the displayed whole minute.
 * A bar is open only while the lot is tentative. A FAILURE strikes the waiting bar and starts the re-announcement's bar.
 */
export function tentativeBars(
  log: readonly LogEntry[],
  lotId: LotId,
  state: AwardState | undefined,
  clock: Minute,
): TentativeBar[] {
  const bars: TentativeBar[] = [];
  // The bar that is waiting now: started by a TENTATIVE_ACCEPT, or by a FAILURE that re-announces the delivery.
  let open: { startSeq: number; startMinute: Minute } | null = null;
  // The index of the last COMMIT's bar. A FAILURE after a COMMIT (a cancelled FINAL lot) strikes that bar.
  let lastCommitted: number | null = null;
  for (const { seq, event } of log) {
    if (event.type !== 'MESSAGE' || event.message.lotId !== lotId) continue;
    const m = event.message;
    if (m.type === 'TENTATIVE_ACCEPT') {
      open = { startSeq: seq, startMinute: m.atMinute };
    } else if (m.type === 'COMMIT' && open) {
      bars.push({ ...open, endMinute: m.atMinute, status: 'committed', minutes: Math.max(0, m.atMinute - open.startMinute) });
      lastCommitted = bars.length - 1;
      open = null;
    } else if (m.type === 'FAILURE' && open) {
      bars.push({ ...open, endMinute: m.atMinute, status: 'struck', minutes: Math.max(0, m.atMinute - open.startMinute) });
      open = { startSeq: seq, startMinute: m.atMinute };
      lastCommitted = null;
    } else if (m.type === 'FAILURE' && lastCommitted !== null) {
      // The committed driver failed: the bar keeps its length (the minutes it waited) and is struck in marker red.
      bars[lastCommitted] = { ...bars[lastCommitted], status: 'struck' };
      lastCommitted = null;
    }
  }
  // A re-announcement that never found a driver leaves the lot stranded, so its waiting bar is dropped.
  if (open !== null && state === 'tentative') {
    const o: { startSeq: number; startMinute: Minute } = open;
    bars.push({ ...o, endMinute: clock, status: 'open', minutes: Math.max(0, clock - o.startMinute) });
  }
  return bars;
}

/** The label printed on a bar. */
export function barLabel(bar: TentativeBar): string {
  if (bar.status === 'open') return dash.barOpen(bar.minutes);
  if (bar.status === 'committed') return dash.barCommitted(bar.minutes);
  return dash.barStruck(bar.minutes);
}

/** The lots that have at least one pantry bid in the visible log. Used for the BIDS IN sticker. */
export function lotsWithBids(log: readonly LogEntry[]): Set<LotId> {
  const ids = new Set<LotId>();
  for (const { event } of log) {
    if (event.type === 'MESSAGE' && event.message.type === 'PROPOSE' && event.message.proposer === 'pantry') {
      ids.add(event.message.lotId);
    }
  }
  return ids;
}

/** A lot's sticker state on the strip: BIDS IN while it is still announced but has a pantry bid. */
export function stripState(state: AwardState | undefined, hasBids: boolean): AwardState | 'bids' {
  if (state === undefined) return 'announced';
  return state === 'announced' && hasBids ? 'bids' : state;
}
