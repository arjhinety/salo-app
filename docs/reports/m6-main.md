# Main results E21–E64: the four policies on 44 main_sample evenings

Main evenings E21–E64 (split main_sample, dataset v1.3). Written by the gated runner `src/tuning/__tests__/m6-main-run.test.ts` (M6_MAIN=1) on 2026-11-01. Frozen parameters sha256:5d0ef9b5bba3bbe441e1a646644bb55ef2413e3925eb94c7783678dfbc10d42e, the settings in `src/engine/frozenParams.ts`. Learning on (the engine default) for every main number. Paired percentile bootstrap on the difference, evening by evening: 10,000 resamples, seed 20260927. The main intervals are 97.5%, the supporting ones 95% (guide p.19). Simulated data.

## 1. The two main results (97.5%)

Verdict, from the pre-registered rule (RES-04, guide p.16): **No clear difference**

Verdict line as shown on the screen: No clear difference: food rescued [−2.78, +1.79] kg per evening; worst-served need met [−0.03, +0.05].

| Main result (Salo minus central greedy) | Mean per evening | 97.5% interval | Reading |
|---|---|---|---|
| Food rescued (kg per evening) | −0.44 | [−2.78, +1.79] | No clear difference |
| Need met, worst-served pantry (fraction) | +0.014 | [−0.026, +0.053] | No clear difference |

Evenings used: 44 for food rescued and 44 for need met (all main_sample).

**Fairness-gap limitation (Arjhine, decisions.md M6):** a real difference smaller than 0.10 (for example 0.15 vs 0.20) is treated as not worth caring about, so the main run is not sized to detect it. The fairness gap was fixed before the pilot and was not changed after it.

**The tuned fairness floor was not reached.** On the tuning evenings E01–E10, worst-served need met was 0.151 for Salo and 0.166 for central greedy, against the 0.5 target (decisions.md, M6 tuning). This report does not change that.

## 2. Width check (Arjhine: each main 97.5% interval must be narrower than its gap)

| Main result | 97.5% interval | Full width | Gap | Width below gap? |
|---|---|---|---|---|
| Food rescued | [−2.78, +1.79] kg | 4.57 kg | 6 kg | YES |
| Need met, worst-served | [−0.026, +0.053] | 0.079 | 0.10 | YES |

Food rescued: the full 97.5% width is 4.57 kg, below the 6 kg gap.
Fairness: the full 97.5% width is 0.079, below the 0.10 gap.

## 2a. Supporting note, post hoc (added 2026-11-01; not pre-registered)

**Supporting reading only, not pre-registered as an equivalence test.** The verdict above stays "No clear difference". Both 97.5% intervals lie entirely inside plus or minus the smallest difference worth caring about: food rescued [−2.78, +1.79] kg lies inside ±6 kg, and worst-served need met [−0.026, +0.053] lies inside ±0.10. So a difference as large as the smallest one worth caring about is unlikely in either direction, at the confidence the main intervals were built for. This reading was added after the main numbers were seen, and no method or number was changed for it. The fairness limitation in section 1 still applies: 0.10 is about two-thirds of the tuned worst-served level (about 0.15), so smaller real fairness differences are not ruled out.

## 3. Supporting comparisons (95%): supporting only, never a win on their own

| Measure | Baseline | Mean (Salo minus baseline) | 95% interval | Reading |
|---|---|---|---|---|
| Food rescued (kg per evening) | First come, first served | +17.93 | [+15.27, +20.66] | Salo better |
| Food rescued (kg per evening) | Nearest pantry | +11.78 | [+9.07, +14.44] | Salo better |
| Food wasted (kg per evening) | First come, first served | −17.93 | [−20.66, −15.27] | Salo better |
| Food wasted (kg per evening) | Nearest pantry | −11.78 | [−14.44, −9.07] | Salo better |
| Food wasted (kg per evening) | Central greedy | +0.44 | [−1.50, +2.46] | No clear difference |
| Need met, worst-served pantry (fraction) | First come, first served | +0.090 | [+0.058, +0.124] | Salo better |
| Need met, worst-served pantry (fraction) | Nearest pantry | +0.090 | [+0.058, +0.124] | Salo better |
| Stranded awards (per evening) | First come, first served | −0.07 | [−0.41, +0.25] | No clear difference |
| Stranded awards (per evening) | Nearest pantry | +0.07 | [−0.23, +0.36] | No clear difference |
| Stranded awards (per evening) | Central greedy | −0.20 | [−0.50, +0.09] | No clear difference |

