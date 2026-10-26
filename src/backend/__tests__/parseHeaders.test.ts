import { parseMessage } from '../../parse/client';
import { parseRules } from '../../parse/rules';
import { toDraft } from '../../parse/validate';
import type { Fake } from './fakeSupabase';

jest.mock('@supabase/supabase-js', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { makeFakeSupabase } = require('./fakeSupabase') as typeof import('./fakeSupabase');
  const fake = makeFakeSupabase();
  return {
    createClient: () => fake.client,
    isAuthRetryableFetchError: (error: unknown) => fake.isRetryable(error),
    __fake: fake,
  };
});

jest.mock('expo-sqlite/kv-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { makeKvStore } = require('./fakeSupabase') as typeof import('./fakeSupabase');
  return { __esModule: true, default: makeKvStore() };
});

jest.mock('../../config/server', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  PARSE_BASE_URL: 'https://test.supabase.co/functions/v1',
  PARSE_TIMEOUT_MS: 8000,
}));

const BASE = 'https://test.supabase.co/functions/v1';
const TEXT = 'may 3 trays adobo pa at 20 pandesal, kunin before 8';
const fallbackDraft = () => toDraft(parseRules(TEXT));

const okBody = {
  items: [
    { food_item: 'adobo', quantity: 3, unit: 'tray' },
    { food_item: 'pandesal', quantity: 20, unit: 'piece' },
  ],
  pickup_by: '20:00',
  missing: [],
  source: 'llm',
  model: 'claude-haiku-5-5',
};

const response = (status: number, body: unknown): Response => ({ status, json: async () => body }) as unknown as Response;

function load() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fake = (require('@supabase/supabase-js') as unknown as { __fake: Fake }).__fake;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const supabase = require('../supabase') as typeof import('../supabase');
  return { fake, supabase };
}

describe('parse headers', () => {
  it('signed in: the apikey and the user access token; signed out: only the apikey', async () => {
    const { fake, supabase } = load();
    expect(await supabase.parseAuthHeaders()).toEqual({ apikey: 'sb_publishable_test' });

    await fake.client.auth.signInAnonymously();
    expect(await supabase.parseAuthHeaders()).toEqual({ apikey: 'sb_publishable_test', Authorization: 'Bearer token-1' });
  });

  it('parseMessage sends those headers to /parse', async () => {
    const headers = { apikey: 'sb_publishable_test', Authorization: 'Bearer token-1' };
    const fetchImpl = jest.fn(async () => response(200, okBody));
    const draft = await parseMessage(TEXT, { baseUrl: BASE, headers, fetchImpl: fetchImpl as unknown as typeof fetch });

    expect(draft.source).toBe('llm');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/parse`);
    expect(init.headers).toEqual({ apikey: 'sb_publishable_test', Authorization: 'Bearer token-1', 'Content-Type': 'application/json' });
  });

  it.each([
    [403, 'device not registered'],
    [503, 'no_client (no key) or the model is unavailable'],
    [401, 'no valid user token'],
    [429, 'rate limited'],
  ])('HTTP %i (%s) falls back to the rules', async (status) => {
    const fetchImpl = jest.fn(async () => response(status, { error: 'x' }));
    const draft = await parseMessage(TEXT, { baseUrl: BASE, headers: { apikey: 'k' }, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(draft.source).toBe('fallback');
    expect(draft).toEqual(fallbackDraft());
  });
});
