# Parser held-out scoring: pilot and main messages (2026-11-01)

**The first held-out parser score.** The tuning scores (fallback 170/170, laptop proxy 94.3%, Edge Function 94.1%) were measured on the same messages the parser was built from. They are in-sample and are not expected accuracy.

**Every number here is an optimistic upper bound.** The messages are template-generated.

Scores are computed on the raw `ParseResponse` (the `src/parse` output), before any catalog mapping. Nothing in the parser (prompt, schema, rules, vocabulary, Edge Function) was changed for this run, and no pilot or main message was used to improve anything.

Splits: pilot = evenings E11 to E20 (170 messages), main = evenings E21 to E64 (748 messages), from dataset v1.3 (`donor_messages.csv` joined to `food_offers.csv`, as the tuning filter does).

## 1. Scores

Claude path: the deployed Supabase Edge Function `parse`, 3 completed passes per split, mean (min to max over the 3 passes). Each pass answered every message; none were unanswered.

| field | pilot (170) | main (748) |
|---|---|---|
| food | 97.8% (97.6% to 98.2%) | 94.7% (94.5% to 94.9%) |
| quantity | 99.4% (99.4% to 99.4%) | 97.0% (96.8% to 97.2%) |
| unit | 99.4% (99.4% to 99.4%) | 97.3% (97.3% to 97.3%) |
| pickup_by | 98.8% (98.8% to 98.8%) | 98.7% (98.5% to 98.8%) |
| all four | 95.5% (95.3% to 95.9%) | 91.1% (90.8% to 91.4%) |

All-four counts per pass: pilot 162, 162, 163 of 170; main 681, 679, 684 of 748.

Rule-based fallback (offline path): one deterministic run, same scorer.

| field | pilot (170) | main (748) |
|---|---|---|
| food | 96.5% (164/170) | 97.2% (727/748) |
| quantity | 95.9% (163/170) | 96.5% (722/748) |
| unit | 96.5% (164/170) | 97.3% (728/748) |
| pickup_by | 99.4% (169/170) | 99.5% (744/748) |
| all four | 95.3% (162/170) | 95.7% (716/748) |

Reading: on the pilot, Claude and the fallback are level on all four (95.5% vs 95.3%). On main, Claude is lower than the fallback on all four (91.1% vs 95.7%), and lower on food (94.7% vs 97.2%) and quantity (97.0% vs 96.5%, Claude higher). The main result is the one to watch. The error types on main were not analysed in this run.

Compared with in-sample tuning (fallback 100% all four, Claude laptop 94.3%), the held-out fallback falls to 95.3% and 95.7%. That gap is the in-sample inflation.

## 2. Spend and attempts

Spend is from logged usage over every attempt of every pass file (retries included). The figures are the sum of the per-split reports.

| split | passes | calls answered | attempts | HTTP 429 (retried) | HTTP 503 model_output_rejected | spend (USD) |
|---|---|---|---|---|---|---|
| pilot | 3 completed | 510 of 510 | 555 | 45 | 0 | 0.102897 |
| main | 3 completed | 2244 of 2244 | 2449 | 205 | 17 | 0.455026 |
| **held-out total** | | | | | | **0.557923** |

- 429 responses came from the function's global 30-per-minute limit when the three passes ran at once. They are not billed, and each was retried after its `Retry-After`.
- 503 `model_output_rejected` is a real parse outcome. It is not retried, and it counts as wrong.
- No `model_unavailable` outage occurred in any held-out pass.
- Total logged spend across all report folders (tuning laptop, tuning Edge, probe, pilot, main): **$0.7916**. The M6 Claude budget is $5. The overall gate for this run was $2.00. Before main started, the projected total with main included was about $0.79.
- Per-split caps in force: pilot $0.40, main $1.50. Neither was reached.

## 3. Caveats

