# Handoff: mobile-native, local notifications (CC-12), 2026-10-26

Status: **code, unit tests and the typecheck, lint and full jest run are done. No device run** (rule: no emulator, Metro,
Gradle or build). Nothing committed or pushed. Local notifications only: no push token, no push service, no FCM config.

## What was built

- **Triggers** (`src/notify/events.ts`, pure). From the visible log, for this phone's profile:
  - driver: each CALL_FOR_PROPOSALS the phone's driver is asked on (from `driverBoard`), including re-announcements after a cancel;
  - donor: TENTATIVE_ACCEPT and COMMIT for its lots;
  - pantry: TENTATIVE_ACCEPT naming it, and AWARD_STATE `final` for a lot it won;
  - dashboard, or no role: nothing.
- **News only** (`src/notify/tracker.ts`, pure). Each event is announced once. An event is news only when the phone saw it
  arrive live: same context (role, profile, policy, joined session) and the clock moved forward by at most 3 minutes. A first
  look (open), a join, a policy change, a rewind or a scrub forward records the visible events as seen without announcing them.
  A follower's clock follows the dashboard, so its catch-up after a lost connection is announced.
- **Dedupe key**: kind, lot, party and minute (for example `donor_commit|L0227|V19|1032`). The log `seq` is NOT used: an input
  that changes the run renumbers later entries. On E05 the same DELIVERY of L0227 by V19 is seq 202 in the baseline and seq 200
  in the held run (test `events.test.ts`). Repeated driver asks for the same lot in the same minute get an ordinal.
- **Delivery** (`src/notify/deliver.ts`): Android channel `salo-live` (created before the OS prompt, as the docs require);
  `scheduleNotificationAsync` with `trigger: { channelId }` (immediate); `data.href` carries the tap destination.
- **Tap routing** (`src/notify/tap.ts`): `addNotificationResponseReceivedListener` and `getLastNotificationResponse` (cold start,
  once per identifier). Only `/donor`, `/driver` and `/pantry/lot/<id>?profile=<P..>` are accepted. The pantry route carries
  `?profile=` because `src/app/pantry/lot/[id].tsx` reads the pantry from it.
- **Permission** (`src/notify/permission.ts`, `src/notify/useNotify.ts`): asked once, in context: the first time the clock runs
  on a donor, pantry or driver phone whose OS status is `undetermined`. An in-app reason (Alert) comes first; the OS prompt
  follows only on "Payagan". The flag is stored in `expo-sqlite/kv-store` whatever the answer. Denied: the app works, and the
  events are still recorded as seen, so granting later does not flood the phone.
- **Hook** (`src/notify/useNotify.ts`), mounted once in `src/app/_layout.tsx` (`useNotifications()` in `Shell`, two lines).
- **Strings** in `src/i18n/notify.ts` (new file; no other i18n file was touched).

## Decisions

1. **Dedupe key** = kind, lot, party, minute (not `lot + seq`). Approved by the coordinator.
2. **FCM**: `expo-notifications` is kept (recommended Expo module). Local notifications only. See "Push and FCM" below.
3. **Foreground**: no `setNotificationHandler` is set, so a notification is not shown while the app is open (the screen shows the
   state). Background and closed: shown.
4. **Scrub on a single phone**: a forward jump of more than 3 minutes is treated as a scrub and is silent.
5. **Config plugin**: not added. The docs require it only for a custom icon and tint colour. The small icon is the default
   (generic on Android); a white monochrome icon is a later item.

## Push and FCM

- Dependency check: `package.json` has no push SDK (no firebase, onesignal, expo-server-sdk). The lockfile match on `push` is
  `safe-push-apply`, an unrelated package.
- `expo-notifications` (~57.0.24) is the requested module. Its Android build declares
  `com.google.firebase:firebase-messaging:25.0.1`, a `POST_NOTIFICATIONS` permission and a Firebase messaging service
  (`node_modules/expo-notifications/android/build.gradle`, `android/src/main/AndroidManifest.xml`). The Android build therefore
  carries the firebase-messaging library. **It never initialises push**: no `google-services.json`, no `googleServicesFile` in app
  config, and no push-token call anywhere under `src/`. Both rules are tested (`src/notify/__tests__/noPush.test.ts`), and both
  tests were checked to fail on a planted violation (probe files removed afterwards).

