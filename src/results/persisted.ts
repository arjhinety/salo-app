import { checksumParams, type Registration } from './registration';
import type { LearningComparison } from './learning';
import type { MainResults } from './runner';
import type { FrozenParams, PolicyId } from '../engine/types';

/**
 * The stored main results: the record of the gated main run (M6_MAIN=1), kept as a test fixture at
 * docs/reports/m6-main/record.json. The app does not import it (src/results/__tests__/record-imports.test.ts); the on-device
 * path is checked against it (src/results/__tests__/onDevice.test.ts), and persistedMismatch is checked in persisted.test.ts.
 */
export interface PersistedMainResults {
  schema: 1;
  /** Which run wrote this record, for the reader. */
  generatedBy: string;
  dataset: {
    /** Dataset version, e.g. "v1.3" (src/data/dataset.ts DATASET_VERSION). */
    version: string;
    /** "sha256:" + SHA-256 of the bundled data/salo-evening-dataset/SHA256SUMS (the ten bundled tables). */
    bundledTablesSha256: string;
    /** The dataset repo's 17-file SHA256SUMS, as recorded in decisions.md (not checkable from the app bundle). */
    datasetRepoManifestSha256: string;
    /** The main_sample evening ids the run used, in order (E21 to E64). */
    mainEvenings: string[];
  };
  /** The frozen parameters the run used (src/results/registration.ts records the same value). */
  frozenParamsChecksum: string;
  mainEveningCount: number;
  resamples: number;
  seed: number;
  /** Cells, the twelve comparisons (2 at 97.5%, 10 at 95%), the verdict, and the per-evening runs they came from. */
  main: MainResults;
  /** Supporting only (RES-07): learning on minus off, per policy. Its offFoodKg holds the learning-off values. */
  learning: Record<PolicyId, LearningComparison>;
  /** Supporting only (RES-07): evenings that reached the food ceiling, per policy. */
  ceilings: Record<PolicyId, number>;
}

/**
 * Why a stored record must not be shown. An empty list means it matches the current registration, the current frozen
 * parameters and the current dataset. `params` is null when the build has no frozen parameters.
 */
export function persistedMismatch(
  stored: PersistedMainResults,
  reg: Registration,
  params: FrozenParams | null,
  mainEvenings: readonly string[],
  datasetVersion: string,
): string[] {
  const reasons: string[] = [];
  if (params === null) reasons.push('no frozen parameters are in the build');
  else if (stored.frozenParamsChecksum !== checksumParams(params)) {
    reasons.push('the stored results were computed with other frozen parameters');
  }
  if (stored.frozenParamsChecksum !== reg.frozenParamsChecksum) reasons.push('the stored checksum is not the recorded checksum');
  if (stored.mainEveningCount !== reg.mainEveningCount) reasons.push('the stored main-evening count is not the recorded count');
  if (stored.resamples !== reg.resamples || stored.seed !== reg.seed) reasons.push('the stored resamples or seed are not the recorded ones');
  if (stored.dataset.version !== datasetVersion) reasons.push('the stored results were computed on another dataset version');
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (!same(stored.dataset.mainEvenings, mainEvenings) || !same(stored.main.evenings, mainEvenings)) {
    reasons.push('the stored evenings are not the main_sample evenings of the dataset');
  }
  return reasons;
}
