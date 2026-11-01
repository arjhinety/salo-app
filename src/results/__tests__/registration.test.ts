/// <reference types="jest" />
// The pre-registration gate (RES-03, RES-06). Expected values are written out, not derived from the code under test.
// The recorded state is checked against the record itself. The gate logic is checked with a synthetic closed record,
// so the logic keeps being proven after the real record opened.

import { FROZEN_PARAMS } from '../../engine/frozenParams';
import { UNTUNED_PARAMS } from '../../engine/params';
import type { FrozenParams } from '../../engine/types';
import { checksumParams, gateOpen, gateReasons, REGISTRATION, type Registration } from '../registration';

const tuned: FrozenParams = {
  schema: 1,
  frozenOn: '2026-11-01 test fixture',
  tuningEvenings: ['E01', 'E02'],
  salo: {
    utilityWeights: { need: 0.5, storage: 0.2, distance: 0.15, freshness: 0.15 },
    shareBudgetPerEvening: 40,
    shareBid: { kind: 'linear', scale: 17 },
  },
  centralGreedy: { utilityWeights: { need: 0.5, storage: 0.2, distance: 0.15, freshness: 0.15 }, transportPenaltyPerMinute: 0.005 },
};

const openRegistration = (checksum: string | null): Registration => ({
  mainEveningCount: 10,
  pilotDone: true,
  frozenParamsChecksum: checksum,
  resamples: 10000,
  seed: 20260927,
});

/** A synthetic record as it stood before the pilot: nothing recorded. Used to prove the gate logic. */
const closedRegistration: Registration = { ...REGISTRATION, pilotDone: false, mainEveningCount: null };

describe('REGISTRATION (recorded 2026-11-01 after the pilot)', () => {
  test('the pilot is done, the count is the pilot formula result 44, the checksum is the frozen parameters, and the seed and resamples are fixed', () => {
    expect(REGISTRATION).toEqual({
      mainEveningCount: 44,
      pilotDone: true,
      frozenParamsChecksum: 'sha256:5d0ef9b5bba3bbe441e1a646644bb55ef2413e3925eb94c7783678dfbc10d42e',
      resamples: 10000,
      seed: 20260927,
    });
  });

  test('with the frozen parameters the recorded state passes the gate own checks (the screen adds the count check, see model.test.ts)', () => {
    expect(gateReasons(REGISTRATION, FROZEN_PARAMS)).toEqual([]);
    expect(gateOpen(REGISTRATION, FROZEN_PARAMS)).toBe(true);
  });

  test('the recorded state with no parameters in the build is closed, and says so', () => {
    expect(gateOpen(REGISTRATION, null)).toBe(false);
    expect(gateReasons(REGISTRATION, null)).toEqual(['no frozen parameters are in the build']);
  });
});

describe('the gate logic, with a synthetic closed record (nothing recorded)', () => {
  test('closed, with the three reasons: the pilot, the count, and the parameters', () => {
    expect(gateOpen(closedRegistration, null)).toBe(false);
    expect(gateReasons(closedRegistration, null)).toEqual([
      'the pilot has not run',
      'the number of main evenings is not recorded',
      'no frozen parameters are in the build',
    ]);
    expect(gateReasons(closedRegistration, FROZEN_PARAMS)).toEqual([
      'the pilot has not run',
      'the number of main evenings is not recorded',
    ]);
  });

  test('UNTUNED_PARAMS is never accepted, even with a complete record', () => {
    expect(gateReasons(openRegistration('fnv1a32:00000000'), UNTUNED_PARAMS)).toContain('the parameters are untuned');
    expect(gateOpen(openRegistration('fnv1a32:00000000'), UNTUNED_PARAMS)).toBe(false);
  });

  test('a complete record with matching tuned parameters opens the gate', () => {
    const reg = openRegistration(checksumParams(tuned));
    expect(gateReasons(reg, tuned)).toEqual([]);
    expect(gateOpen(reg, tuned)).toBe(true);
  });

  test('a recorded checksum that does not match the parameters keeps the gate closed', () => {
    const reg = openRegistration(checksumParams({ ...tuned, frozenOn: 'another freeze' }));
    expect(gateOpen(reg, tuned)).toBe(false);
    expect(gateReasons(reg, tuned)).toEqual(['the parameters do not match the recorded checksum']);
  });

  test('the pilot flag alone is not enough: the count and checksum must also be recorded', () => {
    expect(gateOpen({ ...closedRegistration, pilotDone: true }, tuned)).toBe(false);
  });

  test('the count alone is not enough: the pilot must also be recorded', () => {
    expect(gateOpen({ ...closedRegistration, mainEveningCount: 44 }, tuned)).toBe(false);
  });
});

describe('checksumParams', () => {
  test('the same parameters give the same checksum, whatever the key order', () => {
    const reordered = JSON.parse(JSON.stringify(tuned), (_k, v) => v) as FrozenParams;
    const shuffled = {
      centralGreedy: reordered.centralGreedy,
      salo: reordered.salo,
      tuningEvenings: reordered.tuningEvenings,
      frozenOn: reordered.frozenOn,
      schema: reordered.schema,
    } as FrozenParams;
    expect(checksumParams(shuffled)).toBe(checksumParams(tuned));
  });

  test('a change to one weight changes the checksum, and the format is sha256 with 64 hex digits', () => {
    const changed = { ...tuned, salo: { ...tuned.salo, utilityWeights: { ...tuned.salo.utilityWeights, need: 0.51 } } };
    expect(checksumParams(changed)).not.toBe(checksumParams(tuned));
    expect(checksumParams(tuned)).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
