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
  gateClosed: 'Main results appear after the pilot has run and the number of main evenings is recorded.',
  /** The gate is open and no run has been made yet this session: the button below runs the main evenings on this phone. */
  gateRecordedNoRun: 'The pilot has run and the main-evening count is recorded. No main result is shown until the main evenings are run on this phone.',
  /** The recorded count is more main evenings than the dataset has. The runner would refuse it, so the screen stays closed. */
  gateCountMismatch: 'The recorded main-evening count does not match the main evenings in the dataset, so no main result is shown.',
  evenings: 'Evenings reported: E21 to E64.',
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
  supportingHeading: 'Supporting comparisons (95%)',
  supportingNote:
    'Supporting only, never a win on their own. Food wasted mirrors food rescued (the same kg is posted under every policy), so its intervals are not independent support.',
  learningHeading: 'Supporting: learning off',
  /** One row per policy: "<policy> · Food rescued, learning on minus off (95%)". Supporting only. */
  learningRow: 'Food rescued, learning on minus off (95%)',
  ceilingHeading: 'Supporting: food ceiling hit (all posted food rescued)',
  /** The ceiling row is a supporting diagnostic only. The first definition (every need met) is in the report, section 5. */
  ceilingNote: 'Supporting diagnostic only. The main result does not depend on it.',
  /** The button that starts the main run on this phone. Shown only when the gate is open and no result is shown yet. */
  runButton: 'Run the main evenings',
  /** Progress line while the run goes: evening `done` of `total` is running. */
  runProgress: (done: number, total: number) => `Evening ${done} of ${total} …`,
  /** Announced once when the run starts (the screen's live announcer; the progress line itself is not live). */
  runStarted: 'Running the main evenings on this phone …',
  /** Shown after the last evening while the intervals and the verdict are worked out. */
  runIntervals: 'Working out the intervals and the verdict …',
  /** Under the run button before any result: the empty state of every table on the closed screen. */
  emptyTable: 'Run the main evenings to fill this table.',
  runCancel: 'Cancel run',
  /** Shown when the user cancels the run. Nothing is kept. */
  runCancelled: 'The run was cancelled. No main result is shown.',
  /** Shown if the run stops with an error. Nothing is kept. */
  runFailed: 'The run stopped with an error. No main result is shown.',
  /** Under the button: where the numbers live. */
  runInMemory: 'The numbers are computed on this phone when you run them, and kept in memory for this session only.',
  /** "2 of 44 evenings" for a ceiling count. */
  ceilingOf: (n: number, total: number) => `${n} of ${total} evenings`,
  dataset: 'Dataset',
  verdictHeading: 'Verdict',
  /** Shown under the verdict only when both main 97.5% intervals lie inside the gaps. Post hoc, supporting only. */
  insideGapsNote:
    'Post-hoc check, not pre-registered: both 97.5% intervals lie entirely inside ±6 kg and ±10 points, the smallest differences worth caring about, so a difference that large is unlikely in either direction. This is not a pre-registered equivalence test. The verdict above is unchanged.',
  noClear: 'No clear difference',
  saloBetter: 'Salo better',
  baselineBetter: 'Baseline better',
  /** The learning-off readings, worded like the main readings ("Salo better"): capitalised, no full stop. */
  learningHelps: 'Learning helps',
  learningHurts: 'Learning hurts',
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
