/**
 * Rule-based fallback parser (architecture 5.4). Pure TypeScript, no network, no catalog.
 *
 * Output is a ParseResponse with source "fallback". The vocabulary is in ./vocab.ts (tuning messages only).
 *
 * How a message is read:
 *  1. Tokenize the lowercased text (hyphens become spaces, so "mag-8" is "mag 8" and "pa-pickup" is "pa pickup").
 *  2. Clock times: "HH:MM", a bare number after a time cue ("before 8", "bago mag-8", "by around 7"), a number with
 *     pm/am, or an hour word after "alas" ("alas-siyete"), with "y medya" meaning half past. A bare hour 1..11 is PM
 *     ("before 8" is 20:00). Exactly one clock time gives pickup_by; zero or several give null.
 *  3. Food names: longest surface match first (CANONICAL names and SYNONYMS), plus the vague words ("food", "pagkain",
 *     kept with no canonical name) and the ambiguous word "adobo" (kept as raw text).
 *  4. Quantities: a number followed by a unit word ("3 trays", "isang kilong", "anim na balot"), or a number directly
 *     before a food name ("20 pandesal"), where the unit is the food's single tuning unit.
 *  5. Each quantity or unit phrase belongs to the nearest food name (after it, or else before it).
 *  6. A quantity is null when two quantities attach to one food, or when a hedge word ("or", "o", "maybe", "yata",
 *     "whichever", "sure") comes within three tokens after it. A message with several clock times has pickup_by null.
 */
import type { FoodUnit } from '../../engine/types';
import type { ParseResponse, ParseResponseItem } from '../types';
import {
  AMBIGUOUS_FOOD_WORDS,
  CANONICAL_FOODS,
  HEDGE_WORDS,
  ALT_TIME_BLOCKERS,
  HOUR_WORDS,
  NUMBER_WORDS,
  SYNONYMS,
  TIME_CUES,
  UNIT_WORDS,
  VAGUE_FOOD_WORDS,
} from './vocab';

/** Read an own property of a lookup table (so "constructor" or "toString" never match). */
function own<T>(table: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

interface Tok {
  w: string;
  kind: 'word' | 'num' | 'hm' | 'ord';
}

interface Span {
  start: number;
  end: number;
}

interface Clock extends Span {
  minute: number;
}

interface Food extends Span {
  canonical: string | null;
  vague: boolean;
  raw: string;
}

interface Phrase extends Span {
  qty: number | null;
  unit: FoodUnit | null;
  hasUnit: boolean;
}

const DEFAULT_UNIT: Readonly<Record<string, FoodUnit>> = Object.fromEntries(CANONICAL_FOODS.map((c) => [c.food, c.unit]));

const MAX_ITEMS = 10;
const HEDGE_WINDOW = 3;

/** Longest surface forms first, so "pork adobo" wins over "adobo". */
const SURFACES: { tokens: string[]; canonical: string | null; vague: boolean }[] = (() => {
  const out: { tokens: string[]; canonical: string | null; vague: boolean }[] = [];
  for (const [canon, forms] of Object.entries(SYNONYMS)) {
    for (const f of forms) out.push({ tokens: f.split(' '), canonical: canon, vague: false });
  }
  for (const w of VAGUE_FOOD_WORDS) out.push({ tokens: [w], canonical: null, vague: true });
  for (const w of AMBIGUOUS_FOOD_WORDS) out.push({ tokens: [w], canonical: null, vague: false });
  return out.sort((a, b) => b.tokens.length - a.tokens.length);
})();

function tokenize(text: string): Tok[] {
  const norm = text
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/-/g, ' ')
    .replace(/(\d)\s*(am|pm)\b/g, '$1 $2');
  const re = /\d{1,2}:\d{2}|\d+(?:st|nd|rd|th)\b|\d+|[a-zñ]+/g;
  const out: Tok[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(norm)) !== null) {
    const w = m[0];
    const kind: Tok['kind'] = w.includes(':') ? 'hm' : /^\d+$/.test(w) ? 'num' : /\d/.test(w) ? 'ord' : 'word';
    out.push({ w, kind });
  }
  return out;
}

/** A bare hour 1..12 right after "or", not followed by a quantity hedge: an alternative pickup time. */
const isAltTime = (toks: Tok[], i: number): boolean => {
  const prev = i > 0 ? toks[i - 1].w : '';
  const n = Number(toks[i].w);
  return (prev === 'or' || prev === 'o') && n >= 1 && n <= 12 && !ALT_TIME_BLOCKERS.has(toks[i + 1]?.w ?? '');
};

const isAmPm = (t: Tok | undefined): boolean => t !== undefined && (t.w === 'pm' || t.w === 'am');

function findClocks(toks: Tok[]): Clock[] {
  const out: Clock[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const prev = i > 0 ? toks[i - 1].w : '';
    let hour: number | null = null;
    let minute = 0;
    let end = i + 1;
    if (t.kind === 'hm') {
      const [h, m] = t.w.split(':').map(Number);
      hour = h;
      minute = m;
    } else if (t.kind === 'num' && t.w.length <= 2 && (TIME_CUES.has(prev) || isAmPm(toks[i + 1]) || isAltTime(toks, i))) {
      hour = Number(t.w);
    } else if (t.kind === 'word' && prev === 'alas' && own(HOUR_WORDS, t.w) !== undefined) {
      hour = own(HOUR_WORDS, t.w) ?? null;
    }
    if (hour === null) continue;
    const ap = toks[end];
    if (isAmPm(ap)) {
      end++;
      if (ap.w === 'pm' && hour < 12) hour += 12;
      if (ap.w === 'am' && hour === 12) hour = 0;
    } else if (hour >= 1 && hour <= 11) {
      hour += 12; // a bare evening hour is PM (architecture 5.1)
    }
    if (minute === 0 && toks[end]?.w === 'y' && toks[end + 1]?.w === 'medya') {
      minute = 30;
      end += 2;
    }
    if (hour > 23 || minute > 59) continue;
    out.push({ start: i, end, minute: hour * 60 + minute });
    i = end - 1;
  }
  return out;
}