**Food wasted mirrors food rescued.** The same kg is posted under every policy, so food wasted equals posted kg minus food rescued. Each food-wasted interval is the exact mirror of the food-rescued interval at the same level (same resamples, sign reversed; checked in src/results/__tests__/persisted.test.ts). The food-rescued comparison against central greedy is the main result at 97.5%, so its 95% mirror is not in this table. The food-wasted rows are not independent support.

## 4. Supporting: learning off (95%, supporting evidence only, guide p.15)

Each policy on the same evenings with every driver's estimate fixed at 0.50 (learning off), compared with learning on, food rescued per evening.

| Policy | Evenings | Mean (on minus off, kg) | 95% interval | Reading |
|---|---|---|---|---|
| Agents (Salo) | 44 | −0.10 | [−0.92, +0.68] | No clear difference |
| Central greedy | 44 | +0.39 | [−0.89, +1.65] | No clear difference |
| First come, first served | 44 | +0.39 | [−0.47, +1.26] | No clear difference |
| Nearest pantry | 44 | +1.32 | [+0.57, +2.19] | learning helps |

## 5. Supporting: evenings that reached the food ceiling

Assumption (decisions.md, Results screen defaults): the ceiling is reached when every pantry with need is fully met, so food rescued equals total need. The guide does not define it.

| Policy | Evenings at the food ceiling |
|---|---|
| Agents (Salo) | 0 of 44 evenings |
| Central greedy | 0 of 44 evenings |
| First come, first served | 0 of 44 evenings |
| Nearest pantry | 0 of 44 evenings |

**Read the ceiling counts with the supply in mind.** Posted food is below total need on every main evening: the ratio of posted kg to need kg runs from 0.60 to 0.88 across E21–E64 (44 of 44 evenings below 1.00). Under the assumption above, the ceiling cannot be reached on any of these evenings, so the zero counts follow from the definition, not from the policies. A second definition (all posted food rescued) is in section 7.

## 6. Per-evening tables (main_sample, E21–E64)

### Agents (Salo)

