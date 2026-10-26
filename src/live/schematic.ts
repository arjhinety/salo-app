/**
 * The schematic map and its table (DSH-06). Pure TypeScript: the projection, the routes, and the rows of the places
 * involved tonight. No tile server and no Maps key; the map is drawn from the bundled coordinates and works offline.
 * The engine never reads these coordinates (decision D-05).
 */
import { WORLD } from '../data/dataset';
import { ALL_POSITIONS, donorPosition, driverPosition, pantryPosition } from '../data/places';
import type { LatLon } from '../data/rawTypes';
import type { AwardState, DonorId, DriverId, Lot, LogEntry, LotId, PantryId } from '../engine/types';
import { dash } from '../i18n/strings';
import { WORLD_NAMES } from './tape';

export interface Frame {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/** The bounds of the given points. */
export function frameOf(points: readonly LatLon[]): Frame {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLon = Math.max(maxLon, p.lon);
  }
  return { minLat, maxLat, minLon, maxLon };
}

/**
 * The map's fixed frame: every bundled place, so a place's position never moves as the evening fills in. The frame is the
 * same whichever places are drawn.
 */
export const FRAME: Frame = frameOf(ALL_POSITIONS);

/**
 * Projects a position into a width x height box (pixels), with `pad` on every side. Equirectangular: longitude is scaled
 * by the cosine of the mid-latitude, so east-west and north-south distances look the same. North is up. Scale is one
 * number for both axes, and the drawing is centred. Order is kept: a place further east is further right, and a place
 * further north is higher.
 */
export function project(p: LatLon, frame: Frame, width: number, height: number, pad: number): { x: number; y: number } {
  const k = Math.cos((((frame.minLat + frame.maxLat) / 2) * Math.PI) / 180);
  const spanX = (frame.maxLon - frame.minLon) * k;
  const spanY = frame.maxLat - frame.minLat;
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - 2 * pad - spanX * scale) / 2;
  const offY = (height - 2 * pad - spanY * scale) / 2;
  return {
    x: pad + offX + (p.lon - frame.minLon) * k * scale,
    y: pad + offY + (frame.maxLat - p.lat) * scale,
  };
}

/** A tentative award is drawn dashed; a final (or delivered) one is solid (DSH-06). Other states draw no route. */
export function routeDashed(state: AwardState | undefined): boolean | null {
  if (state === 'tentative') return true;
  if (state === 'final' || state === 'delivered') return false;
  return null;
}

export interface RouteLeg {
  lotId: LotId;
  donorId: DonorId;
  pantryId: PantryId;
  dashed: boolean;
}

/**
 * The routes on the map: one straight donor-to-pantry leg for each lot that has an award at the clock. The pantry is the
 * one named by the latest TENTATIVE_ACCEPT or COMMIT in the visible log. The roads file is not bundled, so no road is drawn.
 */
export function routeLegs(log: readonly LogEntry[], lots: readonly Lot[], stateOf: (id: LotId) => AwardState | undefined): RouteLeg[] {
  const award = new Map<LotId, PantryId>();
  for (const { event } of log) {
    if (event.type !== 'MESSAGE') continue;
    const m = event.message;
    if (m.type === 'TENTATIVE_ACCEPT' || m.type === 'COMMIT') award.set(m.lotId, m.pantryId);
  }
  const legs: RouteLeg[] = [];
  for (const lot of lots) {
    const pantryId = award.get(lot.id);
    const dashed = routeDashed(stateOf(lot.id));
    if (pantryId === undefined || dashed === null) continue;
    legs.push({ lotId: lot.id, donorId: lot.donorId, pantryId, dashed });
  }
  return legs;
}

/** One place on the map and in the table. Columns: Name, Role, Where, Right now, From (DSH-06). */
export interface PlaceRow {
  key: string;
  kind: 'donor' | 'pantry' | 'driver';
  id: string;
  name: string;
  /** Where: the street from the dataset. */
  street: string;
  /** Right now: what the place is doing at the clock, in plain words. */
  rightNow: string;
  /** From: the donor whose food or run the place is on. Empty for a donor. */
  from: string;
  position: LatLon;
}

/**
 * The places involved tonight, in first-appearance order: donors that have posted a lot, pantries that have answered a
 * lot, and drivers that have been asked. Built from the visible log and the posted lots, so the set grows with the clock.
 */