function findFoods(toks: Tok[], clockTokens: Set<number>): Food[] {
  const used = new Set<number>();
  const found: Food[] = [];
  for (const s of SURFACES) {
    const n = s.tokens.length;
    for (let i = 0; i + n <= toks.length; i++) {
      let match = true;
      for (let k = 0; k < n && match; k++) {
        if (toks[i + k].w !== s.tokens[k] || used.has(i + k) || clockTokens.has(i + k)) match = false;
      }
      if (!match) continue;
      for (let k = 0; k < n; k++) used.add(i + k);
      found.push({ start: i, end: i + n, canonical: s.canonical, vague: s.vague, raw: s.tokens.join(' ') });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

const numberValue = (t: Tok | undefined): number | null => {
  if (!t) return null;
  if (t.kind === 'num') return Number(t.w);
  if (t.kind === 'word') return own(NUMBER_WORDS, t.w) ?? null;
  return null;
};

const unitOf = (t: Tok | undefined): FoodUnit | null => (t && t.kind === 'word' ? own(UNIT_WORDS, t.w) ?? null : null);

function findPhrases(toks: Tok[], clockTokens: Set<number>, foodStarts: Set<number>): Phrase[] {
  const out: Phrase[] = [];
  let i = 0;
  while (i < toks.length) {
    if (clockTokens.has(i)) {
      i++;
      continue;
    }
    const v = numberValue(toks[i]);
    if (v !== null) {
      let k = i + 1;
      if (toks[k]?.w === 'na' && unitOf(toks[k + 1]) !== null) k++;
      const u = unitOf(toks[k]);
      if (u !== null) {
        out.push({ start: i, end: k + 1, qty: v, unit: u, hasUnit: true });
        i = k + 1;
        continue;
      }
      if (foodStarts.has(i + 1) || (toks[i + 1]?.w === 'na' && foodStarts.has(i + 2))) {
        out.push({ start: i, end: i + 1, qty: v, unit: null, hasUnit: false });
      }
      i++;
      continue;
    }
    const u = unitOf(toks[i]);
    if (u !== null) out.push({ start: i, end: i + 1, qty: null, unit: u, hasUnit: true });
    i++;
  }
  return out;
}

const hedged = (p: Phrase, toks: Tok[]): boolean => {
  for (let k = p.end; k < Math.min(toks.length, p.end + HEDGE_WINDOW); k++) {
    if (HEDGE_WORDS.has(toks[k].w)) return true;
  }
  return false;
};

/** Nearest food name for a phrase: the first after it, unless one before it is strictly closer. */
function nearestFood(p: Phrase, foods: Food[]): number | null {
  let after = -1;
  let before = -1;
  for (let idx = 0; idx < foods.length; idx++) {
    const f = foods[idx];
    if (f.start >= p.end && (after < 0 || f.start < foods[after].start)) after = idx;
    if (f.end <= p.start && (before < 0 || f.end > foods[before].end)) before = idx;
  }
  if (after >= 0 && before >= 0) {
    return foods[after].start - p.end <= p.start - foods[before].end ? after : before;
  }
  if (after >= 0) return after;
  return before >= 0 ? before : null;
}

const pad2 = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

/** Read a message with the rule-based fallback. Never throws for a string input. */
export function parseRules(text: string): ParseResponse {
  const toks = tokenize(text);
  const clocks = findClocks(toks);
  const clockTokens = new Set<number>();
  for (const c of clocks) for (let k = c.start; k < c.end; k++) clockTokens.add(k);

  const foods = findFoods(toks, clockTokens);
  const foodStarts = new Set(foods.map((f) => f.start));
  const phrases = findPhrases(toks, clockTokens, foodStarts);

  const byFood = new Map<number, Phrase[]>();
  for (const p of phrases) {
    const idx = nearestFood(p, foods);
    if (idx === null) continue;
    byFood.set(idx, [...(byFood.get(idx) ?? []), p]);
  }

  const items: ParseResponseItem[] = foods.slice(0, MAX_ITEMS).map((f, idx) => {
    const own_ = byFood.get(idx) ?? [];
    const qtyPhrases = own_.filter((p) => p.qty !== null);
    const single = qtyPhrases.length === 1 ? qtyPhrases[0] : null;
    const quantity = single && !hedged(single, toks) ? single.qty : null;
    const withUnit = own_.find((p) => p.hasUnit);
    const unit = withUnit?.unit ?? (single && f.canonical !== null ? (own(DEFAULT_UNIT, f.canonical) ?? null) : null);
    return { food_item: f.canonical ?? f.raw, quantity, unit };
  });

  const pickup = clocks.length === 1 ? clocks[0].minute : null;
  const missing = new Set<string>();
  if (items.length === 0 || foods.some((f) => f.vague)) missing.add('food_item');
  for (const it of items) {
    if (it.quantity === null) missing.add('quantity');
    if (it.unit === null) missing.add('unit');
  }
  if (pickup === null) missing.add('pickup_by');

  return {
    items,
    pickup_by: pickup === null ? null : `${pad2(Math.floor(pickup / 60))}:${pad2(pickup % 60)}`,
    missing: [...missing],
    source: 'fallback',
  };
}
