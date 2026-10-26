/**
 * Which notifications this phone's profile is owed, derived from the visible part of the evening's log (CC-12).
 * Pure TypeScript: no React, no Expo, no store. The same function serves the live phone, a follower and the tests.
 *
 * - donor (D..): TENTATIVE_ACCEPT and COMMIT for its lots.
 * - pantry (P..): TENTATIVE_ACCEPT naming it, and AWARD_STATE final for a lot it won.
 * - driver (V..): a CALL_FOR_PROPOSALS it is asked on (driverBoard lists the asks; re-announcements after a cancel
 *   are new asks).
 * - dashboard, or no role: nothing.
 *
 * Event keys identify the event by lot, kind, the party and the minute. They do NOT use the log `seq`: an input
 * that changes the run renumbers later entries (checked on E05: the same DELIVERY of L0227 is seq 202 in the
 * baseline and seq 200 in the held run). The same event therefore keeps its key across a re-run.
 */
import { WORLD } from '../data/dataset';
import { driverBoard } from '../driver/board';
import { NOTIFY } from '../i18n/notify';
import type { Role } from '../backend/types';
import type { DonorId, DriverId, LogEntry, Lot, LotId, Minute, PantryId } from '../engine/types';
import { indexWorld, type WorldIndex } from '../engine/world';
import { clockText } from '../pantry/format';

export type NotifyKind = 'driver_ask' | 'donor_tentative' | 'donor_commit' | 'pantry_tentative' | 'pantry_final';

export interface NotifyEvent {
  /** Stable identity of the event: kind, lot, party and minute (plus an ordinal for repeated asks). */
  key: string;
  kind: NotifyKind;
  lotId: LotId;
  /** The simulated minute the event happened at. */
  atMinute: Minute;
  title: string;
  body: string;
  /** Where a tap opens: the donor home, the driver home, or the pantry lot detail. */
  href: string;
}

export interface NotifyInput {
  role: Role | null;
  profileId: string | null;
  /** The visible part of the log (atMinute <= the clock), in engine order. */
  log: readonly LogEntry[];
  /** Every lot posted by the clock, by id (dataset and live). */
  lots: ReadonlyMap<LotId, Lot>;
  /** The whole minute on the clock. */
  now: Minute;
  wx?: WorldIndex;
}

const WX_DEFAULT: WorldIndex = indexWorld(WORLD);

const pantryName = new Map(WORLD.pantries.map((p) => [p.id, p.name]));
const driverName = new Map(WORLD.drivers.map((d) => [d.id, d.name]));
const donorName = new Map(WORLD.donors.map((d) => [d.id, d.name]));

export const NOTIFY_ROUTES = {
  donor: '/donor',
  driver: '/driver',
  pantryLot: (lotId: LotId, pantryId: PantryId) =>
    `/pantry/lot/${encodeURIComponent(lotId)}?profile=${encodeURIComponent(pantryId)}`,
} as const;

/** The notifications owed to this profile, in log order. Empty for the dashboard and for a phone with no role. */
export function notifyEvents(input: NotifyInput): NotifyEvent[] {
  const { role, profileId } = input;
  if (profileId === null) return [];
  if (role === 'donor') return donorEvents(input, profileId);
  if (role === 'pantry') return pantryEvents(input, profileId);
  if (role === 'driver') return driverEvents(input, profileId);
  return [];
}

function withSim(body: string): string {
  return `${body} ${NOTIFY.simTag}`;
}

