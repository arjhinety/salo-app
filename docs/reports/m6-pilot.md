# Pilot evenings E11–E20: used only to set the main-evening count; not a result, never reported as one.

Written by the gated runner `src/tuning/__tests__/m6-pilot-run.test.ts` (M6_PILOT=1) on 2026-11-01. Evenings E11–E20 only (split `pilot`, asserted). Frozen parameters `sha256:5d0ef9b5bba3bbe441e1a646644bb55ef2413e3925eb94c7783678dfbc10d42e`, the settings in `src/engine/frozenParams.ts`. Learning on, the engine default. All four policies, the same evenings.

**No bootstrap interval and no verdict is computed or shown for the pilot.** The main results come only from the main run (guide p.19).

## Method

- d = Salo minus central greedy, evening by evening: food rescued (kg) and worst-served need met.
- Each evening starts from the dataset's frozen tuning reliability counts, so nothing learned in one evening carries into the next (guide p.15).
- Food ceiling (assumption, decisions.md): total need fully met on the evening. The ceiling is reached when every pantry with need is fully served.
- Count rule (decisions.md, amended 2026-11-01): s_U = s × √(9 / χ²₀.₂₀,₉) with χ²₀.₂₀,₉ = 5.380053, so the factor is 1.29339 (= 1.2934). n = ceil((2 × 2.2414 × s_U / gap)²). Count = max(n_food, n_fair, 10).

## Per-evening results: Agents (Salo), frozen settings

| Evening | Food rescued (kg) | Worst-served need met | Food wasted (kg) | Stranded awards | Pantries left with 0 kg | Food ceiling hit |
|---|---|---|---|---|---|---|
| E11 | 150.36 | 0.000 | 32.57 | 2 | 3 of 30 | no |
| E12 | 147.26 | 0.000 | 22.23 | 1 | 1 of 27 | no |
| E13 | 140.37 | 0.000 | 21.30 | 0 | 2 of 29 | no |
| E14 | 167.17 | 0.000 | 25.83 | 0 | 1 of 26 | no |
| E15 | 155.35 | 0.059 | 22.61 | 1 | 0 of 28 | no |
| E16 | 123.35 | 0.092 | 19.90 | 0 | 0 of 23 | no |
| E17 | 194.72 | 0.187 | 34.54 | 1 | 0 of 26 | no |
| E18 | 111.19 | 0.135 | 12.90 | 0 | 0 of 22 | no |
| E19 | 120.15 | 0.082 | 15.45 | 0 | 0 of 24 | no |
| E20 | 114.69 | 0.000 | 32.06 | 2 | 3 of 25 | no |

## Per-evening results: central greedy, frozen settings

| Evening | Food rescued (kg) | Worst-served need met | Food wasted (kg) | Stranded awards | Pantries left with 0 kg | Food ceiling hit |
|---|---|---|---|---|---|---|
| E11 | 148.53 | 0.000 | 34.40 | 2 | 2 of 30 | no |
| E12 | 147.65 | 0.161 | 21.84 | 1 | 0 of 27 | no |
| E13 | 146.04 | 0.000 | 15.63 | 1 | 2 of 29 | no |
| E14 | 177.33 | 0.221 | 15.67 | 1 | 0 of 26 | no |
| E15 | 152.91 | 0.165 | 25.05 | 1 | 0 of 28 | no |
| E16 | 123.09 | 0.000 | 20.16 | 0 | 1 of 23 | no |
| E17 | 204.58 | 0.192 | 24.68 | 0 | 0 of 26 | no |
| E18 | 102.95 | 0.000 | 21.14 | 1 | 1 of 22 | no |
| E19 | 126.56 | 0.000 | 9.04 | 0 | 1 of 24 | no |
| E20 | 123.17 | 0.000 | 23.58 | 1 | 2 of 25 | no |

## Per-evening results: first come, first served

| Evening | Food rescued (kg) | Worst-served need met | Food wasted (kg) | Stranded awards | Pantries left with 0 kg | Food ceiling hit |
|---|---|---|---|---|---|---|
| E11 | 130.66 | 0.000 | 52.27 | 1 | 6 of 30 | no |
| E12 | 126.97 | 0.000 | 42.52 | 1 | 6 of 27 | no |
| E13 | 127.10 | 0.000 | 34.57 | 0 | 8 of 29 | no |
| E14 | 130.88 | 0.000 | 62.12 | 0 | 6 of 26 | no |
| E15 | 128.90 | 0.000 | 49.06 | 0 | 7 of 28 | no |
| E16 | 104.46 | 0.000 | 38.79 | 0 | 7 of 23 | no |
| E17 | 181.22 | 0.000 | 48.04 | 0 | 2 of 26 | no |
| E18 | 96.89 | 0.000 | 27.20 | 1 | 6 of 22 | no |
| E19 | 107.20 | 0.000 | 28.40 | 1 | 5 of 24 | no |
| E20 | 103.86 | 0.000 | 42.89 | 0 | 8 of 25 | no |

