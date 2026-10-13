# Handoff: driver reply delay, measured (mobile-data)

Date: 2026-10-13. Scope: tuning evenings E01-E10 only, UNTUNED_PARAMS. No pilot (E11-E20) or main_sample (E21-E30) evening was run. No committed engine file was edited. Nothing was committed.

## Question

In `src/engine/simulate.ts`, a simulated driver replies in the same minute a pantry wins (`driverRound` is pushed at `now` right after `TENTATIVE_ACCEPT`), so a lot is never visibly TENTATIVE. What would a seeded driver reply delay change? Arjhine decides whether to add it.

## Method

1. Throwaway copy `src/engine/__tests__/zz_delaycopy.ts` of `simulate.ts`, imports rewritten `./x` to `../x`. One added `RunOptions` field, `replyDelayMax?: number` (default 0). When it is above 0, the first `driverRound` after `TENTATIVE_ACCEPT` is scheduled at `now + d`, where `d = 1 + intBelow(replyDelayMax, seed, 5, 0, ls.idx)`, so d is in 1..replyDelayMax, seeded per lot and identical across policies. Re-announcements after a FAILURE keep their timing (same minute). Driver offers are computed at the delayed minute. Nothing else changed.
2. Faithfulness: with `replyDelayMax: 0` the copy was compared with the real `runEvening` on all 10 tuning evenings and all 4 policies (40 pairs), comparing the full JSON log and the JSON result.
3. For delay in {0, 3, 5, 8}, all four policies, tuning evenings only, `UNTUNED_PARAMS`:
   - food rescued (kg per evening, mean over 10 evenings);
   - stranded awards (mean over 10 evenings);
   - pantries left with 0 kg: open pantries with need > 0 that got 0 on-time kg, mean over 10 evenings;
   - TENTATIVE time, from each `AWARD_STATE` `tentative` to the next `final` or `stranded` for the same lot. One episode is one tentative spell. The mean is pooled over all episodes of that policy and delay across the 10 evenings. The max is over the same episodes. Re-announcements after a failure start in the same minute, so they add 0-minute episodes and pull the mean down.
4. Salo only: per-evening paired difference in food rescued, delay 5 minus delay 0, with `pairedInterval(diffs, bootstrapIndices(10, 10000, 20260927), 0.95)`.
5. Temporary jest test `src/engine/__tests__/zz_delay.test.ts`, run with `npx jest src/engine/__tests__/zz_delay.test.ts`, wrote the numbers to `$TEMP/delay.json`. Both zz_ files were then deleted. `git status --short src/engine` is empty.

## Faithfulness check: PASS

With `replyDelayMax: 0`, the copy matched the real engine on all 40 evening-policy pairs (10 tuning evenings x 4 policies). The JSON logs were identical and so were the JSON results. The real logs total 157,907 events. The jest assertion `logsEqual` and `resultEqual` both passed.

## Results (tuning evenings E01-E10, untuned parameters, means over 10 evenings)

| Delay (max min) | Policy | Food rescued (kg/evening) | Stranded awards | Pantries at 0 kg | TENTATIVE episodes | Mean min in TENTATIVE | Max min in TENTATIVE |
|---|---|---|---|---|---|---|---|
| 0 | salo | 150.25 | 0.30 | 1.50 | 520 | 0.00 | 0 |
| 0 | fcfs | 135.95 | 0.10 | 5.80 | 528 | 0.00 | 0 |
| 0 | nearest | 144.69 | 0.20 | 6.30 | 525 | 0.00 | 0 |
| 0 | central_greedy | 151.22 | 0.10 | 1.70 | 519 | 0.00 | 0 |
| 3 | salo | 150.18 | 0.80 | 1.60 | 518 | 1.88 | 3 |
| 3 | fcfs | 132.66 | 1.00 | 6.00 | 525 | 1.85 | 3 |
| 3 | nearest | 143.36 | 0.40 | 6.30 | 533 | 1.82 | 3 |
| 3 | central_greedy | 150.80 | 0.70 | 1.70 | 517 | 1.88 | 3 |
| 5 | salo | 148.01 | 1.10 | 1.70 | 511 | 2.88 | 5 |
| 5 | fcfs | 131.35 | 1.40 | 6.20 | 524 | 2.81 | 5 |
| 5 | nearest | 140.53 | 1.20 | 6.70 | 527 | 2.80 | 5 |
| 5 | central_greedy | 149.16 | 1.00 | 2.00 | 519 | 2.84 | 5 |
| 8 | salo | 146.73 | 1.70 | 1.70 | 516 | 4.23 | 8 |
| 8 | fcfs | 129.18 | 1.50 | 6.40 | 521 | 4.19 | 8 |
| 8 | nearest | 138.85 | 1.50 | 6.80 | 524 | 4.17 | 8 |
| 8 | central_greedy | 149.77 | 1.20 | 1.80 | 519 | 4.21 | 8 |

