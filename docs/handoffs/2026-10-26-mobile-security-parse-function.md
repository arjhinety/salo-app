# Handoff: mobile-security, parse Edge Function (Supabase replaces the laptop proxy)

Date: 2026-10-26. Agent: mobile-security. Status: built, unit-tested (mocked Anthropic and store), deployed to project `salo`
(ref usslrxpftaupvropfkzl) with no key set, and integration-checked on the paths that need no key. Nothing committed or
pushed. No Claude call was made.

## What was built

All new files; nothing else touched:

- `supabase/functions/parse/`: `index.ts`, `handler.ts`, `parse.ts`, `schema.ts`, `prompt.ts`, `config.ts`, `requestStore.ts`,
  `rateLimit.ts`, `requestConfig.ts`, `deno.json` (import map, SDK pinned 0.135.0 as in `server/package.json`, zod 4.6.7,
  `@supabase/server` 1.9.2), `README.md`, `deno.lock` (written by `deno test`).
- Generated (do not edit): `promptData.ts`, `buildInfo.ts`.
- `supabase/functions/parse/tests/`: `fakes.ts`, `handler_test.ts` (22 tests), `requestconfig_test.ts` (8 tests).
- `scripts/gen-parse-prompt-data.mjs`: generator and `--check` mode.
- `server/test/parse-function-parity.test.js`: 5 Node tests (prompt byte parity, pairs and examples, drift check, digests).

Not touched: `src/`, `app.json`, `package.json`, `supabase/migrations/` (schema agent's), `supabase/config.toml` (modified by
another agent; I did not change it), `server/src/`, `server/.env`, `supabase/.env` (never opened).

## Endpoints and status codes

| Call | Status | Body | When |
|---|---|---|---|
| POST `/functions/v1/parse` | 200 | `{items, pickup_by, missing, source:"llm", model, usage}` | Valid food offer |
| POST | 400 | `{error:"bad_request", reason, usage:null}` | Body not JSON, not an object, `text` not a string, text empty |
| POST | 403 | `{error:"device_not_registered", reason, usage:null}` | No `devices` row for the user. No model call, no row |
| POST | 413 | `{error:"text_too_long"}` or `{error:"body_too_large"}` | Text over 500 code points, or body over 8 KB |
| POST | 422 | `{error:"not_food_message", reason}` | Model says not a food message |
| POST | 429 | `{error:"rate_limited", reason:"too many requests"}` + `Retry-After` | Our per-device or global limit (no model call). Model 429: `Retry-After: 60`, `reason: "model rate limit"` |
| POST | 503 | `{error:"model_unavailable", reason, error_kind}` | `no_client` (no key), `auth`, `bad_request`, `timeout`, `connection`, `server`, `other` |
| POST | 503 | `{error:"model_output_rejected", reason}` | Refusal, max_tokens, null or invalid parsed output, invalid pickup, quantity, items, unit |
| GET `/parse/health` | 200 | `{ok, model, key, prompt_sha256, request_config_sha256, sdk_version}` | Never the key value |
| any | 401 | `{code, message}` (`@supabase/server` shape) | No valid user JWT. Answered before our handler |
| other | 405 | `{error:"method_not_allowed"}` | Wrong method |

The 401 body is not our `{error, reason}` shape: it comes from the auth wrapper. The app treats any non-200 as "use fallback".

## Auth

`withSupabase({ auth: "user", errors: { detailed: false } })` from `npm:@supabase/server@1.9.2` (the pattern the Supabase
docs currently recommend). It verifies the user JWT (anonymous users included) and gives `ctx.userClaims.id`, which is the
`device_id`. `ctx.supabaseAdmin` (service role) is used only for `parse_requests` and `devices`. The key is read from
`ANTHROPIC_API_KEY`. Secret names read from the environment: `SUPABASE_SECRET_KEYS` and `SUPABASE_PUBLISHABLE_KEYS` are injected
by the platform (the wrapper reads them).

## Rate limits and logging

