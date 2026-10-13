# Build ledger

One line per step: date, who, what, evidence. The orchestrator (Opus) keeps this file; agents write handoffs in `docs/handoffs/`.

| Date | Who | Step | Evidence |
|---|---|---|---|
| 2026-10-13 | orchestrator | Created the Expo SDK 57 project (create-expo-app, reset to a blank router app), added the Salo icon set, configured app.json (package com.arjhinety.salo, tarp-blue adaptive icon and splash), and defined 12 Haiku agents in `.claude/agents/` | this commit |
| 2026-10-13 | orchestrator | First local dev build (Gradle) installed on vel_phone. The first attempt failed on a transient plugin download, and the retry succeeded. The blank router screen renders via Metro. | build log, emulator screenshot |
| 2026-10-13 | orchestrator | Decisions D-Q1 to D-Q8 and D-a to D-k recorded in `docs/decisions.md`. Dataset v1.1 (per-evening messages) published and tagged. Dataset v1.2 (bicycle and tricycle times, driver_distances) committed locally. | decisions.md, dataset repo 75d6ff7 |
| 2026-10-13 | orchestrator | Milestones written. A release APK with the laptop off is now part of every exit from M3 on (side-agent note: dev builds need Metro). | docs/milestones.md |
| 2026-10-13 | orchestrator + mobile-testing | M1 engine: dataset v1.2 bundled with a checksum gate (`npm run build-data`). Pure-TS engine (counter-based RNG, contract net, tentative awards, two-phase commit, shares, in-evening reliability, four policies, event log, metrics, paired bootstrap, verdict). 47 independent spec tests (mobile-testing, written from the guide without reading the code) plus 9 invariant tests: 56 of 56 pass. Fixed an input-ordering bug (Cancel driver in the same minute as a commit). | `npx jest`; docs/reports/m1-tuning-snapshot.md |
| 2026-10-13 | orchestrator | Finding on the tuning evenings (untuned): worst-served need met = 0 on every evening for every policy (at least one pantry gets nothing). Under the earliest-ETA rule, reliability broke an ETA tie in 46% of driver rounds. Both raised to Arjhine before tuning. | m1 snapshot |