Zero unresolved TENTATIVE spells in every row. Within each delay, the policy order by food rescued is the same: central_greedy, then salo, then nearest, then fcfs.

## Salo paired difference: delay 5 minus delay 0 (food rescued, kg per evening)

- Mean difference: -2.23 kg per evening.
- 95% paired bootstrap interval: [-5.41, -0.05] (10,000 resamples, seed 20260927).
- Per-evening differences, E01 to E10: -3.70, -2.40, -0.08, 0.00, -14.70, 0.00, +1.56, +0.42, -3.43, 0.00.

The interval does not cross zero, but its upper end is only -0.05 kg. Untuned parameters and 10 evenings make this fragile. One evening (E05) carries most of the effect.

## Reading the table

- Delay costs food: Salo loses about 2 kg per evening at delay 5 and about 3.5 kg at delay 8. Delay 3 is close to no change for Salo (-0.07 kg).
- Stranded awards are above the delay-0 value for every policy at every delay level. Salo goes 0.30, 0.80, 1.10, 1.70.
- The gap between central_greedy and Salo widens with delay: 0.97 kg at delay 0, 0.62 at 3, 1.15 at 5, 3.04 at 8. These gaps are descriptive means only. No interval was computed for policies other than Salo, so this is not a tested difference.
- The TENTATIVE minutes track the seeded delay. The max equals the cap exactly. The means (1.88, 2.88, 4.23 for caps 3, 5, 8) sit a little under the uniform expectation (2, 3, 4.5). The likely cause is the 0-minute failure re-announcements, but I did not count those separately, so this is not verified.

## Caveats

- Untuned parameters (`UNTUNED_PARAMS`). The delay effect may shift once M6 tuning runs.
- 10 tuning evenings only. The Salo interval is wide relative to its own mean and touches zero.
- The delay is a modelling choice, not a measured driver behaviour. Its size (1-5 minutes, uniform) is an assumption of this run. The real distribution is unknown.
- The copy adds a delay only after `TENTATIVE_ACCEPT`. Failure re-announcements are unchanged, as specified.
- Pantries-at-0-kg counts open pantries with need > 0 and no on-time kg. Closed pantries are not counted.
- Verification was the faithfulness check and the jest run above. Nothing else was run.

## Files

- Read: `src/engine/simulate.ts`, `src/engine/metrics.ts`, `src/engine/params.ts`, `src/engine/rng.ts`, `src/engine/policies.ts`, `src/engine/world.ts`, `src/engine/types.ts`, `src/engine/__tests__/simulate.smoke.test.ts`, `src/data/dataset.ts`, `.claude/agents/mobile-data.md`.
- Created and deleted: `src/engine/__tests__/zz_delaycopy.ts`, `src/engine/__tests__/zz_delay.test.ts`.
- Written: `docs/handoffs/2026-10-13-mobile-data.md` (this file), `$TEMP/delay.json` (raw numbers, kept).
- Engine files: unchanged. `git status --short src/engine` is empty.

## Open risks

- Whether to add the delay is a product decision. The numbers show a cost in food rescued and stranded awards, and a visible TENTATIVE window that the current code never produces.
- If the delay is added to the committed engine, the smoke and metrics tests and any frozen-parameter files will need rechecking, because the event order changes.
