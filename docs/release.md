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
- Size: 110,935,241 bytes. This is the **current build to install**: commit d7b269c (post-flow fix batch: pickup chips capped at 21:00, Codex copy fixes, gesture-bar inset), built 2026-10-13 17:38 by the orchestrator with the same command. Checked: the bundle contains the new heading and lot-ID line and not the old heading; the APK installs and opens on vel_phone. Earlier builds: post flow 110,935,113 bytes (`8a0d4323...`), M3e 110,913,577 bytes (`57556a99...`). The offline run below was done on the post-flow build; the fix batch changed only copy, chip times and padding.
- SHA-256: `0b9f0c7dd43c6286e8173292a8993d2f5be905a60ef03e58a12066c3695c8fc9`
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

## Offline run of the post flow (2026-10-13, M3 manual post)

Build: the same APK as above (`8a0d4323…`), built from the current tree after engine commit `44e596a`. Gradle `assembleRelease -x lintVitalAnalyzeRelease` finished in 2m 13s; `packageRelease` was up to date, so the bundle is identical to the 17:03 build. Metro was stopped before the offline run (`curl localhost:8081/status` got no response). Wi-Fi and mobile data were off (`svc wifi disable; svc data disable`); the release app launched and ran with no dev server.

| Step | Result |
|---|---|
| Donor picker, Donor row, donor home at 5:00 PM | "Tonight · 0 lots" before posting |
| Post form: pick pork adobo, raise to 3 trays; pick pandesal (20 pieces) | cards show "3 tray / Mga 6 kg" and "20 piraso / Mga 0.6 kg"; pickup chips 5:45, 6:00, 6:15, 6:30 PM; "Magiging LIVE-1 at LIVE-2 ito." |
| Post "Tama, i-post" | back on donor home: "Tonight · 2 lots", both tags as MAY BID |
| Clock played from 5:00 PM | tags moved MAY BID → TENTATIVE → FINAL → NAIHATID (delivered) |
| Clock past 5:42 PM | "Tonight · 4 lots": dataset lots L0211 (lumpia, posted 5:37 PM) and L0218 (adobo, posted 5:42 PM) appeared as tags |
| Dashboard, clock paused at 18:29: Cancel driver on FINAL lot L0246 (monay) | tape: `18:29 FAILURE N. Lim · driver cancelled by the operator`; the lot read "tentative, held until a driver commits"; a second press was refused ("That lot has no driver to cancel right now.") |
| Play after the cancel | `18:31 COMMIT L. Mendoza · to Bayanihan Pantry · ETA 18:43`, two simulated minutes after the cancel, inside the engine's 1 to 3 minute re-announce delay |

Screenshots (`.impeccable/review/`): `release-post.png` (donor home at 5:45 PM with the dataset and LIVE tags), `release-cancel-paused.png` (dashboard paused at 18:29, lot held after Cancel driver).

Not run on the device: a double tap on "Tama, i-post" (covered by the pure guard test `submitLots`, `src/donor/__tests__/postForm.test.ts`); Cancel driver while the clock was running.

Open items: the Filipino copy in the new `postForm` strings (listed in the handoff) is for the Codex grammar review. Physical phone install is still Arjhine's step.

## Server address for a phone build (M4, 2026-10-20)

The post screen sends each message to the laptop's LLM proxy (`POST /parse`, architecture section 5). The address is `src/config/server.ts`: it reads `EXPO_PUBLIC_SALO_SERVER` and falls back to `http://10.0.2.2:8787`, which is the Android emulator's alias for the laptop. Expo inlines the value at bundle time, so it is fixed inside each APK.

- **Emulator (vel_phone):** no setting needed. The default is used.
- **A real phone:** build with the laptop's LAN address. Find it with `ipconfig` (the IPv4 address of the Wi-Fi adapter), then build with the variable set in the same shell that runs gradle:

  ```
  source scripts/android-env.sh
  export EXPO_PUBLIC_SALO_SERVER=http://192.168.1.20:8787   # your laptop's address and the proxy port
  cd android && ./gradlew assembleRelease -x lintVitalAnalyzeRelease
  ```

  Check the bundle before installing: the address should appear in the JavaScript bundle inside the APK, and `10.0.2.2` should not, for a phone build.
