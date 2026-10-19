# Handoff: mobile-feature, M4 phase 1 (parse core)

Date: 2026-10-20. Agent: mobile-feature. Not committed, not pushed.

**In-sample score: the fallback's vocabulary, synonyms and time phrases were built from the same 170 tuning messages it is scored on. This score is in-sample and must never be quoted as expected accuracy.**

Scores are computed on the raw ParseResponse (src/parse output), before any catalog mapping.

## What was built

All under `src/parse/`. Pure TypeScript, no React, no network, no new dependencies. No screens, no `src/app/`, no `src/components/`, no `src/engine`, `src/data`, `server/`, `src/voice/`, `app.json`, `package.json`.

| File | Purpose |
|---|---|
| `types.ts` | `ParseResponse` (wire shape, 5.1), `ParseResponseItem`, `ParsedItem` (`foodItem`, `rawText`, `quantity`, `unit`, `flags`), `ParsedDraft` (`items`, `pickupByMinute`, `source`) |
| `validate.ts` | `validateResponse(json)` implements 5.3 (every rule, whole response rejected on any failure, unknown fields dropped, `source` must be `llm`), `toDraft(resp)` maps food names to canonical tuning names and sets flags, `pickupMinute` |
| `rules/vocab.ts` | Every table the fallback and the matcher use (listed below), with the comment naming the source file and filter. `canonicalFor(name)` |
| `rules/index.ts` | `parseRules(text)`: the fallback parser, `source: "fallback"` |
| `client.ts` | `parseMessage(text, { baseUrl, timeoutMs?, fetchImpl? })`: POST `${baseUrl}/parse` with `{ text }`, default timeout 4000 ms (AbortController), validate the 200 body, fallback on any non-200, timeout, network error, invalid JSON, validation failure, or text over 500 characters (no request made). Never throws. |
| `__tests__/tuningCorpus.ts` | The only reader of the tuning CSV: CSV parser, the evening filter and its assertions (below) |
| `__tests__/validate.test.ts` | 5.3 rules, unit mapping, drop unknown fields, `toDraft` flags |
| `__tests__/rules.test.ts` | The two spec messages, five tuning messages with gold values, M0015, canonical-table-equals-CSV test |
| `__tests__/client.test.ts` | 200, 503 and every non-200, timeout, network error, invalid JSON, validation failure, 501 characters (no fetch call), 500 characters (fetch called), synchronous fetch throw |
| `__tests__/imports.test.ts` | Import guard (see below) |
| `__tests__/eval-parser-tuning.test.ts` | EVAL=1 gated scoring on the 170 tuning messages; writes `docs/reports/parser-tuning-fallback.md` |

`tsx` is not installed, so the evaluation is a jest test gated by `EVAL=1` (as `report.test.ts` is gated by `REPORT=1`), not a `scripts/` file.

## Hard rule and the filter (quoted)

Rule (Arjhine, 2026-10-20): the fallback's vocabulary is built only from `data/parse-dev/donor_messages_tuning.csv`, kept rows with `evening_id` in E01..E10. Nothing from `donor_messages.csv`, pilot E11-E20 or main E21-E30 was opened, read, grepped or printed. Nothing from `src/donor` or `src/data` is used by the parser or the eval (coordinator change, same day).

The filter, from `src/parse/__tests__/tuningCorpus.ts`:

```ts
export const TUNING_EVENINGS: ReadonlySet<string> = new Set(['E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E08', 'E09', 'E10']);
export const TUNING_ROW_COUNT = 170;

export function loadTuningRows(): TuningRow[] {
  const [header, ...body] = parseCsv(readFileSync(TUNING_CSV, 'utf8'));
  const all = body.map((r) => Object.fromEntries(header.map((k, i) => [k, r[i] ?? ''])));
  const kept = all.filter((r) => TUNING_EVENINGS.has(r.evening_id));
  if (kept.length !== all.length) throw new Error(`tuning filter kept ${kept.length} of ${all.length} rows`);
  if (kept.length !== TUNING_ROW_COUNT) throw new Error(`expected ${TUNING_ROW_COUNT} tuning rows, got ${kept.length}`);
  if (kept.some((r) => r.split !== 'tuning')) throw new Error('a kept row has split other than "tuning"');
  ...
}
```

Assertions: every row must pass the evening filter (throws otherwise), exactly 170 rows, and every kept row has `split == "tuning"`. The test `loads exactly the 170 tuning rows, all with split "tuning"` checks the same thing, and `scores all 170 tuning rows` asserts `overall.n === 170`.

Both filters agree on the same 170 message ids. The file itself carries `split` and `evening_id` in its header, and the README records the join used to add `evening_id`.

## Import guard and exclusion