## Per-evening results: nearest pantry

| Evening | Food rescued (kg) | Worst-served need met | Food wasted (kg) | Stranded awards | Pantries left with 0 kg | Food ceiling hit |
|---|---|---|---|---|---|---|
| E11 | 130.46 | 0.000 | 52.47 | 1 | 8 of 30 | no |
| E12 | 135.91 | 0.000 | 33.58 | 0 | 7 of 27 | no |
| E13 | 129.35 | 0.000 | 32.32 | 0 | 9 of 29 | no |
| E14 | 153.65 | 0.000 | 39.35 | 1 | 3 of 26 | no |
| E15 | 144.71 | 0.000 | 33.25 | 0 | 5 of 28 | no |
| E16 | 104.57 | 0.000 | 38.68 | 0 | 6 of 23 | no |
| E17 | 190.84 | 0.000 | 38.42 | 0 | 2 of 26 | no |
| E18 | 94.52 | 0.000 | 29.57 | 2 | 7 of 22 | no |
| E19 | 115.23 | 0.000 | 20.37 | 0 | 7 of 24 | no |
| E20 | 119.23 | 0.000 | 27.52 | 1 | 8 of 25 | no |

## Differences d (Salo minus central greedy)

| Evening | Salo food (kg) | Central greedy food (kg) | d food (kg) | Salo worst-served | Central greedy worst-served | d fair |
|---|---|---|---|---|---|---|
| E11 | 150.36 | 148.53 | +1.83 | 0.000 | 0.000 | +0.000 |
| E12 | 147.26 | 147.65 | −0.39 | 0.000 | 0.161 | −0.161 |
| E13 | 140.37 | 146.04 | −5.67 | 0.000 | 0.000 | +0.000 |
| E14 | 167.17 | 177.33 | −10.16 | 0.000 | 0.221 | −0.221 |
| E15 | 155.35 | 152.91 | +2.44 | 0.059 | 0.165 | −0.107 |
| E16 | 123.35 | 123.09 | +0.26 | 0.092 | 0.000 | +0.092 |
| E17 | 194.72 | 204.58 | −9.86 | 0.187 | 0.192 | −0.005 |
| E18 | 111.19 | 102.95 | +8.24 | 0.135 | 0.000 | +0.135 |
| E19 | 120.15 | 126.56 | −6.41 | 0.082 | 0.000 | +0.082 |
| E20 | 114.69 | 123.17 | −8.48 | 0.000 | 0.000 | +0.000 |

## Spread, s_U and the count

### Food rescued (gap 6 kg)

- Gap (smallest worth caring about): 6 kg.
- Mean of the ten differences d: −2.82 kg.
- Sample SD s (n − 1 = 9): 6.1778 kg.
- s_U = 1.2934 × 6.1778 = 7.9903 kg.
- n = ceil((2 × 2.2414 × 7.9903 / 6)²) = ceil(35.6387) = **36** evenings.

### Worst-served need met (gap 0.10)

- Gap (smallest worth caring about): 0.10.
- Mean of the ten differences d: −0.019 of need met (fraction).
- Sample SD s (n − 1 = 9): 0.1136 of need met (fraction).
- s_U = 1.2934 × 0.1136 = 0.1469 of need met (fraction).
- n = ceil((2 × 2.2414 × 0.1469 / 0.1)²) = ceil(43.3549) = **44** evenings.

**Main-evening count = max(36, 44, 10) = 44.**

The count exceeds the 10 main evenings in dataset v1.2 → more main evenings must be generated (Arjhine's decision). Nothing was generated here.

## Food-ceiling frequency (pilot, 10 evenings per policy)

| Policy | Evenings at the food ceiling |
|---|---|
| Agents (Salo) | 0 of 10 |
| Central greedy | 0 of 10 |
| First come, first served | 0 of 10 |
| Nearest pantry | 0 of 10 |

## Next

- The count 44 is recorded in `src/results/registration.ts` with `pilotDone: true` before any main run.
- No main evening was run for this report. The main run is a separate step.
