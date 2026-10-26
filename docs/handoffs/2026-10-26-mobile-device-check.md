# Handoff: mobile device check on the Android emulator, 2026-10-26

Device: AVD `vel_phone` only, adb serial `emulator-5554` (confirmed with `emu avd name` before every session). MuMu Player was not attached and was not touched. Build: local debug dev client, `npx expo run:android --device vel_phone` (no EAS, no cloud build, `android/` not edited). Metro and the emulator were started by me and stopped at the end (see "Processes").

Not committed, not pushed. Screenshots: `C:/Users/arro/Downloads/project/salo-app/.impeccable/review/device-*.png`.

## Claude calls

**0 real parse calls.** The coordinator changed the rule mid-run (no real calls at all). I had made none before that. The one text post was sent with Wi-Fi and mobile data off, so it used the rule fallback locally and no request reached the Supabase function. The 8 s timeout path was not timed separately (the offline failure was immediate).

## Checks

| # | Check | Result | Screenshot | What I saw |
|---|---|---|---|---|
| 1 | Launch, role chooser | PASS | `device-03-launch-retry.png` | Chooser shows "Sino ka ngayong gabi?", join field, four roles. The first launch screenshot was black while the bundle loaded (`device-02-launch-app.png`). |
| 2 | Notifications: permission explanation, OS prompt | **FAIL before fix, PASS after fix** (see Bug 1) | `device-donor-permission-reason-2.png` (no reason shown, before fix), `device-donor-permission-reason-ok.png`, `device-donor-os-permission-prompt.png`, `device-donor-after-allow.png` | After the fix: "Gusto mo ba ng abiso? · Want alerts?" with "Payagan · Allow" / "Hindi ngayon · Not now", then the Android prompt "Allow Salo to send you notifications?". Allowed; `dumpsys` shows POST_NOTIFICATIONS granted=true. |
| 2b | Live local notification appears | **NOT CONFIRMED** | `device-notification-shade.png` | App backgrounded, donor clock run for about 2.5 minutes. The shade shows only system items, no Salo notification. Possible causes: JS suspended while backgrounded (the handoff already lists this as a risk), or the run was too short. Needs a re-run, ideally on a real phone. |
| 3a | Dashboard: start an evening, live clock | PASS | `device-dashboard-open.png`, `device-dashboard-playing.png` | E05 tuning evening (the dashboard's default; the brief suggested E01). Clock 17:00 advanced at 4x, tape showed PROPOSE/COMMIT/FINAL lines. |
| 3b | Ranked bids with re-mark | PASS | `device-dashboard-bids.png` | Largest first, e.g. "Malasakit Pantry 16 shares ... Values it at 0.94". Re-mark stamp shown: "Re-marked at 17:39 when Malasakit Pantry outbid Daluyan Food Shelf". |
| 3c | Schematic map + table | PASS, cosmetic issue | `device-dashboard-map.png`, `device-dashboard-map-table.png` | Map draws with "not to scale" note and legend. Some place labels overlap (e.g. P08/V05/V29, V30/P24) on a 1080-wide screen. Not fixed (cosmetic, in `src/components/MapPanel.tsx` territory). |
| 3d | Driver reliability panel | PASS | `device-dashboard-drivers.png` | "Showed up 10 of 11 runs (estimate 0.85)" etc. |
| 3e | Pause, Cancel driver while paused, re-announce | PASS | `device-dashboard-cancel-driver.png` | Paused at 18:09. Cancel on L. Lacson's committed lot: tape `18:09 FAILURE L. Lacson · driver cancelled by the operator`. A second press: "That lot has no driver to cancel right now." Resumed: `18:10 COMMIT Q. Pascual · to Bukal Community Kitchen · ETA 18:22`. Re-announced 1 minute after the cancel, not the same minute. Inside the 1 to 3 minute window, at its low end. |
| 3f | Create sync session (records code) | PASS | `device-dashboard-open.png` | Join code **T391K3** shown on the dashboard. |
| 3g | First press of Cancel with no driver on the selected lot | Observed, no bug | `device-dashboard-cancel-paused.png` | Nothing visible happens when the selected lot has no committed driver (the refusal line appears only on a second press with no driver). Worth a note for the copy review; not changed. |
| 4a | Donor: manual post | **PARTIAL** | `device-donor-post-form.png`, `device-donor-manual-pick.png` | Post form opens with sections (type, pickup chips "Kunin bago 6:30 PM", "Tama, i-post" button). A pick of "pandesal" did not register on the first tap. The post was not completed on the device, so it was not verified end to end. |
| 4b | Donor: text post with rule fallback (network off) | PASS | `device-donor-parse-fallback.png`, `device-donor-post-typed-2.png` | Typed my own sentence: "May 4 kilo ng pansit canton at 12 pandesal, kunin bago mag 7pm". Wi-Fi and data off. Banner: "Offline na binasa ang mensahe. Pakisuri ang bawat item. · Read offline. Please check each item." Draft: "pandesal" with "Hindi namin matukoy ang item. Pumili ng isa, o alisin ito." Pickup chips 6:45 to 7:30 PM. **Rule gap:** "pansit canton" was not recognized (only pandesal). See Not fixed. |
| 4c | Donor: microphone button | **NOT DONE** | `device-donor-mic-tap.png` (shows donor home, not the post form) | My tap missed the post form and opened the donor home. The mic was not reached, so the speech-permission flow was not checked. |
| 5 | Pantry: lot list, detail | PASS | `device-pantry-home.png`, `device-pantry-lot-detail.png`, `device-pantry-lot-detail-2.png` | "Shares left: 9 of 40", "My awards · 2" (DELIVERED, TENTATIVE → FINAL), why-this-lot sentence. |
| 5b | Pantry accept/decline | **NOT APPLICABLE** | | The v1 pantry screen has no accept or decline: "The pantry agent bids automatically... the coordinator sees the bid and cannot change it in v1." |
| 6a | Driver: board, chooser | PASS | `device-driver-chooser.png`, `device-driver-screen.png` | Driver "Q. Pascual" was already chosen (persisted); "You cannot change the driver tonight". "No requests right now" (single phone, no held drivers). |
| 6b | Driver: held-driver answers (offer/decline/commit/withdraw) | **NOT TESTABLE on one emulator** | | Held drivers are set only from a joined second phone at 17:00 with the clock stopped. The live two-phone path is covered by the SYNC_IT run (5 below), not by the driver screen. |
| 6c | Maps link | **NOT CHECKED on device** | | No committed driver run was shown on the driver screen. The intent URL format is unit-tested (`src/driver/__tests__/maps.test.ts`). |
| 7 | Results: closed gate | PASS | `device-results.png`, `device-rotated-landscape.png` | "Not measured yet" on every row for the three policies. No E21 to E30 rows opened. |
| 8 | Live two-phone sync test (one emulator) | PASS (gated run) | | `SYNC_IT=1 npx jest -c jest.sync-it.config.js --forceExit`: 1 passed, 9.8 s. Real-time latency 562 ms. Logs match at minute 1051, 387 entries. Real two-phone check still remains for the user. |
| 9a | Rotate | PASS (no-op) | `device-rotated-landscape.png` | The app is portrait-locked (app.json), so rotation stayed portrait. Nothing broke. |
| 9b | 200% font, restored to 1.0 | PASS, with notes | `device-font200-picker.png`, `device-font200-donor-home.png` | Picker and donor home wrap cleanly, no clipped text seen. The Dashboard row is below the fold at 200% and scrolls. Full accessibility pass not done. |

## Bugs found and fixed

### Bug 1: the notification permission reason never appears on a fresh Android 13+ install (FIXED)

- Cause: expo-notifications `getPermissionsAsync` returns DENIED whenever the app's notifications are off (`NotificationPermissionsModule.kt`: `!areEnabled -> DENIED` comes before the UNDETERMINED branch). On Android 13+ they stay off until the permission is granted, so a never-asked phone reads DENIED. `src/notify/useNotify.ts` asks only when the state is `undetermined`, so the reason was never shown and the `granted` gate blocked all announcements.
- Verified on device: before the fix, no reason appeared. After the fix, the reason and the OS prompt appear.
- Fix: `src/notify/permission.ts`: new pure `permissionStateFrom({granted, canAskAgain})` (granted → granted; not granted and canAskAgain → undetermined; otherwise denied). `src/notify/useNotify.ts`: `readPermission` uses it.
- Test: `src/notify/__tests__/permissionState.test.ts` (4 tests, including a never-asked donor phone with the clock running being asked).

### Bug 2: English plural on quantity 1 ("1 tray · 1 trays") (FIXED)

- Cause: `amountLine` always used the English plural unit (`src/i18n/pantry.ts`, `PANTRY_UNITS_EN`).
- Fix: `src/i18n/pantry.ts`: singular map and `enUnit(unit, qty)`; `src/pantry/lotText.ts` uses `enUnit`.
- Test: `src/i18n/__tests__/enUnit.test.ts` (2 tests).
- Device: the restarted app's pantry had no lots at the time, so the fix was not seen on screen. Covered by the unit test only.

## Bugs found, not fixed (proposed fixes)

1. **Rule fallback misses "pansit canton"** (`src/parse/`, rules; not `src/engine/`). Proposed: add the food synonym "pansit canton" to the rules' item list and a test with the literal sentence. Filipino copy is not changed by this.
   **Orchestrator review (2026-10-26): not a bug, not to be fixed.** The tuning messages spell it only "pancit" ("pancit canton" 5, "pancit bihon" 3; "pansit" 0), and the rules already know "pancit canton". Adding the "pansit" spelling would take vocabulary from outside the tuning messages, which the tuning-only rule forbids (decisions.md). Claude handles the spelling on the online path.
2. **Map labels overlap** on the schematic (`src/components/MapPanel.tsx`). Proposed: collision-offset labels or hide labels below a zoom level. Cosmetic.
3. **Live notification not confirmed** (2b). Proposed: re-run with the app backgrounded for longer and with a donor lot that changes status; if it still fails, check whether the JS thread is suspended in the background (a background task would be a second mechanism, which the notify handoff already declined).
4. **Manual pick on the donor post form** did not register on the first tap, and the post was not completed. Needs a re-check on the device.

## Copy changed (for Codex review)

- Filipino (Taglish): **none changed.**
- English only, `src/i18n/pantry.ts` and `src/pantry/lotText.ts`: the amount line now uses the singular unit for quantity 1. Example: "Dami · Amount: 1 tray · 1 tray" (was "1 trays"). Plural forms for other quantities are unchanged.

## Rows, sessions and devices created in project `salo` (for your cleanup)

- **Dashboard session (E05, from the app):** join code **T391K3** (the dashboard created it when I opened it). I did not capture its session id. Find it by the dashboard's anonymous user (created today) or by this join code.
- **SYNC_IT live test (run once):**
  - live_sessions id `9be248d4-daee-4d83-8b64-ccc3c4bd0108`, join code `EEJCZR`.
  - anonymous auth users: dashboard `e11a1a17-593b-442a-95a0-8d946221cc7e`, donor `77544796-7805-46e8-8081-56638ea3013d`.
  - The test writes its own rows under that session: session_members, session_inputs, input_requests (two, one applied and one rejected), one lot `LIVE-1`, and events. The exact counts were not captured; check by the session id.
- **Emulator app identities:** the app registered anonymous users and device rows for the donor (D01), pantry (P01), driver (Q. Pascual) and dashboard roles. Some of these are duplicates because I cleared the app's local key-value store once (see Notes). Find them by the anonymous auth users created today (the donor's auth record shows its first sign-in at 2026-10-26 14:51:19 UTC).
- **Eveningsync uploads** from the dashboard and the donor/pantry screens on E05 wrote run, event and lot rows under those identities. The exact ids were not captured.
- No schema, migration, `config push` or `db push` was run. No rows were deleted.

