/// <reference types="jest" />
// The pre-registration gate (RES-03, RES-06). Expected values are written out, not derived from the code under test.

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

describe('REGISTRATION', () => {
  test('is closed and carries the documented seed and resample count', () => {
    expect(REGISTRATION).toEqual({
      mainEveningCount: null,
      pilotDone: false,
      frozenParamsChecksum: null,
      resamples: 10000,
      seed: 20260927,
    });
  });

  test('today the gate is closed for every reason, with no frozen parameters in the build', () => {
    expect(gateOpen(REGISTRATION, null)).toBe(false);
    expect(gateReasons(REGISTRATION, null)).toEqual([
      'the pilot has not run',
      'the number of main evenings is not recorded',
      'the frozen parameters checksum is not recorded',
      'no frozen parameters are in the build',
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
    expect(gateOpen({ ...REGISTRATION, pilotDone: true }, tuned)).toBe(false);
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

  test('a change to one weight changes the checksum, and the format is fnv1a32 with 8 hex digits', () => {
    const changed = { ...tuned, salo: { ...tuned.salo, utilityWeights: { ...tuned.salo.utilityWeights, need: 0.51 } } };
    expect(checksumParams(changed)).not.toBe(checksumParams(tuned));
    expect(checksumParams(tuned)).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
  });
});
