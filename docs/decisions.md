# Decisions log

These decisions were made by Arjhine on 2026-10-13, from the open questions in `stories.md` (SQ-n) and `architecture.md` (O-n). They were fixed **before any tuning**, so no result could influence them. If a source document disagrees, this file wins.

## Engine rules (fixed before tuning)

| ID | Question | Decision | Source of the question |
|---|---|---|---|
| D-Q1 | Which driver gets the run when several are on time | **FINAL (2026-10-13):** the earliest ETA that meets the pickup deadline. Reliability breaks ties. Chosen by Arjhine on tuning-evening evidence (see "D-Q1 evidence" below) before any pilot run. It cannot change after this. | O-1 |
| D-Q2 | How a pantry's score becomes a share bid | `shares = min(shares_left, round(scale × score))`. `scale` is tuned on E01–E10 only, then frozen. The guide's 14 and 9 shares are illustrative (scale 17 gives Bukal 14 and Socorro 10). | O-3, SQ-3 |
| D-Q3 | Food wasted | Posted kg minus food rescued, where rescued is capped at each pantry's need. Food beyond need counts as wasted. **Consequence:** posted kg is identical across policies, so wasted(Salo) − wasted(baseline) = −(rescued(Salo) − rescued(baseline)) on every evening. The 3 food-wasted intervals are exact mirrors of the food-rescued results, as long as both measures use the same bootstrap resamples (required: one set of resample draws is shared by all measures). So they are not independent support. | O-5 |
| D-Q4 | Do losing bids cost shares? | No. Only winning bids spend shares ("your 14 shares were spent on Lot 14"). | O-7 |
| D-a | First-come-first-served timing | Each pantry replies at a seeded uniform 0–5 minutes after posting, with the same draws for every policy. The round closes 5 minutes after posting. The window length is a named parameter. | O-4 |
| D-b | How late a late run is | Minutes late are drawn, seeded, from the tuning runs' `minutes_late` values. | O-6 |
| D-c | Learning during an evening | Reliability updates within an evening and resets to the frozen tuning values at the start of the next one. This applies to every policy alike. | O-9, SQ-10 |
| D-d | Share budget reset | 40 shares per pantry per evening ("to spend tonight"). | SQ-4 |

## D-Q1 evidence: driver rule comparison (2026-10-13, tuning evenings E01–E10 only)

Setup: Salo policy, UNTUNED parameters, T1 hidden true show rates (the default), the same seeded evenings for both rules. Each difference is **most reliable minus earliest ETA** on the same evening. Intervals are 95% paired percentile bootstraps from `src/engine/metrics.ts` `pairedInterval`: 10,000 resamples, `bootstrapIndices(10, 10000, 20260927)`, one shared index set for all three measures. Reporting the interval on the difference, rather than which rule scored higher, follows Bestgen (2022, arXiv 2205.11134), as on guide p.20. No pilot or main evening was run.

| Evening | Food rescued, ETA / reliable (kg) | Δ food | Stranded, ETA / reliable | Δ | Driver failures, ETA / reliable | Δ |
|---|---|---|---|---|---|---|
| E01 | 141.2 / 140.6 | -0.5 | 0 / 0 | +0 | 5 / 2 | -3 |
| E02 | 142.7 / 143.5 | +0.8 | 2 / 0 | -2 | 13 / 7 | -6 |
| E03 | 183.0 / 187.6 | +4.6 | 0 / 0 | +0 | 6 / 3 | -3 |
| E04 | 115.5 / 102.6 | -12.8 | 0 / 1 | +1 | 1 / 7 | +6 |
| E05 | 141.9 / 136.8 | -5.1 | 0 / 1 | +1 | 6 / 3 | -3 |
| E06 | 141.1 / 126.4 | -14.7 | 0 / 0 | +0 | 6 / 6 | +0 |
| E07 | 157.6 / 164.8 | +7.3 | 1 / 1 | +0 | 8 / 5 | -3 |
| E08 | 136.9 / 132.7 | -4.2 | 0 / 0 | +0 | 11 / 5 | -6 |
| E09 | 164.5 / 153.7 | -10.8 | 0 / 1 | +1 | 6 / 7 | +1 |
| E10 | 178.3 / 164.5 | -13.7 | 0 / 1 | +1 | 2 / 6 | +4 |

| Measure (most reliable − earliest ETA, per evening) | Mean [95% interval] |
|---|---|
| Food rescued (kg) | -4.91 [-9.51, -0.19] |
| Stranded awards | +0.20 [-0.40, +0.70] |
| Driver failures (withdrawals + no-shows + operator cancels) | -1.30 [-3.50, +1.20] |

