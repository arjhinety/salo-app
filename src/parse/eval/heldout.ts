/**
 * Held-out splits of the donor-message dataset (v1.3): the descriptors and the evening-to-split mapping shared by the
 * held-out loader (src/parse/__tests__/heldoutCorpus.ts), the Claude-path scorer and the fallback eval. Pure TypeScript,
 * no network, no file access. Nothing here imports src/donor or src/data (checked by imports.test.ts).
 *
 * Pilot = evenings E11 to E20 (dataset split label "pilot"); main = evenings E21 to E64 (dataset split label
 * "main_sample", not "main"). Tuning (E01 to E10, label "tuning") is never a held-out split.
 */

export type SplitName = 'tuning' | 'pilot' | 'main';

export interface HeldoutSplit {
  name: 'pilot' | 'main';
  /** Evening range for the scope line, e.g. "E11 to E20". */
  evenings: string;
  /** Number of evenings in the split. */
  eveningCount: number;
  /** Expected number of messages (17 per evening). */
  count: number;
  /** The split label written in the dataset's donor_messages.csv. */
  datasetLabel: string;
  /** First and last evening number of the range, inclusive. */
  firstEvening: number;
  lastEvening: number;
}

export const HELDOUT_SPLITS: Readonly<Record<'pilot' | 'main', HeldoutSplit>> = {
  pilot: { name: 'pilot', evenings: 'E11 to E20', eveningCount: 10, count: 170, datasetLabel: 'pilot', firstEvening: 11, lastEvening: 20 },
  main: { name: 'main', evenings: 'E21 to E64', eveningCount: 44, count: 748, datasetLabel: 'main_sample', firstEvening: 21, lastEvening: 64 },
};

/** The split an evening belongs to (E01-E10 tuning, E11-E20 pilot, E21-E64 main), or null for any other id. */
export function splitOfEvening(eveningId: string): SplitName | null {
  const m = /^E(\d{2})$/.exec(eveningId);
  if (!m) return null;
  const n = Number(m[1]);
  if (n >= 1 && n <= 10) return 'tuning';
  if (n >= 11 && n <= 20) return 'pilot';
  if (n >= 21 && n <= 64) return 'main';
  return null;
}

/** The split a dataset donor_messages.csv split label names, or null for an unknown label. */
export function splitOfDatasetLabel(label: string): SplitName | null {
  if (label === 'tuning') return 'tuning';
  if (label === 'pilot') return 'pilot';
  if (label === 'main_sample') return 'main';
  return null;
}

/** The title and label of a held-out Claude-path report. */
export function heldoutLabel(split: HeldoutSplit): string {
  return `Edge Function, held-out ${split.name} messages (template-generated: optimistic upper bound)`;
}
