# Parser tuning evaluation: Claude path, Edge Function (Supabase parse), tuning in-sample

**Edge Function (Supabase parse), tuning in-sample.** Every score here is for the deployed Supabase Edge Function `parse`, not the laptop proxy. Laptop-proxy passes are in their own report and are never pooled with these.

**Scope: tuning messages only.** 170 rows, evenings E01 to E10, from `data/parse-dev/donor_messages_tuning.csv`. The messages are template-generated, so every number here is an **optimistic upper bound**. No pilot or main message was sent or scored.

Scores are computed on the raw ParseResponse (src/parse output), before any catalog mapping.

In-sample score: the Edge Function's prompt (the same prompt_sha256 as the laptop proxy) quotes tuning messages M0001, M0008 and M0025 with their answers, and its food list comes from the gold labels of all 170 tuning messages. This score is in-sample and must never be quoted as expected accuracy.

Identity: the Edge Function reports no git commit. The git commit and dirty state in each row are the local repo at the start of each pass (they may change during a run). They do not identify the deployed code. request_config_sha256 is the identity used for grouping. The recorder stops a pass when that hash or the prompt hash changes.

Model id(s) seen: claude-haiku-5-5.

**Completed passes: 3 (pass numbers 1, 2, 3), against a plan of 3 completed passes per request config.** group A: 3 completed (pass numbers 1, 2, 3), the plan of 3. The means and spreads in section 3 use the completed passes of each group only.

Not completed, so in no mean or spread (listed in section 4): none.

Ignored .jsonl files in the directory (not pass-<n>.jsonl, not read): probe.jsonl.

## 1. Pass status and counts

| pass | status | reason | request config sha256 | prompt sha256 | git commit | git state | sent | not sent | answered | unanswered | attempts | got 429 | retries | 503 model_unavailable | network errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | completed | - | 33fd2d6656d2… | 4d96cbac140a… | f716dacb3a | dirty | 170 | 0 | 170 | 0 | 186 | 16 | 16 | 0 | 0 |
| 2 | completed | - | 33fd2d6656d2… | 4d96cbac140a… | 3c1a5ef3af | dirty | 170 | 0 | 170 | 0 | 185 | 15 | 15 | 0 | 0 |
| 3 | completed | - | 33fd2d6656d2… | 4d96cbac140a… | 10d5bb5787 | clean | 170 | 0 | 170 | 0 | 186 | 16 | 16 | 0 | 0 |

Not sent: no attempt line at all. Unanswered: attempts exist, but none is usable (only 429, 503 model_unavailable or network errors). Both are outside the denominator of the scores, so they are not scored wrong.

## 2. Request-config groups (completed passes)

| group | request config sha256 | prompt sha256 | git commit(s) | completed passes | pass numbers |
|---|---|---|---|---|---|
| A | 33fd2d6656d2fdadcb28eb36038c85bd44fda8ba3a00cc815f1b9f52f171a53c | 4d96cbac140a8fb916a1d128e255af990863af3009f09590c7372433054553df | f716dacb3a, 3c1a5ef3af, 10d5bb5787 | 3 | 1, 2, 3 |

## 3. Scores by request-config group

### Group A: request config 33fd2d6656d2…, prompt 4d96cbac140a…, git f716dacb3a, 3c1a5ef3af, 10d5bb5787, 3 completed passes: 1, 2, 3

#### 3A.1 All 170 tuning messages (k/answered)

| field | pass 1 (k/answered) | pass 2 (k/answered) | pass 3 (k/answered) | mean (min–max) over 3 completed passes |
|---|---|---|---|---|
| food | 166/170 (97.6%) | 166/170 (97.6%) | 166/170 (97.6%) | 97.6% (97.6%–97.6%) |
| quantity | 167/170 (98.2%) | 167/170 (98.2%) | 167/170 (98.2%) | 98.2% (98.2%–98.2%) |
| unit | 164/170 (96.5%) | 164/170 (96.5%) | 164/170 (96.5%) | 96.5% (96.5%–96.5%) |
| pickup_by | 170/170 (100.0%) | 170/170 (100.0%) | 170/170 (100.0%) | 100.0% (100.0%–100.0%) |
| all four | 160/170 (94.1%) | 160/170 (94.1%) | 160/170 (94.1%) | 94.1% (94.1%–94.1%) |

#### 3A.2 The 167 messages without M0001, M0008 and M0025 (still in-sample: food list overlap; k/answered)

| field | pass 1 (k/answered) | pass 2 (k/answered) | pass 3 (k/answered) | mean (min–max) over 3 completed passes |
|---|---|---|---|---|
| food | 163/167 (97.6%) | 163/167 (97.6%) | 163/167 (97.6%) | 97.6% (97.6%–97.6%) |
| quantity | 164/167 (98.2%) | 164/167 (98.2%) | 164/167 (98.2%) | 98.2% (98.2%–98.2%) |
| unit | 161/167 (96.4%) | 161/167 (96.4%) | 161/167 (96.4%) | 96.4% (96.4%–96.4%) |
| pickup_by | 167/167 (100.0%) | 167/167 (100.0%) | 167/167 (100.0%) | 100.0% (100.0%–100.0%) |
| all four | 157/167 (94.0%) | 157/167 (94.0%) | 157/167 (94.0%) | 94.0% (94.0%–94.0%) |

