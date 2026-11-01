# Mobile UI polish: drift fixes from the DESIGN.md documenter

Role: mobile-ui-designer. Scope: code, tests and the design record only. No emulator, Metro or Gradle run. Nothing committed.

## What changed

### 1. Dark-mode contrast (accessibility)

- **BidList** refusal tag, struck share count and remark used `c.red`. Night red (`#ff7a6b`) on night paper (`#ece5d2`) is 2.03:1. They now use `c.onKraftAlert` (tape alert ink, `#8f110b`), the same red ReceiptTape already uses for FAILURE lines.
- **MapPanel** legend, place table, segment switch and "no places" text sit on the ground, but used `c.onTape` (`#141414` at night): 1.00:1 on the night canopy. They now use `c.text` (and `c.ground` for the selected segment). The map caption sat on paper but used `c.textMuted` (1.54:1 at night); it now uses `c.onTape`.
- **Tarp used as ink** (role-state label, CLOSE, donor back link) used `c.tarp`, which is `#0f2f7a` at night: 1.30 to 1.50:1 on the night canopy. New token `tarpInk` (light `#1947b8`, the same as tarp; night `#78a3f8`, step 5 of the tarp-night ramp in `design.json`). The same token now replaces tarp where it is ink on the ground: radio ring and dot, the stranded box border, the listening mic and its icon, the composer caret, and the back link's border.
- **Scan.** Every text role on every surface was checked in both themes (table below). Light had no failures. The night failures were the three cases above.
- **Helper and test.** `src/theme/contrast.ts` (pure: `relativeLuminance`, `contrastRatio`, `requiredContrast`) and `src/theme/__tests__/contrast.test.ts` (53 tests: helper maths, 23 text pairs in each theme against the 4.5:1 or 3:1 threshold for their size, and two checks that document why `tarpInk` and `onKraftAlert` exist).

### 2. Hard-coded colours

- `PostFab` shadow `#0f2f7a` is now `c.tarpNight`, a new palette token (`#0f2f7a` in both themes, the DESIGN `tarp-night` value).
- The hairlines in `BidList`, `DriverTrackPanel` and `ReceiptTape` (`#0000001f`, `rgba(22,22,22,0.18)`) are now `c.rule`, which DESIGN defines as hairline list dividers. Visual change: the old lines were neutral ink at 18%. Now the light line is `#c3cddc` (blue-grey) and the night line is `#2a3a63` (navy) on cream paper. They are decorative, so no contrast threshold applies.

### 3. Text glyphs as icons

- `Tag`: `→` before the pantry and driver line is now `ArrowIcon` (16dp, inline with the text).
- `DraftCards`: the `−` and `+` steppers are now `MinusIcon` and `PlusIcon` (24dp). Labels, `accessibilityState`, the 48dp targets and the disabled opacity are unchanged.
- `DraftCards`: the `×` on each line's remove button was also a text glyph in the same card, so it is now `CloseIcon` (20dp). It was not on the brief's list; flagged here.
- `icons.tsx`: four new icons in the existing style (2dp stroke, 24 grid, round caps), each `accessibilityElementsHidden`.

### 4. Corner drift

- `donor/post.tsx`: the send, post and back buttons went from 12dp to 4dp (`rounded.board`). The back button is not full width (`alignSelf: flex-start`); it is included because it is one of the three buttons with 12dp corners.

### 5. Type role drift (map labels)

- `MapPanel`: the SVG place labels and the caption went from `fontSize={12}` with no font family (system sans) to `TYPE.small` (Archivo Narrow Medium, 13/17). Visible change: the map labels now use the Narrow face.
- `labelLayout`: `MapPanel` passes `TYPE.small.fontSize` (13). The ascent, descent and side-baseline offsets are computed from `fontSize`, so they follow. Label box width for "D01" goes from 21.6 to 23.4 map px. `charWidth` (0.6) is kept, which stays conservative for the Narrow face. `markerHalf` and `offset` are map pixels and do not depend on the font.
- The module default (`fontSize` 12) is left as is, because `labelLayout.test.ts` pins its hand-worked numbers. No app code relies on the default any more.

