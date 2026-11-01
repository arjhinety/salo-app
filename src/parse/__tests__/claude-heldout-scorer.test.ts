/**
 * Held-out Claude-path scorer, on fake pass files and fake responses only (always runs; no dataset, no network).
 * Covers: the universe count (170 pilot, 748 main, asserted by evaluate), a completed marker that must cover the whole
 * split, the wrong-target refusal, a 3-pass mean and min-max example with literal numbers, and the held-out report text.
 */
import { evaluate, parsePassText, renderClaudeReport, summarize, type PassFile, type Pricing } from '../eval/claudeTuning';
import { HELDOUT_SPLITS } from '../eval/heldout';
import type { ScoredRow } from '../eval/score';

const PROMPT = 'a'.repeat(64);
const RC = 'b'.repeat(64);
const PRICING: Pricing = {
  model: 'claude-haiku-5-5', source: 'fake', date: '2026-01-01', prompts_up_to_tokens: 100000,
  input_per_mtok: 0.1, output_per_mtok: 0.5, cache_read_multiplier: 0.1, cache_write_5m_multiplier: 1.25,
};

type Split = 'pilot' | 'main';

/** Fake rows for a split: 17 messages per evening, gold = 2 kg bananas, pickup 16:00. */
function makeRows(split: Split): ScoredRow[] {
  const spec = HELDOUT_SPLITS[split];
  const rows: ScoredRow[] = [];
  for (let e = spec.firstEvening; e <= spec.lastEvening; e++) {
    const evening = `E${String(e).padStart(2, '0')}`;
    for (let i = 1; i <= 17; i++) {
      rows.push({
        message_id: `${split[0].toUpperCase()}${evening}-${String(i).padStart(2, '0')}`, evening_id: evening,
        language: 'en', difficulty: 'easy', gold_food_item: 'bananas', gold_quantity: 2, gold_unit: 'kg', gold_pickup_by: '16:00',
      });
    }
  }
  return rows;
}

const BODY_OK = { items: [{ food_item: 'bananas', quantity: 2, unit: 'kg' }], pickup_by: '16:00', missing: [], source: 'llm' };
const BODY_WRONG_FOOD = { items: [{ food_item: 'eggplant', quantity: 2, unit: 'kg' }], pickup_by: '16:00', missing: [], source: 'llm' };
type Fake = { status: number; body: unknown; error: string | null };
const OK: Fake = { status: 200, body: BODY_OK, error: null };

interface PassOpts {
  pass: number;
  rows: ScoredRow[];
  answer: (index: number) => Fake;
  target?: 'edge' | 'laptop';
  end?: 'completed' | 'stopped' | null;
  messagesSent?: number;
}

/** One pass file as text, in the recorder's format (attempt lines, then the pass_end marker). */
function passText(o: PassOpts): string {
  const target = o.target ?? 'edge';
  const tag = target === 'edge' ? { target: 'edge' } : {};
  const lines: unknown[] = o.rows.map((row, i) => {
    const f = o.answer(i);
    return {
      type: 'attempt', message_id: row.message_id, evening_id: row.evening_id, pass: o.pass, attempt: 1,
      http_status: f.status, retry_after_s: null, error: f.error, error_kind: null, error_detail: null,
      model: 'claude-haiku-5-5', prompt_sha256: PROMPT, request_config_sha256: RC, git_commit: null, git_dirty: null,
      sent_at: '2026-11-01T10:00:00.000Z', received_at: '2026-11-01T10:00:01.000Z', body: f.body, body_text_if_not_json: null,
      usage: { input_tokens: 1000, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }, ...tag,
    };
  });
  if (o.end !== null) {
    lines.push({
      type: 'pass_end', pass: o.pass, status: o.end ?? 'completed', reason: null, messages_sent: o.messagesSent ?? o.rows.length,
      ended_at: '2026-11-01T11:00:00.000Z', model: 'claude-haiku-5-5', prompt_sha256: PROMPT, request_config_sha256: RC,
      git_commit: null, git_dirty: null, ...tag,
    });
  }
  return lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
}

const pass = (o: PassOpts): PassFile => parsePassText(passText(o), o.pass, `fake-pass-${o.pass}.jsonl`);

describe('held-out universe count', () => {
  it('refuses a row set that is not the split count (pilot 170, main 748)', () => {
    const rows = makeRows('pilot');
    expect(rows.length).toBe(170);
    expect(() => evaluate(rows.slice(0, 169), [pass({ pass: 1, rows: rows.slice(0, 169), answer: () => OK })], [], 'edge', HELDOUT_SPLITS.pilot))
      .toThrow('expected 170 held-out pilot rows, got 169');
    expect(() => evaluate(rows, [pass({ pass: 1, rows, answer: () => OK })], [], 'edge', HELDOUT_SPLITS.main))
      .toThrow('expected 748 held-out main rows, got 170');
  });

  it('keeps the tuning default: 170 rows, and any other count throws', () => {
    const rows = makeRows('pilot');
    expect(() => evaluate(rows.slice(0, 169), [pass({ pass: 1, rows: rows.slice(0, 169), answer: () => OK })], [], 'edge'))
      .toThrow('expected 170 tuning rows, got 169');
  });

  it('accepts a completed main pass that sends all 748 messages', () => {
    const rows = makeRows('main');
    expect(rows.length).toBe(748);
    const ev = evaluate(rows, [pass({ pass: 1, rows, answer: () => OK })], [], 'edge', HELDOUT_SPLITS.main);
    expect(ev.passes[0].status).toBe('completed');
    expect(ev.passes[0].sentIds.length).toBe(748);
  });

  it('a completed marker that covers fewer messages than the split throws', () => {
    const rows = makeRows('pilot');
    const short = rows.slice(0, 169);
    const f = pass({ pass: 1, rows: short, answer: () => OK, messagesSent: 169 });
    expect(() => evaluate(rows, [f], [], 'edge', HELDOUT_SPLITS.pilot)).toThrow('marked completed but only 169 of 170 messages were sent');
  });

  it('a stopped pass is listed, not completed, and not an error', () => {
    const rows = makeRows('pilot');
    const f = pass({ pass: 1, rows: rows.slice(0, 40), answer: () => OK, end: 'stopped', messagesSent: 40 });
    const ev = evaluate(rows, [f], [], 'edge', HELDOUT_SPLITS.pilot);
    expect(ev.passes[0].status).toBe('stopped');
    expect(ev.completed.length).toBe(0);
  });
});

