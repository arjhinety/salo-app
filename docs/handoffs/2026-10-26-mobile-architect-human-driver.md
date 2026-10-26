# Handoff: human-held driver profiles (decision D-Q5), mobile-architect

Date: 2026-10-26. Scope: the engine (`src/engine/`) and the input method in `src/live/evening.ts`. Tuning evenings only. No pilot or main evening was simulated, no dataset message was read, nothing was committed or pushed.

## What changed (files)

| File | Change |
|---|---|
| `src/engine/params.ts` | `HUMAN_REPLY_WINDOW_MIN = DRIVER_REPLY_DELAY_MAX_MIN` (line 21), with a comment. |
| `src/engine/types.ts` | `FailureReason` gains `'no_reply'` (line 252). `DriverAnswer = 'offer' \| 'decline' \| 'commit' \| 'withdraw'` (line 324). `DRIVER_RESPONSE.answer` uses it (line 329). |
| `src/engine/simulate.ts` | Held-driver rules (below). `RunOptions.humanDrivers` (line 64). Guard (lines 210-212). |
| `src/live/evening.ts` | New method `answerDriver(lotId, driverId, answer)` (line 219) that pushes a `DRIVER_RESPONSE` input at the clock. Plus the two type imports. Nothing else. |
| `src/engine/__tests__/human-drivers.test.ts` | New, 14 tests (listed below). |
| `src/engine/__tests__/fixtures/head-digests.json` | New. sha256 of `JSON.stringify({log, result, driverRuleStats})` for E01-E10 x four policies, recorded from HEAD `12653a3` before any change. |

`git diff --stat -- src/engine src/live/evening.ts` (tracked files): params.ts +6, simulate.ts (208 lines touched, mostly new helpers and comments), types.ts +12/-, evening.ts +12. New files: the test and the fixture. Nothing was committed.

## The byte-for-byte rule

- The fixture was recorded with a temporary jest file (since deleted) that ran `runEvening` on the HEAD `simulate.ts` for E01-E10 x {salo, fcfs, nearest, central_greedy} with `UNTUNED_PARAMS`, then wrote the digests. A copy of HEAD's `simulate.ts` is kept in the scratchpad.
- Test 1 recomputes the same digests with `humanDrivers` absent and with `new Set()`, and compares them with the fixture. It also checks the fixture has 40 keys, so a missing key cannot pass silently.
- Without held drivers, the code paths are the old ones. The round's selection (`decide`) runs in the same position as before, no new queue event is created, and the queue's phase numbers for old events are unchanged.

## Rules, with where they live in `simulate.ts`

Round start (`driverRound`, lines 375-405):
- Simulated drivers behave exactly as before. A held driver who passes the same checks (not excluded, not already held, can carry the load, can arrive before the deadline) is added to `waiting` and does not get a PROPOSE (lines 383-391).
- If anyone is waiting, the round stores `PendingRound { waiting, offers }` in `ls.round` and queues `roundClose` at `now + HUMAN_REPLY_WINDOW_MIN` (lines 396-402). Otherwise `decide` runs at `now`, as before (line 404).

Answers (`answer`, line 508):
- `offer` (`offerHeld`, line 528): the ETA is recomputed at the offer minute with `trip`, and the deadline is checked again. If the driver is no longer eligible, the answer is ignored. If it is eligible, the driver's PROPOSE is logged at that minute with the engine's ETA, the driver leaves `waiting`, and the round selects as soon as `waiting` is empty.
- `decline` (line 520): the driver leaves `waiting` and is excluded for this lot. No FAILURE and no reliability change.
- Silence (`closeRound`, line 500): at `now + 3`, every driver still in `waiting` is excluded (silence is a decline), and the round selects.
- Selection (`finishRound`, line 494): `decide(ls, stillOffered(ls, offers))`. `stillOffered` (line 481) recomputes each offer's ETA from the selection minute and drops offers that no longer arrive in time, or whose driver is now held for another lot. Without this, a driver picked for another lot during the wait could be double-booked.
- The selection rule is unchanged (`decide`, line 408): earliest ETA, reliability breaks ties.
- Driver picked and held (`decide`, line 427, then `pickHeld`, line 471): no ground-truth draw, and `ls.attempts` is not incremented. The lot stays TENTATIVE. A `commitDeadline` is queued at selection + 3.
- `commit` (`commitHeld`, line 543): the held driver leaves `awaiting`. COMMIT is logged with the ETA chosen at selection, the lot becomes final, and arrival is queued at `max(ETA, commit minute)`. There is no lateness draw and no no-show for a held driver.
- `withdraw` before commit (`withdrawHeld`, line 555): FAILURE `withdrew_before_commit`, a missed run (reliability updated), the driver is excluded, and the lot is re-announced after the reply delay (`failBeforeCommit`, line 461).
- Commit window ends (`missedCommit`, line 561): if the pick is still awaiting, FAILURE `no_reply`, the same consequences as a withdrawal.
- After COMMIT, `withdraw` is ignored, because the held driver is no longer in `awaiting`.
- Ignored inputs: the `answer` function returns without throwing, and `input()` still logs the INPUT entry (line 593, line 599). Ignored cases: no round, not waiting (already answered, excluded, or not asked), a different lot, too late (after the window), or a `commit` or `withdraw` from someone not held for that lot.

