// Generates supabase/seed.sql: the reference tables (donors, pantries, drivers) from the bundled
// Salo Evening Dataset. Only these three CSVs are read. donor_messages.csv and the evening-level
// tables are never read or loaded (docs/decisions.md, "Parser development data" and
// "Hosted backend").
//
// Usage:
//   node scripts/gen-supabase-seed.mjs          write supabase/seed.sql
//   node scripts/gen-supabase-seed.mjs --check  exit 1 if the committed seed differs
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(import.meta.dirname, '..');
const DATA = join(ROOT, 'data', 'salo-evening-dataset');
const OUT = join(ROOT, 'supabase', 'seed.sql');
const TYPES = join(ROOT, 'src', 'engine', 'types.ts');

/** Row counts from the dataset README and docs/architecture.md section 3.2. */
const EXPECTED_ROWS = { donors: 50, pantries: 30, drivers: 40 };

// RFC 4180 parser, same behaviour as scripts/build-data.mjs (quoted commas and quotes).
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, j) => [h, r[j]])));
}

/** Reads the literal members of an exported string union from src/engine/types.ts. */
export function unionOf(src, name) {
  const m = src.match(new RegExp(`export type ${name} =([\\s\\S]*?);`));
  if (!m) throw new Error(`no union ${name} in src/engine/types.ts`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function loadChecked(name, sums) {
  const buf = readFileSync(join(DATA, `${name}.csv`));
  const sha = createHash('sha256').update(buf).digest('hex');
  if (sha !== sums[`${name}.csv`]) throw new Error(`${name}.csv does not match SHA256SUMS (got ${sha})`);
  return { sha, rows: parseCsv(buf.toString('utf8')) };
}

const minute = (hhmm, where) => {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) throw new Error(`${where}: bad time "${hhmm}"`);
  const v = Number(m[1]) * 60 + Number(m[2]);
  if (v < 960 || v > 1320) throw new Error(`${where}: ${hhmm} is outside 16:00-22:00`);
  return v;
};
const bool = (s, where) => {
  if (s !== 'True' && s !== 'False') throw new Error(`${where}: bad boolean "${s}"`);
  return s === 'True';
};
const num = (s, where) => {
  const v = Number(s);
  if (s === '' || !Number.isFinite(v)) throw new Error(`${where}: bad number "${s}"`);
  return v;
};
const int = (s, where) => {
  const v = num(s, where);
  if (!Number.isInteger(v)) throw new Error(`${where}: not an integer "${s}"`);
  return v;
};
const sql = (s) => `'${String(s).replace(/'/g, "''")}'`;
const vocab = (v, allowed, where) => {
  if (!allowed.includes(v)) throw new Error(`${where}: "${v}" is not in the ${allowed.length}-value union`);
  return v;
};

export function buildSeedSql() {
  const types = readFileSync(TYPES, 'utf8');
  const donorTypes = unionOf(types, 'DonorType');
  const pantryTypes = unionOf(types, 'PantryType');
  const vehicles = unionOf(types, 'VehicleKind');

  const sums = Object.fromEntries(
    readFileSync(join(DATA, 'SHA256SUMS'), 'utf8').trim().split('\n').map((l) => {
      const [h, name] = l.trim().split(/\s+/);
      return [name, h];
    }),
  );

  const donorsF = loadChecked('donors', sums);
  const pantriesF = loadChecked('pantries', sums);
  const driversF = loadChecked('drivers', sums);

  const donors = donorsF.rows.map((r) => {
    const w = `donors ${r.donor_id}`;
    if (!/^D\d{2}$/.test(r.donor_id)) throw new Error(`${w}: bad id`);
    return [
      r.donor_id,
      r.donor_name, vocab(r.donor_type, donorTypes, w), r.street,
      minute(r.closing_time, w), bool(r.anchor, w),
    ];
  });
  const pantries = pantriesF.rows.map((r) => {
    const w = `pantries ${r.pantry_id}`;
    if (!/^P\d{2}$/.test(r.pantry_id)) throw new Error(`${w}: bad id`);
    const hasFridge = bool(r.has_fridge, w);
    const fridge = num(r.fridge_capacity_kg, w);
    if (hasFridge !== (fridge > 0)) throw new Error(`${w}: has_fridge and fridge_capacity_kg disagree`);
    const opens = minute(r.opens, w), closes = minute(r.closes, w);
    if (closes <= opens) throw new Error(`${w}: closes before it opens`);
    return [
      r.pantry_id, r.pantry_name, vocab(r.pantry_type, pantryTypes, w), r.street,
      opens, closes, hasFridge, fridge, num(r.dry_storage_kg, w), bool(r.anchor, w),
    ];
  });
  const drivers = driversF.rows.map((r) => {
    const w = `drivers ${r.driver_id}`;
    if (!/^V\d{2}$/.test(r.driver_id)) throw new Error(`${w}: bad id`);
    const from = minute(r.available_from, w), to = minute(r.available_to, w);
    if (to <= from) throw new Error(`${w}: available_to is not after available_from`);
    const runs = int(r.tuning_runs, w), shows = int(r.tuning_shows, w);
    if (shows < 0 || shows > runs) throw new Error(`${w}: tuning_shows outside 0..tuning_runs`);
    const rel = num(r.reliability_estimate_frozen, w);
    if (rel < 0 || rel > 1) throw new Error(`${w}: reliability outside [0, 1]`);
    return [
      r.driver_id, r.display_name, vocab(r.vehicle, vehicles, w), int(r.capacity_load_units, w),
      r.street, from, to, runs, shows, rel, bool(r.anchor, w),
    ];
  });

  const counts = { donors: donors.length, pantries: pantries.length, drivers: drivers.length };
  for (const [t, n] of Object.entries(EXPECTED_ROWS)) {
    if (counts[t] !== n) throw new Error(`${t}: ${counts[t]} rows, expected ${n}`);
  }

  const lit = (v) => (typeof v === 'string' ? sql(v) : String(v));
  const values = (rows) => rows.map((r) => `  (${r.map(lit).join(', ')})`).join(',\n');

  return [
    '-- Seed: reference tables from the Salo Evening Dataset (public data, no pilot or main evening rows).',
    '-- GENERATED by scripts/gen-supabase-seed.mjs. Do not edit by hand; regenerate with',
    '--   node scripts/gen-supabase-seed.mjs',
    '-- Source files (data/salo-evening-dataset, each checked against SHA256SUMS before use):',
    `--   donors.csv    sha256 ${donorsF.sha}  ${counts.donors} rows`,
    `--   pantries.csv  sha256 ${pantriesF.sha}  ${counts.pantries} rows`,
    `--   drivers.csv   sha256 ${driversF.sha}  ${counts.drivers} rows`,
    '',
    'insert into public.donors (id, name, type, street, closing_minute, anchor) values',
    values(donors) + ';',
    '',
    'insert into public.pantries (id, name, type, street, opens_minute, closes_minute, has_fridge,',
    '  fridge_capacity_kg, dry_storage_kg, anchor) values',
    values(pantries) + ';',
    '',
    'insert into public.drivers (id, name, vehicle, capacity_load_units, street, available_from_minute,',
    '  available_to_minute, tuning_runs, tuning_shows, reliability_estimate_frozen, anchor) values',
    values(drivers) + ';',
    '',
  ].join('\n');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const out = buildSeedSql();
  if (process.argv.includes('--check')) {
    const committed = readFileSync(OUT, 'utf8');
    if (committed !== out) {
      console.error('supabase/seed.sql is stale; run node scripts/gen-supabase-seed.mjs');
      process.exit(1);
    }
    console.log('supabase/seed.sql is up to date');
  } else {
    writeFileSync(OUT, out);
    console.log(`wrote ${OUT}`);
  }
}