## Dependencies changed

- `npx expo install expo-notifications` added `expo-notifications@~57.0.24` to `package.json`, and in the lockfile added
  `expo-notifications` 57.0.24, `expo-application` 57.0.3 and `badgin` 1.2.3, and moved `expo-constants` 57.0.21 to 57.0.22
  (a dependency of expo-notifications; it also resolves one expo-doctor mismatch).
- `app.json`: unchanged.
- `android/`: not touched.

## Tests (jest, expo-notifications mocked where used)

`src/notify/__tests__/` (4 suites, 32 tests, all pass):
- `events.test.ts`: real E05 runs. Held V19 run (offer on L0227 at 1031, commit at 1032, delivery at 1038):
  - V19 asked on L0227 at 1031; body says "sumagot bago ang 5:14 PM"; no ask at 1030.
  - D32: tentative L0227 at 1028; COMMIT L0227 by V19 at 1032 (ETA 5:18 PM); tentative L0245 at 1045; COMMIT L0245 by V34 at 1049.
  - P19: tentative L0227 at 1028, final at 1032 (href `/pantry/lot/L0227?profile=P19`); P07: tentative L0245 at 1045, final at 1049.
  - P19 is never told about L0245. Dashboard, no role, and a role without a profile: nothing.
  - Keys are the same in the baseline and the held run (no seq); seq of the same DELIVERY is 202 vs 200.
- `tracker.test.ts`: a tick-by-tick run from 1027 to 1049 announces each D32 event once, at its minute; a repeat at the same minute
  announces nothing; open at 1040 announces no backlog; a join (new context) announces no backlog, and the next minute only new
  events; a scrub 1040 to 1050 is silent, and so is scrubbing back and forth; a follower catch-up 1040 to 1050 is announced
  (1045 and 1049 events); the held run does not re-announce what the baseline already announced.
- `tap.test.ts`: allowed hrefs only; a tap while mounted opens its destination and cleanup removes the listener; cold start opens
  once per identifier; the delivery payload (channel `salo-live`, data href); permission asked only on donor, pantry or driver
  while running, undetermined, never asked.
- `noPush.test.ts`: (a) no `google-services.json` outside node_modules and no `googleServicesFile` in app.json / app.config.*;
  (b) no `getExpoPushTokenAsync`, `getDevicePushTokenAsync` or `addPushTokenListener` in `src/` (this file excluded).

Not tested: the React hook itself (no React renderer in the dev dependencies); it is covered by the pure modules and the
typecheck. Background delivery and the 10 s timing check were not run (no device).

## Checks (real output)

- `npx tsc --noEmit`: exit 0, no output.
- `npx expo lint`: exit 0, no problems reported.
- `npx jest` (whole repo): `Test Suites: 4 skipped, 51 passed, 55 total`; `Tests: 4 skipped, 577 passed, 581 total`. Failures: none.
  The 4 skipped suites and tests were skipped before this work (the live two-phone test needs `SYNC_IT=1`, others pre-existing).
- `npx expo-doctor` before this work: 20/21 checks passed; patch mismatches `@expo/ui` 57.0.23 (expected ~57.0.26), `expo`
  57.0.28 (~57.0.31), `expo-constants` 57.0.21 (~57.0.22), `expo-linking` 57.0.12 (~57.0.13), `expo-router` 57.0.26 (~57.0.29).
- `npx expo-doctor` after: 20/21 checks passed; patch mismatches `@expo/ui` 57.0.23, `expo` 57.0.28, `expo-linking` 57.0.12,
  `expo-router` 57.0.26. `expo-constants` now matches. Pre-existing mismatches were NOT fixed (per the brief).

## Strings (verbatim, `src/i18n/notify.ts`; `{x}` is a value; the body gets " (simulasyon · simulation)" appended)

