# Parser held-out evaluation: Claude path, Edge Function, held-out pilot messages (template-generated: optimistic upper bound)

**Edge Function, held-out pilot messages (template-generated: optimistic upper bound).** Every score here is for the deployed Supabase Edge Function `parse` on held-out pilot messages. Tuning passes are in their own report and are never pooled with these.

**Scope: held-out pilot messages only.** 170 rows, evenings E11 to E20, from the evening dataset v1.3 (`donor_messages.csv`, split `pilot`; the evening comes from `food_offers.csv`). The messages are template-generated, so every number here is an **optimistic upper bound**. No tuning message and no message of the other held-out split was sent or scored.

Scores are computed on the raw ParseResponse (src/parse output), before any catalog mapping.

Caveat: the prompt's food list is the 21 foods of the tuning gold labels. A gold food outside that list (for example pechay or canned sardines, if the split has them) cannot match, so those rows count as wrong. The prompt's worked examples (M0001, M0008, M0025) are tuning messages and are not in this universe.

Identity: the Edge Function reports no git commit. The git commit and dirty state in each row are the local repo at the start of each pass (they may change during a run). They do not identify the deployed code. request_config_sha256 is the identity used for grouping. The recorder stops a pass when that hash or the prompt hash changes.

Model id(s) seen: claude-haiku-5-5.

Spend on this split, from logged usage over every attempt of every pass file (unscored and retried attempts included): $0.102897. Attempts with no usage (outages) are not in that figure, so it is a floor. Section 8 has the per-pass split.

**Completed passes: 3 (pass numbers 1, 2, 3), against a plan of 3 completed passes per request config.** group A: 3 completed (pass numbers 1, 2, 3), the plan of 3. The means and spreads in section 3 use the completed passes of each group only.

Not completed, so in no mean or spread (listed in section 4): none.

## 1. Pass status and counts

| pass | status | reason | request config sha256 | prompt sha256 | git commit | git state | sent | not sent | answered | unanswered | attempts | got 429 | retries | 503 model_unavailable | network errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | completed | - | 33fd2d6656d2… | 4d96cbac140a… | 83c9d5dd64 | dirty | 170 | 0 | 170 | 0 | 185 | 15 | 15 | 0 | 0 |
| 2 | completed | - | 33fd2d6656d2… | 4d96cbac140a… | 83c9d5dd64 | dirty | 170 | 0 | 170 | 0 | 185 | 15 | 15 | 0 | 0 |
| 3 | completed | - | 33fd2d6656d2… | 4d96cbac140a… | 83c9d5dd64 | dirty | 170 | 0 | 170 | 0 | 185 | 15 | 15 | 0 | 0 |

Not sent: no attempt line at all. Unanswered: attempts exist, but none is usable (only 429, 503 model_unavailable or network errors). Both are outside the denominator of the scores, so they are not scored wrong.

## 2. Request-config groups (completed passes)

| group | request config sha256 | prompt sha256 | git commit(s) | completed passes | pass numbers |
|---|---|---|---|---|---|
| A | 33fd2d6656d2fdadcb28eb36038c85bd44fda8ba3a00cc815f1b9f52f171a53c | 4d96cbac140a8fb916a1d128e255af990863af3009f09590c7372433054553df | 83c9d5dd64 | 3 | 1, 2, 3 |

## 3. Scores by request-config group

### Group A: request config 33fd2d6656d2…, prompt 4d96cbac140a…, git 83c9d5dd64, 3 completed passes: 1, 2, 3

#### 3A.1 All 170 held-out pilot messages (k/answered)

| field | pass 1 (k/answered) | pass 2 (k/answered) | pass 3 (k/answered) | mean (min–max) over 3 completed passes |
|---|---|---|---|---|
| food | 166/170 (97.6%) | 166/170 (97.6%) | 167/170 (98.2%) | 97.8% (97.6%–98.2%) |
| quantity | 169/170 (99.4%) | 169/170 (99.4%) | 169/170 (99.4%) | 99.4% (99.4%–99.4%) |
| unit | 169/170 (99.4%) | 169/170 (99.4%) | 169/170 (99.4%) | 99.4% (99.4%–99.4%) |
| pickup_by | 168/170 (98.8%) | 168/170 (98.8%) | 168/170 (98.8%) | 98.8% (98.8%–98.8%) |
| all four | 162/170 (95.3%) | 162/170 (95.3%) | 163/170 (95.9%) | 95.5% (95.3%–95.9%) |

