# Handoff: mobile-architect, 2026-10-13

## What was done

1. Read the role file, `PRODUCT.md` (Stack), `guide/salo-guide.html` (all 21 pages), the dataset README, the 12 CSV headers and rows, `.impeccable/surfaces/mockup-salo-mockup-html.md`, `AGENTS.md`, `package.json`, `app.json`, `.gitignore`.
2. Wrote `src/engine/types.ts`: the engine vocabulary (IDs, dataset unions, donors, pantries, drivers, road legs, lots, evenings, the six message types plus the pantry and driver payloads, engine inputs, award states, events, log entries, the `AllocationPolicy` seam, frozen parameters, metrics, paired differences). No imports, no `any`.
3. Wrote `docs/architecture.md`: module layout and import rules (section 1), engine design (section 2), data bundling and budget (section 3), sync protocol (section 4), LLM proxy contract (section 5), state, navigation, language, theme, accessibility (section 6), testing with literal numbers (section 7), open decisions (section 8), source conflicts (section 9), decision register D-01 to D-28 (section 10), verification (section 11), next steps (section 12).
4. Checked dataset facts that the design depends on (section 11 of the doc).

## Files touched

- `src/engine/types.ts` (new)
- `docs/architecture.md` (new)
- `docs/handoffs/2026-10-13-mobile-architect.md` (new, this file)

Not touched: `docs/ledger.md` (orchestrator-owned), `package.json`, `package-lock.json`, `node_modules/`, `app.json`, `src/app/*`, anything in the dataset repo, anything in `guide/`. No commit, no push, no package installed.

## Commands run and real results

| Command | Result |
|---|---|
| `node_modules/.bin/tsc --noEmit` (before any change) | exit 0 |
| `node_modules/.bin/tsc --noEmit` (after writing `types.ts`) | exit 0 |
| `node_modules/.bin/tsc --noEmit --listFiles \| grep src/engine/types` | `src/engine/types.ts` is included |
| `node_modules/.bin/tsc --noEmit --showConfig \| grep strict` | `"strict": true` |
| `node_modules/.bin/tsc --noEmit` (after adding `tuningRuns`/`tuningShows` to `Driver`) | exit 0 |
| `grep` for `import`/`require`/`any` in `types.ts` | none found |
| Node check of `drivers.csv`: frozen estimate vs `round((shows+1)/(runs+2),2)` | 40 of 40 match, 0 mismatches |
| Node check: `tuning_shows` vs `completed` + `completed_late` in `driver_runs.csv` | 0 mismatches for 40 drivers |
| Node check: `tuning_runs` vs row count in `driver_runs.csv` | 0 mismatches for 40 drivers |
| Node check: OSM roads file | Overpass JSON, `elements` array, 1,431,242 bytes |
| Node check: `evenings.csv` splits | tuning 10, pilot 10, main_sample 10 |
| Node check: `pantries_open` | min 25, max 30 |
| Node check: `lots_posted` sum vs `food_offers.csv` rows | 1,436 and 1,436 |
| Node check: `drivers.csv` vehicle counts | motorcycle 29, car 4, bicycle 4, tricycle 3 |
| `grep` for stale page references in the doc | fixed (see below) |

Not run: `npx expo lint` (no lint config changed in this pass), `npx expo-doctor` (no dependency changed), any test (no test runner is installed; Jest is not in `package.json`).

## Findings the user should know about

1. **Only 10 main evenings exist in the dataset**, not 30 (E21 to E30). The brief asks for 30 evenings x 4 policies on the phone. Using pilot or tuning evenings would break the held-out rule. This blocks the results screen (O-8).
2. **Seven drivers have no travel time** (4 bicycle, 3 tricycle). `road_distances.csv` covers only motorcycle and car (O-2).
3. **The guide and PRODUCT.md disagree on the engine** (Python/Mesa and a server database versus an in-app TypeScript engine and no backend). PRODUCT.md is followed (C-1).
4. **The learning rule needs tuning counts, not only the frozen estimate.** The `Driver` type carries `tuningRuns` and `tuningShows` for this (D-09).
5. **Food wasted has two definitions in the guide** (O-5). **Losing bids may or may not spend shares** (O-7). **The guide's bids do not fit one linear share scale** (O-3).
6. **The guide's worked lot (Lot 14) is not in the dataset** (O-11). Distances for it do match.
7. **Driver choice rule is not defined** (O-1). Lateness model is not defined (O-6). FCFS reply timing is not defined (O-4).

## Open risks

- The engine's timing on a phone is unmeasured. The chunked-loop design (D-24) has a placeholder slice size. A spike is needed before the results screen is promised.
- The Anthropic model id `claude-haiku-5-5` is taken from PRODUCT.md and has not been checked against the API reference (D-18).
- The LAN relay has no authentication beyond the proposed pairing code (D-26). The security agent should review it.
- The derived map is ODbL-derived data. The share-alike question is open (O-13).
- Packages named in the design are not installed: `expo-sqlite`, `react-native-svg`, a notifications module, an on-device speech module, Jest and the Jest preset. Each needs `npx expo install` and a docs check first.
- Expo SDK 57 APIs named in the doc (Expo Router protected routes, `AccessibilityInfo` reduce-motion, `react-native-worklets` runtime) are described but not checked against the versioned docs. Each needs that check before use (AGENTS.md).

## Needs the user's go-ahead before the results screen is final

O-1, O-3, O-4, O-5, O-7, O-8, O-10 (see `docs/architecture.md` section 8). Each has options and a recommendation.

## Next owners

- Dataset owner: O-2 (bicycle and tricycle speeds) and O-11 (anchor lot), then `verify.py --update`.
- mobile-data: `scripts/gen-data.mjs` and the generated modules, with `--check`.
- mobile-feature: engine skeleton (RNG, heap, simulation loop, policies, metrics) and the Jest suite in section 7.1 of the doc.
- mobile-native: add the packages above with `npx expo install`, after docs checks.
- Server owner: relay and proxy, after the API reference check (D-18).
