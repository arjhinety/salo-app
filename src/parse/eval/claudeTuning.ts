/**
 * Claude-path scorer. Pure TypeScript: reads pass files already on disk and computes scores, token totals and cost. No
 * network.
 *
 * Input: docs/reports/claude-tuning/pass-<n>.jsonl, written by server/eval/record-tuning.js. Each file has attempt lines
 * (type "attempt") and at most one final marker (type "pass_end", status "completed" or "stopped"). Every attempt line
 * and the marker carry the proxy identity read from /health: model, prompt_sha256, request_config_sha256, git_commit,
 * git_dirty. Every attempt line also carries usage (null when there was no model response).
 *
 * Scoring boundary: scores are computed on the raw ParseResponse (src/parse output) from each message's final usable
 * attempt, before any catalog mapping. Nothing here imports src/donor or src/data (checked by imports.test.ts).
 *
 * Outcomes per message and pass (universe: the 170 tuning messages, asserted by the tuning loader):
 *   - scored: the final attempt that is neither a 429 nor an outage (503 model_unavailable or a network error);
 *   - unanswered: attempts exist, but none of them is usable;
 *   - not sent: no attempt line at all.
 * Scores are k / answered per pass. Unanswered and not-sent messages are not in the denominator; they are listed.
 *
 * Which passes count: only passes whose marker says "completed" and whose lines agree on one prompt_sha256 and one
 * request_config_sha256. Such passes are grouped by request_config_sha256. Means and min-max spreads are computed only
 * within one group, never across groups. A pass whose lines disagree on either hash is invalid and listed separately.
 *
 * Cost: every attempt counts, retried and unscored ones included, because each may have been billed. Cost is computed
 * from the logged usage and the prices in server/eval/pricing.json (passed in by the caller).
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ParseResponse } from '../types';
import { validateResponse } from '../validate';
import { FIELDS, scoreResponse, type Field, type FieldScores, type ScoredRow } from './score';

export const PASS_NUMBERS: readonly number[] = [1, 2, 3];
export const MAX_ATTEMPTS = 5;
export const TUNING_MESSAGE_COUNT = 170;
/** Messages quoted in the proxy's prompt (their answers are in it). */
export const PROMPT_EXAMPLE_IDS: readonly string[] = ['M0001', 'M0008', 'M0025'];

export interface Usage {
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
}

/** Prices as stored in server/eval/pricing.json (the one place they are kept). */
export interface Pricing {
  model: string;
  source: string;
  date: string;
  prompts_up_to_tokens: number;
  input_per_mtok: number;
  output_per_mtok: number;
  cache_read_multiplier: number;
  cache_write_5m_multiplier: number;
}

export interface AttemptLine {
  type: 'attempt';
  message_id: string;
  evening_id: string;
  pass: number;
  attempt: number;
  http_status: number | null;
  retry_after_s: number | null;
  error: string | null;
  error_kind: string | null;
  error_detail: string | null;
  model: string;
  prompt_sha256: string;
  request_config_sha256: string;
  git_commit: string | null;
  git_dirty: boolean | null;
  sent_at: string;
  received_at: string;
  body: unknown;
  body_text_if_not_json: string | null;
  usage: Usage | null;
}

export interface PassEnd {
  type: 'pass_end';
  pass: number;
  status: 'completed' | 'stopped';
  reason: string | null;
  messages_sent: number;
  ended_at: string;
  model: string;
  prompt_sha256: string;
  request_config_sha256: string;
  git_commit: string | null;
  git_dirty: boolean | null;
}

export interface PassFile {
  pass: number;
  attempts: AttemptLine[];
  end: PassEnd | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStrOrNull = (v: unknown): boolean => v === null || typeof v === 'string';
const isIntOrNull = (v: unknown): boolean => v === null || (typeof v === 'number' && Number.isInteger(v));
const isHash = (v: unknown): boolean => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
const isCommitOrNull = (v: unknown): boolean => v === null || (typeof v === 'string' && /^[0-9a-f]{40}$/.test(v));
const isDirtyOrNull = (v: unknown): boolean => v === null || typeof v === 'boolean';
const isTokenOrNull = (v: unknown): boolean => v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0);

/** An outage attempt: a network error (status null) or a 503 model_unavailable. Mirrors server/eval/record-tuning.js. */
export function isOutage(status: number | null, error: string | null): boolean {
  return status === null || (status === 503 && error === 'model_unavailable');
}

function checkUsage(v: unknown, where: string): Usage | null {
  if (v === null) return null;
  if (!isObj(v)) throw new Error(`${where}: usage must be an object or null`);
  for (const k of ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']) {
    if (!isTokenOrNull(v[k])) throw new Error(`${where}: usage.${k} must be a token count or null`);
  }
  return v as unknown as Usage;
}