Queue (lines 133-165):
- Two new events, `roundClose` and `commitDeadline`, run in phase 2: after the engine events and the inputs of their minute. So an answer at exactly `t + 3` still counts (test (b)/(e) rely on this boundary).

Guard (lines 210-212): `runEvening` throws if `humanDrivers` is non-empty and `evening.split !== 'tuning'`. It throws before any simulation. `metrics.ts` and the report code take no `RunOptions`, so they cannot pass the option. No tuning, pilot or main runner exists in the repo yet, so the guard is the only enforcement. When those runners are written, they should pass a type that omits `humanDrivers`.

RNG (test 3 and the outcome test): a held driver's choice and COMMIT draw nothing. The only draws it can cause are the re-announcement draw of the lot's `driverReply` stream (`roundDelay`), after a held failure, which is the same draw any failure makes.

## Tests (`human-drivers.test.ts`, 14 tests, all pass)

1. Byte-for-byte: E01-E10 x four policies, `humanDrivers` absent and empty, equal the HEAD digests.
2. V02 (never chosen on E05 in the baseline) declines at once in every round where it was proposed. Every COMMIT, FAILURE, DELIVERY and reliability update has the same minute and content, and the result is equal. The full log is NOT equal, see open choice 1.
3. V19 picked and committed: `u01` is never called with the driverOutcome or lateMinutes stream for V19's index on L0227. The baseline makes those calls, so the check is not vacuous.
4. (a) E05, L0227: offer 1031, commit 1032. PROPOSE V19 eta 1038, COMMIT V19 eta 1038 at 1032, final at 1032, DELIVERY V19 at 1038, onTime. Reliability 7/7 at 1038.
5. (a2) withdraw at 1033 after the commit at 1032 is ignored. Delivery still at 1038.
6. Duplicate offer at 1031 is logged, makes one PROPOSE, and the commit at 1032 still applies.
7. (b) E05, L0207, V01 silent: CFP at 1030, COMMIT V07 eta 1045 at 1033 (round selects at t + 3). No FAILURE. No reliability change for V01 before 1033.
8. (e) V01 offers at 1034 on L0207 after the window closed at 1033: logged, and the rest of the log equals the silent run.
9. (c) offer 1031, withdraw 1032: FAILURE withdrew_before_commit at 1032, reliability 6/7, re-announce CFP at 1035, COMMIT V34 eta 1043 at 1035, delivered 1043. V19 is not offered again on L0227.
10. (d) offer 1031, no COMMIT: FAILURE no_reply at 1034 (= selection 1031 + 3), reliability 6/7, re-announce at 1037, COMMIT V34 eta 1045 at 1037, delivered 1045.
11. (d2) COMMIT at 1035 after no_reply at 1034: logged and ignored.
12. Decline at 1031 (no wait): COMMIT V34 eta 1039 at 1031, delivered 1039. No FAILURE, no reliability change for V19.
13. Guard: a relabelled copy of E05 with split `pilot` or `main_sample` throws `held driver profiles are only allowed on tuning evenings` before any simulation. No pilot or main data is simulated.

## Deviation from the brief: V01 is not used for (a), (a2), (c), (d)

The brief asked for V01 in all five cases. On E05 under salo, V01 offered at its round minute wins 0 of 49 driver rounds (run with every other round silent). It won only 2 rounds in the baseline run (its baseline COMMIT count is 2). So (a)/(c)/(d) cannot be built on V01. I used V19: offering at its round minute, it wins 3 of 48 rounds (1031 L0227, 1046 L0245, 1076 L0238). I chose L0227 at 1031, which is the first. V01 is kept for (b) and (e), where the silence and the late answer need a driver who is eligible but not chosen. Tell me if you want (a)-(d) on V01 with a different tuning evening.

