/**
 * Validation of the LLM proxy's 200 body (architecture 5.3: never trust the model) and mapping a ParseResponse to the
 * app's ParsedDraft. Pure TypeScript.
 */
import type { FoodUnit } from '../engine/types';
import { canonicalFor, UNIT_WORDS } from './rules/vocab';
import type { ItemFlag, ParseResponse, ParseResponseItem, ParsedDraft, ParsedItem } from './types';

const FOOD_UNITS: readonly FoodUnit[] = ['tray', 'piece', 'bilao', 'kg', 'loaf', 'pot', 'pack', 'can'];
const MAX_ITEMS = 10;
const MAX_FOOD_CHARS = 60;
const MAX_QUANTITY = 500;
/** Pickup window: 16:00 to 22:00 inclusive, in minutes after midnight. */
const PICKUP_MIN = 16 * 60;
const PICKUP_MAX = 22 * 60;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The FoodUnit for a unit value (a FoodUnit name or a mapped Filipino or English unit word), or null. */
function mapUnit(value: unknown): FoodUnit | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  if ((FOOD_UNITS as readonly string[]).includes(key)) return key as FoodUnit;
  return Object.prototype.hasOwnProperty.call(UNIT_WORDS, key) ? UNIT_WORDS[key] : null;
}

/** "HH:MM" inside the pickup window, as minutes after midnight, or null. */
function parsePickup(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes >= PICKUP_MIN && minutes <= PICKUP_MAX ? minutes : null;
}

function validateItem(raw: unknown): ParseResponseItem | null {
  if (!isObject(raw)) return null;
  const { food_item, quantity, unit } = raw;
  if (typeof food_item !== 'string' || food_item.trim().length === 0 || food_item.length > MAX_FOOD_CHARS) return null;
  let q: number | null;
  if (quantity === null) q = null;
  else if (typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0 && quantity <= MAX_QUANTITY) q = quantity;
  else return null;
  let u: FoodUnit | null;
  if (unit === null) u = null;
  else {
    u = mapUnit(unit);
    if (u === null) return null;
  }
  return { food_item, quantity: q, unit: u };
}

/**
 * Validates the 200 body. Returns a ParseResponse (source "llm", unknown fields dropped) or null. Any failing field
 * rejects the whole response; the caller then uses the fallback on the original text.
 */
export function validateResponse(json: unknown): ParseResponse | null {
  if (!isObject(json)) return null;
  const { items, pickup_by, missing, source, model } = json;
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) return null;
  const parsedItems: ParseResponseItem[] = [];
  for (const raw of items) {
    const it = validateItem(raw);
    if (it === null) return null;
    parsedItems.push(it);
  }
  let pickup: string | null;
  if (pickup_by === null) pickup = null;
  else if (typeof pickup_by === 'string' && parsePickup(pickup_by) !== null) pickup = pickup_by;
  else return null;
  let miss: string[] = [];
  if (missing !== undefined) {
    if (!Array.isArray(missing) || !missing.every((m): m is string => typeof m === 'string')) return null;
    miss = [...missing];
  }
  if (source !== 'llm') return null;
  const out: ParseResponse = { items: parsedItems, pickup_by: pickup, missing: miss, source: 'llm' };
  if (typeof model === 'string') out.model = model;
  return out;
}

/** The pickup minute for a validated "HH:MM", or null. */
export function pickupMinute(pickupBy: string | null): number | null {
  return pickupBy === null ? null : parsePickup(pickupBy);
}

/**
 * Maps each item's food name to a canonical tuning name (or null) and flags what is unmatched or missing.
 * No catalog mapping here: kg per unit and load units are the wiring step's job.
 */
export function toDraft(resp: ParseResponse): ParsedDraft {
  const items: ParsedItem[] = resp.items.map((it) => {
    const foodItem = canonicalFor(it.food_item);
    const flags: ItemFlag[] = [];
    if (foodItem === null) flags.push('unmatched_item');
    if (it.quantity === null) flags.push('missing_quantity');
    if (it.unit === null) flags.push('missing_unit');
    return { foodItem, rawText: it.food_item, quantity: it.quantity, unit: it.unit, flags };
  });
  return { items, pickupByMinute: pickupMinute(resp.pickup_by), source: resp.source };
}
