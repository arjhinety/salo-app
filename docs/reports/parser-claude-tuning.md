# Parser tuning evaluation: Claude path (laptop proxy)

**Scope: tuning messages only.** 170 rows, evenings E01 to E10, from `data/parse-dev/donor_messages_tuning.csv`. The messages are template-generated, so every number here is an **optimistic upper bound**. No pilot or main message was sent or scored.

Scores are computed on the raw ParseResponse (src/parse output), before any catalog mapping.

In-sample score: the proxy's prompt quotes tuning messages M0001, M0008 and M0025 with their answers, and its food list comes from the gold labels of all 170 tuning messages. This score is in-sample and must never be quoted as expected accuracy.

Model id(s) seen: claude-haiku-5-5.

**Completed passes: 3 (pass numbers 1, 3, 4), against a plan of 3 completed passes per request config.** group A: 3 completed (pass numbers 1, 3, 4), the plan of 3. The means and spreads in section 3 use the completed passes of each group only.

Not completed, so in no mean or spread (listed in section 4): pass 2 stopped (no_usable_response_x5).

## 1. Pass status and counts

| pass | status | reason | request config sha256 | prompt sha256 | git commit | git state | sent | not sent | answered | unanswered | attempts | got 429 | retries | 503 model_unavailable | network errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | completed | - | 2aa58cdc2dec… | 4d96cbac140a… | e6139c29e5 | clean | 170 | 0 | 170 | 0 | 170 | 0 | 0 | 0 | 0 |
| 2 | stopped | no_usable_response_x5 | 2aa58cdc2dec… | 4d96cbac140a… | e6139c29e5 | clean | 145 | 25 | 137 | 8 | 177 | 0 | 32 | 40 | 0 |
| 3 | completed | - | 2aa58cdc2dec… | 4d96cbac140a… | 196eaef710 | clean | 170 | 0 | 167 | 3 | 190 | 0 | 20 | 23 | 0 |
| 4 | completed | - | 2aa58cdc2dec… | 4d96cbac140a… | 6882c8eba2 | clean | 170 | 0 | 170 | 0 | 172 | 0 | 2 | 2 | 0 |

Not sent: no attempt line at all. Unanswered: attempts exist, but none is usable (only 429, 503 model_unavailable or network errors). Both are outside the denominator of the scores, so they are not scored wrong.

## 2. Request-config groups (completed passes)

| group | request config sha256 | prompt sha256 | git commit(s) | completed passes | pass numbers |
|---|---|---|---|---|---|
| A | 2aa58cdc2decd6d4f90aeb60c20a88ed46cb8ca0fa5d512d5586d85557771939 | 4d96cbac140a8fb916a1d128e255af990863af3009f09590c7372433054553df | e6139c29e5, 196eaef710, 6882c8eba2 | 3 | 1, 3, 4 |

## 3. Scores by request-config group

### Group A: request config 2aa58cdc2dec…, prompt 4d96cbac140a…, git e6139c29e5, 196eaef710, 6882c8eba2, 3 completed passes: 1, 3, 4

#### 3A.1 All 170 tuning messages (k/answered)

| field | pass 1 (k/answered) | pass 3 (k/answered) | pass 4 (k/answered) | mean (min–max) over 3 completed passes |
|---|---|---|---|---|
| food | 165/170 (97.1%) | 164/167 (98.2%) | 165/170 (97.1%) | 97.4% (97.1%–98.2%) |
| quantity | 165/170 (97.1%) | 163/167 (97.6%) | 166/170 (97.6%) | 97.4% (97.1%–97.6%) |
| unit | 164/170 (96.5%) | 164/167 (98.2%) | 164/170 (96.5%) | 97.0% (96.5%–98.2%) |
| pickup_by | 169/170 (99.4%) | 167/167 (100.0%) | 169/170 (99.4%) | 99.6% (99.4%–100.0%) |
| all four | 159/170 (93.5%) | 159/167 (95.2%) | 160/170 (94.1%) | 94.3% (93.5%–95.2%) |

#### 3A.2 The 167 messages without M0001, M0008 and M0025 (still in-sample: food list overlap; k/answered)

| field | pass 1 (k/answered) | pass 3 (k/answered) | pass 4 (k/answered) | mean (min–max) over 3 completed passes |
|---|---|---|---|---|
| food | 162/167 (97.0%) | 161/164 (98.2%) | 162/167 (97.0%) | 97.4% (97.0%–98.2%) |
| quantity | 162/167 (97.0%) | 160/164 (97.6%) | 163/167 (97.6%) | 97.4% (97.0%–97.6%) |
| unit | 161/167 (96.4%) | 161/164 (98.2%) | 161/167 (96.4%) | 97.0% (96.4%–98.2%) |
| pickup_by | 166/167 (99.4%) | 164/164 (100.0%) | 166/167 (99.4%) | 99.6% (99.4%–100.0%) |
| all four | 156/167 (93.4%) | 156/164 (95.1%) | 157/167 (94.0%) | 94.2% (93.4%–95.1%) |

#### 3A.3 By language (mean and min-max spread of k/answered over the group's passes)

| language | messages | food | quantity | unit | pickup_by | all four |
|---|---|---|---|---|---|---|
| en | 54 | 100.0% (100.0%–100.0%) | 98.1% (98.1%–98.1%) | 100.0% (100.0%–100.0%) | 100.0% (100.0%–100.0%) | 98.1% (98.1%–98.1%) |
| fil | 34 | 94.1% (94.1%–94.1%) | 97.1% (97.1%–97.1%) | 91.2% (91.2%–91.2%) | 100.0% (100.0%–100.0%) | 88.2% (88.2%–88.2%) |
| taglish | 82 | 97.1% (96.3%–98.7%) | 97.1% (96.3%–97.6%) | 97.6% (96.3%–100.0%) | 99.2% (98.8%–100.0%) | 94.3% (92.7%–96.2%) |