- Per device 10 per 60 s; global 30 per 60 s. Checked before any model call; per-device first.
- Counted rows: `http_status` in (200, 422, 429, 503) and `error_kind` not `local_rate_limit` (NULL-safe filter).
  Our local 429 rows are logged with `error_kind = local_rate_limit` and are not counted.
- One `parse_requests` row per parse request (200, 400, 413, 422, 429, 503). Health, 405, 401 and 403 write no row (the
  table requires `device_id` to reference `devices`).
- Columns: `device_id`, `text` (the accepted request text, or `""` for 400/413), `http_status`, `response` (the body), `usage`,
  `error_kind` (body `error_kind`, else body `error`, else null), `model`, `request_config_sha256`, `latency_ms`.
- The Authorization header and the key are never stored or returned. A failed insert is logged (code only) and the answer is
  still returned.
- Limits are best effort: count and insert are separate statements (see README).

## Hashes

- `prompt_sha256`: sha256 of the function's system prompt (UTF-8). Equal to the laptop code path's value (checked, below).
- `request_config_sha256`: same recipe as `server/src/requestConfig.js` adapted to the function. Inputs: system prompt, output
  JSON Schema (keys sorted), model, effort, max_tokens, SDK version, and sha256 of the LF-normalised `schema.ts` and `parse.ts`.
  The function's value is not the laptop proxy's value (different code), so the tuning scores under `2aa58cdc…` do not carry
  over (as `docs/decisions.md` says).

## Data rule and generated files

Generated from `data/parse-dev/donor_messages_tuning.csv` only (sha256 `4f269299f5201029512af17bda028efd539a621bc8df80e89ed499d573995700`,
checked by prefix in the script). Filter: `evening_id` matches E01..E10, `split == "tuning"`, exactly 170 rows; any other row
throws. Canonical pairs: 21 (same list as the laptop proxy). Examples: M0001, M0008, M0025 verbatim, gold values asserted.
`node scripts/gen-parse-prompt-data.mjs --check` prints `generated files are up to date`.

`buildInfo.ts` stores digests, not source text. The first deploy failed because the CLI bundler scanned embedded source text
for import lines and tried to treat them as paths (EUNKNOWN lstat, see the debug run). Digests fixed it.

## Test evidence (real output)

- `node scripts/gen-parse-prompt-data.mjs --check` → `generated files are up to date`
- `cd server && node --test test/parse-function-parity.test.js` → tests 5, pass 5, fail 0
- `cd server && node --test` → tests 92, pass 92, fail 0 (includes the 5 parity tests)
- `cd supabase/functions/parse && deno test --allow-read` → `ok | 30 passed | 0 failed`
- `deno check index.ts` → exit 0

The Node parity test imports the Deno-side prompt builder directly (Node 24 type stripping; a warning about the missing
`type` field is printed, harmless).

Deno environment: the global `C:\Users\arro\.deno\bin\deno.exe` (2.x) crashes on every invocation (access violation,
exit -1073741819), including from PowerShell. I did not reinstall it. For the tests I ran Deno 2.9.6 from
`npm install --no-save deno@2` inside the scratchpad (`scratchpad/deno-runtime`), which is not global. Git Bash's `deno` on
PATH is the broken one.

## Deploy and integration (project `salo` only)

Pre-check each time: `supabase/.temp/project-ref` = `usslrxpftaupvropfkzl`. Only that ref was used; no other project was
queried. Commands:

- `supabase functions deploy parse --project-ref usslrxpftaupvropfkzl --use-api --yes` → `Deployed Functions.` (exit 0).
  The first attempt failed in the bundler (see above). No Docker was used, no local `supabase start` or `serve`.
- Secret: none set. `supabase secrets set` was not run.
- Keys: fetched into a temp file for each run with `supabase projects api-keys --project-ref ...`; the script deleted the file at
  start and printed no key or token. The publishable `default` key was used for sign-in.

Integration results, no key, no Claude call:

