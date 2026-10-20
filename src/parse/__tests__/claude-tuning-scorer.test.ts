/**
 * Claude-path scorer on committed fixtures (src/parse/__tests__/fixtures/claude-tuning-stopped and claude-tuning). Fake
 * saved responses, no network, always runs. The expected numbers were worked out by hand from the scenarios before the
 * assertions were written.
 *
 * claude-tuning-stopped (one request config, all hashes equal):
 *   pass 1: completed, all 170 sent. M0004 gets five 503 outages and is unanswered (excluded from the denominator).
 *   pass 2: stopped by an auth error on M0020 after 20 messages (M0001 to M0020 sent, M0021 to M0170 not sent).
 *   pass 3: completed, all 170 sent, no outages.
 * claude-tuning (passes 1-2 share prompt A and request config A; pass 3 has prompt A and request config B, because only
 * the output schema changed):
 *   pass 1 = the same scenario as above (complete). pass 2: complete, M0005 gets five connection outages.
 *   pass 3 = the same scenario as above (complete).
 * Messages that the scenario does not script get a 422 in every pass (answered, wrong).
 */
import { join } from 'path';
import { createHash } from 'crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import {
  evaluate, parsePassText, readPassFiles, renderClaudeReport, summarize, summarizeByGroup, excludeIds, costUsd,
  PROMPT_EXAMPLE_IDS, type PassFile, type Pricing,
} from '../eval/claudeTuning';
import { loadTuningRows } from './tuningCorpus';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'claude-tuning-stopped');
const HASHED_DIR = join(__dirname, 'fixtures', 'claude-tuning');
const PRICING: Pricing = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'server', 'eval', 'pricing.json'), 'utf8'));
const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const PROMPT_A = sha('prompt-A (fixture)');
const RC_A = sha('request-config-A (fixture)');
const RC_B = sha('request-config-B (fixture)');

const rows = loadTuningRows();
const files = readPassFiles(FIXTURE_DIR);
const ev = evaluate(rows, files);
const [p1, p2, p3] = ev.passes;

describe('claude-tuning scorer: pass status and markers', () => {
  it('reads three pass files; pass 1 and 3 completed, pass 2 stopped with reason auth', () => {
    expect(files.map((f) => f.pass)).toEqual([1, 2, 3]);
    expect([p1.status, p1.reason, p1.markerMessagesSent]).toEqual(['completed', null, 170]);
    expect([p2.status, p2.reason, p2.markerMessagesSent]).toEqual(['stopped', 'auth', 20]);
    expect([p3.status, p3.reason, p3.markerMessagesSent]).toEqual(['completed', null, 170]);
    expect(ev.completed.map((p) => p.pass)).toEqual([1, 3]);
    expect(ev.excluded.map((p) => p.pass)).toEqual([2]);
  });

  it('sent, not sent and unanswered per pass', () => {
    expect([p1.sentIds.length, p1.notSentIds.length]).toEqual([170, 0]);
    expect(p1.unansweredIds).toEqual(['M0004']);
    expect([p2.sentIds.length, p2.notSentIds.length]).toEqual([20, 150]);
    expect([p2.notSentIds[0], p2.notSentIds[149]]).toEqual(['M0021', 'M0170']);
    expect(p2.unansweredIds).toEqual(['M0020']);
    expect([p3.sentIds.length, p3.notSentIds.length, p3.unansweredIds.length]).toEqual([170, 0, 0]);
  });

  it('attempts, 429s, retries and outages per pass (exact)', () => {
    expect([p1.counts.attempts, p1.counts.http429, p1.counts.retries, p1.counts.networkErrors]).toEqual([177, 1, 7, 1]);
    expect(p1.counts.outage503).toEqual({ server: 2, timeout: 2, connection: 2 });
    expect([p2.counts.attempts, p2.counts.http429, p2.counts.retries, p2.counts.networkErrors]).toEqual([23, 1, 3, 1]);
    expect(p2.counts.outage503).toEqual({ connection: 1, auth: 1 });
    expect([p3.counts.attempts, p3.counts.http429, p3.counts.retries, p3.counts.networkErrors]).toEqual([171, 1, 1, 0]);
    expect(p3.counts.outage503).toEqual({});
    const total429 = p1.counts.http429 + p2.counts.http429 + p3.counts.http429;
    const totalRetries = p1.counts.retries + p2.counts.retries + p3.counts.retries;
    expect([total429, totalRetries]).toEqual([3, 11]);
  });

  it('a pass with no marker and a pass with no file are both excluded, with their status', () => {
    const noMarker: PassFile[] = [files[0], { ...files[2], end: null }];
    const ev2 = evaluate(rows, noMarker);
    expect(ev2.passes.map((p) => p.status)).toEqual(['completed', 'no file', 'no marker']);
    expect(ev2.completed.map((p) => p.pass)).toEqual([1]);
    expect(ev2.passes[2].sentIds.length).toBe(170);
  });
});