#### 3A.3 By difficulty (mean and min-max spread of k/answered over the group's passes)

| difficulty | messages | food | quantity | unit | pickup_by | all four |
|---|---|---|---|---|---|---|
| contradictory | 9 | 100.0% (100.0%–100.0%) | 59.3% (55.6%–66.7%) | 100.0% (100.0%–100.0%) | 100.0% (100.0%–100.0%) | 59.3% (55.6%–66.7%) |
| explicit | 83 | 97.6% (97.6%–97.6%) | 100.0% (100.0%–100.0%) | 98.8% (98.8%–98.8%) | 100.0% (100.0%–100.0%) | 97.6% (97.6%–97.6%) |
| implicit | 52 | 96.8% (96.2%–98.0%) | 100.0% (100.0%–100.0%) | 96.8% (96.2%–98.0%) | 100.0% (100.0%–100.0%) | 96.8% (96.2%–98.0%) |
| incomplete | 26 | 97.4% (96.2%–100.0%) | 97.4% (96.2%–100.0%) | 91.0% (88.5%–96.0%) | 97.4% (96.2%–100.0%) | 91.0% (88.5%–96.0%) |

A group pass with no answered message in a row has no rate and is left out of that row's spread.

## 4. Passes not in any group (invalid, stopped, no marker, no file)

### Pass 2: stopped

- Reason: no_usable_response_x5. Marker messages_sent: 145. Ended: 2026-10-20T00:58:59.730Z.
- Request config hashes seen: 2aa58cdc2dec. Git commit(s): e6139c29e5.
- Sent: 145. Not sent: 25. Answered: 137. Unanswered: 8 (M0125, M0126, M0127, M0141, M0142, M0143, M0144, M0145).
- Attempts 177; got 429 0; retries 32; 503 model_unavailable by error_kind: timeout 25, connection 15; network errors 0.
- Not-sent ids (25): M0146, M0147, M0148, M0149, M0150, M0151, M0152, M0153, M0154, M0155, M0156, M0157, M0158, M0159, M0160, M0161, M0162, M0163, M0164, M0165, M0166, M0167, M0168, M0169, M0170

## 5. Not sent and unanswered messages, by pass

- Pass 1 (completed): not sent 0; unanswered 0 (none).
- Pass 2 (stopped): not sent 25; unanswered 8 (M0125, M0126, M0127, M0141, M0142, M0143, M0144, M0145).
- Pass 3 (completed): not sent 0; unanswered 3 (M0019, M0038, M0039).
- Pass 4 (completed): not sent 0; unanswered 0 (none).

## 6. Answered responses that are not 200 (final attempt), by status

| status | pass 1 (completed) | pass 2 (stopped) | pass 3 (completed) | pass 4 (completed) |
|---|---|---|---|---|
| 503 model_output_rejected | 1 | 0 | 0 | 1 |

## 7. Attempts that got 429, retries, outage attempts

| pass | status | attempts | got 429 | retries | 503 model_unavailable (connection) | 503 model_unavailable (timeout) | network errors |
|---|---|---|---|---|---|---|---|
| 1 | completed | 170 | 0 | 0 | 0 | 0 | 0 |
| 2 | stopped | 177 | 0 | 32 | 15 | 25 | 0 |
| 3 | completed | 190 | 0 | 20 | 0 | 23 | 0 |
| 4 | completed | 172 | 0 | 2 | 0 | 2 | 0 |
| total | | 709 | 0 | 54 | 15 | 50 | 0 |

## 8. Tokens and cost (every attempt, retried and unscored ones included)

Prices: claude-haiku-5-5, $0.1 per million input tokens, $0.5 per million output tokens (prompts up to 100000 tokens), cache read 0.1x input, cache write (5-minute) 1.25x input. Source: Claude API model table, cached 2026-10-06 (claude-api skill; cited in docs/handoffs/2026-10-20-mobile-security-llm-proxy.md), 2026-10-06. Thinking tokens are billed as output and are inside output_tokens.

| pass | status | attempts | with usage | usage null: 429 (not billed) | usage null: outage (may be billed) | usage null: other | input tokens | output tokens | cache write tokens | cache read tokens | cost (USD) | mean cost per attempt with usage (USD) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | completed | 170 | 170 | 0 | 0 | 0 | 285319 | 11732 | 0 | 0 | $0.034398 | $0.000202 |
| 2 | stopped | 177 | 137 | 0 | 40 | 0 | 229884 | 9492 | 0 | 0 | $0.027734 | $0.000202 |
| 3 | completed | 190 | 167 | 0 | 23 | 0 | 280279 | 11428 | 0 | 0 | $0.033742 | $0.000202 |
| 4 | completed | 172 | 170 | 0 | 2 | 0 | 285319 | 11937 | 0 | 0 | $0.034500 | $0.000203 |
| total | | 709 | 644 | 0 | 65 | 0 | 1080801 | 44589 | 0 | 0 | $0.130375 | $0.000202 |

Cost is unknown for the 65 outage attempts with usage null: a timed-out or dropped request may still have been billed, so the cost above is a floor. The 0 429 attempts are not billed (no model call). Partial usage (a field the API omitted) counts as 0 in the sums.
