# Parser held-out evaluation: Claude path, Edge Function, held-out main messages (template-generated: optimistic upper bound)

**Edge Function, held-out main messages (template-generated: optimistic upper bound).** Every score here is for the deployed Supabase Edge Function `parse` on held-out main messages. Tuning passes are in their own report and are never pooled with these.

**Scope: held-out main messages only.** 748 rows, evenings E21 to E64, from the evening dataset v1.3 (`donor_messages.csv`, split `main_sample`; the evening comes from `food_offers.csv`). The messages are template-generated, so every number here is an **optimistic upper bound**. No tuning message and no message of the other held-out split was sent or scored.

Scores are computed on the raw ParseResponse (src/parse output), before any catalog mapping.

Caveat: the prompt's food list is the 21 foods of the tuning gold labels. A gold food outside that list (for example pechay or canned sardines, if the split has them) cannot match, so those rows count as wrong. The prompt's worked examples (M0001, M0008, M0025) are tuning messages and are not in this universe.

Identity: the Edge Function reports no git commit. The git commit and dirty state in each row are the local repo at the start of each pass (they may change during a run). They do not identify the deployed code. request_config_sha256 is the identity used for grouping. The recorder stops a pass when that hash or the prompt hash changes.

Model id(s) seen: claude-haiku-5-5.

Spend on this split, from logged usage over every attempt of every pass file (unscored and retried attempts included): $0.455026. Attempts with no usage (outages) are not in that figure, so it is a floor. Section 8 has the per-pass split.

**Completed passes: 3 (pass numbers 1, 2, 3), against a plan of 3 completed passes per request config.** group A: 3 completed (pass numbers 1, 2, 3), the plan of 3. The means and spreads in section 3 use the completed passes of each group only.

Not completed, so in no mean or spread (listed in section 4): none.

## 1. Pass status and counts

| pass | status | reason | request config sha256 | prompt sha256 | git commit | git state | sent | not sent | answered | unanswered | attempts | got 429 | retries | 503 model_unavailable | network errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | completed | - | 33fd2d6656d2… | 4d96cbac140a… | 8435d66212 | dirty | 748 | 0 | 748 | 0 | 816 | 68 | 68 | 0 | 0 |
| 2 | completed | - | 33fd2d6656d2… | 4d96cbac140a… | 8435d66212 | dirty | 748 | 0 | 748 | 0 | 817 | 69 | 69 | 0 | 0 |
| 3 | completed | - | 33fd2d6656d2… | 4d96cbac140a… | 8435d66212 | dirty | 748 | 0 | 748 | 0 | 816 | 68 | 68 | 0 | 0 |

Not sent: no attempt line at all. Unanswered: attempts exist, but none is usable (only 429, 503 model_unavailable or network errors). Both are outside the denominator of the scores, so they are not scored wrong.

## 2. Request-config groups (completed passes)

| group | request config sha256 | prompt sha256 | git commit(s) | completed passes | pass numbers |
|---|---|---|---|---|---|
| A | 33fd2d6656d2fdadcb28eb36038c85bd44fda8ba3a00cc815f1b9f52f171a53c | 4d96cbac140a8fb916a1d128e255af990863af3009f09590c7372433054553df | 8435d66212 | 3 | 1, 2, 3 |

## 3. Scores by request-config group

### Group A: request config 33fd2d6656d2…, prompt 4d96cbac140a…, git 8435d66212, 3 completed passes: 1, 2, 3

#### 3A.1 All 748 held-out main messages (k/answered)

| field | pass 1 (k/answered) | pass 2 (k/answered) | pass 3 (k/answered) | mean (min–max) over 3 completed passes |
|---|---|---|---|---|
| food | 708/748 (94.7%) | 707/748 (94.5%) | 710/748 (94.9%) | 94.7% (94.5%–94.9%) |
| quantity | 725/748 (96.9%) | 724/748 (96.8%) | 727/748 (97.2%) | 97.0% (96.8%–97.2%) |
| unit | 728/748 (97.3%) | 728/748 (97.3%) | 728/748 (97.3%) | 97.3% (97.3%–97.3%) |
| pickup_by | 737/748 (98.5%) | 738/748 (98.7%) | 739/748 (98.8%) | 98.7% (98.5%–98.8%) |
| all four | 681/748 (91.0%) | 679/748 (90.8%) | 684/748 (91.4%) | 91.1% (90.8%–91.4%) |