| Evening | Food rescued (kg) | Food wasted (kg) | Worst-served need met | Stranded awards | Food ceiling hit (first definition) |
|---|---|---|---|---|---|
| E21 | 132.78 | 9.83 | 0.000 | 1 | no |
| E22 | 180.38 | 29.84 | 0.120 | 0 | no |
| E23 | 155.13 | 6.00 | 0.206 | 1 | no |
| E24 | 160.42 | 13.20 | 0.279 | 1 | no |
| E25 | 144.11 | 15.93 | 0.264 | 0 | no |
| E26 | 134.80 | 19.40 | 0.000 | 1 | no |
| E27 | 117.08 | 11.60 | 0.129 | 0 | no |
| E28 | 146.92 | 41.69 | 0.000 | 0 | no |
| E29 | 187.76 | 23.32 | 0.075 | 0 | no |
| E30 | 153.84 | 8.64 | 0.250 | 0 | no |
| E31 | 190.07 | 23.86 | 0.150 | 0 | no |
| E32 | 103.41 | 19.06 | 0.000 | 1 | no |
| E33 | 177.63 | 25.18 | 0.000 | 1 | no |
| E34 | 117.61 | 29.55 | 0.118 | 1 | no |
| E35 | 176.38 | 39.40 | 0.105 | 1 | no |
| E36 | 141.11 | 16.46 | 0.000 | 0 | no |
| E37 | 161.57 | 27.73 | 0.081 | 2 | no |
| E38 | 175.91 | 32.91 | 0.000 | 1 | no |
| E39 | 114.58 | 20.99 | 0.000 | 0 | no |
| E40 | 150.92 | 18.95 | 0.000 | 1 | no |
| E41 | 148.81 | 30.55 | 0.276 | 0 | no |
| E42 | 138.04 | 18.02 | 0.000 | 0 | no |
| E43 | 138.60 | 14.92 | 0.000 | 0 | no |
| E44 | 120.83 | 27.06 | 0.000 | 2 | no |
| E45 | 144.90 | 10.83 | 0.000 | 1 | no |
| E46 | 117.17 | 19.80 | 0.172 | 0 | no |
| E47 | 136.95 | 13.62 | 0.000 | 1 | no |
| E48 | 139.41 | 9.48 | 0.142 | 1 | no |
| E49 | 112.02 | 26.38 | 0.000 | 2 | no |
| E50 | 172.97 | 29.71 | 0.203 | 2 | no |
| E51 | 136.61 | 25.62 | 0.000 | 1 | no |
| E52 | 177.99 | 12.02 | 0.000 | 0 | no |
| E53 | 92.95 | 15.72 | 0.157 | 0 | no |
| E54 | 152.08 | 12.23 | 0.351 | 0 | no |
| E55 | 167.02 | 21.59 | 0.400 | 0 | no |
| E56 | 145.08 | 23.82 | 0.000 | 1 | no |
| E57 | 148.76 | 4.52 | 0.000 | 0 | no |
| E58 | 137.69 | 13.51 | 0.000 | 0 | no |
| E59 | 168.62 | 14.80 | 0.000 | 2 | no |
| E60 | 110.16 | 15.95 | 0.000 | 0 | no |
| E61 | 139.77 | 20.60 | 0.162 | 0 | no |
| E62 | 130.66 | 25.28 | 0.145 | 1 | no |
| E63 | 153.30 | 20.36 | 0.000 | 0 | no |
| E64 | 184.46 | 26.49 | 0.175 | 0 | no |

### Central greedy

| Evening | Food rescued (kg) | Food wasted (kg) | Worst-served need met | Stranded awards | Food ceiling hit (first definition) |
|---|---|---|---|---|---|
| E21 | 139.49 | 3.12 | 0.162 | 0 | no |
| E22 | 181.50 | 28.72 | 0.141 | 0 | no |
| E23 | 159.83 | 1.30 | 0.000 | 0 | no |
| E24 | 151.52 | 22.10 | 0.000 | 1 | no |
| E25 | 144.23 | 15.81 | 0.372 | 1 | no |
| E26 | 141.38 | 12.82 | 0.000 | 0 | no |
| E27 | 115.18 | 13.50 | 0.129 | 0 | no |
| E28 | 157.22 | 31.39 | 0.000 | 0 | no |
| E29 | 200.75 | 10.33 | 0.323 | 0 | no |
| E30 | 152.28 | 10.20 | 0.085 | 1 | no |
| E31 | 180.52 | 33.41 | 0.213 | 0 | no |
| E32 | 105.31 | 17.16 | 0.000 | 1 | no |
| E33 | 181.47 | 21.34 | 0.075 | 0 | no |
| E34 | 124.01 | 23.15 | 0.000 | 1 | no |
| E35 | 171.90 | 43.88 | 0.000 | 0 | no |
| E36 | 139.83 | 17.74 | 0.000 | 0 | no |
| E37 | 155.96 | 33.34 | 0.000 | 3 | no |
| E38 | 169.87 | 38.95 | 0.000 | 4 | no |
| E39 | 109.09 | 26.48 | 0.000 | 1 | no |
| E40 | 144.92 | 24.95 | 0.000 | 2 | no |
| E41 | 159.84 | 19.52 | 0.089 | 0 | no |
| E42 | 134.02 | 22.04 | 0.000 | 1 | no |
| E43 | 144.44 | 9.08 | 0.000 | 1 | no |
| E44 | 132.93 | 14.96 | 0.000 | 1 | no |
| E45 | 146.29 | 9.44 | 0.251 | 0 | no |
| E46 | 119.80 | 17.17 | 0.141 | 0 | no |
| E47 | 134.19 | 16.38 | 0.157 | 1 | no |
| E48 | 135.19 | 13.70 | 0.213 | 1 | no |
| E49 | 125.00 | 13.40 | 0.000 | 0 | no |
| E50 | 188.30 | 14.38 | 0.148 | 0 | no |
| E51 | 144.41 | 17.82 | 0.169 | 1 | no |
| E52 | 169.51 | 20.50 | 0.000 | 1 | no |
| E53 | 92.50 | 16.17 | 0.000 | 1 | no |
| E54 | 147.87 | 16.44 | 0.162 | 0 | no |
| E55 | 165.79 | 22.82 | 0.281 | 1 | no |
| E56 | 135.96 | 32.94 | 0.000 | 3 | no |
| E57 | 138.98 | 14.30 | 0.000 | 0 | no |
| E58 | 129.93 | 21.27 | 0.000 | 0 | no |
| E59 | 167.29 | 16.13 | 0.141 | 2 | no |
| E60 | 108.16 | 17.95 | 0.000 | 1 | no |
| E61 | 132.87 | 27.50 | 0.000 | 1 | no |
| E62 | 134.28 | 21.66 | 0.000 | 1 | no |
| E63 | 152.53 | 21.13 | 0.000 | 2 | no |
| E64 | 190.31 | 20.64 | 0.109 | 1 | no |