```
channel: Mga abiso ng Salo · Salo alerts
simTag: (simulasyon · simulation)
permission.title: Gusto mo ba ng abiso? · Want alerts?
permission.body: Sasabihan ka namin kapag may bagong request o pagbabago sa lot mo habang bukas ang app. Puwede itong i-off sa settings ng telepono. · We will tell you when a new request or a change to your lot comes in while the app is open. You can turn this off in the phone settings.
permission.allow: Payagan · Allow
permission.later: Hindi ngayon · Not now
driverAsk.title: May request para sa iyo · A request for you
driverAsk.body: Lot {lot}: sumagot bago ang {closes} · Lot {lot}: reply before {closes}
donorTentative.title: May napiling pantry muna · A pantry is picked for now
donorTentative.body: Lot {lot}: sa {pantry} muna, hanggang may driver na mag-commit · Lot {lot}: {pantry} for now, until a driver commits
donorCommit.title: May driver na ang lot mo · A driver is committed to your lot
donorCommit.body: Lot {lot}: maghahatid si {driver}, dadating ng {eta} · Lot {lot}: {driver} delivers, arriving {eta}
pantryTentative.title: Nakalaan muna sa inyo ang lot · A lot is held for your pantry for now
pantryTentative.body: Lot {lot} mula sa {donor}: nakalaan muna hanggang may driver na mag-commit · Lot {lot} from {donor}: held until a driver commits
pantryFinal.title: Sa inyo na ang lot · The lot is yours
pantryFinal.body: Lot {lot}: si {driver} na ang maghahatid · Lot {lot}: {driver} will deliver it
```

Times in the bodies come from `clockText` (for example `5:14 PM`), and names from the simulated dataset. For Codex review: the
Taglish lines above (Filipino first). Codex reviewed them on 2026-10-26; its six fixes (tentative status made explicit, "mag-commit", pantryFinal reworded) are applied above.

## Open risks

- **Background delivery depends on the JS thread.** Notifications are produced by the app's JS. If Android suspends the process,
  events during the suspension are not announced; a catch-up after resume on a single phone is a jump and stays silent.
  A follower's catch-up is announced. A background task was not added (it would be a second mechanism; not requested).
- **Timing (the 10 s check) not verified**: no device run.
- **Android build carries firebase-messaging** (see "Push and FCM"). A decision for the coordinator if a stricter no-FCM build is
  wanted: there is no local-only variant of expo-notifications.
- **Small icon** is the default. Android renders a non-white icon as a white square; a white monochrome icon needs the config
  plugin (`icon`) and a new dev build.
- **Native module added**: `expo-notifications` has native code. The app needs a new development build before the feature works
  on a device (`npx expo run:android` or `eas build --profile development`). Not run (memory rule).
- **Permission reason** is shown once. If the phone already denied, the OS will not prompt again; the app does not re-ask.
- **Cold-start tap** is handled from `getLastNotificationResponse` on mount; a tap from long ago may re-open its screen on the next
  cold start (the docs' example behaves the same way).
- **Driver ask keys** use lot + minute + ordinal; a re-announcement in the same minute is distinguished by the ordinal, which
  depends on the order the board lists asks.
- **Follower and dashboard** flows were not exercised on two phones (the two-phone integration test lives in `src/backend/`).
- **Other agents' files** are modified in the working tree (`src/driver/*`, `src/data/*`, `src/i18n/{driver,pantry,strings,sync}.ts`,
  `src/app/dashboard/index.tsx`, `src/components/*`, `src/live/*` new files, `scripts/build-data.mjs`). Not touched by this work.
  My files: `package.json`, `package-lock.json` (expo-notifications only), `src/app/_layout.tsx` (two lines), `src/i18n/notify.ts`,
  `src/notify/`, `docs/handoffs/2026-10-26-mobile-native-notifications.md`.

## Commands used

- `npx expo-doctor` (before and after)
- `npx expo install expo-notifications`
- `npx tsc --noEmit`; `npx expo lint`; `npx jest src/notify`; `npx jest` (whole repo)
- Guard probes (planted `google-services.json` and a planted `getExpoPushTokenAsync` in `src/`): both caught by `noPush.test.ts`,
  both files removed.
- Scratch E05 dumps (temporary test, removed) to read the literal lot ids and minutes above.
