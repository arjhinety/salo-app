# Salo app architecture

Status: draft v1, 2026-10-13. Owner: mobile-architect.
Scope: module layout, the in-app agent engine, the data bundle, the two-phone sync protocol, the LLM proxy contract, state and navigation, and the test strategy.
Sources read: `../PRODUCT.md` (Stack, Users, Principles), `../guide/salo-guide.html` (agent design, pages 1 to 21), `../salo-evening-dataset-repo/README.md` and the 12 CSVs in `salo-evening-dataset/`, `../.impeccable/surfaces/mockup-salo-mockup-html.md` (visual world), `AGENTS.md`, `package.json`, `app.json`.

All businesses, pantries, drivers, donors and numbers are **simulated** (Salo Evening Dataset). Any screen that could pass as real must say so.

Decision IDs (`D-nn`) are recorded inline and collected in section 10. Open questions that need the user's go-ahead are `O-nn` in section 8. Conflicts between the sources are `C-nn` in section 9.

---

## 0. The design in one paragraph

Salo is one Expo app (Android first) installed on every phone. A phone takes a role (donor, pantry, driver, or dashboard) from a dataset profile. The **dashboard phone** runs one simulated evening: a deterministic, seeded, pure-TypeScript discrete-event simulation of the contract-net market. The **donor phone** posts live lots, which the dashboard phone receives through a small Node relay on the laptop. That relay also hosts the LLM proxy (`POST /parse`). Every decision the engine makes is a message in one **event log**. The live replay, the message trace, and the four-policy results are all folds over that log. Each phone keeps working offline on its own data.

---

## 1. Module layout and dependency direction

```
src/
  app/          Expo Router routes only. Screens are thin: they read stores and call functions.
  engine/       Pure TypeScript simulation. The only home of the agent logic.
  data/         Dataset adapters and generated modules (src/data/generated/).
  sync/         WebSocket client and relay message schema. No React.
  parse/        Donor text to structured lot draft: LLM client, rule-based fallback, validation.
  state/        Stores (external, subscribable) and React providers. Thin glue.
  i18n/         One typed strings file (Filipino and English per key).
  theme/        Colour, type and spacing tokens; light and dark; reduced-motion flag.
  components/   Presentational React Native components. Props in, callbacks out.
scripts/        Node tooling: gen-data (CSV to typed modules), tune (offline, laptop only).
server/         Node relay plus LLM proxy. Separate package.json. Holds server/.env (never committed).
docs/           This file, handoffs/, ledger.md.
```

`state/` is the one directory not listed in the brief. It holds the stores. Section 6 explains why it is separate.

**Allowed imports** (an arrow means "may import from"):

| From | May import from | Must not import |
|---|---|---|
| `engine/` | `engine/` only | `react`, `react-native`, `expo*`, `node:*`, `data/`, `sync/`, `parse/`, `state/` |
| `data/` | `engine/types.ts`, `data/` | `engine/` logic, React |
| `sync/` | `engine/types.ts`, `engine/log` (pure folds), `sync/` | React, `app/` |
| `parse/` | `engine/types.ts`, `data/` (vocabularies), `parse/` | React, `sync/` |
| `state/` | `engine/`, `data/`, `sync/`, `parse/`, `react` | `app/`, `components/` |
| `components/` | `theme/`, `i18n/`, `engine/types.ts` (type-only) | `engine/` logic, `state/`, `sync/`, `data/` |
| `app/` | everything above | nothing |

**Decision D-01 (engine imports nothing from React or Expo).** Reason: the engine must run on the dashboard phone, under Jest on the laptop, and in the tuning script, with the same code. A React import would drag a renderer into all three.

The rule is enforced in two places, to be added with the first code change: an ESLint `no-restricted-imports` rule for `src/engine/**` (via `expo lint`), and a Jest test that fails on any forbidden import path in `src/engine/`.

**Decision D-02 (no hosted backend).** Reason: PRODUCT.md, Stack. The only server is the laptop process that hosts the relay and the LLM proxy. The phones do not need an internet connection for anything except the parse call, and that call has a fallback.

---

## 2. The engine

### 2.1 What one evening is

One evening is one discrete-event simulation from **16:00** (minute 960) until the event queue is empty. Times are integer minutes after local midnight, so 19:05 is 1145. Nothing is scheduled after the last pickup deadline in the data (21:00, minute 1260).

**Decision D-05 (integer time; no geometry or transcendental maths in the engine).** Reason: determinism. The engine uses only `+ - * /`, comparisons, `Math.floor`, `Math.round`, and `Math.imul`. These are IEEE-754 correctly rounded, so Hermes on the phone and V8 in Node and Jest give identical results. Road times come from the dataset (`road_distances.csv`), not from coordinates. The dataset's times already follow the formula in `parameters.csv`, which I checked on D01 to P01 and D01 to P02: `1.1 km / 18 km/h x 60 + 3 = 6.67 -> 6.7` and `1.1 / 14 x 60 + 5 = 9.71 -> 9.7`. The car and motorcycle values in the table match.

### 2.2 Inputs and state

The engine is a pure function of:

- `World`: donors, pantries, drivers, road legs (`src/engine/types.ts`).
- `Evening`: seed, split, pantry needs fixed at 16:00, and the dataset lots in posting order.
- `FrozenParams`: the tuned weights and the share rules. Read-only.
- `EngineInput[]`: the input log, with the minute each input happened.
- `AllocationPolicy`: one of four.

State is a plain object. It holds per-lot award state, per-pantry remaining shares and remaining need, per-driver reliability counts, and the event heap. No object is shared with React.

### 2.3 Events and award states

Message types are the six in the guide: `CALL_FOR_PROPOSALS`, `PROPOSE`, `REFUSE`, `TENTATIVE_ACCEPT`, `COMMIT`, `FAILURE`. The engine adds three non-message event kinds: `INPUT` (anything from outside the agents), `AWARD_STATE` (a state change of a lot), and `DELIVERY`. `RELIABILITY_UPDATED` records each change to a driver's estimate. All are in `EngineEvent`.

An award goes through these states (`AwardState`):

```
announced --(pantry TENTATIVE_ACCEPT)--> tentative --(driver COMMIT)--> final --(arrival)--> delivered
announced --(no eligible PROPOSE at round-1 close)--> unawarded
tentative --(no COMMIT before pickup deadline)--> stranded
final --(FAILURE: withdrew, no-show, or cancelled)--> tentative (delivery re-announced; pantry unchanged)
final/tentative --(no driver before pickup deadline)--> stranded
```

Two rules the guide requires and the tests must check:

1. **Two-phase commit.** A pantry's award is never final without a driver's `COMMIT`. No `AWARD_STATE: final` may precede a `COMMIT` for the same lot.
2. **Only the delivery is re-announced.** A `FAILURE` from a driver never sends the food back to pantries (guide page 14). The re-announcement is a `CALL_FOR_PROPOSALS` with `target: 'driver'`.

"Stranded" means an award that ends with no `DELIVERY` event, which is the metric on guide page 19.

### 2.4 One lot, step by step

For each lot, when it is posted (`LOT_POSTED` at `postedMinute`):