`__tests__/imports.test.ts` lists every `.ts` file under `src/parse` (including the eval file and the tests) and fails if any import, `from`, bare `import`, `import()` or `require()` specifier has a path segment `donor` or `data`. It also checks that the scan includes `rules/index.ts`, `rules/vocab.ts`, `client.ts`, `validate.ts`, `types.ts` and `__tests__/eval-parser-tuning.test.ts`, and includes a self-test that the guard catches a forbidden import.

Result: all files pass. The `src/parse` tree contains no reference to `donor/catalog`, `src/data` or `dataset` in any import. The three grep hits in comments are documentation of the exclusion.

## Eval (EVAL=1, tuning messages only, 170 rows)

Command: `EVAL=1 npx jest src/parse/__tests__/eval-parser-tuning.test.ts`

Headline (in-sample, optimistic upper bound):

- All four fields correct: 170/170 (100.0%)
- Food item exact match: 170/170
- Quantity: 170/170
- Unit: 170/170
- pickup_by: 170/170
- Clarification rows (`requires_clarification` True): 35. Non-empty `missing`: 35/35.

By language: en 54 rows, fil 34, taglish 82. All four correct: en 54/54, fil 34/34, taglish 82/82.
By difficulty: contradictory 9/9, explicit 83/83, implicit 52/52, incomplete 26/26.

Note: the first eval run, before the M0015 fix, showed 169/170 (M0015 pickup_by wrong). The rule below was added after that failure was seen in the tuning messages, so the 170/170 is tuned to these rows.

Pilot and main messages were not read and not scored.

## Vocabulary tables (all from the tuning messages)

