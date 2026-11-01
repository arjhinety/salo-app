# Device check 3: the release APK on vel_phone (orchestrator, 2026-11-01)

Done by the orchestrator by hand with `adb` and `uiautomator` (the agent runs stalled on memory). Release APK (no Metro, no laptop server), emulator `vel_phone` only (`emu avd name` confirmed), 1.5 GB RAM, network off (`svc wifi/data disable`) for all checks unless noted. No Claude calls. Screenshots: `.impeccable/review/device3-*.png`.

## Results

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Release APK installs and launches offline, Metro down | PASS | `device3-release-offline-launch.png` (`curl localhost:8081` got nothing) |
| 2 | Dashboard evening runs offline: clock, lots to FINAL, "Database: offline, queued 0", "Getting the code…" | PASS | `device3-offline-dashboard-playing.png` |
| 3 | Map: labels readable, none overlapping, crowded markers drop their label (the table lists all) | PASS | `device3-offline-map.png`; at the end of the evening route lines cross a few labels (cosmetic) |
| 4 | Notification permission: in-app reason, then the Android prompt, granted | PASS | `device3-donor-home.png`, `device3-notif-android-prompt.png`; `dumpsys` shows POST_NOTIFICATIONS granted, channel `salo-live` created |
| 5 | A notification actually appears | **FAIL, then fixed and PASS on the rebuilt APK** | Two tests with a donor lot going tentative then FINAL (one backgrounded for 150 s, one in the foreground for 4 min): `dumpsys notification` showed no Salo notification. Cause: the app never installed a notification handler (expo-notifications: scheduled notifications are presented only through a handler). Fix: `installHandler()` in `src/notify/deliver.ts`, called on mount (commit 8f1bc97), with a test. **Re-verified on the rebuilt release APK (sha256 `b5afb231…`, 5m 45s build):** evening at 4× with the donor role in the foreground, 10 Salo notifications posted (tentative and driver-committed events, titles in the bilingual form), grouped under Salo in the shade, small icon is the white Salo tag on blue (not a blank square): `device3-notification-shade.png`. |
| 6 | Donor text post offline (rule fallback), invented text "may 2 bilao ng pancit canton at 12 pandesal kunin bago mag 8pm" | PASS | banner "Offline na binasa ang mensahe…", two cards (2 bilao pancit canton, 12 pandesal), `device3-post-offline-parse.png` |
| 7 | Donor manual post completes: "Tama, i-post" → lots on donor home ("Tonight · 4 lots"), delivered on the clock | PASS | `device3-post-done.png` |
| 8 | Donor microphone and speech permission | NOT CHECKED | the emulator has no speech service; a real phone is needed |
| 9 | Pantry home and lot detail; singular unit "1 tray · 1 tray" | PASS | `device3-pantry-home.png`, `device3-pantry-lot.png` |
| 10 | Driver chooser: the Filipino and English hint lines are now the same size | PASS | `device3-driver.png` |
| 11 | Results: "Run the main evenings", about 40 to 52 s on the phone, verdict first in one unit system | PASS | `device3-f200-results-done.png`: "No clear difference: food rescued [−2.8, +1.8] kg per evening; worst-served need met [−2.6, +5.3] points", then the two rows and the post-hoc note |
| 12 | 200% text: picker (scrolls to Dashboard), dashboard (header, ruler, tabs, tape scroll; tape about a third of the screen), Results | PASS, no clipping | `device3-f200-*.png` |
| 13 | Dark mode: picker, dashboard bids and map, selected tab | PASS | `device3-dark-*.png` |
| 14 | Join limit | PASS (device check 2) | handoff `2026-11-01-mobile-device-check-2.md` |
| 15 | Reduced motion | NOT OBSERVABLE here | a screenshot cannot show a transition; the hook is unit-tested (`src/a11y/__tests__/reduceMotion.test.ts`). Check on a real phone with "Remove animations" on. |
| 16 | TalkBack | PARTLY | TalkBack speech was not run; the accessibility tree (`uiautomator dump`) reads each row as one sentence: "Donor, Food business with surplus. Karinderya ni Aling Oning.", the progress/clock/tab labels, the pantry lot sentence. A real phone with TalkBack on should confirm the reading order. |

## Findings

1. **Notifications never showed (fixed).** See row 5. Without an installed handler, expo-notifications did not present the scheduled notifications in either state.
2. **Foreground clock vs background:** the simulated clock is wall-time based and kept running while the app was in the background (5:56 → 6:07 PM in 62 s at 1×). The tracker treats a clock step over 3 minutes as a jump and stays silent (by design: no flood of old events).
3. **Post screen:** the draft's post button sits below a long form; when the soft keyboard is open, content cannot be scrolled with swipes over the keys. Not changed.
4. **Memory:** a leftover Metro dev server from an earlier agent run held 2.2 GB and stalled the emulator; it was stopped by PID. Closing MuMu Player freed the rest.

## Test rows in salo

None created: all checks ran offline. (One earlier health check created and then deleted anonymous users; salo holds only the reference tables.)