#### 3A.3 By language (mean and min-max spread of k/answered over the group's passes)

| language | messages | food | quantity | unit | pickup_by | all four |
|---|---|---|---|---|---|---|
| en | 54 | 100.0% (100.0%–100.0%) | 98.1% (98.1%–98.1%) | 100.0% (100.0%–100.0%) | 100.0% (100.0%–100.0%) | 98.1% (98.1%–98.1%) |
| fil | 34 | 94.1% (94.1%–94.1%) | 97.1% (97.1%–97.1%) | 88.2% (88.2%–88.2%) | 100.0% (100.0%–100.0%) | 85.3% (85.3%–85.3%) |
| taglish | 82 | 97.6% (97.6%–97.6%) | 98.8% (98.8%–98.8%) | 97.6% (97.6%–97.6%) | 100.0% (100.0%–100.0%) | 95.1% (95.1%–95.1%) |

#### 3A.3 By difficulty (mean and min-max spread of k/answered over the group's passes)

| difficulty | messages | food | quantity | unit | pickup_by | all four |
|---|---|---|---|---|---|---|
| contradictory | 9 | 100.0% (100.0%–100.0%) | 66.7% (66.7%–66.7%) | 100.0% (100.0%–100.0%) | 100.0% (100.0%–100.0%) | 66.7% (66.7%–66.7%) |
| explicit | 83 | 97.6% (97.6%–97.6%) | 100.0% (100.0%–100.0%) | 98.8% (98.8%–98.8%) | 100.0% (100.0%–100.0%) | 97.6% (97.6%–97.6%) |
| implicit | 52 | 96.2% (96.2%–96.2%) | 100.0% (100.0%–100.0%) | 96.2% (96.2%–96.2%) | 100.0% (100.0%–100.0%) | 96.2% (96.2%–96.2%) |
| incomplete | 26 | 100.0% (100.0%–100.0%) | 100.0% (100.0%–100.0%) | 88.5% (88.5%–88.5%) | 100.0% (100.0%–100.0%) | 88.5% (88.5%–88.5%) |

A group pass with no answered message in a row has no rate and is left out of that row's spread.

## 4. Passes not in any group (invalid, stopped, no marker, no file)

None.

## 5. Not sent and unanswered messages, by pass

- Pass 1 (completed): not sent 0; unanswered 0 (none).
- Pass 2 (completed): not sent 0; unanswered 0 (none).
- Pass 3 (completed): not sent 0; unanswered 0 (none).

## 6. Answered responses that are not 200 (final attempt), by status

| status | pass 1 (completed) | pass 2 (completed) | pass 3 (completed) |
|---|---|---|---|
| none | - | - | - |

## 7. Attempts that got 429, retries, outage attempts

| pass | status | attempts | got 429 | retries | network errors |
|---|---|---|---|---|---|
| 1 | completed | 186 | 16 | 16 |  | 0 |
| 2 | completed | 185 | 15 | 15 |  | 0 |
| 3 | completed | 186 | 16 | 16 |  | 0 |
| total | | 557 | 47 | 47 |  | 0 |

## 8. Tokens and cost (every attempt, retried and unscored ones included)

Prices: claude-haiku-5-5, $0.1 per million input tokens, $0.5 per million output tokens (prompts up to 100000 tokens), cache read 0.1x input, cache write (5-minute) 1.25x input. Source: Claude API model table, cached 2026-10-06 (claude-api skill; cited in docs/handoffs/2026-10-20-mobile-security-llm-proxy.md), 2026-10-06. Thinking tokens are billed as output and are inside output_tokens.

| pass | status | attempts | with usage | usage null: 429 (not billed) | usage null: outage (may be billed) | usage null: other | input tokens | output tokens | cache write tokens | cache read tokens | cost (USD) | mean cost per attempt with usage (USD) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | completed | 186 | 170 | 16 | 0 | 0 | 285319 | 12038 | 0 | 0 | $0.034551 | $0.000203 |
| 2 | completed | 185 | 170 | 15 | 0 | 0 | 285319 | 11444 | 0 | 0 | $0.034254 | $0.000201 |
| 3 | completed | 186 | 170 | 16 | 0 | 0 | 285319 | 11545 | 0 | 0 | $0.034304 | $0.000202 |
| total | | 557 | 510 | 47 | 0 | 0 | 855957 | 35027 | 0 | 0 | $0.103109 | $0.000202 |

Cost is unknown for the 0 outage attempts with usage null: a timed-out or dropped request may still have been billed, so the cost above is a floor. The 47 429 attempts are not billed (no model call). Partial usage (a field the API omitted) counts as 0 in the sums.