1. `CALL_FOR_PROPOSALS` to pantries (`target: 'pantry'`).
2. For each pantry, in order of `replyMinute`: a pantry that is closed before the earliest possible arrival, cannot store the lot, or has no remaining need emits `REFUSE` with a reason. Otherwise it emits `PROPOSE` (`proposer: 'pantry'`) with shares and its utility breakdown. Shares are 0 for the three baselines.
3. The policy's `choosePantry` picks one pantry, or none (`null`). If none, the award is `unawarded`.
4. `TENTATIVE_ACCEPT` to the chosen pantry. State is `tentative`.
5. `CALL_FOR_PROPOSALS` to drivers (`target: 'driver'`).
6. Each available driver with enough capacity emits `PROPOSE` (`proposer: 'driver'`) with `etaMinute` and reliability. The driver choice follows rule O-1.
7. The chosen driver's outcome is drawn (section 2.6). If the driver is going to deliver, `COMMIT` moves the state to `final`. A `FAILURE` returns to step 5 for the delivery only.
8. `DELIVERY` at arrival, with `onTime` true if arrival is at or before `pickupByMinute` (the guide's "delivered before the pickup deadline").

The shared driver stage (steps 5 to 8) is the same for all four policies (D-07).

### 2.5 Live lots: how a human-posted lot enters the run

A live lot is an input, not a special case.

1. The donor phone turns a Taglish message into a `LotDraft` through the parse path (section 5). The donor confirms or edits every field.
2. The draft is sent to the dashboard as `lot.post` (section 4), with a client-generated `clientLotId`.
3. The dashboard validates the draft (schema, a donor that exists, `pickupBy` later than the current simulated minute, not a duplicate `clientLotId`).
4. The dashboard's engine appends `INPUT: LOT_POSTED` at the **current simulated minute**. The engine assigns the id `LIVE-<n>`, stamps `postedMinute`, and the policies handle it exactly like a dataset lot.
5. The dashboard sends back `lot.ack` with the assigned id. The donor phone then sees `AWARD_STATE` events for that id.

The simulated clock is the dashboard's. It advances at a configured speed (fast-forward). Every event carries the simulated minute, and the donor phone shows that clock, so a pickup time typed as "kunin before 8" is read on the same clock.

**Decision D-06 (inputs are logged; replay = seed + world + input log).** Reason: a live post otherwise makes the run impossible to reproduce. With the input log, "Replay with baseline" re-runs the same evening, including the live lot at its injection minute, under another policy.

### 2.6 Randomness: counter-based, common random numbers

The only random outcomes in the engine are:

- the driver outcome for an offered run: `completed`, `completed_late`, `no_show`, or `withdrew_after_offer`. A show is `completed` or `completed_late`, as in `driver_runs.csv`;
- the pantry reply minute, used only by first-come-first-served (O-4).

Both are drawn from a **counter-based** generator: a pure function `u = U(seed, entityIndex, lotIndex, drawIndex)` in `[0, 1)`, built from `Math.imul` mixing. A draw depends only on its keys, not on how many draws came before. Consequences:

- All four policies face the same no-shows for the same (driver, lot) pair. This is common random numbers, which makes the paired bootstrap on guide page 19 valid.
- Changing the policy cannot shift another entity's draws.
- `seed` is `evenings.csv` `seed`, reduced with `>>> 0`.

**Decision D-10 (counter-based RNG keyed by seed, entity and lot).** Reason: the comparison is only fair if each method faces the same randomness. A sequential RNG would couple every draw to the order of calls, which differs between policies.

### 2.7 Reliability (learning)

The estimate is a Beta-Bernoulli posterior mean, as in guide page 15:

```
reliability = (shows + 1) / (runs + 2)
```

Starting counts come from `drivers.csv` (`tuning_shows`, `tuning_runs`), which are frozen after tuning. During an evening, each offered run adds one to `runs`, and one to `shows` if the driver showed. A withdrawal counts as a missed run. R. Dizon's example from the guide: `(10 + 1) / (11 + 2) = 0.85`, then after a withdrawal `(10 + 1) / (12 + 2) = 0.79`. Both values come out of the stored counts.

**Decision D-09 (store counts, not just the frozen estimate).** Reason: the update needs `runs` and `shows`. The frozen estimate alone cannot be updated correctly, because the posterior mean of 0.85 does not record its sample size. I checked this against the data: `drivers.csv` has `tuning_runs` and `tuning_shows` for all 40 drivers, and they match `driver_runs.csv` row counts (0 mismatches in 40).

Each evening restarts from the frozen counts. Nothing learned in one evening carries into the next (guide page 15). Central greedy gets the same frozen counts. Whether in-evening updates apply to the evaluation runs is open (O-9).

### 2.8 The four policies

Every policy implements `AllocationPolicy.choosePantry(input)`. The engine builds the candidate list (eligibility, utility, road distance, transport time, reply minute) the same way for all four policies, so a policy only ranks what it is given.

| Policy | `choosePantry` rule | Share budget | Pantry refusal rules |
|---|---|---|---|
| `salo` (contract net) | Highest share bid among eligible PROPOSEs. Ties: higher utility, then lower pantry id. | 40 per pantry per evening, reset at 16:00 | Shared |
| `fcfs` (first come, first served) | Eligible pantry with the earliest `replyMinute`. Ties: lower pantry id. | None | Shared |
| `nearest` | Eligible pantry with the smallest `roadKm`. Ties: lower pantry id. | None | Shared |
| `central_greedy` | Argmax over eligible pantries of `utility.total - transportPenaltyPerMinute x transportMinutes`, with its own tuned weights. Ties: lower pantry id. | None | Shared |

Notes:

- **Decision D-08 (budget is per evening).** Reason: guide page 12 says the budget "resets every day"; in the simulation each evening is one day, so the reset is at the start of each evening. The budget is fixed at 40 and is not tuned, because only Salo has it (guide page 12).
- **Decision D-07 (one driver stage, four pantry rules).** Reason: the comparison then isolates the pantry-selection rule. "Stranded awards" and fairness are measured the same way for all four. A baseline that skipped the driver stage would look better on "stranded" for the wrong reason.
- Share bids (`shareBid`) are a parameter whose form is an open question (O-3). Whether a losing bid spends shares is open (O-7).
- Salo's refusal reasons are the reflex rules from guide pages 8 and 11. The first is the one the guide gives as the example: a pantry that closes before the earliest arrival refuses (Anonas closes 19:00; earliest delivery 19:05). The second, `cannot_store_lot`, uses the pantry's storage and fridge fields. Its exact rule is part of the tuning spec, so it is a proposal and not a fixed rule.

### 2.9 The event log is the single source

Every number the app shows about a run is a function of its log:

- **Dashboard replay and the message trace** fold the log to the state at any `seq`.
- **Metrics** (`EveningResult`, section 2.10) are computed from one run's log.
- **"Replay with baseline"** re-runs the same seed, world and input log under another policy, and produces a second log.

Nothing keeps a separate counter that could drift from the log. The log entry type is `LogEntry` (`seq`, `evening`, `policy`, `atMinute`, `event`). `seq` is assigned by the engine owner (the dashboard) and increases from 1.

**Decision D-04 (one log, folded).** Reason: the guide's trace, replay and experiments must agree with each other on the same run. A single source makes that a property of the code, not something to test for after the fact.

### 2.10 Metrics

Computed per (evening, policy) from the log (`EveningResult` in `types.ts`):

- **Food rescued (kg):** for each pantry, the on-time kg it received, capped at its seeded need; summed over pantries. Guide pages 14 and 19.
- **Food wasted (kg):** definition under review (O-5).
- **Worst-served need met:** `min over pantries with need > 0 of min(1, on-time kg / need)`. `null` if no pantry needed anything that evening, and such an evening is left out of the fairness average (guide page 14).
- **Stranded awards:** awards that end with no `DELIVERY`.

Comparisons (`PairedDifference`): Salo minus each baseline, paired evening by evening over the main_sample evenings E21 to E30 only, with a bootstrap interval. The Results screen reports these evenings and no others: "Pilot and tuning evenings stay out of the reported results, and main evenings are never used for tuning" (guide page 19). Two main results (food rescued and worst-served need met, against central greedy) use 97.5%. The other ten use 95% and are supporting only (guide page 19).

### 2.11 Running 30 evenings x 4 policies on the phone without blocking the UI

Work size. The dataset averages 1,436 lots / 30 evenings = about 48 lots per evening, with 25 to 30 pantries open per evening (`evenings.csv` `pantries_open`, min 25, max 30). Each lot produces roughly one message per open pantry plus the driver stage. A rough count from those numbers is about 2,000 log entries per evening. This is an estimate from dataset counts. It has not been measured on a phone.

Mechanics:

- **Job** = one (evening, policy) pair. The runner runs evening-major: for each evening, all four policies, so partial results always contain paired evenings for the bootstrap.
- **Slices.** A job pops at most K events from the heap per slice, then yields with `await yieldToEventLoop()` (a `setTimeout(0)` supplied by the caller). This lets React render and touch events run. K starts at 500 and is set by measurement. No timing figures are claimed here.
- **Progress** is written to the store at most about four times per second.
- **Cancellation** is a token checked between slices.
- **Memory.** Metrics are folded as the run goes, so a finished run keeps only its `EveningResult`. The full log of one run is kept only while the user views that run's trace.
- **Results cache.** Results are stored in SQLite, keyed by (dataset version, params hash, evening, policy). Reopening the results screen is instant, and the numbers are still computed on the device.
- **Yield function injected.** The engine takes `yieldControl` as a parameter. It never calls `setTimeout` itself, which keeps the engine pure.

**Decision D-24 (no worklet runtime at first).** Reason: the chunked loop is simple and needs no new mechanism. `react-native-worklets` is already a dependency (`0.10.1`, used by Reanimated), and it can host a second JS runtime. That is the fallback if a measured spike shows the chunked loop is too slow on a mid-range phone. Its API must be checked against the SDK 57 docs before any use (AGENTS.md). The engine stays pure in either case, so the move would not change the engine.

### 2.12 Tuning is offline (laptop), results are frozen

Tuning the weights, the share-bid scale, and the central greedy's penalty happens on the **tuning** evenings E01 to E10, with the tuning target from guide page 12, on the laptop. The same tuning evenings are the only ones that driver reliability is learned on (guide page 15). The pilot evenings (E11 to E20) are used only for pilot checks: they set the number of main evenings (guide page 19) and measure how often each method hits the need ceiling (guide page 13). The main_sample evenings (E21 to E30) are the only evenings the Results screen reports, and they are never used for tuning. This keeps the reported evenings apart from every evening a setting was chosen on. Dwork et al. (2014, arXiv 1411.2664, guide page 21) show that reusing the same data to choose new analyses breaks the usual validity guarantees; Salo does not use their technique and simply avoids reusing evenings.

**Decision D-11 (tuning runs on the laptop; the phone only runs results).** Reason: the frozen values must exist and be written down before the pilot (guide page 11). Keeping tuning out of the app means a reviewer can see in the diff that the phone uses frozen values only. The tuning script runs the same engine code, under Jest's TypeScript transform, so no extra runner is needed. This is confirmed when the test setup is added.

---

## 3. Data: bundling the CSVs

### 3.1 What is bundled

Source: `../salo-evening-dataset-repo/salo-evening-dataset/` (12 CSVs), and `../salo-evening-dataset-repo/sources/osm_roads_cubao_project4.json` (raw Overpass JSON, 1,431,242 bytes), used only to derive the schematic map.

| File | Bytes | Bundled? | Why |
|---|---:|---|---|
| `food_offers.csv` | 129,548 | yes | the 1,436 lots |
| `road_distances.csv` | 33,348 | yes | 50 x 30 road legs |
| `pantry_needs.csv` | 30,988 | yes | need per pantry per evening |
| `driver_runs.csv` | 25,300 | **no** | tuning history; the counts it implies are already in `drivers.csv` |
| `donor_messages.csv` | 130,903 | **no** | parser evaluation only, on the laptop. Not needed on a phone |
| `donors.csv` | 5,215 | yes | |
| `pantries.csv` | 5,155 | yes | |
| `drivers.csv` | 3,862 | yes | |
| `storage_rules.csv` | 3,579 | yes | fridge and storage hours |
| `sources.csv` | 3,885 | yes | the About screen shows provenance |
| `evenings.csv` | 2,242 | yes | seeds, splits |
| `parameters.csv` | 1,882 | yes | every assumed number, shown in About |

Bundled CSV total: 215,819 + 3,885 = **219,704 bytes (about 220 KB raw)**. The `sources/` folder of the dataset repo is not bundled as files. Its OSM roads file is used only to derive the map (section 3.3).

**Decision D-13 (bundle only what the app reads).** Reason: size, and a clear rule for what the phone can see. `driver_runs` and `donor_messages` would add about 156 KB with no use on the phone.

### 3.2 Build-time conversion

`scripts/gen-data.mjs`, plain Node (ESM), no new dependency. It:

1. checks the input CSVs against the dataset repo's `SHA256SUMS`;
2. parses CSV with a small parser that handles quoted fields with embedded commas (`households_served_source` contains one, so `split(",")` is wrong);
3. validates every categorical value against the unions in `src/engine/types.ts` (for example `donor_type`, `vehicle`, `food_category`, `unit`), and fails the build on an unknown value;
4. asserts row counts: 50 donors, 30 pantries, 40 drivers, 30 evenings, 1,436 lots, 900 pantry-need rows, 1,500 road legs, 23 storage rules;
5. writes `src/data/generated/*.ts`, each a typed `export const X: readonly T[] = [...]` importing types from `engine/types.ts`.

`npm run gen:data -- --check` regenerates into memory and fails if the committed output differs.

**Decision D-12 (generated output is committed and also regenerated before start and build).** Reason: the brief asks for conversion at build time. Hooking `gen:data` into `prestart`, `android` and `web` keeps the output current. Committing the output keeps diffs reviewable and lets `tsc` run without a generation step. `--check` catches a stale commit.

### 3.3 Map

`src/data/generated/map.ts`, derived once by the same script from the OSM roads file: the largest connected component within the bounding box of the donors, pantries and drivers (plus a margin), with junction and endpoint nodes kept and degree-2 chains simplified. Coordinates are projected to a fixed 0 to 1000 box for drawing. This is a schematic, not a geographic map, and it has no tiles and no Maps key (PRODUCT.md).

**Decision D-14 (precomputed schematic map).** Reason: PRODUCT.md. Target size: at most 150 KB of generated source (a budget, not yet measured). Attribution "© OpenStreetMap contributors" appears in About. The ODbL share-alike question for a derived database is open (O-13).

### 3.4 Size budget

- Generated data source (9 tables + sources): target at most about 450 KB (about twice the raw CSV, because objects carry key names). Budget, not measured.
- Map: at most 150 KB.
- Combined generated source: at most 600 KB. The real cost is the minified bundle delta, measured at the first `expo export` by mobile-performance. Nothing is claimed about that yet.

---

## 4. Sync protocol (two phones, one laptop)

### 4.1 Topology

- **Dashboard phone** (authoritative): runs the engine, owns the evening state, assigns `seq`, keeps the input log, and mirrors to the projector.
- **Donor phone**: posts lots, receives events for its own lots.
- **Pantry and driver phones** (optional): receive events relevant to them and send driver responses.
- **Laptop relay**: one Node process, the same process as the LLM proxy. It forwards messages and keeps a small in-memory copy of the dashboard's log. It has no database.

Transport: WebSocket at `ws://<laptop-lan-address>:<port>/ws`. The phones find the laptop through an address field saved once in settings. The port is in `server/.env` and is not secret.

**Decision D-03 (the dashboard phone is the only writer of events).** Reason: PRODUCT.md says the dashboard phone runs the evening. A single writer gives one `seq` order without a database or consensus, and the conflict case (two phones changing one award) cannot arise. Other phones send requests (`lot.post`, `input`) and never events.

**Decision D-15 (relay holds no database).** Reason: the dashboard already holds the authoritative log. If the laptop restarts, the dashboard re-sends its log, and the relay's copy is rebuilt. Nothing is lost that the dashboard does not have.

### 4.2 Message schema

Every frame carries `v: 1` and a `t` discriminator.

```ts
// phone -> relay
{ v: 1, t: 'hello', role: 'donor' | 'pantry' | 'driver' | 'dashboard', clientId: string, profileId: string, lastSeq: number }
{ v: 1, t: 'lot.post', clientLotId: string, draft: LotDraft }            // donor only
{ v: 1, t: 'input', clientInputId: string, input: EngineInput }          // pantry or driver responses; cancel (dashboard UI)
{ v: 1, t: 'sync.log', entries: LogEntry[] }                              // dashboard only; full log on (re)connect, idempotent by seq
// relay -> phone
{ v: 1, t: 'welcome', serverTime: number, dashboardOnline: boolean, headSeq: number }
{ v: 1, t: 'replay', entries: LogEntry[] }                                 // entries with seq > lastSeq, in order
{ v: 1, t: 'event', entry: LogEntry }                                      // live
{ v: 1, t: 'lot.ack', clientLotId: string, lotId: string }
{ v: 1, t: 'rejected', ref: string, code: 'stale' | 'invalid' | 'unknown_donor' | 'duplicate' | 'closed', message: string }
{ v: 1, t: 'error', code: string, message: string }
```

`LotDraft` (defined in `src/parse/` when it is written; validated before sending) carries `donorId`, `items` (the `LotItem` fields that come from the donor: `foodItem`, `foodCategory`, `quantity`, `unit`), and `pickupByMinute`. The dashboard fills `estKg`, `loadUnits`, `needsFridgeIfKept` and `maxHoursUnrefrigerated` from `storage_rules`. A donor cannot set those fields.

`EngineInput` and `LogEntry` are the types in `src/engine/types.ts`. The wire format reuses them, so the sync layer adds no second vocabulary.

### 4.3 Ordering, idempotency, reconnect

- **Ordering.** A phone applies entries by `seq`. Any entry with `seq <=` its last applied value is ignored. An entry ahead of a gap is buffered until the gap is filled.
- **Reconnect.** `hello` carries `lastSeq`. The relay replays its copy of entries with `seq > lastSeq`. If the relay's copy has a gap or is behind the phone (after a laptop restart), it asks the dashboard for `sync.log`, and the phone waits for the replay. The phone never shows a state with a gap.
- **Lot posts are idempotent.** The dashboard keeps the set of accepted `clientLotId`s. A repeated `lot.post` gets the same `lot.ack` and no second lot.
- **Responses are checked for staleness.** A driver's `input` carries a `clientInputId`. If the simulated clock is past the response deadline when it arrives, the dashboard answers `rejected: stale`.
- **Backoff.** Reconnect delay starts at 1 s, doubles to a 30 s cap, with jitter. Heartbeat every 15 s. (Proposed values, to be tuned.)

### 4.4 Offline behaviour, per phone

| Phone | Offline, alone | Online |
|---|---|---|
| Dashboard | **Fully works.** Runs the evening, the results and the trace from the bundled data. The log is stored in SQLite and re-sent when the relay returns. | Same, plus mirrors to the relay and the projector. |
| Donor | Parse falls back to the rule-based parser. A confirmed post goes to the outbox (SQLite table) with "Not sent yet, will send when connected". Its last-known lot status is shown. | Outbox sends in order. The lot status updates from events. |
| Pantry | Read-only on the cached event snapshot. Cannot respond to offers. | Live offers; responses are sent as `input`. |
| Driver | Read-only on the cached snapshot. A commit or decline is queued as an `input` and sent later if still valid. | Live; responses go out immediately. |

**Decision D-16 (each phone works alone).** Reason: PRODUCT.md. The dashboard needs no network at all, because the engine and data are on the device. Donors keep working through an outbox. Pantry and driver phones are read-mostly and say so.

### 4.5 Security on the LAN

Anyone on the same Wi-Fi could post a lot or send a driver response. Mitigation (proposed, D-26): the relay binds to the LAN address only, and the dashboard shows a short pairing code that the other phones enter once. The code is sent in `hello` and checked by the relay. This is not authentication of people, and it is not for the public internet. The security agent should review it (O-12).

---

## 5. LLM proxy contract

### 5.1 Endpoint

`POST http://<laptop-lan-address>:<port>/parse`

Request:

```json
{ "text": "may 3 trays adobo pa at 20 pandesal, kunin before 8" }
```

`text` only. The field list stays minimal, as PRODUCT.md specifies. The server prompt tells the model that a bare hour in the evening means PM ("before 8" is 20:00).

Success response (`200`):

```json
{
  "items": [
    { "food_item": "adobo", "quantity": 3, "unit": "tray" },
    { "food_item": "pandesal", "quantity": 20, "unit": "piece" }
  ],
  "pickup_by": "20:00",
  "missing": [],
  "source": "llm",
  "model": "claude-haiku-5-5"
}
```

Errors: `422` (the text is not a food message; `reason` given), `413` (text longer than a set limit, proposed 500 characters), `429` (rate limit), `503` (model unreachable). The app treats every non-`200` as "use the fallback parser".

### 5.2 Server

- Node, in `server/`, its own `package.json`. Runs in the same process as the relay (section 4).
- The Anthropic key is `ANTHROPIC_API_KEY` in `server/.env`. `.gitignore` already lists `.env` and `server/.env` (checked). The key is never sent to the app.
- Model: `claude-haiku-5-5`, as PRODUCT.md specifies. **Not yet re-verified against the API reference** (the claude-api reference should be read before the server is written). Decision D-18 records this.
- The model is asked for JSON in the schema above and nothing else. The server validates the JSON before returning it, and returns `503` if the model's output does not parse.

### 5.3 Validation in the app (never trust the model)

The app checks every field of a `200` response before using it. Any failure rejects the whole response, not single fields, and the fallback parser runs on the original text.

- `items` is a non-empty array, at most 10 items.
- `food_item`: a non-empty string of at most 60 characters. Matched against the `storage_rules` vocabulary and synonyms. An unmatched item is kept and flagged for the donor to check.
- `quantity`: a finite number greater than 0 and at most 500, or `null` (then flagged as missing).
- `unit`: one of the `FoodUnit` values, or a mapped Filipino unit word, or `null` (then flagged).
- `pickup_by`: `HH:MM`, between 16:00 and 22:00, or `null`. It is a pickup deadline, not an expiry (PRODUCT.md).
- Unknown fields are dropped.

**Decision D-17 (LLM as sensor only; validation and confirmation are mandatory).** Reason: PRODUCT.md and guide page 16. The donor sees every field and confirms before posting, so a wrong parse costs one tap, not a wrong award.

### 5.4 Rule-based fallback

`src/parse/rules/`: a parser over the same output shape. It knows the food vocabulary (from `storage_rules.csv` plus Filipino synonyms), digits and common number words, unit words (tray, bilao, piraso, pack, pot), and time phrases ("before 8", "bago mag-8", "by 7:30"). Its output always carries `source: "fallback"` and the app shows "offline parse, please check".

Evaluation: the parser is scored on the dataset's `donor_messages.csv`, tuning split for development and pilot and main split for reporting only. The dataset's messages are template-based, so any accuracy is an optimistic upper bound (dataset README, caveats).

---

## 6. State management, navigation, language, theme, accessibility

### 6.1 State

**Decision D-19 (no state library; `useSyncExternalStore` over small stores, plus Context for slow values).** Reason: the app has one kind of changing data, a stream of events, and no request-response cache. A store with `subscribe` and `getSnapshot` is about 100 lines, and React 19 ships `useSyncExternalStore`. Redux, Zustand and React Query would add a dependency to solve a problem the app does not have. Each screen selects only the slice it shows, so a new event re-renders only the affected rows.

- **Engine-side store** (`state/evening-store.ts`): the dashboard's current state, the log, and the run progress. Updates are batched to about four per second.
- **Sync store** (`state/sync-store.ts`): connection status, last applied `seq`, outbox count.
- **Context** (`state/session.tsx`): profile, role, locale, theme. These change rarely, so Context is fine.

**Decision D-20 (SQLite for durable state).** Reason: the assignment requires a database. The dashboard log, the donor outbox, the results cache and the chosen profile id survive an app restart. The profile id is a dataset id ("D01"), not a person's identity, so storing it fits PRODUCT.md (no accounts, nothing personal stored). Package: `expo-sqlite`, not yet installed. It will be added with `npx expo install`, after the Expo SDK 57 docs are checked (AGENTS.md).

### 6.2 Navigation map

Routes live in `src/app/`. Route groups (in parentheses) do not appear in the URL.

```
src/app/
  _layout.tsx                  root Stack; providers; redirects by stored role
  index.tsx                    first open: pick a profile (donor, pantry, driver, dashboard). No sign-in.
  about.tsx                    "Simulated data" notice, sources, licences, parameters
  (donor)/
    _layout.tsx
    post.tsx                   type or speak the surplus (Taglish, Filipino first, English subtitle)
    confirm.tsx                parsed fields; edit; "Tama, i-post"; "kunin before" explained as a pickup time
    lot/[lotId].tsx            my lot: tentative, final, re-announced; the trace line for it
  (pantry)/
    _layout.tsx
    offers.tsx                 open offers as a list (the table alternative to the map)
    offer/[lotId].tsx          bid, shares left, and "Why did you get this lot?" (utility parts)
  (driver)/
    _layout.tsx
    requests.tsx               delivery requests in my window
    run/[lotId].tsx            commit or decline; schematic route; "Open in Google Maps"
  (dashboard)/
    _layout.tsx
    index.tsx                  live evening: ruler, schematic map, lot tag, bids, driver offers,
                               policy tabs, "Cancel driver", "Replay with baseline"
    trace.tsx                  the message trace (the log), filterable by lot and type
    results.tsx                four policies, computed on the device, with paired intervals
```

The eight screens of the guide (page 18) map onto these routes. The guide's screen 7 (pantry "Final") is `(pantry)/offer/[lotId]`.

**Decision D-21 (route groups per role).** Reason: each role has its own screens, layout and tab set, and the groups keep those apart without custom routing. The root layout redirects by the stored profile. Expo Router's protected-route API should be checked in the SDK 57 docs before it is written (AGENTS.md).

### 6.3 Language

One strings file, `src/i18n/strings.ts`. Each key holds `{ fil, en }`. The type is `Record<StringKey, { fil: string; en: string }>`, so a missing key is a compile error. Donor, pantry and driver screens show the Filipino line first with the English as a small subtitle. The dashboard and results show English. Claude writes the Taglish; Codex reviews it (PRODUCT.md).

**Decision D-22 (one typed strings file).** Reason: PRODUCT.md asks for one file. Pairing the two languages on each key makes the subtitle rule enforceable, and `satisfies` gives completeness at compile time with no i18n library.

### 6.4 Theme

Light and dark follow the system setting (`app.json` already has `userInterfaceStyle: "automatic"`). Tokens are in `src/theme/tokens.ts`, plain objects with no React Native import.

The visual world is the price board in `../.impeccable/surfaces/mockup-salo-mockup-html.md`: a tarp-blue band, kraft tags with string holes, marker-style display type, one lime sticker for live state, condensed labels for readings. The brief forbids card boxes and gradients, and it fixes one tag grid for every lot (item, quantity, storage, pickup by).

**Decision D-23 (theme follows the surface brief, not the guide's stylesheet).** Reason: the surface brief is the product's visual truth. The guide is a study document, and its CSS uses cards the brief forbids. `DESIGN.md` does not exist yet; it will be written after the finish review.

### 6.5 Accessibility

Beyond WCAG 2.2 AA, PRODUCT.md requires: TalkBack on every screen, a list alternative to every map, layouts that hold at 200% font scale, and calmer motion when Android's remove-animations setting is on. The reduce-motion value is read through React Native's `AccessibilityInfo` and held in `theme/`. The exact call is to be checked in the SDK 57 docs before it is used.

The schematic map is drawn with `react-native-svg`, not yet installed. Every map has a table twin: the offers list and the driver run list.

---

## 7. Testing strategy

### 7.1 Engine (Jest, literal numbers)

The engine is pure, so its tests need no React Native preset. The setup is not installed yet. It will use `npx expo install` for the Jest packages, after the testing docs are checked for SDK 57. No package has been installed in this pass.

Tests assert literal numbers taken from the guide and the data, not values computed by the code under test:

| Test | Input | Expected (literal) | Source |
|---|---|---|---|
| Bukal utility | need 0.35, storage 0.25, distance 0.12, freshness 0.10 | total 0.82 | guide p.11 |
| Socorro utility | 0.30, 0.05, 0.18, 0.08 | total 0.61 | guide p.11 |
| Shares left | 40 minus bid 14 | 26 | guide p.12 |
| Reliability, R. Dizon, before | shows 10, runs 11 | 0.85 (11/13 = 0.846) | guide p.15 |
| Reliability, R. Dizon, after withdrawal | shows 10, runs 12 | 0.79 (11/14 = 0.786) | guide p.15 |
| Reliability, all drivers | 40 drivers in `drivers.csv` | 40 of 40 match `round((shows+1)/(runs+2), 2)` | data |
| Road distance | D01 to P01, D01 to P02 | 1.1 km, 0.6 km | data, guide p.11 |
| Refusal | pantry closes 19:00, earliest arrival 19:05 | refuses `closed_before_earliest_arrival` | guide p.8 |
| Worst-served | needs 10, 20, 5; received 6, 18, 5 | worst 0.6; median 0.9 | guide p.12 |
| Cap | evenings with ratios 1.4 and 0.0 | capped mean 0.5 (uncapped 0.7) | guide p.14 |
| Lots per evening | E01 | 52 | `evenings.csv` |
| Lots in total | all evenings | 1,436 | `evenings.csv`, `food_offers.csv` |

Invariant tests, run on every evening in the dataset with every policy:

- no `AWARD_STATE: final` without an earlier `COMMIT` for that lot;
- no `DELIVERY` for a lot that is not `final`;
- no pantry receives more than its need (before the cap);
- no pantry spends more than 40 shares in an evening under Salo;
- driver capacity (`loadUnits`) is never exceeded;
- no event after the last pickup deadline except `FAILURE` and state changes;
- the four policies see identical driver draws for the same (driver, lot) (common random numbers, D-10).

Determinism: running the same evening twice gives identical logs, byte for byte. The first full run's output is recorded as a regression snapshot. Its numbers are not written here, because they have not been produced yet.

### 7.2 Data

`gen:data --check` (section 3.2) and the row-count assertions are the data tests.

### 7.3 Parse

Scored offline on `donor_messages.csv`, with the split rules in section 5.4. Reported on pilot and main messages only. The number is labelled an upper bound.

### 7.4 Sync

Unit tests for the reducer that applies `seq`, for gaps and duplicates, and for the replay path. A relay test with two WebSocket clients: post a lot, receive `lot.ack`, see events, disconnect, reconnect with `lastSeq`, and receive the missing entries only.

### 7.5 App and device

Component tests with a React Native test renderer where useful. On-device checks are manual and recorded by mobile-independent-qa: an Android emulator (`vel_phone`) and the user's phone through a development build, TalkBack on each screen, 200% font scale, reduce-motion on.

### 7.6 Gates

Before any task is called done: `npx tsc --noEmit` and `npx expo lint`, both with output shown. `npx expo-doctor` before the first dependency change.

---

## 8. Open decisions (need the user's go-ahead)

Each item says what is undecided, the options, and a recommendation. None of them blocks the types or the engine skeleton. Items marked **blocks results** must be settled before the results screen is final.

**O-1 Which driver offer wins (driver stage).** The guide says drivers are chosen by ETA and that "reliable drivers are offered runs first". It does not say how the two combine.
- (a) Earliest ETA that meets the pickup deadline. Simple and explainable.
- (b) Highest reliability among offers that meet the deadline. Matches "trusts reliable drivers first".
- (c) An expected on-time score combining ETA slack and reliability. Most realistic, least explainable.
- Recommendation: (a) for v1, with reliability as the tie-break. Both guide examples (R. Dizon at 19:05 and J. Ramos at 19:20) come out the same under (a) and (b).

**O-2 Travel times for bicycle and tricycle drivers (data gap, blocks results for 7 drivers).** `drivers.csv` has 4 bicycle and 3 tricycle drivers. `road_distances.csv` has times only for motorcycle and car. The engine would otherwise have no time for those drivers.
- (a) Add bicycle and tricycle speeds to `params.json` in the dataset repo, rebuild, and update checksums.
- (b) Treat them as motorcycles for now.
- (c) Exclude them from the driver pool.
- Recommendation: (a). It is a data change in the dataset repo, so it needs `verify.py --update`.

**O-3 How a value becomes a share bid (blocks results, and the guide says it is open).** Guide page 12: "the exact rule for turning value into shares is still an open design question".
- Candidate: `shares = min(remaining, round(scale x utility))`, with `scale` tuned on tuning evenings.
- The guide's own bids do not fit one such scale. A scale of 17 gives Bukal (0.82) 14 shares, as the guide says, but gives Socorro (0.61) 10, not 9. So either the guide's numbers are illustrative, or the rule has another term (an offset, or a share of what is left).
- Recommendation: fix this form before tuning and freeze it with the other parameters. Say which one, or confirm that the guide's bids are illustrative.

**O-4 First-come-first-served timing (blocks results).** Guide page 19 says "whoever replies first gets it", but the guide does not say when pantries reply or how long round 1 stays open.
- Proposal: each pantry's reply minute is `postedMinute + U x 5` minutes (seeded, common random numbers), and round 1 closes 5 minutes after posting. The bid window length goes into `params.json` as a named value.
- Recommendation: approve the 5-minute window and the uniform reply model, or give different values.

**O-5 Definition of food wasted (blocks the fairness and waste claims).** Guide page 14 says "kg posted that no pantry received". Guide page 19 says it is "roughly total posted minus food rescued". These are not the same when a pantry receives more than its need.
- (a) Wasted = posted kg minus rescued kg (capped). Then wasted and rescued mirror each other exactly for the same baseline.
- (b) Wasted = posted kg minus on-time kg received, uncapped. This matches the "no pantry received" wording.
- Recommendation: (a), because food beyond need is not rescued, and the guide's own sentence about "roughly" fits it. The guide's text then needs a one-line change.

**O-6 Lateness and no-shows.** The guide defines on-time (before the pickup deadline) but not how late a late run is.
- Proposal: the four outcomes from `driver_runs.csv`. Minutes late for `completed_late` are drawn from the tuning runs' `minutes_late` values, using the seeded draw from section 2.6.
- Recommendation: approve. It uses data the project already has.

**O-7 Do losing bids spend shares? (blocks results).** Guide page 12: "Bidding spends shares". Its example subtracts only Bukal's bid (40 minus 14 = 26), and Socorro's bid of 9 is not subtracted anywhere.
- (a) Only the winning bid spends shares. Easier to explain: "your 14 shares were spent on Lot 14".
- (b) Every bid spends shares. Pantries that bid on many lots run out sooner.
- Recommendation: (a), and the guide's "bidding spends shares" changed to "winning bids spend shares".

**O-8 How many evenings the phone runs (blocks results).** The dataset has 10 tuning evenings (E01 to E10), 10 pilot evenings (E11 to E20) and **10** main evenings (E21 to E30). The brief asks for 30 evenings x 4 policies on the phone. The guide says "30 to start; the pilot sets the final count".
- (a) Run the 10 main evenings only. The dataset as it is.
- (b) Regenerate the dataset with more main evenings, then run the count the pilot sets. This is the guide's rule.
- (c) Include pilot evenings in the results. Not recommended: it breaks the held-out rule (guide p.12, D-11).
- Recommendation: (b). The number is still set by the pilot, as the guide requires. The phone's results screen takes that count as a parameter.
- **Resolved 2026-10-13 (Arjhine), changed later the same day:** the Results screen shows no main_sample (E21 to E30) number until the pilot on E11 to E20 has run and the number of main evenings is written down. Guide page 19: "I then set the number of main evenings so each 97.5% interval’s full width is smaller than the smallest gap worth caring about (6 kg per evening; a fairness target fixed before the pilot), and write that number down before any main runs." The written count is stored as a frozen parameter, alongside the tuned values, before the main runs are allowed to start. The runner refuses to start main_sample jobs while it is missing, and the screen shows "Not measured yet" with a "waiting for the pilot" note. If the count is above 10, the dataset is regenerated with more main evenings first. Interval levels stay as on guide page 19: 97.5% for the two main results and 95% for the 10 supporting ones.
- *Change to the earlier 2026-10-13 decision:* that decision showed the 10 main_sample evenings straight away with a "provisional count" note. It is withdrawn, because main results seen before the count is fixed could influence the count, which page 19 rules out.
- **Is adding main_sample evenings append-only? Checked 2026-10-13: not fully. Lots, needs, evenings and driver runs are unchanged; donor messages are not.**
  - *Method.* `dataset/build_dataset.py` was copied to a scratch folder unchanged and rebuilt. All 12 published CSVs came out byte-identical, so the scratch build is a faithful baseline. Then only two lines of the copy were changed: the loop `range(1, 31)` became `range(1, 41)`, and the split list gained 10 more `main_sample` evenings. The E01 to E20 rows were then compared with the published CSVs by key. The build script itself was **not** changed.
  - *Unchanged (identical by diff):*
    - `evenings`: 20 of 20 rows;
    - `pantry_needs`: 600 of 600 rows;
    - `food_offers`: 959 of 959 rows, same lot IDs;
    - `driver_runs`: 406 of 406 rows;
    - `drivers`, `pantries`, `donors`, `road_distances`: whole tables.

    Each evening draws from its own seeded generator (`SEED * 100 + e`), lot IDs are numbered in evening order, and driver runs use only E01 to E10 lots with their own generator. That is why these rows don't move.
  - *Changed:* `donor_messages`. `messages.build()` samples 500 lots from **all** evenings at once (`offers.sample(n=500, random_state=SEED)`), then writes them one after another from a single generator, numbering them M0001 onwards. With 10 more evenings in the pool:
    - the E01 to E20 messages drop from 329 to 259;
    - only 164 of those lots keep a message;
    - only 1 of those 164 keeps the same text and gold labels;
    - message IDs shift, and the split counts move from 163 / 166 / 171 (tuning / pilot / main) to 132 / 127 / 241.

    So the tuning and pilot messages the parser would be developed and checked on would change.
  - *Fix applied: dataset v1.1 (approved by Arjhine 2026-10-13; this replaces the option A chosen earlier the same day).* `messages.build()` now samples 17 lots per evening and writes their messages with a generator seeded from that evening's own seed. Message IDs run in evening order. Verification:
  - `verify.py --update`, then `verify.py`: 16 of 16 files match.
  - Every table except `donor_messages.csv` is byte-identical to v1.0.
  - `donor_messages` has 510 rows, 170 per split.
  - A 40-evening scratch build reproduces all 510 E01 to E30 messages exactly, `message_id` included, and the new ones start at M0511.

  Adding main evenings is now append-only for every table. Recorded in the dataset repo's README changelog as v1.1. The v1.0 messages had not been used to tune any parser rule or prompt (checked `src/` and `docs/` on 2026-10-13).

**O-9 In-evening learning during evaluation.** Guide page 15 says learning is frozen between evenings, and its R. Dizon example shows an update within an evening after a withdrawal.
- Recommendation: in-evening updates apply to every evaluation run, Salo and central greedy alike, and reset at the start of each evening. Confirm.

**O-10 Human-held pantry and driver profiles.** When a real person holds a pantry or driver profile, the simulated agent must not also answer for them.
- Proposal: a held profile's decision comes from the person's `input` before a simulated deadline. Silence counts as a decline, and the simulated agent answers only for unheld profiles.
- Recommendation: approve. Without it the demo can show a driver committing on a phone that the driver never touched.

**O-11 The guide's worked example lot is not in the dataset (does not block).** Lot 14 (3 trays adobo, pickup by 20:00, Bukal 14 shares, Socorro 9) is not a row in `food_offers.csv`; L0014 is ensaymada. Its distances (D01 to P01 1.1 km, D01 to P02 0.6 km) do match.
- Options: add an anchor lot to the dataset, or have the demo post a live lot that reproduces the example. Recommendation: add the anchor in the dataset build, since the README says anchors reproduce the project's worked examples.

**O-12 LAN pairing code (does not block).** Proposed in section 4.5. The security agent should confirm the approach.

**O-13 Licence for the derived map (does not block).** ODbL covers OpenStreetMap-derived databases. A derived schematic is probably a produced work, but the share-alike question should be checked by mobile-release before any public release. The About screen carries the attribution now.

---

## 9. Conflicts between the sources

**C-1 Python and Mesa engine, and a server database (guide page 17) versus PRODUCT.md.** The guide says the agents run in Python with Mesa, and that a server database stores users, lots, bids and awards. PRODUCT.md (decided 2026-10-13) says the Python/Mesa engine is not part of v1, there is no hosted backend, and the simulation runs in the app. **PRODUCT.md is followed.** The "database" requirement is met on the device (D-20), and the laptop keeps no database (D-15).

**C-2 Users table (guide page 17) versus no sign-in (PRODUCT.md).** No users are stored. The only identity is the dataset profile id (D-20).

**C-3 Thirty main evenings (guide page 19) versus ten (dataset).** See O-8.

**C-4 Frozen learning versus in-evening updates (guide page 15).** See O-9.

**C-5 Food wasted, two definitions (guide pages 14 and 19).** See O-5.

**C-6 Bidding spends shares (guide page 12) versus its example.** See O-7.

**C-7 Worked example not in the data (guide page 10, 11, 14).** See O-11.

**C-8 Travel times for four vehicle types, two in the data (dataset `vehicle` column versus `road_distances.csv`).** See O-2.

**C-9 Visual style (guide stylesheet) versus the surface brief.** The surface brief forbids card boxes. The app follows the brief (D-23).

---

## 10. Decision register

| ID | Decision | Reason | Section |
|---|---|---|---|
| D-01 | Engine is in-app pure TypeScript; imports nothing from React or Expo. No Python or Mesa in v1. | PRODUCT.md Stack; the engine must run on the dashboard phone, under Jest and in tuning | 1, 2 |
| D-02 | No hosted backend. The laptop runs one Node process: relay plus LLM proxy. | PRODUCT.md Stack | 1, 4 |
| D-03 | The dashboard phone is the only writer of events and `seq`. | PRODUCT.md (dashboard runs the evening); one writer gives one order with no database or consensus | 4 |
| D-04 | The event log is the single source for replay, trace and metrics. | One run, one truth; no counter can drift from the log | 2.9 |
| D-05 | Integer minutes; no geometry or transcendental maths in the engine; road times precomputed. | Determinism across Hermes, V8 and Jest; the dataset's times already match the formula | 2.1 |
| D-06 | Inputs are logged; replay is seed, world and input log. | Live posts otherwise make a run unreproducible | 2.5 |
| D-07 | One driver stage shared by all four policies; policies differ only in `choosePantry`. | Isolates the rule under test | 2.8 |
| D-08 | Share budget is 40 per pantry per evening, Salo only, reset at 16:00. | Guide p.12; each evening is one day | 2.8 |
| D-09 | Reliability is a Beta-Bernoulli count from `tuning_shows` and `tuning_runs`, updated in-evening, reset each evening. | The update needs counts; the frozen estimate alone cannot be updated | 2.7 |
| D-10 | Counter-based RNG keyed on (seed, entity, lot): common random numbers. | Paired comparison is fair only if each method faces the same draws | 2.6 |
| D-11 | Tuning runs offline on the laptop, on tuning evenings only; the phone runs results with frozen values. | Frozen values must be written before the pilot; the diff shows the phone never tunes | 2.12 |
| D-12 | `scripts/gen-data.mjs` converts CSVs to typed modules; hooked into start and build; output committed; `--check` mode. | The brief asks for build-time conversion; no new dependency; reviewable diffs; CSV has quoted commas | 3.2 |
| D-13 | Bundle 9 tables and `sources.csv`; exclude `donor_messages.csv` and `driver_runs.csv`. | Only what the app reads; about 156 KB saved | 3.1 |
| D-14 | Map is a precomputed schematic from the pinned OSM roads, drawn in SVG; no tiles, no Maps key. | PRODUCT.md | 3.3 |
| D-15 | The relay has no database; the dashboard re-sends its log on reconnect. | The dashboard already holds the authoritative log | 4.1 |
| D-16 | Each phone works alone offline; donors use an outbox; dashboard needs no network. | PRODUCT.md | 4.4 |
| D-17 | The LLM is a sensor only; every field validated; the donor confirms every field. | PRODUCT.md; guide p.16 | 5.3 |
| D-18 | Model id `claude-haiku-5-5` from PRODUCT.md, not yet re-verified against the API reference. | Verification before the server is written | 5.2 |
| D-19 | No state library. `useSyncExternalStore` over small stores; Context for slow values. | Event stream, not request-response; React 19 has the primitive | 6.1 |
| D-20 | SQLite (`expo-sqlite`, to be added) for log, outbox, results cache and profile id. | The assignment requires a database; no accounts | 6.1 |
| D-21 | Expo Router route groups per role; root redirects by stored profile. | PRODUCT.md roles; AGENTS.md | 6.2 |
| D-22 | One typed strings file; each key holds `fil` and `en`. | PRODUCT.md; compile-time completeness | 6.3 |
| D-23 | Theme follows the surface brief; the guide's stylesheet is not reused. | `.impeccable/surfaces` is the visual truth | 6.4 |
| D-24 | No worklet runtime at first; chunked loop; a measured spike decides. | Simplicity first; `react-native-worklets` is available if needed | 2.11 |
| D-25 | Jest for the engine with literal numbers; no RN preset needed for pure code. | PRODUCT.md testing expectations; the brief | 7.1 |
| D-26 | Pairing code and LAN-only binding for the relay. | Anyone on the Wi-Fi could otherwise post or respond | 4.5 |
| D-27 | Engine IDs are dataset IDs; live lots `LIVE-<n>`; no UUIDs in the engine. | Readable trace; deterministic | 2.5 |
| D-28 | Dashboard and results are English; donor, pantry and driver screens are Filipino first. | PRODUCT.md Brand Commitments | 6.3 |

---

## 11. Verification run in this pass

Commands and their real results:

- `node_modules/.bin/tsc --noEmit` **before** writing `types.ts` (baseline, the repo as found): exit 0.
- `node_modules/.bin/tsc --noEmit` **after** writing `src/engine/types.ts`: exit 0. `--listFiles` includes `src/engine/types.ts`. `--showConfig` shows `"strict": true`.
- `node_modules/.bin/tsc --noEmit` **after** the `Driver` change (tuning counts added, section 2.7): exit 0. `types.ts` was not changed after that run; the doc edits do not touch TypeScript.
- `src/engine/types.ts` has no `import` or `require` and no `any`. Checked with `grep`.
- Dataset checks (Node, read-only):
  - `drivers.csv`: 40 of 40 drivers have `reliability_estimate_frozen` equal to `round((tuning_shows + 1) / (tuning_runs + 2), 2)`. 0 mismatches.
  - `tuning_shows` equals the count of `completed` plus `completed_late` rows in `driver_runs.csv`, for all 40 drivers. 0 mismatches.
  - `tuning_runs` equals the number of `driver_runs.csv` rows per driver, for all 40 drivers. 0 mismatches.
  - `driver_runs.csv` covers evenings E01 to E10 only.
  - `evenings.csv` splits: 10 tuning, 10 pilot, 10 main_sample.
  - `food_offers.csv` has 1,436 rows, and `lots_posted` sums to 1,436.
  - `road_distances.csv` has 1,500 rows (50 donors x 30 pantries).
  - Drivers by vehicle: motorcycle 29, car 4, bicycle 4, tricycle 3.
- Not run: `npx expo lint` (no lint config change in this pass; the lint command was not run). `npx expo-doctor` (no dependency change). No package was installed.

---

## 12. Next steps (for the orchestrator)

1. The user answers O-1, O-3, O-4, O-5, O-7, O-8 and O-10. These block the results screen, not the engine skeleton.
2. Dataset owner: O-2 (bicycle and tricycle speeds) and O-11 (anchor lot), then `verify.py --update`.
3. mobile-data: write `scripts/gen-data.mjs` and the generated modules, with `--check`.
4. mobile-feature: the engine skeleton (`rng`, heap, sim loop, policies, metrics) and the Jest suite from section 7.1.
5. mobile-native: add `expo-sqlite`, `react-native-svg`, notifications and the speech module with `npx expo install` after docs checks, and plan the development build for voice.
6. server owner: the relay and the proxy, after the Anthropic API reference check (D-18).
