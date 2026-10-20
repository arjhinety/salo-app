#!/usr/bin/env node
/**
 * A fake LLM proxy for device checks. It answers POST /parse with canned responses in the wire shape of
 * docs/architecture.md section 5.1, and GET /health. It calls no model and reads no keys. It is NOT the real proxy in
 * server/ (which must not be started for these checks).
 *
 * Usage:  node scripts/fake-parse-proxy.mjs [--mode=ok|missing|503] [--port=8787]
 *   ok       200, adobo (3 trays, needs a choice) and pandesal (20 pieces), pickup 20:00
 *   missing  200, pandesal with no amount (quantity null), adobo 3 trays, pickup 20:00
 *   503      503 {"error":"model_unavailable"}, so the app uses the rule-based fallback
 */
import http from 'node:http';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    return m ? [m[1], m[2]] : [a.replace(/^--/, ''), 'true'];
  }),
);
const mode = args.mode ?? 'ok';
const port = Number(args.port ?? 8787);
if (!['ok', 'missing', '503'].includes(mode)) {
  console.error(`unknown --mode=${mode} (use ok, missing or 503)`);
  process.exit(2);
}

const CANNED = {
  ok: {
    status: 200,
    body: {
      items: [
        { food_item: 'adobo', quantity: 3, unit: 'tray' },
        { food_item: 'pandesal', quantity: 20, unit: 'piece' },
      ],
      pickup_by: '20:00',
      missing: [],
      source: 'llm',
      model: 'fake-proxy',
    },
  },
  missing: {
    status: 200,
    body: {
      items: [
        { food_item: 'pandesal', quantity: null, unit: 'piece' },
        { food_item: 'adobo', quantity: 3, unit: 'tray' },
      ],
      pickup_by: '20:00',
      missing: ['quantity'],
      source: 'llm',
      model: 'fake-proxy',
    },
  },
  503: { status: 503, body: { error: 'model_unavailable' } },
};

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, { ok: true, fake: true, mode });
  }
  if (req.method === 'POST' && req.url === '/parse') {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 10_000) req.destroy();
    });
    req.on('end', () => {
      let text = '';
      try {
        text = String(JSON.parse(raw).text ?? '');
      } catch {
        return send(res, 400, { error: 'bad_json' });
      }
      console.log(`[fake-proxy] mode=${mode} text=${JSON.stringify(text).slice(0, 120)}`);
      const canned = CANNED[mode];
      return send(res, canned.status, canned.body);
    });
    return;
  }
  send(res, 404, { error: 'not_found' });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`fake parse proxy on 0.0.0.0:${port}, mode=${mode} (canned, no model)`);
});