Reading: the food-rescued interval lies entirely below zero, so on these tuning evenings "most reliable" clearly rescues less food (about 5 kg per evening), and it often picks a farther driver. The failures and stranded intervals both include zero, so there is no clear difference in failures or stranding. Caveats: only 10 evenings, untuned weights, and the tuned weights may shift this. **Decided 2026-10-13:** Arjhine fixed "earliest ETA, reliability breaks ties" as final.

**Rounding caveat (checked 2026-10-13, tuning evenings E01–E10, Salo, 545 driver rounds):** the engine rounds each arrival up to a whole minute (`Math.ceil` in `simulate.ts`), so drivers arriving at 18:04.2 and 18:04.9 tie at 18:05. Reliability broke an earliest-ETA tie in 239 rounds (43.9%) on rounded minutes, but only in 68 (12.5%) on exact unrounded arrival times. 384 rounds (70.5%) had two or more drivers within 1 minute of the earliest exact arrival. So most of the "44%" comes from minute rounding. Quote it only together with these three counts. They were measured with a temporary, uncommitted copy of the engine, whose event logs matched the real engine on all 10 evenings. The engine's rounding and the final D-Q1 rule are unchanged; changing either needs Arjhine's approval.

## Demo behaviour

| ID | Question | Decision | Source |
|---|---|---|---|
| D-Q5 | Human-held pantry or driver profiles | The person decides on the phone before a simulated deadline. Silence counts as a decline. Simulated agents answer only for profiles nobody holds. | O-10, SQ-5 |
| D-Q6 | Donor acceptance | Automatic. The donor agent tentatively accepts the top bid when the round closes, and the donor sees the plain-words reason. | SQ-6 |
| D-Q7 | Cancel a committed driver | Allowed. The award returns to TENTATIVE, the lot is re-announced to drivers, and the driver's reliability counts a missed run. | SQ-7 |
| D-Q8 | Bicycle and tricycle travel times | Add assumed bicycle and tricycle speeds to the dataset's `params.json` and rebuild (dataset v1.2, append-only check again). Ask before publishing. | O-2 |
| D-e | Driver steps | A person holding a driver profile taps "Picked up" and "Delivered". Simulated drivers follow the clock. | SQ-12 |
| D-f | Dashboard access | A fourth entry on the profile picker, with no profile needed. | SQ-17 |
| D-g | Storage hours | Never shown, because they are assumptions. Only "needs fridge if kept" is shown. | SQ-14 |
| D-h | Google Maps handoff | A turn-by-turn directions intent. If Maps is not installed, the web directions URL in the browser. | SQ-15 |
| D-i | Relay failure | The demo still runs on one phone. | SQ-22 |
| D-j | Guide's server and Python/Mesa design (guide p.17) | Superseded by the on-device engine (PRODUCT.md, Stack). On-device storage is the "database". | SQ-1 |
| D-k | Timing targets | Sync under 5 s, parse timeout 5 s, 6 real seconds per simulated minute. All are adjustable in settings. | SQ-19 |

## Evaluation (decided earlier on 2026-10-13)

- The Results screen shows no main_sample number until the pilot on E11–E20 has run and the main-evening count is written down (guide p.19). 97.5% intervals for the two main results, 95% for the 10 supporting ones. See RES-03, RES-06 and O-8.

## Project

- Deadline: early January 2027 (end of the 1st semester, S.Y. 2026–2027).
- The study guide is edited to match D-Q2, D-Q3 and D-Q4 (p.12 and p.14), after Arjhine reviews the exact sentences.

## Scoring definitions (PROPOSED in M1; to be confirmed by Arjhine before tuning freezes the weights)

The guide gives the four parts of a pantry's value only as an example (p.11). The engine needs exact
formulas. Each raw score is in [0, 1], and the value is the weighted sum (`src/engine/utility.ts`).

