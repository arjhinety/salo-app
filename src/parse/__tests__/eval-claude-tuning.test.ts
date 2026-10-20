/**
 * Scores the Claude path on the 170 tuning messages from the saved pass files only. Runs only with EVAL_CLAUDE=1, like
 * EVAL=1 for the fallback. Reads only *.jsonl in docs/reports/claude-tuning/ (EVAL_CLAUDE_DIR overrides it for tests) and
 * the prices in server/eval/pricing.json. Writes docs/reports/parser-claude-tuning.md. Never calls the proxy or the model.
 *
 * Scoring boundary: scores are computed on the raw ParseResponse (src/parse output), before any catalog mapping.
 * This file imports nothing from src/donor or src/data (checked by imports.test.ts). Tuning messages only.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { evaluate, readPassFiles, renderClaudeReport, type Pricing } from '../eval/claudeTuning';
import { loadTuningRows } from './tuningCorpus';

const run = process.env.EVAL_CLAUDE === '1' ? describe : describe.skip;
const REPO = join(__dirname, '..', '..', '..');
const REPORTS = join(REPO, 'docs', 'reports');
const PASS_DIR = process.env.EVAL_CLAUDE_DIR ?? join(REPORTS, 'claude-tuning');
const REPORT_PATH = join(REPORTS, 'parser-claude-tuning.md');
const PRICING_PATH = join(REPO, 'server', 'eval', 'pricing.json');

run('parser tuning evaluation, Claude path (EVAL_CLAUDE=1)', () => {
  it('scores the saved pass files and writes the report', () => {
    const pricing = JSON.parse(readFileSync(PRICING_PATH, 'utf8')) as Pricing;
    const ev = evaluate(loadTuningRows(), readPassFiles(PASS_DIR));
    mkdirSync(REPORTS, { recursive: true });
    writeFileSync(REPORT_PATH, renderClaudeReport(ev, pricing));
    expect(ev.passes).toHaveLength(3);
  });
});
