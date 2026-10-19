import { parseRules } from '../rules';
import { CANONICAL_FOODS, SYNONYMS } from '../rules/vocab';
import { toDraft } from '../validate';
import { loadTuningRows, TUNING_ROW_COUNT, tuningRow } from './tuningCorpus';

describe('parseRules: the two spec messages', () => {
  it('"may 3 trays adobo pa at 20 pandesal, kunin before 8" gives adobo 3 tray, pandesal 20 piece, pickup 20:00', () => {
    const r = parseRules('may 3 trays adobo pa at 20 pandesal, kunin before 8');
    expect(r.source).toBe('fallback');
    expect(r.items).toEqual([
      { food_item: 'adobo', quantity: 3, unit: 'tray' },
      { food_item: 'pandesal', quantity: 20, unit: 'piece' },
    ]);
    expect(r.pickup_by).toBe('20:00');
    expect(r.missing).toEqual([]);
  });

  it('adobo with no meat is kept as raw text and flagged unmatched (no tuning message names it alone)', () => {
    const draft = toDraft(parseRules('may 3 trays adobo pa at 20 pandesal, kunin before 8'));
    expect(draft.source).toBe('fallback');
    expect(draft.items[0]).toEqual({ foodItem: null, rawText: 'adobo', quantity: 3, unit: 'tray', flags: ['unmatched_item'] });
    expect(draft.items[1]).toEqual({ foodItem: 'pandesal', rawText: 'pandesal', quantity: 20, unit: 'piece', flags: [] });
    expect(draft.pickupByMinute).toBe(1200);
  });

  it('"3 trays adobo, pickup before 8" gives adobo 3 tray and pickup 20:00', () => {
    const r = parseRules('3 trays adobo, pickup before 8');
    expect(r.items).toEqual([{ food_item: 'adobo', quantity: 3, unit: 'tray' }]);
    expect(r.pickup_by).toBe('20:00');
  });

  it('English "3 trays adobo, pickup before 8" reads the same as the Taglish one', () => {
    expect(parseRules('We have 3 trays of pork adobo left, pickup before 8 PM').items).toEqual([
      { food_item: 'pork adobo', quantity: 3, unit: 'tray' },
    ]);
  });

  it('an empty message gives no items and says what is missing', () => {
    const r = parseRules('');
    expect(r.items).toEqual([]);
    expect(r.pickup_by).toBeNull();
    expect(r.missing).toEqual(['food_item', 'pickup_by']);
  });
});

describe('parseRules: five tuning messages with their gold values', () => {
  // Each expectation is a literal, and each is also checked against the gold row in the CSV.
  const cases: { id: string; food: string | null; qty: number | null; unit: string | null; pickup: string | null }[] = [
    { id: 'M0001', food: 'menudo', qty: 3, unit: 'tray', pickup: '19:00' },
    { id: 'M0003', food: 'lumpiang shanghai', qty: 67, unit: 'piece', pickup: '20:15' },
    { id: 'M0010', food: 'lumpiang shanghai', qty: null, unit: 'piece', pickup: '20:00' },
    { id: 'M0020', food: 'food', qty: 1, unit: 'pot', pickup: '20:30' },
    { id: 'M0108', food: 'pork sinigang', qty: 1, unit: 'pot', pickup: '18:45' },
  ];

  it.each(cases)('$id', ({ id, food, qty, unit, pickup }) => {
    const gold = tuningRow(id);
    const r = parseRules(gold.message_text);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toEqual({ food_item: food, quantity: qty, unit });
    expect(r.pickup_by).toBe(pickup);
    // The literal values agree with the gold columns. The vague word "food" has an empty gold food_item.
    expect(gold.gold_quantity).toBe(qty);
    expect(gold.gold_pickup_by).toBe(pickup);
    expect(gold.gold_unit === '' ? null : gold.gold_unit).toBe(unit);
    if (food === 'food') expect(gold.gold_food_item).toBe('');
    else expect(gold.gold_food_item).toBe(food);
  });

  it('M0015 ("before 8 PM... or 9? whichever") gives no pickup time (two candidates)', () => {
    const r = parseRules(tuningRow('M0015').message_text);
    expect(r.items).toEqual([{ food_item: 'chicken adobo', quantity: 4, unit: 'tray' }]);
    expect(r.pickup_by).toBeNull();
    expect(tuningRow('M0015').gold_pickup_by).toBeNull();
  });
});

describe('vocabulary and the tuning filter', () => {
  it('loads exactly the 170 tuning rows, all with split "tuning"', () => {
    const rows = loadTuningRows();
    expect(rows).toHaveLength(TUNING_ROW_COUNT);
    expect(rows.every((r) => r.split === 'tuning')).toBe(true);
    expect(rows.every((r) => /^E(0[1-9]|10)$/.test(r.evening_id))).toBe(true);
  });

  it('the canonical table is exactly the distinct gold foods and units in the tuning rows', () => {
    const rows = loadTuningRows();
    const goldFoods = [...new Set(rows.map((r) => r.gold_food_item).filter((f) => f !== ''))].sort();
    expect(CANONICAL_FOODS.map((c) => c.food).sort()).toEqual(goldFoods);
    for (const c of CANONICAL_FOODS) {
      const units = new Set(rows.filter((r) => r.gold_food_item === c.food && r.gold_unit !== '').map((r) => r.gold_unit));
      expect([...units]).toEqual([c.unit]);
    }
    expect(Object.keys(SYNONYMS).sort()).toEqual(goldFoods);
  });

  it('never returns a non-finite quantity or a pickup outside 00:00 to 23:59', () => {
    for (const r of loadTuningRows()) {
      const p = parseRules(r.message_text);
      for (const item of p.items) {
        if (item.quantity !== null) expect(Number.isFinite(item.quantity) && item.quantity > 0).toBe(true);
      }
      if (p.pickup_by !== null) expect(p.pickup_by).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    }
  });
});