function checkAttempt(o: Record<string, unknown>, pass: number, where: string): AttemptLine {
  const fail = (what: string): never => {
    throw new Error(`${where}: ${what}`);
  };
  if (typeof o.message_id !== 'string') fail('message_id must be a string');
  if (typeof o.evening_id !== 'string') fail('evening_id must be a string');
  if (o.pass !== pass) fail(`pass ${String(o.pass)} in a pass ${pass} file`);
  if (!Number.isInteger(o.attempt) || (o.attempt as number) < 1 || (o.attempt as number) > MAX_ATTEMPTS) fail('attempt must be 1 to 5');
  if (!isIntOrNull(o.http_status)) fail('http_status must be an integer or null');
  if (!isIntOrNull(o.retry_after_s)) fail('retry_after_s must be an integer or null');
  if (!isStrOrNull(o.error)) fail('error must be a string or null');
  if (!isStrOrNull(o.error_kind)) fail('error_kind must be a string or null');
  if (!isStrOrNull(o.error_detail)) fail('error_detail must be a string or null');
  if (typeof o.model !== 'string') fail('model must be a string');
  if (!isHash(o.prompt_sha256)) fail('prompt_sha256 must be 64 hex characters');
  if (!isHash(o.request_config_sha256)) fail('request_config_sha256 must be 64 hex characters');
  if (!isCommitOrNull(o.git_commit)) fail('git_commit must be 40 hex characters or null');
  if (!isDirtyOrNull(o.git_dirty)) fail('git_dirty must be true, false or null');
  if (typeof o.sent_at !== 'string' || typeof o.received_at !== 'string') fail('sent_at and received_at must be strings');
  if (!isStrOrNull(o.body_text_if_not_json)) fail('body_text_if_not_json must be a string or null');
  return { ...o, usage: checkUsage(o.usage === undefined ? null : o.usage, where) } as unknown as AttemptLine;
}

function checkEnd(o: Record<string, unknown>, pass: number, where: string): PassEnd {
  const fail = (what: string): never => {
    throw new Error(`${where}: ${what}`);
  };
  if (o.pass !== pass) fail(`pass ${String(o.pass)} in a pass ${pass} file`);
  if (o.status !== 'completed' && o.status !== 'stopped') fail('status must be completed or stopped');
  if (!isStrOrNull(o.reason)) fail('reason must be a string or null');
  if (!Number.isInteger(o.messages_sent) || (o.messages_sent as number) < 0) fail('messages_sent must be a count');
  if (typeof o.ended_at !== 'string') fail('ended_at must be a string');
  if (typeof o.model !== 'string') fail('model must be a string');
  if (!isHash(o.prompt_sha256)) fail('prompt_sha256 must be 64 hex characters');
  if (!isHash(o.request_config_sha256)) fail('request_config_sha256 must be 64 hex characters');
  if (!isCommitOrNull(o.git_commit)) fail('git_commit must be 40 hex characters or null');
  if (!isDirtyOrNull(o.git_dirty)) fail('git_dirty must be true, false or null');
  return o as unknown as PassEnd;
}

/** Parses one pass file. The marker, when present, must be the last line. */
export function parsePassText(text: string, pass: number, source: string): PassFile {
  const attempts: AttemptLine[] = [];
  let end: PassEnd | null = null;
  const raw = text.split('\n');
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    if (line.trim() === '') continue;
    const where = `${source} line ${i + 1}`;
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      throw new Error(`${where}: not JSON`);
    }
    if (!isObj(obj)) throw new Error(`${where}: not an object`);
    if (end !== null) throw new Error(`${where}: a line after the pass_end marker`);
    if (obj.type === 'attempt') attempts.push(checkAttempt(obj, pass, where));
    else if (obj.type === 'pass_end') end = checkEnd(obj, pass, where);
    else throw new Error(`${where}: type must be "attempt" or "pass_end"`);
  }
  return { pass, attempts, end };
}

/** Reads every pass-<n>.jsonl in dir, and nothing else. A pass with no marker is returned with end null. */
export function readPassFiles(dir: string): PassFile[] {
  const names = readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort();
  if (names.length === 0) throw new Error(`no .jsonl files in ${dir}`);
  return names.map((name) => {
    const m = /^pass-([1-3])\.jsonl$/.exec(name);
    if (!m) throw new Error(`${name}: file names must be pass-1.jsonl, pass-2.jsonl or pass-3.jsonl`);
    return parsePassText(readFileSync(join(dir, name), 'utf8'), Number(m[1]), name);
  });
}

/** completed: marker says completed and the hashes agree. invalid: lines or marker disagree on a hash. */
export type PassStatus = 'completed' | 'stopped' | 'no marker' | 'no file' | 'invalid';

