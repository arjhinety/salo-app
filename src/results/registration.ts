import { UNTUNED_PARAMS } from '../engine/params';
import type { FrozenParams } from '../engine/types';

/**
 * Bootstrap seed, as documented in docs/decisions.md (D-Q1 evidence, Evaluation): bootstrapIndices(n, 10000, 20260927).
 */
export const BOOTSTRAP_SEED = 20260927;
/** Assumption from RES-03: 10,000 resamples. */
export const RESAMPLES = 10000;

/**
 * The pre-registration record (RES-03, RES-06; guide p.19). Committed in code, all null/false today.
 * Nothing about the main evenings is computed or shown until the pilot has run and the main-evening count is
 * written here. The count is written by a person, in a commit, after the pilot on E11-E20.
 */
export interface Registration {
  mainEveningCount: number | null;
  pilotDone: boolean;
  frozenParamsChecksum: string | null;
  resamples: number;
  seed: number;
}

export const REGISTRATION: Registration = {
  mainEveningCount: null,
  pilotDone: false,
  frozenParamsChecksum: null,
  resamples: RESAMPLES,
  seed: BOOTSTRAP_SEED,
};

/** FNV-1a (32-bit) over a string. A checksum for the record, not a security hash. Uses only Math.imul. */
function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** JSON with object keys sorted, so the same parameters always give the same text. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The checksum written to the registration when the frozen parameters are recorded. */
export function checksumParams(params: FrozenParams): string {
  return `fnv1a32:${fnv1a32(stableStringify(params)).toString(16).padStart(8, '0')}`;
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
