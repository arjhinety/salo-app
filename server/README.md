# Salo LLM proxy (laptop)

The phones send one donor message to this laptop, and it returns the parsed food items as JSON. It calls Claude (`claude-haiku-5-5`) with your Anthropic key. The key lives only on this laptop and is never sent to a phone.

Status: M4 phase 1. No auth yet. Pairing comes in M5. Anyone on the same Wi-Fi can call it (see Security below).

## 1. Set the key (once)

1. Copy `server/.env.example` to `server/.env`.
2. Put your key after `ANTHROPIC_API_KEY=`, with no quotes and no spaces.
3. Leave `PORT=8787` as it is.

`server/.env` is git-ignored (`.gitignore` lines `.env` and `server/.env`). Do not commit it, paste it into chat, or put it in the app. The server never prints the key, and `/health` only says whether one is set.

## 2. Start the server

Requires Node 20.6 or newer (tested on Node 24.19.0).

```
cd server
npm install
npm start
```

The startup output lists the laptop's LAN addresses, for example `LAN address: http://192.168.1.20:8787`. Use the address of your Wi-Fi adapter. If you need it again, run `ipconfig` and read the IPv4 address of the Wi-Fi adapter. Windows Firewall may ask about access; allow it on private networks only. Stop the server with Ctrl+C.

Without a key the server still starts. `/health` shows `"key": false`, and `/parse` returns 503 until you add the key and restart.

## 3. Check it

Health (free, no model call):

```
curl -s http://<LAN-IP>:8787/health
```

Parse (this makes one real Claude call and spends a fraction of a cent, roughly $0.0002 at Haiku prices):

```
curl -s -X POST http://<LAN-IP>:8787/parse -H "Content-Type: application/json" -d '{"text":"We have 1 tray of pork adobo left along Katipunan Avenue, pickup before 8:30 PM."}'
```

## Endpoints

| Call | Success | Errors |
|---|---|---|
| `POST /parse` with `{"text": "..."}` | 200 `{items, pickup_by, missing, source: "llm", model}` | 400 bad body or empty text; 413 text over 500 characters or body too large; 422 not a food message (with `reason`); 429 rate limit (local, or model rate limit); 503 model unavailable, or the model's output was refused, cut off, or invalid |
| `GET /health` | 200 `{ok, model, key}` | none |

Every error body is `{"error": "<code>", "reason": "<text>"}`. The app treats any non-200 as "use the offline parser".

## Limits

- Text up to 500 characters.
- 30 `/parse` requests per minute in total, across all callers (429 with `Retry-After`).
- 8 second timeout to the model, one retry.
- Output capped at 2048 tokens per call.

## Tests

```
npm test
```

The tests use a mocked Anthropic client, so they make no network calls and need no key.

## Security notes

- The server listens on `0.0.0.0` so phones on the LAN can reach it. Anyone on the same Wi-Fi can call `/parse`. At most 30 calls per minute reach the model. Worst-case spend (every call uses the full 2048 output tokens) is about $0.03 per minute, or $2 per hour, if the server runs unattended. A normal call costs about $0.0002. For a hard ceiling, set a spend limit on the API key in the Anthropic Console.
- Do not run this on a public network or port-forward it. Stop it when you are not using it.
- The key stays in `server/.env`, on this laptop only.

## Files

- `src/server.js`: HTTP routes, input checks, startup output.
- `src/parse.js`: the one model call, output checks, error mapping.
- `src/prompt.js`: the system prompt, built once at startup.
- `src/tuning.js`, `src/csv.js`: read the tuning file (E01 to E10 only).
- `src/schema.js`: the Zod schema and output checks.
- `src/rateLimit.js`, `src/config.js`: rate limit and settings.
- `test/`: tests (`npm test`).