| Part | Raw score | Why |
|---|---|---|
| Need | remaining need ÷ tonight's need | A pantry that has already been promised food scores lower, which spreads food around |
| Storage | 1, or 0.2 if the lot needs a fridge if kept and the pantry has none | It can still serve tonight, so not 0 (the guide's Socorro example) |
| Distance | 1 − road km ÷ the longest donor-to-pantry road in the dataset | Closer scores higher |
| Freshness | 1 − minutes to the earliest arrival ÷ 60 | Food that arrives sooner is fresher |

Refusals (the reflex step, guide p.11), checked in this order:
1. Closed tonight, or the earliest possible arrival is after closing time (this also covers "no driver could reach it").
2. The lot is bigger than the pantry's dry storage plus fridge capacity.
3. No remaining need.

**Review flag:** the 0.2 no-fridge storage score is the main reason some pantries get nothing (see "Fairness measure check"). Review the storage formula before tuning.

Untuned starting weights for development: need 0.4, storage 0.3, distance 0.15, freshness 0.15. The share-bid scale starts at 17. Tuning on E01–E10 replaces them.

## Fairness measure check (decided 2026-10-13)

- On the tuning evenings with untuned parameters, worst-served need met was 0 on all 10 evenings for all four policies: at least one pantry with need got nothing. Pantries left with 0 kg per evening: Salo 1–3, central greedy 1–4, first-come-first-served 4–9, nearest 3–11 (`docs/reports/m1-tuning-snapshot.md`).
- **Correction (2026-10-13, prompted by a side-agent note):** this was first described as mostly structural (small, indivisible lots and scarce food). A check on the same tuning evenings shows the proposed **storage score** is the main cause. With the 0.2 no-fridge storage score, Salo leaves 1, 3, 1, 2, 2, 1, 1, 2, 1, 1 pantries with nothing, and 15 of those 16 have no fridge (16 of the 30 pantries have no fridge). With the storage part removed (weights 0.57 / 0 / 0.215 / 0.215), it leaves 0, 0, 0, 0, 1, 0, 0, 2, 0, 0, and food rescued rises from 150.2 to 155.3 kg per evening. The storage formula and weight are therefore on Arjhine's pre-tuning review list. The trade-off: the storage part is what sends cooked food to pantries that can keep it, which is the guide's Bukal-vs-Socorro example.
- **Decision (option A):** keep the guide's measure and check it again right after tuning, on the tuning evenings only. If it is still 0 on most tuning evenings, Arjhine picks a replacement measure (for example, pantries left with nothing, or the mean of the five worst-served) **before any pilot run**. No pilot or main evening may run until this check is done and recorded here.

## Hidden true show rate (APPROVED 2026-10-13, option T1: pre-tuning engine definition)

- **Problem:** the engine drew each driver's real behaviour from `frozenReliability`, the same number the agents learn. That makes the agents' estimate exactly right by construction (a circular evaluation), so learning looks better than it is.
- **Proposal (T1):** give each driver a hidden `trueShowRate` that only the simulated world reads, never the agents, the messages or the UI. Its value is the dataset generator's own `p_show`, recovered by re-running the pinned v1.2 build with read-only instrumentation; the run checks that all CSVs are byte-identical to the bundled ones. R. Dizon's history was hand-set, so his rate is one fixed seeded posterior draw, Beta(11, 2) → 0.817. The late share (12% of shows) and the 50/50 split between withdrawing and not showing match the generator. Learned estimates differ from these rates by 0.09 on average and 0.30 at most.
- **Effect on D-Q1** (Salo, tuning evenings E01–E10, untuned): with truth equal to the estimate, the "most reliable" rule cut driver failures by 60% (9.1 to 3.6 per evening). With T1 the cut is 20% (6.4 to 5.1), it rescues about 5 kg less per evening, and it strands slightly more lots. So the circular setup overstated the benefit of learning.
- **Alternative (T2):** one seeded Beta(shows + 1, misses + 1) draw per driver. It is self-contained but noisier, and it does not match how the tuning history was generated.
- No pilot or main evening is run for this.
- **Implemented:** `scripts/recover-true-show-rates.py` writes `src/engine/hiddenTruth.generated.ts`, after checking that the instrumented build reproduces all 10 bundled CSVs byte for byte. R. Dizon = 0.816575: numpy default_rng(20260927), one draw per driver in drivers.csv order, the procedure from the approved experiment. A first attempt used Python's `random` and gave 0.901; it was replaced to match the approved value. The engine reads the truth only through `RunOptions.trueShowRate` (default: the generated file). Tests check that outcomes follow the truth and that agents' PROPOSE messages carry the learned estimate.

## Driver reply delay (decided 2026-10-13, option B: pre-tuning engine definition)

- **Problem:** simulated drivers answered in the same minute the pantry won, so a lot was never visibly TENTATIVE ("held until a driver commits") in a simulated evening. Instant replies are also unrealistic.
- **Decision:** after a TENTATIVE_ACCEPT, the first driver round happens 1–3 minutes later (uniform whole minutes, a counter-based seeded draw per lot on its own RNG stream, identical under all four policies). Re-announcements after a driver FAILURE keep their current timing. The delay range is an assumption; there is no measured data on real volunteers' reply times.
- **Evidence** (mobile-data study, tuning evenings E01–E10, untuned, throwaway engine copy proven identical at delay 0 on all 40 evening/policy pairs; `docs/handoffs/2026-10-13-mobile-data.md`): for Salo, max delay 3 changes food rescued by −0.07 kg per evening (150.25 → 150.18), stranded awards go from 0.3 to 0.8 per evening, and TENTATIVE lasts 1.9 minutes on average. Max delay 5 would cost 2.2 kg per evening (95% interval [−5.41, −0.05]).
