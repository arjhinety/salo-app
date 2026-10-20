/**
 * Import guard (coordinator spec, 2026-10-20). Nothing under src/parse may import the donor catalog (src/donor) or the
 * dataset (src/data): the parser is built from the tuning CSV alone, and its scores are on the raw ParseResponse.
 * Scans every .ts file under src/parse, including the tests and the EVAL-gated eval file.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const PARSE_DIR = join(__dirname, '..');
const FORBIDDEN_SEGMENTS: ReadonlySet<string> = new Set(['donor', 'data']);

function listTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listTs(p));
    else if (name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/** Every module specifier in a file: static import/export ... from, bare import, dynamic import(), and require(). */
function specifiers(source: string): string[] {
  const patterns = [
    /\bfrom\s*\(?\s*['"]([^'"\n]+)['"]/g,
    /\bimport\s*\(?\s*['"]([^'"\n]+)['"]/g,
    /\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  ];
  const out: string[] = [];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) out.push(m[1]);
  }
  return out;
}

const isForbidden = (spec: string): boolean => spec.split(/[/\\]/).some((seg) => FORBIDDEN_SEGMENTS.has(seg));

describe('src/parse import guard', () => {
  const files = listTs(PARSE_DIR);

  it('scans the parser sources, the tests and the eval file', () => {
    const rel = files.map((f) => relative(PARSE_DIR, f).replace(/\\/g, '/'));
    expect(rel).toEqual(expect.arrayContaining(['client.ts', 'validate.ts', 'types.ts', 'rules/index.ts', 'rules/vocab.ts', '__tests__/eval-parser-tuning.test.ts']));
  });

  it.each(files.map((f) => [relative(PARSE_DIR, f).replace(/\\/g, '/'), f] as const))('%s imports nothing from src/donor or src/data', (_name, file) => {
    const bad = specifiers(readFileSync(file, 'utf8')).filter(isForbidden);
    expect(bad).toEqual([]);
  });

  it('scans the eval code as well (src/parse/eval)', () => {
    const rel = files.map((f) => relative(PARSE_DIR, f).replace(/\\/g, '/'));
    expect(rel).toEqual(expect.arrayContaining(['eval/score.ts', 'eval/claudeTuning.ts']));
  });

  it('the guard catches a forbidden import when one is present', () => {
    // The keywords are built from parts so this file's own text does not contain a real forbidden import.
    const FROM = ['fr', 'om'].join('');
    const REQUIRE = ['req', 'uire'].join('');
    const sample = `import { CATALOG } ${FROM} '../../donor/catalog';\nconst x = ${REQUIRE}('../data/dataset');`;
    expect(specifiers(sample).filter(isForbidden)).toEqual(['../../donor/catalog', '../data/dataset']);
  });
});
