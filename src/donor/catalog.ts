/**
 * The food catalog for the donor's manual post form: one entry per (foodItem, unit), derived at runtime from the
 * dataset's lots (EVENINGS). Nothing is typed in by hand; a change to the dataset changes the catalog.
 *
 * Pure TypeScript, no React. The donor's own history (which items a donor has posted before) lives in postForm.ts.
 */
import { EVENINGS } from '../data/dataset';
import type { Evening, FoodCategory, FoodUnit, LotItem } from '../engine/types';

export interface CatalogEntry {
  foodItem: string;
  foodItemFil: string;
  foodCategory: FoodCategory;
  unit: FoodUnit;
  /**
   * estKg / quantity in the dataset: the median over every lot of this (foodItem, unit). The dataset rounds estKg to
   * two decimals, so for tiny units (sardines, about 0.155 kg per can) the ratios differ in the fourth decimal; the
   * median is the value the dataset's own lots most often carry.
   */
  kgPerUnit: number;
  /** Smallest quantity seen in the dataset. */
  minQty: number;
  /** Largest quantity seen in the dataset. */
  maxQty: number;
  needsFridgeIfKept: boolean;
  maxHoursUnrefrigerated: number;
}

/** The key that identifies one catalog entry. */
export const catalogKey = (foodItem: string, unit: FoodUnit): string => `${foodItem}|${unit}`;

/** Builds the catalog from a set of evenings. Sorted by the Filipino name, then the English one. */
export function buildCatalog(evenings: readonly Evening[]): CatalogEntry[] {
  const groups = new Map<string, { items: LotItem[]; ratios: number[] }>();
  for (const ev of evenings) {
    for (const lot of ev.lots) {
      for (const it of lot.items) {
        const key = catalogKey(it.foodItem, it.unit);
        let g = groups.get(key);
        if (!g) {
          g = { items: [], ratios: [] };
          groups.set(key, g);
        }
        g.items.push(it);
        g.ratios.push(it.estKg / it.quantity);
      }
    }
  }
  const entries: CatalogEntry[] = [];
  for (const g of groups.values()) {
    const first = g.items[0];
    const qs = g.items.map((i) => i.quantity);
    entries.push({
      foodItem: first.foodItem,
      foodItemFil: first.foodItemFil,
      foodCategory: first.foodCategory,
      unit: first.unit,
      kgPerUnit: median(g.ratios),
      minQty: Math.min(...qs),
      maxQty: Math.max(...qs),
      needsFridgeIfKept: first.needsFridgeIfKept,
      maxHoursUnrefrigerated: first.maxHoursUnrefrigerated,
    });
  }
  return entries.sort((a, b) => (a.foodItemFil < b.foodItemFil ? -1 : a.foodItemFil > b.foodItemFil ? 1 : a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0));
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(m * 1e6) / 1e6;
}

/** The catalog for every evening in the dataset. */
export const CATALOG: readonly CatalogEntry[] = buildCatalog(EVENINGS);

const BY_KEY = new Map(CATALOG.map((e) => [catalogKey(e.foodItem, e.unit), e] as const));

/** The catalog entry for one (foodItem, unit), or undefined if the dataset has none. */
export const findEntry = (foodItem: string, unit: FoodUnit): CatalogEntry | undefined => BY_KEY.get(catalogKey(foodItem, unit));

/** Estimated kg for a quantity of one item. Rounded to two decimals, as the dataset's estKg is. */
export function estKgFor(quantity: number, entry: CatalogEntry): number {
  return Math.round(quantity * entry.kgPerUnit * 100) / 100;
}

/**
 * Load units (FoodGo 1 to 3) for a live lot's quantity.
 *
 * ASSUMPTION, mirroring the dataset generator (salo-evening-dataset-repo/build_dataset.py, about lines 420 to 424):
 * the generator draws a size class 1 to 3 and places the quantity in [minQty, maxQty] at lo, the middle, or hi, with
 * noise. This is the inverse: the quantity's position in its item's range, read back as a size class. Because of the
 * noise the inverse is approximate. If minQty equals maxQty there is no range to read, so the lot is size 1.
 */
export function loadUnitsFor(quantity: number, entry: CatalogEntry): number {
  if (entry.minQty === entry.maxQty) return 1;
  const position = (quantity - entry.minQty) / (entry.maxQty - entry.minQty);
  return Math.min(3, Math.max(1, 1 + Math.round(2 * position)));
}

/** Stepper limits for one item: 1 to the largest quantity the dataset has seen. */
export const amountLimits = (entry: CatalogEntry): { min: 1; max: number } => ({ min: 1, max: entry.maxQty });