export function placesInvolved(log: readonly LogEntry[], lots: readonly Lot[], stateOf: (id: LotId) => AwardState | undefined): PlaceRow[] {
  const donorIds: DonorId[] = [];
  for (const lot of lots) if (!donorIds.includes(lot.donorId)) donorIds.push(lot.donorId);

  // The latest message per pantry and per driver: its state at the clock.
  const pantryLast = new Map<PantryId, { lotId: LotId; text: (state: AwardState | undefined) => string }>();
  const driverLast = new Map<DriverId, { lotId: LotId; text: string }>();
  const pantryOrder: PantryId[] = [];
  const driverOrder: DriverId[] = [];
  const lotDonor = new Map(lots.map((l) => [l.id, l.donorId] as const));

  for (const { event } of log) {
    if (event.type === 'DELIVERY') {
      driverLast.set(event.driverId, { lotId: event.lotId, text: dash.deliveredLot(event.lotId) });
      if (!driverOrder.includes(event.driverId)) driverOrder.push(event.driverId);
      continue;
    }
    if (event.type !== 'MESSAGE') continue;
    const m = event.message;
    switch (m.type) {
      case 'PROPOSE':
        if (m.proposer === 'pantry') {
          pantryLast.set(m.pantryId, { lotId: m.lotId, text: () => dash.bidOn(m.lotId) });
          if (!pantryOrder.includes(m.pantryId)) pantryOrder.push(m.pantryId);
        } else {
          driverLast.set(m.driverId, { lotId: m.lotId, text: dash.offeredFor(m.lotId) });
          if (!driverOrder.includes(m.driverId)) driverOrder.push(m.driverId);
        }
        break;
      case 'REFUSE':
        pantryLast.set(m.pantryId, { lotId: m.lotId, text: () => dash.refusedLot(m.lotId) });
        if (!pantryOrder.includes(m.pantryId)) pantryOrder.push(m.pantryId);
        break;
      case 'TENTATIVE_ACCEPT':
      case 'COMMIT':
        pantryLast.set(m.pantryId, { lotId: m.lotId, text: (state) => dash.holdingLot(m.lotId, state) });
        if (!pantryOrder.includes(m.pantryId)) pantryOrder.push(m.pantryId);
        if (m.type === 'COMMIT') {
          driverLast.set(m.driverId, { lotId: m.lotId, text: dash.committedTo(m.lotId) });
          if (!driverOrder.includes(m.driverId)) driverOrder.push(m.driverId);
        }
        break;
      case 'FAILURE':
        driverLast.set(m.driverId, { lotId: m.lotId, text: dash.failedOn(m.lotId) });
        if (!driverOrder.includes(m.driverId)) driverOrder.push(m.driverId);
        break;
      default:
        break;
    }
  }

  const rows: PlaceRow[] = [];
  for (const id of donorIds) {
    const pos = donorPosition(id);
    const donor = WORLD.donors.find((d) => d.id === id);
    if (!pos || !donor) continue;
    const mine = lots.filter((l) => l.donorId === id).map((l) => dash.lotState(l.id, stateOf(l.id)));
    rows.push({
      key: `d${id}`,
      kind: 'donor',
      id,
      name: WORLD_NAMES.donor(id),
      street: donor.street,
      rightNow: mine.join('; '),
      from: '',
      position: pos,
    });
  }
  for (const id of pantryOrder) {
    const pos = pantryPosition(id);
    const pantry = WORLD.pantries.find((p) => p.id === id);
    const last = pantryLast.get(id);
    if (!pos || !pantry || !last) continue;
    rows.push({
      key: `p${id}`,
      kind: 'pantry',
      id,
      name: WORLD_NAMES.pantry(id),
      street: pantry.street,
      rightNow: last.text(stateOf(last.lotId)),
      from: donorName(lotDonor.get(last.lotId)),
      position: pos,
    });
  }
  for (const id of driverOrder) {
    const pos = driverPosition(id);
    const driver = WORLD.drivers.find((d) => d.id === id);
    const last = driverLast.get(id);
    if (!pos || !driver || !last) continue;
    rows.push({
      key: `v${id}`,
      kind: 'driver',
      id,
      name: WORLD_NAMES.driver(id),
      street: driver.street,
      rightNow: last.text,
      from: donorName(lotDonor.get(last.lotId)),
      position: pos,
    });
  }
  return rows;
}

function donorName(donorId: DonorId | undefined): string {
  return donorId === undefined ? '' : WORLD_NAMES.donor(donorId);
}
