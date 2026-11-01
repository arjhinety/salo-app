/**
 * Scores the Edge Function passes from the saved pass files only. Runs only with EVAL_CLAUDE_EDGE=1, like EVAL_CLAUDE=1 for
 * the laptop. Reads only *.jsonl in docs/reports/claude-tuning-edge/ (EVAL_CLAUDE_EDGE_DIR overrides it for tests) and the
 * prices in server/eval/pricing.json. Writes docs/reports/parser-claude-tuning-edge.md. Never calls the function or the model.
 * Edge passes only: a laptop pass in this folder is listed as invalid. Tuning messages only.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { evaluate, readPassDir, renderClaudeReport, type Pricing } from '../eval/claudeTuning';
import { loadTuningRows } from './tuningCorpus';

const run = process.env.EVAL_CLAUDE_EDGE === '1' ? describe : describe.skip;
const REPO = join(__dirname, '..', '..', '..');
const REPORTS = join(REPO, 'docs', 'reports');
const PASS_DIR = process.env.EVAL_CLAUDE_EDGE_DIR ?? join(REPORTS, 'claude-tuning-edge');
const REPORT_PATH = join(REPORTS, 'parser-claude-tuning-edge.md');
const PRICING_PATH = join(REPO, 'server', 'eval', 'pricing.json');

run('parser tuning evaluation, Edge Function (EVAL_CLAUDE_EDGE=1)', () => {
  it('scores the saved edge pass files and writes the edge report', () => {
    const pricing = JSON.parse(readFileSync(PRICING_PATH, 'utf8')) as Pricing;
    const dir = readPassDir(PASS_DIR);
    const ev = evaluate(loadTuningRows(), dir.files, dir.ignored, 'edge');
    mkdirSync(REPORTS, { recursive: true });
    writeFileSync(REPORT_PATH, renderClaudeReport(ev, pricing));
    // One entry per pass number from 1 to the highest pass file present.
    expect(ev.passes.map((p) => p.pass)).toEqual(Array.from({ length: ev.passes.length }, (_, i) => i + 1));
    expect(ev.passes.length).toBe(Math.max(...dir.files.map((f) => f.pass)));
  });
});
