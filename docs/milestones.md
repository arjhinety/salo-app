# Milestones (deadline: early January 2027)

| Milestone | Scope | Exit check |
|---|---|---|
| M1 Engine + data | Dataset v1.2 bundled into the app. Pure-TypeScript engine: contract net, tentative awards, two-phase commit, shares, reliability learning, four policies, event log. Jest tests with hand-worked literal numbers. | Tests pass; one evening replays as a text log |
| M2 Look + navigation | Price-board design system on native (light and dark), profile picker, a shell for each role | Emulator screenshots reviewed |
| M3 One evening on one phone | Donor post, bids, tentative award, driver commit, delivery, Cancel driver recovery | **Release APK** installed, run with the laptop off (see below) |
| M4 Donor parsing + voice | Laptop proxy (Claude Haiku 5.5, key in server/.env), rule fallback, speech-to-text | A Taglish message, typed and spoken |
| M5 Two-phone sync + alerts | Laptop relay, pairing, local notifications, Google Maps handoff | Two devices together |
| M6 Results + pilot | Tuning on E01–E10 (fixes D-Q1), pilot on E11–E20, main-evening count recorded, then main results | Results stay empty until the count is recorded |
| M7 Accessibility + polish | TalkBack, 200% text, reduced motion, independent QA, design review | QA report |

## Release build (added 2026-10-13, from a side-agent note)

The app on the emulator is a **development build**. It loads the JavaScript from the Metro dev server on the laptop, so with the laptop off it shows a blank or error screen, even though the simulation runs on the device. Only a **release build** puts all the code inside the APK.

- From M3 on, every milestone exit includes a local release APK (`npx expo run:android --variant release`), installed on the emulator **and** on Arjhine's phone, and tested with the laptop off or out of reach. Expected: the one-phone evening runs fully offline.
- In M4 and M5, the release APK must also behave correctly when the laptop server is down: the rule-based parse fallback, and single-phone mode (decision D-i).
- Demo-day rehearsal: the final release APK, the laptop off, airplane mode, at least one week before the demo.
- Signing: the debug keystore for class demos. No store upload, no paid builds.
