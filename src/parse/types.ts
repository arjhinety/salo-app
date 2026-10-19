/**
 * Parser types. Pure TypeScript, no React, no network.
 *
 * ParseResponse is the wire shape of the LLM proxy's 200 body (architecture 5.1) and also the output of the rule-based
 * fallback (source "fallback"). ParsedDraft is what the app uses after toDraft() maps food names to canonical items.
 * Catalog mapping (kg per unit, load units) is not done here; the wiring step outside src/parse does it.
 */
import type { FoodUnit } from '../engine/types';

export interface ParseResponseItem {
  food_item: string;
  quantity: number | null;
  unit: FoodUnit | null;
}

export interface ParseResponse {
  items: ParseResponseItem[];
  /** "HH:MM" pickup deadline (a pickup time, not an expiry), or null. */
  pickup_by: string | null;
  /** Names of the fields the parser could not find. */
  missing: string[];
  source: 'llm' | 'fallback';
  model?: string;
}

export type ItemFlag = 'unmatched_item' | 'missing_quantity' | 'missing_unit';

export interface ParsedItem {
  /** The canonical food name from the tuning vocabulary, or null when the name is not matched. */
  foodItem: string | null;
  /** The food text as the parser (or the LLM) wrote it. */
  rawText: string;
  quantity: number | null;
  unit: FoodUnit | null;
  flags: ItemFlag[];
}

export interface ParsedDraft {
  items: ParsedItem[];
  /** Minutes after midnight (16:00 is 960), or null. */
  pickupByMinute: number | null;
  source: 'llm' | 'fallback';
}
