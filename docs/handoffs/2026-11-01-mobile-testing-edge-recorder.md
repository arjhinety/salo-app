# Handoff: Claude-path recorder for the deployed Edge Function (mobile-testing, 2026-11-01)

## What was done

The tuning recorder (`server/eval/record-tuning.js`) can now score the deployed Supabase Edge Function `parse` with
`--target edge`. The default stays the laptop proxy; laptop behaviour and its 24 tests are unchanged. Everything was built
and tested with saved fake responses, a mocked supabase client and a fake clock. **No call was made to the real project,
no Claude call, no spend.** The only commands run against the environment were local: argument-error checks, a read of
the root `.env` key names, and `git` for the state line.

The 94.3% tuning score is for the laptop proxy (request config `2aa58cdc…`). The Edge Function has the same prompt hash
but a different request config (`33fd2d6656d2…`), so its passes are a separate group, in their own folder and report.

## Files touched

- `server/eval/record-tuning.js`: `--target edge`, `--probe`, anonymous sign-in and one devices row (real run only), 401
  refresh-once, edge pacing (10 per 60 s, 6100 ms gap), edge `/health` with auth, local git state on edge lines,
  `target: "edge"` on every edge line, cost guard (`cost_cap`), edge dry run, edge setup-fault stops (`bad_request`,
  `device_not_registered`). Header comment documents the edge rules.
- `server/test/record-tuning-edge.test.js` (new, 25 tests, fake responses only).
- `src/parse/eval/claudeTuning.ts`: scorer reads `target` (missing = laptop); a pass of the other target, or with lines of
  both, is `invalid`; HTTP 401 is never a parse outcome; edge report title and in-sample label; 401 count line (only shown
  when there are 401s, so the laptop report text is unchanged).
- `src/parse/__tests__/claude-tuning-edge.test.ts` (new, 10 tests, always runs).
- `src/parse/__tests__/eval-claude-tuning-edge.test.ts` (new, gated `EVAL_CLAUDE_EDGE=1`, reads `docs/reports/claude-tuning-edge/`, writes `docs/reports/parser-claude-tuning-edge.md`).
- `docs/handoffs/2026-11-01-mobile-testing-edge-recorder.md` (this file).

Not touched: `docs/reports/claude-tuning/`, `docs/reports/parser-claude-tuning.md`, `docs/decisions.md`, `server/README.md`.

## Checks run (real output, this session)

- `cd server && node --test test/record-tuning.test.js`: 24 pass, 0 fail (laptop tests, unchanged).
- `cd server && node --test test/record-tuning-edge.test.js`: 25 pass, 0 fail.
- `cd server && npm test` (`node --test`): 117 pass, 0 fail, 0 skipped.
- `npx jest src/parse/__tests__/claude-tuning-edge.test.ts`: 10 pass.
- Jest, the other Claude scorer suites (scorer, replacement, imports): pass; `eval-claude-tuning` skipped (env-gated, as before).
- Golden check (temporary files, deleted afterwards): the old and new scorers give identical report text on the two
  committed fixture sets and on the real `docs/reports/claude-tuning/` passes. So the laptop report is unchanged.
- `npx tsc --noEmit`: exit 0.
- `npx expo lint`: exit 0.
- `npx jest --maxWorkers=2`: 652 passed, 6 skipped suites. The baseline was 583 passed / 4 skipped. My files add 10 passing
  tests and one env-gated skipped suite. The rest of the difference is other agents' test changes in the working tree,
  which I did not isolate.
- Local checks only (no network): root `.env` has both key names and `edgeConfig` accepts them (values never printed);
  `@supabase/supabase-js` 2.118.0 resolves from the repo root; CLI argument errors (`--base-url` with edge, `--probe`
  without edge, `--probe` with `--pass`) print and exit 1; `git` state line returns a 40-hex commit and a dirty flag.

## Exact commands (run from the repo root, in Git Bash)

Nothing has been run against the real project. Run these in order, and do not start the next step until the previous one
is checked.

**0. Decide the SDK retry question first (see Open decisions, item 1).**

**1. Dry run (free).** Signs in anonymously (needed for the `/health` auth header), calls `GET /health` only, prints the plan.
It sends no `/parse`, registers no device and writes no file.

```
node server/eval/record-tuning.js --target edge --pass 1 --dry-run
```

Check the plan says: `nothing parsed`, `at least 6100 ms between sends`, `at most 10 sends per 60 s`, `$0.60 cap`, and the
SDK retries line. A missing function key stops the run before the plan, with reason `no_key`.

**2. One single paid call.** One message (`M0001`), written to `docs/reports/claude-tuning-edge/probe.jsonl`. The scorer
ignores that file; the cost guard counts it. Registers one devices row and prints the auth user id.

```
node server/eval/record-tuning.js --target edge --probe
```

Check the result (prints the HTTP status, error and usage of each line of the probe file):

