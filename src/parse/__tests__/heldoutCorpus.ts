/**
 * Loads one held-out split (pilot or main) of the evening dataset v1.3: donor_messages.csv, joined to food_offers.csv for
 * the evening (each message's lot_id gives its evening, exactly as the tuning filter does). Helper file for tests and the
 * held-out evals (not a test itself; jest matches *.test.ts). Read in code only: rows are never printed.
 *
 * Dataset directory: env SALO_EVENING_DATASET_DIR, default the local dataset repo. Pilot = E11..E20 (dataset label "pilot",
 * 170 rows); main = E21..E64 (dataset label "main_sample", 748 rows). Throws on any mapping or count mismatch, so the
 * held-out evals refuse to run on a bad dataset.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { HELDOUT_SPLITS, splitOfDatasetLabel, splitOfEvening, type SplitName } from '../eval/heldout';
import { parseCsv, type TuningRow } from './tuningCorpus';

// Default: the dataset built next to this repo (salo-app and salo-evening-dataset-repo share a parent folder).
export const DEFAULT_DATASET_DIR = join(__dirname, '..', '..', '..', '..', 'salo-evening-dataset-repo', 'salo-evening-dataset');

export function datasetDir(): string {
  return process.env.SALO_EVENING_DATASET_DIR ?? DEFAULT_DATASET_DIR;
}

type Table = Record<string, string>[];

function readTable(path: string): Table {
  const [header, ...body] = parseCsv(readFileSync(path, 'utf8'));
  return body.map((r) => Object.fromEntries(header.map((k, i) => [k, r[i] ?? ''])));
}

const numOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s));
const strOrNull = (s: string): string | null => (s.trim() === '' ? null : s);

/** Every message of the dataset with its evening (from its lot). Throws when a lot is missing or listed twice. */
export function loadMessagesWithEvening(dir: string): (Record<string, string> & { evening_id: string })[] {
  const offers = readTable(join(dir, 'food_offers.csv'));
  const eveningOfLot = new Map<string, string>();
  for (const o of offers) {
    const prev = eveningOfLot.get(o.lot_id);
    if (prev !== undefined && prev !== o.evening_id) throw new Error(`food_offers: lot ${o.lot_id} is listed for two evenings`);
    eveningOfLot.set(o.lot_id, o.evening_id);
  }
  const messages = readTable(join(dir, 'donor_messages.csv'));
  return messages.map((m) => {
    const evening = eveningOfLot.get(m.lot_id);
    if (evening === undefined) throw new Error(`donor_messages: ${m.message_id} has a lot_id that food_offers does not list`);
    return { ...m, evening_id: evening };
  });
}

/**
 * The held-out rows of one split, in file order. Asserts, over the whole file: each row's dataset split label names the
 * same split as its evening (no mismatch anywhere); the split's evenings are exactly its range; and the row count is the
 * expected count (170 pilot, 748 main).
 */
export function loadHeldoutRows(split: 'pilot' | 'main', dir: string = datasetDir()): TuningRow[] {
  const spec = HELDOUT_SPLITS[split];
  const all = loadMessagesWithEvening(dir);
  for (const m of all) {
    const fromEvening: SplitName | null = splitOfEvening(m.evening_id);
    const fromLabel = splitOfDatasetLabel(m.split);
    if (fromEvening === null || fromLabel === null || fromEvening !== fromLabel) {
      throw new Error(`dataset: ${m.message_id} has split label "${m.split}" but evening ${m.evening_id} (mapping mismatch; refusing to load)`);
    }
  }
  const kept = all.filter((m) => splitOfEvening(m.evening_id) === split);
  const evenings = [...new Set(kept.map((m) => m.evening_id))].sort();
  const expectedEvenings = Array.from({ length: spec.lastEvening - spec.firstEvening + 1 }, (_, i) => `E${String(spec.firstEvening + i).padStart(2, '0')}`);
  if (evenings.length !== spec.eveningCount || evenings.join(',') !== expectedEvenings.join(',')) {
    throw new Error(`dataset: the ${split} split has evenings ${evenings.length} (expected ${spec.eveningCount}, ${spec.evenings})`);
  }
  if (kept.some((m) => m.split !== spec.datasetLabel)) throw new Error(`dataset: a ${split} row does not carry the label "${spec.datasetLabel}"`);
  if (kept.length !== spec.count) throw new Error(`dataset: expected ${spec.count} ${split} rows, got ${kept.length}`);
  return kept.map((r) => ({
    evening_id: r.evening_id,
    message_id: r.message_id,
    split: r.split,
    language: r.language,
    difficulty: r.difficulty,
    message_text: r.message_text,
    gold_food_item: r.gold_food_item,
    gold_quantity: numOrNull(r.gold_quantity),
    gold_unit: r.gold_unit,
    gold_pickup_by: strOrNull(r.gold_pickup_by),
    requires_clarification: r.requires_clarification === 'True',
    missing_or_conflicting: r.missing_or_conflicting,
  }));
}
