/**
 * The manual post form's logic, pure TypeScript (no React). The screen and the cards read and write these
 * functions; M4's parser will fill the same DraftItem array.
 */
import type { Evening, DonorId, FoodUnit, LotItem, Lot, Minute } from '../engine/types';
import type { LiveEvening, LiveLotDraft, LiveResult } from '../live/evening';
import { amountLimits, estKgFor, findEntry, loadUnitsFor, type CatalogEntry } from './catalog';

/** One line on the form: what the donor picked and how many. The parser (M4) produces the same shape. */
export interface DraftItem {
  foodItem: string;
  unit: FoodUnit;
  quantity: number;
}

/** A post holds at most this many items (cards). */
export const MAX_DRAFT_ITEMS = 5;

/** Pickups are offered until 21:00 (the latest pantry closing in the dataset). */
export const PICKUP_LATEST: Minute = 21 * 60;

/** Minutes after the clock that the pickup chips are offered at. */
export const PICKUP_OFFSETS: readonly number[] = [45, 60, 75, 90];

/**
 * The pickup chips for a given clock minute: the clock plus each offset, rounded to the nearest 15 minutes and
 * capped at PICKUP_LATEST (21:00, the same cap the dataset generator uses), kept only if it is after the clock,
 * and de-duplicated. So from 20:15 on, the late offsets all land on one 9:00 PM chip; at 21:00 nothing is left
 * and the form says pickups are closed.
 */
export function pickupChoices(nowMinute: Minute): Minute[] {
  const out: Minute[] = [];
  for (const offset of PICKUP_OFFSETS) {
    const t = Math.min(PICKUP_LATEST, 15 * Math.round((nowMinute + offset) / 15));
    if (t > nowMinute && !out.includes(t)) out.push(t);
  }
  return out;
}

/** The donor's own history: the (foodItem, unit) keys this donor has posted in any evening. */
export function donorItemKeys(evenings: readonly Evening[], donorId: DonorId): Set<string> {
  const keys = new Set<string>();
  for (const ev of evenings) {
    for (const lot of ev.lots) {
      if (lot.donorId !== donorId) continue;
      for (const it of lot.items) keys.add(`${it.foodItem}|${it.unit}`);
    }
  }
  return keys;
}

/** The catalog split into the donor's own items (first) and the rest. Catalog order is kept inside each group. */
export function splitPicker(
  catalog: readonly CatalogEntry[],
  history: ReadonlySet<string>,
): { mine: CatalogEntry[]; others: CatalogEntry[] } {
  const mine: CatalogEntry[] = [];
  const others: CatalogEntry[] = [];
  for (const e of catalog) (history.has(`${e.foodItem}|${e.unit}`) ? mine : others).push(e);
  return { mine, others };
}

/** A new line for an item: the smallest quantity the dataset has seen for it. */
export function newDraftItem(entry: CatalogEntry): DraftItem {
  return { foodItem: entry.foodItem, unit: entry.unit, quantity: entry.minQty };
}

/** A quantity inside the stepper's limits (1 to maxQty). */
export function clampAmount(entry: CatalogEntry, quantity: number): number {
  const { min, max } = amountLimits(entry);
  return Math.min(max, Math.max(min, Math.round(quantity)));
}

/** The LotItem the engine gets for one line: quantity, kg and load units from the catalog. */
export function lotItemFor(item: DraftItem, entry: CatalogEntry): LotItem {
  return {
    foodItem: entry.foodItem,
    foodItemFil: entry.foodItemFil,
    foodCategory: entry.foodCategory,
    quantity: item.quantity,
    unit: entry.unit,
    estKg: estKgFor(item.quantity, entry),
    loadUnits: loadUnitsFor(item.quantity, entry),
    needsFridgeIfKept: entry.needsFridgeIfKept,
    maxHoursUnrefrigerated: entry.maxHoursUnrefrigerated,
  };
}

/**
 * One live lot per line, all with the same donor and pickup time. Lines whose item is not in the catalog are
 * skipped (they cannot come from the picker; the parser will check the same way in M4).
 */
export function lotDrafts(
  items: readonly DraftItem[],
  donorId: DonorId,
  pickupByMinute: Minute,
  lookup: (foodItem: string, unit: FoodUnit) => CatalogEntry | undefined = findEntry,
): LiveLotDraft[] {
  const drafts: LiveLotDraft[] = [];
  for (const item of items) {
    const entry = lookup(item.foodItem, item.unit);
    if (!entry) continue;
    drafts.push({ donorId, items: [lotItemFor(item, entry)], pickupByMinute });
  }
  return drafts;
}

/**
 * The double-tap guard. The screen keeps one guard in a ref. `posted` is set once any lot has been posted, and a
 * guard that has posted refuses every later submit, so a second tap cannot post a second set.
 */
export interface PostGuard {
  posted: boolean;
}

export type SubmitResult =
  | { status: 'posted'; lots: Lot[] }
  | { status: 'busy' }
  | { status: 'empty' }
  | { status: 'problems'; problems: string[] };

/**
 * Posts one lot per draft into the live evening. The clock does not move during this synchronous call, so every
 * lot gets the same posting minute. All drafts share the donor and the pickup time, so postLot fails on the first
 * draft or not at all; the guard is set only after a lot has really been posted.
 */
export function submitLots(
  live: Pick<LiveEvening, 'postLot'>,
  drafts: readonly LiveLotDraft[],
  guard: PostGuard,
): SubmitResult {
  if (guard.posted) return { status: 'busy' };
  if (drafts.length === 0) return { status: 'empty' };
  const lots: Lot[] = [];
  for (const draft of drafts) {
    const r: LiveResult<Lot> = live.postLot(draft);
    if (!r.ok) {
      if (lots.length > 0) guard.posted = true;
      return { status: 'problems', problems: r.problems };
    }
    lots.push(r.value);
  }
  guard.posted = true;
  return { status: 'posted', lots };
}
