/// <reference types="node" />
/// <reference types="jest" />
// The stored main results (docs/reports/m6-main/record.json, a test fixture written by the gated run M6_MAIN=1) are checked on
// every normal test run: against the registration, the frozen parameters, the bundled dataset files, and by recomputing every
// number from the stored per-evening runs with the runner's own summarize, learningComparison and ceilingCounts. So a
// stale or edited record cannot pass, and nothing here runs an evening.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATASET_VERSION, EVENINGS } from '../../data/dataset';
import { bootstrapIndices, pairedInterval } from '../../engine/metrics';
import { POLICY_IDS } from '../../engine/policies';
import { FROZEN_PARAMS } from '../../engine/frozenParams';
import type { PolicyId } from '../../engine/types';
import { pairedDiffs } from '../intervals';
import { ceilingCounts, learningComparison } from '../learning';
import { persistedMismatch } from '../persisted';
import { loadRecord } from './recordFixture';
import { checksumParams, REGISTRATION } from '../registration';
import { summarize } from '../runner';

const ROOT = join(__dirname, '..', '..', '..');
const DATA = join(ROOT, 'data', 'salo-evening-dataset');
const MAIN_IDS = Array.from({ length: 44 }, (_, i) => `E${21 + i}`);
const mainEvenings = EVENINGS.filter((e) => e.split === 'main_sample');
const stored = loadRecord();
const sha = (buf: Buffer) => `sha256:${createHash('sha256').update(buf).digest('hex')}`;

describe('the record against the registration and the frozen parameters', () => {
  test('the frozen parameters checksum: recorded, registered and recomputed from the frozen parameters', () => {
    expect(stored.frozenParamsChecksum).toBe(REGISTRATION.frozenParamsChecksum);
    expect(stored.frozenParamsChecksum).toBe(checksumParams(FROZEN_PARAMS));
    expect(stored.frozenParamsChecksum).toBe('sha256:5d0ef9b5bba3bbe441e1a646644bb55ef2413e3925eb94c7783678dfbc10d42e');
  });

  test('the main-evening count is the registered 44, and the seed and resamples are the registered ones', () => {
    expect(stored.mainEveningCount).toBe(REGISTRATION.mainEveningCount);
    expect(stored.mainEveningCount).toBe(44);
    expect(stored.resamples).toBe(10000);
    expect(stored.seed).toBe(20260927);
    expect(stored.resamples).toBe(REGISTRATION.resamples);
    expect(stored.seed).toBe(REGISTRATION.seed);
  });

  test('no mismatch against the current registration, frozen parameters and dataset', () => {
    expect(persistedMismatch(stored, REGISTRATION, FROZEN_PARAMS, MAIN_IDS, DATASET_VERSION)).toEqual([]);
  });

  test('the mismatch check does catch each kind of stale record', () => {
    expect(persistedMismatch({ ...stored, frozenParamsChecksum: 'sha256:' + '0'.repeat(64) }, REGISTRATION, FROZEN_PARAMS, MAIN_IDS, DATASET_VERSION)).not.toEqual([]);
    expect(persistedMismatch(stored, REGISTRATION, null, MAIN_IDS, DATASET_VERSION)).toEqual(['no frozen parameters are in the build']);
    expect(persistedMismatch(stored, { ...REGISTRATION, seed: 1 }, FROZEN_PARAMS, MAIN_IDS, DATASET_VERSION)).not.toEqual([]);
    expect(persistedMismatch(stored, REGISTRATION, FROZEN_PARAMS, MAIN_IDS, 'v1.2')).not.toEqual([]);
    expect(persistedMismatch(stored, REGISTRATION, FROZEN_PARAMS, MAIN_IDS.slice(0, 43), DATASET_VERSION)).not.toEqual([]);
  });
});

