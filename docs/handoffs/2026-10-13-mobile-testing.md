# Handoff: mobile-testing, 2026-10-13

## What was done

1. Read the role file (`.claude/agents/mobile-testing.md`), `AGENTS.md`, `package.json`, `tsconfig.json`, and the header of `../PRODUCT.md` (Stack section).
2. Wrote four independent SPEC test files for the engine. Every expected number was derived by hand from the spec given in the task and written as a literal. The implementation bodies in `src/engine/*.ts` were not read; only the directory listing and the exported signatures from the task were used.
3. Ran `npm test` and `npm run typecheck`. Initial typecheck failed only because the test files used Jest globals without types; fixed by adding `/// <reference types="jest" />` as the first line of each test file (inside `__tests__/`).

Result: all 47 spec assertions pass. No failing assertions, so no expected value was changed.

## Files touched

- `src/engine/__tests__/reliability.spec.test.ts` (new)
- `src/engine/__tests__/shares.spec.test.ts` (new)
- `src/engine/__tests__/metrics.spec.test.ts` (new)
- `src/engine/__tests__/rng.spec.test.ts` (new)
- `docs/handoffs/2026-10-13-mobile-testing.md` (new, this file; the one file outside `__tests__/`, written because the role and the task both require it)

Not touched: any implementation file in `src/engine/`, `package.json`, `package-lock.json`, `tsconfig.json`, `node_modules/`, `src/app/*`, `docs/stories.md`, `docs/architecture.md`. No commit, no push.

## Commands run and real results

| Command | Result |
|---|---|
| `npm test` (first run) | `Test Suites: 4 passed, 4 total`, `Tests: 47 passed, 47 total`, exit 0 |
| `npm run typecheck` (first run) | exit 2: `Cannot find name 'describe' / 'test' / 'expect'` in the four new test files only (missing Jest type reference) |
| add `/// <reference types="jest" />` to the four files, then `npm run typecheck` | exit 0, no output |
| `npm test` (final run) | `Test Suites: 4 passed, 4 total`, `Tests: 47 passed, 47 total`, `Time: 2.023 s`, exit 0 |
| `npm run typecheck` (final run) | exit 0 |

## Per-file results

| File | Tests | Result |
|---|---|---|
| reliability.spec.test.ts | 5 | all pass |
| shares.spec.test.ts | 6 | all pass |
| metrics.spec.test.ts | 28 | all pass |
| rng.spec.test.ts | 8 | all pass |

(Per-file counts are from the file contents; they sum to the Jest total of 47 from the real run.)

## Failing assertions

None. Every spec assertion passed on the first real run.

## Choices I made beyond the literal spec (review these)

These are places where the spec left a value open. Each one is a derivation or an inference, not a number copied from the code.

1. eveningMeasures fixture (a): the spec gave need 10 and received 12 only. I chose postedKg = 12, so wasted = 12 − 10 = 2.
2. eveningMeasures fixture (c): I chose postedKg = 7 and received 4 and 3, so wasted = 7.
3. Extra eveningMeasures case: need-0 pantry (received 3) plus need-10 pantry (received 4) with postedKg 10 → rescued 4, worst 0.4, wasted 6.
4. shareBid: "never below 0" was read as sharesLeft = −3 → 0.
5. bootstrapIndices: I assumed each resample row has length nEvenings (the standard bootstrap definition). The spec did not state this explicitly.
6. pairedInterval: level = 0.9 used throughout. The spec does not fix the meaning of level beyond the properties tested.
7. pairedInterval non-degenerate case: I asserted 2 ≤ low < high ≤ 9 (bounds because every resample mean of [2,4,9] lies in [2,9]) and low ≤ 5 ≤ high (sample mean inside the interval).
8. verdict: besides the four RES-04 fixtures, I added two fixtures derived from the spec rules: food [−1,3] with fair [+0.10,+0.20] → salo_better, and food [−5,−1] with fair [−0.30,−0.10] → central_greedy_better.
9. rng uniformity: stream 1, seed 7, b = 0 fixed; the test varies a over 0..9999.
10. rng intBelow: seed 5, stream 1, b = 0; varies a over 0..999.

## Open risks

- Because all 47 pass on the first run, the tests have not yet been shown to fail against a wrong implementation. A mutation check (for example, changing `reliability` to `(shows)/(runs+2)` and confirming the tests go red) would prove they discriminate. This was not run, because it would require editing implementation files, which is outside the allowed scope.
- The tests depend on the exact exported names and signatures from the spec. They type-check against the current `src/engine/*.ts`, so the names and signatures match.
- Jest runs with the `jest-expo` preset via the `jest` block in `package.json`. No device or emulator was involved; this is a pure Node-side unit test run.
- Data is simulated (Salo Evening Dataset); the tests use synthetic numbers only.
