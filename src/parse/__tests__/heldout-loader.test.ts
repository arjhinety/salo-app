/**
 * Held-out loader on generated fake datasets in temp dirs (always runs; no dataset dependency). Fixtures have 17 messages
 * per evening, so the real counts (170 pilot, 748 main) are the ones tested. Covers: the evening-to-split mapping over the
 * whole file, the count assertion, the wrong-split refusal, a missing lot, and the tuning split being excluded.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadHeldoutRows } from './heldoutCorpus';

const MSG_HEADER = 'message_id,lot_id,donor_id,split,language,difficulty,generation,template_id,message_text,gold_food_item,gold_quantity,gold_unit,gold_est_kg,gold_pickup_by,gold_location,requires_clarification,missing_or_conflicting';
const OFFER_HEADER = 'lot_id,evening_id,donor_id,food_item';

interface Spec {
  evening: number;
  label: string;
  count?: number;
}

/** Writes donor_messages.csv and food_offers.csv in a fresh temp dir. Each spec is one evening with its messages. */
function fakeDataset(specs: Spec[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'heldout-'));
  const offers: string[] = [OFFER_HEADER];
  const msgs: string[] = [MSG_HEADER];
  let serial = 0;
  for (const s of specs) {
    const evening = `E${String(s.evening).padStart(2, '0')}`;
    const lot = `L${evening}`;
    offers.push(`${lot},${evening},D01,bananas`);
    for (let i = 1; i <= (s.count ?? 17); i++) {
      serial++;
      const id = `M${String(serial).padStart(4, '0')}`;
      msgs.push([id, lot, 'D01', s.label, 'en', 'easy', 'g', 't', 'fake text', 'bananas', '2', 'kg', '1.0', '16:00', 'Pantry', 'False', ''].join(','));
    }
  }
  writeFileSync(join(dir, 'food_offers.csv'), offers.join('\n') + '\n');
  writeFileSync(join(dir, 'donor_messages.csv'), msgs.join('\n') + '\n');
  return dir;
}

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const tuningSpecs = (): Spec[] => range(1, 10).map((e) => ({ evening: e, label: 'tuning' }));
const pilotSpecs = (): Spec[] => range(11, 20).map((e) => ({ evening: e, label: 'pilot' }));
const mainSpecs = (): Spec[] => range(21, 64).map((e) => ({ evening: e, label: 'main_sample' }));

const dirs: string[] = [];
const make = (specs: Spec[]): string => {
  const d = fakeDataset(specs);
  dirs.push(d);
  return d;
};
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('held-out loader: counts and mapping (fake dataset)', () => {
  it('loads the pilot split: 170 rows, evenings E11 to E20, in file order, split pilot', () => {
    const rows = loadHeldoutRows('pilot', make([...tuningSpecs(), ...pilotSpecs(), ...mainSpecs()]));
    expect(rows.length).toBe(170);
    expect(new Set(rows.map((r) => r.evening_id))).toEqual(new Set(range(11, 20).map((e) => `E${e}`)));
    expect(rows.every((r) => r.split === 'pilot')).toBe(true);
    const ids = rows.map((r) => r.message_id);
    expect(ids).toEqual([...ids].sort());
  });

  it('loads the main split: 748 rows, evenings E21 to E64, labelled main_sample in the file', () => {
    const rows = loadHeldoutRows('main', make([...tuningSpecs(), ...pilotSpecs(), ...mainSpecs()]));
    expect(rows.length).toBe(748);
    expect(rows.every((r) => r.split === 'main_sample')).toBe(true);
    expect(rows.every((r) => r.evening_id >= 'E21' && r.evening_id <= 'E64')).toBe(true);
  });

  it('a short split (one message missing) fails the count assertion', () => {
    const specs = pilotSpecs();
    specs[3] = { evening: 14, label: 'pilot', count: 16 };
    expect(() => loadHeldoutRows('pilot', make(specs))).toThrow('expected 170 pilot rows, got 169');
  });

  it('a split with a missing evening fails the evening assertion', () => {
    const specs = pilotSpecs().slice(1);
    expect(() => loadHeldoutRows('pilot', make(specs))).toThrow('the pilot split has evenings 9');
  });

  it('a message whose lot food_offers does not list fails', () => {
    const d = make([...pilotSpecs()]);
    writeFileSync(join(d, 'donor_messages.csv'), `${MSG_HEADER}\nM9999,LNOPE,D01,pilot,en,easy,g,t,x,bananas,2,kg,1,16:00,Pantry,False,\n`);
    expect(() => loadHeldoutRows('pilot', d)).toThrow('has a lot_id that food_offers does not list');
  });
});

describe('held-out loader: wrong-split refusal (fake dataset)', () => {
  it('a pilot-labelled row on a main evening refuses the whole load', () => {
    const specs = [...tuningSpecs(), ...pilotSpecs(), ...mainSpecs()];
    specs[20] = { evening: 21, label: 'pilot' };
    expect(() => loadHeldoutRows('pilot', make(specs))).toThrow('mapping mismatch; refusing to load');
    expect(() => loadHeldoutRows('main', make(specs))).toThrow('mapping mismatch; refusing to load');
  });

  it('a main_sample-labelled row on a pilot evening refuses the whole load', () => {
    const specs = [...tuningSpecs(), ...pilotSpecs(), ...mainSpecs()];
    specs[12] = { evening: 13, label: 'main_sample' };
    expect(() => loadHeldoutRows('pilot', make(specs))).toThrow('mapping mismatch; refusing to load');
  });

  it('the tuning split is never a held-out split: a tuning-labelled evening inside the pilot range refuses', () => {
    const specs = [...tuningSpecs(), ...pilotSpecs()];
    specs[10] = { evening: 11, label: 'tuning' };
    expect(() => loadHeldoutRows('pilot', make(specs))).toThrow('mapping mismatch; refusing to load');
  });
});