`src/parse/rules/vocab.ts` (the 21 gold foods and their one gold unit, with their non-empty row counts in the file's comment):

- Canonical foods: bananas (kg), chicken adobo (tray), chicken tinola (pot), chop suey (tray), eggplant (kg), ensaymada (piece), fried chicken (piece), giniling (tray), ginisang monggo (pot), instant noodles (pack), lumpiang shanghai (piece), menudo (tray), monay (piece), pancit bihon (bilao), pancit canton (bilao), pandesal (piece), pork adobo (tray), pork sinigang (pot), sliced bread (loaf), steamed rice (kg), tomatoes (kg).
- Synonyms (surface form to canonical): bananas: `saging`; chicken adobo: `adobong manok`; chicken tinola: `tinolang manok`; chop suey: `chopsuey`; eggplant: `talong`; fried chicken: `pritong manok`; ginisang monggo: `monggo`; pork adobo: `adobong baboy`; pork sinigang: `sinigang na baboy`; sliced bread: `tasty`; tomatoes: `kamatis`. The English names themselves are also accepted.
- Vague words (kept, no name, flagged as missing `food_item`): `food`, `pagkain`.
- Ambiguous word: `adobo`. No tuning message names adobo without meat, so it is kept raw and flagged `unmatched_item`.
- Unit words: tray, trays; piraso, pirasong, piece, pieces (piece); kilo, kilos, kilong, kg (kg); bilao, bilaos, bilaong (bilao); pot, pots, kaldero, kalderong (pot); loaf, loaves, balot (loaf); pack, packs (pack).
- Number words: isa, isang, one (1); dalawa, dalawang, two (2); tatlo, tatlong, three (3); apat, four (4); lima, limang, five (5); anim, six (6); sampu, sampung, ten (10).
- Hour words after `alas`: sais (6), siyete (7), otso (8), nuwebe (9). `y medya` means half past.
- Time cues before a bare number: before, by, until, bago, hanggang, around, than, mag.
- Hedge words (within 3 tokens after a quantity, the quantity is null): or, o, maybe, yata, whichever, sure.
- Alternative-hour blockers (a bare hour after "or" is a second pickup time unless followed by yata, sure or maybe): yata, sure, maybe.

Unit inference (a convention drawn from the tuning data): a number directly before a food with no unit word takes that food's single tuning unit (for example "20 pandesal" is 20 piece). This is how the spec's "pandesal 20 piece" is reached.

## Parser rules, in brief

- Digits and number words are quantities only when followed by a unit word, or directly before a food name.
- Clock times: `HH:MM`; a bare number after a cue or before pm/am; an hour word after `alas`. A bare hour 1..11 is PM. Exactly one clock time gives `pickup_by`; zero or several give null.
- A quantity is null when two quantities attach to one food, or when a hedge word follows it within 3 tokens.
- An "or" plus a bare hour 1..12 (not followed by yata, sure or maybe) is a second pickup candidate. This was added for M0015.

## Decisions for Arjhine

### Decision 1: a bare "adobo" with no meat named

**What I found.** In the 170 tuning messages, nobody writes just "adobo". They always say "adobong manok" (chicken) or "adobong baboy" (pork). The spec example "may 3 trays adobo pa at 20 pandesal" therefore has no evidence for which meat is meant.

**Why it matters.** DON-01 says the card should read "Adobo, 3 trays". If the parser picks chicken or pork, it guesses, and the item name is wrong for the donor if they meant the other one. The app's rule (architecture 5.3) is that the donor confirms every field, so a wrong guess costs one tap, not a wrong award.

**What we know vs. what we don't know.**
- Directly proven by the tuning file: no message names bare adobo; the two named forms always carry the meat.
- Strongly suggested: a donor who types bare "adobo" means one of the two, but the data does not say which.
- Currently unknown: which meat a donor means when they write only "adobo".

**Option A: keep it flagged (current).** The item shows the raw word "adobo" with an unmatched flag, and the donor picks the item on the confirm screen. Immediate consequence: no file changes; the spec test already expects this. Research consequence: none; no tuning row has bare adobo, so the tuning score is unaffected. Reversible: yes, by changing one table in `rules/vocab.ts`.

**Option B: default to one meat.** For example, bare adobo becomes pork adobo. Immediate consequence: a one-line change in `vocab.ts` plus a test. Cost: a wrong guess is silent unless the donor reads the card closely, and the choice would be ours, not the data's.

**My recommendation.** Option A. It is what the data supports, and the donor confirmation step (DON-02) already exists to catch it. I would change to B if there is evidence (for example from donor interviews) that people usually mean one meat by bare adobo.

**What I need from you:** keep bare "adobo" flagged as unmatched (A), or set a default meat (B)?

### Decision 2: "tasty" means sliced bread

**What I found.** The tuning messages use "balot ng tasty" (a wrapped pack of Tasty bread), with the gold food item "sliced bread" and unit loaf. I mapped the word "tasty" to sliced bread. In the tuning data it is always paired with sliced bread (4 rows).

**Why it matters.** "Tasty" is a brand name. The parser's food list would then contain a brand name, and whether that is acceptable depends on copy rules that I have not checked.

**What we know vs. what we don't know.** Directly proven: all four tuning rows that say "tasty" have sliced bread as the gold item. Unknown: whether brand names may appear in the parser's vocabulary, and whether other brands are written in the messages.

**Option A: keep "tasty" as a synonym (current).** Immediate consequence: none. The donor never sees the word "tasty" in the card, only the matched name "sliced bread". Research consequence: none. Reversible: yes.

**Option B: remove "tasty" from the synonyms.** Then "balot ng tasty" becomes an unmatched item, and the tuning score drops below 170/170 on those 4 rows. Reversible: yes.

**My recommendation.** Option A, because the data uses the word and the output shows the canonical name. I would change to B if the copy rules forbid brand names in the parser's vocabulary.

**What I need from you:** keep "tasty" as a synonym for sliced bread (A), or remove it (B)?

## Open issues and risks

- The score is in-sample, as stated above. The 170/170 number must not be quoted as accuracy. An out-of-sample check needs pilot or main messages, and those are off limits without a go-ahead.
- `parseRules` output is not validated. It can produce zero items (then it sets `missing` to food_item). It caps at 10 items silently. Its pickup is not restricted to 16:00-22:00 (only the LLM path is validated).
- Catalog mapping is not done. The wiring step must map canonical names to catalog entries (kg per unit, load units). I have not checked that every canonical name exists in the catalog (for example `pork sinigang`, `chop suey`, `instant noodles`, `steamed rice`), so that check belongs to the wiring step.
- `validateResponse` requires `source: "llm"`. A proxy body with another `source` is treated as failed and falls back.
- `parseMessage` takes `baseUrl` as a parameter. The screen wiring is not done (the screens are out of scope).
- Test totals (`npx jest`): 225 passed, 2 skipped across the whole repo. The skipped ones are `report.test.ts` (REPORT=1) and the EVAL=1 test. `src/parse` alone is 55 passed and 1 skipped. The rest of the total comes from other work in the tree.

## Verification (real output)

- `npx tsc --noEmit`: exit 0 (after fixing one tuple typing error in client.test.ts).
- `npx expo lint`: exit 0.
- `npx jest`: `Test Suites: 2 skipped, 16 passed, 16 of 18 total`; `Tests: 2 skipped, 225 passed, 227 total`.
- `EVAL=1 npx jest src/parse/__tests__/eval-parser-tuning.test.ts`: 1 passed, 170/170 in-sample (see above).
- `git diff --stat -- src/engine src/data scripts/build-data* data/salo-evening-dataset docs/decisions.md`: empty.
- `git status` shows `app.json`, `package.json` and `package-lock.json` as modified and `src/voice/` as new. Those are not mine (voice agent). My files are `src/parse/`, `docs/reports/parser-tuning-fallback.md` and this handoff.

## Disclosure

Before the exclusion was given, one of my commands printed the first 2 KB of `src/data/dataset.generated.ts` (pantry records, no donor messages) and a grep over that file that matched lot records; I did not read those results further and I deleted the saved output of that grep. No file in `donor_messages.csv` or its folders was opened.
