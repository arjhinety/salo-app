# Handoff: mobile-data, M4 Claude-path recorder and scorer

Date: 2026-10-20. Agent: mobile-data. Status: built and tested with fake responses. No real call to the proxy or the model was made. No spending. Nothing committed or pushed. No pilot or main message was read or scored. Only the 170 tuning messages (E01 to E10) were used, through `server/src/tuning.js` and `src/parse/__tests__/tuningCorpus.ts`.

## Rules quoted (from the orchestrator's brief and spec changes, 2026-10-20)

Recorder pacing, quoted from `docs/decisions.md`, "Recorder pacing (Arjhine, 2026-10-20)":

> the Claude-path recorder sends no more than the proxy's limit: 30 requests per sliding 60-second window across all callers (`server/src/config.js` `RATE_LIMIT_PER_MINUTE`, `server/src/rateLimit.js`), so it spaces requests at least 2.1 s apart. On a 429, whether from the proxy's own limit or from Claude (the proxy returns `Retry-After: 60` for those), it waits `Retry-After` seconds and resends, up to 5 attempts per message and pass. Every attempt is a JSONL line with its HTTP status and attempt number. The scorer uses only the final non-429 response per message and pass; a message with no such response is counted as unanswered, not scored. Each report gives the number of calls that got a 429 and the number of retries. For evaluation runs the proxy is started with its SDK retries off (`SALO_SDK_MAX_RETRIES=0`), so no attempt is hidden inside the proxy. A 429 is not billed; any other attempt may be.

The spec changes that followed are implemented as written. The main ones:

- Retries (coordinator, 2026-10-20): "besides 429, also retry (a) HTTP 503 whose body.error is "model_unavailable" and (b) network errors (fetch throws / connection refused / timeout), up to the same 5 attempts per message per pass, with backoff: wait 2 s, 4 s, 8 s, 16 s between attempts (429 still waits Retry-After). NEVER retry 503 "model_output_rejected" or 422 — those are real parse outcomes, recorded once."
- Safety stop (coordinator): "if error_kind is "auth" or "bad_request" on any attempt, or 5 consecutive messages end with no usable response, stop the pass immediately, print why, and leave the JSONL as written."
- Scorer denominators (coordinator): "A message with none is "unanswered": EXCLUDED from that pass's denominator (not scored wrong). ... Scores are k/answered per pass."
- Pass completion (coordinator): "pass_end ... "completed" only when all 170 messages were sent ... "stopped" for the safety stop ... or any crash you can catch (also on SIGINT if feasible)."
- Scorer grouping (coordinator): "group completed passes by request_config_sha256 ... Never mix groups in a mean or min–max spread; warn at the top of the report when more than one group exists."
- Cost (coordinator): "Count usage from EVERY attempt line, including retried and unscored ones, since all of them may cost."
- Dry run (coordinator): "Estimate leaves out thinking tokens (Haiku 5.5 runs adaptive thinking; they are billed as output). Real spend is measured from the logged usage."

## What was built

Proxy (`server/`):
- `src/config.js`: `readSdkMaxRetries()` reads `SALO_SDK_MAX_RETRIES` (integer 0 or more, default 1). Anything else stops startup.
- `src/server.js`: `createModelClient()`; `GET /health` returns `ok, model, key, prompt_sha256, request_config_sha256, git_commit, git_dirty` (never the key); `readBuildInfo()` reads git once at startup; every `/parse` body has `usage`.
- `src/parse.js`: `usageOf()`; `usage` on every body that has a model response (200, 422, 503 `model_output_rejected`); `usage: null` on 429, 503 `model_unavailable`, 400, 413; `error_kind` on 503 `model_unavailable` (`auth`, `bad_request`, `timeout`, `connection`, `server`, `other`, `no_client`); `REQUEST_EFFORT` exported.
- `src/requestConfig.js` (new): `request_config_sha256` = sha256 of canonical JSON (keys sorted at every depth) of `{system_prompt, output_schema, model, effort, max_tokens, schema_js, parse_js, sdk_version}`. The schema is `zodOutputFormat(ModelOutput).schema`. The two source files are LF-normalised.

Recorder (`server/eval/`):
- `record-tuning.js` (new). Args: `--base-url` (default `http://127.0.0.1:8787`), `--pass 1|2|3`, `--out-dir` (default `docs/reports/claude-tuning/`), `--dry-run`. Calls `GET /health` first and refuses if `key` is false, if `prompt_sha256` or `request_config_sha256` is missing, or if the file exists. Pacer: 2100 ms gap and 30 sends per sliding 60 s, using `RATE_LIMIT_PER_MINUTE` from `config.js`. `/health` re-read before messages 26, 51, ...; a change of `prompt_sha256`, `request_config_sha256` or model stops the pass.
- `pricing.json` (new): the one place prices are kept. Source: Claude API model table, cached 2026-10-06. Haiku 5.5: $0.10 input and $0.50 output per million tokens; cache read 0.1x input; cache write (5 minute) 1.25x input.
- Request timeout 30 s per `/parse` call (`AbortSignal.timeout`). A timeout is a network error.
- A SIGINT handler writes a `stopped` marker and exits 130. It is not covered by an automated test.