| Check | Result |
|---|---|
| POST with only `apikey`, no Bearer | 401 `UNUSABLE_CREDENTIAL` (wrapper) |
| GET health without Bearer | 401 (wrapper) |
| Garbage Bearer | 401 `UNAUTHORIZED_LEGACY_JWT` ("Invalid JWT") |
| Anonymous sign-in | works on `salo` |
| Parse before device registration | 403 `device_not_registered`, no row |
| Register device (`devices` insert, role `dashboard`) | 201 |
| Health | 200, `key: false`; `prompt_sha256` 4d96cbac…553df and `request_config_sha256` 33fd2d66…a53c, both equal to the values computed locally from the same code |
| Not JSON | 400 |
| 501 chars | 413 `text_too_long` |
| 500 chars | 503 `model_unavailable`, `error_kind: no_client`, usage null |
| Empty text | 400 |
| Device limit (device A) | 429 `Retry-After: 38` at the 10th counted request; 9 requests answered 503 `no_client` in that run, plus 1 earlier |
| Global limit (devices B, C: 10 each; then D) | D's first request → 429 `Retry-After: 20` (30 counted in window) |
| Rows read back as each device (own rows only, RLS) | A: 14 rows (2×400, 1×413, 10×503 `no_client`, 1×429 `local_rate_limit`); B: 10×503; C: 10×503; D: 1×429 `local_rate_limit` |

Not tested remotely: the 200 path and every Claude-dependent status with a real key. Those are covered only by the mocked Deno
tests.

## Test data left in `salo` (cleanup needs approval)

The integration run created in the `salo` project: 4 anonymous auth users (created 2026-10-26), 4 `devices` rows (role
`dashboard`), and about 35 `parse_requests` rows with the text `x` (and one 500-character `a` string). The first user's id starts
`d7d734f9`. The other IDs were not kept. Cleanup needs the service role, so I did not do it. Suggested: delete the rows
where `device_id` is one of those users, then the users.

## Open risks and decisions for the orchestrator

1. **The app must register the device before it can parse.** `parse_requests.device_id` references `devices(id)`, and the
   function returns 403 for an unregistered user. The app (or its onboarding) must insert the `devices` row (role `donor`
   with a `profile_id`, or as the role applies) before calling `/parse`. Without it every parse is a 403.
2. Deployment needs the key set (`supabase secrets set ANTHROPIC_API_KEY`), which Arjhine must approve. Until then every
   parse gives 503 `no_client`.
3. The real-key path (200 shape, refusal, structured output in Deno, `zodOutputFormat` with the server's schema) is unverified
   remotely. The schema digest equals the laptop proxy's (checked), and the SDK 0.135.0 import works in Deno.
4. Limits are best effort (race between count and insert), and Retry-After uses the oldest counted row. An exact limit would
   need a database function.
5. Anonymous sign-in: works on `salo`, though `supabase/config.toml` (local config, not my file) has
   `enable_anonymous_sign_ins = false`. That only affects local dev.
6. A 401 has the wrapper's body shape (`code`, `message`), not `{error, reason}`.
7. Cost: no call made. Per-call estimates are in the README. The limits cap a sustained run at about 30 calls a minute.
8. The 3 examples and the 21 canonical items come from the tuning file only, as the rule says. The score caveats in
   `docs/decisions.md` (in-sample) still apply to any Claude-path score.
9. `deno.lock` is in the function folder (generated). Decide whether to commit it.

## What the orchestrator must do to deploy

1. Review the files above and the test evidence.
2. Check `supabase/.temp/project-ref` reads `usslrxpftaupvropfkzl`.
3. Re-run `node scripts/gen-parse-prompt-data.mjs --check` and the Deno test if files change.
4. Deploy: `supabase functions deploy parse --project-ref usslrxpftaupvropfkzl --use-api --yes`.
5. Set the key only with Arjhine's go-ahead: `supabase secrets set ANTHROPIC_API_KEY=... --project-ref usslrxpftaupvropfkzl`.
6. Agree on the device registration step (open risk 1) with the app and schema agents.
7. Decide cleanup of the test rows and users (open section above), then whether to score the function (a new paid run, only with
   Arjhine's approval).
