# Release build (Android, local)

Owner: mobile-release. Scope: local Android release APK only. No store upload, no paid or cloud builds (no EAS). All data is simulated (Salo Evening Dataset).

## Build

Environment: `scripts/android-env.sh` sets the Android Studio JDK and the user SDK. Run from the repo root in Git Bash.

1. First attempt, as the milestone note asks (2026-10-13):

   ```
   source scripts/android-env.sh && npx expo run:android --variant release --no-bundler
   ```

   Result: `BUILD FAILED in 28m 57s`. Failing task: `:react-native-masked-view_masked-view:lintVitalAnalyzeRelease`, error `Metaspace` (the lint analyzer ran out of metaspace). Compilation and JS bundling had already passed.

2. Build that worked, same native project (`android/` is generated and gitignored, so no `expo prebuild` was needed):

   ```
   source scripts/android-env.sh
   cd android && ./gradlew assembleRelease -x lintVitalAnalyzeRelease
   ```

   Result: `BUILD SUCCESSFUL in 6m 48s` (111 tasks executed, 469 up-to-date). The lint-vital task is skipped because it is only a lint check, not part of building the APK. A later rebuild may need the same exclusion until the lint step is given more memory.

## Artifact

- Path: `android/app/build/outputs/apk/release/app-release.apk`
- Size: 110,913,577 bytes (about 110.9 MB; the bundled JS is `assets/index.android.bundle`, 2,701,160 bytes).
- SHA-256: `57556a9917224635c221198bd7339556694cec8b50212f6e44ab49d72eb740cc`
- Package: `com.arjhinety.salo`
- Contains the milestone strings: `WALANG TUMANGGAP`, `maghahatid; darating`, `I-pause ang simulasyon.` (checked by grepping the extracted bundle).

## Signing (demo only)

The `release` build type in `android/app/build.gradle` uses `signingConfigs.debug`, the Android debug keystore. Fine for class demos. It is not a store-grade signature and cannot be uploaded to a store. Do not reuse this key for anything else.

## Install on a real phone (Arjhine)

Option A, USB with adb (recommended):

1. On the phone: Settings > About phone > tap "Build number" seven times. Then Settings > System > Developer options > turn on "USB debugging". Connect by USB and accept the fingerprint prompt on the phone.
2. On the laptop, in Git Bash from the repo root:

   ```
   source scripts/android-env.sh
   adb devices                       # the phone must show as "device", not "unauthorized"
   adb uninstall com.arjhinety.salo  # only if a development build is already on the phone
   adb install -r android/app/build/outputs/apk/release/app-release.apk
   ```

3. Turn off USB debugging afterwards if you do not want it on.

Option B, copy the file:

1. Copy `app-release.apk` to the phone (USB file transfer, or upload it to your own cloud drive and open it on the phone).
2. Open it with the phone's Files app. Allow "Install unknown apps" for that app when Android asks, then tap Install.

Notes: the phone does not need the laptop, Metro, or any network once installed. Use the release APK only. Uninstall any development build of the same package first, otherwise the install fails with a signature or version conflict.

## Offline test run (2026-10-13)

This shows the release APK runs with no Metro dev server and no network. The emulator itself still runs on the laptop, so this is not a test of a real phone.

Commands and results, in order:

| Step | Command | Result |
|---|---|---|
| Stop Metro | `taskkill //PID 102576 //F` (process listening on 8081) | terminated; `curl localhost:8081/status` got no response |
| Remove reverse | `adb reverse --remove-all` | reverse list empty |
| Remove dev build | `adb uninstall com.arjhinety.salo` | Success |
| Go offline | `adb shell svc wifi disable; adb shell svc data disable` | Wi-Fi icon gone from the status bar; mobile data shows no connection |
| Install release | `adb install -r .../app-release.apk` | Success |
| Launch | `adb shell am start -n com.arjhinety.salo/.MainActivity` | picker screen shown (`.impeccable/review/` capture taken during the run) |

What was checked on the release build, offline:

- Donor screen: opened from the picker at 5:00 PM; play pressed; the clock advanced to 5:12 PM. The donor home showed "Tonight · 0 lots". That is expected: on E05 the stall's (D01) first lot posts at 17:37 (L0211) and its second at 17:42 (L0218), so no tag exists before 17:37 (orchestrator check). Tags on the release build were not seen because the run stopped before 17:37. Open item: re-run past 17:42.
- Dashboard: opened fresh at 17:00 under Salo, speed 4x, play pressed. The clock advanced (17:21 at capture). Lines printed (PROPOSE, COMMIT at 17:19). Cancel driver pressed on FINAL lot L0207 (pandesal): the status line read "Driver cancelled at 17:19. The delivery is re-announced." The FAILURE row is above the visible area of that capture, so it is not visible in the screenshot.
- Replay with baseline: opened, "First come first served" chosen. The clock rewound to 17:00 and the policy line read "Policy: First come first served". The note read "One simulated tuning evening (E05), untuned settings — an illustration, not a result; results come only from the main evenings (Results screen)".
- Network restored: `adb shell svc wifi enable; adb shell svc data enable`; `settings get global airplane_mode_on` returned 0.

Screenshots (`.impeccable/review/`):

- `release-dashboard.png`: dashboard after Cancel driver, offline, release build.
- `release-dashboard-replay.png`: replay under First come first served, rewound to 17:00 with the note.
- `release-donor.png`: donor home at 5:12 PM, offline, 0 lots. It does not show tags.

## Open items

- Donor tags on the release build not seen: run the donor screen past 17:42 on E05.
- The live post flow (donor form → LOT_POSTED) is not built yet; the post screen is still the M2 shell.
- The release APK was not installed on a real phone. Arjhine must run the install steps above.
- Demo-day rehearsal (laptop off, airplane mode, at least one week before the demo) is not done.