function donorEvents(input: NotifyInput, donorId: DonorId): NotifyEvent[] {
  const out: NotifyEvent[] = [];
  for (const { atMinute, event } of input.log) {
    if (event.type !== 'MESSAGE') continue;
    const m = event.message;
    if (m.type === 'TENTATIVE_ACCEPT' && m.donorId === donorId) {
      out.push({
        key: `donor_tentative|${m.lotId}|${m.pantryId}|${atMinute}`,
        kind: 'donor_tentative',
        lotId: m.lotId,
        atMinute,
        title: NOTIFY.donorTentative.title,
        body: withSim(NOTIFY.donorTentative.body(m.lotId, pantryName.get(m.pantryId) ?? m.pantryId)),
        href: NOTIFY_ROUTES.donor,
      });
    } else if (m.type === 'COMMIT' && input.lots.get(m.lotId)?.donorId === donorId) {
      out.push({
        key: `donor_commit|${m.lotId}|${m.driverId}|${atMinute}`,
        kind: 'donor_commit',
        lotId: m.lotId,
        atMinute,
        title: NOTIFY.donorCommit.title,
        body: withSim(NOTIFY.donorCommit.body(m.lotId, driverName.get(m.driverId) ?? m.driverId, clockText(m.etaMinute))),
        href: NOTIFY_ROUTES.donor,
      });
    }
  }
  return out;
}

function pantryEvents(input: NotifyInput, pantryId: PantryId): NotifyEvent[] {
  const out: NotifyEvent[] = [];
  // The pantry that holds each lot at this point of the log. A lot's final state always follows its TENTATIVE_ACCEPT.
  const holder = new Map<LotId, PantryId>();
  // The driver of the latest COMMIT for each lot so far: a final award names the driver it was committed with.
  const committed = new Map<LotId, DriverId>();
  for (const { atMinute, event } of input.log) {
    if (event.type === 'MESSAGE' && event.message.type === 'COMMIT') {
      committed.set(event.message.lotId, event.message.driverId);
    } else if (event.type === 'MESSAGE' && event.message.type === 'TENTATIVE_ACCEPT') {
      const m = event.message;
      holder.set(m.lotId, m.pantryId);
      if (m.pantryId === pantryId) {
        const donor = input.lots.get(m.lotId)?.donorId ?? m.donorId;
        out.push({
          key: `pantry_tentative|${m.lotId}|${atMinute}`,
          kind: 'pantry_tentative',
          lotId: m.lotId,
          atMinute,
          title: NOTIFY.pantryTentative.title,
          body: withSim(NOTIFY.pantryTentative.body(m.lotId, donorName.get(donor) ?? donor)),
          href: NOTIFY_ROUTES.pantryLot(m.lotId, pantryId),
        });
      }
    } else if (event.type === 'AWARD_STATE' && event.state === 'final' && holder.get(event.lotId) === pantryId) {
      out.push({
        key: `pantry_final|${event.lotId}|${atMinute}`,
        kind: 'pantry_final',
        lotId: event.lotId,
        atMinute,
        title: NOTIFY.pantryFinal.title,
        body: withSim(NOTIFY.pantryFinal.body(event.lotId, driverName.get(committed.get(event.lotId) ?? '') ?? '')),
        href: NOTIFY_ROUTES.pantryLot(event.lotId, pantryId),
      });
    }
  }
  return out;
}

function driverEvents(input: NotifyInput, driverId: DriverId): NotifyEvent[] {
  const driver = WORLD.drivers.find((d) => d.id === driverId);
  if (!driver) return [];
  const board = driverBoard({
    log: input.log,
    driver,
    wx: input.wx ?? WX_DEFAULT,
    lots: input.lots,
    now: input.now,
  });
  const seenAt = new Map<string, number>();
  return board.asks.map((ask) => {
    const base = `${ask.lot.id}|${ask.askedMinute}`;
    const ordinal = seenAt.get(base) ?? 0;
    seenAt.set(base, ordinal + 1);
    return {
      key: `driver_ask|${base}|${ordinal}`,
      kind: 'driver_ask' as const,
      lotId: ask.lot.id,
      atMinute: ask.askedMinute,
      title: NOTIFY.driverAsk.title,
      body: withSim(NOTIFY.driverAsk.body(ask.lot.id, clockText(ask.closesMinute))),
      href: NOTIFY_ROUTES.driver,
    };
  });
}
