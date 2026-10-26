import { CATALOG, findEntry } from '../catalog';
import {
  ADOBO_CHOICES,
  applyParse,
  canPostLines,
  chooseEntry,
  lineFromEntry,
  pickupFromParse,
  pickupOptions,
  readyItems,
  reviewLine,
  type DraftLine,
} from '../fromParsed';
import { clampAmount, MAX_DRAFT_ITEMS } from '../postForm';
import { hhmm } from '../tonight';
import { parseMessage } from '../../parse/client';
import { toDraft, validateResponse } from '../../parse/validate';
import type { ParsedDraft, ParsedItem } from '../../parse/types';
import { S } from '../../i18n/strings';

const clock = (h: number, m: number) => h * 60 + m;

/** A ParsedDraft built by hand, so each mapping case is literal. */
function draft(items: (Partial<ParsedItem> & Pick<ParsedItem, 'foodItem' | 'quantity' | 'unit'>)[], pickup: number | null, source: 'llm' | 'fallback' = 'llm'): ParsedDraft {
  return {
    items: items.map((it) => ({ rawText: it.foodItem ?? '', flags: [], ...it })),
    pickupByMinute: pickup,
    source,
  };
}

const entryOf = (name: string, unit: 'piece' | 'tray') => {
  const e = findEntry(name, unit);
  if (!e) throw new Error(`catalog has no ${name} in ${unit}`);
  return e;
};

describe('pandesal 20 piece', () => {
  test('maps to the pandesal entry with quantity 20, ready to post', () => {
    const lines = applyParse([], draft([{ foodItem: 'pandesal', rawText: 'pandesal', quantity: 20, unit: 'piece' }], null));
    const pandesal = entryOf('pandesal', 'piece');
    expect(lines).toHaveLength(1);
    expect(reviewLine(lines[0]).entry).toBe(pandesal);
    expect(lines[0].quantity).toBe(20);
    expect(reviewLine(lines[0]).issues).toEqual([]);
    expect(readyItems(lines)).toEqual([{ foodItem: 'pandesal', unit: 'piece', quantity: 20 }]);
  });
});

describe('bare adobo', () => {
  test('is unmatched, and the donor is offered exactly pork adobo then chicken adobo', () => {
    const lines = applyParse([], draft([{ foodItem: null, rawText: 'adobo', quantity: 3, unit: 'tray' }], null));
    const review = reviewLine(lines[0]);
    expect(review.entry).toBeNull();
    expect(review.issues).toEqual(['unmatched']);
    expect(review.choices.map((e) => e.foodItem)).toEqual(['pork adobo', 'chicken adobo']);
    expect(ADOBO_CHOICES).toEqual(['pork adobo', 'chicken adobo']);
  });

  test('choosing a chip resolves the card and keeps the parsed quantity', () => {
    const lines = applyParse([], draft([{ foodItem: null, rawText: 'adobo', quantity: 3, unit: 'tray' }], clock(20, 0)));
    const chosen = chooseEntry(lines[0], reviewLine(lines[0]).choices[1]);
    expect(reviewLine(chosen).issues).toEqual([]);
    expect(chosen.foodItem).toBe('chicken adobo');
    expect(chosen.quantity).toBe(3);
  });

  test('posting is blocked until a choice is made', () => {
    const lines = applyParse([], draft([{ foodItem: null, rawText: 'adobo', quantity: 3, unit: 'tray' }], clock(20, 0)));
    expect(canPostLines(lines, clock(20, 0))).toBe(false);
  });
});

describe('missing quantity', () => {
  test('the amount is empty, the missing field is named, and posting is blocked', () => {
    const lines = applyParse([], draft([{ foodItem: 'pandesal', rawText: 'pandesal', quantity: null, unit: 'piece' }], clock(20, 0)));
    expect(reviewLine(lines[0]).issues).toEqual(['missing_quantity']);
    expect(S.parsePost.missingQuantity).toContain('Walang nabanggit na dami');
    expect(canPostLines(lines, clock(20, 0))).toBe(false);
  });
});

describe('quantity above the catalog maximum', () => {
  test('is flagged, keeps the parsed number, and blocks posting until the stepper lowers it to the maximum', () => {
    const pandesal = entryOf('pandesal', 'piece');
    const over = pandesal.maxQty + 5;
    const lines = applyParse([], draft([{ foodItem: 'pandesal', rawText: 'pandesal', quantity: over, unit: 'piece' }], clock(20, 0)));
    expect(lines[0].quantity).toBe(over);
    expect(reviewLine(lines[0]).issues).toEqual(['over_max']);
    expect(canPostLines(lines, clock(20, 0))).toBe(false);

    // One tap of the minus stepper: the card sets clampAmount(entry, quantity - 1), which lands on maxQty.
    const lowered = clampAmount(pandesal, over - 1);
    expect(lowered).toBe(pandesal.maxQty);
    const after: DraftLine[] = [{ ...lines[0], quantity: lowered }];
    expect(reviewLine(after[0]).issues).toEqual([]);
    expect(canPostLines(after, clock(20, 0))).toBe(true);
  });
});