## Open choices (please review)

1. **Same-minute ordering (a real effect).** A held round decides when its last answer arrives, which is an input, and inputs run after the engine's own events of their minute. So when a held driver declines at once, the round's COMMIT still lands at its minute, but later pantry replies in that minute now see the driver committed one step later. On E05 with V02 this changes L0241's freshness value (0.095 becomes 0.09499...) in a same-minute PROPOSE. No outcome changes (test 2). An answer cannot be applied earlier, because it arrives after the round exists. This is the reason test 2 compares outcomes, not the full log. Byte identity holds without held drivers, which is the hard rule.
2. **ETA at selection, not at the round minute.** Simulated offers are rechecked at the selection minute (`stillOffered`). When a round waited, the COMMIT ETA can be later than the PROPOSE ETA. Example: L0207 PROPOSE V07 eta 1042 at 1030, COMMIT V07 eta 1045 at 1033 (test 7). This is the honest start time for a driver who learns at 1033, but the pantry sees two numbers.
3. **Withdraw only applies to a picked driver.** An offer that was not picked is not withdrawn. DRV-04 says a withdrawal after an offer is a missed run. I read "before commit" as "after a pick". Changing this means a `withdraw` for a not-picked offer also logs FAILURE and excludes the driver.
4. **COMMIT later than the ETA.** Arrival is at the commit minute, but COMMIT still carries the older ETA, which is then in the past. This happens only when the ETA is within the 3-minute window. An alternative is to reject such a late commit.
5. **Held drivers never run late and never no-show.** As the brief says. A held run's arrival is at the ETA (or the commit minute, see 4).
6. **A held failure uses up a re-announcement number** for that lot, so the later delay draws of that lot shift, as a simulated failure would.
7. **A held round does not use a ground-truth draw** and does not increment `ls.attempts`. The draws of later simulated drivers on the same lot can therefore use different counters than in the baseline. That is inherent in the scenario.
8. **Pantry replies** (`earliestArrival`) still count a held driver as available, because it is a pantry-side estimate. Same as for simulated drivers.
9. **Window length** is `HUMAN_REPLY_WINDOW_MIN = 3`, the same as the reply delay. That is my assumption, not measured data.

## Live side (`src/live/evening.ts`)

- `answerDriver` pushes the input. The live evening does NOT pass `humanDrivers` to `runEvening`, so the engine ignores these inputs until the options are wired. The brief said "new methods only", so I did not add a constructor option. Please approve wiring it (`LiveEveningOptions.humanDrivers`, passed in `ensureRun`) if you want the demo to use it.

## Blocker: label for `no_reply`

- `src/live/tape.ts` line 78 (`dash.failure[reason]`) now fails `tsc`:
  `TS7053: Element implicitly has an 'any' type ... Property 'no_reply' does not exist`.
- The label map is `src/i18n/strings.ts`, which I was not allowed to touch. The fix is one line in the `failure` map (line 188). Suggested text, to be checked in the copy review: `no_reply: 'driver did not commit in time',`.

## Verification (run in this working tree)

- `npx tsc --noEmit`: 1 error, the `no_reply` label above (`src/live/tape.ts(78,10)`). Earlier in the session there was also an error in `src/app/donor/post.tsx` (`SERVER_URL`), caused by another agent's edit to `src/config/server.ts`. It was gone by the last run.
- `npx expo lint`: exit 0, no errors and no warnings after I removed one unused import from `simulate.ts`.
- `npx jest`: 25 suites passed, 3 skipped. Tests: 377 passed, 3 skipped, 380 total. The 14 new tests all pass. At HEAD in this tree the run was 293 passed, 3 skipped, 296 total, before the other agents' suites (backend, donor, pantry, parse) appeared, so the total rise is not all mine.
- Temporary exploration files (`explore*.test.ts`, `head-record.test.ts`) were created and deleted in `src/engine/__tests__/`.

## Other agents' changes in this tree (not mine, not touched)

`package.json`, `package-lock.json`, `src/pantry/`, `src/i18n/pantry.ts`, `src/config/server.ts`, and `docs/decisions.md` changed while I worked. I did not edit them. The `git diff --stat` above covers only my paths.

## Risks

- The no-hold path is verified by digests of 40 runs, not by a proof. A change to any shared helper would show up there.
- Items 1-4 above change the timeline of a run with a held driver. Anyone reading a held run should read it as a run with that person's answers, not as a simulated result.
- Nothing here measures how real volunteers answer. The window and the silence rule are assumptions.
