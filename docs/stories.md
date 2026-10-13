# Salo Android app: user stories

Status: draft v1, 2026-10-13. Owner: mobile-product agent. Not committed.
Platform: Android first. Test device: emulator `vel_phone` (unless a story says otherwise). The user's own Android phone runs Expo Go; donor voice input needs the local Android development build (APK). iOS is untested and nothing is claimed for it.

Sources (product spec):
- `PRODUCT.md` (Stack, Users, Principles). Cited as "PRODUCT".
- `guide/salo-guide.html`. Cited as "guide p.N", where N is the printed page number (section 09 is on p.10, and so on).
- `mockup/salo-mockup.html`. Cited as "mockup Fig 1", "Fig 1b", "Fig 2" (donor), "Fig 3" (results).
- `salo-evening-dataset-repo/README.md`. Cited as "dataset".
- `.impeccable/surfaces/mockup-salo-mockup-html.md` (visual world).

Simulated data: every business, pantry, driver and number in the app comes from the Salo Evening Dataset or the mockup. All are fictional or simulated, and the app labels them so (CC-11).

## How to read this

- **P0**: needed for one complete evening: post, bids, tentative award, driver commit, delivery, plus Cancel driver recovery. Build and test these first.
- **P1**: needed for v1 scope (all four roles, failure recovery, in-app experiments, accessibility audit) but not on the P0 path.
- **P2**: cut first if time runs out.
- **(assumption)**: not stated in any source. It is my default. Each one is listed under Open questions.
- Quoted copy comes from the mockup or PRODUCT. Other Filipino and English copy is my assumption and goes in the one strings file for review.
- Every acceptance criterion is pass or fail on the emulator, unless marked "not testable on emulator".

## Summary

| Section | Stories | P0 | P1 | P2 |
|---|---|---|---|---|
| Donor (DON) | 6 | 5 | 1 | 0 |
| Pantry coordinator (PAN) | 7 | 6 | 1 | 0 |
| Volunteer driver (DRV) | 6 | 5 | 1 | 0 |
| Live dashboard and demo (DSH) | 7 | 5 | 2 | 0 |
| Results and experiments (RES) | 7 | 0 | 6 | 1 |
| Cross-cutting (CC) | 12 | 5 | 6 | 1 |
| **Total** | **45** | **26** | **17** | **2** |

Build order for the deadline: the 26 P0 stories first, then the P1 stories that the demo needs (DSH-06 map, CC-06 two-phone sync, RES-01 to RES-05), then the rest of P1, then P2.

---

## Donor

### DON-01 · P0 · Describe the surplus by typing in Taglish

As a donor (karinderya, panaderia or stall owner) at closing time, I want to type tonight's leftovers the way I would text them, so that I can post in under a minute without filling in a form.

Acceptance:
- The donor home shows "May sobrang pagkain ba ngayong gabi?" with "Any extra food tonight?" beneath it, and a text box.
- Sending "may 3 trays adobo pa at 20 pandesal, kunin before 8" shows two cards: Adobo, 3 trays, storage "Kailangan ng ref kung itatabi"; and Pandesal, 20 pieces, storage "Walang ref". A pickup line reads "Kunin bago 8:00 PM".
- Sending the same content in plain English ("3 trays adobo, pickup before 8") produces the Adobo card and the 8:00 PM pickup line.
- Sending does not post anything. The dashboard lot count is unchanged.

Source: guide p.16; mockup Fig 2; PRODUCT (LLM as sensor only).

### DON-02 · P0 · Confirm or edit each item before it posts

As a donor, I want to check what the app understood and fix any field, so that a wrong amount never reaches a pantry.

Acceptance:
- Each card has a "Baguhin" (edit) control and shows "Dami · Amount", "Uri · Kind" and "Imbakan · Storage" (mockup Fig 2).
- Storage text: cooked food shows "Kailangan ng ref kung itatabi · if kept"; bread shows "Walang ref · no fridge needed".
- The two actions are "Tama, i-post / Correct, post it" and "May mali, aayusin ko / Something's wrong, I'll fix it".
- Editing "3 trays" to "4 trays" before posting results in a lot of 4 trays. The edited value is what posts, not the parser output.
- A card with a missing amount cannot be posted. The post button is disabled and the missing field is named (assumption).
- Where the message gives a tray count, the card shows an approximate kg. Fixture: 3 trays shows "about 6 kg" (mockup Fig 1, 2). The 2 kg per tray factor is an assumption, used for display only.

Source: guide p.16; mockup Fig 2; PRODUCT Principle 5.

### DON-03 · P0 · A pickup time is never shown as an expiry

As a donor, I want the pickup deadline to be labelled as a pickup time, so that nobody reads it as a food-safety date.

