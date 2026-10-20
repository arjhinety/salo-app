/**
 * Pass numbers are not limited to 1..3: a stopped pass is replaced by a new number. Fixture claude-tuning-replacement:
 *   pass 1: completed (same file as claude-tuning-stopped/pass-1.jsonl).
 *   pass 2: stopped by auth after 20 messages (same file as claude-tuning-stopped/pass-2.jsonl).
 *   pass 3: completed (same file as claude-tuning-stopped/pass-3.jsonl).
 *   pass 4: completed. It is pass 3 with one change: M0002's food is "ground pork" (gold: giniling), so M0002's food and
 *           all-four flip from right to wrong. Quantity, unit and pickup are unchanged.
 * All passes share one prompt hash and one request config hash, so they form one group: A = passes 1, 3, 4.
 * Hand-computed (k/answered per pass):
 *   pass 1: answered 169 (M0004 unanswered): food 3, quantity 3, unit 3, pickup 3, all four 3.
 *   pass 3: answered 170: food 7, quantity 5, unit 7, pickup 6, all four 4.
 *   pass 4: answered 170: food 6, quantity 5, unit 7, pickup 6, all four 3.
 * Rates: pass 1 uses /169, passes 3 and 4 use /170. The smallest all-four rate is 3/170 (pass 4), not 3/169.
 */
import { join } from 'path';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'fs';
import { tmpdir } from 'os';
import { evaluate, parsePassText, readPassDir, renderClaudeReport, summarize, type PassFile, type Pricing } from '../eval/claudeTuning';
import { loadTuningRows } from './tuningCorpus';

const FIXTURES = join(__dirname, 'fixtures');
const REPL_DIR = join(FIXTURES, 'claude-tuning-replacement');
const PRICING: Pricing = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'server', 'eval', 'pricing.json'), 'utf8'));
const rows = loadTuningRows();
const near = (a: number | null, b: number) => expect(a).toBeCloseTo(b, 12);
/** Re-labels a pass file's text as another pass number (every line carries "pass":N,). */
const asPass = (text: string, from: number, to: number): string => text.split(`"pass":${from},`).join(`"pass":${to},`);

const dir = readPassDir(REPL_DIR);
const ev = evaluate(rows, dir.files, dir.ignored);
const [p1, p2, p3, p4] = ev.passes;
const gA = ev.groups[0];

describe('claude-tuning replacement pass: discovery and status', () => {
  it('reads pass-1 to pass-4, nothing ignored; pass 2 stopped, passes 1, 3, 4 completed', () => {
    expect(dir.files.map((f) => f.pass)).toEqual([1, 2, 3, 4]);
    expect(dir.ignored).toEqual([]);
    expect(ev.passes.map((p) => p.status)).toEqual(['completed', 'stopped', 'completed', 'completed']);
    expect(p2.reason).toBe('auth');
    expect(ev.completed.map((p) => p.pass)).toEqual([1, 3, 4]);
    expect(ev.excluded.map((p) => p.pass)).toEqual([2]);
  });

  it('one group of three completed passes (1, 3, 4), same request config; pass 2 is not in it', () => {
    expect(ev.groups).toHaveLength(1);
    expect(gA.letter).toBe('A');
    expect(gA.passes.map((p) => p.pass)).toEqual([1, 3, 4]);
    expect(gA.requestConfigSha256).toBe(p1.requestConfigSha256);
    expect(p4.requestConfigSha256).toBe(p1.requestConfigSha256);
  });

  it('pass 4 M0002 food is wrong, the rest of M0002 is right; pass 3 M0002 is all four right', () => {
    expect(p3.outcomes.get('M0002')!.scores.food).toBe(true);
    expect(p3.outcomes.get('M0002')!.scores.all).toBe(true);
    expect(p4.outcomes.get('M0002')!.scores).toMatchObject({ food: false, quantity: true, unit: true, pickup: true, all: false });
  });
});