```
node -e "for (const l of require('fs').readFileSync('docs/reports/claude-tuning-edge/probe.jsonl','utf8').trim().split('\n')) { const o = JSON.parse(l); console.log(o.type, o.http_status ?? '', o.error ?? '', JSON.stringify(o.usage ?? null)) }"
```

Expect one attempt line with `http_status 200` and a usage object (or a 422 `not_food_message` if the parser says so; that
is an answer too), then a `pass_end` line with `reason probe`. Any other result: stop and report it, do not run passes.

**3. Passes 1 to 3** (each about 17 minutes of pacing plus model time). Each run signs in anonymously, registers one devices
row and prints its auth user id. Write the three ids down for cleanup. The run refuses to overwrite an existing file, and a
stopped pass keeps its file: a stopped pass takes a new number (the plan is 3 completed passes).

```
node server/eval/record-tuning.js --target edge --pass 1
node server/eval/record-tuning.js --target edge --pass 2
node server/eval/record-tuning.js --target edge --pass 3
```

Each pass ends with a `pass_end` line: `completed` is the goal. If one stops, read its `reason` before the next pass:
`cost_cap` (the $0.60 guard), `auth` (token refresh failed), `device_not_registered` or `bad_request` (setup faults),
`no_usable_response_x5` (outage), `prompt_changed` / `request_config_changed` (the function was redeployed mid-run).

**4. Score** (writes `docs/reports/parser-claude-tuning-edge.md`; reads only `docs/reports/claude-tuning-edge/`):

```
EVAL_CLAUDE_EDGE=1 npx jest src/parse/__tests__/eval-claude-tuning-edge.test.ts
```

## Rules the recorder applies (edge)

- Tuning messages only (E01 to E10, `server/src/tuning.js`); no pilot or main row is opened.
- Pacing: at most 10 sends in any sliding 60 s window; at least 6100 ms between sends. Retries are paced too.
- 429 (the function's own limit, or Claude's): wait `Retry-After` (60 s if absent), then resend.
- 503 `model_unavailable` and network errors: backoff 2, 4, 8, 16 s, at most 5 attempts per message.
- 401: refresh the session once and resend; a second 401 stops the pass with reason `auth`. The session is also refreshed
  120 s before it expires.
- Stops at once: `auth`, `bad_request`, `device_not_registered`; 5 consecutive messages with no usable response; Ctrl+C.
- Cost guard: sums logged usage over every `.jsonl` in `docs/reports/claude-tuning-edge/`. Each outage attempt with no usage
  is counted at its worst case (2048 output tokens), since it may have been billed. A send is refused when the total plus
  that call's worst case would pass $0.60 (`cost_cap`). The scorer's cost figure is a floor for the same reason.
- `/health` is re-read before messages 26, 51, ..., 151 (7 reads per pass with the start-of-pass one). A change of
  prompt, request config or model stops the pass.
- Every line and the `pass_end` marker carry `"target": "edge"`. The laptop lines carry no target key.

## Identity and caveats for the report

- The function has no `git_commit`. Each line records the **local repo** commit and dirty state at the start of the pass.
  Dirty is true while other agents have uncommitted changes, and the commit moves when they commit (it moved during this
  task). Neither identifies the deployed code. `request_config_sha256` is the identity used for grouping.
- Edge passes are scored in their own group and report. They are never pooled with laptop passes; a pass of the wrong
  target is listed as invalid.
- All in-sample caveats of the laptop report apply: the function's prompt is the same (same `prompt_sha256`), quotes
  M0001, M0008 and M0025, and its food list comes from the gold labels of all 170 tuning messages. Optimistic upper bound.

## Cleanup

Each run creates one anonymous auth user and one `devices` row (the row is removed when its auth user is deleted). The dry
run and the probe create users too. The recorder prints each id as `auth user id (for cleanup): <id>`. Nothing has been
deleted by me.

## Open decisions (need Arjhine before pass 1)

1. **Hidden retries inside the function (blocking for the passes).** The function's Anthropic SDK retries a failed call
   `SALO_SDK_MAX_RETRIES` times, and the code default is 1. For the laptop run that was set to 0 so no attempt was hidden.
   For the deployed function, the value is a Supabase secret that `/health` does not report, and I cannot read it. If it
   is not 0, one failed model call can become two billed calls, and the second is invisible in the log, so the cost guard
   under-counts. Options: (a) confirm the secret is already 0; (b) set it to 0 with
   `supabase secrets set SALO_SDK_MAX_RETRIES=0 --project-ref usslrxpftaupvropfkzl`. That changes the deployed project's
   config, so it needs your go-ahead; I have not done it. The probe is the cheaper place to test this, at a worst case of
   about one extra call.
2. **Device role for the recorder's row.** I used role `dashboard` with no profile: the only valid role without a donor or
   driver profile, and the parser does not check the role. If you prefer another role, say so before the probe.
3. **Free plan.** Check the project is awake before the dry run (free projects pause after about 7 days without use).
   A paused project makes `/health` fail, with reason `proxy_unreachable` or `health_failed`, and nothing is sent.