#### 3A.3 By language (mean and min-max spread of k/answered over the group's passes)

| language | messages | food | quantity | unit | pickup_by | all four |
|---|---|---|---|---|---|---|
| en | 64 | 98.4% (98.4%–98.4%) | 100.0% (100.0%–100.0%) | 100.0% (100.0%–100.0%) | 100.0% (100.0%–100.0%) | 98.4% (98.4%–98.4%) |
| fil | 36 | 97.2% (97.2%–97.2%) | 100.0% (100.0%–100.0%) | 100.0% (100.0%–100.0%) | 94.4% (94.4%–94.4%) | 91.7% (91.7%–91.7%) |
| taglish | 70 | 97.6% (97.1%–98.6%) | 98.6% (98.6%–98.6%) | 98.6% (98.6%–98.6%) | 100.0% (100.0%–100.0%) | 94.8% (94.3%–95.7%) |

#### 3A.3 By difficulty (mean and min-max spread of k/answered over the group's passes)

| difficulty | messages | food | quantity | unit | pickup_by | all four |
|---|---|---|---|---|---|---|
| contradictory | 8 | 100.0% (100.0%–100.0%) | 87.5% (87.5%–87.5%) | 100.0% (100.0%–100.0%) | 75.0% (75.0%–75.0%) | 62.5% (62.5%–62.5%) |
| explicit | 86 | 98.1% (97.7%–98.8%) | 100.0% (100.0%–100.0%) | 100.0% (100.0%–100.0%) | 100.0% (100.0%–100.0%) | 98.1% (97.7%–98.8%) |
| implicit | 51 | 98.0% (98.0%–98.0%) | 100.0% (100.0%–100.0%) | 100.0% (100.0%–100.0%) | 100.0% (100.0%–100.0%) | 98.0% (98.0%–98.0%) |
| incomplete | 25 | 96.0% (96.0%–96.0%) | 100.0% (100.0%–100.0%) | 96.0% (96.0%–96.0%) | 100.0% (100.0%–100.0%) | 92.0% (92.0%–92.0%) |

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
| 1 | completed | 185 | 15 | 15 |  | 0 |
| 2 | completed | 185 | 15 | 15 |  | 0 |
| 3 | completed | 185 | 15 | 15 |  | 0 |
| total | | 555 | 45 | 45 |  | 0 |

## 8. Tokens and cost (every attempt, retried and unscored ones included)

Prices: claude-haiku-5-5, $0.1 per million input tokens, $0.5 per million output tokens (prompts up to 100000 tokens), cache read 0.1x input, cache write (5-minute) 1.25x input. Source: Claude API model table, cached 2026-10-06 (claude-api skill; cited in docs/handoffs/2026-10-20-mobile-security-llm-proxy.md), 2026-10-06. Thinking tokens are billed as output and are inside output_tokens.

| pass | status | attempts | with usage | usage null: 429 (not billed) | usage null: outage (may be billed) | usage null: other | input tokens | output tokens | cache write tokens | cache read tokens | cost (USD) | mean cost per attempt with usage (USD) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | completed | 185 | 170 | 15 | 0 | 0 | 285421 | 11629 | 0 | 0 | $0.034357 | $0.000202 |
| 2 | completed | 185 | 170 | 15 | 0 | 0 | 285421 | 11473 | 0 | 0 | $0.034279 | $0.000202 |
| 3 | completed | 185 | 170 | 15 | 0 | 0 | 285421 | 11440 | 0 | 0 | $0.034262 | $0.000202 |
| total | | 555 | 510 | 45 | 0 | 0 | 856263 | 34542 | 0 | 0 | $0.102897 | $0.000202 |

Cost is unknown for the 0 outage attempts with usage null: a timed-out or dropped request may still have been billed, so the cost above is a floor. The 45 429 attempts are not billed (no model call). Partial usage (a field the API omitted) counts as 0 in the sums.
