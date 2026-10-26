/** Lot facts and status text for the pantry screens. Pure: built from the lot and the engine's log only. */
import { PANTRY_COPY, PANTRY_UNITS_EN, PANTRY_UNITS_FIL } from '../i18n/pantry';
import { clockText, kmText } from './format';
import type { PantryLotView, PantryStatus } from './model';

export interface LotFacts {
  item: string;
  amount: string;
  storage: string;
  pickupBy: string;
  distance: string;
  lotId: string;
}

/** The facts a pantry reads on a lot: item, amount, storage, pickup-by and distance (PAN-01). All text. */
export function lotFacts(v: PantryLotView): LotFacts {
  const items = v.lot.items;
  const item = items.map((i) => i.foodItemFil).join(' + ');
  const amount = items
    .map((i) => PANTRY_COPY.amountLine(i.quantity, PANTRY_UNITS_FIL[i.unit] ?? i.unit, PANTRY_UNITS_EN[i.unit] ?? i.unit))
    .join(' + ');
  const needsFridge = items.some((i) => i.needsFridgeIfKept);
  return {
    item,
    amount: PANTRY_COPY.fact.amount(amount),
    storage: PANTRY_COPY.fact.storage(needsFridge ? PANTRY_COPY.storage.fridge : PANTRY_COPY.storage.dry),
    pickupBy: PANTRY_COPY.fact.pickupBy(clockText(v.lot.pickupByMinute)),
    distance: PANTRY_COPY.fact.distance(kmText(v.roadKm)),
    lotId: v.lot.id,
  };
}

/** One line for TalkBack on a tag (CC-08): lot, item, amount, pickup, distance, then the status in words. */
export function tagLabel(v: PantryLotView): string {
  const f = lotFacts(v);
  const s = PANTRY_COPY.status[v.status];
  return `${PANTRY_COPY.fact.lot(f.lotId)}, ${f.item}. ${f.amount}. ${f.storage}. ${f.pickupBy}. ${f.distance}. ${s.sticker}: ${s.fil} · ${s.en}.`;
}

export function statusWords(status: PantryStatus): { sticker: string; fil: string; en: string; detail: string } {
  return PANTRY_COPY.status[status];
}