### First come, first served

| Evening | Food rescued (kg) | Food wasted (kg) | Worst-served need met | Stranded awards | Food ceiling hit (first definition) |
|---|---|---|---|---|---|
| E21 | 108.06 | 34.55 | 0.000 | 0 | no |
| E22 | 148.57 | 61.65 | 0.000 | 0 | no |
| E23 | 126.00 | 35.13 | 0.000 | 2 | no |
| E24 | 143.86 | 29.76 | 0.000 | 1 | no |
| E25 | 114.07 | 45.97 | 0.000 | 0 | no |
| E26 | 127.91 | 26.29 | 0.000 | 0 | no |
| E27 | 105.64 | 23.04 | 0.000 | 0 | no |
| E28 | 142.87 | 45.74 | 0.000 | 2 | no |
| E29 | 167.40 | 43.68 | 0.000 | 0 | no |
| E30 | 127.89 | 34.59 | 0.000 | 0 | no |
| E31 | 155.88 | 58.05 | 0.000 | 1 | no |
| E32 | 95.88 | 26.59 | 0.000 | 1 | no |
| E33 | 151.99 | 50.82 | 0.000 | 2 | no |
| E34 | 111.63 | 35.53 | 0.000 | 0 | no |
| E35 | 170.60 | 45.18 | 0.000 | 0 | no |
| E36 | 122.14 | 35.43 | 0.000 | 1 | no |
| E37 | 136.90 | 52.40 | 0.000 | 0 | no |
| E38 | 152.64 | 56.18 | 0.000 | 1 | no |
| E39 | 103.47 | 32.10 | 0.000 | 1 | no |
| E40 | 133.43 | 36.44 | 0.000 | 0 | no |
| E41 | 129.10 | 50.26 | 0.000 | 1 | no |
| E42 | 115.55 | 40.51 | 0.000 | 1 | no |
| E43 | 119.18 | 34.34 | 0.000 | 0 | no |
| E44 | 114.65 | 33.24 | 0.000 | 1 | no |
| E45 | 125.83 | 29.90 | 0.000 | 1 | no |
| E46 | 96.78 | 40.19 | 0.000 | 0 | no |
| E47 | 119.57 | 31.00 | 0.000 | 0 | no |
| E48 | 111.12 | 37.77 | 0.000 | 0 | no |
| E49 | 105.21 | 33.19 | 0.000 | 0 | no |
| E50 | 158.95 | 43.73 | 0.000 | 0 | no |
| E51 | 124.74 | 37.49 | 0.000 | 0 | no |
| E52 | 143.19 | 46.82 | 0.000 | 1 | no |
| E53 | 85.18 | 23.49 | 0.000 | 1 | no |
| E54 | 125.77 | 38.54 | 0.000 | 1 | no |
| E55 | 160.38 | 28.23 | 0.000 | 1 | no |
| E56 | 127.20 | 41.70 | 0.000 | 1 | no |
| E57 | 111.10 | 42.18 | 0.000 | 0 | no |
| E58 | 121.82 | 29.38 | 0.000 | 0 | no |
| E59 | 152.65 | 30.77 | 0.000 | 2 | no |
| E60 | 88.67 | 37.44 | 0.000 | 3 | no |
| E61 | 138.38 | 21.99 | 0.000 | 0 | no |
| E62 | 114.58 | 41.36 | 0.000 | 0 | no |
| E63 | 136.19 | 37.47 | 0.000 | 3 | no |
| E64 | 175.82 | 35.13 | 0.000 | 0 | no |