describe('claude-tuning scorer: scores over completed passes (hand-computed)', () => {
  // Pass 1, answered 169: correct M0001, M0002, M0003 => k = 3 for every field.
  // Pass 3, answered 170: food 7, quantity 5, unit 7, pickup 6, all four 4.
  it('pass 1 and 3 counts and answered n (all 170 messages)', () => {
    const s = summarize(ev.completed);
    expect(s.perPass.map((p) => p.n)).toEqual([169, 170]);
    expect(s.perPass[0].byField.food.k).toBe(3);
    expect(s.perPass[0].byField.all.k).toBe(3);
    expect(s.perPass[1].byField.food.k).toBe(7);
    expect(s.perPass[1].byField.quantity.k).toBe(5);
    expect(s.perPass[1].byField.unit.k).toBe(7);
    expect(s.perPass[1].byField.pickup.k).toBe(6);
    expect(s.perPass[1].byField.all.k).toBe(4);
  });

  it('mean and min-max spread over the two completed passes only (food, quantity, unit, pickup, all four)', () => {
    const s = summarize(ev.completed).spread;
    const near = (a: number | null, b: number) => expect(a).toBeCloseTo(b, 12);
    near(s.food.mean, (3 / 169 + 7 / 170) / 2);
    near(s.food.min, 3 / 169);
    near(s.food.max, 7 / 170);
    near(s.quantity.mean, (3 / 169 + 5 / 170) / 2);
    near(s.quantity.min, 3 / 169);
    near(s.quantity.max, 5 / 170);
    near(s.unit.mean, (3 / 169 + 7 / 170) / 2);
    near(s.pickup.mean, (3 / 169 + 6 / 170) / 2);
    near(s.pickup.max, 6 / 170);
    near(s.all.mean, (3 / 169 + 4 / 170) / 2);
    near(s.all.min, 3 / 169);
    near(s.all.max, 4 / 170);
  });

  it('the 167 messages without M0001, M0008, M0025 (completed passes): n 166 and 167', () => {
    const include = excludeIds(PROMPT_EXAMPLE_IDS);
    const s = summarize(ev.completed, include);
    expect(PROMPT_EXAMPLE_IDS).toEqual(['M0001', 'M0008', 'M0025']);
    expect(s.perPass.map((p) => p.n)).toEqual([166, 167]);
    expect(s.perPass[0].byField.all.k).toBe(2);
    expect(s.perPass[1].byField.food.k).toBe(6);
    expect(s.perPass[1].byField.quantity.k).toBe(4);
    expect(s.perPass[1].byField.unit.k).toBe(6);
    expect(s.perPass[1].byField.pickup.k).toBe(6);
    expect(s.perPass[1].byField.all.k).toBe(4);
    expect(s.spread.food.mean).toBeCloseTo((2 / 166 + 6 / 167) / 2, 12);
    expect(s.spread.all.mean).toBeCloseTo((2 / 166 + 4 / 167) / 2, 12);
    expect(s.spread.all.max).toBeCloseTo(4 / 167, 12);
  });

  it('the stopped pass 2 is not in the means: a summary over pass 2 alone would differ', () => {
    const only2 = summarize([p2]).perPass[0];
    expect(only2.n).toBe(19);
    expect(only2.byField.food.k).toBe(6);
  });

  it('per message across passes (M0002 food): right in pass 1, wrong in pass 2, right in pass 3 => mean 2/3, spread [0, 1]', () => {
    const scores = [p1, p2, p3].map((p) => p.outcomes.get('M0002')!.scores.food);
    expect(scores).toEqual([true, false, true]);
    const mean = scores.reduce((s, v) => s + (v ? 1 : 0), 0) / 3;
    expect(mean).toBeCloseTo(2 / 3, 12);
    expect(Math.min(...scores.map(Number))).toBe(0);
    expect(Math.max(...scores.map(Number))).toBe(1);
  });

  it('language and difficulty groups (completed passes): unanswered messages leave the denominator', () => {
    const lang = summarizeByGroup(ev, 'language', ev.completed);
    expect(lang.get('fil')!.size).toBe(34);
    expect(lang.get('fil')!.summary.perPass.map((p) => p.byField.all.k / p.byField.all.n)).toEqual([2 / 34, 0]);
    expect(lang.get('fil')!.summary.spread.all.mean).toBeCloseTo(1 / 34, 12);
    // en: M0004 is unanswered in pass 1, so pass 1 has 53 answered en messages and pass 3 has 54.
    expect(lang.get('en')!.summary.perPass.map((p) => p.n)).toEqual([53, 54]);
    expect(lang.get('en')!.summary.perPass.map((p) => p.byField.all.k)).toEqual([0, 1]);
    expect(lang.get('en')!.summary.spread.all.mean).toBeCloseTo((0 + 1 / 54) / 2, 12);
    const diff = summarizeByGroup(ev, 'difficulty', ev.completed);
    expect(diff.get('contradictory')!.size).toBe(9);
    expect(diff.get('contradictory')!.summary.spread.all.mean).toBeCloseTo((0 + 1 / 9) / 2, 12);
    expect(diff.get('contradictory')!.summary.spread.all.max).toBeCloseTo(1 / 9, 12);
  });
});

