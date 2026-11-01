/// <reference types="node" />
/// <reference types="jest" />
// RES-01: the build contains no stored results table. The stored main-run record is a test fixture (docs/reports/m6-main/
// record.json, loaded only by tests). No file the app bundles may load it: nothing under src/app, src/components, or the
// non-test files of src/results. Comments are ignored; the check is on code (imports, requires, reads, identifiers).
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const SRC = join(ROOT, 'src');

/** Words that would bring the record into app code: its file name, its folder, its old module, its identifier, the fixture loader. */
const RECORD_REFERENCE = /record\.json|m6-main|mainResults|PERSISTED_MAIN_RESULTS|recordFixture|loadRecord/;

function listFiles(dir: string, keep: (path: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p, keep));
    else if (/\.tsx?$/.test(name) && keep(p)) out.push(p);
  }
  return out;
}

/** Source text with comments removed (so a comment that names the record does not count as a reference). */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

/** The files the app bundles: src/app and src/components in full, and the non-test files of src/results. */
function bundledFiles(): string[] {
  const app = listFiles(join(SRC, 'app'), () => true);
  const components = listFiles(join(SRC, 'components'), () => true);
  const results = listFiles(join(SRC, 'results'), (p) => !p.split(/[\\/]/).includes('__tests__'));
  return [...app, ...components, ...results];
}

describe('the stored record is not in the app bundle (RES-01)', () => {
  test('the old TypeScript record module is gone, so nothing can import it', () => {
    expect(existsSync(join(SRC, 'results', 'mainResults.generated.ts'))).toBe(false);
  });

  test('the record file is a JSON fixture under docs/reports', () => {
    expect(existsSync(join(ROOT, 'docs', 'reports', 'm6-main', 'record.json'))).toBe(true);
  });

  test('the scan covers the screen, the components and the non-test results code', () => {
    const rel = bundledFiles().map((f) => relative(SRC, f).replace(/\\/g, '/'));
    expect(rel).toEqual(expect.arrayContaining(['app/results.tsx', 'results/model.ts', 'results/onDevice.ts', 'results/runner.ts']));
    expect(rel.some((r) => r.startsWith('components/'))).toBe(true);
    expect(rel.some((r) => r.includes('__tests__'))).toBe(false);
  });

  test.each(bundledFiles().map((f) => [relative(SRC, f).replace(/\\/g, '/'), f] as const))(
    '%s does not load the record',
    (_name, file) => {
      expect(code(readFileSync(file, 'utf8'))).not.toMatch(RECORD_REFERENCE);
    },
  );

  test('the guard catches a reference when one is present (the words are built from parts)', () => {
    const sample = `import { PERSISTED_${'MAIN_RESULTS'} } from './mainResults.generated';\nconst x = require('../../docs/reports/m6-main/record.json');`;
    expect(RECORD_REFERENCE.test(code(sample))).toBe(true);
    expect(RECORD_REFERENCE.test(code('// the record lives in docs/reports/m6-main/record.json, see the report\nconst y = 1;'))).toBe(false);
  });
});
