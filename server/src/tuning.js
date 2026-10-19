// The ONLY dataset file the server may read: the parser tuning split, evenings E01..E10.
// Hard rule (Arjhine, 2026-10-20): never read the full message file, pilot (E11-E20) or main (E21-E30) rows.
import { readFileSync } from "node:fs";
import { parseCsv } from "./csv.js";

export const TUNING_CSV_URL = new URL("../../data/parse-dev/donor_messages_tuning.csv", import.meta.url);
export const TUNING_EVENING_RE = /^E(0[1-9]|10)$/;
export const TUNING_ROW_COUNT = 170;

// Filter first, then assert that every row passed. Throws (server refuses to start) on any mismatch.
export function loadTuningRows(path = TUNING_CSV_URL) {
  const all = parseCsv(readFileSync(path, "utf8"));
  const kept = all.filter((r) => TUNING_EVENING_RE.test(r.evening_id));
  if (kept.length !== all.length) {
    throw new Error(`tuning file: ${all.length - kept.length} row(s) outside E01..E10`);
  }
  const wrongSplit = kept.filter((r) => r.split !== "tuning");
  if (wrongSplit.length) throw new Error(`tuning file: ${wrongSplit.length} row(s) with split != tuning`);
  if (kept.length !== TUNING_ROW_COUNT) {
    throw new Error(`tuning file: expected ${TUNING_ROW_COUNT} rows, got ${kept.length}`);
  }
  return kept;
}