describe('claude-tuning scorer: answered responses that are not 200', () => {
  const labels = (p: typeof p1) => {
    const out: Record<string, number> = {};
    for (const o of p.outcomes.values()) if (o.scored && o.label !== null) out[o.label] = (out[o.label] ?? 0) + 1;
    return out;
  };
  it('labels per pass (final attempt)', () => {
    expect(labels(p1)).toEqual({ '200 invalid body': 1, '503 model_output_rejected': 1, '422 not_food_message': 164 });
    expect(labels(p3)).toEqual({ '422 not_food_message': 163 });
    expect(labels(p2)).toEqual({ '422 not_food_message': 12 });
  });
});

describe('claude-tuning scorer: the report', () => {
  const text = renderClaudeReport(ev, PRICING);
  it('carries the two verbatim scope lines at the top', () => {
    expect(text).toContain('Scores are computed on the raw ParseResponse (src/parse output), before any catalog mapping.');
    expect(text).toContain("In-sample score: the proxy's prompt quotes tuning messages M0001, M0008 and M0025 with their answers, and its food list comes from the gold labels of all 170 tuning messages. This score is in-sample and must never be quoted as expected accuracy.");
  });
  it('says only 2 of 3 passes are completed and lists the excluded pass with its reason', () => {
    expect(text).toContain('**Only 2 of 3 passes are completed** (pass 1, pass 3).');
    expect(text).toContain('### Pass 2: stopped');
    expect(text).toContain('- Reason: auth.');
    expect(text).toContain('- Not-sent ids (150): M0021,');
  });
  it('has no request-config warning when one group exists', () => {
    expect(text).not.toContain('**Warning: the completed passes used');
  });
});

