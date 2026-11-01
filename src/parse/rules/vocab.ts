/**
 * Vocabulary for the rule-based fallback parser and for matching the LLM's food names.
 *
 * SOURCE AND FILTER (hard rule, Arjhine 2026-10-20). Every table in this file was built from the tuning messages only:
 *   data/parse-dev/donor_messages_tuning.csv, kept rows whose evening_id is E01..E10 (170 rows, split == "tuning").
 *   The filter is asserted in src/parse/__tests__/tuningCorpus.ts. Nothing here comes from the food catalog
 *   (src/donor), the dataset bundle (src/data), pilot messages (E11-E20) or main messages (E21-E64).
 *
 * Tables: CANONICAL_FOODS (distinct gold food_item + gold_unit pairs), SYNONYMS (surface forms seen in the tuning
 * messages), VAGUE_FOOD_WORDS, AMBIGUOUS_FOOD_WORDS, UNIT_WORDS, NUMBER_WORDS, HOUR_WORDS, TIME_CUES, HEDGE_WORDS.
 */
import type { FoodUnit } from '../../engine/types';

export interface CanonicalFood {
  /** The gold food_item string in the tuning CSV (English or Filipino-English as the dataset writes it). */
  food: string;
  /** The single gold unit seen for this food in the tuning rows. Used only when a quantity has no unit word. */
  unit: FoodUnit;
}

/**
 * The 21 distinct gold food_item values in the tuning rows, each with the one gold unit it carries. Every food has
 * exactly one non-empty gold unit across the 170 rows (a test checks this against the CSV).
 * Row counts with a non-empty unit: bananas 4, chicken adobo 14, chicken tinola 3, chop suey 1, eggplant 4,
 * ensaymada 8, fried chicken 17, giniling 12, ginisang monggo 8, instant noodles 1, lumpiang shanghai 19,
 * menudo 9, monay 9, pancit bihon 2, pancit canton 5, pandesal 12, pork adobo 12, pork sinigang 2,
 * sliced bread 4, steamed rice 1, tomatoes 4.
 */
export const CANONICAL_FOODS: readonly CanonicalFood[] = [
  { food: 'bananas', unit: 'kg' },
  { food: 'chicken adobo', unit: 'tray' },
  { food: 'chicken tinola', unit: 'pot' },
  { food: 'chop suey', unit: 'tray' },
  { food: 'eggplant', unit: 'kg' },
  { food: 'ensaymada', unit: 'piece' },
  { food: 'fried chicken', unit: 'piece' },
  { food: 'giniling', unit: 'tray' },
  { food: 'ginisang monggo', unit: 'pot' },
  { food: 'instant noodles', unit: 'pack' },
  { food: 'lumpiang shanghai', unit: 'piece' },
  { food: 'menudo', unit: 'tray' },
  { food: 'monay', unit: 'piece' },
  { food: 'pancit bihon', unit: 'bilao' },
  { food: 'pancit canton', unit: 'bilao' },
  { food: 'pandesal', unit: 'piece' },
  { food: 'pork adobo', unit: 'tray' },
  { food: 'pork sinigang', unit: 'pot' },
  { food: 'sliced bread', unit: 'loaf' },
  { food: 'steamed rice', unit: 'kg' },
  { food: 'tomatoes', unit: 'kg' },
];

/** Surface forms (lowercase, words separated by one space) that name each canonical food in the tuning messages. */
export const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  bananas: ['bananas', 'saging'],
  'chicken adobo': ['chicken adobo', 'adobong manok'],
  'chicken tinola': ['chicken tinola', 'tinolang manok'],
  'chop suey': ['chop suey', 'chopsuey'],
  eggplant: ['eggplant', 'talong'],
  ensaymada: ['ensaymada'],
  'fried chicken': ['fried chicken', 'pritong manok'],
  giniling: ['giniling'],
  'ginisang monggo': ['ginisang monggo', 'monggo'],
  'instant noodles': ['instant noodles'],
  'lumpiang shanghai': ['lumpiang shanghai'],
  menudo: ['menudo'],
  monay: ['monay'],
  'pancit bihon': ['pancit bihon'],
  'pancit canton': ['pancit canton'],
  pandesal: ['pandesal'],
  'pork adobo': ['pork adobo', 'adobong baboy'],
  'pork sinigang': ['pork sinigang', 'sinigang na baboy'],
  'sliced bread': ['sliced bread', 'tasty'],
  'steamed rice': ['steamed rice'],
  tomatoes: ['tomatoes', 'kamatis'],
};