### 6. Unused `focus` token

- `focus` is still in `Palette` (`#0f2f7a` light, `#d6ff3d` dark) and nothing reads it. Left alone, as the brief asked. `design.json` still describes focus-visible outlines in `#0f2f7a`, which the code does not implement.

## DESIGN.md and design.json

- Added `tarp-ink` and `tarp-ink-night` to the frontmatter colours and to `design.json` `colorMeta`.
- Tarp Blue paragraph narrowed to fills and selected states. New Tarp Ink paragraph.
- Rule paragraph now includes dividers printed on receipt paper.
- Role list: the state label is in tarp ink.
- Icons paragraph lists the four new icons.
- `tarpNight` needs no DESIGN change: `tarp-night` is already the FAB shadow in DESIGN.

## Contrast table (before and after, both themes)

Before is the token set as shipped; after is this change. Threshold: 4.5:1 for normal text, 3:1 for large text (24px, or 18.66px bold). Ratios from the palette values in `src/theme/tokens.ts`.

| Where | Role | Ink before to after | Need | Light before | Light after | Dark before | Dark after |
|---|---|---|---|---|---|---|---|
| BidList refusal tag, struck count | tapeType 15px | red to onKraftAlert on tape | 4.5:1 | 7.12 pass | 8.78 pass | 2.03 FAIL | 7.41 pass |
| BidList remark | small 13px | red to onKraftAlert on tape | 4.5:1 | 7.12 pass | 8.78 pass | 2.03 FAIL | 7.41 pass |
| Map legend, table, segment (ground) | small 13px | onTape to text on ground | 4.5:1 | 15.25 pass | 15.25 pass | 1.00 FAIL | 15.55 pass |
| Map segment label (ground) | bodyStrong 16px | onTape to text on ground | 4.5:1 | 15.25 pass | 15.25 pass | 1.00 FAIL | 15.55 pass |
| Map caption (paper) | small 13px | textMuted to onTape on tape | 4.5:1 | 8.42 pass | 17.05 pass | 1.54 FAIL | 14.65 pass |
| Map place labels (paper) | small, 12px to 13px | onTape on tape | 4.5:1 | 17.05 pass | 17.05 pass | 14.65 pass | 14.65 pass |
| Role state label "open" (ground) | label 13px | tarp to tarpInk on ground | 4.5:1 | 6.72 pass | 6.72 pass | 1.50 FAIL | 7.38 pass |
| Donor back link (ground) | bodyStrong 16px | tarp to tarpInk on ground | 4.5:1 | 6.72 pass | 6.72 pass | 1.50 FAIL | 7.38 pass |
| CLOSE label (sheet, raised ground) | label 13px | tarp to tarpInk on groundRaised | 4.5:1 | 7.36 pass | 7.36 pass | 1.30 FAIL | 6.39 pass |
| Ink on paper (tape body) | tapeBody 16px | onTape on tape | 4.5:1 | 17.05 pass | 17.05 pass | 14.65 pass | 14.65 pass |
| Alert ink on paper (FAILURE) | tapeType 15px | onKraftAlert on tape | 4.5:1 | 8.78 pass | 8.78 pass | 7.41 pass | 7.41 pass |
| Lime sticker ink | sticker 15px | onLime on lime | 4.5:1 | 15.71 pass | 15.71 pass | 15.71 pass | 15.71 pass |
| Kraft tag ink (item) | item 24px | onKraft on kraft | 3:1 | 8.79 pass | 8.79 pass | 8.79 pass | 8.79 pass |
| Kraft tag pencil, slot label | small 13px | onKraftMuted on kraft | 4.5:1 | 5.60 pass | 5.60 pass | 5.60 pass | 5.60 pass |
| Problem sticker on kraft | sticker 15px | onKraftAlert on kraft | 4.5:1 | 4.53 pass | 4.53 pass | 4.53 pass | 4.53 pass |
| White on tarp canopy (wordmark) | wordmark 26px | onTarp on tarp | 3:1 | 7.97 pass | 7.97 pass | 12.30 pass | 12.30 pass |
| Ink on ground | bodyStrong 16px | text on ground | 4.5:1 | 15.25 pass | 15.25 pass | 15.55 pass | 15.55 pass |
| Muted ink on ground | small 13px | textMuted on ground | 4.5:1 | 7.53 pass | 7.53 pass | 9.54 pass | 9.54 pass |
| Alert red on ground | small 13px | red on ground | 4.5:1 | 6.37 pass | 6.37 pass | 7.25 pass | 7.25 pass |
| Muted ink on raised ground | small 13px | textMuted on groundRaised | 4.5:1 | 8.24 pass | 8.24 pass | 8.27 pass | 8.27 pass |
| Alert red on raised ground | small 13px | red on groundRaised | 4.5:1 | 6.98 pass | 6.98 pass | 6.28 pass | 6.28 pass |
| Disabled label on rule (exempt, shown) | bodyStrong 16px | textMuted on rule | 4.5:1 | 5.57 pass | 5.57 pass | 5.76 pass | 5.76 pass |

