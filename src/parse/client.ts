/**
 * The donor's parse call: the laptop LLM proxy first, the rule-based fallback on any failure. Never throws.
 * The base URL is a parameter; the screen wiring decides it. Pure TypeScript apart from the injected fetch.
 */
import { parseRules } from './rules';
import { toDraft, validateResponse } from './validate';
import type { ParsedDraft } from './types';

export const MAX_TEXT_CHARS = 500;
export const DEFAULT_TIMEOUT_MS = 4000;

export interface ParseOptions {
  /** Proxy base URL, for example "http://192.168.1.20:8787". "/parse" is appended. */
  baseUrl: string;
  timeoutMs?: number;
  /** Injected for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Parses one message. Uses POST `${baseUrl}/parse` with `{ text }` and returns the validated LLM result (source "llm").
 * Falls back to the rules (source "fallback") on a non-200 status, a timeout, a network error, invalid JSON, a failed
 * validation, or text over 500 characters (no request is made for that).
 */
export async function parseMessage(text: string, opts: ParseOptions): Promise<ParsedDraft> {
  const fallback = (): ParsedDraft => {
    try {
      return toDraft(parseRules(text));
    } catch {
      return { items: [], pickupByMinute: null, source: 'fallback' };
    }
  };
  if (text.length > MAX_TEXT_CHARS) return fallback();

  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const base = opts.baseUrl.replace(/\/+$/, '');
    const res = await doFetch(`${base}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (res.status !== 200) return fallback();
    const resp = validateResponse(await res.json());
    if (resp === null) return fallback();
    return toDraft(resp);
  } catch {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}
