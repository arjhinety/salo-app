# parse (Supabase Edge Function)

The hosted replacement for the laptop LLM proxy (`server/`). Same `/parse` contract (`docs/architecture.md` section 5), plus
Supabase auth, per-device and global rate limits, and one `parse_requests` row per request. The Anthropic key lives only in
the Supabase secret `ANTHROPIC_API_KEY`.

## Endpoints

| Call | Body | Notes |
|---|---|---|
| `POST /functions/v1/parse` | `{"text": "..."}` | Needs `Authorization: Bearer <Supabase user JWT>` (anonymous users included). |
| `GET /functions/v1/parse/health` | none | Model, `key` (true/false, never the value), `prompt_sha256`, `request_config_sha256`, `sdk_version`. |

Status codes for `POST`: 200 (parsed), 400 (bad body), 401 (no valid JWT, answered by `@supabase/server` before the handler),
403 `device_not_registered` (no `devices` row for the user; nothing is logged), 413 (body over 8 KB or text over 500
characters), 422 (`not_food_message`), 429 (`rate_limited`, with `Retry-After`), 503 (`model_unavailable` with `error_kind`,
or `model_output_rejected`). Every model-backed body carries `usage`.

## Layout

- `index.ts`: `Deno.serve`, `withSupabase({ auth: "user" })`, the Anthropic client, env checks.
- `handler.ts`: the HTTP contract. Pure over its inputs, so the tests run it without network.
- `parse.ts`, `schema.ts`, `prompt.ts`: ports of `server/src/parse.js`, `schema.js`, `prompt.js`.
- `requestStore.ts`, `rateLimit.ts`: `parse_requests` and `devices` access, sliding-window limits.
- `requestConfig.ts`: `request_config_sha256` (recipe in the file header).
- `promptData.ts`, `buildInfo.ts`: GENERATED. Do not edit. Regenerate with the script below.
- `tests/`: Deno tests with an in-memory store and a mocked Anthropic client.

## Data rule (docs/decisions.md, "Parser development data: tuning evenings only")

The canonical food list and the three prompt examples come only from `data/parse-dev/donor_messages_tuning.csv`, filtered to
evening_id E01..E10 and asserted (170 rows, split `tuning`). `scripts/gen-parse-prompt-data.mjs` does this and writes
`promptData.ts` (header records the file's sha256 and the filter). The function cannot read repo files at runtime, so the
script also writes `buildInfo.ts`: sha256 digests of the output schema and of `schema.ts` and `parse.ts` (LF-normalised).
The CLI bundler fails on embedded source text, which is why digests are used.

After editing `schema.ts`, `parse.ts` or the generator inputs, run:

```
node scripts/gen-parse-prompt-data.mjs          # rewrite the two generated files
node scripts/gen-parse-prompt-data.mjs --check  # exit 1 if stale
```

## Tests

Node parity (from `server/`): `node --test test/parse-function-parity.test.js`. It checks the function's system prompt is
byte-identical to `buildSystemPrompt()` and that the generated files are current.

Deno (from `supabase/functions/parse/`): `deno test --allow-read`. Mocks only: no Anthropic call, no Supabase call.
The `--allow-read` flag is for reading `schema.ts` and `parse.ts` to check the digests.

## Deploy (run by the orchestrator, after review)

Check the linked ref first: `supabase/.temp/project-ref` must read `usslrxpftaupvropfkzl`.

```
supabase functions deploy parse --project-ref usslrxpftaupvropfkzl --use-api --yes
```

`--use-api` bundles on the server, so Docker is not needed. Plain `deploy` without it needs Docker.

The key is a secret and is set only with Arjhine's go-ahead (it sends the key to Supabase):

```
supabase secrets set ANTHROPIC_API_KEY=... --project-ref usslrxpftaupvropfkzl
```

Optional: `SALO_SDK_MAX_RETRIES` (default 1). Evaluation runs use 0, as on the laptop proxy.

Local serving (`supabase functions serve`) needs Docker and the edge-runtime image, so it was not used in this build.

## Rate limits and logging

- Per device: at most 10 counted requests in any 60 s. Global: at most 30 counted requests in any 60 s, across devices.
- Counted rows: `http_status` in 200, 422, 429, 503 and `error_kind` not `local_rate_limit`. So a refused request does not
  extend the lock. 400 and 413 do not count.
- Checks run before any model call. Per-device is checked first. `Retry-After` is the time until the relevant oldest row
  leaves the window.
- Best effort: the count and the insert are separate statements, so simultaneous requests can exceed a limit by the number
  in flight. An exact limit would need a database function with a lock.
- One `parse_requests` row per request that reaches the handler's parse path (200, 400, 413, 422, 429, 503). Health and 405
  writes no row. A 401 or 403 writes no row, because `device_id` must reference `devices`.
- `text` holds the request text only when it was accepted (at most 500 characters). Otherwise it is `""`.
- The Authorization header and the key are never stored or returned.

## Cost

No call was made while building this, so there is no measured cost. Haiku 5.5 at the price in the claude-api reference used
for the laptop proxy's estimate is about $0.00015 per call, with a worst case near $0.0011 at 2,048 output tokens. The
per-device and global limits cap a sustained run at about 30 calls a minute across all devices.
