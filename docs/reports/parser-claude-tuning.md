# Parser tuning evaluation: Claude path (laptop proxy)

**Scope: tuning messages only.** 170 rows, evenings E01 to E10, from `data/parse-dev/donor_messages_tuning.csv`. The messages are template-generated, so every number here is an **optimistic upper bound**. No pilot or main message was sent or scored.

Scores are computed on the raw ParseResponse (src/parse output), before any catalog mapping.

In-sample score: the proxy's prompt quotes tuning messages M0001, M0008 and M0025 with their answers, and its food list comes from the gold labels of all 170 tuning messages. This score is in-sample and must never be quoted as expected accuracy.

Model id(s) seen: claude-haiku-5-5.

**Only 1 of 3 passes are completed** (pass 1). The means and spreads below are over the completed passes of each group only (group A: 1 pass). Passes that are not completed are listed in section 4 and are not in any mean or spread.

## 1. Pass status and counts

| pass | status | reason | request config sha256 | prompt sha256 | git commit | git state | sent | not sent | answered | unanswered | attempts | got 429 | retries | 503 model_unavailable | network errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | completed | - | 2aa58cdc2dec… | 4d96cbac140a… | e6139c29e5 | clean | 170 | 0 | 170 | 0 | 170 | 0 | 0 | 0 | 0 |
| 2 | stopped | no_usable_response_x5 | 2aa58cdc2dec… | 4d96cbac140a… | e6139c29e5 | clean | 145 | 25 | 137 | 8 | 177 | 0 | 32 | 40 | 0 |
| 3 | no file | - | none | none | unknown | unknown | 0 | 170 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

Not sent: no attempt line at all. Unanswered: attempts exist, but none is usable (only 429, 503 model_unavailable or network errors). Both are outside the denominator of the scores, so they are not scored wrong.

## 2. Request-config groups (completed passes)

| group | request config sha256 | prompt sha256 | git commit(s) | completed passes | pass numbers |
|---|---|---|---|---|---|
| A | 2aa58cdc2decd6d4f90aeb60c20a88ed46cb8ca0fa5d512d5586d85557771939 | 4d96cbac140a8fb916a1d128e255af990863af3009f09590c7372433054553df | e6139c29e5 | 1 | 1 |

## 3. Scores by request-config group

### Group A: request config 2aa58cdc2dec…, prompt 4d96cbac140a…, git e6139c29e5, 1 completed pass: 1

One completed pass in this group: the spread is that single value, not a range over passes.

#### 3A.1 All 170 tuning messages (k/answered)

| field | pass 1 (k/answered) | mean (min–max) over 1 completed pass |
|---|---|---|
| food | 165/170 (97.1%) | 97.1% (97.1%–97.1%) |
| quantity | 165/170 (97.1%) | 97.1% (97.1%–97.1%) |
| unit | 164/170 (96.5%) | 96.5% (96.5%–96.5%) |
| pickup_by | 169/170 (99.4%) | 99.4% (99.4%–99.4%) |
| all four | 159/170 (93.5%) | 93.5% (93.5%–93.5%) |

#### 3A.2 The 167 messages without M0001, M0008 and M0025 (still in-sample: food list overlap; k/answered)

| field | pass 1 (k/answered) | mean (min–max) over 1 completed pass |
|---|---|---|
| food | 162/167 (97.0%) | 97.0% (97.0%–97.0%) |
| quantity | 162/167 (97.0%) | 97.0% (97.0%–97.0%) |
| unit | 161/167 (96.4%) | 96.4% (96.4%–96.4%) |
| pickup_by | 166/167 (99.4%) | 99.4% (99.4%–99.4%) |
| all four | 156/167 (93.4%) | 93.4% (93.4%–93.4%) |

#### 3A.3 By language (mean and min-max spread of k/answered over the group's passes)

| language | messages | food | quantity | unit | pickup_by | all four |
|---|---|---|---|---|---|---|
| en | 54 | 100.0% (100.0%–100.0%) | 98.1% (98.1%–98.1%) | 100.0% (100.0%–100.0%) | 100.0% (100.0%–100.0%) | 98.1% (98.1%–98.1%) |
| fil | 34 | 94.1% (94.1%–94.1%) | 97.1% (97.1%–97.1%) | 91.2% (91.2%–91.2%) | 100.0% (100.0%–100.0%) | 88.2% (88.2%–88.2%) |
| taglish | 82 | 96.3% (96.3%–96.3%) | 96.3% (96.3%–96.3%) | 96.3% (96.3%–96.3%) | 98.8% (98.8%–98.8%) | 92.7% (92.7%–92.7%) |

#### 3A.3 By difficulty (mean and min-max spread of k/answered over the group's passes)

| difficulty | messages | food | quantity | unit | pickup_by | all four |
|---|---|---|---|---|---|---|
| contradictory | 9 | 100.0% (100.0%–100.0%) | 55.6% (55.6%–55.6%) | 100.0% (100.0%–100.0%) | 100.0% (100.0%–100.0%) | 55.6% (55.6%–55.6%) |
| explicit | 83 | 97.6% (97.6%–97.6%) | 100.0% (100.0%–100.0%) | 98.8% (98.8%–98.8%) | 100.0% (100.0%–100.0%) | 97.6% (97.6%–97.6%) |
| implicit | 52 | 96.2% (96.2%–96.2%) | 100.0% (100.0%–100.0%) | 96.2% (96.2%–96.2%) | 100.0% (100.0%–100.0%) | 96.2% (96.2%–96.2%) |
| incomplete | 26 | 96.2% (96.2%–96.2%) | 96.2% (96.2%–96.2%) | 88.5% (88.5%–88.5%) | 96.2% (96.2%–96.2%) | 88.5% (88.5%–88.5%) |

