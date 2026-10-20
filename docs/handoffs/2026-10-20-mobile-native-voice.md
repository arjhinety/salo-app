# Handoff: mobile-native, voice input for DON-06 (2026-10-20)

Agent: mobile-native. Scope: M4 phase 1, speech-to-text hook and strings for the donor post screen. Nothing committed, nothing pushed. The donor post screen (`src/app/donor/post.tsx`) is not wired; the wiring agent takes `useSpeech` from here. No dataset file was opened or printed (`donor_messages.csv`, pilot and main data untouched).

## Package and version

- Installed `expo-speech-recognition@^57.1.1` (resolved 57.1.1) via `npx expo install expo-speech-recognition@^57.1.1`.
- The first `npx expo install expo-speech-recognition` resolved **58.0.0**, which targets Expo 58 (its devDependencies use `expo ~58.0.11`). The package README maps SDK 57 to `^57.0.0`, so I reinstalled at the 57.x line. Context7 (`/jamsch/expo-speech-recognition`) confirmed the API used below. Note: 57.1.1 itself declares `expo ~56.0.12` as a devDependency; that is only the package's own dev tooling. The peer dependency is `expo: *`.
- Plugin config in `app.json` (option names read from the installed `app.plugin.js`; it reads `androidSpeechServicePackages`, not `androidSpeechServiceProviders`):

```json
[
  "expo-speech-recognition",
  {
    "microphonePermission": "Gagamitin ang mikropono habang nagsasalita ka lang. · The microphone is used only while you speak.",
    "speechRecognitionPermission": "Gagawing text ng speech recognition ang sinasabi mo. · Speech recognition turns what you say into text.",
    "androidSpeechServicePackages": ["com.google.android.googlequicksearchbox"]
  }
]
```

- The plugin adds `android.permission.RECORD_AUDIO` and a `<queries>` entry for `com.google.android.googlequicksearchbox` (verified in the regenerated `android/app/src/main/AndroidManifest.xml`). `microphonePermission` and `speechRecognitionPermission` only write iOS `Info.plist` strings. Android's runtime dialog uses system text; the in-app reason is `voiceStrings.permissionReason`.
- The plugin does not declare `com.google.android.as` in `<queries>`. On vel_phone, `getSupportedLocales` for that package still returned data, so package visibility did not block it.
- New native module: `expo-speech-recognition`. **Needs a new dev build** (done locally, see below).

## Files

| File | Change |
|---|---|
| `package.json`, `package-lock.json` | `expo-speech-recognition` `^57.1.1` added (lock: +12 lines, only this package). |
| `app.json` | Plugin entry added as above. |
| `src/voice/speechLogic.ts` (new) | Pure helpers: `VOICE_LOCALES`, `chooseLocale`, `canUseOnDevice`, `mapSpeechError`, `joinTranscript`. |
| `src/voice/useSpeech.ts` (new) | Hook: `{ available, listening, transcript, error, start, stop }`. |
| `src/voice/strings.ts` (new) | Voice UI copy (below). |
| `src/voice/__tests__/speechLogic.test.ts` (new) | 6 tests with literal expected values. |

Hook behaviour:
- The native module is loaded lazily inside try/catch. A top-level import would throw at bundle time in Expo Go, so there `available` stays false.
- `available` starts from `isRecognitionAvailable()` in the `useState` initializer.
- `start()` clears transcript and error, checks `isRecognitionAvailable()`, then checks permission (`getPermissionsAsync`, then `requestPermissionsAsync` if not granted). A denial sets `error = 'permission'`.
- Locale: `getSupportedLocales({ androidRecognitionServicePackage: 'com.google.android.as' })`. If that call throws, the hook falls back to `en-US` and lets the default recognizer decide. An empty list (Android 12 and below) also falls back to `en-US`. A non-empty list with none of fil-PH / en-PH / en-US sets `error = 'language'`.
- `requiresOnDeviceRecognition` is true only when the chosen locale is in `installedLocales`. `interimResults: true`.
- `transcript` is finalized utterances joined with the current partial text. It resets on each `start()`; the wiring should copy it into the editable text box.
- On unmount the hook removes its listeners and calls `abort()` so the microphone is not left open.
- Error mapping: `not-allowed` → `permission`; `no-speech` / `speech-timeout` → `no-speech`; `network` → `network`; `language-not-supported` → `language`; `service-not-allowed` → `unavailable`; `aborted` → no error; everything else → `other`.

## Locale results on vel_phone

Probe run on the emulator (API 36, `sdk_gphone64_x86_64`), using a temporary screen that called the module directly. The screen is deleted (see below).

| Call | fil-PH | en-PH | en-US |
|---|---|---|---|
| `getSupportedLocales({androidRecognitionServicePackage: 'com.google.android.as'})` → `locales` | not listed | not listed | listed |
| same → `installedLocales` | not installed | not installed | **installed** |
| `getSupportedLocales({androidRecognitionServicePackage: 'com.google.android.googlequicksearchbox'})` | error: "Failed to retrieve recognition service package" | | |
| `getSupportedLocales({})` (default) | same list as `com.google.android.as`; installed = `["en-US"]` | | |

Other module values on vel_phone: `isRecognitionAvailable: true`, `supportsOnDeviceRecognition: true`, `getSpeechRecognitionServices: ["com.google.android.as", "com.google.android.tts"]`, `getDefaultRecognitionService: "com.google.android.tts"`, permission status `undetermined` before any request.

Consequence on this phone: the hook picks **en-US** with `requiresOnDeviceRecognition: true`. fil-PH and en-PH are not available here, so Taglish dictation will be recognized as en-US on this device.

## Strings (verbatim from `src/voice/strings.ts`)