### Nearest pantry

| Evening | Food rescued (kg) | Food wasted (kg) | Worst-served need met | Stranded awards | Food ceiling hit (first definition) |
|---|---|---|---|---|---|
| E21 | 115.16 | 27.45 | 0.000 | 1 | no |
| E22 | 156.93 | 53.29 | 0.000 | 0 | no |
| E23 | 131.54 | 29.59 | 0.000 | 0 | no |
| E24 | 149.72 | 23.90 | 0.000 | 0 | no |
| E25 | 127.95 | 32.09 | 0.000 | 0 | no |
| E26 | 124.19 | 30.01 | 0.000 | 0 | no |
| E27 | 106.53 | 22.15 | 0.000 | 1 | no |
| E28 | 142.23 | 46.38 | 0.000 | 0 | no |
| E29 | 179.50 | 31.58 | 0.000 | 0 | no |
| E30 | 138.84 | 23.64 | 0.000 | 0 | no |
| E31 | 166.91 | 47.02 | 0.000 | 1 | no |
| E32 | 97.98 | 24.49 | 0.000 | 1 | no |
| E33 | 175.24 | 27.57 | 0.000 | 1 | no |
| E34 | 128.15 | 19.01 | 0.000 | 0 | no |
| E35 | 162.24 | 53.54 | 0.000 | 0 | no |
| E36 | 128.93 | 28.64 | 0.000 | 1 | no |
| E37 | 145.32 | 43.98 | 0.000 | 2 | no |
| E38 | 159.48 | 49.34 | 0.000 | 1 | no |
| E39 | 108.49 | 27.08 | 0.000 | 0 | no |
| E40 | 142.45 | 27.42 | 0.000 | 0 | no |
| E41 | 140.87 | 38.49 | 0.000 | 0 | no |
| E42 | 124.06 | 32.00 | 0.000 | 3 | no |
| E43 | 135.10 | 18.42 | 0.000 | 0 | no |
| E44 | 116.81 | 31.08 | 0.000 | 0 | no |
| E45 | 138.90 | 16.83 | 0.000 | 1 | no |
| E46 | 104.35 | 32.62 | 0.000 | 0 | no |
| E47 | 123.58 | 26.99 | 0.000 | 1 | no |
| E48 | 114.95 | 33.94 | 0.000 | 0 | no |
| E49 | 111.34 | 27.06 | 0.000 | 0 | no |
| E50 | 159.95 | 42.73 | 0.000 | 1 | no |
| E51 | 145.27 | 16.96 | 0.000 | 0 | no |
| E52 | 145.55 | 44.46 | 0.000 | 2 | no |
| E53 | 82.90 | 25.77 | 0.000 | 0 | no |
| E54 | 122.58 | 41.73 | 0.000 | 2 | no |
| E55 | 143.62 | 44.99 | 0.000 | 1 | no |
| E56 | 125.12 | 43.78 | 0.000 | 1 | no |
| E57 | 125.10 | 28.18 | 0.000 | 0 | no |
| E58 | 120.74 | 30.46 | 0.000 | 0 | no |
| E59 | 171.24 | 12.18 | 0.000 | 0 | no |
| E60 | 110.64 | 15.47 | 0.000 | 0 | no |
| E61 | 129.64 | 30.73 | 0.000 | 1 | no |
| E62 | 114.80 | 41.14 | 0.000 | 1 | no |
| E63 | 141.86 | 31.80 | 0.000 | 0 | no |
| E64 | 182.02 | 28.93 | 0.000 | 0 | no |

