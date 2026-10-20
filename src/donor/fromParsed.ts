/**
 * Maps the parser's output (ParsedDraft, src/parse) to the post screen's cards. Pure TypeScript, no React.
 *
 * It lives here, outside src/parse, on purpose: the parser must not import the post form's catalog (decision "Parser
 * development data: tuning evenings only"). Mapping a parsed name to a catalog entry happens after parsing.
 *
 * Nothing is silently fixed. A line the catalog cannot place (an unknown item, a missing unit, a quantity above the
 * item's maximum, a missing quantity) stays on its card with the issue named, and posting is blocked until the donor
 * resolves it (DON-02, D-17). A parsed pickup time is preselected only when it is a valid chip time (DON-03).
 */
import type { FoodUnit, Minute } from '../engine/types';
import type { ParsedDraft, ParsedItem } from '../parse/types';
import { CATALOG, catalogKey, findEntry, type CatalogEntry } from './catalog';
import { PICKUP_LATEST, pickupChoices, type DraftItem } from './postForm';

/** Where a card came from. Sending a message replaces only the 'parsed' cards; picks made by hand stay. */
export type LineOrigin = 'manual' | 'parsed';

/** Why a card is not ready to post. An empty list (with an entry) means the card is ready. */
export type LineIssue = 'unmatched' | 'missing_unit' | 'missing_quantity' | 'over_max';

/** One card on the post screen. `foodItem` and `unit` are null until the line names a catalog entry. */
export interface DraftLine {
  origin: LineOrigin;
  /** The name as the parser wrote it. Manual picks carry the catalog's English name. */
  rawText: string;
  foodItem: string | null;
  unit: FoodUnit | null;
  quantity: number | null;
}

export interface LineReview {
  /** The catalog entry the line resolves to, or null when item and unit are not both known. */
  entry: CatalogEntry | null;
  issues: LineIssue[];
  /** Chips the donor can choose from, for a line that does not resolve. Empty when there is nothing to offer. */
  choices: CatalogEntry[];
}

/** A bare "adobo" names no meat, so the donor is offered exactly these two, in this order, before anything else. */
export const ADOBO_CHOICES: readonly string[] = ['pork adobo', 'chicken adobo'];

/** At most this many chips on one card. */
const MAX_CHOICES = 6;

/** The donor's pickup decision after a parse: an extra chip, a preselected chip, or a request to choose. */
export interface PickupDecision {
  /** A valid parsed time, offered as an extra chip when it is not already one. */
  extra: Minute | null;
  /** The chip to preselect, or null. */
  chosen: Minute | null;
  /** True when no time was preselected because the parsed time was invalid or missing. */
  ask: boolean;
}

const normalize = (text: string): string => text.toLowerCase().replace(/[^a-zñ]+/g, ' ').trim().replace(/\s+/g, ' ');

const entriesFor = (foodItem: string): CatalogEntry[] => CATALOG.filter((e) => e.foodItem === foodItem);

/** The catalog entry for a name in a given unit, or else the first entry for the name (the donor confirms the unit). */
function entryFor(foodItem: string, unit: FoodUnit | null): CatalogEntry | undefined {
  if (unit !== null) {
    const exact = findEntry(foodItem, unit);
    if (exact) return exact;
  }
  return entriesFor(foodItem)[0];
}

/** Chips for a name the catalog does not know: the adobo pair, or catalog items sharing a word with the text. */
function candidatesFor(rawText: string, unit: FoodUnit | null): CatalogEntry[] {
  const text = normalize(rawText);
  if (text === 'adobo') {
    const out: CatalogEntry[] = [];
    for (const name of ADOBO_CHOICES) {
      const e = entryFor(name, unit);
      if (e) out.push(e);
    }
    return out;
  }
  const words = text.split(' ').filter((w) => w.length >= 3);
  if (words.length === 0) return [];
  const hits = CATALOG.filter((e) => {
    const names = `${e.foodItem} ${e.foodItemFil}`.toLowerCase();
    return words.some((w) => names.includes(w));
  });
  // Same unit first, so a "tray" line offers tray items before others.
  hits.sort((a, b) => Number(b.unit === unit) - Number(a.unit === unit));
  return hits.slice(0, MAX_CHOICES);
}