Scorer (`src/parse/`):
- `eval/score.ts` (new): `scoreResponse(row, resp | null)`, shared by the fallback and the Claude eval. `eval-parser-tuning.test.ts` now uses it. `docs/reports/parser-tuning-fallback.md` is unchanged (`git diff --stat` empty).
- `eval/claudeTuning.ts` (new): pure. `readPassFiles`, `parsePassText`, `evaluate` (all 170 ids per pass; outcomes: scored, unanswered, not sent), `summarize`, `summarizeByGroup`, `costUsd`, `renderClaudeReport(ev, pricing)`.
- `__tests__/eval-claude-tuning.test.ts` (new, gated `EVAL_CLAUDE=1`; reads only `*.jsonl` in `docs/reports/claude-tuning/`, or `EVAL_CLAUDE_DIR`; writes `docs/reports/parser-claude-tuning.md`).
- `__tests__/claude-tuning-scorer.test.ts` (new, always runs): fixtures in `__tests__/fixtures/claude-tuning/` (passes 1-2 share request config A, pass 3 has B) and `claude-tuning-stopped/` (pass 2 stopped by auth after 20 messages). All expected numbers were worked out by hand first.
- `__tests__/imports.test.ts`: adds a check that `eval/` files are scanned. The guard already scanned all of `src/parse`, recursively.

## File formats

Attempt line (`type: "attempt"`), keys in this order: `type, message_id, evening_id, pass, attempt, http_status, retry_after_s, error, error_kind, error_detail, model, prompt_sha256, request_config_sha256, git_commit, git_dirty, sent_at, received_at, body, body_text_if_not_json, usage`. `error` is the body's `error`, or `network_error`. `error_detail` is class and code only (for example `TypeError/ECONNREFUSED`), never the message text. `usage` is the four token fields, or null.

Pass end (`type: "pass_end"`), keys: `type, pass, status ("completed" | "stopped"), reason, messages_sent, ended_at, model, prompt_sha256, request_config_sha256, git_commit, git_dirty`. "completed" only when all 170 messages were sent. `messages_sent` counts messages whose first attempt was sent. Reasons: `auth`, `bad_request`, `no_usable_response_x5`, `prompt_changed`, `request_config_changed`, `model_changed`, `interrupted`, `crash: <error name>`, `health_unavailable`.

The scorer groups completed passes by `request_config_sha256`. A pass whose lines or marker disagree on either hash is `invalid` and excluded. A pass with no marker, or stopped, is excluded and listed with its reason and counts. If more than one group exists, the report warns at the top.

## Dry run (`node server/eval/record-tuning.js --dry-run --pass 1`, nothing sent)

```
Claude-path recorder: plan (dry run, nothing sent)
  proxy: http://127.0.0.1:8787 (a dry run does not call GET /health or POST /parse)
  model: claude-haiku-5-5 (the run confirms the model from /health)
  pass: 1 of 3
  messages: 170 tuning messages (E01..E10), file order
  requests: 170 if nothing is retried; at most 850 with retries
  pacing: at least 2100 ms between sends; at most 30 sends per 60 s sliding window
  retries: 429 waits Retry-After (60 s if absent); 503 model_unavailable and network errors wait 2, 4, 8, 16 s; 503 model_output_rejected and 422 are never retried; at most 5 attempts per message
  safety stops: any error_kind auth or bad_request; 5 consecutive messages with no usable response; a caught crash or Ctrl+C (each writes a stopped pass_end marker)
  minimum duration: 169 gaps x 2.1 s = 354.9 s (about 5.9 min), plus model time and any waits
  output: C:\Users\arro\Downloads\project\salo-app\docs\reports\claude-tuning\pass-1.jsonl  (new file)
  Cost estimate (not a bill). Estimate leaves out thinking tokens (Haiku 5.5 runs adaptive thinking; they are billed as output). Real spend is measured from the logged usage.
    system prompt: 2536 characters; output schema: 630 characters; tokens = characters / 4
    per call: input about 816 tokens = $0.0001; output about 30 tokens (from the gold answers) = $0.0000; total $0.0001 (worst case $0.0011, 2048 output tokens)
    per pass (170 calls): $0.0164 expected; worst case $0.1880
    3 passes (510 calls): $0.0493 expected; worst case $0.5639
  Prices (Claude API model table, cached 2026-10-06 (...), 2026-10-06): $0.1 per million input tokens, $0.5 per million output tokens.
```