describe('claude-tuning replacement pass: hand-computed scores over group A (1, 3, 4)', () => {
  it('answered and k per pass', () => {
    const s = summarize(gA.passes);
    expect(s.perPass.map((p) => p.n)).toEqual([169, 170, 170]);
    expect(s.perPass.map((p) => p.byField.food.k)).toEqual([3, 7, 6]);
    expect(s.perPass.map((p) => p.byField.quantity.k)).toEqual([3, 5, 5]);
    expect(s.perPass.map((p) => p.byField.unit.k)).toEqual([3, 7, 7]);
    expect(s.perPass.map((p) => p.byField.pickup.k)).toEqual([3, 6, 6]);
    expect(s.perPass.map((p) => p.byField.all.k)).toEqual([3, 4, 3]);
  });

  it('mean = sum of the three rates / 3; min and max are the smallest and largest rate', () => {
    const s = summarize(gA.passes).spread;
    // food: 3/169, 7/170, 6/170
    near(s.food.mean, (3 / 169 + 7 / 170 + 6 / 170) / 3); near(s.food.min, 3 / 169); near(s.food.max, 7 / 170);
    // quantity: 3/169, 5/170, 5/170
    near(s.quantity.mean, (3 / 169 + 5 / 170 + 5 / 170) / 3); near(s.quantity.min, 3 / 169); near(s.quantity.max, 5 / 170);
    // unit: 3/169, 7/170, 7/170
    near(s.unit.mean, (3 / 169 + 7 / 170 + 7 / 170) / 3); near(s.unit.min, 3 / 169); near(s.unit.max, 7 / 170);
    // pickup: 3/169, 6/170, 6/170
    near(s.pickup.mean, (3 / 169 + 6 / 170 + 6 / 170) / 3); near(s.pickup.min, 3 / 169); near(s.pickup.max, 6 / 170);
    // all four: 3/169, 4/170, 3/170; the minimum is 3/170 because it is smaller than 3/169
    near(s.all.mean, (3 / 169 + 4 / 170 + 3 / 170) / 3); near(s.all.min, 3 / 170); near(s.all.max, 4 / 170);
  });

  it('the rendered cells: food 3.1% (1.8%-4.1%), all four 2.0% (1.8%-2.4%)', () => {
    const text = renderClaudeReport(ev, PRICING);
    expect(text).toContain('| food | 3/169 (1.8%) | 7/170 (4.1%) | 6/170 (3.5%) | 3.1% (1.8%–4.1%) |');
    expect(text).toContain('| all four | 3/169 (1.8%) | 4/170 (2.4%) | 3/170 (1.8%) | 2.0% (1.8%–2.4%) |');
  });

  it('pass 2 alone would give a different answer count (19 answered), so it must stay out of group A', () => {
    expect(summarize([p2]).perPass[0].n).toBe(19);
    expect(gA.passes.some((p) => p.pass === 2)).toBe(false);
  });
});

describe('claude-tuning replacement pass: report wording', () => {
  const text = renderClaudeReport(ev, PRICING);
  it('top note: 3 completed passes against the plan of 3, group A is at the plan, pass 2 listed as not completed', () => {
    expect(text).toContain('**Completed passes: 3 (pass numbers 1, 3, 4), against a plan of 3 completed passes per request config.**');
    expect(text).toContain('group A: 3 completed (pass numbers 1, 3, 4), the plan of 3.');
    expect(text).toContain('Not completed, so in no mean or spread (listed in section 4): pass 2 stopped (auth).');
    expect(text).not.toContain('short of the plan');
    expect(text).not.toContain('more than the plan');
  });
  it('group heading and section 3 table name the three passes', () => {
    expect(text).toContain('### Group A: request config ' + p1.requestConfigSha256!.slice(0, 12) + '…');
    expect(text).toContain('3 completed passes: 1, 3, 4');
    expect(text).toContain('mean (min–max) over 3 completed passes |');
  });
});