- The phone must be on the same Wi-Fi as the laptop, and the proxy must listen on that port. If the proxy is not reachable, the screen parses with the rule-based fallback and shows "offline parse, please check" (CC-03).

**Cleartext HTTP (Android).** Release builds block cleartext (`http://`) traffic by default on Android 9 and later. The app allows it for the LAN proxy with the Expo config plugin `expo-build-properties` in `app.json`:

```json
["expo-build-properties", { "android": { "usesCleartextTraffic": true } }]
```

This writes `android:usesCleartextTraffic="true"` into the generated `AndroidManifest.xml` (it applies to all build types, release included). After any change to `app.json`, run `npx expo prebuild --platform android --no-install` before the gradle build. `android/` is generated and gitignored, so it is not edited by hand. The SDK 57 docs for `expo-build-properties` do not say the key can be limited to release builds, so it is set for every build type.

## Release build 2026-11-01 (Supabase backend, all features)

**Superseded above:** the laptop-proxy address settings (`EXPO_PUBLIC_SALO_SERVER`, cleartext for the LAN) no longer matter for parsing. Since 2026-10-26 the app parses through the Supabase Edge Function `parse` on project `salo`, over HTTPS. The Supabase URL and the publishable key are read from the git-ignored root `.env` (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) at bundle time, so the shell that runs gradle must be in the repo with that `.env` present.

- **Command** (memory-capped, because the laptop had about 1 GB free):

  ```
  export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
  cd android && ./gradlew assembleRelease -x lintVitalAnalyzeRelease --no-daemon --max-workers=2 "-Dorg.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=384m"
  ```

  `android/` was regenerated with `npx expo prebuild --platform android --no-install` during the device check (notification icon and plugins from `app.json`).
- **Result:** BUILD SUCCESSFUL in 33m 4s, from commit `8435d66` plus docs. APK `android/app/build/outputs/apk/release/app-release.apk`, 120,478,384 bytes, sha256 starts `3d6227f4473a3092`. Signed with the debug keystore (class demos only; no store upload, no paid builds).
- **Bundle checks (no secrets printed):** the Hermes bundle contains the salo Supabase host once and one publishable key (the publishable key is meant to ship in the app; the secret key and the Claude key never do), the Results "Run the main evenings" code, and no laptop proxy address (`10.0.2.2:8787` / `127.0.0.1:8787`: 0).
- **Not yet done:** installing this APK on vel_phone and on Arjhine's phone and running it with the laptop off. The emulator could not boot with the laptop's free memory on 2026-11-01 (MuMu Player, Chrome and VS Code open). Offline expectations: the one-phone evening runs fully offline; donor parsing falls back to the rule parser and shows the offline banner; two-phone sync and the online parser need internet (Supabase), not the laptop.
- **Install:** `adb -s <vel_phone serial> install -r android/app/build/outputs/apk/release/app-release.apk`, or copy the APK to the phone and open it (allow installs from that source).

**Rebuilt the same day with the notification handler (commit `8f1bc97`):** BUILD SUCCESSFUL in 5m 45s (native parts cached), APK 120,478,944 bytes, sha256 starts `b5afb23190a74417` (this replaces `3d6227f4…`, which had no handler and showed no notifications). Installed on `vel_phone` with the network off and no Metro; checked offline: role picker, dashboard evening, donor offline post (rule fallback) and manual post, pantry, driver, Results run (about 40 to 52 s), 200% text, dark mode, notifications in the shade (`docs/handoffs/2026-11-01-mobile-device-check-3.md`). **Still to do by Arjhine:** install on a real phone, Taglish voice, TalkBack, reduced motion, two phones syncing.
