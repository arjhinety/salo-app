/**
 * English copy for the Results screen and the dashboard link (the dashboard and results are English by decision).
 * Kept here, not in src/i18n/strings.ts, so the results copy stays with the results code.
 * No tuning or pilot evening ids may appear in this file: a test checks the screen (RES-06).
 */
export const NOT_MEASURED = 'Not measured yet';

/** The Expo Router path of the screen in src/app/results.tsx. */
export const RESULTS_ROUTE = '/results';

export const RESULTS_COPY = {
  link: 'Results',
  title: 'Results',
  subtitle: 'Simulated data. Main evenings only.',
  back: 'Back to dashboard',
  /** The one plain gate line. The pilot is named without its evening ids (RES-06: no pilot ids on the screen). */
  gateClosed: 'Main results appear after the pilot has run and the number of main evenings is recorded (guide p.19).',
  /** The pilot is recorded, but the screen never runs the main evenings itself, so no main result is shown. */
  gateRecordedNoRun: 'The pilot has run and the main-evening count is recorded. The main evenings have not been run, so no main result is shown (guide p.19).',
  /** The recorded count is more main evenings than the dataset has. The runner would refuse it, so the screen stays closed. */
  gateCountMismatch: 'The recorded main-evening count does not match the main evenings in the dataset, so no main result is shown (guide p.19).',
  /** The gate is open, but the stored results do not match the registration, the parameters or the dataset (RES-06). */
  gateStale: 'The stored main results do not match the current registration, parameters or dataset, so no main result is shown (guide p.19).',
  evenings: 'Evenings reported: E21 to E64 (main_sample).',
  policiesHeading: 'Four policies, same evenings',
  policies: {
    salo: 'Agents (Salo)',
    fcfs: 'First come first served',
    nearest: 'Nearest pantry',
    central_greedy: 'Central greedy',
  },
  measures: {
    foodRescued: 'Food rescued',
    foodWasted: 'Food wasted',
    needMet: 'Need met, worst-served pantry',
    stranded: 'Stranded awards',
  },
  mainHeading: 'Main comparison against central greedy (97.5%)',
  supportingHeading: 'Supporting comparisons (95%). Supporting only, never a win on their own.',
  supportingNote:
    'Food wasted mirrors food rescued (the same kg is posted under every policy), so its intervals are not independent support.',
  learningHeading: 'Supporting: learning off',
  /** One row per policy: "<policy> · Food rescued, learning on minus off (95%)". Supporting only. */
  learningRow: 'Food rescued, learning on minus off (95%)',
  ceilingHeading: 'Supporting: evenings that reached the food ceiling',
  /** "2 of 44 evenings" for a ceiling count. */
  ceilingOf: (n: number, total: number) => `${n} of ${total} evenings`,
  dataset: 'Dataset',
  verdictHeading: 'Verdict',
  noClear: 'No clear difference',
  saloBetter: 'Salo better',
  baselineBetter: 'Baseline better',
  method: 'Paired bootstrap intervals on the difference between policies, evening by evening (Bestgen, 2022).',
  resamples: 'Resamples',
  seed: 'Random seed',
  checksum: 'Frozen parameters checksum',
} as const;

export const SUPPORTING_LABELS: Record<'foodRescued' | 'foodWasted' | 'needMet' | 'stranded', string> = {
  foodRescued: 'Food rescued',
  foodWasted: 'Food wasted',
  needMet: 'Need met, worst-served',
  stranded: 'Stranded awards',
};