#### 3A.3 By language (mean and min-max spread of k/answered over the group's passes)

| language | messages | food | quantity | unit | pickup_by | all four |
|---|---|---|---|---|---|---|
| en | 213 | 97.3% (97.2%–97.7%) | 94.5% (94.4%–94.8%) | 99.2% (99.1%–99.5%) | 99.2% (99.1%–99.5%) | 92.6% (92.5%–93.0%) |
| fil | 174 | 95.4% (94.8%–96.0%) | 98.7% (98.3%–99.4%) | 94.6% (94.3%–94.8%) | 96.7% (96.6%–97.1%) | 91.2% (90.2%–92.0%) |
| taglish | 361 | 92.8% (92.5%–93.1%) | 97.6% (97.2%–97.8%) | 97.5% (97.5%–97.5%) | 99.3% (99.2%–99.4%) | 90.1% (89.8%–90.6%) |

#### 3A.3 By difficulty (mean and min-max spread of k/answered over the group's passes)

| difficulty | messages | food | quantity | unit | pickup_by | all four |
|---|---|---|---|---|---|---|
| contradictory | 47 | 98.6% (97.9%–100.0%) | 63.8% (61.7%–66.0%) | 100.0% (100.0%–100.0%) | 90.8% (89.4%–91.5%) | 53.2% (51.1%–55.3%) |
| explicit | 398 | 95.6% (95.2%–95.7%) | 99.7% (99.7%–99.7%) | 99.0% (99.0%–99.0%) | 99.7% (99.7%–99.7%) | 95.6% (95.2%–95.7%) |
| implicit | 193 | 92.6% (92.2%–92.7%) | 99.5% (99.5%–99.5%) | 96.9% (96.9%–96.9%) | 99.5% (99.5%–99.5%) | 92.6% (92.2%–92.7%) |
| incomplete | 110 | 93.6% (92.7%–94.5%) | 96.7% (96.4%–97.3%) | 90.9% (90.9%–90.9%) | 96.7% (96.4%–97.3%) | 88.5% (87.3%–89.1%) |

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
| 503 | 1 | 1 | 1 |
| 503 model_output_rejected | 5 | 5 | 4 |

## 7. Attempts that got 429, retries, outage attempts

| pass | status | attempts | got 429 | retries | network errors |
|---|---|---|---|---|---|
| 1 | completed | 816 | 68 | 68 |  | 0 |
| 2 | completed | 817 | 69 | 69 |  | 0 |
| 3 | completed | 816 | 68 | 68 |  | 0 |
| total | | 2449 | 205 | 205 |  | 0 |

## 8. Tokens and cost (every attempt, retried and unscored ones included)

Prices: claude-haiku-5-5, $0.1 per million input tokens, $0.5 per million output tokens (prompts up to 100000 tokens), cache read 0.1x input, cache write (5-minute) 1.25x input. Source: Claude API model table, cached 2026-10-06 (claude-api skill; cited in docs/handoffs/2026-10-20-mobile-security-llm-proxy.md), 2026-10-06. Thinking tokens are billed as output and are inside output_tokens.

| pass | status | attempts | with usage | usage null: 429 (not billed) | usage null: outage (may be billed) | usage null: other | input tokens | output tokens | cache write tokens | cache read tokens | cost (USD) | mean cost per attempt with usage (USD) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | completed | 816 | 747 | 68 | 0 | 1 | 1254238 | 52483 | 0 | 0 | $0.151665 | $0.000203 |
| 2 | completed | 817 | 747 | 69 | 0 | 1 | 1254239 | 52796 | 0 | 0 | $0.151822 | $0.000203 |
| 3 | completed | 816 | 747 | 68 | 0 | 1 | 1254238 | 52231 | 0 | 0 | $0.151539 | $0.000203 |
| total | | 2449 | 2241 | 205 | 0 | 3 | 3762715 | 157510 | 0 | 0 | $0.455026 | $0.000203 |

Cost is unknown for the 0 outage attempts with usage null: a timed-out or dropped request may still have been billed, so the cost above is a floor. The 205 429 attempts are not billed (no model call). Partial usage (a field the API omitted) counts as 0 in the sums.
