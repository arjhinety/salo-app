/**
 * Scores the held-out Edge Function passes (pilot, main) from the saved pass files only. Runs only with EVAL_HELDOUT=1.
 * Reads docs/reports/claude-<split>-edge/ (pass-<n>.jsonl) and the held-out messages from the evening dataset (gold labels),
 * and writes docs/reports/parser-claude-<split>-edge.md. Never calls the function or the model. A split whose folder has
 * no pass file is skipped, and the skip is logged. Edge passes only: a laptop pass in these folders is listed as invalid.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { evaluate, readPassDir, renderClaudeReport, type Pricing } from '../eval/claudeTuning';
import { HELDOUT_SPLITS } from '../eval/heldout';
import { loadHeldoutRows } from './heldoutCorpus';

const run = process.env.EVAL_HELDOUT === '1' ? describe : describe.skip;
const REPO = join(__dirname, '..', '..', '..');
const REPORTS = join(REPO, 'docs', 'reports');
const PRICING_PATH = join(REPO, 'server', 'eval', 'pricing.json');
const PASS_FILE = /^pass-[1-9]\d*\.jsonl$/;

run('held-out parser evaluation, Edge Function (EVAL_HELDOUT=1)', () => {
  for (const split of ['pilot', 'main'] as const) {
    const spec = HELDOUT_SPLITS[split];
    it(`scores the saved edge pass files for held-out ${split}`, () => {
      const dir = join(REPORTS, `claude-${split}-edge`);
      const hasPasses = existsSync(dir) && readdirSync(dir).some((f) => PASS_FILE.test(f));
      if (!hasPasses) {
        console.log(`held-out ${split}: no pass-<n>.jsonl in ${dir}; nothing scored, no report written`);
        return;
      }
      const pricing = JSON.parse(readFileSync(PRICING_PATH, 'utf8')) as Pricing;
      const passDir = readPassDir(dir);
      const ev = evaluate(loadHeldoutRows(split), passDir.files, passDir.ignored, 'edge', spec);
      mkdirSync(REPORTS, { recursive: true });
      writeFileSync(join(REPORTS, `parser-claude-${split}-edge.md`), renderClaudeReport(ev, pricing));
      // One entry per pass number from 1 to the highest pass file present.
      expect(ev.passes.map((p) => p.pass)).toEqual(Array.from({ length: ev.passes.length }, (_, i) => i + 1));
      expect(ev.rows.length).toBe(spec.count);
    });
  }
});
