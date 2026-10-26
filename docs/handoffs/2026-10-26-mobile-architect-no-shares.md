# Handoff: no shares left refusal (story PAN-04), mobile-architect

Date: 2026-10-26. Scope: `src/engine/`, the dashboard tape label in `src/i18n/strings.ts`, and tests. Tuning evenings E01-E10 only. No pilot or main run, no emulator, Metro, Gradle or build. Nothing committed or pushed.

## What changed

Under the Salo policy only, a pantry with 0 shares left refuses a lot with `no_shares_left` instead of sending a 0-share PROPOSE. The check runs after the existing refusals (closed, cannot store, no remaining need). The utility is still computed. A refused candidate is not eligible.

| File | Change |
|---|---|
| `src/engine/simulate.ts` | `reply`: one new branch in the `refuse` chain, `policyId === 'salo' && (sharesLeft.get(pantryId) ?? 0) <= 0 ? 'no_shares_left'`, plus a one-line comment (PAN-04). +2 lines. |
| `src/engine/types.ts` | `RefuseReason` gains `'no_shares_left'` with a doc comment. +4 -1. |
| `src/i18n/strings.ts` | `refuse` map gains `no_shares_left: 'no shares left tonight'`. +1. |
| `src/engine/__tests__/fixtures/head-digests.json` | Seven Salo log digests re-recorded (E01, E02, E03, E06, E07, E08, E10). The HEAD values are kept under `supersededSalo`. The `engine` description says so. |
| `src/engine/__tests__/fixtures/head-results.json` | New. sha256 of `JSON.stringify(result)` for E01-E10 x four policies, recorded at HEAD before the change. |
| `src/engine/__tests__/no-shares-left.test.ts` | New, 4 tests (below). |

No existing test `.ts` file was changed. `human-drivers.test.ts` encodes the Salo log through the fixture, so it needed the fixture update and nothing else. `src/i18n/pantry.ts` was not touched (another agent's uncommitted edit there already contains a `no_shares_left` label).

## How the before-results were recorded

1. At HEAD (`8b1981c`, clean tree) a temporary jest file ran `runEvening` for E01-E10 x four policies with `UNTUNED_PARAMS` and wrote the result and log digests to the scratchpad. It also replayed each Salo log in order to count PROPOSEs from pantries with 0 shares left.
2. `head-results.json` was written from that run. All 40 log digests recomputed at HEAD matched `head-digests.json` exactly (0 mismatches).
3. The engine was changed. The temporary file was accidentally left in the tree for one full jest run, which overwrote the scratchpad copy of the HEAD run with post-change values. The committed fixtures were not affected, and the temp file is deleted. To reproduce the HEAD results, run the same loop on commit `8b1981c`.

## Counts (measured)

- HEAD, Salo, E01-E10: 126 PROPOSEs from pantries with 0 shares left. Per evening: E01 1, E02 17, E03 76, E06 11, E07 5, E08 8, E10 8, the rest 0. This matches the orchestrator's count.
- After the change, Salo: 126 REFUSE `no_shares_left`, the same per-evening split, and 0 PROPOSEs from a pantry at 0 left (test 3).
- Results: all 40 result digests equal the HEAD fixture (test 1).
- Logs: fcfs, nearest and central_greedy are byte-identical on all 10 evenings (test 2). Salo logs change only on E01, E02, E03, E06, E07, E08, E10. E04, E05 and E09 are byte-identical.

## Tests

`npx jest src/engine/__tests__/no-shares-left.test.ts`: 4 passed, 4 total.
1. E01-E10 x four policies: result digests equal `head-results.json`.
2. fcfs, nearest and central_greedy: full log digest equals `head-digests.json`.
3. Salo: REFUSE `no_shares_left` per evening equals the HEAD counts, total 126. Every PROPOSE has shares left above 0 and shares at most that. Every reply from a pantry at 0 left is either `no_shares_left` or one of the existing reasons.
4. Constructed (E05 copy, only P01 open, shares budget 0 so P01 starts at 0): under salo, P01 refuses L0207 and L0227 with `no_shares_left` at 1023, P11 (closed, also at 0) gets the closed reason first, and both lots end `unawarded`. Under fcfs with the same setup, P01 proposes 0 shares and wins L0207.

## Command results

- `npx tsc --noEmit`: exit 0, no errors in the whole project.
- `npx expo lint`: exit 0, no output.
- `npx jest` (full): 1 failed, 3 skipped, 399 passed, 403 total. The one failure is `src/pantry/__tests__/pantry.test.ts`, "why sentence (PAN-07)": it expects `Natira ngayon: 9 shares`. The uncommitted edit to `src/i18n/pantry.ts` (another agent) changed that template, so the test is out of date. It is not caused by this change. Not fixed here (not my file).
- `npx jest src/engine` (before the full run): all engine suites pass, including `human-drivers.test.ts` with the updated fixture.
- `git diff --stat -- src/engine src/i18n/strings.ts`: `head-digests.json` 25 (+17 -8), `simulate.ts` 2 (+2), `types.ts` 4 (+3 -1), `strings.ts` 1 (+1). Untracked: `no-shares-left.test.ts`, `head-results.json`.

## Open risks

- The 0-share award claim ("0 awards ever went to such a pantry") is the orchestrator's measurement. Equal results on all ten evenings are consistent with it, but I did not count awards to a 0-share pantry separately.
- The constructed case uses a zero starting budget, not a real evening state where a pantry reaches 0 through awards. It shows the rule and the order of checks, not frequency.
- `pantry.test.ts` (above) is red until the pantry-side agent updates that assertion or the template.
- The 1-3 minute reply delay and the rest of the engine are unchanged by this work, so the existing evidence on delay still applies.