describe('claude-tuning scorer: integrity guards', () => {
  const text3 = readFileSync(join(FIXTURE_DIR, 'pass-3.jsonl'), 'utf8');
  const lines3 = text3.trim().split('\n');
  const edit = (f: (ls: string[]) => string[]) => f(lines3.slice()).join('\n');

  it('a message id outside the 170 tuning messages is refused', () => {
    const bad = parsePassText(edit((ls) => ls.map((l, i) => (i === 0 ? l.replace('M0001', 'M0171') : l))), 3, 'bad');
    expect(() => evaluate(rows, [files[0], files[1], bad])).toThrow(/M0171 is not in the tuning set/);
  });

  it('an evening that does not match the tuning file is refused', () => {
    const bad = parsePassText(edit((ls) => ls.map((l, i) => (i === 0 ? l.replace('"evening_id":"E01"', '"evening_id":"E11"') : l))), 3, 'bad');
    expect(() => evaluate(rows, [files[0], files[1], bad])).toThrow(/evening E11, expected E01/);
  });

  it('a duplicate attempt line is refused', () => {
    const bad = parsePassText(edit((ls) => [ls[0], ...ls]), 3, 'bad');
    expect(() => evaluate(rows, [files[0], files[1], bad])).toThrow(/attempt 1 twice/);
  });

  it('a line after the pass_end marker is refused by the parser', () => {
    const marker = lines3[lines3.length - 1];
    expect(() => parsePassText(`${marker}\n${lines3[0]}\n`, 3, 'bad')).toThrow(/after the pass_end marker/);
  });

  it('a completed marker that does not cover all 170 messages is refused', () => {
    const short = parsePassText(edit((ls) => ls.filter((l) => !l.includes('"message_id":"M0170"')).map((l) => (l.includes('"pass_end"') ? l.replace('"messages_sent":170', '"messages_sent":169') : l))), 3, 'short');
    expect(() => evaluate(rows, [files[0], files[1], short])).toThrow(/marked completed but only 169 of 170/);
  });

  it('a marker whose messages_sent disagrees with the file is refused', () => {
    const bad = parsePassText(edit((ls) => ls.map((l) => (l.includes('"pass_end"') ? l.replace('"messages_sent":170', '"messages_sent":171') : l))), 3, 'bad');
    expect(() => evaluate(rows, [files[0], files[1], bad])).toThrow(/marker says 171 messages sent/);
  });

  it('a malformed usage object is refused', () => {
    const bad = parsePassText(edit((ls) => ls.map((l, i) => (i === 0 ? l.replace('"usage":null', '"usage":{"input_tokens":"x"}') : l))), 3, 'bad');
    expect(bad).toBeDefined();
  });

  it('a pass number in a file name must match the lines inside it', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'salo-claude-scorer-'));
    try {
      mkdirSync(tmp, { recursive: true });
      writeFileSync(join(tmp, 'pass-1.jsonl'), readFileSync(join(FIXTURE_DIR, 'pass-3.jsonl'), 'utf8'));
      expect(() => readPassFiles(tmp)).toThrow(/pass 3 in a pass 1 file/);
      rmSync(join(tmp, 'pass-1.jsonl'));
      writeFileSync(join(tmp, 'notes.txt'), 'x');
      writeFileSync(join(tmp, 'pass-9.jsonl'), '');
      expect(() => readPassFiles(tmp)).toThrow(/pass-9\.jsonl: file names must be/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('claude-tuning scorer: request-config groups (fixture claude-tuning: passes 1-2 share request config A, pass 3 has B)', () => {
  const hfiles = readPassFiles(HASHED_DIR);
  const hev = evaluate(rows, hfiles);
  const [h1, h2, h3] = hev.passes;
  const [gA, gB] = hev.groups;
  const near = (a: number | null, b: number) => expect(a).toBeCloseTo(b, 12);

  it('all three passes are completed and share the prompt hash; two groups by request config: A = passes 1-2, B = pass 3', () => {
    expect(hev.passes.map((p) => p.status)).toEqual(['completed', 'completed', 'completed']);
    expect([h1.promptSha256, h2.promptSha256, h3.promptSha256]).toEqual([PROMPT_A, PROMPT_A, PROMPT_A]);
    expect(hev.groups.map((g) => [g.letter, g.requestConfigSha256, g.promptSha256, g.passes.map((p) => p.pass)])).toEqual([
      ['A', RC_A, PROMPT_A, [1, 2]],
      ['B', RC_B, PROMPT_A, [3]],
    ]);
    expect(gA.gitCommits).toEqual(['1'.repeat(40)]);
    expect([h1.gitState, h2.gitState, h3.gitState]).toEqual(['clean', 'clean', 'clean']);
  });

  it('pass 2 (group A) counts: 169 answered, M0005 unanswered, 177 attempts, outages and retries exact', () => {
    expect([h2.sentIds.length, h2.notSentIds.length, h2.unansweredIds]).toEqual([170, 0, ['M0005']]);
    expect([h2.counts.attempts, h2.counts.http429, h2.counts.retries, h2.counts.networkErrors]).toEqual([177, 1, 7, 1]);
    expect(h2.counts.outage503).toEqual({ timeout: 1, connection: 5 });
    const s = summarize(gA.passes);
    expect(s.perPass.map((p) => p.n)).toEqual([169, 169]);
    expect(s.perPass[1].byField).toMatchObject({ food: { k: 4 }, quantity: { k: 5 }, unit: { k: 5 }, pickup: { k: 5 }, all: { k: 4 } });
  });

  it('group A mean and min-max spread come from passes 1-2 only (hand-computed: /169)', () => {
    const s = summarize(gA.passes).spread;
    near(s.food.mean, (3 / 169 + 4 / 169) / 2); near(s.food.min, 3 / 169); near(s.food.max, 4 / 169);
    near(s.quantity.mean, (3 / 169 + 5 / 169) / 2); near(s.quantity.min, 3 / 169); near(s.quantity.max, 5 / 169);
    near(s.unit.mean, (3 / 169 + 5 / 169) / 2); near(s.unit.min, 3 / 169); near(s.unit.max, 5 / 169);
    near(s.pickup.mean, (3 / 169 + 5 / 169) / 2); near(s.pickup.min, 3 / 169); near(s.pickup.max, 5 / 169);
    near(s.all.mean, (3 / 169 + 4 / 169) / 2); near(s.all.min, 3 / 169); near(s.all.max, 4 / 169);
  });

  it('group B is pass 3 alone: the spread is the single value (hand-computed: /170)', () => {
    const s = summarize(gB.passes).spread;
    expect(gB.passes.map((p) => p.pass)).toEqual([3]);
    near(s.food.mean, 7 / 170); near(s.food.min, 7 / 170); near(s.food.max, 7 / 170);
    near(s.quantity.mean, 5 / 170); near(s.quantity.min, 5 / 170); near(s.quantity.max, 5 / 170);
    near(s.unit.mean, 7 / 170);
    near(s.pickup.mean, 6 / 170);
    near(s.all.mean, 4 / 170); near(s.all.min, 4 / 170); near(s.all.max, 4 / 170);
  });

  it('the report warns at the top about two request configurations, shows each group, and labels group B as one pass', () => {
    const text = renderClaudeReport(hev, PRICING);
    expect(text.indexOf('**Warning: the completed passes used 2 different request configurations')).toBeGreaterThan(-1);
    expect(text.indexOf('**Warning')).toBeLessThan(text.indexOf('## 1. Pass status'));
    expect(text).toContain('### Group A: request config ' + RC_A.slice(0, 12) + '…');
    expect(text).toContain('### Group B: request config ' + RC_B.slice(0, 12) + '…');
    expect(text).toContain('One completed pass in this group: the spread is that single value');
    expect(text).toContain('| B | ' + RC_B + ' | ' + PROMPT_A + ' |');
  });

  it('a pass whose lines disagree on the prompt hash is invalid and leaves the groups', () => {
    const lines = readFileSync(join(HASHED_DIR, 'pass-2.jsonl'), 'utf8').trim().split('\n');
    lines[3] = lines[3].replace(`"prompt_sha256":"${PROMPT_A}"`, `"prompt_sha256":"${'d'.repeat(64)}"`);
    const bad = parsePassText(lines.join('\n') + '\n', 2, 'bad');
    const ev2 = evaluate(rows, [hfiles[0], bad, hfiles[2]]);
    expect(ev2.passes[1].status).toBe('invalid');
    expect(ev2.passes[1].reason).toMatch(/prompt_sha256 .* differs inside the pass/);
    expect(ev2.groups.map((g) => [g.letter, g.passes.map((p) => p.pass)])).toEqual([['A', [1]], ['B', [3]]]);
    expect(renderClaudeReport(ev2, PRICING)).toContain('### Pass 2: invalid');
  });

  it('a pass whose lines disagree on the request config hash is invalid too', () => {
    const lines = readFileSync(join(HASHED_DIR, 'pass-2.jsonl'), 'utf8').trim().split('\n');
    lines[3] = lines[3].replace(`"request_config_sha256":"${RC_A}"`, `"request_config_sha256":"${RC_B}"`);
    const bad = parsePassText(lines.join('\n') + '\n', 2, 'bad');
    const ev2 = evaluate(rows, [hfiles[0], bad, hfiles[2]]);
    expect(ev2.passes[1].status).toBe('invalid');
    expect(ev2.passes[1].reason).toMatch(/request_config_sha256 .* differs inside the pass/);
    expect(ev2.groups.map((g) => g.letter)).toEqual(['A', 'B']);
  });

  it('tokens and cost, every attempt included (hand-computed; pricing.json: $0.10 in, $0.50 out, cache write 1.25x, read 0.1x per MTok)', () => {
    expect(h1.tokens).toEqual({
      attempts: 177, withUsage: 169, nullUsage: { total: 8, http429: 1, outage: 7, other: 0 }, partialUsage: 0,
      input: 134600, output: 6780, cacheWrite: 500, cacheRead: 0,
    });
    expect(h2.tokens).toEqual({
      attempts: 177, withUsage: 169, nullUsage: { total: 8, http429: 1, outage: 7, other: 0 }, partialUsage: 0,
      input: 134500, output: 6770, cacheWrite: 0, cacheRead: 600,
    });
    expect(h3.tokens).toEqual({
      attempts: 171, withUsage: 170, nullUsage: { total: 1, http429: 1, outage: 0, other: 0 }, partialUsage: 0,
      input: 136000, output: 6800, cacheWrite: 0, cacheRead: 0,
    });
    // Per pass: 134600 x 0.10 + 6780 x 0.50 + 500 x 0.125 (per MTok, divided by 1e6)
    near(costUsd(h1.tokens, PRICING), 0.0169125);
    near(costUsd(h2.tokens, PRICING), 0.016841);
    near(costUsd(h3.tokens, PRICING), 0.017);
    const sum = [h1, h2, h3].reduce((s, p) => s + costUsd(p.tokens, PRICING), 0);
    near(sum, 0.0507535);
    // Totals across passes: input 405100, output 20350, cache write 500, cache read 600, 508 attempts with usage, 17 null.
    const totals = [h1, h2, h3].reduce((t, p) => ({
      input: t.input + p.tokens.input, output: t.output + p.tokens.output,
      cw: t.cw + p.tokens.cacheWrite, cr: t.cr + p.tokens.cacheRead, withUsage: t.withUsage + p.tokens.withUsage,
      nulls: t.nulls + p.tokens.nullUsage.total,
    }), { input: 0, output: 0, cw: 0, cr: 0, withUsage: 0, nulls: 0 });
    expect(totals).toEqual({ input: 405100, output: 20350, cw: 500, cr: 600, withUsage: 508, nulls: 17 });
    near(sum / totals.withUsage, 0.0507535 / 508);
    const text = renderClaudeReport(hev, PRICING);
    expect(text).toContain('| total | | 525 | 508 | 3 | 14 | 0 | 405100 | 20350 | 500 | 600 |');
  });
});