describe('pickup time', () => {
  test('20:00 at 18:00 is preselected and added as a chip', () => {
    const decision = pickupFromParse(clock(20, 0), clock(18, 0));
    expect(decision).toEqual({ extra: clock(20, 0), chosen: clock(20, 0), ask: false });
    expect(pickupOptions(clock(18, 0), decision.extra)).toContain(clock(20, 0));
    expect(hhmm(clock(20, 0))).toBe('8:00 PM');

    const lines = applyParse([], draft([{ foodItem: 'pandesal', rawText: 'pandesal', quantity: 20, unit: 'piece' }], clock(20, 0)));
    expect(canPostLines(lines, decision.chosen)).toBe(true);
  });

  test('23:00 is not preselected and the donor is asked to choose', () => {
    const decision = pickupFromParse(clock(23, 0), clock(18, 0));
    expect(decision).toEqual({ extra: null, chosen: null, ask: true });
    expect(pickupOptions(clock(18, 0), decision.extra)).not.toContain(clock(23, 0));
  });

  test('a missing pickup time asks the donor to choose', () => {
    expect(pickupFromParse(null, clock(18, 0))).toEqual({ extra: null, chosen: null, ask: true });
  });

  test('a time at or before the clock is invalid', () => {
    expect(pickupFromParse(clock(17, 0), clock(18, 0)).ask).toBe(true);
  });
});

describe('fallback source', () => {
  test('a rules-parsed reply (source fallback) is marked as such', async () => {
    const fetchImpl = (async () => ({ status: 503, json: async () => ({}) })) as unknown as typeof fetch;
    const result = await parseMessage('may 3 trays adobo pa at 20 pandesal, kunin before 8', { baseUrl: 'http://10.0.2.2:8787', fetchImpl });
    expect(result.source).toBe('fallback');
  });

  test('a validated proxy reply (source llm) is not marked as fallback', async () => {
    const body = {
      items: [
        { food_item: 'pandesal', quantity: 20, unit: 'piece' },
      ],
      pickup_by: '20:00',
      missing: [],
      source: 'llm',
      model: 'claude-haiku-5-5',
    };
    const fetchImpl = (async () => ({ status: 200, json: async () => body })) as unknown as typeof fetch;
    const result = await parseMessage('pandesal 20 piece, kunin before 8', { baseUrl: 'http://10.0.2.2:8787', fetchImpl });
    expect(result.source).toBe('llm');
    expect(result.pickupByMinute).toBe(clock(20, 0));
  });
});

describe('sending the same text twice', () => {
  test('replaces the parsed cards instead of duplicating them', () => {
    const d = draft(
      [
        { foodItem: 'pandesal', rawText: 'pandesal', quantity: 20, unit: 'piece' },
        { foodItem: null, rawText: 'adobo', quantity: 3, unit: 'tray' },
      ],
      clock(20, 0),
    );
    const once = applyParse([], d);
    const twice = applyParse(once, d);
    expect(twice).toHaveLength(2);
    expect(twice).toEqual(once);
  });

  test('keeps the cards the donor added by hand', () => {
    const d = draft([{ foodItem: 'pandesal', rawText: 'pandesal', quantity: 20, unit: 'piece' }], null);
    const manual = lineFromEntry(entryOf('pandesal', 'piece'));
    const after = applyParse(applyParse([manual], d), d);
    expect(after.filter((l) => l.origin === 'manual')).toEqual([manual]);
    expect(after.filter((l) => l.origin === 'parsed')).toHaveLength(1);
  });
});

describe('contract path', () => {
  test('a proxy reply goes through validation and maps to cards', () => {
    const resp = validateResponse({
      items: [
        { food_item: 'pandesal', quantity: 20, unit: 'piece' },
        { food_item: 'adobo', quantity: 3, unit: 'tray' },
      ],
      pickup_by: '20:00',
      missing: [],
      source: 'llm',
    });
    expect(resp).not.toBeNull();
    const lines = applyParse([], toDraft(resp!));
    expect(lines.map((l) => reviewLine(l).issues)).toEqual([[], ['unmatched']]);
  });
});

test('the catalog holds the adobo choices and the picker limit is unchanged', () => {
  for (const name of ADOBO_CHOICES) {
    expect(CATALOG.some((e) => e.foodItem === name)).toBe(true);
  }
  expect(MAX_DRAFT_ITEMS).toBe(5);
});