- `listening`: `Nakikinig… · Listening…`
- `tapToSpeak`: `Pindutin at magsalita · Tap and speak`
- `stop`: `Ihinto · Stop`
- `permissionReason`: `Gagamitin ang mikropono habang nagsasalita ka lang. · The microphone is used only while you speak.`
- `errors.permission`: `Hindi pinayagan ang mikropono. Mag-type ka na lang. · Microphone permission denied. Type instead.`
- `errors['no-speech']`: `Walang narinig. Subukan ulit. · No speech heard. Try again.`
- `errors.network`: `Kailangan ng internet para sa boses. · Voice needs internet.`
- `errors.language`: `Hindi available ang wika para sa boses. · Voice language not available.`
- `errors.unavailable`: `Hindi available ang boses sa telepono na ito. Puwede ka pa ring mag-type. · Voice is not available on this phone. You can still type.`
- `errors.other`: `May problema sa boses. Mag-type ka na lang. · Voice problem. Type instead.`
- `needsAppBuild` (extra, from the DON-06 Expo Go acceptance line): `Kailangan ng app build para sa boses. · Voice needs the app build.`

Added beyond the brief: `permissionReason`, `errors.other` (needed for the `other` mapping) and `needsAppBuild`. Codex should review these with the Taglish copy rule.

Native permission strings in `app.json` (verbatim, iOS only): `Gagamitin ang mikropono habang nagsasalita ka lang. · The microphone is used only while you speak.` and `Gagawing text ng speech recognition ang sinasabi mo. · Speech recognition turns what you say into text.`

## What was run

- `npx expo install expo-speech-recognition@^57.1.1`: ok (after the 58.0.0 resolution was rejected, see above).
- `npx expo-doctor` before the install: 20/21 checks passed. Failing: patch-version mismatches already present before my work (`@expo/ui` 57.0.23 vs ~57.0.25, `expo` 57.0.28 vs ~57.0.30, `expo-constants`, `expo-linking`, `expo-router`). Not fixed; the brief did not ask for it. After the install: the same 20/21 with the same five mismatches. The new package added no failure.
- `npx expo prebuild --platform android --no-install`: ok. `android/` regenerated (gitignored). Manifest has RECORD_AUDIO and the googlequicksearchbox query.
- `npx expo run:android` (local debug APK, emulator `vel_phone` / `emulator-5554`): **BUILD SUCCESSFUL in 30m 56s**, APK installed. The first attempt with `--device emulator-5554` failed on device name lookup, so it was re-run without `--device`.
- App launch on vel_phone: ok. After `adb reverse tcp:8081 tcp:8081` and a Metro restart with `--clear`, the app opened the role picker (Donor / Pantry / Driver / Dashboard screens). Launching on the debug route was verified with the probe screen.
- Metro first reported `UnableToResolveError` for `expo-speech-recognition` because of a stale module map. It was fixed by the Metro restart with `--clear`. This was not a package problem.
- `npx tsc --noEmit`: exit 0 (final run).
- `npx expo lint`: exit 0 (final run). Earlier run had two react-hooks errors and one rules-of-hooks error in my files; fixed (helper renamed to `canUseOnDevice`, availability moved into a `useState` initializer, lazy `require` marked with an eslint-disable comment).
- `npx jest`: final run **1 suite failed, 16 passed, 3 skipped**; 230 passed, 233 total. The failing suite is `src/parse/__tests__/claude-tuning-scorer.test.ts` (`Cannot read properties of undefined (reading 'model')`), another agent's in-progress file. `src/voice/__tests__/speechLogic.test.ts`: 6 passed.
- Probe screen run on vel_phone: hook reported `available: true`, `listening: false`, `error: null`; the locale table above.
- Temp probe screen `src/app/voice-debug.tsx` **deleted** after use (untracked, so no git diff). Metro stopped afterwards.

## What was NOT run

- **Speech recognition was not run on the emulator.** Tapping START HOOK did not register on the probe screen (no permission dialog appeared; permission stayed `undetermined`). The emulator microphone is not verified as configured. The `start()` path (permission request, `getSupportedLocales`, `start()` with `en-US` and on-device) is therefore not exercised on a device.
- No spoken Taglish message was tested. Nothing was tested on the user's APK phone.
- iOS: not run and not claimed.
- Expo Go: not run. The lazy require is designed for it, but unverified.

## Scoped diff check

- `git diff --stat -- src/app`: empty from me (temp route deleted).
- `git diff --stat -- src/engine src/data src/parse server src/app` is **not empty**: it shows `server/src/config.js`, `server/src/parse.js`, `server/src/server.js`, `server/test/parse.test.js`, `src/parse/__tests__/eval-parser-tuning.test.ts`, `src/parse/__tests__/imports.test.ts`, plus untracked `server/` and `src/parse/` files. These are from other agents (parse and server work). I did not edit any of them.
- My changes outside `src/voice`: `app.json`, `package.json`, `package-lock.json`, and the gitignored `android/` (regenerated).

## Open risks

1. Locale: on vel_phone only en-US is available, so fil-PH / en-PH recognition cannot be verified here. The user's phone may differ.
2. The hook's `start()` was not exercised on a device; the permission and recognizer paths need a device test.
3. `com.google.android.as` is not in the manifest `<queries>`. It worked on vel_phone, but this may differ on other devices.
4. `.expo/types/router.d.ts` still lists `/voice-debug` until the next `expo start` regenerates typed routes (`.expo/` is gitignored).
5. `expo-doctor` patch mismatches (five packages) predate this work and remain.
6. The 57.1.1 package declares `expo ~56.0.12` as a devDependency. The peer range is `*`, and the runtime was fine on SDK 57, but the mismatch is worth knowing about.
