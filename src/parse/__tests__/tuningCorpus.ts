/**
 * Loads the parser development set: data/parse-dev/donor_messages_tuning.csv, tuning evenings E01..E10 only.
 *
 * Hard rule (Arjhine, 2026-10-20): the parser is built and scored on tuning messages only. This module is the one
 * place that reads that CSV. It never reads donor_messages.csv, pilot evenings (E11-E20) or main evenings (E21-E64).
 * Helper file for tests (not a test itself; jest matches *.test.ts).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

export interface TuningRow {
  evening_id: string;
  message_id: string;
  split: string;
  language: string;
  difficulty: string;
  message_text: string;
  gold_food_item: string;
  gold_quantity: number | null;
  gold_unit: string;
  gold_pickup_by: string | null;
  requires_clarification: boolean;
  missing_or_conflicting: string;
}

export const TUNING_CSV = join(__dirname, '..', '..', '..', 'data', 'parse-dev', 'donor_messages_tuning.csv');
export const TUNING_EVENINGS: ReadonlySet<string> = new Set(['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10']);
export const TUNING_ROW_COUNT = 170;

/** RFC 4180-style CSV: quoted fields with "" escapes, CRLF or LF line ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const numOrNull = (s: string): number | null => (s.trim() === '' ? null : Number(s));
const strOrNull = (s: string): string | null => (s.trim() === '' ? null : s);

/**
 * Filter: keep rows whose evening_id is in E01..E10. Asserts that every row was kept (none dropped by a mistake in the
 * file), that exactly TUNING_ROW_COUNT rows remain, and that every kept row has split == "tuning".
 */
export function loadTuningRows(): TuningRow[] {
  const [header, ...body] = parseCsv(readFileSync(TUNING_CSV, 'utf8'));
  const all = body.map((r) => Object.fromEntries(header.map((k, i) => [k, r[i] ?? ''])));
  const kept = all.filter((r) => TUNING_EVENINGS.has(r.evening_id));
  if (kept.length !== all.length) throw new Error(`tuning filter kept ${kept.length} of ${all.length} rows`);
  if (kept.length !== TUNING_ROW_COUNT) throw new Error(`expected ${TUNING_ROW_COUNT} tuning rows, got ${kept.length}`);
  if (kept.some((r) => r.split !== 'tuning')) throw new Error('a kept row has split other than "tuning"');
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

/** Looks up one tuning row by message_id (for tests that pin known messages). */
export function tuningRow(messageId: string): TuningRow {
  const row = loadTuningRows().find((r) => r.message_id === messageId);
  if (!row) throw new Error(`no tuning row ${messageId}`);
  return row;
}