### Differences d (Salo minus central greedy), evening by evening

| Evening | Salo food (kg) | Central greedy food (kg) | d food (kg) | Salo worst-served | Central greedy worst-served | d need met |
|---|---|---|---|---|---|---|
| E21 | 132.78 | 139.49 | −6.71 | 0.000 | 0.162 | −0.162 |
| E22 | 180.38 | 181.50 | −1.12 | 0.120 | 0.141 | −0.021 |
| E23 | 155.13 | 159.83 | −4.70 | 0.206 | 0.000 | +0.206 |
| E24 | 160.42 | 151.52 | +8.90 | 0.279 | 0.000 | +0.279 |
| E25 | 144.11 | 144.23 | −0.12 | 0.264 | 0.372 | −0.108 |
| E26 | 134.80 | 141.38 | −6.58 | 0.000 | 0.000 | +0.000 |
| E27 | 117.08 | 115.18 | +1.90 | 0.129 | 0.129 | +0.000 |
| E28 | 146.92 | 157.22 | −10.30 | 0.000 | 0.000 | +0.000 |
| E29 | 187.76 | 200.75 | −12.99 | 0.075 | 0.323 | −0.248 |
| E30 | 153.84 | 152.28 | +1.56 | 0.250 | 0.085 | +0.165 |
| E31 | 190.07 | 180.52 | +9.55 | 0.150 | 0.213 | −0.063 |
| E32 | 103.41 | 105.31 | −1.90 | 0.000 | 0.000 | +0.000 |
| E33 | 177.63 | 181.47 | −3.84 | 0.000 | 0.075 | −0.075 |
| E34 | 117.61 | 124.01 | −6.40 | 0.118 | 0.000 | +0.118 |
| E35 | 176.38 | 171.90 | +4.48 | 0.105 | 0.000 | +0.105 |
| E36 | 141.11 | 139.83 | +1.28 | 0.000 | 0.000 | +0.000 |
| E37 | 161.57 | 155.96 | +5.61 | 0.081 | 0.000 | +0.081 |
| E38 | 175.91 | 169.87 | +6.04 | 0.000 | 0.000 | +0.000 |
| E39 | 114.58 | 109.09 | +5.49 | 0.000 | 0.000 | +0.000 |
| E40 | 150.92 | 144.92 | +6.00 | 0.000 | 0.000 | +0.000 |
| E41 | 148.81 | 159.84 | −11.03 | 0.276 | 0.089 | +0.187 |
| E42 | 138.04 | 134.02 | +4.02 | 0.000 | 0.000 | +0.000 |
| E43 | 138.60 | 144.44 | −5.84 | 0.000 | 0.000 | +0.000 |
| E44 | 120.83 | 132.93 | −12.10 | 0.000 | 0.000 | +0.000 |
| E45 | 144.90 | 146.29 | −1.39 | 0.000 | 0.251 | −0.251 |
| E46 | 117.17 | 119.80 | −2.63 | 0.172 | 0.141 | +0.031 |
| E47 | 136.95 | 134.19 | +2.76 | 0.000 | 0.157 | −0.157 |
| E48 | 139.41 | 135.19 | +4.22 | 0.142 | 0.213 | −0.071 |
| E49 | 112.02 | 125.00 | −12.98 | 0.000 | 0.000 | +0.000 |
| E50 | 172.97 | 188.30 | −15.33 | 0.203 | 0.148 | +0.055 |
| E51 | 136.61 | 144.41 | −7.80 | 0.000 | 0.169 | −0.169 |
| E52 | 177.99 | 169.51 | +8.48 | 0.000 | 0.000 | +0.000 |
| E53 | 92.95 | 92.50 | +0.45 | 0.157 | 0.000 | +0.157 |
| E54 | 152.08 | 147.87 | +4.21 | 0.351 | 0.162 | +0.189 |
| E55 | 167.02 | 165.79 | +1.23 | 0.400 | 0.281 | +0.119 |
| E56 | 145.08 | 135.96 | +9.12 | 0.000 | 0.000 | +0.000 |
| E57 | 148.76 | 138.98 | +9.78 | 0.000 | 0.000 | +0.000 |
| E58 | 137.69 | 129.93 | +7.76 | 0.000 | 0.000 | +0.000 |
| E59 | 168.62 | 167.29 | +1.33 | 0.000 | 0.141 | −0.141 |
| E60 | 110.16 | 108.16 | +2.00 | 0.000 | 0.000 | +0.000 |
| E61 | 139.77 | 132.87 | +6.90 | 0.162 | 0.000 | +0.162 |
| E62 | 130.66 | 134.28 | −3.62 | 0.145 | 0.000 | +0.145 |
| E63 | 153.30 | 152.53 | +0.77 | 0.000 | 0.000 | +0.000 |
| E64 | 184.46 | 190.31 | −5.85 | 0.175 | 0.109 | +0.067 |