/**
 * Words used in the tuning messages for "some food" with no name: the item is kept with its quantity and unit, and
 * flagged because no food is named (the gold food_item is empty for these rows).
 */
export const VAGUE_FOOD_WORDS: readonly string[] = ['food', 'pagkain'];

/**
 * "adobo" alone never appears as a named item in the tuning messages (they say "adobong manok" or "adobong baboy"),
 * so the meat is unknown. It is kept as raw text and flagged unmatched rather than guessed as pork or chicken.
 */
export const AMBIGUOUS_FOOD_WORDS: readonly string[] = ['adobo'];

/** Unit words (singular, plural, Filipino forms) to FoodUnit. Built from the unit words in the tuning messages. */
export const UNIT_WORDS: Readonly<Record<string, FoodUnit>> = {
  tray: 'tray',
  trays: 'tray',
  piraso: 'piece',
  pirasong: 'piece',
  piece: 'piece',
  pieces: 'piece',
  kilo: 'kg',
  kilos: 'kg',
  kilong: 'kg',
  kg: 'kg',
  bilao: 'bilao',
  bilaos: 'bilao',
  bilaong: 'bilao',
  pot: 'pot',
  pots: 'pot',
  kaldero: 'pot',
  kalderong: 'pot',
  loaf: 'loaf',
  loaves: 'loaf',
  balot: 'loaf',
  pack: 'pack',
  packs: 'pack',
};

/** Number words used in the tuning messages (Filipino and English). Digits are handled separately. */
export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  isa: 1,
  isang: 1,
  one: 1,
  dalawa: 2,
  dalawang: 2,
  two: 2,
  tatlo: 3,
  tatlong: 3,
  three: 3,
  apat: 4,
  four: 4,
  lima: 5,
  limang: 5,
  five: 5,
  anim: 6,
  six: 6,
  sampu: 10,
  sampung: 10,
  ten: 10,
};

/** Hour words after "alas" ("alas-siyete" is 7 o'clock), as they appear in the tuning messages. */
export const HOUR_WORDS: Readonly<Record<string, number>> = {
  sais: 6,
  siyete: 7,
  otso: 8,
  nuwebe: 9,
};

/**
 * Words that make a bare number a clock time when they come right before it ("before 8", "bago mag-8", "by around 7").
 * "alas" is handled with HOUR_WORDS, not here.
 */
export const TIME_CUES: ReadonlySet<string> = new Set(['before', 'by', 'until', 'bago', 'hanggang', 'around', 'than', 'mag']);

/**
 * A bare hour right after "or" is an alternative pickup time ("before 8 PM... or 9? whichever") unless the next word
 * shows it is a quantity hedge ("or 12 yata ng instant noodles"). These are the next words that block it.
 */
export const ALT_TIME_BLOCKERS: ReadonlySet<string> = new Set(['yata', 'sure', 'maybe']);

/** Words that make a number a hedge, not a fact, when they come within three tokens after a quantity. */
export const HEDGE_WORDS: ReadonlySet<string> = new Set(['or', 'o', 'maybe', 'yata', 'whichever', 'sure']);

/** Lookup for an LLM or fallback food name: lowercased surface form to canonical food, or null. */
const SURFACE_TO_CANONICAL: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const { food } of CANONICAL_FOODS) m.set(food, food);
  for (const [canon, forms] of Object.entries(SYNONYMS)) for (const f of forms) m.set(f, canon);
  return m;
})();

/**
 * The canonical food for a name (a canonical name or any tuning synonym, case and spacing insensitive), or null.
 * "adobo", "food" and any unknown name return null.
 */
export function canonicalFor(name: string): string | null {
  const key = name.toLowerCase().replace(/[^a-zñ]+/g, ' ').trim().replace(/\s+/g, ' ');
  return SURFACE_TO_CANONICAL.get(key) ?? null;
}
