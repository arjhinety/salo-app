# M6 tuning, E01-E10: in-sample, not a result

**Tuning evenings E01-E10, in-sample, not a result.** The settings below were chosen on these ten evenings, so none of these numbers is evidence about Salo or any other policy. The only reported results are the main evenings (E21-E30, Results screen).

Written by the gated runner `src/tuning/__tests__/m6-tuning-run.test.ts` (M6_TUNING=1) on 2026-11-01. Runtime 373 s, one process, one evening at a time. Sampler seed 20261101, budget 400 sampled settings per policy plus setting 0 (untuned) = 401 evaluated.

## Method (fixed in docs/decisions.md before the run)

- Target: maximise mean food rescued (kg per evening) over E01-E10, subject to the mean over E01-E10 of each evening's worst-served need met being at least 0.5. If no setting reaches 0.5, the one closest to it is used, ties to more food.
- Weights: Dirichlet(1,1,1,1) on the simplex, drawn from the engine counter-based RNG with the tuning streams (101 weights, 102 Salo scale, 103 central penalty). Salo and central greedy draw the same weight vectors at the same index.
- Salo's share-bid scale: whole numbers 5 to 40. Central greedy's transport penalty: uniform on [0, 0.02) per minute.
- Setting 0 is the untuned starting setting (weights 0.40 / 0.30 / 0.15 / 0.15; scale 17; penalty 0.005 per minute).
- Driver reliability starts from the dataset tuning counts on every evening (no carry-over). The 40-share budget and every other engine rule are unchanged.

## Chosen settings

| Policy | Chosen setting (index) | Weights (need / storage / distance / freshness) | Knob | Mean food rescued (kg/evening) | Mean worst-served need met | Feasible (>= 0.5) | Feasible settings of 401 |
|---|---|---|---|---|---|---|---|
| Agents (Salo) | 181 | 0.62 / 0.08 / 0.11 / 0.19 | scale 12 | 153.30 | 0.151 | no | 0 |
| Central greedy | 365 | 0.51 / 0.03 / 0.12 / 0.34 | penalty 0.00424 per min | 154.71 | 0.166 | no | 0 |

Fairness-check count (tuning evenings with worst-served need met = 0 for the chosen setting): Salo 4 of 10, central greedy 3 of 10.

## Top 10 settings per policy (select order; rank 1 is the chosen one)

### Agents (Salo)

| Rank | Index | Weights (need / storage / distance / freshness) | Knob | Food (kg/evening) | Worst-served need met | Feasible |
|---|---|---|---|---|---|---|
| 1 | 181 | 0.62 / 0.08 / 0.11 / 0.19 | scale 12 | 153.30 | 0.151 | no |
| 2 | 71 | 0.64 / 0.08 / 0.11 / 0.17 | scale 5 | 153.06 | 0.151 | no |
| 3 | 281 | 0.52 / 0.01 / 0.07 / 0.39 | scale 21 | 145.99 | 0.141 | no |
| 4 | 199 | 0.41 / 0.11 / 0.03 / 0.45 | scale 25 | 139.22 | 0.134 | no |
| 5 | 58 | 0.47 / 0.00 / 0.16 / 0.36 | scale 10 | 152.28 | 0.131 | no |
| 6 | 217 | 0.72 / 0.05 / 0.08 / 0.15 | scale 19 | 149.43 | 0.130 | no |
| 7 | 301 | 0.20 / 0.01 / 0.18 / 0.61 | scale 26 | 138.67 | 0.129 | no |
| 8 | 262 | 0.76 / 0.02 / 0.10 / 0.12 | scale 12 | 151.95 | 0.128 | no |
| 9 | 141 | 0.71 / 0.01 / 0.02 / 0.26 | scale 10 | 151.12 | 0.127 | no |
| 10 | 333 | 0.53 / 0.05 / 0.25 / 0.17 | scale 14 | 148.78 | 0.127 | no |

### Central greedy

| Rank | Index | Weights (need / storage / distance / freshness) | Knob | Food (kg/evening) | Worst-served need met | Feasible |
|---|---|---|---|---|---|---|
| 1 | 365 | 0.51 / 0.03 / 0.12 / 0.34 | penalty 0.00424 per min | 154.71 | 0.166 | no |
| 2 | 281 | 0.52 / 0.01 / 0.07 / 0.39 | penalty 0.01077 per min | 154.51 | 0.161 | no |
| 3 | 90 | 0.44 / 0.06 / 0.07 / 0.43 | penalty 0.00686 per min | 155.91 | 0.156 | no |
| 4 | 349 | 0.68 / 0.07 / 0.01 / 0.25 | penalty 0.00505 per min | 152.51 | 0.154 | no |
| 5 | 11 | 0.66 / 0.04 / 0.05 / 0.26 | penalty 0.00693 per min | 153.44 | 0.154 | no |
| 6 | 181 | 0.62 / 0.08 / 0.11 / 0.19 | penalty 0.01470 per min | 154.87 | 0.151 | no |
| 7 | 153 | 0.73 / 0.09 / 0.13 / 0.05 | penalty 0.01703 per min | 152.64 | 0.151 | no |
| 8 | 332 | 0.52 / 0.02 / 0.17 / 0.29 | penalty 0.01426 per min | 153.06 | 0.150 | no |
| 9 | 217 | 0.72 / 0.05 / 0.08 / 0.15 | penalty 0.01053 per min | 152.55 | 0.145 | no |
| 10 | 236 | 0.57 / 0.05 / 0.01 / 0.37 | penalty 0.00621 per min | 151.03 | 0.142 | no |

## Per-evening table: Agents (Salo), chosen setting (tuning, in-sample)