describe('held-out wrong-target refusal', () => {
  it('a laptop pass in an edge held-out folder is invalid and is in no group', () => {
    const rows = makeRows('pilot');
    const edge = pass({ pass: 1, rows, answer: () => OK });
    const laptop = pass({ pass: 2, rows, answer: () => OK, target: 'laptop' });
    const ev = evaluate(rows, [edge, laptop], [], 'edge', HELDOUT_SPLITS.pilot);
    expect(ev.passes[0].status).toBe('completed');
    expect(ev.passes[1].status).toBe('invalid');
    expect(ev.passes[1].reason).toBe('laptop pass; this report reads edge passes only');
    expect(ev.completed.map((p) => p.pass)).toEqual([1]);
    expect(ev.groups.flatMap((g) => g.passes.map((p) => p.pass))).toEqual([1]);
  });
});

describe('held-out 3-pass mean and min-max (literal numbers)', () => {
  // Pilot, 170 messages. Pass 1: every food right (170/170). Pass 2: 85 food wrong, the rest right (85/170 food).
  // Pass 3: 17 answered 422 (not usable, scored wrong), the rest right (153/170). Quantity, unit and pickup are right
  // whenever the response exists, so they are 170, 170, 153 out of 170.
  const rows = makeRows('pilot');
  const files = [
    pass({ pass: 1, rows, answer: () => OK }),
    pass({ pass: 2, rows, answer: (i) => (i < 85 ? OK : { status: 200, body: BODY_WRONG_FOOD, error: null }) }),
    pass({ pass: 3, rows, answer: (i) => (i < 153 ? OK : { status: 422, body: { error: 'not_food_message' }, error: 'not_food_message' }) }),
  ];
  const ev = evaluate(rows, files, [], 'edge', HELDOUT_SPLITS.pilot);

  it('has one group of three completed passes', () => {
    expect(ev.groups.length).toBe(1);
    expect(ev.groups[0].passes.map((p) => p.pass)).toEqual([1, 2, 3]);
  });

  it('gives k/n per pass for food', () => {
    const s = summarize(ev.groups[0].passes);
    expect(s.perPass.map((p) => [p.byField.food.k, p.byField.food.n])).toEqual([[170, 170], [85, 170], [153, 170]]);
  });

  it('food: mean 0.8 (80.0%), min 0.5, max 1.0', () => {
    const f = summarize(ev.groups[0].passes).spread.food;
    expect(f.mean).toBeCloseTo(0.8, 12);
    expect(f.min).toBeCloseTo(0.5, 12);
    expect(f.max).toBe(1);
  });

  it('quantity: mean 0.966666... (96.7%), min 0.9, max 1.0', () => {
    const q = summarize(ev.groups[0].passes).spread.quantity;
    expect(q.mean).toBeCloseTo(0.9666666666666667, 12);
    expect(q.min).toBeCloseTo(0.9, 12);
    expect(q.max).toBe(1);
  });

  it('all four: mean 0.8 (80.0%), min 0.5, max 1.0', () => {
    const a = summarize(ev.groups[0].passes).spread.all;
    expect(a.mean).toBeCloseTo(0.8, 12);
    expect(a.min).toBeCloseTo(0.5, 12);
    expect(a.max).toBe(1);
  });
});

describe('held-out report text', () => {
  const rows = makeRows('pilot');
  const files = [pass({ pass: 1, rows, answer: () => OK })];
  const ev = evaluate(rows, files, [], 'edge', HELDOUT_SPLITS.pilot);
  const text = renderClaudeReport(ev, PRICING);

  it('carries the held-out label, the split scope and the boundary', () => {
    expect(text).toContain('# Parser held-out evaluation: Claude path, Edge Function, held-out pilot messages (template-generated: optimistic upper bound)');
    expect(text).toContain('**Scope: held-out pilot messages only.** 170 rows, evenings E11 to E20');
    expect(text).toContain('Scores are computed on the raw ParseResponse (src/parse output), before any catalog mapping.');
  });

  it('has no tuning in-sample text and no 167-message table', () => {
    expect(text).not.toContain('In-sample score');
    expect(text).not.toContain('data/parse-dev');
    expect(text).not.toContain('3A.2');
    expect(text).toContain('3A.1 All 170 held-out pilot messages (k/answered)');
  });

  it('states the spend on the split', () => {
    expect(text).toContain('Spend on this split, from logged usage');
  });
});