/** Reviews one line against the catalog. Pure: the issues are derived, never stored. */
export function reviewLine(line: DraftLine): LineReview {
  if (line.foodItem === null) {
    return { entry: null, issues: ['unmatched'], choices: candidatesFor(line.rawText, line.unit) };
  }
  if (line.unit === null) {
    return { entry: null, issues: ['missing_unit'], choices: entriesFor(line.foodItem).slice(0, MAX_CHOICES) };
  }
  const entry = findEntry(line.foodItem, line.unit);
  if (!entry) {
    return { entry: null, issues: ['unmatched'], choices: entriesFor(line.foodItem).slice(0, MAX_CHOICES) };
  }
  const issues: LineIssue[] = [];
  if (line.quantity === null) issues.push('missing_quantity');
  else if (line.quantity > entry.maxQty) issues.push('over_max');
  return { entry, issues, choices: [] };
}

/** True when the line names a catalog entry and has an amount inside the item's limits. */
export function isReady(line: DraftLine): boolean {
  const r = reviewLine(line);
  return r.entry !== null && r.issues.length === 0;
}

/** The line after the donor picks a catalog entry for it. The quantity the parser gave is kept. */
export function chooseEntry(line: DraftLine, entry: CatalogEntry): DraftLine {
  return { ...line, foodItem: entry.foodItem, unit: entry.unit };
}

/** A card from a parsed item. The parser's canonical name and unit are kept as they are. */
export function lineFromParsed(item: ParsedItem): DraftLine {
  return { origin: 'parsed', rawText: item.rawText, foodItem: item.foodItem, unit: item.unit, quantity: item.quantity };
}

/** A card from a manual pick: the smallest amount the dataset has seen, as the manual form does. */
export function lineFromEntry(entry: CatalogEntry): DraftLine {
  return { origin: 'manual', rawText: entry.foodItem, foodItem: entry.foodItem, unit: entry.unit, quantity: entry.minQty };
}

/**
 * The cards after a parse: every parsed card is replaced by the new parse, and manual picks are kept. Sending the same
 * text twice therefore leaves the same cards, not two copies.
 */
export function applyParse(lines: readonly DraftLine[], draft: ParsedDraft): DraftLine[] {
  return [...lines.filter((l) => l.origin === 'manual'), ...draft.items.map(lineFromParsed)];
}

/** A parsed pickup minute is valid when it is after the clock and no later than 21:00 (the latest chip). */
export function isValidParsedPickup(minute: number | null, clock: Minute): boolean {
  return minute !== null && minute > clock && minute <= PICKUP_LATEST;
}

/**
 * The pickup decision for a parse. A valid time is preselected and offered as a chip. An invalid or missing time gives
 * no preselection and asks the donor to pick (DON-03).
 */
export function pickupFromParse(parsed: number | null, clock: Minute): PickupDecision {
  if (isValidParsedPickup(parsed, clock)) return { extra: parsed, chosen: parsed, ask: false };
  return { extra: null, chosen: null, ask: true };
}

/** The pickup chips: the clock's chips, plus the parsed time when it is valid and not already one of them. */
export function pickupOptions(clock: Minute, extra: Minute | null): Minute[] {
  const base = pickupChoices(clock);
  if (extra === null || !isValidParsedPickup(extra, clock) || base.includes(extra)) return base;
  return [...base, extra].sort((a, b) => a - b);
}

/** True when every line is ready and a pickup time is chosen. The post button follows this. */
export function canPostLines(lines: readonly DraftLine[], pickup: Minute | null): boolean {
  return lines.length > 0 && pickup !== null && lines.every(isReady);
}

/** The DraftItems for ready lines. Call only when canPostLines is true; not-ready lines are skipped. */
export function readyItems(lines: readonly DraftLine[]): DraftItem[] {
  const out: DraftItem[] = [];
  for (const line of lines) {
    const r = reviewLine(line);
    if (r.entry && r.issues.length === 0 && line.quantity !== null) {
      out.push({ foodItem: r.entry.foodItem, unit: r.entry.unit, quantity: line.quantity });
    }
  }
  return out;
}

/** The key of the catalog entry a line resolves to, for the manual picker's selected state. */
export function lineKey(line: DraftLine): string | null {
  const e = reviewLine(line).entry;
  return e ? catalogKey(e.foodItem, e.unit) : null;
}