## Notes

- **My own mistake (local, not in salo):** I edited the emulator's app key-value SQLite file directly to clear the notification flag. That corrupted it (`database disk image is malformed`). I then deleted that one file so the app recreated it empty. The app's local role, outbox and flags were reset. No Supabase data was touched by this.
- Expo's `--device` takes the AVD name (`vel_phone`), not the serial. The first attempt with `emulator-5554` failed before any build.
- The MuMu device was never attached.

## Checks (final)

- `npx tsc --noEmit`: exit 0.
- `npx expo lint`: exit 0.
- `npx jest`: 4 suites skipped, 53 passed. Tests: 583 passed, 4 skipped, 587 total (baseline 577 + 6 new).

## Processes

- Metro (node, port 8081, PID 41352): stopped with `taskkill //PID 41352 //F`. The other three node.exe processes (MCP servers) were not touched.
- Gradle: `cd android && ./gradlew --stop`, 1 daemon stopped.
- Emulator `vel_phone`: killed (`emu kill`). It was not running when I started, so I stopped it.
- Native build: `android/` was not edited.

## Still open for you

- A real two-phone sync check (sessionIT covers the database path only).
- A real phone run for notifications while the app is in the background.
- Held drivers, the maps link, the donor microphone, and the manual post: needs the second phone or a re-run.