Acceptance:
- On the confirm screen the pickup line reads "Kunin bago 8:00 PM" with the sub-line "Oras ito ng pagkuha, hindi expiry. / This is a pickup time, not an expiry date." (mockup Fig 2).
- The same note appears on the dashboard lot tag: "Pick up by 20:00" with "pickup time, not expiry" (mockup Fig 1).
- No field label uses "expiry", "expires" or "best before". Check: the strings file contains these words only inside the negated note.
- "before 8" in the evening context becomes 20:00 (assumption, matching the mockup's "pickup by 20:00").

Source: guide p.16; mockup Fig 1, Fig 2; PRODUCT Capabilities.

### DON-04 · P0 · Posting creates lots

As a donor, I want each confirmed item to become a lot on the evening board, so that pantries can bid on it.

Acceptance:
- Before posting, the screen says "Magiging Lot 14 at Lot 15 ito. / This becomes Lots 14 and 15." with the lot numbers that will be assigned (assumption: lot numbers are sequential within an evening).
- Tapping "Tama, i-post" creates one lot per confirmed card. The event log gets one CALL_FOR_PROPOSALS per lot, from the donor to all pantries, timestamped at the post.
- Each lot shows "Posted 18:40 by Karinderya ni Aling Oning" (mockup Fig 1).
- Posting works with the proxy switched off (CC-03).
- A double tap on "Tama, i-post" creates one set of lots, not two.

Source: guide p.10; mockup Fig 1, Fig 2.

### DON-05 · P0 · See my lot's status through to delivery

As a donor, I want to see whether my lot is held, final, re-announced or delivered, so that I know what to expect.

Acceptance:
- The donor's lot list shows one status per lot, with the same word the dashboard uses: Posted; Tentative ("Held until a driver commits"); Final; Re-announced; Delivered.
- The donor agent accepts the highest share bid tentatively without a donor tap (assumption; see Open questions). The donor sees "Tentative", not "Final" or "Awarded".
- A test that sends TENTATIVE_ACCEPT and no COMMIT leaves the lot Tentative indefinitely.
- After a driver cancels, the lot shows "Re-announced". The pantry's award is unchanged.
- The status on the donor's phone matches the dashboard for the same lot at every step.

Source: guide p.10, p.13, p.14; mockup Fig 1, Fig 1b. The donor-phone view is my assumption. The guide specifies the dashboard and pantry screens only.

### DON-06 · P1 · Speak instead of typing

As a donor with customers at the counter, I want to tap and speak my leftovers, so that I can post with my hands full.

Acceptance:
- "Pindutin at magsalita / Tap and speak" (mockup Fig 2) starts on-device speech recognition in the Android development build (APK).
- In Expo Go the voice button is hidden or says voice needs the app build (assumption).
- The transcript appears in the text box, editable, before parsing. Nothing parses or posts without a send tap and then the DON-02 confirmation.
- If speech recognition is unavailable or permission is denied, the typing path still works and the screen says so (copy assumption).
- Test on the user's phone (APK) with a spoken Taglish message. On vel_phone, run this only if the emulator microphone is configured; otherwise record it as not run.

Source: PRODUCT Stack (Voice). The guide says voice is "if time permits" (p.17). See Open questions.

---

## Pantry coordinator

### PAN-01 · P0 · See open lots

As a pantry coordinator, I want to see each open lot with what it is, how much, whether it needs a fridge, when it must be picked up and how far away it is, so that I can judge it at a glance.

Acceptance:
- The open-lots list, opened as a dataset pantry profile (for example Bukal Community Kitchen), shows for each lot: item, amount, storage, pickup-by time and distance in km.
- Lot 14 fixture: Bukal shows 1.1 km; Socorro Street Pantry shows 0.6 km (mockup Fig 1 table).
- Amounts and times are text, not color alone.
- A lot whose pickup deadline has passed is not listed (assumption).
- Filipino-first copy with English beneath (CC-05).

Source: guide p.10; mockup Fig 1, Fig 3.

### PAN-02 · P0 · The pantry agent bids shares with a visible value

As a pantry coordinator, I want the pantry's agent to value each lot from need, storage, distance and freshness and bid shares on it, so that the pantry gets food it can use and every bid is explained.

Acceptance:
- For each open lot the screen shows four parts and their total, to two decimals, and the total equals the sum of the parts.
- Lot 14 fixture, Bukal: need tonight 0.35 + can store 0.25 + distance 0.12 + freshness 0.10 = 0.82.
- Lot 14 fixture, Socorro: 0.30 + 0.05 + 0.18 + 0.08 = 0.61.
- The four parts come from the pantry's own data (need, fridge, distance, freshness). Nothing is typed in by hand or hard-coded per lot.
- The bid is shown in shares: Lot 14 fixture, Bukal 14 shares and Socorro 9 shares. The rule that turns value into shares is still an open design question (guide p.12). This story passes only once that rule is frozen. Before then, treat the 14 and 9 as expected values to compare against, not as a rule check.
- A bid never exceeds the shares left (PAN-04).
- The pantry agent bids automatically. The coordinator sees the bid and cannot change it in v1 (assumption).

Source: guide p.10 to p.12; mockup Fig 1, Fig 3.

### PAN-03 · P0 · Refuse a lot the pantry cannot take

As a pantry coordinator, I want my agent to refuse a lot the pantry cannot take, and to say why, so that food is never offered to a pantry that is closed.

Acceptance:
- Anonas Feeding Program (closes after 19:00, per guide p.8 and mockup Fig 1) refuses Lot 14 at 18:40:03, with the reason "Closed after 19:00, before any delivery could arrive". The fixture's earliest delivery is 19:05, after closing.
- The refusal is a REFUSE message in the trace (DSH-04) and is shown on the pantry's own screen with the same reason.
- Socorro Street Pantry (no fridge) does not refuse Lot 14. It bids 9 shares at value 0.61. Refusal applies only when a pantry is closed or cannot store the food at all (guide p.11).
- The refusal check runs before scoring. A refused lot shows no value.

Source: guide p.8, p.11; mockup Fig 1, Fig 3.

### PAN-04 · P0 · Daily share budget of 40

As a pantry coordinator, I want my pantry to have a daily budget of shares, so that one large pantry cannot win every lot.

Acceptance:
- Each pantry starts with 40 shares.
- After a bid of 14 on Lot 14, Bukal shows 26 left (40 − 14). Socorro after a bid of 9 shows 31 left.
- A pantry cannot bid more than it has left. With 0 left it refuses the lot with the reason "no shares left" (assumption on wording).
- The budget does not reset during an evening. The reset boundary is an open question.
- The 40 is fixed. It is not a tuned parameter, and every method gets the same 40 (guide p.12).

Source: guide p.12; mockup Fig 3 ("Each pantry has 40 shares to spend tonight").

### PAN-05 · P0 · A tentative award is held, not final

As a pantry coordinator, I want to know when the pantry has been tentatively given a lot, so that I hold it without treating it as final.

Acceptance:
- When the donor's TENTATIVE_ACCEPT names this pantry, the lot card shows "Tentative" with "Held until a driver commits" (mockup Fig 1).
- A tentative lot is not counted as delivered, final or rescued in any output. If it is never committed by the end of the evening, it is counted as stranded (RES-02).
- A pantry that lost a lot sees "Outbid" (assumption on wording).
- Test: stop after TENTATIVE_ACCEPT and advance the simulated clock 10 minutes. The lot is still Tentative, with no automatic change to Final.

Source: guide p.13; PRODUCT Principle 2.

### PAN-06 · P0 · The award becomes final after a driver commits

As a pantry coordinator, I want to see when the award is final and why it changed, so that I can prepare the food with confidence.

Acceptance:
- When a driver COMMITs and the donor then COMMITs to the pantry, the lot shows "Final". Fixture: "Award is final" at 18:43:14 (mockup Fig 1b).
- If a driver cancelled before committing, the pantry sees a note that the earlier driver withdrew and a new driver committed (guide p.14, screen 7). The award stays Tentative while the delivery is re-announced (mockup Fig 1b: "Bukal keeps its tentative award").
- The pantry is not asked to bid again during a re-announcement (guide p.14).
- Test: Cancel driver (DSH-05), then J. Ramos commits. The pantry screen shows "Final" with the note.

Source: guide p.13, p.14; mockup Fig 1b.

### PAN-07 · P1 · "Why did you get this lot?"

As a pantry coordinator, I want a plain explanation of any bid or result built from real scores, so that I can trust the decision.

Acceptance:
- A "Why did you get this lot?" screen (heading from mockup Fig 3) lists the four parts with their numbers, the shares bid, the shares left, and the outcome.
- The sentence is filled in from a template with the numbers. No generated text.
- Fixture for Bukal: total 0.82, 14 shares, 26 shares left, 1.1 km.
- Changing one part in the fixture changes the total and the sentence.

Source: PRODUCT Principle 1; mockup Fig 3.

---

## Volunteer driver

### DRV-01 · P0 · See a delivery request

As a volunteer driver, I want to see a delivery request with the pickup, the drop-off and the deadline, so that I can decide quickly.

Acceptance:
- A request shows the pickup (donor and street), the drop-off (pantry and street) and "before 20:00". Filipino-first copy with English beneath.
- Requests appear only for drivers whose availability overlaps the pickup window (assumption; PRODUCT lists eligibility checks).
- A new request appears within the sync interval (CC-06). On a single device it appears immediately.
- Fixture: Lot 14 appears as "Aurora Blvd to Bukal, before 20:00" for R. Dizon.

Source: guide p.10; PRODUCT Capabilities; mockup Fig 1.

### DRV-02 · P0 · Offer to deliver with an ETA

As a volunteer driver, I want to offer a delivery with my estimated arrival time, so that the pantry and donor know when it will arrive.

Acceptance:
- An "Offer to deliver" control sends a PROPOSE to the donor (wording is an assumption).
- The ETA comes from the road distance on the pinned road network and the pickup time. The speed model is an assumption, and its values live in the dataset parameters.
- Fixture: R. Dizon's offer reads "by 19:05". J. Ramos's offer reads "by 19:20".
- If the computed ETA is after the deadline (20:00), no offer control is shown. The driver agent only offers runs it can finish before the deadline (guide p.8, goal-based planning).
- The PROPOSE appears in the trace (DSH-04).

Source: guide p.10, p.15; mockup Fig 1, Fig 1b.

### DRV-03 · P0 · Commit to a run

As a volunteer driver, I want to commit to a run I offered, so that the award becomes final.

Acceptance:
- The commit control is available only after an offer is made. Before an offer it is not shown.
- Tapping Commit sends COMMIT. The run card reads "Committed, delivers before the 20:00 pickup deadline" (mockup Fig 1b).
- The donor and pantry then see "Final" (after the donor's COMMIT to the pantry, PAN-06).
- Test: R. Dizon offers, then commits. The trace shows COMMIT, and the lot becomes Final.

Source: guide p.10, p.14; mockup Fig 1b.

### DRV-04 · P0 · Decline a request, or withdraw before committing

As a volunteer driver, I want to decline a request, or step back before committing, so that I never hold a run I cannot do.

Acceptance:
- "Decline" on a request sends nothing to the donor and removes the request from my list.
- After an offer and before commit, "Withdraw" sends FAILURE with the text "Cancelled before committing" (mockup Fig 1b). The lot stays Tentative, and only the delivery is re-announced (DSH-05).
- A withdrawal after an offer counts as a missed run. Fixture: R. Dizon's record moves from 10 of 11 to 10 of 12, and his estimate from 0.85 to 0.79 (guide p.15).
- After COMMIT the driver cannot withdraw on the phone in v1 (assumption). The dashboard's Cancel driver control covers the demo.

Source: guide p.13, p.14, p.15; mockup Fig 1b.

### DRV-05 · P0 · Mark pickup and delivery, on time or not

As a volunteer driver, I want to mark the pickup and delivery of my committed run, so that the food counts as rescued only when it arrives in time.

Acceptance:
- A committed run shows the steps "Picked up" and "Delivered" (assumption: tap steps; the open question is whether the simulated clock completes them).
- A delivery at or before the pickup deadline counts toward food rescued. Fixture: delivered at 19:20 against the 20:00 deadline counts. A delivery after 20:00 does not count as on time (guide p.19: kg delivered before the pickup deadline).
- Lot status changes to "Delivered" on the donor, pantry and dashboard screens (mockup Fig 1: "Lot 12 · delivered").
- The fixture's 3 trays count as "about 6 kg" for food rescued (mockup Fig 1, 2).

Source: guide p.14, p.19; mockup Fig 1.

### DRV-06 · P1 · See the route, then open it in Google Maps

As a volunteer driver, I want to see my route on the app's map and open turn-by-turn directions in Google Maps, so that I can ride the route without the app doing navigation.

Acceptance:
- The committed run's route is drawn on the schematic map (DSH-06). It is shown as a tentative route until the award is Final, then it turns solid (mockup Fig 1).
- "Open in Google Maps" opens Google Maps with pickup as the origin and the pantry as the destination (assumption: URL or intent format; fallback to the browser when Google Maps is missing).
- The app does not draw turn-by-turn directions (PRODUCT Stack).
- The route is also listed as text, with street names, for TalkBack (CC-08).

Source: PRODUCT Stack (Driver navigation, Map); mockup Fig 1.

---

## Live dashboard and demo

### DSH-01 · P0 · Run the simulated evening on a clock

As the presenter, I want the evening to run on a clock with a speed control, so that a four-hour evening fits into the demo.

Acceptance:
- The header reads "Cubao to Project 4 · Thursday evening" with a "SIMULATED" badge that stays visible in every state (mockup Fig 1).
- A clock runs from 17:00 to 21:00 with a "now" needle. The demo fixture starts at 18:42 (mockup Fig 1). The start time is configurable (assumption).
- Speed is 10× (mockup Fig 1). At 10×, one simulated minute takes about 6 real seconds (assumption on tolerance).
- Test: start at 18:42 at 10×. After 60 real seconds the clock reads 18:52, within ±1 simulated minute.
- Pause and resume are available (assumption).

Source: mockup Fig 1; PRODUCT Operating Context (fast-forward).

### DSH-02 · P0 · Each lot is a tag with a status sticker

As the audience, I want each lot on the board to show what it is and where it stands, so that I can follow one lot through the evening.

Acceptance:
- Each lot is one tag: lot number, item, amount, storage, "Pick up by 20:00" with the pickup-time note (DON-03), and "Posted 18:40 by Karinderya ni Aling Oning".
- The sticker shows exactly one of: Posted; Tentative ("Held until a driver commits"); Final; Re-announced; Delivered.
- The status is shown as text plus the sticker shape, never by color alone (PRODUCT Accessibility).
- Fixture for Lot 14: Tentative at 18:40:06, Re-announced at 18:43:10, Final at 18:43:14.

Source: mockup Fig 1, Fig 1b; guide p.12 to p.14.

### DSH-03 · P0 · Bids ranked, with the leader re-marked

As the audience, I want to see every bid on a lot ranked, with the leader changing as bids come in, so that I can see why the lot moved.

Acceptance:
- Bids on a lot are listed largest share count first (mockup Fig 1: "bids ranked by type size").
- Each bid shows the pantry, shares, fridge status, feeds count, distance and value. Example: "Bukal Community Kitchen · 14 shares · Has a fridge · 1.1 km · Values it at 0.82".
- When a new bid overtakes the leader, the old leading value is struck through and time-stamped: "Re-marked at 18:40:05 when Bukal outbid Socorro" (mockup Fig 1). TalkBack reads the old value as "was 9 shares" (CC-08).
- A refusal shows as "REFUSED", with the reason from PAN-03.
- Test: the Lot 14 sequence of PROPOSE events ends with Bukal leading at 14 shares and the 9 struck through.

Source: mockup Fig 1; guide p.10, p.11.

### DSH-04 · P0 · Message trace for every lot

As the audience, I want to see each agent message in order, with what it means, so that the negotiation is visible.

Acceptance:
- A trace lists every message in time order, with time (hh:mm:ss), type (CALL_FOR_PROPOSALS, PROPOSE, REFUSE, TENTATIVE_ACCEPT, COMMIT, FAILURE), from → to, and a plain-words meaning.
- The trace can be filtered to one lot (assumption).
- Lot 14 fixture: exactly 13 messages, in the order and at the times of mockup Fig 1 and Fig 1b, from 18:40:02 to 18:43:14 (8 lines in the first trace, 5 in the continuation).
- The same event log drives the replay (RES-05) and the experiments (PRODUCT Operating Context).

Source: mockup Fig 1, Fig 1b; guide p.10; PRODUCT Operating Context.

### DSH-05 · P0 · Cancel driver recovery

As the presenter, I want to force a driver to cancel mid-evening, so that the panel sees the agents recover and so that the failure path can be tested.

Acceptance:
- A "Cancel driver" control on the dashboard is enabled while a lot has a driver in PROPOSE or COMMIT. Whether a committed driver can be cancelled is an open question.
- Fixture test on Lot 14 with R. Dizon proposed: FAILURE R. Dizon → donor, "Cancelled before committing; Bukal stays tentative". Then CALL_FOR_PROPOSALS donor → all drivers, "Delivery re-announced". The lot shows Re-announced, and R. Dizon is crossed out. All of these happen in the same simulated second (mockup Fig 1b: both lines at 18:43:10).
- The trace shows no CALL_FOR_PROPOSALS to pantries after the FAILURE. Only the delivery is re-announced (guide p.14).
- Next, J. Ramos PROPOSEs by 19:20 and COMMITs (18:43:14). The lot becomes Final.
- If all drivers cancel, the lot stays Tentative and the delivery keeps being re-announced until the pickup deadline (guide p.20).
- The control is labelled as a demo control. It writes the same FAILURE message as a real withdrawal (DRV-04).

Source: guide p.14, p.20; mockup Fig 1, Fig 1b; PRODUCT Operating Context.

### DSH-06 · P1 · Schematic map with a table alternative

As a viewer who cannot use a map, including a TalkBack user, I want the same places and routes as a table, so that nothing depends on the map.

Acceptance:
- The map is a schematic, labelled "Schematic, not to scale" (mockup Fig 1). It is drawn from the pinned OpenStreetMap roads file.
- No tile server and no Maps API key. Check: the build config and bundle contain no Maps key.
- The map still renders in airplane mode.
- Legend: Donor with surplus; Pantry; Volunteer driver; Tentative route.
- "Map | Table" switch. The table has 8 rows for the fixture: 3 donors, 3 pantries and 2 drivers. Columns: Name, Role, Where, Right now, From (mockup Fig 1).
- A tentative route is drawn dashed. Once the award is Final it is drawn solid (mockup Fig 1).

Source: PRODUCT Stack (Map), Accessibility; mockup Fig 1; guide p.17.

### DSH-07 · P1 · Driver reliability panel

As the panel, I want to see each driver's track record and estimate, so that the learning step is visible.

Acceptance:
- Each driver card shows "showed up X of Y runs (estimate Z)". R. Dizon: "Showed up 10 of 11 runs (estimate 0.85)". J. Ramos: "New volunteer, no history yet (estimate 0.50)" (mockup Fig 1).
- Estimate = (shows + 1) ÷ (runs + 2), to two decimals. Checks: 0 of 0 gives 0.50; 10 of 11 gives 0.85; 10 of 12 gives 0.79.
- Within an evening the panel shows the frozen starting estimate. The post-run update is shown after the evening (assumption; see Open questions).

Source: guide p.15; mockup Fig 1, Fig 1b; dataset (step 6).

---

## Results and experiments

### RES-01 · P1 · Four policies run live on the device

As the presenter and the panel, I want the four policies run on the same seeded evenings inside the app, so that the comparison can be checked.

Acceptance:
- The results screen runs four policies: Agents (contract net with tentative awards), First come, first served, Nearest pantry, and Central greedy (transport-aware). These names come from mockup Fig 3 and guide p.19.
- Each policy row shows four measures: food rescued, food wasted, need met (worst-served pantry), stranded awards.
- Before a run every cell reads "Not measured yet" (mockup Fig 3). No result number is shown before it is computed.
- Numbers are computed on the device. Test: change the seed or one pantry's need in the fixture and the numbers change. The build contains no stored results table.
- Only main_sample evenings are used, and only after the pilot has run and the main-evening count is written down (RES-06). Until then no main_sample number is shown.

Source: PRODUCT Stack (Results); mockup Fig 3; guide p.19.

### RES-02 · P1 · The four measures, with exact definitions

As a reviewer, I want each measure computed exactly as the guide defines it, so that the numbers mean what they say.

Acceptance:
- Food rescued: per pantry, the on-time kg received, capped at that pantry's seeded need, summed over pantries. Fixture: need 10 kg, received 12 kg, counts 10 kg.
- Need met per pantry: delivered ÷ need, capped at 1.0. Fixture: needs 10, 20, 5 kg; received 6, 18, 5 kg. Ratios 0.6, 0.9, 1.0. Worst-served = 0.6. Median = 0.9.
- A pantry with zero need is left out of the fairness ratio and adds 0 kg to food rescued. If no pantry needs anything, the evening is left out of the fairness result (guide p.14).
- Evening capping: evenings at 1.4 and 0.0 average 0.5 after capping, not 0.7 (guide p.14). The floor average uses the capped values.
- Food wasted: kg posted that no pantry received.
- Stranded awards: lots awarded to a pantry that no driver delivered. Whether a tentative lot that is never committed counts is an open question.

Source: guide p.14, p.19; mockup Fig 3.

### RES-03 · P1 · Main comparison with confidence intervals

As the panel, I want Salo compared with central greedy using confidence intervals, so that a gap is called a win only when it is clear.

Acceptance:
- Two main results, fixed before any run: Salo minus central greedy on food rescued, and on worst-served need met. Each has a 97.5% paired bootstrap interval over the main_sample evenings (E21 to E30 in the current dataset) (guide p.16, p.19).
- Nothing in this story is computed or shown until the pilot on E11 to E20 has run and the main-evening count is written down (RES-06; guide p.19: "write that number down before any main runs"). Before then the panel shows "Not measured yet".
- Supporting comparisons: the other 10 of the 12 intervals (4 measures × 3 baselines, minus the 2 main results), each at 95%. They are labelled supporting and cannot be a win on their own (guide p.19).
- An interval that contains zero is labelled "no clear difference".
- The resample count and the random seed are shown on screen (assumption: 10,000 resamples). The same inputs and seed give the same bounds.
- Test: a fixed set of paired differences gives bounds that match a reference computation done outside the app.

Source: guide p.16, p.19. The bootstrap-on-difference reporting follows Bestgen (2022), as cited in guide p.21.

### RES-04 · P1 · Verdict rule

As the panel, I want one plain verdict that follows the pre-registered rule, so that a fairer but smaller result is not reported as a win.

Acceptance:
- The verdict is one of: "Salo better" (one main result clearly favors Salo and the other does not clearly favor central greedy); "Trade-off" (one favors Salo and the other clearly favors central greedy); "Central greedy better" (assumption: the guide does not name this case); "No clear difference" (otherwise).
- The verdict line shows the two intervals it used.
- Fixtures: (a) food rescued [+2, +8] and worst-served [−0.01, +0.20] gives "Salo better". (b) food rescued [−5, −1] and worst-served [+0.10, +0.20] gives "Trade-off". (c) food rescued [−1, +3] and worst-served [−0.05, +0.05] gives "No clear difference".

Source: guide p.16 ("fairer but clearly less food is a trade-off, not a win").

### RES-05 · P1 · Replay the same evening under another policy

As the presenter, I want to replay the same evening under another policy, so that the panel sees a like-for-like difference.

Acceptance:
- "Replay with baseline" on the dashboard lets the presenter pick another policy and run the same evening (same seed, same donations, pantries and drivers) (mockup Fig 1).
- The donation list and the driver list are identical to the original run (same IDs, same order).
- The new trace is labelled with its policy. The original run's numbers stay visible.
- Replaying the same policy on the same seed gives an identical trace.

Source: PRODUCT Operating Context; mockup Fig 1; dataset (seeded evenings).

### RES-06 · P1 · Only held-out evenings count

As a reviewer, I want results to use only held-out evenings, and to show which split each evening belongs to, so that tuning cannot leak into the result.

Acceptance:
- Each evening is labelled tuning, pilot or main_sample. The dataset has 10 tuning evenings (E01 to E10), 10 pilot evenings (E11 to E20) and 10 main_sample evenings (E21 to E30) (`evenings.csv`, `split` column).
- The Results screen reports only the main_sample evenings E21 to E30. "Pilot and tuning evenings stay out of the reported results, and main evenings are never used for tuning" (guide p.19).
- Tuning evenings E01 to E10 are used only to tune the weights, the share-bid scale and central greedy's settings (guide p.11 and p.12), and to learn driver reliability (guide p.15). Pilot evenings E11 to E20 are used only for pilot checks: how much the two main differences vary, which sets the number of main evenings (guide p.19), and how often each method hits the need ceiling (guide p.13). Neither split appears on the Results screen.
- Test: the Results screen lists exactly E21 to E30, and no pilot or tuning evening ID appears anywhere on it.
- **No main_sample numbers before the count is written down.** The Results screen shows no number for E21 to E30 until the pilot on E11 to E20 has run and the number of main evenings is written down. Guide p.19: "I then set the number of main evenings so each 97.5% interval’s full width is smaller than the smallest gap worth caring about (6 kg per evening; a fairness target fixed before the pilot), and write that number down before any main runs." Until then every Results cell reads "Not measured yet", with the note "Waiting for the pilot: the number of main evenings is not set yet." Test: with no recorded main-evening count, no E21 to E30 metric or interval appears anywhere on the Results screen, and the main runs cannot be started.
- *Change to the 2026-10-13 decision* (Arjhine, 2026-10-13): this replaces the earlier choice to show the 10 main_sample evenings with a "provisional count" note. Showing main results before the count is written down would let the main evenings influence that count, which page 19 rules out. If the pilot asks for more than 10 main evenings, the dataset is regenerated before any main run.
- Interval levels follow guide p.19: 97.5% for the two main results, 95% for the other 10, which are labelled supporting (decision by Arjhine, 2026-10-13).
- Tuning parameters are frozen. The results screen shows a version or checksum of them (assumption). The app does not change them while results run.
- Reliability estimates for every pilot and main_sample evening start from the frozen values learned on tuning evenings E01 to E10, and nothing learned in one evening carries into the next (guide p.15). Test: R. Dizon starts at 0.85 on every pilot and main_sample evening.

Source: guide p.11, p.12, p.15, p.19; dataset (steps 5 and 6, caveats).

### RES-07 · P2 · Supporting checks: learning off and ceiling hits

As a reviewer, I want two supporting checks, so that I can see whether learning helps and how often the food runs out.

Acceptance:
- A "learning off" run sets every driver's estimate to 0.50, then compares evening by evening. It is labelled supporting evidence, never a main result (guide p.15).
- For each policy, the results show how many evenings reached the food ceiling. The ceiling definition is an open question (guide p.13 says the frequency is reported).

Source: guide p.13, p.15.

---

## Cross-cutting

### CC-01 · P0 · Pick a profile on first open, with no sign-in

As any user, I want to pick who I am from the dataset on first open, without signing in, so that the demo starts in seconds and nothing personal is stored.

Acceptance:
- First open shows a picker with the dataset's donor, pantry and driver profiles, plus a "Dashboard" entry (assumption: the dashboard needs no profile).
- Every profile name carries a "fictional / simulated" note (CC-11).
- No sign-up, sign-in, password, email or phone field exists anywhere. Check the strings file for these words: none.
- The only stored value is the chosen profile ID (assumption). After the app is killed and reopened, the same profile opens. "Switch profile" in settings returns to the picker.
- This step works with no network.

Source: PRODUCT Stack (Accounts); PRODUCT Principle 4.

### CC-02 · P0 · The whole P0 evening works offline

As the presenter, I want the full P0 evening to run with no network, so that the demo does not depend on Wi-Fi.

Acceptance:
- With airplane mode on, no proxy and no relay, run the P0 walkthrough (below) from post to delivery and through the Cancel driver recovery. No error screens appear.
- The simulation runs on the device. Check: no HTTP request is made to any server during the run (verify with network blocking on vel_phone).
- A post made while offline stays in the device's event log, and syncs when the relay returns (CC-06, assumption).

Source: PRODUCT Stack (Data, Demo setup).

### CC-03 · P0 · Rule-based parser fallback

As a donor when the laptop proxy is down, I want the app to still read my message and say that it is an offline parse, so that I can post and check every field.

Acceptance:
- When the proxy is unreachable, or does not answer within 5 seconds (assumption on the timeout), the donor sees the note "offline parse, please check" (Filipino and English; the exact copy is in the strings file, from PRODUCT).
- The rule parser turns "may 3 trays adobo pa at 20 pandesal, kunin before 8" into the same fields as DON-01: Adobo 3 trays, cooked, fridge if kept; Pandesal 20 pieces, no fridge; pickup 8:00 PM.
- Every field stays editable and is confirmed by the donor (DON-02). The note is always shown when the rules are used.
- The rules are written against tuning-split messages only. Pilot and main messages are used only to report parsing accuracy (dataset caveats).

Source: PRODUCT Stack (Donor parsing); dataset (caveats).

### CC-04 · P1 · LLM parse through the local proxy (sensor only)

As a donor on Wi-Fi, I want my message read by Claude Haiku 5.5 through the laptop proxy, so that Taglish text is read better than the rules alone.

Acceptance:
- With the proxy reachable, the parse request goes to the laptop proxy. The proxy log shows the model ID `claude-haiku-5-5`.
- The app bundle contains no API key and no key-like string. Check: search the built bundle for "sk-ant" and "ANTHROPIC" (no hits).
- The proxy's `.env` file is not committed. Check its ignore rule in the proxy's repository.
- The output is validated against the item schema (item, amount, storage need, pickup deadline). Invalid output falls back to CC-03, with the note.
- The model output fills only donor-form fields. It never selects a pantry or sets a bid, value, award or commit. Check: the allocation code does not import the parser module (assumption: verified by code review).

Source: PRODUCT Stack (Donor parsing, Parsing model); PRODUCT Principles; guide p.16.

### CC-05 · P0 · Filipino-first copy from one strings file

As a donor, pantry coordinator or driver, I want my screens in Filipino first with English beneath, so that I can read them at a glance. The dashboard and results stay in English for the panel.

Acceptance:
- Donor, pantry and driver screens show Filipino text first and a smaller English subtitle (mockup Fig 2 pattern). The dashboard and results are in English.
- All user-visible text comes from one strings file. Check: a search of `src/` for quoted UI text outside the strings file finds none (assumption on the check).
- Taglish input works: "kunin before 8" and "kunin bago 8" both give the 8:00 PM pickup (assumption for the second form).

Source: PRODUCT Stack (Language, Brand Commitments); PRODUCT Accessibility.

### CC-06 · P1 · Two-phone sync through the laptop relay

As the presenter, I want a donor's post on one phone to appear on the dashboard phone, so that the demo shows two devices working together.

Acceptance:
- With the relay running on the same Wi-Fi, a lot posted on phone A appears on phone B within 5 seconds (assumption on the latency).
- A driver's COMMIT on phone C updates the donor's status on phone A within 5 seconds (DON-05).
- When the relay stops, each phone shows an offline note (assumption on copy) and keeps working alone.
- When the relay returns, the phones catch up with no duplicate lot numbers and no missing messages. Check: the trace counts match on both phones.
- The relay carries events only. No personal data is sent (PRODUCT Stack: no sign-in).

Source: PRODUCT Stack (Demo setup, Accounts).

### CC-07 · P1 · Theme follows the phone, in the price-board look

As any user, I want the app to follow my phone's light or dark setting while keeping the palengke price-board look, so that it is comfortable at closing time and on the projector.

Acceptance:
- Switching Android between light and dark changes the app within 1 second, with no restart (assumption on the timing).
- Both themes keep the price-board identity: kraft tags, tarp-blue band, marker lettering for display only (visual-world surface brief).
- Body text contrast is at least 4.5:1. Large text and UI component edges are at least 3:1 (WCAG 2.2 AA). Check on screenshots of both themes with a contrast tool.
- No status is carried by color alone (DSH-02).

Source: PRODUCT Stack (Theme), Accessibility; `.impeccable/surfaces` brief.

### CC-08 · P1 · TalkBack

As a TalkBack user, I want every screen to work with a screen reader, so that the app is usable by PWD users.

Acceptance:
- With TalkBack on (vel_phone: Settings → Accessibility → TalkBack), every P0 screen can be completed by swiping and double-tapping alone.
- Every control has a spoken label. A lot tag reads as one line, for example "Lot 14, adobo, 3 trays, Tentative, held until a driver commits" (assumption on wording).
- Struck-through bids are read as "was 9 shares" (DSH-03). The map has its table alternative (DSH-06).
- Focus order follows the visual order on the donor and driver screens.

Source: PRODUCT Accessibility; guide p.17.

### CC-09 · P1 · Text at 200% font scale

As a user with low vision, I want text enlarged to 200% with nothing cut off, so that the app stays usable.

Acceptance:
- With the system font scale at 200% (the emulator setting; the exact path is to be confirmed on vel_phone), no text is clipped or overlapped on any P0 screen.
- No horizontal scrolling at phone width. Side margins are never removed.
- Every tap target stays reachable and does not overlap another.
- Lot tags wrap instead of truncating the pickup-time note (DON-03).

Source: PRODUCT Accessibility.

### CC-10 · P2 · Calmer motion when "remove animations" is on

As a user sensitive to motion, I want animations to calm down when Android's "remove animations" setting is on, so that the app stays comfortable.

Acceptance:
- With "remove animations" on (the exact Android settings path is to be confirmed on vel_phone), the clock needle, bid re-marks and sticker changes do not animate. The state still changes, and TalkBack still announces it.
- With the setting off, the animations play. This is the control check.

Source: PRODUCT Accessibility.

### CC-11 · P0 · Simulated data is labelled everywhere

As a viewer, I want it to be clear that the data is simulated, so that nobody mistakes it for real.

Acceptance:
- The dashboard and results show a "SIMULATED" badge on every screen (mockup Fig 1).
- The results screen shows "Not measured yet" until a run completes.
- The profile picker and profile names carry a "fictional / simulated" note (assumption on copy).
- The mockup's notice is carried into the results screen: "Every business, pantry, volunteer and number shown is simulated or fictional." (mockup header).
- Check: a screenshot of each role's first screen shows the label.

Source: PRODUCT Principle 4; mockup header; guide p.5.

### CC-12 · P1 · Local notifications for new jobs and awards

As a donor, pantry coordinator or volunteer driver, I want a notification when a new job or award arrives from the synced evening, so that I do not have to keep the app open.

Acceptance:
- A driver is notified when a new CALL_FOR_PROPOSALS for a delivery arrives, including re-announcements after a cancel.
- A donor is notified at TENTATIVE_ACCEPT and at the final COMMIT.
- A pantry is notified when it is tentatively awarded a lot and when the award becomes Final (assumption).
- Tapping a notification opens the matching lot or request.
- Notifications are local only. The build has no push service (check the dependencies for any push SDK: none).
- Test: with the app in the background, the relay sends an event, and the notification appears within 10 seconds (assumption on timing).

Source: PRODUCT Stack (Alerts); guide p.10.

---

## P0 walkthrough (smoke test for the evening)

Run once without a cancel, then again with it. Use the Lot 14 fixture and the times from the mockup.

1. Pick a donor profile (CC-01).
2. Type the sample message, confirm the two cards, and post (DON-01, DON-02, DON-04). Lot 14 appears with a Posted sticker, and the trace shows CALL_FOR_PROPOSALS at 18:40:02 (DSH-02, DSH-04).
3. Bukal bids 14 shares, value 0.82. Socorro bids 9 shares, value 0.61. Anonas refuses with "Closed after 19:00…" (PAN-02, PAN-03, DSH-03).
4. The donor agent's TENTATIVE_ACCEPT goes to Bukal. The lot shows Tentative, "Held until a driver commits" (DON-05, PAN-05).
5. R. Dizon offers by 19:05 and J. Ramos offers by 19:20 (DRV-01, DRV-02).
6. Cancel path: Cancel driver on R. Dizon. FAILURE, then Re-announced, then J. Ramos proposes (DSH-05, DRV-04).
7. J. Ramos commits at 18:43:14. Lot 14 becomes Final on the pantry and donor screens (DRV-03, PAN-06).
8. The delivery is marked by 19:20. Lot 14 is Delivered and counts toward food rescued (DRV-05).
9. The trace shows 13 messages for Lot 14 (DSH-04).

Without the cancel path, skip step 6. R. Dizon's PROPOSE (18:40:08) is followed by his COMMIT in step 7, and Lot 14 becomes Final on the same path. The mockup does not show this branch, so its timings are an assumption.

---

## Principle check

No request in the sources contradicts the five PRODUCT principles. The stories add these guardrails:
- No award is final without a driver COMMIT (PAN-05, PAN-06, DSH-05 tests).
- The LLM is a sensor only (CC-04).
- Fairness is built in: the 40-share budget (PAN-04) and worst-served need met (RES-02).
- Simulated data is labelled (CC-11).
- Every decision explains itself with numbers, not generated text (PAN-07).

Conflicts inside the sources are listed as Open questions 1, 2, 9 and 10. The stories follow PRODUCT.md where the guide differs.

---

## Open questions

1. **Architecture.** The guide (p.17) describes a small server, a database and a Python agent engine with Mesa. PRODUCT says the simulation runs in the app on the device, with no hosted backend, and that the Python/Mesa engine is not in v1. These stories follow PRODUCT. Confirm the guide's architecture is superseded, and whether on-device storage meets the "database" requirement.
2. **Evening split.** The guide says the pilot sets the main count and "30 to start" (p.19). The dataset fixes 10 tuning, 10 pilot and 10 main_sample evenings. Which applies to RES-03? What are the pilot and main evening IDs?
3. **Value-to-shares rule.** The guide calls this an open design question (p.12). PAN-02's expected 14 and 9 shares can only be a rule check once it is frozen.
4. **Share budget reset.** The guide says the budget resets every day (p.12). The mockup says "to spend tonight" (Fig 3). Does the reset happen per evening or per calendar day?
5. **Pantry bids.** Do pantry agents bid automatically, or does the coordinator approve each bid? These stories assume automatic.
6. **Donor acceptance.** Does the donor agent tentatively accept the highest bid automatically, or does the donor tap? These stories assume automatic.
7. **Committed driver cancelled.** The guide's withdrawals happen "before committing" (p.14). Should the dashboard's Cancel driver also cancel a driver who has committed? These stories assume yes, with the same recovery.
8. **Stranded awards.** Does a tentative lot that is never committed count as stranded, or only a final lot that is not delivered? The mockup says "awarded to a pantry that no driver actually delivered" (Fig 3).
9. **Food-rescued definition.** The guide says the capped definition replaces the UI/UX document's screen 8 (p.14). That document is not in these sources. Is it updated?
10. **Learning display.** The guide says estimates are updated after every run but frozen between evenings (p.15). The withdrawal example moves 0.85 to 0.79 (p.15). These stories show the frozen value during an evening and the update after it. Confirm.
11. **Voice priority.** PRODUCT says voice works in the APK. The guide says voice is "if time permits" (p.17). These stories make it P1.
12. **Driver steps.** Does the driver tap "Picked up" and "Delivered", or does the simulated clock complete the run? This changes the DRV-05 test.
13. **Rule-parser coverage.** Which phrasings must the fallback handle? These stories use the sample message and tuning-split phrasings only.
14. **Storage claims.** The dataset's `max_hours_unrefrigerated` is an assumption (dataset, step 3). These stories show only "needs fridge if kept" and never an hour count. Confirm.
15. **Google Maps handoff.** Which URL or intent format, and what is the fallback (DRV-06)?
16. **Projector legibility.** The dashboard is mirrored to a projector. The emulator cannot test this. Who checks it at the venue, and at what resolution?
17. **Dashboard entry.** Is "Dashboard" a fourth picker entry with no profile (CC-01)?
18. **Device spec.** What is the minimum Android version, and what API level is `vel_phone`? The Expo Go and APK feature split should go into the test plan.
19. **Timing targets.** The 5-second sync, 10-second notification, 5-second parser timeout and 6-real-seconds-per-simulated-minute values are my assumptions. Are they acceptable?
20. **Semester end date.** PRODUCT says "end of the semester" with no date. The scope guard needs a date.
21. **Copy review.** Copy not quoted from the mockup or PRODUCT is marked as an assumption. Who checks the Filipino copy?
22. **Single-device fallback.** If the relay fails, can the demo run on one phone (CC-02 implies yes)? Confirm.
