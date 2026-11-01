// Run: node --test scripts/gen-supabase-seed.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildSeedSql, parseCsv, unionOf } from './gen-supabase-seed.mjs';

const ROOT = join(import.meta.dirname, '..');
const seed = buildSeedSql();

test('the generator is deterministic', () => {
  assert.equal(buildSeedSql(), seed);
});

test('the committed supabase/seed.sql matches the generator output', () => {
  assert.equal(readFileSync(join(ROOT, 'supabase', 'seed.sql'), 'utf8'), seed);
});

test('row counts equal the CSV row counts (50 donors, 30 pantries, 40 drivers)', () => {
  const rows = (prefix) => seed.split('\n').filter((l) => l.startsWith(`  ('${prefix}`)).length;
  assert.equal(rows('D'), 50);
  assert.equal(rows('P'), 30);
  assert.equal(rows('V'), 40);
});

test('the source sha256 values are the SHA256SUMS values', () => {
  assert.ok(seed.includes('donors.csv    sha256 3627a11639cca71c93b216e742e52aa7254d93f6db10d585a50d3a23323083f1'));
  assert.ok(seed.includes('pantries.csv  sha256 51750f323d3e2f43ca7e957baf6a8606ac55ddfc11200201d13b4d44c27f1c6d'));
  assert.ok(seed.includes('drivers.csv   sha256 50e35f5c99a7451536844c33632d4474ed5988417d43913da089a0685f220c6e'));
});

test('a known row is written exactly (D01 closes 17:30 = 1050 minutes)', () => {
  assert.ok(seed.includes(
    "  ('D01', 'Karinderya ni Aling Oning', 'karinderya', 'Aurora Boulevard', 1050, true)",
  ));
});

test('the seed holds no pilot or main evening ids (E11-E64)', () => {
  assert.equal(/\bE(1[1-9]|[2-5][0-9]|6[0-4])\b/.test(seed), false);
});

test('the seed loads only the three reference tables', () => {
  const inserts = seed.split('\n').filter((l) => l.startsWith('insert into'));
  assert.deepEqual(inserts, [
    'insert into public.donors (id, name, type, street, closing_minute, anchor) values',
    'insert into public.pantries (id, name, type, street, opens_minute, closes_minute, has_fridge,',
    'insert into public.drivers (id, name, vehicle, capacity_load_units, street, available_from_minute,',
  ]);
});

test('parseCsv handles quoted commas and doubled quotes', () => {
  assert.deepEqual(
    parseCsv('a,b,c\n1,"x, y","say ""hi"""\n'),
    [{ a: '1', b: 'x, y', c: 'say "hi"' }],
  );
});

test('unionOf reads the literal members of a union', () => {
  assert.deepEqual(unionOf("export type VehicleKind = 'car' | 'bicycle';", 'VehicleKind'), ['car', 'bicycle']);
  assert.throws(() => unionOf('', 'Missing'), /no union Missing/);
});
