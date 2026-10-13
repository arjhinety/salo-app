# Handoff: mobile-product, 2026-10-13

## What I did

- Read my role file (`.claude/agents/mobile-product.md`), `PRODUCT.md` (Stack, Users, Principles), the `.impeccable/surfaces/` brief for the mockup, the full guide (text extracted to scratch, not the project), the mockup text (Figures 1, 1b, 2, 3), and the dataset README.
- Wrote `docs/stories.md`: 45 stories across Donor (6), Pantry coordinator (7), Volunteer driver (6), Live dashboard and demo (7), Results and experiments (7) and Cross-cutting (12). Priorities: 26 P0, 17 P1, 2 P2. Each story has an ID, a user-story line, acceptance criteria checkable on `vel_phone`, and source citations. Also includes a P0 smoke-test walkthrough, a principle check, and 22 open questions.
- Did not touch any code, config, dependencies or git state. Nothing committed, pushed or published.

## Files touched

- Created: `docs/stories.md`
- Created: `docs/handoffs/2026-10-13-mobile-product.md` (this file)
- Not touched: `src/`, `app.json`, `package.json`, `.claude/`, `docs/ledger.md`

Pre-existing untracked `scripts/` in `salo-app/` is not mine. I left it alone.

## Commands run and results

- Text extraction of `guide/salo-guide.html` and `mockup/salo-mockup.html` to the session scratchpad (Python `-I`, regex tag strip). Result: guide ~40 KB text, mockup ~8.6 KB text. Read in full.
- `ls` and `cat` of the project and dataset files. Result: `docs/handoffs/` was empty before this run. `docs/ledger.md` has one line from the orchestrator.
- Grep checks of every number and copy string quoted in `docs/stories.md` against the source texts. Result: all matched (the 0.79, 97.5%, 95%, 0.6–0.9 and "1.4 and 0.0" items appear in the guide; the copy strings appear in the mockup; "offline parse, please check", "vel_phone", "remove animations", "claude-haiku-5-5" and "Open in Google Maps" appear in PRODUCT.md; "10 tuning" and "main_sample" appear in the dataset README).
- Count check of `docs/stories.md`: 45 story headers. Priority tallies per section and total match the summary table (26/17/2).
- Not run: `npx expo lint`, `npx tsc --noEmit`, emulator tests. No code changed, so nothing to run. No story has been executed on `vel_phone`.

## Page-reference convention

Guide citations use the printed page numbers. Printed page = section number + 1 (section 09 is on p.10, section 15 on p.16). I checked this against the guide's own cross-references ("page 12", "page 16", "page 19").

## Open risks

1. **Architecture conflict.** The guide (p.17) describes a server, a database and a Python/Mesa engine. PRODUCT says in-app simulation with no hosted backend. The stories follow PRODUCT. Needs the user's confirmation (open question 1).
2. **Evening split.** The guide says the pilot sets the main evening count. The dataset fixes 10/10/10. RES-03 and RES-06 depend on which applies (open question 2).
3. **Value-to-shares rule is open** (guide p.12). PAN-02's 14 and 9 share fixture can't be a rule check until it is frozen.
4. **Assumed behaviour that changes the P0 path.** Pantry bids are automatic. The donor agent accepts the top bid tentatively without a tap. A committed driver can be cancelled from the dashboard. The donor sees lot status on its own phone. Each is marked "(assumption)" and listed as an open question. If any is wrong, the P0 walkthrough changes.
5. **Timing targets are mine, not the sources'.** 5 s sync, 10 s notifications, 5 s parser timeout, 6 real seconds per simulated minute. All marked as assumptions.
6. **Copy.** Only mockup and PRODUCT copy is quoted. The rest (notes, button labels, status words such as "Outbid") is my assumption and needs a native-speaker check (open question 21).
7. **Deadline.** PRODUCT gives "end of the semester" with no date. The build order in the stories is the scope guard, but a real date is needed (open question 20).
8. **Projector legibility** is not testable on the emulator. Left as an open question, not a story.
9. **Voice** is P1 in the stories. PRODUCT and the guide disagree on its priority (open question 11).

## Principle check

No request contradicted the five PRODUCT principles. Guardrails added to the stories: no award final without a driver COMMIT, LLM as sensor only, fairness via share budget and worst-served measure, simulated labels on every screen, explanations from numbers only.

## Handoff to

- Orchestrator: review `docs/stories.md`, then decide on the 22 open questions (especially 1, 2, 4, 5, 6, 7 and 20) before the architecture and the P0 build start.
- Orchestrator owns the git commit. I did not commit.
