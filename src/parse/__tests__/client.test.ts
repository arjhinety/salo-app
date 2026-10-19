import { parseMessage } from '../client';
import { parseRules } from '../rules';
import { toDraft } from '../validate';

const BASE = 'http://192.168.1.20:8787';
const TEXT = 'may 3 trays adobo pa at 20 pandesal, kunin before 8';

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

/** A minimal stand-in for the fetch Response: only status and json() are read. */
const response = (status: number, body: unknown): Response =>
  ({ status, json: async () => body }) as unknown as Response;

const fallbackDraft = () => toDraft(parseRules(TEXT));

describe('parseMessage', () => {
  it('a valid 200 body gives the LLM result (source llm) and posts to /parse with { text }', async () => {
    const fetchImpl = jest.fn(async () => response(200, okBody));
    const draft = await parseMessage(TEXT, { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(draft.source).toBe('llm');
    expect(draft.pickupByMinute).toBe(1200);
    expect(draft.items.map((i) => [i.rawText, i.quantity, i.unit])).toEqual([
      ['adobo', 3, 'tray'],
      ['pandesal', 20, 'piece'],
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BASE}/parse`);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ text: TEXT });
  });

  it('a trailing slash on the base URL is not doubled', async () => {
    const fetchImpl = jest.fn(async () => response(200, okBody));
    await parseMessage(TEXT, { baseUrl: `${BASE}/`, fetchImpl: fetchImpl as unknown as typeof fetch });
    const calledUrl = (fetchImpl.mock.calls as unknown as [string, RequestInit][])[0][0];
    expect(calledUrl).toBe(`${BASE}/parse`);
  });

  it('a 503 gives the fallback (source fallback)', async () => {
    const fetchImpl = jest.fn(async () => response(503, { error: 'model unreachable' }));
    const draft = await parseMessage(TEXT, { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(draft).toEqual(fallbackDraft());
    expect(draft.source).toBe('fallback');
  });

  it('every non-200 status gives the fallback (422, 413, 429 too)', async () => {
    for (const status of [422, 413, 429, 500]) {
      const fetchImpl = jest.fn(async () => response(status, okBody));
      const draft = await parseMessage(TEXT, { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
      expect(draft.source).toBe('fallback');
    }
  });

  it('a timeout gives the fallback', async () => {
    const fetchImpl = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const draft = await parseMessage(TEXT, { baseUrl: BASE, timeoutMs: 10, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(draft.source).toBe('fallback');
    expect(draft).toEqual(fallbackDraft());
  });

  it('a network error gives the fallback', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const draft = await parseMessage(TEXT, { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(draft.source).toBe('fallback');
  });

  it('invalid JSON gives the fallback', async () => {
    const fetchImpl = jest.fn(async () => ({
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token < in JSON');
      },
    }) as unknown as Response);
    const draft = await parseMessage(TEXT, { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(draft.source).toBe('fallback');
  });

  it('a 200 body that fails validation gives the fallback', async () => {
    const fetchImpl = jest.fn(async () => response(200, { ...okBody, pickup_by: '23:00' }));
    const draft = await parseMessage(TEXT, { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(draft).toEqual(fallbackDraft());
  });

  it('text of 501 characters gives the fallback without calling fetch', async () => {
    const fetchImpl = jest.fn(async () => response(200, okBody));
    const long = 'a'.repeat(501);
    const draft = await parseMessage(long, { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(draft.source).toBe('fallback');
  });

  it('text of exactly 500 characters is sent to the proxy', async () => {
    const fetchImpl = jest.fn(async () => response(200, okBody));
    const text = 'a'.repeat(500);
    await parseMessage(text, { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('never throws, even when fetch itself throws synchronously', async () => {
    const fetchImpl = jest.fn(() => {
      throw new Error('boom');
    });
    await expect(parseMessage(TEXT, { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toMatchObject({
      source: 'fallback',
    });
  });
});
