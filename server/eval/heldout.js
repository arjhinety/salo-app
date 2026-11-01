// Held-out splits for the Claude-path scoring run (eval tooling only: server/src must never read these files, see test/prompt.test.js) (decision "Parser held-out scoring", docs/decisions.md, 2026-11-01).
// Reads the dataset v1.3 files donor_messages.csv and food_offers.csv and returns ONE split: pilot (E11..E20) or main
// (E21..E64). The tuning split stays in src/tuning.js and is not touched here.
//
// Hard rules: this file returns only the rows of the requested split. It never returns the other splits, and it refuses
// (throws) when the dataset does not match the expected evening->split mapping or the expected row count. Error messages
// name counts and ids only, never message text. The dataset folder comes from SALO_EVENING_DATASET_DIR (or the default
// below), so no path to the dataset is written into the repo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../src/csv.js";

// The dataset's own label for the main evenings is "main_sample" (not "main").
export const HELDOUT_SPLITS = Object.freeze({
  pilot: Object.freeze({ datasetSplit: "pilot", firstEvening: 11, lastEvening: 20, messageCount: 170 }),
  main: Object.freeze({ datasetSplit: "main_sample", firstEvening: 21, lastEvening: 64, messageCount: 748 }),
});
// Default: the dataset built next to this repo (salo-app and salo-evening-dataset-repo share a parent folder).
export const DEFAULT_DATASET_DIR = fileURLToPath(new URL("../../../salo-evening-dataset-repo/salo-evening-dataset", import.meta.url));
export const DATASET_ENV = "SALO_EVENING_DATASET_DIR";
export const EVENING_RE = /^E(\d{2})$/;

export function datasetDir(env = process.env) {
  const v = (env[DATASET_ENV] ?? "").trim();
  return v === "" ? DEFAULT_DATASET_DIR : v;
}

export function splitConfig(split) {
  if (!Object.prototype.hasOwnProperty.call(HELDOUT_SPLITS, split)) {
    throw new Error(`--split must be pilot or main (got "${split}")`);
  }
  return HELDOUT_SPLITS[split];
}

// Evening number from an evening id like "E11" (null when it does not look like one).
function eveningNumber(id) {
  const m = EVENING_RE.exec(id ?? "");
  return m ? Number(m[1]) : null;
}

function readDatasetCsv(dir, name) {
  try {
    return parseCsv(readFileSync(join(dir, name), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") throw new Error(`dataset file ${name} not found in the dataset folder (set ${DATASET_ENV})`);
    throw err;
  }
}

// Loads one held-out split. Filter by evening first, then assert every row of the split, then assert the count.
export function loadSplitRows(split, { dir = datasetDir() } = {}) {
  const cfg = splitConfig(split);
  const messages = readDatasetCsv(dir, "donor_messages.csv");
  const offers = readDatasetCsv(dir, "food_offers.csv");

  const eveningOfLot = new Map();
  for (const o of offers) eveningOfLot.set(o.lot_id, o.evening_id);

  const kept = [];
  const problems = [];
  let unmapped = 0;
  for (const m of messages) {
    const evening = eveningOfLot.get(m.lot_id);
    if (evening === undefined) {
      unmapped++;
      continue;
    }
    const n = eveningNumber(evening);
    const inRange = n !== null && n >= cfg.firstEvening && n <= cfg.lastEvening;
    if (m.split === cfg.datasetSplit && !inRange) problems.push(`${m.message_id} has split ${cfg.datasetSplit} but evening ${evening}`);
    if (inRange && m.split !== cfg.datasetSplit) problems.push(`${m.message_id} is in evening ${evening} but has split ${m.split}`);
    if (inRange) kept.push({ ...m, evening_id: evening });
  }
  if (unmapped > 0) throw new Error(`${unmapped} message row(s) have a lot_id that is not in food_offers.csv`);
  if (problems.length > 0) {
    throw new Error(`split mismatch in the dataset (${problems.length} row(s), ids only): ${problems.slice(0, 5).map((p) => p.split(" ")[0]).join(", ")}`);
  }
  if (kept.length !== cfg.messageCount) {
    throw new Error(`${split}: expected ${cfg.messageCount} messages in E${cfg.firstEvening}..E${cfg.lastEvening}, got ${kept.length}`);
  }
  const evenings = new Set(kept.map((r) => r.evening_id));
  const expectedEvenings = cfg.lastEvening - cfg.firstEvening + 1;
  if (evenings.size !== expectedEvenings) {
    throw new Error(`${split}: expected ${expectedEvenings} evenings, got ${evenings.size}`);
  }
  return kept;
}

export const splitEveningIds = (split) => {
  const cfg = splitConfig(split);
  return Array.from({ length: cfg.lastEvening - cfg.firstEvening + 1 }, (_, i) => `E${String(cfg.firstEvening + i).padStart(2, "0")}`);
};
