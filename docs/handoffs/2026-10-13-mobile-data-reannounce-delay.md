# Handoff: driver reply delay on re-announcements (mobile-data)

Date: 2026-10-13. Decision by Arjhine (2026-10-13): every re-announcement after a driver FAILURE waits the reply delay, like the first round after TENTATIVE_ACCEPT.

Scope: tuning evenings E01-E10 only, UNTUNED_PARAMS, T1 hidden truth. Pilot E11-E20 and main E21-E30 were not run. Nothing was committed or pushed. Not touched: `docs/decisions.md`, `docs/reports/`, `src/live/`, `src/app/`, `src/components/`, `src/data/`, `scripts/`, `data/`.

## What changed

### Engine: `src/engine/simulate.ts` (22 added, 9 removed lines)

- After a driver FAILURE (withdrew_before_commit, no_show, cancelled_by_operator), the lot's next driver round is pushed at `now + roundDelay(ls, r)`, where `r` is the lot's re-announcement number (1 for its first FAILURE, 2 for its second, and so on).
- `roundDelay(ls, r) = replyDelayMax > 0 ? 1 + intBelow(replyDelayMax, seed, STREAM.driverReply, r, ls.idx) : 0`. The first round after TENTATIVE_ACCEPT uses `r = 0`, which is the same draw as before, so first-round delays are unchanged.
- `LotState` gains `reannouncements: number`, incremented at each FAILURE path (withdraw path in `driverRound`, and `failCommitted`).
- Comments updated: `RunOptions.replyDelayMaxMin`, the withdraw path, `failCommitted`.
- Nothing else changed (D-Q1, rounding, metrics, params, RNG streams).
- With `replyDelayMaxMin: 0` the round stays in the same minute (checked: new engine at 0 equals the committed HEAD engine at 0 on all 80 evening/policy/driver-rule pairs).

### Checked: nothing else assumes a same-minute re-announcement

- A lot is in state `'tentative'` while its re-announcement is pending. `CANCEL_DRIVER` acts only on `'final'`, so a cancel in that window is ignored (no second FAILURE, no reliability update). A cancel at the round minute itself is applied after the round's own events (inputs run in phase 1), so it fails the new commit. Both are tested.
- Only one driver round can be pending per lot (a round is scheduled only from a close or a FAILURE, and a FAILURE needs `'final'`).
- `src/live/tape.ts` and `src/live/__tests__/tape.test.ts` work on logs and use synthetic logs, so they are unaffected. The one live test that does break is listed under Open issues.

### Tests

- `src/engine/__tests__/simulate.smoke.test.ts`: one existing test encoded the old behaviour, 'after a driver failure the re-announcement stays in the same minute (no reply delay)'. Replaced by 'after a driver failure the re-announcement waits the seeded reply delay (not the same minute)'. It checks every failure's next driver round against `1 + intBelow(3, seed, STREAM.driverReply, r, idx)`. The other smoke tests are unchanged (the file's diff is 8 added and 3 removed lines).
- New `src/engine/__tests__/reannounce.test.ts` (14 tests, all pass):
  - E05, L0207, Cancel driver at 1030 (salo): the drawn delay for r = 1 is 3. The first AWARD_STATE after the FAILURE is `tentative` at 1030. The next driver CALL_FOR_PROPOSALS, the next driver PROPOSE and the COMMIT are all at 1033 (= 1030 + 3). The commit is V35 at P13.
  - E01, L0005, withdrew_before_commit at 1086 (r = 1, draw 3). The lot was `tentative` since 1084, no AWARD_STATE is emitted by the withdrawal, and the next driver round is at 1089. Then the COMMIT at 1089 (V06).
  - Second re-announcement, counter 2: a Cancel at 1089 (the minute of that re-commit, applied after it) is the lot's second FAILURE. Draws are r = 1 -> 3 and r = 2 -> 2. Driver rounds are at 1086, 1089, 1091; commits at 1089 and 1091 (V12). The test would catch a counter bug, since the two draws differ.
  - Pending-cancel: Cancel at 1030, 1031 and 1032. One FAILURE (at 1030). Lot states for L0207 from 1030: final (commit), tentative (cancel), final at 1033, delivered at 1045. The lot's events after 1030 equal those of the single-cancel run.
  - Live-level check (engine test, no src/live edit): E05, salo, Cancel driver on L0207 at 1030. The last AWARD_STATE at 1030 is `tentative`, and the lot is FINAL again at 1033 (not before; no state change at 1031 or 1032).
  - All four policies: for every tuning evening, every FAILURE's next driver round is at the drawn delay for that failure number (trueShowRate all 0 to force failures).
  - All four policies with `replyDelayMaxMin: 0`: every failure's next driver round is in the same minute. E05 cancel: round and commit at 1030.