Estimate notes: tokens are characters divided by 4 (not a tokenizer). Output is taken from the gold answers, so the real output will differ. The decision text said "about $0.09" for 510 calls. This estimate gives $0.049 expected and $0.56 worst case. Please check which figure the decision should carry.

## How Arjhine runs a pass (needs Arjhine's go-ahead on spend first)

1. Start the proxy with its SDK retries off and a key in `server/.env`: `cd server && SALO_SDK_MAX_RETRIES=0 npm start`.
2. `node eval/record-tuning.js --dry-run --pass N` to see the plan.
3. `node eval/record-tuning.js --pass N` (the real run; costs money). It refuses if `docs/reports/claude-tuning/pass-N.jsonl` exists. There is no resume. A stopped pass needs a new pass number, or the file moved aside.
4. When the three passes are done: `EVAL_CLAUDE=1 npx jest src/parse/__tests__/eval-claude-tuning.test.ts`, which writes `docs/reports/parser-claude-tuning.md`.

## Test results (all run 2026-10-20, fake responses only)

- `cd server && npm test`: 87 tests, 87 pass, 0 fail (server, config, error kinds, health and build, request config, usage, recorder).
- `npx jest` (full): 17 suites pass, 3 skipped, 260 tests pass, 0 fail. The skipped suites are the env-gated ones: `eval-parser-tuning` (EVAL=1), `eval-claude-tuning` (EVAL_CLAUDE=1), and `engine/report` (REPORT=1).
- `EVAL=1 npx jest src/parse/__tests__/eval-parser-tuning.test.ts`: passes, and `git diff --stat -- docs/reports/parser-tuning-fallback.md` is empty.
- `npx tsc --noEmit`: exit 0.
- `npx expo lint`: exit 0.
- Recorder dry run: the output above.

Literal assertions in the fixture tests (hand-computed, then asserted): pass 1 answered 169, pass 3 answered 170; group A (passes 1-2) mean and spread over /169; group B (pass 3 alone) single value over /170; the 167-message subset; the stopped pass excluded (20 sent, 150 not sent); token sums 405,100 input, 20,350 output, 500 cache write, 600 cache read, 508 attempts with usage, 17 with usage null (3 are 429, 14 are outages); cost $0.0507535 in total, $0.0169125 / $0.016841 / $0.017 per pass.

## Open issues and decisions for the orchestrator

1. `git_dirty` is scoped to `server/` (`git status --porcelain -- .`). The brief says `git status --porcelain`. Other agents' changes elsewhere in the repo would otherwise make the server look dirty all the time. Say if you want the repo-wide check.
2. Prices are in `server/eval/pricing.json`, not a TypeScript module. Both the recorder and the scorer read that one file.
3. Cache writes are priced at the 5-minute rate (1.25x). The logged usage does not say which cache TTL was used.
4. Usage null on outages (503 `model_unavailable`, network) is counted as "may have been billed". The cost in the report is therefore a floor. Thinking tokens are inside `output_tokens` in the logs, so the cost is measured, not estimated.
5. `decisions.md` still says "A 429 is not billed; any other attempt may be" and gives "about $0.09" for 510 calls. The spec changes supersede both. I did not edit `decisions.md`; the orchestrator owns it.
6. Unanswered messages are excluded from the denominator (coordinator spec), not scored wrong. The decision text "counted as unanswered, not scored" agrees with this.
7. No resume. A pass killed mid-run has no marker, or a `stopped` marker. It is excluded and cannot be re-run under the same number.
8. The SIGINT path, the crash path, and the report layout beyond the asserted lines were not run against a real process or a real pass. Only the fixtures and the fake-fetch tests exercise them.
9. Not run: any real `/parse` call, any paid pass, `EVAL_CLAUDE=1` against real data (no pass files exist yet). `docs/reports/parser-claude-tuning.md` does not exist yet.
10. Lint and typecheck do not cover the new `.mjs` scratch edits (deleted after use).
11. Git: nothing committed. Files touched by this work: `server/` (new `eval/`, `src/requestConfig.js`, tests; edited `src/config.js`, `src/parse.js`, `src/server.js`, `test/parse.test.js`, `README.md`), `src/parse/eval/` (new), `src/parse/__tests__/` (new tests, new fixtures; edited `eval-parser-tuning.test.ts`, `imports.test.ts`), `docs/handoffs/2026-10-20-mobile-data-claude-recorder.md` (this file). Not touched: `src/app`, `src/components`, `src/voice`, `app.json`, root `package.json`. The untracked `docs/handoffs/2026-10-20-mobile-native-voice.md` belongs to another agent.