Non-text strokes that changed from tarp to tarp ink (radio ring and dot, stranded border, mic, caret, back border) were 1.30 to 1.50:1 against the night ground. They are now 6.4 to 7.4:1.

## Commands run

| Command | Result |
|---|---|
| `npx jest src/theme/__tests__/contrast.test.ts` | 53 passed |
| `npx tsc --noEmit` | exit 0, no output |
| `npx expo lint` | exit 0, no findings |
| `npx jest --maxWorkers=2` | exit 0. 62 suites passed, 6 skipped (skipped before this change). 713 tests passed, 6 skipped |

Protected-file check: hashes of `src/engine`, `src/parse` and `server/` are unchanged. `src/tuning/run.ts` and `docs/decisions.md` changed, and `src/tuning/pilotCount.ts`, `src/tuning/pilotRender.ts` and `src/tuning/__tests__/m6-pilot-run.test.ts` appeared, during this session. I did not edit any of them; they come from the concurrent tuning work.

## Files touched

- `src/theme/tokens.ts` (tarpInk, tarpNight)
- `src/theme/contrast.ts` (new)
- `src/theme/__tests__/contrast.test.ts` (new)
- `src/components/BidList.tsx`
- `src/components/DriverTrackPanel.tsx`
- `src/components/ReceiptTape.tsx`
- `src/components/PostFab.tsx`
- `src/components/icons.tsx`
- `src/components/Tag.tsx`
- `src/components/DraftCards.tsx`
- `src/components/MapPanel.tsx`
- `src/components/PolicySheet.tsx`
- `src/app/donor/post.tsx`
- `src/app/index.tsx`
- `DESIGN.md`
- `.impeccable/design.json`
- `docs/handoffs/2026-11-01-mobile-ui-polish.md` (this file)

## Open risks and not done

- No emulator, Metro or Gradle run. Nothing was seen on a device. The night-theme results come from the token values, not from a screenshot. The 200% font-scale check and TalkBack pass are not done.
- The map labels change face (system sans to Archivo Narrow). That is a visible change and is the point of item 5.
- The problem sticker on kraft is 4.53:1 in both themes. It passes, but with little margin.
- The hairline colour on receipt paper shifted (see section 2).
- Still hard-coded, outside this brief: `src/components/EveningRuler.tsx` has an SVG `fontSize={13}` for the hour labels (the same size as the label or small role, but not a role reference). `src/app/pantry/lot/[id].tsx` uses `‹` as a text back chevron. Both break the "don't use text characters as icons" and "roles, not sizes" rules; not changed.
- The `focus` token is unused (see section 6).