describe('claude-tuning replacement pass: more than three completed passes are all used and say so', () => {
  // Pass 5 is pass 3's text relabelled (same answers): food rates 3/169, 7/170, 6/170, 7/170.
  const p5: PassFile = parsePassText(asPass(readFileSync(join(REPL_DIR, 'pass-3.jsonl'), 'utf8'), 3, 5), 5, 'pass-5.jsonl');
  const ev5 = evaluate(rows, [...dir.files, p5]);
  const g = ev5.groups[0];
  it('group A has four completed passes (1, 3, 4, 5); the food mean and spread use all four', () => {
    expect(g.passes.map((p) => p.pass)).toEqual([1, 3, 4, 5]);
    const s = summarize(g.passes).spread;
    near(s.food.mean, (3 / 169 + 7 / 170 + 6 / 170 + 7 / 170) / 4);
    near(s.food.min, 3 / 169);
    near(s.food.max, 7 / 170);
  });
  it('the report says four completed passes, one more than the plan, none dropped', () => {
    const t = renderClaudeReport(ev5, PRICING);
    expect(t).toContain('**Completed passes: 4 (pass numbers 1, 3, 4, 5), against a plan of 3 completed passes per request config.**');
    expect(t).toContain('group A: 4 completed (pass numbers 1, 3, 4, 5), 1 more than the plan of 3; all 4 are used, none dropped.');
    expect(t).toContain('This group has 4 completed passes, more than the 3 planned. All 4 are in its means and spreads; none is dropped.');
  });
  it('a pass number above the report range is refused', () => {
    const big = parsePassText(asPass(readFileSync(join(REPL_DIR, 'pass-3.jsonl'), 'utf8'), 3, 1000), 1000, 'pass-1000.jsonl');
    expect(() => evaluate(rows, [big])).toThrow(/above the 999-pass range/);
  });
});

describe('claude-tuning replacement pass: gaps, ignored names, and discovery in a directory', () => {
  it('a number with no file is listed as "no file" and the top note names it', () => {
    const gappy = evaluate(rows, [dir.files[0], dir.files[3]]);
    expect(gappy.passes.map((p) => p.status)).toEqual(['completed', 'no file', 'no file', 'completed']);
    expect(gappy.groups[0].passes.map((p) => p.pass)).toEqual([1, 4]);
    const t = renderClaudeReport(gappy, PRICING);
    expect(t).toContain('Not completed, so in no mean or spread (listed in section 4): pass 2 no file; pass 3 no file.');
    expect(t).toContain('group A: 2 completed (pass numbers 1, 4), 1 short of the plan of 3.');
    expect(t).toContain('### Pass 2: no file');
    expect(t).toContain('- No pass-2.jsonl in the directory.');
  });

  it('other .jsonl names (pass-0, pass-01, notes) are ignored and listed; other extensions are not looked at', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'salo-claude-discover-'));
    try {
      copyFileSync(join(REPL_DIR, 'pass-1.jsonl'), join(tmp, 'pass-1.jsonl'));
      copyFileSync(join(REPL_DIR, 'pass-4.jsonl'), join(tmp, 'pass-4.jsonl'));
      writeFileSync(join(tmp, 'pass-0.jsonl'), '');
      writeFileSync(join(tmp, 'pass-01.jsonl'), 'not json, and never read\n');
      writeFileSync(join(tmp, 'notes.jsonl'), '');
      writeFileSync(join(tmp, 'readme.txt'), 'x');
      const found = readPassDir(tmp);
      expect(found.files.map((f) => f.pass)).toEqual([1, 4]);
      expect(found.ignored).toEqual(['notes.jsonl', 'pass-0.jsonl', 'pass-01.jsonl']);
      const t = renderClaudeReport(evaluate(rows, found.files, found.ignored), PRICING);
      expect(t).toContain('Ignored .jsonl files in the directory (not pass-<n>.jsonl, not read): notes.jsonl, pass-0.jsonl, pass-01.jsonl.');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('a directory with no pass-<n>.jsonl file is refused', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'salo-claude-empty-'));
    try {
      writeFileSync(join(tmp, 'pass-0.jsonl'), '');
      expect(() => readPassDir(tmp)).toThrow(/no pass-<n>\.jsonl files/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