A group pass with no answered message in a row has no rate and is left out of that row's spread.

## 4. Passes not in any group (invalid, stopped, no marker, no file)

### Pass 2: stopped

- Reason: no_usable_response_x5. Marker messages_sent: 145. Ended: 2026-10-20T00:58:59.730Z.
- Request config hashes seen: 2aa58cdc2dec. Git commit(s): e6139c29e5.
- Sent: 145. Not sent: 25. Answered: 137. Unanswered: 8 (M0125, M0126, M0127, M0141, M0142, M0143, M0144, M0145).
- Attempts 177; got 429 0; retries 32; 503 model_unavailable by error_kind: timeout 25, connection 15; network errors 0.
- Not-sent ids (25): M0146, M0147, M0148, M0149, M0150, M0151, M0152, M0153, M0154, M0155, M0156, M0157, M0158, M0159, M0160, M0161, M0162, M0163, M0164, M0165, M0166, M0167, M0168, M0169, M0170

### Pass 3: no file

- Reason: -. Marker messages_sent: no marker. Ended: no marker.
- Request config hashes seen: none. Git commit(s): unknown.
- Sent: 0. Not sent: 170. Answered: 0. Unanswered: 0 (none).
- Attempts 0; got 429 0; retries 0; 503 model_unavailable by error_kind: none; network errors 0.
- Not-sent ids (170): M0001, M0002, M0003, M0004, M0005, M0006, M0007, M0008, M0009, M0010, M0011, M0012, M0013, M0014, M0015, M0016, M0017, M0018, M0019, M0020, M0021, M0022, M0023, M0024, M0025, M0026, M0027, M0028, M0029, M0030, M0031, M0032, M0033, M0034, M0035, M0036, M0037, M0038, M0039, M0040, M0041, M0042, M0043, M0044, M0045, M0046, M0047, M0048, M0049, M0050, M0051, M0052, M0053, M0054, M0055, M0056, M0057, M0058, M0059, M0060, M0061, M0062, M0063, M0064, M0065, M0066, M0067, M0068, M0069, M0070, M0071, M0072, M0073, M0074, M0075, M0076, M0077, M0078, M0079, M0080, M0081, M0082, M0083, M0084, M0085, M0086, M0087, M0088, M0089, M0090, M0091, M0092, M0093, M0094, M0095, M0096, M0097, M0098, M0099, M0100, M0101, M0102, M0103, M0104, M0105, M0106, M0107, M0108, M0109, M0110, M0111, M0112, M0113, M0114, M0115, M0116, M0117, M0118, M0119, M0120, M0121, M0122, M0123, M0124, M0125, M0126, M0127, M0128, M0129, M0130, M0131, M0132, M0133, M0134, M0135, M0136, M0137, M0138, M0139, M0140, M0141, M0142, M0143, M0144, M0145, M0146, M0147, M0148, M0149, M0150, M0151, M0152, M0153, M0154, M0155, M0156, M0157, M0158, M0159, M0160, M0161, M0162, M0163, M0164, M0165, M0166, M0167, M0168, M0169, M0170

## 5. Not sent and unanswered messages, by pass

- Pass 1 (completed): not sent 0; unanswered 0 (none).
- Pass 2 (stopped): not sent 25; unanswered 8 (M0125, M0126, M0127, M0141, M0142, M0143, M0144, M0145).
- Pass 3 (no file): not sent 170; unanswered 0 (none).

## 6. Answered responses that are not 200 (final attempt), by status

| status | pass 1 (completed) | pass 2 (stopped) | pass 3 (no file) |
|---|---|---|---|
| 503 model_output_rejected | 1 | 0 | 0 |

## 7. Attempts that got 429, retries, outage attempts

| pass | status | attempts | got 429 | retries | 503 model_unavailable (connection) | 503 model_unavailable (timeout) | network errors |
|---|---|---|---|---|---|---|---|
| 1 | completed | 170 | 0 | 0 | 0 | 0 | 0 |
| 2 | stopped | 177 | 0 | 32 | 15 | 25 | 0 |
| 3 | no file | 0 | 0 | 0 | 0 | 0 | 0 |
| total | | 347 | 0 | 32 | 15 | 25 | 0 |

## 8. Tokens and cost (every attempt, retried and unscored ones included)

Prices: claude-haiku-5-5, $0.1 per million input tokens, $0.5 per million output tokens (prompts up to 100000 tokens), cache read 0.1x input, cache write (5-minute) 1.25x input. Source: Claude API model table, cached 2026-10-06 (claude-api skill; cited in docs/handoffs/2026-10-20-mobile-security-llm-proxy.md), 2026-10-06. Thinking tokens are billed as output and are inside output_tokens.

| pass | status | attempts | with usage | usage null: 429 (not billed) | usage null: outage (may be billed) | usage null: other | input tokens | output tokens | cache write tokens | cache read tokens | cost (USD) | mean cost per attempt with usage (USD) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | completed | 170 | 170 | 0 | 0 | 0 | 285319 | 11732 | 0 | 0 | $0.034398 | $0.000202 |
| 2 | stopped | 177 | 137 | 0 | 40 | 0 | 229884 | 9492 | 0 | 0 | $0.027734 | $0.000202 |
| 3 | no file | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | $0.000000 | - |
| total | | 347 | 307 | 0 | 40 | 0 | 515203 | 21224 | 0 | 0 | $0.062132 | $0.000202 |

Cost is unknown for the 40 outage attempts with usage null: a timed-out or dropped request may still have been billed, so the cost above is a floor. The 0 429 attempts are not billed (no model call). Partial usage (a field the API omitted) counts as 0 in the sums.
