/**
 * What a follower phone sends to the dashboard, and how the dashboard turns it into an input (M5, protocol step 3-4).
 * Pure TypeScript. A request names the donor or driver id of the phone that sends it; the database checks that id
 * against the phone's own profile (input_requests RLS).
 */
import { findEntry, type CatalogEntry } from '../donor/catalog';
import { clampAmount, lotItemFor, MAX_DRAFT_ITEMS, type DraftItem } from '../donor/postForm';
import type { DonorId, DriverAnswer, DriverId, FoodUnit, LotId, Minute } from '../engine/types';
import type { LiveLotDraft } from '../live/evening';

/** The lot as a donor phone sends it. No id, no kg, no load: the dashboard works those out from its catalog. */
export interface RequestedLot {
  donorId: DonorId;
  pickupByMinute: Minute;
  items: DraftItem[];
}

/** The two kinds a follower may send (the database accepts only these two). */
export type RequestInput =
  | { type: 'LOT_POSTED'; lot: RequestedLot }
  | { type: 'DRIVER_RESPONSE'; driverId: DriverId; lotId: LotId; answer: DriverAnswer };

const ANSWERS: ReadonlySet<string> = new Set(['offer', 'decline', 'commit', 'withdraw']);

/** The request for one draft lot (a donor posts one lot per line). */
export function lotRequest(draft: LiveLotDraft): RequestInput {
  return {
    type: 'LOT_POSTED',
    lot: {
      donorId: draft.donorId,
      pickupByMinute: draft.pickupByMinute,
      items: draft.items.map((i) => ({ foodItem: i.foodItem, unit: i.unit, quantity: i.quantity })),
    },
  };
}

/** The request for one driver answer. */
export function answerRequest(lotId: LotId, driverId: DriverId, answer: DriverAnswer): RequestInput {
  return { type: 'DRIVER_RESPONSE', driverId, lotId, answer };
}

/**
 * Dashboard side: a LOT_POSTED request becomes a LiveLotDraft. Each item is looked up in the catalog and its kg and
 * load units are computed there, so a phone cannot choose them. A quantity outside the catalog limits is refused.
 */
export function draftFromRequest(lot: unknown):
  | { ok: true; draft: LiveLotDraft }
  | { ok: false; problems: string[] } {
  if (typeof lot !== 'object' || lot === null) return { ok: false, problems: ['the request has no lot'] };
  const r = lot as Partial<Record<keyof RequestedLot, unknown>>;
  const problems: string[] = [];
  if (typeof r.donorId !== 'string') problems.push('the lot has no donor');
  if (!Number.isInteger(r.pickupByMinute)) problems.push('the lot has no pickup time');
  if (!Array.isArray(r.items) || r.items.length === 0 || r.items.length > MAX_DRAFT_ITEMS) {
    problems.push(`a lot needs 1 to ${MAX_DRAFT_ITEMS} items`);
  }
  if (problems.length > 0) return { ok: false, problems };

  const items: DraftItem[] = [];
  const itemLots: ReturnType<typeof lotItemFor>[] = [];
  for (const raw of r.items as unknown[]) {
    const item = raw as { foodItem?: unknown; unit?: unknown; quantity?: unknown };
    const entry: CatalogEntry | undefined =
      typeof item.foodItem === 'string' && typeof item.unit === 'string'
        ? findEntry(item.foodItem, item.unit as FoodUnit)
        : undefined;
    if (!entry) {
      problems.push(`not on the list: ${String(item.foodItem)} (${String(item.unit)})`);
      continue;
    }
    if (!Number.isInteger(item.quantity) || clampAmount(entry, item.quantity as number) !== item.quantity) {
      problems.push(`quantity out of range for ${entry.foodItem}`);
      continue;
    }
    const draftItem: DraftItem = { foodItem: entry.foodItem, unit: entry.unit, quantity: item.quantity as number };
    items.push(draftItem);
    itemLots.push(lotItemFor(draftItem, entry));
  }
  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    draft: { donorId: r.donorId as DonorId, pickupByMinute: r.pickupByMinute as Minute, items: itemLots },
  };
}

/** True when the value is one of the four driver answers. */
export function isDriverAnswer(value: unknown): value is DriverAnswer {
  return typeof value === 'string' && ANSWERS.has(value);
}