- Existing tests that encoded the old behaviour: exactly one (the smoke test above). All other engine tests pass unchanged, including the Cancel-driver test at `simulate.smoke.test.ts` line 55.

## Commands and results

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx expo lint` | exit 0 |
| `npx jest` (baseline, before my edits; other agent's work was in progress) | exit 0; Test Suites 1 skipped, 8 passed (9 total); Tests 1 skipped, 128 passed (129 total) |
| `npx jest` (final, after my edits) | exit 1; Test Suites 1 failed, 1 skipped, 10 passed (12 total); Tests 1 failed, 1 skipped, 159 passed (161 total) |
| `npx jest src/engine/__tests__/reannounce.test.ts` | exit 0; 14 passed |

The one failing test, in the final run:
`src/live/__tests__/evening.test.ts`, "cancelling a driver > on a FINAL lot: FAILURE cancelled_by_operator, then the lot is re-announced to drivers". Line 210 expects `1106`; the engine now gives `1109` (1106 + 3). The test is in `src/live/`, which I was not allowed to edit. It encodes the old same-minute re-announcement. Owner of `src/live/` should change it to 1109, or to `1106 + 3`. Lines 212-213 of that test were not reached.

`git diff --numstat HEAD -- src/engine/simulate.ts src/engine/__tests__/`:
- `src/engine/simulate.ts`: 22 added, 9 removed
- `src/engine/__tests__/simulate.smoke.test.ts`: 8 added, 3 removed
- `src/engine/__tests__/reannounce.test.ts`: new, 166 lines (untracked)

Git reports a CRLF warning for `simulate.smoke.test.ts`. The working copy is all CRLF, like HEAD, so this is a git notice, not a mixed-ending problem.

## Re-measure (tuning E01-E10, UNTUNED, T1, means over 10 evenings)

"Old" = committed HEAD engine (first-round delay 3, failure re-announcements in the same minute). "New" = this change. Both re-run now with the same script. The old values match the 2026-10-13 study at delay 3 (food 150.18 / 132.66 / 143.36 / 150.80; stranded 0.80 / 1.00 / 0.40 / 0.70; TENTATIVE 1.88 / 1.85 / 1.82 / 1.88 min with 518 / 525 / 533 / 517 spells).

### 1. Per policy

| Policy | Food rescued kg (old -> new) | Food wasted kg (old -> new) | Stranded awards (old -> new) | Driver failures per evening (old -> new) | TENTATIVE mean min, spells (old -> new) | TENTATIVE max min (old -> new) |
|---|---|---|---|---|---|---|
| salo | 150.18 -> 148.96 | 25.48 -> 26.70 | 0.80 -> 1.00 | 6.10 -> 6.20 | 1.88 (518) -> 2.15 (517) | 3 -> 6 |
| fcfs | 132.66 -> 133.34 | 43.00 -> 42.32 | 1.00 -> 0.80 | 8.30 -> 7.70 | 1.85 (525) -> 2.17 (524) | 3 -> 9 |
| nearest | 143.36 -> 143.38 | 32.29 -> 32.27 | 0.40 -> 0.50 | 10.10 -> 8.80 | 1.82 (533) -> 2.20 (528) | 3 -> 7 |
| central_greedy | 150.80 -> 151.70 | 24.85 -> 23.95 | 0.70 -> 0.60 | 6.60 -> 6.70 | 1.88 (517) -> 2.15 (517) | 3 -> 6 |

- Unresolved TENTATIVE spells: 0 in every row, old and new.
- Driver failures by kind, per evening, Salo: withdrew_before_commit 2.7 -> 2.9, no_show 3.4 -> 3.3, cancelled_by_operator 0 -> 0 (no operator cancels in the untuned runs).
- Policy order by food rescued is unchanged: central_greedy, salo, nearest, fcfs.
- Descriptive only (no interval computed, not a tested difference): central_greedy minus Salo goes from 0.62 to 2.74 kg per evening.
- The TENTATIVE mean now covers the whole spell from TENTATIVE_ACCEPT (or a FAILURE) to the COMMIT. A withdrawal or no-show followed by another round keeps the lot TENTATIVE, so spells can exceed 3 minutes (max 9 under fcfs).
- Pre-delay reference (study, not re-run here): Salo food 150.25 with no delay at all. The new engine at delay 0 equals the HEAD engine at delay 0 on all 80 pairs.

### 2. D-Q1 evidence table, rerun with the method in decisions.md

Method: `bootstrapIndices(10, 10000, 20260927)`, `pairedInterval(..., 0.95)`, Salo, UNTUNED, T1, E01-E10. Each difference is most reliable minus earliest ETA.

Validation first (as asked): a temporary copy of the new engine with the re-announcement delay forced to 0 reproduces decisions.md exactly: food -5.75 [-10.38, -1.46], stranded +0.50 [0.00, +1.00], failures -1.30 [-3.80, +1.30]. The committed HEAD engine gives the same. Validation passed, so the new numbers below are real.

Per evening (food kg, stranded, driver failures; ETA / reliable):

| Evening | Food ETA / reliable (kg) | Delta food | Stranded ETA / reliable | Delta | Failures ETA / reliable | Delta |
|---|---|---|---|---|---|---|
| E01 | 137.48 / 140.64 | +3.16 | 1 / 0 | -1 | 7 / 2 | -5 |
| E02 | 142.70 / 138.08 | -4.62 | 2 / 2 | 0 | 9 / 7 | -2 |
| E03 | 182.88 / 183.06 | +0.18 | 1 / 1 | 0 | 6 / 3 | -3 |
| E04 | 115.45 / 113.46 | -1.99 | 0 / 0 | 0 | 1 / 6 | +5 |
| E05 | 139.90 / 136.85 | -3.05 | 1 / 1 | 0 | 5 / 4 | -1 |
| E06 | 141.10 / 133.14 | -7.96 | 0 / 0 | 0 | 4 / 7 | +3 |
| E07 | 155.53 / 158.83 | +3.30 | 2 / 3 | +1 | 8 / 3 | -5 |
| E08 | 137.31 / 135.09 | -2.22 | 2 / 1 | -1 | 11 / 2 | -9 |
| E09 | 159.00 / 156.66 | -2.34 | 1 / 1 | 0 | 9 / 7 | -2 |
| E10 | 178.26 / 160.26 | -18.00 | 0 / 2 | +2 | 2 / 5 | +3 |

| Measure (most reliable - earliest ETA) | Old (HEAD, 3-min first round, same-minute re-announce) | New (this change) |
|---|---|---|
| Food rescued (kg) | -5.75 [-10.38, -1.46] | -3.35 [-7.30, -0.16] |
| Stranded awards | +0.50 [0.00, +1.00] | +0.10 [-0.40, +0.60] |
| Driver failures | -1.30 [-3.80, +1.30] | -1.60 [-4.10, +1.00] |

Reading: the food interval is still entirely below zero, but its upper end is now -0.16 kg (was -1.46). "Most reliable" rescues about 3 kg per evening less, and it is close to zero. Stranding now includes zero comfortably; the lower end touching 0.00 from before is gone. Failures include zero, as before. Caveats unchanged: 10 evenings, untuned weights.

### 3. Tie counts (Salo, E01-E10, earliest-ETA rounds)

Method: a temporary copy of the engine that records unrounded arrivals, with the same scheduling (so the logs must match). Exact tie = unrounded arrivals within 1e-9 minute. Band = within 1 minute of the earliest exact arrival. Validation: the copy's logs and results equal the real engine's on all 80 pairs (10 evenings x 4 policies x 2 driver rules). At delay 0 the copy reproduces the pre-delay figures exactly (545 / 239 / 68 / 384).

| Count | New, reply delay on everywhere | Pre-delay (delay 0), validated now | Earlier 2026-10-13 re-measure (HEAD; not re-run) |
|---|---|---|---|
| Driver rounds with offers | 536 | 545 | 537 |
| Reliability broke a tie, rounded minutes | 235 (43.8%) | 239 (43.9%) | 239 (44.5%) |
| Reliability broke a tie, exact arrivals | 75 (14.0%) | 68 (12.5%) | 72 (13.4%) |
| Two or more drivers within 1 minute | 371 (69.2%) | 384 (70.5%) | 380 (70.8%) |

The new counts differ from the earlier re-measure because the re-announcement delay changes which rounds happen.

### 4. Paused-cancel probe on E05, salo

Procedure: for each minute 1000-1290 and each lot that is FINAL at that minute in the no-input run, run again with one CANCEL_DRIVER at that minute, and check whether the lot is `final` again at that same minute.

| Engine | Probes (lot-minutes FINAL) | Shown FINAL again in the same minute |
|---|---|---|
| HEAD (old) | 665 | 594 (matches the 594 of 665 in the brief) |
| New | 641 | 0 |

The denominator changes because the set of FINAL lot-minutes is different in the two engines.

## Proposed text for `docs/decisions.md` (orchestrator edits; not written by me)

**Driver reply delay section, replacement bullets:**

- Problem: simulated drivers answered in the same minute the pantry won, so a lot was never visibly TENTATIVE. After a driver FAILURE the lot was also re-announced in the same minute, so a paused live Cancel driver showed FINAL again at once (594 of 665 paused cancels on E05).
- Decision (2026-10-13, option B, extended to re-announcements by Arjhine the same day): every driver round after a TENTATIVE_ACCEPT or a driver FAILURE waits 1 to 3 whole minutes (uniform), drawn per lot and per round from its own stream. The draw is keyed by evening seed, lot and round number (0 = first round after TENTATIVE_ACCEPT, n = the lot's n-th re-announcement). It is the same under all four policies. The delay range is an assumption; there is no measured data on real volunteers' reply times.
- Evidence (mobile-data, tuning E01-E10, untuned; `docs/handoffs/2026-10-13-mobile-data.md` and `...-reannounce-delay.md`): with the delay on every round, Salo food rescued is 148.96 kg per evening (pre-delay 150.25; committed first-round-only version 150.18), stranded awards 1.00 (was 0.80), and TENTATIVE lasts 2.15 minutes on average (max 6, when a failure chains rounds). Paused Cancel driver now always shows TENTATIVE for 1 to 3 minutes: 0 of 641 paused cancels on E05 show FINAL again in the same minute (was 594 of 665).

**D-Q1 "Re-measured with the 1-3 minute reply delay" subsection:** replace its table and paragraph with the re-measure in section 2 above. Key line: "With the reply delay on every round (re-measured 2026-10-13, 536 driver rounds, E01-E10, untuned): most reliable minus earliest ETA gives food -3.35 kg [-7.30, -0.16], stranded +0.10 [-0.40, +0.60], driver failures -1.60 [-4.10, +1.00]. The earlier figures (food -5.75 [-10.38, -1.46]) were for first-round delays only. The validation run reproduces those earlier figures exactly when the re-announcement delay is switched off." Also the rounding caveat sentence: "With the 1-3 minute delay on every round (536 rounds): 235 (43.8%) on rounded minutes, 75 (14.0%) on exact arrival times, and 371 (69.2%) within a 1-minute band."

## Stale items, not changed (owners decide)

1. `src/live/__tests__/evening.test.ts` line 210: 1106 -> 1109 (see Commands and results). Not mine to edit.
2. `src/engine/__tests__/report.test.ts` line 59: the rounding caveat text quotes the earlier numbers (537 rounds; 239 / 72 / 380) and says "re-measured". These are now 536 / 235 / 75 / 371 (table above). I did not change it: it is the snapshot generator's text and this brief limited the diff to the engine files.
3. `docs/reports/m1-tuning-snapshot.md` is generated by `REPORT=1 npx jest src/engine/__tests__/report.test.ts`. It is stale now (the food table and round counts changed). I did not regenerate it, for the same reason. Regenerate after item 2 is decided.
4. `docs/decisions.md`: the "Driver reply delay" section and the D-Q1 re-measure subsection need the text above.

## Open risks

- TENTATIVE spells can chain (a failure followed by another round keeps the lot TENTATIVE until a COMMIT), so spells can exceed the 1-3 minute range. Under fcfs the max is 9 minutes in the tuning runs.
- The re-announcement delay moves later rounds, so a later round can find no driver before the pickup deadline and strand the lot. This is part of the small rise in Salo stranded awards (0.80 -> 1.00).
- The 1-3 minute range is an assumption (decision text), not measured. Results use untuned parameters and 10 evenings.
- Nothing was run on pilot E11-E20 or main E21-E30.