## Checks and limits

- Dataset v1.3: bundled tables sha256 sha256:a5aab7a57dc438b02f1a7b0e6ce2db8771eb393486b3c98b58adb465167f833b; dataset repo manifest sha256:e183b81d595437d1d9c1f9e7f98ed6bdbb777ea8ab3ce7484bbfd941c023bc24.
- Main evenings: E21, E22, E23, E24, E25, E26, E27, E28, E29, E30, E31, E32, E33, E34, E35, E36, E37, E38, E39, E40, E41, E42, E43, E44, E45, E46, E47, E48, E49, E50, E51, E52, E53, E54, E55, E56, E57, E58, E59, E60, E61, E62, E63, E64 (44 recorded).
- Runtime of the gated run: 19.3 s (four policies, learning on and off, sequential).
- Food ceiling: the assumption in section 5 and the second definition in section 7.
- No pilot or tuning evening appears in this report. The tuning and pilot numbers are not results.
- The numbers are simulated (Salo Evening Dataset). They say nothing about real pantries.
## 7. Food ceiling under two definitions (supporting diagnostic, added 2026-11-01)

The first definition (section 5) cannot be reached on these evenings: posted food is below total need. The guide (p.13) asks how often each method reaches the ceiling, and that is where capped food rescued cannot rise further. The second definition therefore asks whether all posted food was rescued that evening: food rescued equals total posted kg within 0.001 kg. It is a supporting diagnostic only. The main result (section 1) does not depend on it.

| Group | Evenings | Posted kg over need kg | Agents (Salo), first | Central greedy, first | First come, first served, first | Nearest pantry, first | Agents (Salo), second | Central greedy, second | First come, first served, second | Nearest pantry, second |
|---|---|---|---|---|---|---|---|---|---|---|
| Tuning E01–E10 (in-sample) | 10 | 0.65 to 0.84 | 0 of 10 evenings | 0 of 10 evenings | 0 of 10 evenings | 0 of 10 evenings | 0 of 10 evenings | 0 of 10 evenings | 0 of 10 evenings | 0 of 10 evenings |
| Pilot E11–E20 | 10 | 0.63 to 0.85 | 0 of 10 evenings | 0 of 10 evenings | 0 of 10 evenings | 0 of 10 evenings | 0 of 10 evenings | 0 of 10 evenings | 0 of 10 evenings | 0 of 10 evenings |
| Main E21–E64 | 44 | 0.60 to 0.88 | 0 of 44 evenings | 0 of 44 evenings | 0 of 44 evenings | 0 of 44 evenings | 0 of 44 evenings | 0 of 44 evenings | 0 of 44 evenings | 0 of 44 evenings |

Closest approach on main E21–E64, the smallest food wasted in kg on any evening (at most 0.001 kg means the ceiling was hit): Agents (Salo) 4.52 kg, Central greedy 1.30 kg, First come, first served 21.99 kg, Nearest pantry 12.18 kg.

No evening in any group reaches either definition, for any policy.

Counts are per policy, frozen parameters, learning on. Tuning (E01–E10) and pilot (E11–E20) evenings appear here only as ceiling counts, which the guide (p.13) allows. Their other numbers are not results.
