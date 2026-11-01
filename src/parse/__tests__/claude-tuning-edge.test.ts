/**
 * Edge-target scorer tests on the committed laptop fixture (claude-tuning-stopped), re-labelled as edge passes in memory:
 * every line and marker gets "target": "edge" and an edge request config hash. Fake saved responses, no network, always runs.
 * Checks: edge passes are scored exactly like laptop passes; a report only reads passes of its own target; a pass with
 * lines of both targets is invalid; a missing target is laptop; HTTP 401 (edge token refresh) is never a parse outcome;
 * the edge report is labelled at the top.
 */
import { join } from 'path';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import {
  evaluate, parsePassText, renderClaudeReport, summarize, type PassFile, type Pricing,
} from '../eval/claudeTuning';
import { loadTuningRows } from './tuningCorpus';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'claude-tuning-stopped');
const PRICING: Pricing = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'server', 'eval', 'pricing.json'), 'utf8'));
const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const EDGE_RC = sha('request-config-edge (test)');

const rows = loadTuningRows();
const laptopText = (n: number): string => readFileSync(join(FIXTURE_DIR, `pass-${n}.jsonl`), 'utf8');
const lineObjects = (text: string): Record<string, unknown>[] => text.split('\n').filter((l) => l.trim() !== '').map((l) => JSON.parse(l));
const toText = (objs: Record<string, unknown>[]): string => objs.map((o) => JSON.stringify(o)).join('\n') + '\n';

/** The same pass as an edge pass: target edge on every line and marker, the edge request config, pass number relabelled. */
function asEdge(n: number, relabelTo: number = n): PassFile {
  const objs = lineObjects(laptopText(n)).map((o) => ({ ...o, pass: relabelTo, target: 'edge', request_config_sha256: EDGE_RC }));
  return parsePassText(toText(objs), relabelTo, `edge-pass-${relabelTo}.jsonl`);
}
const laptop = (n: number): PassFile => parsePassText(laptopText(n), n, `pass-${n}.jsonl`);

describe('edge passes are scored like laptop passes, on their own', () => {
  it('the edge passes 1 and 3 are completed and form one edge group with the edge request config', () => {
    const ev = evaluate(rows, [asEdge(1), asEdge(3)], [], 'edge');
    expect(ev.target).toBe('edge');
    expect(ev.passes.map((p) => p.target)).toEqual(['edge', null, 'edge']);
    expect(ev.completed.map((p) => p.pass)).toEqual([1, 3]);
    expect(ev.groups).toHaveLength(1);
    expect(ev.groups[0].requestConfigSha256).toBe(EDGE_RC);
    expect(ev.groups[0].letter).toBe('A');
  });

  it('the same content gives the same mean and spread as the laptop passes (only the label differs)', () => {
    const edge = evaluate(rows, [asEdge(1), asEdge(3)], [], 'edge');
    const lap = evaluate(rows, [laptop(1), laptop(3)]);
    expect(summarize(edge.groups[0].passes).spread).toEqual(summarize(lap.groups[0].passes).spread);
    expect(summarize(edge.groups[0].passes).perPass).toEqual(summarize(lap.groups[0].passes).perPass);
  });
});

describe('a report reads only the passes of its own target', () => {
  it('a laptop report refuses edge passes, and an edge report refuses laptop passes', () => {
    const asLaptop = evaluate(rows, [asEdge(1), asEdge(3)]);
    expect(asLaptop.completed).toHaveLength(0);
    expect(asLaptop.passes.map((p) => p.status)).toEqual(['invalid', 'no file', 'invalid']);
    expect(asLaptop.passes[0].reason).toBe('edge pass; this report reads laptop passes only');

    const asEdgeReport = evaluate(rows, [laptop(1), laptop(3)], [], 'edge');
    expect(asEdgeReport.completed).toHaveLength(0);
    expect(asEdgeReport.passes[0].status).toBe('invalid');
    expect(asEdgeReport.passes[0].target).toBe('laptop');
  });

  it('a pass whose lines mix laptop and edge is invalid, whatever the report reads', () => {
    const objs = lineObjects(laptopText(1));
    const mixed = objs.map((o, i) => (i === 0 ? { ...o, target: 'edge' } : o));
    const file = parsePassText(toText(mixed), 1, 'mixed-pass-1.jsonl');
    for (const expectTarget of ['laptop', 'edge'] as const) {
      const ev = evaluate(rows, [file], [], expectTarget);
      expect(ev.passes[0].target).toBe('mixed');
      expect(ev.passes[0].status).toBe('invalid');
      expect(ev.passes[0].reason).toBe('laptop and edge lines in one pass');
      expect(ev.completed).toHaveLength(0);
    }
  });

  it('one directory with a laptop pass 1 and an edge pass 2: each report keeps its own and lists the other as invalid', () => {
    const files = [laptop(1), asEdge(1, 2)];
    const lapEv = evaluate(rows, files);
    expect(lapEv.passes.map((p) => p.status)).toEqual(['completed', 'invalid']);
    expect(lapEv.groups.map((g) => g.passes.map((p) => p.pass))).toEqual([[1]]);
    const edgeEv = evaluate(rows, files, [], 'edge');
    expect(edgeEv.passes.map((p) => p.status)).toEqual(['invalid', 'completed']);
    expect(edgeEv.groups.map((g) => g.passes.map((p) => p.pass))).toEqual([[2]]);
    expect(edgeEv.groups[0].requestConfigSha256).toBe(EDGE_RC);
  });

  it('a target other than laptop or edge is refused by the loader', () => {
    const objs = lineObjects(laptopText(1));
    const bad = objs.map((o, i) => (i === 0 ? { ...o, target: 'cloud' } : o));
    expect(() => parsePassText(toText(bad), 1, 'bad-target.jsonl')).toThrow(/target must be laptop or edge/);
  });
});