1. **Template-generated messages.** Every score is an optimistic upper bound. Real donors' wording will differ.
2. **The Claude path here is the deployed Edge Function**, request config `33fd2d6656d2…`, prompt `4d96cbac140a…`. It is not the laptop proxy (request config `2aa58cdc…`). The config hash was the same in all six held-out passes.
3. **Food list from tuning only.** The prompt's canonical food list is the 21 (food item, unit) pairs of the tuning gold labels, and the rule vocabulary is built from the same tuning set. A pilot or main message naming a food outside that list (for example pechay or canned sardines) cannot match. Those misses are part of these numbers by design.
4. **Prompt examples are tuning rows** (M0001, M0008, M0025). None of them is in the pilot or main splits, so there is no overlap with the examples the prompt quotes.
5. **The spread is across passes only.** The min to max is the variation between the three passes of one model on one set of messages. It does not include sampling error across messages. A rough 95% interval for a rate p over n messages is 1.96 × sqrt(p(1 − p)/n): about ±2.0 points for main all-four (91.1%, n = 748) and ±3.1 points for pilot all-four (95.5%, n = 170). These are normal approximations assuming independent messages.
6. **Online and offline paths.** The app uses the Edge Function when online and the rule-based fallback when offline. These are parser-only numbers. They do not include the donor screen's catalog mapping.
7. **Retry settings.** The function's `SALO_SDK_MAX_RETRIES=0` was set by the orchestrator before these runs. `/health` does not report it, so this was not checked from the recorder's side.
8. **Local git state changed during runs.** The recorder's local commit and dirty flags moved between passes (other agents committed in the meantime). They do not identify the deployed code. Grouping uses `request_config_sha256`.
9. **Auth users created by these runs** are listed in the handoff (`docs/handoffs/2026-11-01-mobile-testing-parser-heldout.md`). One pilot dry-run user id was not recorded. The orchestrator will clean up by date.

## Files

- Claude pilot: `docs/reports/parser-claude-pilot-edge.md` (raw passes in `docs/reports/claude-pilot-edge/`)
- Claude main: `docs/reports/parser-claude-main-edge.md` (raw passes in `docs/reports/claude-main-edge/`)
- Fallback pilot: `docs/reports/parser-fallback-pilot.md`
- Fallback main: `docs/reports/parser-fallback-main.md`

## Error analysis of the main food misses (orchestrator, 2026-11-01, after final scoring)

**Post hoc, descriptive only.** These scores are final. The tuning-only rule (decisions.md) forbids changing the prompt, schema, rules or vocabulary using pilot or main messages, so nothing was changed. Counts come from the stored JSONL with the scorer's own rule (a food name counts only if it is one of the 21 canonical tuning foods; anything else is "no food"). They are aggregated by type, and no message text is printed.

Claude (Edge) food misses on the 748 main messages: 40, 41 and 38 in passes 1–3 (the 94.7% food score). Pass 1, by cause:

| Cause | Misses | Examples (gold → model output) |
|---|---|---|
| Model wrote the donor's own word, not the canonical name | about 22 | sliced bread → "tasty" (12) and "balot (ng tasty)" (3); fried chicken → "pritong manok" (5); eggplant → "talong"; canned sardines → "sardinas" / "de lata na sardinas" |
| Gold food is not one of the 21 tuning foods, so no parser can match it | 13 | pechay (8), canned sardines (5) |
| Response rejected by the function (503 `model_output_rejected`), scored wrong | about 6 | — |

By message difficulty (pass 1, right/wrong): explicit 381/17, implicit 178/15, incomplete 103/7, contradictory 46/1. The old main evenings (E21–E30, messages M0341–M0510) and the v1.3 evenings (M0511 onward) miss at similar rates (13 of 170 and 27 of 578).

Reading: most of the gap to the fallback comes from the model echoing a local or brand word instead of mapping it to the canonical list. The fallback's tuning vocabulary maps more of these. A future version would make the prompt insist on the canonical English name and could add a post-step that maps known synonyms. That change could only be checked on a new held-out set, not on these messages.
