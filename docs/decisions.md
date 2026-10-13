# Decisions log

These decisions were made by Arjhine on 2026-10-13, from the open questions in `stories.md` (SQ-n) and `architecture.md` (O-n). They were fixed **before any tuning**, so no result could influence them. If a source document disagrees, this file wins.

## Engine rules (fixed before tuning)

| ID | Question | Decision | Source of the question |
|---|---|---|---|
| D-Q1 | Which driver gets the run when several are on time | **Provisional until tuning.** The default is the earliest ETA that meets the pickup deadline, with reliability breaking ties. The engine implements both this rule and "most reliable on-time driver, ETA breaks ties". On the tuning evenings E01–E10 only, count how often reliability changes the pick (a side agent warned that ETA ties may be rare, so learning might seldom matter). Arjhine then fixes the final rule before any pilot run, and it cannot change after that. | O-1 |
| D-Q2 | How a pantry's score becomes a share bid | `shares = min(shares_left, round(scale × score))`. `scale` is tuned on E01–E10 only, then frozen. The guide's 14 and 9 shares are illustrative (scale 17 gives Bukal 14 and Socorro 10). | O-3, SQ-3 |
| D-Q3 | Food wasted | Posted kg minus food rescued, where rescued is capped at each pantry's need. Food beyond need counts as wasted. **Consequence:** posted kg is identical across policies, so wasted(Salo) − wasted(baseline) = −(rescued(Salo) − rescued(baseline)) on every evening. The 3 food-wasted intervals are exact mirrors of the food-rescued results, as long as both measures use the same bootstrap resamples (required: one set of resample draws is shared by all measures). So they are not independent support. | O-5 |
| D-Q4 | Do losing bids cost shares? | No. Only winning bids spend shares ("your 14 shares were spent on Lot 14"). | O-7 |
| D-a | First-come-first-served timing | Each pantry replies at a seeded uniform 0–5 minutes after posting, with the same draws for every policy. The round closes 5 minutes after posting. The window length is a named parameter. | O-4 |
| D-b | How late a late run is | Minutes late are drawn, seeded, from the tuning runs' `minutes_late` values. | O-6 |
| D-c | Learning during an evening | Reliability updates within an evening and resets to the frozen tuning values at the start of the next one. This applies to every policy alike. | O-9, SQ-10 |
| D-d | Share budget reset | 40 shares per pantry per evening ("to spend tonight"). | SQ-4 |

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

Untuned starting weights for development: need 0.4, storage 0.3, distance 0.15, freshness 0.15. The share-bid scale starts at 17. Tuning on E01–E10 replaces them.
