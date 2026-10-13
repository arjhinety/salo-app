# Handoff: mobile-feature, donor home "Ngayong gabi" (2026-10-13)

Agent: mobile-feature. Scope: build, install, run, typecheck, lint, screenshot review, and one layout fix for the donor home (`src/app/donor/index.tsx`) and its tag component. No commit, no push. Nothing under `src/engine/`, `src/data/`, `scripts/` or `docs/decisions.md` was touched.

## Files changed

- `src/components/Tag.tsx`: the sticker (`stickerRow`) moved from absolute positioning (top 6, right 6) into normal flow, right-aligned under the string hole. Before, it covered the hole at 100% font (MAY BID tag) and the item name at 200% font (FINAL over LUMPIANG SHANGHAI). No colors, fonts or concept changed.
- `.impeccable/review/` created with 5 screenshots (see below).
- `docs/handoffs/2026-10-13-mobile-feature.md` (this file).
- Side effects of the tooling, not hand edits: Metro regenerated `.expo/types/router.d.ts` (now lists `/donor` and `/donor/post`); `android/app/build/` was rebuilt by Gradle.

Not touched: the other files in the orchestrator's list, and the untracked `src/engine/__tests__/zz_delaycopy.ts`.

## Environment and commands run (real results)

| Step | Command | Result |
|---|---|---|
| Emulator | `adb devices` (none attached), then `emulator -avd vel_phone -no-snapshot-save > "$TEMP/emu.log" 2>&1 &`, then poll `adb shell getprop sys.boot_completed` | none attached before; then `emulator-5554 device`; boot_completed = 1 |
| Build and install | `source scripts/android-env.sh && npx expo run:android --no-bundler` (background, log `$TEMP/build1.log`) | `BUILD SUCCESSFUL in 3m 48s`, 338 actionable tasks (59 executed), `EXIT=0`. No Gradle download failure, so no retry was needed. The APK installed on emulator-5554. |
| Metro | `npx expo start --port 8081 > "$TEMP/metro.log" 2>&1 &`, `adb reverse tcp:8081 tcp:8081` | `Waiting on http://localhost:8081`; after relaunch, `Android Bundled 12060ms node_modules\expo-router\entry.js (1579 modules)` |
| Relaunch | `adb shell am force-stop com.arjhinety.salo; adb shell monkey -p com.arjhinety.salo -c android.intent.category.LAUNCHER 1` | `Events injected: 1` |
| Typed routes | read `.expo/types/router.d.ts` | includes `/donor` and `/donor/post` |
| Typecheck (before fix) | `npm run typecheck` | exit 0 |
| Lint (before fix) | `npx expo lint` | exit 0, no output |
| Typecheck (after fix) | `npm run typecheck` | exit 0 |
| Lint (after fix) | `npx expo lint` | exit 0, no output |
| Restore | `adb shell settings get system font_scale`, `adb shell cmd uimode night` | `1.0`, `Night mode: no` |

Not run: `npx expo-doctor`, `npm test` (jest), a release APK (`--variant release`). None of these is claimed.

## Screenshots (device 1080x2400, 420 dpi)

- `C:\Users\arro\Downloads\project\salo-app\.impeccable\review\picker.png` (round 1 only; picker unchanged after the fix)
- `C:\Users\arro\Downloads\project\salo-app\.impeccable\review\donor-light.png` (round 2, after fix)
- `C:\Users\arro\Downloads\project\salo-app\.impeccable\review\donor-dark.png` (round 2, after fix)
- `C:\Users\arro\Downloads\project\salo-app\.impeccable\review\donor-font200.png` (round 2, after fix)
- `C:\Users\arro\Downloads\project\salo-app\.impeccable\review\post.png` (round 1 only; post screen unchanged after the fix)

Navigation: picker, tap Donor row at (540, 600); FAB at (816, 2220) opens post. At 200% the picker Donor row sits at (540, 960).

## Review findings

Checked per the surface brief:

- Nothing clipped or overlapping in the picker or post screen, at 100% or 200%.
- Tags hang from the string: the drop line meets each tag's hole in light and dark.
- Stickers readable: FINAL and MAY BID are legible in light and dark, and clear of the hole and the item name after the fix.
- Dark mode: kraft tags keep high contrast with dark text; the hole fill uses the dark ground, so it reads as a hole. Text on the dark ground is legible.
- 200% font: picker and donor list wrap cleanly, with one tag per row and no horizontal scroll. The tag header and sticker no longer overlap.

## Defects found and fixed

1. Sticker covered the string hole (100% font, MAY BID tag). Fixed by moving the sticker into normal flow (`src/components/Tag.tsx`). Verified in `donor-light.png` (round 2).
2. Sticker covered the item name at 200% (FINAL over LUMPIANG SHANGHAI). Same fix. Verified in `donor-font200.png` (round 2).

## Open items, not fixed

- At 200% font, the FAB "Ipost ang tira" sits over the second tag's name in the first viewport. Content scrolls under the FAB and the list has 120 dp of bottom padding, so the content can be scrolled clear. Not changed; a design call for the owner.
- Copy: heading reads "Tonight · 2 lot" (not pluralized). Strings are in `src/i18n/strings.ts`; not changed, copy owner to decide.
- Changing `font_scale` returned the app to the picker each time (the activity appears to recreate). Observed, not diagnosed. Workaround used: re-enter Donor after each font change.
- Build is a development build (JS loaded from Metro). Expected per the milestones doc for M2; the release APK is required from M3.
- Typed routes were regenerated by a Metro run (`npx expo start`). Typecheck was run only after Metro had regenerated them; running it without Metro was not tested.