describe('the record against the dataset', () => {
  test('the dataset version is v1.3 and the main evenings are E21 to E64, all main_sample, 44 of them', () => {
    expect(DATASET_VERSION).toBe('v1.3');
    expect(stored.dataset.version).toBe(DATASET_VERSION);
    expect(mainEvenings.map((e) => e.id)).toEqual(MAIN_IDS);
    expect(stored.dataset.mainEvenings).toEqual(MAIN_IDS);
    expect(stored.main.evenings).toEqual(MAIN_IDS);
  });

  test('the bundled tables are the ones the record names: SHA256SUMS hash, and each CSV against its line', () => {
    const manifestBuf = readFileSync(join(DATA, 'SHA256SUMS'));
    expect(stored.dataset.bundledTablesSha256).toBe(sha(manifestBuf));
    const lines = manifestBuf.toString('utf8').trim().split('\n');
    expect(lines).toHaveLength(10);
    for (const line of lines) {
      const [hash, name] = line.trim().split(/\s+/);
      expect(sha(readFileSync(join(DATA, name)))).toBe(`sha256:${hash}`);
    }
  });

  test('the dataset repo manifest hash is the one decisions.md records (checkable only in the dataset repo)', () => {
    expect(stored.dataset.datasetRepoManifestSha256).toBe('sha256:e183b81d595437d1d9c1f9e7f98ed6bdbb777ea8ab3ce7484bbfd941c023bc24');
  });

  test('no pilot or tuning evening id appears in the stored record', () => {
    const ids = JSON.stringify(stored.main.perEvening);
    expect(ids).not.toMatch(/"E(0[1-9]|1[0-9]|20)"/);
  });
});

describe('every stored number is recomputed from the stored per-evening runs (existing runner functions)', () => {
  test('each policy covers E21..E64 in order, all main_sample', () => {
    for (const p of POLICY_IDS) {
      expect(stored.main.perEvening[p].map((r) => r.evening)).toEqual(MAIN_IDS);
      expect(stored.main.perEvening[p].every((r) => r.split === 'main_sample')).toBe(true);
    }
  });

  test('cells, the twelve comparisons with their intervals, and the verdict match summarize(perEvening)', () => {
    const again = summarize(stored.main.perEvening, { resamples: stored.resamples, seed: stored.seed });
    expect(again).toEqual(stored.main);
  });

  test('the two main comparisons are at 97.5% and the ten supporting ones at 95%', () => {
    expect(stored.main.comparisons.filter((c) => c.main).map((c) => c.level)).toEqual([0.975, 0.975]);
    const supporting = stored.main.comparisons.filter((c) => !c.main);
    expect(supporting).toHaveLength(10);
    expect(supporting.every((c) => c.level === 0.95)).toBe(true);
  });

  test('learning off: each policy comparison matches learningComparison on the stored runs', () => {
    for (const p of POLICY_IDS) {
      const on = stored.main.perEvening[p];
      const off = on.map((r, i) => ({ ...r, foodRescuedKg: stored.learning[p].offFoodKg[i] }));
      expect(learningComparison(on, off, REGISTRATION)).toEqual(stored.learning[p]);
      expect(stored.learning[p].evenings).toBe(44);
    }
  });

  test('food ceiling counts match ceilingCounts on the stored runs (an evening is at the ceiling only if all need is met)', () => {
    expect(ceilingCounts(stored.main.perEvening, mainEvenings, REGISTRATION)).toEqual(stored.ceilings);
  });

  test('food wasted at 95% is the exact mirror of food rescued at 95%, against each baseline (same resamples, sign reversed)', () => {
    const idx = bootstrapIndices(44, REGISTRATION.resamples, REGISTRATION.seed);
    for (const base of ['fcfs', 'nearest', 'central_greedy'] as PolicyId[]) {
      const rescued = pairedInterval(pairedDiffs(stored.main.perEvening.salo, stored.main.perEvening[base], 'foodRescued'), idx, 0.95);
      const wasted = stored.main.comparisons.find((c) => !c.main && c.measure === 'foodWasted' && c.baseline === base)!;
      expect(wasted.mean).toBeCloseTo(-rescued.mean, 9);
      expect(wasted.low).toBeCloseTo(-rescued.high, 9);
      expect(wasted.high).toBeCloseTo(-rescued.low, 9);
    }
  });
});
