/// <reference types="node" />
/// <reference types="jest" />
// The frozen parameters (M6): the checksum is recomputed, and the file is checked against the search output.
// Expected values are literal (FIPS 180-4 vectors and the recorded checksum), or come from Node's crypto as a separate implementation.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REGISTRATION } from '../../results/registration';
import { canonicalJson, FROZEN_PARAMS, frozenParamsChecksum, sha256Hex } from '../../engine/frozenParams';
import { UNTUNED_PARAMS } from '../../engine/params';

describe('sha256Hex (pure TypeScript)', () => {
  test('FIPS 180-4 vectors: empty string, "abc" and the 56-byte two-block message', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  test('agrees with Node crypto on lengths around the block boundaries and on non-ASCII text', () => {
    const samples = ['a', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(63), 'x'.repeat(64), 'ñ€😀 Salo', '{"schema":1}'];
    for (const s of samples) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    }
  });
});

describe('canonicalJson', () => {
  test('keys are sorted at every level and there is no whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 0, y: 'q' }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":"q","z":0}]},"b":1}');
  });
});

describe('the frozen parameters', () => {
  test('the checksum is recomputed to the value recorded in the registration', () => {
    expect(frozenParamsChecksum(FROZEN_PARAMS)).toBe(REGISTRATION.frozenParamsChecksum);
    expect(REGISTRATION.frozenParamsChecksum).toBe('sha256:5d0ef9b5bba3bbe441e1a646644bb55ef2413e3925eb94c7783678dfbc10d42e');
  });

  test('the checksum equals Node crypto over the canonical JSON (independent check)', () => {
    const text = canonicalJson(FROZEN_PARAMS);
    expect(frozenParamsChecksum(FROZEN_PARAMS)).toBe(`sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`);
  });

  test('the file is identical to the tuning search output (docs/reports/m6-tuning/chosen-params.json)', () => {
    const fromSearch = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'docs', 'reports', 'm6-tuning', 'chosen-params.json'), 'utf8'));
    expect(FROZEN_PARAMS).toEqual(fromSearch);
  });

  test('frozen on 2026-11-01 from E01-E10, never the untuned marker', () => {
    expect(FROZEN_PARAMS.frozenOn).toBe('2026-11-01');
    expect(FROZEN_PARAMS.tuningEvenings).toEqual(['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10']);
    expect(FROZEN_PARAMS).not.toEqual(UNTUNED_PARAMS);
  });

  test('both weight vectors sum to 1 within 1e-12, and the budget stays 40', () => {
    for (const w of [FROZEN_PARAMS.salo.utilityWeights, FROZEN_PARAMS.centralGreedy.utilityWeights]) {
      expect(Math.abs(w.need + w.storage + w.distance + w.freshness - 1)).toBeLessThan(1e-12);
    }
    expect(FROZEN_PARAMS.salo.shareBudgetPerEvening).toBe(40);
  });
});