export interface Outcome {
  message_id: string;
  scored: boolean;
  /** Final usable status (200, 422, 503 model_output_rejected, ...); null when unanswered. */
  status: number | null;
  /** Non-200 label for the table, e.g. "200 invalid body", "422 not_food_message". */
  label: string | null;
  resp: ParseResponse | null;
  scores: FieldScores;
}

export interface PassCounts {
  attempts: number;
  http429: number;
  retries: number;
  /** 503 model_unavailable attempts by error_kind ("none" when absent). */
  outage503: Record<string, number>;
  networkErrors: number;
}

/** Token totals over every attempt of a pass, retried and unscored ones included. */
export interface TokenTotals {
  attempts: number;
  /** Attempts whose usage is an object (a model response existed). */
  withUsage: number;
  /** Attempts with usage null, by what they were: 429 (not billed), outage (may have been billed), other (no model call). */
  nullUsage: { total: number; http429: number; outage: number; other: number };
  /** Attempts with usage present but at least one field null (that field is counted as 0). */
  partialUsage: number;
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

export interface PassResult {
  pass: number;
  status: PassStatus;
  reason: string | null;
  endedAt: string | null;
  markerMessagesSent: number | null;
  /** The one prompt_sha256 of the pass, or null when its lines or marker disagree (status invalid). */
  promptSha256: string | null;
  /** The one request_config_sha256 of the pass, or null when they disagree (status invalid). */
  requestConfigSha256: string | null;
  /** Distinct request config hashes seen in the lines and the marker. */
  requestConfigHashesSeen: string[];
  gitCommits: string[];
  /** "clean", "dirty", "unknown" or "mixed" over the lines and the marker. */
  gitState: string;
  /** Message ids with at least one attempt line, in tuning-file order. */
  sentIds: string[];
  /** Message ids with no attempt line, in tuning-file order. */
  notSentIds: string[];
  outcomes: Map<string, Outcome>;
  unansweredIds: string[];
  counts: PassCounts;
  tokens: TokenTotals;
  models: string[];
}

/** Completed passes that share one request_config_sha256. Letters are assigned in order of the first pass. */
export interface Group {
  letter: string;
  requestConfigSha256: string;
  promptSha256: string;
  passes: PassResult[];
  gitCommits: string[];
}

export interface Evaluation {
  rows: ScoredRow[];
  /** Always three entries, for passes 1, 2 and 3. */
  passes: PassResult[];
  completed: PassResult[];
  excluded: PassResult[];
  groups: Group[];
  models: string[];
}

function outcomeFor(row: ScoredRow, attempts: AttemptLine[]): Outcome {
  const usable = attempts.filter((a) => a.http_status !== 429 && !isOutage(a.http_status, a.error));
  if (usable.length === 0) {
    return { message_id: row.message_id, scored: false, status: null, label: null, resp: null, scores: scoreResponse(row, null) };
  }
  const final = usable.reduce((best, a) => (a.attempt > best.attempt ? a : best));
  const status = final.http_status;
  const resp = status === 200 ? validateResponse(final.body) : null;
  let label: string | null = null;
  if (status === 200 && resp === null) label = '200 invalid body';
  else if (status !== 200) label = final.error ? `${status} ${final.error}` : String(status);
  return { message_id: row.message_id, scored: true, status, label, resp, scores: scoreResponse(row, resp) };
}

function gitStateOf(values: (boolean | null)[]): string {
  const set = new Set(values);
  if (set.size > 1) return 'mixed';
  if (set.has(true)) return 'dirty';
  if (set.has(false)) return 'clean';
  return 'unknown';
}

function tokenTotalsOf(attempts: AttemptLine[]): TokenTotals {
  const t: TokenTotals = {
    attempts: attempts.length, withUsage: 0, nullUsage: { total: 0, http429: 0, outage: 0, other: 0 }, partialUsage: 0,
    input: 0, output: 0, cacheWrite: 0, cacheRead: 0,
  };
  for (const a of attempts) {
    const u = a.usage;
    if (u === null) {
      t.nullUsage.total++;
      if (a.http_status === 429) t.nullUsage.http429++;
      else if (isOutage(a.http_status, a.error)) t.nullUsage.outage++;
      else t.nullUsage.other++;
      continue;
    }
    t.withUsage++;
    if (u.input_tokens === null || u.output_tokens === null || u.cache_creation_input_tokens === null || u.cache_read_input_tokens === null) {
      t.partialUsage++;
    }
    t.input += u.input_tokens ?? 0;
    t.output += u.output_tokens ?? 0;
    t.cacheWrite += u.cache_creation_input_tokens ?? 0;
    t.cacheRead += u.cache_read_input_tokens ?? 0;
  }
  return t;
}

/** Cost in USD from token totals: input and cache rates are multiples of the input price (see pricing.json). */
export function costUsd(t: { input: number; output: number; cacheWrite: number; cacheRead: number }, p: Pricing): number {
  const inRate = p.input_per_mtok;
  return (t.input * inRate + t.cacheWrite * inRate * p.cache_write_5m_multiplier + t.cacheRead * inRate * p.cache_read_multiplier
    + t.output * p.output_per_mtok) / 1e6;
}

/**
 * Evaluates the pass files against the tuning universe. Throws on any integrity problem: a message id or evening that is
 * not in the tuning set, a duplicate or non-contiguous attempt number, a marker whose messages_sent disagrees with the
 * file, or a "completed" pass that does not cover all 170 messages. A pass whose hashes disagree internally is not an
 * error: it gets status "invalid" and is excluded.
 */
export function evaluate(rows: ScoredRow[], files: PassFile[]): Evaluation {
  if (rows.length !== TUNING_MESSAGE_COUNT) throw new Error(`expected ${TUNING_MESSAGE_COUNT} tuning rows, got ${rows.length}`);
  const byId = new Map(rows.map((r) => [r.message_id, r]));
  const filesByPass = new Map<number, PassFile>();
  for (const f of files) {
    if (filesByPass.has(f.pass)) throw new Error(`pass ${f.pass} given twice`);
    filesByPass.set(f.pass, f);
  }
  const allModels = new Set<string>();

  const passes: PassResult[] = PASS_NUMBERS.map((pass) => {
    const file = filesByPass.get(pass);
    const attemptsAll = [...(file?.attempts ?? [])];
    const byMsg = new Map<string, AttemptLine[]>();
    const counts: PassCounts = { attempts: 0, http429: 0, retries: 0, outage503: {}, networkErrors: 0 };
    const models = new Set<string>();
    const promptHashes = new Set<string>();
    const rcHashes = new Set<string>();
    const commits = new Set<string>();
    const dirties: (boolean | null)[] = [];
    for (const a of attemptsAll) {
      const row = byId.get(a.message_id);
      if (!row) throw new Error(`pass ${pass}: message ${a.message_id} is not in the tuning set`);
      if (a.evening_id !== row.evening_id) throw new Error(`pass ${pass}: ${a.message_id} has evening ${a.evening_id}, expected ${row.evening_id}`);
      const list = byMsg.get(a.message_id) ?? [];
      if (list.some((x) => x.attempt === a.attempt)) throw new Error(`pass ${pass}: ${a.message_id} attempt ${a.attempt} twice`);
      list.push(a);
      byMsg.set(a.message_id, list);
      counts.attempts++;
      if (a.attempt > 1) counts.retries++;
      if (a.http_status === 429) counts.http429++;
      if (a.http_status === null) counts.networkErrors++;
      if (a.http_status === 503 && a.error === 'model_unavailable') {
        const kind = a.error_kind ?? 'none';
        counts.outage503[kind] = (counts.outage503[kind] ?? 0) + 1;
      }
      models.add(a.model);
      allModels.add(a.model);
      promptHashes.add(a.prompt_sha256);
      rcHashes.add(a.request_config_sha256);
      if (a.git_commit !== null) commits.add(a.git_commit);
      dirties.push(a.git_dirty);
    }
    for (const list of byMsg.values()) {
      list.sort((x, y) => x.attempt - y.attempt);
      list.forEach((a, i) => {
        if (a.attempt !== i + 1) throw new Error(`pass ${pass}: ${a.message_id} attempts are not 1..${list.length}`);
      });
    }

    const end = file?.end ?? null;
    if (end !== null) {
      promptHashes.add(end.prompt_sha256);
      rcHashes.add(end.request_config_sha256);
      if (end.git_commit !== null) commits.add(end.git_commit);
      dirties.push(end.git_dirty);
      models.add(end.model);
      allModels.add(end.model);
    }
    const sentIds = rows.map((r) => r.message_id).filter((id) => byMsg.has(id));
    const notSentIds = rows.map((r) => r.message_id).filter((id) => !byMsg.has(id));
    const outcomes = new Map<string, Outcome>();
    for (const id of sentIds) outcomes.set(id, outcomeFor(byId.get(id) as ScoredRow, byMsg.get(id) as AttemptLine[]));
    const unansweredIds = sentIds.filter((id) => !(outcomes.get(id) as Outcome).scored);

    if (end !== null) {
      if (end.messages_sent !== sentIds.length) {
        throw new Error(`pass ${pass}: marker says ${end.messages_sent} messages sent, the file has ${sentIds.length}`);
      }
      if (end.status === 'completed' && sentIds.length !== TUNING_MESSAGE_COUNT) {
        throw new Error(`pass ${pass}: marked completed but only ${sentIds.length} of ${TUNING_MESSAGE_COUNT} messages were sent`);
      }
    }

    const promptList = [...promptHashes].sort();
    const rcList = [...rcHashes].sort();
    let status: PassStatus;
    let reason: string | null = end?.reason ?? null;
    if (!file) status = 'no file';
    else if (promptList.length > 1 || rcList.length > 1) {
      status = 'invalid';
      const which = promptList.length > 1 ? `prompt_sha256 (${promptList.map((h) => h.slice(0, 12)).join(', ')})`
        : `request_config_sha256 (${rcList.map((h) => h.slice(0, 12)).join(', ')})`;
      reason = `${which} differs inside the pass`;
    } else if (end === null) status = 'no marker';
    else status = end.status;
    return {
      pass,
      status,
      reason,
      endedAt: end?.ended_at ?? null,
      markerMessagesSent: end?.messages_sent ?? null,
      promptSha256: promptList.length === 1 ? promptList[0] : null,
      requestConfigSha256: rcList.length === 1 ? rcList[0] : null,
      requestConfigHashesSeen: rcList,
      gitCommits: [...commits].sort(),
      gitState: gitStateOf(dirties),
      sentIds,
      notSentIds,
      outcomes,
      unansweredIds,
      counts,
      tokens: tokenTotalsOf(attemptsAll),
      models: [...models].sort(),
    };
  });

  const completed = passes.filter((p) => p.status === 'completed');
  const excluded = passes.filter((p) => p.status !== 'completed');
  const groups: Group[] = [];
  for (const p of completed) {
    const rc = p.requestConfigSha256 as string;
    let g = groups.find((x) => x.requestConfigSha256 === rc);
    if (!g) {
      g = { letter: String.fromCharCode(65 + groups.length), requestConfigSha256: rc, promptSha256: p.promptSha256 as string, passes: [], gitCommits: [] };
      groups.push(g);
    }
    g.passes.push(p);
    for (const c of p.gitCommits) if (!g.gitCommits.includes(c)) g.gitCommits.push(c);
  }
  return { rows, passes, completed, excluded, groups, models: [...allModels].sort() };
}

export interface FieldRate {
  n: number;
  k: number;
  rate: number | null;
}

export interface Spread {
  mean: number | null;
  min: number | null;
  max: number | null;
}

/** Per-pass rates k/n (n = answered messages in the group) and the mean and min-max spread over the passes given. */
export interface Summary {
  perPass: { pass: number; n: number; byField: Record<Field, FieldRate> }[];
  spread: Record<Field, Spread>;
}

export function summarize(passes: PassResult[], include: (id: string) => boolean = () => true): Summary {
  const perPass = passes.map((p) => {
    let n = 0;
    const k: Record<Field, number> = { food: 0, quantity: 0, unit: 0, pickup: 0, all: 0 };
    for (const [id, o] of p.outcomes) {
      if (!include(id) || !o.scored) continue;
      n++;
      for (const f of FIELDS) if (o.scores[f]) k[f]++;
    }
    const byField = {} as Record<Field, FieldRate>;
    for (const f of FIELDS) byField[f] = { n, k: k[f], rate: n > 0 ? k[f] / n : null };
    return { pass: p.pass, n, byField };
  });
  const spread = {} as Record<Field, Spread>;
  for (const f of FIELDS) {
    const rates = perPass.map((p) => p.byField[f].rate).filter((r): r is number => r !== null);
    spread[f] = rates.length === 0
      ? { mean: null, min: null, max: null }
      : { mean: rates.reduce((s, r) => s + r, 0) / rates.length, min: Math.min(...rates), max: Math.max(...rates) };
  }
  return { perPass, spread };
}

/** Summaries for each value of a row field (language or difficulty), over the given passes. */
export function summarizeByGroup(ev: Evaluation, key: 'language' | 'difficulty', passes: PassResult[]): Map<string, { size: number; summary: Summary }> {
  const values = [...new Set(ev.rows.map((r) => r[key]))].sort();
  const out = new Map<string, { size: number; summary: Summary }>();
  for (const v of values) {
    const ids = new Set(ev.rows.filter((r) => r[key] === v).map((r) => r.message_id));
    out.set(v, { size: ids.size, summary: summarize(passes, (id) => ids.has(id)) });
  }
  return out;
}

export function excludeIds(ids: readonly string[]): (id: string) => boolean {
  const set = new Set(ids);
  return (id) => !set.has(id);
}

const pct = (x: number): string => `${(100 * x).toFixed(1)}%`;
const usdFmt = (x: number): string => `$${x.toFixed(6)}`;
const cell = (f: FieldRate): string => (f.rate === null ? `- (n=0)` : `${f.k}/${f.n} (${pct(f.rate)})`);
const spreadCell = (s: Spread): string => (s.mean === null || s.min === null || s.max === null ? '-' : `${pct(s.mean)} (${pct(s.min)}–${pct(s.max)})`);
const FIELD_LABEL: Record<Field, string> = { food: 'food', quantity: 'quantity', unit: 'unit', pickup: 'pickup_by', all: 'all four' };
const list = (ids: string[]): string => (ids.length === 0 ? 'none' : ids.join(', '));
const short = (h: string | null): string => (h === null ? 'none' : `${h.slice(0, 12)}…`);
const shortCommit = (c: string | null): string => (c === null ? 'unknown' : c.slice(0, 10));

const VERBATIM_BOUNDARY = 'Scores are computed on the raw ParseResponse (src/parse output), before any catalog mapping.';
const VERBATIM_IN_SAMPLE = "In-sample score: the proxy's prompt quotes tuning messages M0001, M0008 and M0025 with their answers, and its food list comes from the gold labels of all 170 tuning messages. This score is in-sample and must never be quoted as expected accuracy.";

function scoreTable(group: Group, include: (id: string) => boolean, title: string): string[] {
  const s = summarize(group.passes, include);
  const head = `| field | ${group.passes.map((p) => `pass ${p.pass} (k/answered)`).join(' | ')} | mean (min–max) over ${group.passes.length} completed pass${group.passes.length === 1 ? '' : 'es'} |`;
  const sep = `|---|${group.passes.map(() => '---').join('|')}|---|`;
  const rows = FIELDS.map((f) => `| ${FIELD_LABEL[f]} | ${s.perPass.map((p) => cell(p.byField[f])).join(' | ')} | ${spreadCell(s.spread[f])} |`);
  return [`#### ${title}`, '', head, sep, ...rows, ''];
}

/** The report: verbatim scope lines, pass status, one section per request-config group, excluded passes, lists, counts and cost. */
export function renderClaudeReport(ev: Evaluation, pricing: Pricing): string {
  const L: string[] = [];
  L.push('# Parser tuning evaluation: Claude path (laptop proxy)', '');
  L.push('**Scope: tuning messages only.** 170 rows, evenings E01 to E10, from `data/parse-dev/donor_messages_tuning.csv`. ' +
    'The messages are template-generated, so every number here is an **optimistic upper bound**. ' +
    'No pilot or main message was sent or scored.', '');
  L.push(VERBATIM_BOUNDARY, '');
  L.push(VERBATIM_IN_SAMPLE, '');
  L.push(`Model id(s) seen: ${ev.models.length ? ev.models.join(', ') : 'none'}.`, '');

  const done = ev.completed.length;
  if (ev.groups.length > 1) {
    L.push(`**Warning: the completed passes used ${ev.groups.length} different request configurations** ` +
      `(request_config_sha256: ${ev.groups.map((g) => `group ${g.letter} ${short(g.requestConfigSha256)}`).join('; ')}). ` +
      'Means and spreads are never pooled across request configurations: each group is reported on its own in section 3. ' +
      'Read them as separate runs.', '');
  }
  if (done === 0) {
    L.push('**No completed pass.** No score is reported. Every pass is listed in section 1 with its status and reason.', '');
  } else if (done < PASS_NUMBERS.length) {
    L.push(`**Only ${done} of ${PASS_NUMBERS.length} passes are completed** (pass ${ev.completed.map((p) => p.pass).join(', pass ')}). ` +
      `The means and spreads below are over the completed passes of each group only (${ev.groups.map((g) => `group ${g.letter}: ${g.passes.length} pass${g.passes.length === 1 ? '' : 'es'}`).join('; ')}). ` +
      'Passes that are not completed are listed in section 4 and are not in any mean or spread.', '');
  } else {
    L.push(`All ${PASS_NUMBERS.length} passes are completed.`, '');
  }

  L.push('## 1. Pass status and counts', '');
  L.push('| pass | status | reason | request config sha256 | prompt sha256 | git commit | git state | sent | not sent | answered | unanswered | attempts | got 429 | retries | 503 model_unavailable | network errors |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const p of ev.passes) {
    const outage = Object.values(p.counts.outage503).reduce((s, n) => s + n, 0);
    const answered = p.sentIds.length - p.unansweredIds.length;
    L.push(`| ${p.pass} | ${p.status} | ${p.reason ?? '-'} | ${short(p.requestConfigSha256)} | ${short(p.promptSha256)} | ` +
      `${p.gitCommits.map(shortCommit).join(', ') || 'unknown'} | ${p.gitState} | ` +
      `${p.sentIds.length} | ${p.notSentIds.length} | ${answered} | ${p.unansweredIds.length} | ${p.counts.attempts} | ${p.counts.http429} | ` +
      `${p.counts.retries} | ${outage} | ${p.counts.networkErrors} |`);
  }
  L.push('');
  L.push('Not sent: no attempt line at all. Unanswered: attempts exist, but none is usable (only 429, 503 model_unavailable or network errors). ' +
    'Both are outside the denominator of the scores, so they are not scored wrong.', '');

  L.push('## 2. Request-config groups (completed passes)', '');
  if (ev.groups.length === 0) L.push('None.', '');
  else {
    L.push('| group | request config sha256 | prompt sha256 | git commit(s) | completed passes | pass numbers |');
    L.push('|---|---|---|---|---|---|');
    for (const g of ev.groups) {
      L.push(`| ${g.letter} | ${g.requestConfigSha256} | ${g.promptSha256} | ${g.gitCommits.map(shortCommit).join(', ') || 'unknown'} | ${g.passes.length} | ${g.passes.map((p) => p.pass).join(', ')} |`);
    }
    L.push('');
  }

  L.push('## 3. Scores by request-config group', '');
  if (ev.groups.length === 0) L.push('No completed pass, so no score.', '');
  for (const g of ev.groups) {
    const nm = `${g.passes.length} completed pass${g.passes.length === 1 ? '' : 'es'}: ${g.passes.map((p) => p.pass).join(', ')}`;
    L.push(`### Group ${g.letter}: request config ${short(g.requestConfigSha256)}, prompt ${short(g.promptSha256)}, git ${g.gitCommits.map(shortCommit).join(', ') || 'unknown'}, ${nm}`, '');
    if (g.passes.length === 1) L.push('One completed pass in this group: the spread is that single value, not a range over passes.', '');
    L.push(...scoreTable(g, () => true, `3${g.letter}.1 All 170 tuning messages (k/answered)`));
    L.push(...scoreTable(g, excludeIds(PROMPT_EXAMPLE_IDS),
      `3${g.letter}.2 The 167 messages without M0001, M0008 and M0025 (still in-sample: food list overlap; k/answered)`));
    for (const key of ['language', 'difficulty'] as const) {
      const groups = summarizeByGroup(ev, key, g.passes);
      L.push(`#### 3${g.letter}.3 By ${key} (mean and min-max spread of k/answered over the group's passes)`, '');
      L.push(`| ${key} | messages | ${FIELDS.map((f) => FIELD_LABEL[f]).join(' | ')} |`);
      L.push(`|---|---|${FIELDS.map(() => '---').join('|')}|`);
      for (const [v, { size, summary }] of groups) {
        L.push(`| ${v} | ${size} | ${FIELDS.map((f) => spreadCell(summary.spread[f])).join(' | ')} |`);
      }
      L.push('');
    }
    L.push('A group pass with no answered message in a row has no rate and is left out of that row\'s spread.', '');
  }

  L.push('## 4. Passes not in any group (invalid, stopped, no marker, no file)', '');
  if (ev.excluded.length === 0) L.push('None.', '');
  for (const p of ev.excluded) {
    const answered = p.sentIds.length - p.unansweredIds.length;
    const outage = Object.entries(p.counts.outage503).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
    L.push(`### Pass ${p.pass}: ${p.status}`, '');
    L.push(`- Reason: ${p.reason ?? '-'}. Marker messages_sent: ${p.markerMessagesSent ?? 'no marker'}. Ended: ${p.endedAt ?? 'no marker'}.`);
    L.push(`- Request config hashes seen: ${p.requestConfigHashesSeen.map((h) => h.slice(0, 12)).join(', ') || 'none'}. Git commit(s): ${p.gitCommits.map(shortCommit).join(', ') || 'unknown'}.`);
    L.push(`- Sent: ${p.sentIds.length}. Not sent: ${p.notSentIds.length}. Answered: ${answered}. Unanswered: ${p.unansweredIds.length} (${list(p.unansweredIds)}).`);
    L.push(`- Attempts ${p.counts.attempts}; got 429 ${p.counts.http429}; retries ${p.counts.retries}; 503 model_unavailable by error_kind: ${outage}; network errors ${p.counts.networkErrors}.`);
    L.push(`- Not-sent ids (${p.notSentIds.length}): ${list(p.notSentIds)}`, '');
  }

  L.push('## 5. Not sent and unanswered messages, by pass', '');
  for (const p of ev.passes) {
    L.push(`- Pass ${p.pass} (${p.status}): not sent ${p.notSentIds.length}; unanswered ${p.unansweredIds.length} (${list(p.unansweredIds)}).`);
  }
  L.push('');

  L.push('## 6. Answered responses that are not 200 (final attempt), by status', '');
  const labels = new Set<string>();
  for (const p of ev.passes) for (const o of p.outcomes.values()) if (o.scored && o.label !== null) labels.add(o.label);
  L.push('| status | ' + ev.passes.map((p) => `pass ${p.pass} (${p.status})`).join(' | ') + ' |');
  L.push('|---|' + ev.passes.map(() => '---').join('|') + '|');
  for (const label of [...labels].sort()) {
    const counts = ev.passes.map((p) => [...p.outcomes.values()].filter((o) => o.scored && o.label === label).length);
    L.push(`| ${label} | ${counts.join(' | ')} |`);
  }
  if (labels.size === 0) L.push('| none | - | - | - |');
  L.push('');

  L.push('## 7. Attempts that got 429, retries, outage attempts', '');
  const kinds = new Set<string>();
  for (const p of ev.passes) for (const k of Object.keys(p.counts.outage503)) kinds.add(k);
  const kindList = [...kinds].sort();
  const cols = ['pass', 'status', 'attempts', 'got 429', 'retries', ...kindList.map((k) => `503 model_unavailable (${k})`), 'network errors'];
  L.push(`| ${cols.join(' | ')} |`);
  L.push(`|${cols.map(() => '---').join('|')}|`);
  const tot = { attempts: 0, http429: 0, retries: 0, network: 0, kinds: {} as Record<string, number> };
  for (const p of ev.passes) {
    tot.attempts += p.counts.attempts;
    tot.http429 += p.counts.http429;
    tot.retries += p.counts.retries;
    tot.network += p.counts.networkErrors;
    for (const k of kindList) tot.kinds[k] = (tot.kinds[k] ?? 0) + (p.counts.outage503[k] ?? 0);
    L.push(`| ${p.pass} | ${p.status} | ${p.counts.attempts} | ${p.counts.http429} | ${p.counts.retries} | ` +
      `${kindList.map((k) => p.counts.outage503[k] ?? 0).join(' | ')} | ${p.counts.networkErrors} |`);
  }
  L.push(`| total | | ${tot.attempts} | ${tot.http429} | ${tot.retries} | ${kindList.map((k) => tot.kinds[k] ?? 0).join(' | ')} | ${tot.network} |`, '');

  L.push('## 8. Tokens and cost (every attempt, retried and unscored ones included)', '');
  L.push(`Prices: ${pricing.model}, $${pricing.input_per_mtok} per million input tokens, $${pricing.output_per_mtok} per million output tokens ` +
    `(prompts up to ${pricing.prompts_up_to_tokens} tokens), cache read ${pricing.cache_read_multiplier}x input, ` +
    `cache write (5-minute) ${pricing.cache_write_5m_multiplier}x input. Source: ${pricing.source}, ${pricing.date}. ` +
    'Thinking tokens are billed as output and are inside output_tokens.', '');
  L.push('| pass | status | attempts | with usage | usage null: 429 (not billed) | usage null: outage (may be billed) | usage null: other | ' +
    'input tokens | output tokens | cache write tokens | cache read tokens | cost (USD) | mean cost per attempt with usage (USD) |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const total = { attempts: 0, withUsage: 0, n429: 0, nOutage: 0, nOther: 0, input: 0, output: 0, cw: 0, cr: 0, cost: 0 };
  for (const p of ev.passes) {
    const t = p.tokens;
    const cost = costUsd({ input: t.input, output: t.output, cacheWrite: t.cacheWrite, cacheRead: t.cacheRead }, pricing);
    const mean = t.withUsage > 0 ? usdFmt(cost / t.withUsage) : '-';
    total.attempts += t.attempts; total.withUsage += t.withUsage; total.n429 += t.nullUsage.http429;
    total.nOutage += t.nullUsage.outage; total.nOther += t.nullUsage.other;
    total.input += t.input; total.output += t.output; total.cw += t.cacheWrite; total.cr += t.cacheRead; total.cost += cost;
    L.push(`| ${p.pass} | ${p.status} | ${t.attempts} | ${t.withUsage} | ${t.nullUsage.http429} | ${t.nullUsage.outage} | ${t.nullUsage.other} | ` +
      `${t.input} | ${t.output} | ${t.cacheWrite} | ${t.cacheRead} | ${usdFmt(cost)} | ${mean} |`);
  }
  const totalMean = total.withUsage > 0 ? usdFmt(total.cost / total.withUsage) : '-';
  L.push(`| total | | ${total.attempts} | ${total.withUsage} | ${total.n429} | ${total.nOutage} | ${total.nOther} | ` +
    `${total.input} | ${total.output} | ${total.cw} | ${total.cr} | ${usdFmt(total.cost)} | ${totalMean} |`, '');
  L.push(`Cost is unknown for the ${total.nOutage} outage attempts with usage null: a timed-out or dropped request may still have been billed, ` +
    `so the cost above is a floor. The ${total.n429} 429 attempts are not billed (no model call). ` +
    `Partial usage (a field the API omitted) counts as 0 in the sums.`, '');
  return L.join('\n');
}
