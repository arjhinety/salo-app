import { frozenParamsChecksum } from '../engine/frozenParams';
import { UNTUNED_PARAMS } from '../engine/params';
import type { FrozenParams } from '../engine/types';

/**
 * Bootstrap seed, as documented in docs/decisions.md (D-Q1 evidence, Evaluation): bootstrapIndices(n, 10000, 20260927).
 */
export const BOOTSTRAP_SEED = 20260927;
/** Assumption from RES-03: 10,000 resamples. */
export const RESAMPLES = 10000;

/**
 * Main evenings in dataset v1.3 (E21-E64, decisions.md). Stated here for the screen's check; the runner counts the
 * evenings it is given, and refuses a count that differs.
 */
export const MAIN_EVENINGS_IN_DATASET = 44;

/**
 * The pre-registration record (RES-03, RES-06; guide p.19). Nothing about the main evenings is computed or shown
 * until the pilot has run and the main-evening count is written here.
 * The pilot ran on E11-E20 on 2026-11-01 (docs/reports/m6-pilot.md, src/tuning/pilotCount.ts). The count is
 * max(n_food, n_fair, 10) = 44, from the pilot's SDs. Dataset v1.3 has 44 main evenings (E21-E64, Arjhine's decision),
 * so the count matches. The runner runs only when it is called, and the Results screen never calls it.
 */
export interface Registration {
  mainEveningCount: number | null;
  pilotDone: boolean;
  frozenParamsChecksum: string | null;
  resamples: number;
  seed: number;
}

export const REGISTRATION: Registration = {
  mainEveningCount: 44,
  pilotDone: true,
  frozenParamsChecksum: 'sha256:5d0ef9b5bba3bbe441e1a646644bb55ef2413e3925eb94c7783678dfbc10d42e',
  resamples: RESAMPLES,
  seed: BOOTSTRAP_SEED,
};

/**
 * The checksum recorded when the frozen parameters are recorded: "sha256:" + SHA-256 of their canonical JSON
 * (src/engine/frozenParams.ts). The gate compares the recorded value with this function's output.
 */
export function checksumParams(params: FrozenParams): string {
  return frozenParamsChecksum(params);
}

/**
 * Why the main results are still gated. An empty list means open. `params` is null when no frozen parameter
 * file exists in the build (tuning has not frozen them yet).
 */
export function gateReasons(reg: Registration, params: FrozenParams | null): string[] {
  const reasons: string[] = [];
  if (!reg.pilotDone) reasons.push('the pilot has not run');
  if (reg.mainEveningCount === null) reasons.push('the number of main evenings is not recorded');
  if (reg.frozenParamsChecksum === null) reasons.push('the frozen parameters checksum is not recorded');
  if (params === null) reasons.push('no frozen parameters are in the build');
  else if (params === UNTUNED_PARAMS || params.frozenOn === 'UNTUNED') reasons.push('the parameters are untuned');
  else if (reg.frozenParamsChecksum !== null && reg.frozenParamsChecksum !== checksumParams(params)) {
    reasons.push('the parameters do not match the recorded checksum');
  }
  return reasons;
}

export function gateOpen(reg: Registration, params: FrozenParams | null): boolean {
  return gateReasons(reg, params).length === 0;
}

/** Thrown before any results are computed while the gate is closed (RES-03, RES-06). */
export class ResultsGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResultsGateError';
  }
}

/**
 * Guard for functions that take finished runs (RES-07). The frozen parameters are not known here, so this checks the
 * record only: pilot run, main-evening count, checksum. The runner checks everything.
 */
export function requireRecordOpen(reg: Registration): void {
  const missing = [
    !reg.pilotDone && 'the pilot has not run',
    reg.mainEveningCount === null && 'the number of main evenings is not recorded',
    reg.frozenParamsChecksum === null && 'the frozen parameters checksum is not recorded',
  ].filter(Boolean);
  if (missing.length) throw new ResultsGateError(`Results are gated: ${missing.join('; ')}.`);
}
