/**
 * Per-row scoring shared by the fallback eval and the Claude-path eval. Pure TypeScript, no network.
 *
 * Scoring boundary: the input is the raw ParseResponse (src/parse output), before any catalog mapping. This file imports
 * nothing from src/donor or src/data (checked by src/parse/__tests__/imports.test.ts).
 */
import { CANONICAL_FOODS } from '../rules/vocab';
import type { ParseResponse } from '../types';

export type Field = 'food' | 'quantity' | 'unit' | 'pickup' | 'all';
export const FIELDS: readonly Field[] = ['food', 'quantity', 'unit', 'pickup', 'all'];

export interface FieldScores {
  food: boolean;
  quantity: boolean;
  unit: boolean;
  pickup: boolean;
  /** food && quantity && unit && pickup. */
  all: boolean;
}

/** The gold columns of one tuning row (blank strings are empty values). */
export interface GoldRow {
  gold_food_item: string;
  gold_quantity: number | null;
  gold_unit: string;
  gold_pickup_by: string | null;
}

export interface ScoredRow extends GoldRow {
  message_id: string;
  evening_id: string;
  language: string;
  difficulty: string;
}

const CANONICAL_NAMES: ReadonlySet<string> = new Set(CANONICAL_FOODS.map((c) => c.food));

/**
 * Compares the first item and pickup_by of a ParseResponse with the gold row. The food name counts only when the parser
 * wrote a canonical name (otherwise it is no match). null means no usable response: every field is false.
 */
export function scoreResponse(row: GoldRow, resp: ParseResponse | null): FieldScores {
  if (resp === null) return { food: false, quantity: false, unit: false, pickup: false, all: false };
  const item = resp.items[0];
  const predFood = item !== undefined && CANONICAL_NAMES.has(item.food_item) ? item.food_item : null;
  const goldFood = row.gold_food_item === '' ? null : row.gold_food_item;
  const goldUnit = row.gold_unit === '' ? null : row.gold_unit;
  const food = predFood === goldFood;
  const quantity = (item?.quantity ?? null) === row.gold_quantity;
  const unit = (item?.unit ?? null) === goldUnit;
  const pickup = resp.pickup_by === row.gold_pickup_by;
  return { food, quantity, unit, pickup, all: food && quantity && unit && pickup };
}