| Evening | Food rescued (kg) | Worst-served need met | Pantries left with 0 kg | Stranded awards | Food ceiling hit |
|---|---|---|---|---|---|
| E01 | 144.30 | 0.121 | 0 of 28 | 1 | no |
| E02 | 157.12 | 0.278 | 0 of 26 | 1 | no |
| E03 | 186.06 | 0.125 | 0 of 26 | 2 | no |
| E04 | 118.72 | 0.323 | 0 of 23 | 0 | no |
| E05 | 140.60 | 0.000 | 1 of 29 | 0 | no |
| E06 | 143.24 | 0.000 | 1 of 26 | 0 | no |
| E07 | 158.22 | 0.360 | 0 of 25 | 0 | no |
| E08 | 145.14 | 0.000 | 2 of 27 | 0 | no |
| E09 | 175.56 | 0.298 | 0 of 26 | 0 | no |
| E10 | 164.03 | 0.000 | 1 of 27 | 2 | no |
| **Mean** | **153.30** | **0.151** | 0.50 avg | 0.60 avg | 0 of 10 |

"Pantries left with 0 kg": pantries with need above 0 that received no on-time food. Worst-served need met is 0 exactly when at least one such pantry got nothing.

## Per-evening table: central greedy, chosen setting (tuning, in-sample)

| Evening | Food rescued (kg) | Worst-served need met | Pantries left with 0 kg | Stranded awards | Food ceiling hit |
|---|---|---|---|---|---|
| E01 | 150.28 | 0.221 | 0 of 28 | 1 | no |
| E02 | 156.29 | 0.167 | 0 of 26 | 0 | no |
| E03 | 190.06 | 0.161 | 0 of 26 | 0 | no |
| E04 | 118.54 | 0.345 | 0 of 23 | 1 | no |
| E05 | 145.45 | 0.133 | 0 of 29 | 0 | no |
| E06 | 137.96 | 0.000 | 1 of 26 | 1 | no |
| E07 | 167.62 | 0.306 | 0 of 25 | 2 | no |
| E08 | 138.09 | 0.000 | 1 of 27 | 0 | no |
| E09 | 177.60 | 0.328 | 0 of 26 | 0 | no |
| E10 | 165.21 | 0.000 | 1 of 27 | 1 | no |
| **Mean** | **154.71** | **0.166** | 0.30 avg | 0.60 avg | 0 of 10 |

## Per-evening table: first come, first served and nearest pantry, untuned (tuning, in-sample)

These two have no setting to tune, so they run once with the untuned parameters. Shown for the ceiling-frequency report.

### First come, first served (fcfs)

| Evening | Food rescued (kg) | Worst-served need met | Pantries left with 0 kg | Stranded awards | Food ceiling hit |
|---|---|---|---|---|---|
| E01 | 124.48 | 0.000 | 5 of 28 | 1 | no |
| E02 | 131.12 | 0.000 | 5 of 26 | 2 | no |
| E03 | 176.55 | 0.000 | 5 of 26 | 0 | no |
| E04 | 102.07 | 0.000 | 4 of 23 | 1 | no |
| E05 | 114.82 | 0.000 | 10 of 29 | 1 | no |
| E06 | 125.57 | 0.000 | 9 of 26 | 0 | no |
| E07 | 137.82 | 0.000 | 4 of 25 | 1 | no |
| E08 | 112.88 | 0.000 | 9 of 27 | 0 | no |
| E09 | 161.94 | 0.000 | 4 of 26 | 1 | no |
| E10 | 146.13 | 0.000 | 5 of 27 | 1 | no |
| **Mean** | **133.34** | **0.000** | 6.00 avg | 0.80 avg | 0 of 10 |

### Nearest pantry

| Evening | Food rescued (kg) | Worst-served need met | Pantries left with 0 kg | Stranded awards | Food ceiling hit |
|---|---|---|---|---|---|
| E01 | 136.76 | 0.000 | 7 of 28 | 1 | no |
| E02 | 139.63 | 0.000 | 6 of 26 | 3 | no |
| E03 | 190.09 | 0.000 | 5 of 26 | 0 | no |
| E04 | 114.35 | 0.000 | 3 of 23 | 0 | no |
| E05 | 130.75 | 0.000 | 11 of 29 | 0 | no |
| E06 | 133.17 | 0.000 | 8 of 26 | 0 | no |
| E07 | 149.54 | 0.000 | 3 of 25 | 0 | no |
| E08 | 119.08 | 0.000 | 7 of 27 | 0 | no |
| E09 | 159.66 | 0.000 | 7 of 26 | 1 | no |
| E10 | 160.81 | 0.000 | 5 of 27 | 0 | no |
| **Mean** | **143.38** | **0.000** | 6.20 avg | 0.50 avg | 0 of 10 |

## Food ceiling frequency (tuning, in-sample; ceiling = total need fully met, an assumption from decisions.md)

| Policy | Evenings at the ceiling (of 10) | Setting |
|---|---|---|
| Agents (Salo) | 0 | tuned, index 181 |
| Central greedy | 0 | tuned, index 365 |
| First come, first served | 0 | untuned |
| Nearest pantry | 0 | untuned |

## Fairness check (decisions.md, "M6 tuning and pilot"; rule: 6 or more of 10 zero means STOP)

Tuned Salo's worst-served need met is 0 on 4 of 10 tuning evenings. Tuned central greedy: 3 of 10 (reported for comparison; the rule is about Salo).

**FAIRNESS CHECK: PASS**

## Settings file

All 401 settings per policy with both means, the feasibility flag and the chosen flag: `docs/reports/m6-tuning/settings.csv`. The chosen parameters: `docs/reports/m6-tuning/chosen-params.json`.