describe('HTTP 401 (edge token refresh) is never a parse outcome', () => {
  it('a 401 before the answer changes no score and is counted under 401 and in the attempts', () => {
    const objs = lineObjects(laptopText(1));
    const m1 = objs.filter((o) => o.message_id === 'M0001');
    const template = m1[0];
    const renumbered = objs.map((o) => (o.message_id === 'M0001' ? { ...o, attempt: Number(o.attempt) + 1 } : o));
    const refresh = { ...template, attempt: 1, http_status: 401, retry_after_s: null, error: null, error_kind: null, body: { code: 401 }, usage: null };
    const withRefresh = parsePassText(toText([refresh, ...renumbered]), 1, 'refresh-pass-1.jsonl');
    const original = evaluate(rows, [laptop(1)]);
    const next = evaluate(rows, [withRefresh]);
    expect(next.passes[0].counts.http401).toBe(1);
    expect(next.passes[0].counts.attempts).toBe(original.passes[0].counts.attempts + 1);
    expect(next.passes[0].outcomes.get('M0001')?.scores).toEqual(original.passes[0].outcomes.get('M0001')?.scores);
    expect(next.passes[0].outcomes.get('M0001')?.status).toBe(original.passes[0].outcomes.get('M0001')?.status);
    expect(summarize(next.passes).spread).toEqual(summarize(original.passes).spread);
  });

  it('a message whose only attempts are 401 is unanswered, not scored wrong', () => {
    const objs = lineObjects(laptopText(1));
    const kept = objs.filter((o) => o.type !== 'attempt' || o.message_id !== 'M0001');
    const only401 = { ...objs.find((o) => o.message_id === 'M0001')!, attempt: 1, http_status: 401, error: null, error_kind: null, body: { code: 401 }, usage: null };
    const ev = evaluate(rows, [parsePassText(toText([only401, ...kept]), 1, 'only-401.jsonl')]);
    expect(ev.passes[0].unansweredIds).toContain('M0001');
    expect(ev.passes[0].outcomes.get('M0001')?.scored).toBe(false);
  });
});

describe('the edge report is labelled at the top, with the in-sample caveats', () => {
  it('starts with the edge label and keeps the boundary, in-sample and scope lines', () => {
    const ev = evaluate(rows, [asEdge(1), asEdge(3)], [], 'edge');
    const text = renderClaudeReport(ev, PRICING);
    expect(text.split('\n')[0]).toBe('# Parser tuning evaluation: Claude path, Edge Function (Supabase parse), tuning in-sample');
    expect(text).toContain('**Edge Function (Supabase parse), tuning in-sample.**');
    expect(text).toContain('Scores are computed on the raw ParseResponse (src/parse output), before any catalog mapping.');
    expect(text).toContain("In-sample score: the Edge Function's prompt");
    expect(text).toContain('must never be quoted as expected accuracy');
    expect(text).toContain('optimistic upper bound');
    expect(text).toContain('Scope: tuning messages only');
    expect(text).toContain('Identity: the Edge Function reports no git commit.');
    expect(text).not.toContain('# Parser tuning evaluation: Claude path (laptop proxy)');
  });

  it('the laptop report has no edge label', () => {
    const text = renderClaudeReport(evaluate(rows, [laptop(1), laptop(3)]), PRICING);
    expect(text.split('\n')[0]).toBe('# Parser tuning evaluation: Claude path (laptop proxy)');
    expect(text).not.toContain('Edge Function');
  });
});
