---
name: Salo
description: A palengke price board that catches tonight's surplus food; kraft tags on a zinc string under a tarp-blue canopy.
colors:
  tarp-blue: "#1947b8"
  tarp-night: "#0f2f7a"
  tarp-ink: "#1947b8"
  tarp-ink-night: "#78a3f8"
  on-tarp: "#ffffff"
  kraft: "#d6ae7b"
  kraft-edge: "#b68e5c"
  kraft-edge-night: "#9c764a"
  on-kraft: "#161616"
  on-kraft-muted: "#4a3520"
  on-kraft-alert: "#8f110b"
  marker-ink: "#161616"
  sticker-lime: "#d6ff3d"
  on-lime: "#161616"
  receipt-paper: "#fbf8f0"
  receipt-paper-night: "#ece5d2"
  on-tape: "#161616"
  on-tape-night: "#141414"
  marker-red: "#a8150f"
  marker-red-night: "#ff7a6b"
  ground: "#e6ecf6"
  ground-raised: "#f3f6fb"
  ground-night: "#0b1328"
  ground-raised-night: "#132042"
  text: "#161616"
  text-muted: "#3a4a66"
  text-night: "#e6ecf6"
  text-muted-night: "#aebbd4"
  zinc: "#8c99a8"
  zinc-night: "#7f8ca3"
  rule: "#c3cddc"
  rule-night: "#2a3a63"
  scrim: "rgba(15, 47, 122, 0.45)"
  scrim-night: "rgba(0, 0, 0, 0.6)"
typography:
  wordmark:
    fontFamily: "Permanent Marker, cursive"
    fontSize: "26px"
    fontWeight: 400
    lineHeight: "32px"
  item:
    fontFamily: "Permanent Marker, cursive"
    fontSize: "24px"
    fontWeight: 400
    lineHeight: "30px"
  chip-item:
    fontFamily: "Permanent Marker, cursive"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: "24px"
  sticker:
    fontFamily: "Permanent Marker, cursive"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "18px"
  title:
    fontFamily: "Archivo, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: "26px"
  body:
    fontFamily: "Archivo, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "22px"
  body-strong:
    fontFamily: "Archivo, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "22px"
  label:
    fontFamily: "Archivo Narrow, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "16px"
    letterSpacing: "0.4px"
  small:
    fontFamily: "Archivo Narrow, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "17px"
  tape-type:
    fontFamily: "Archivo Narrow, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: "20px"
    letterSpacing: "0.6px"
  tape-body:
    fontFamily: "Archivo, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "22px"
rounded:
  stamp: "3px"
  board: "4px"
  tag: "6px"
  field: "8px"
  fab: "16px"
  sheet: "28px"
  round: "9999px"
spacing:
  xs: "4px"
  s: "8px"
  m: "12px"
  l: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.tarp-blue}"
    textColor: "{colors.on-tarp}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.board}"
    padding: "0 12px"
    height: "52px"
  button-outline:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.text}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.board}"
    padding: "0 12px"
    height: "48px"
  button-on-tarp:
    backgroundColor: "{colors.tarp-blue}"
    textColor: "{colors.on-tarp}"
    rounded: "{rounded.board}"
    size: "48px"
  fab-post:
    backgroundColor: "{colors.tarp-blue}"
    textColor: "{colors.on-tarp}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.fab}"
    padding: "0 20px"
    height: "56px"
  chip-choice:
    backgroundColor: "{colors.ground-raised}"
    textColor: "{colors.text}"
    typography: "{typography.body-strong}"
    rounded: "{rounded.field}"
    padding: "8px 12px"
    height: "48px"
  chip-choice-selected:
    backgroundColor: "{colors.tarp-blue}"
    textColor: "{colors.on-tarp}"
    rounded: "{rounded.field}"
  input-composer:
    backgroundColor: "{colors.ground-raised}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "8px"
    height: "96px"
  price-tag:
    backgroundColor: "{colors.kraft}"
    textColor: "{colors.on-kraft}"
    typography: "{typography.item}"
    rounded: "{rounded.tag}"
    padding: "32px 12px 12px"
  lot-chip:
    backgroundColor: "{colors.kraft}"
    textColor: "{colors.marker-ink}"
    typography: "{typography.chip-item}"
    rounded: "{rounded.board}"
    padding: "8px 12px"
    height: "56px"
  sticker-live:
    backgroundColor: "{colors.sticker-lime}"
    textColor: "{colors.on-lime}"
    typography: "{typography.sticker}"
    rounded: "{rounded.stamp}"
    padding: "2px 6px"
  sticker-quiet:
    textColor: "{colors.on-kraft-muted}"
    typography: "{typography.sticker}"
    rounded: "{rounded.stamp}"
    padding: "2px 6px"
  receipt-tape:
    backgroundColor: "{colors.receipt-paper}"
    textColor: "{colors.on-tape}"
    typography: "{typography.tape-body}"
    padding: "0 16px 8px"
  tarp-bar:
    backgroundColor: "{colors.tarp-blue}"
    textColor: "{colors.on-tarp}"
    typography: "{typography.wordmark}"
    padding: "8px 16px 12px"
  bottom-sheet:
    backgroundColor: "{colors.ground-raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.sheet}"
    padding: "8px 24px 16px"
---

# Design System: Salo

## Overview

**Creative North Star: "The Palengke Price Board"**

Salo is a market stall at closing time, drawn as an Android app. A tarp-blue canopy runs across the top of every screen and carries the wordmark, the simulated clock, and a SIMULASYON / SIMULATED chip. Under it, the ground is pale tarp-lit blue by day and a navy night canopy after dark. Each lot is a physical object: a kraft price tag hung from a sagging zinc string, a kraft chip in the dashboard's lot strip, or a line printed on an off-white receipt tape with a torn top edge. State is shown the way a vendor would mark it: a rotated sticker on the tag, a marker-red strike, and a lime bar whose length is the minutes it waited.

The density is calm and readable at arm's length and on a projector. Type is large and set by role, every touch target is at least 48dp, and layouts reflow rather than truncate at 200% font scale. The physical objects (kraft, tape, marker ink) look the same in light and dark, because they are the same tag under a different light. Only the ground, the canopy, and screen text change with the theme.

Filipino comes first on donor, pantry and driver screens, with English set smaller and muted underneath or after a " · ". The dashboard and results are in English. The visual consequence is that every heading is really a pair: a title line plus a small muted subtitle.

**Key Characteristics:**
- A tarp-blue canopy bar on every screen; content sits on a flat pale ground.
- Lots are kraft objects (tags, chips, cards) with hand-lettered Permanent Marker names.
- Lime marks the one live state, TENTATIVE. Nothing else is lime.
- Message traces print on receipt paper, with Archivo Narrow caps for message types.
- Flat surfaces. Depth comes from hanging, punching and tearing, not from shadows.
- Bilingual pairs: a Filipino title line, then English in small muted Archivo Narrow.
- Follows the system theme, 200% font scale, TalkBack, and Android's "Remove animations".

## Colors

A saturated canopy blue and warm kraft brown, punctuated by one acid lime and marker red, over cool pale neutrals.

### Primary
- **Tarp Blue** (tarp-blue; night: tarp-night): the canopy. Used for the top bar, the results band, the post FAB, filled primary actions (Replay with baseline, a driver's Offer), and selected choice chips and dashboard views. Text on it is always white (on-tarp).
- **Tarp Ink** (tarp-ink; night: tarp-ink-night): tarp as ink on the ground or raised ground, for the link-weight labels (PUMASOK, CLOSE, the role-state label), the back link, radio rings and dots, the listening mic, the composer caret, and the dashed outline of a stranded box. The night tarp-night reads at about 1.3:1 on the night canopy, so night uses the next step of the tarp-night ramp (#78a3f8, 6.4 to 7.4:1).

### Secondary
- **Kraft Tag** (kraft, with kraft-edge for outline, rule and punched-hole stroke): every lot as a physical object, including donor and pantry tags, driver request and run cards, draft cards on the post screen, the dashboard header tag, and lot-strip chips. It stays kraft in both themes. Ink on kraft is on-kraft, with on-kraft-muted for slot labels and English glosses.

### Tertiary
- **Sticker Lime** (sticker-lime, ink on-lime): the TENTATIVE sticker and the TENTATIVE duration bar on the tape. It is the same in both themes.
- **Marker Red** (marker-red; night: marker-red-night): errors and alerts on the ground, such as a cancel action, validation lines, and session-banner alerts.
- **Tag Alert Red** (on-kraft-alert): red that sits on kraft or paper, such as the stranded or unawarded sticker, FAILURE message types, the strike across a failed lot's lime bar, and a failed journey line. It is the same in both themes.

### Neutral
- **Tarp-Lit Ground / Night Canopy** (ground, ground-night): the screen background.
- **Raised Ground** (ground-raised, ground-raised-night): bottom sheets, the session banner, the post composer, unselected choice chips, and the pressed state of list rows.
- **Receipt Paper** (receipt-paper; night: receipt-paper-night): the dashboard tape, the bid list, the results paper, the offline-parse banner, and the stepper buttons on draft cards. Ink is on-tape.
- **Ink** (text, text-night) and **Muted Ink** (text-muted, text-muted-night): screen text, English subtitles, and hints.
- **Zinc String** (zinc, zinc-night): the stall string, tag drops, the evening ruler, the dashed outline of empty states, the sheet handle, and the border of a disabled action.
- **Rule** (rule, rule-night): hairline list dividers (on the ground and on receipt paper), field and chip outlines, and the fill of a disabled primary button.
- **Scrim** (scrim, scrim-night): behind the bottom sheet.

### Named Rules
**The One Live Stamp Rule.** Lime means TENTATIVE (held until a driver commits) and nothing else. Every other sticker is marker ink on kraft, which is how lime keeps its meaning.

**The Kraft Stays Kraft Rule.** Kraft, marker ink, tag-alert red and on-lime are identical in light and dark. Tape paper shifts only slightly. Physical objects do not follow the theme; the ground and canopy do.

**The Ink Follows The Surface Rule.** On kraft or paper, use the on-kraft, on-tape and on-kraft-alert inks. Theme text and theme red belong on the ground only.

## Typography

**Display Font:** Permanent Marker (loaded as `PermanentMarker_400Regular`)
**Body Font:** Archivo 400 / 600 / 700
**Label Font:** Archivo Narrow 500 / 600

**Character:** A felt-tip vendor's hand for the things a vendor would write (the name, the item, the stamp), set against a sturdy grotesque for everything that has to be read accurately. Archivo Narrow carries the slot labels and fine print the way a printed price board does.

### Hierarchy
- **Wordmark** (Permanent Marker, 26/32): "Salo" on the tarp bar and the results title.
- **Item** (Permanent Marker, 24/30): the food name on a price tag.
- **Chip Item** (Permanent Marker, 20/24): the lot name on a lot-strip chip and the tape header.
- **Sticker** (Permanent Marker, 15/18): state stamps (NAIHATID, TENTATIVE).
- **Title** (Archivo 700, 20/26): screen and section headings, the clock, and the sheet title.
- **Body / Body Strong** (Archivo 400 / 600, 16/22): reading lines, slot values, and button labels.
- **Label** (Archivo Narrow 600, 13/16, +0.4 tracking, uppercase in use): slot labels on tags (DAMI, KUNIN BAGO), the simulated chip, and role-state labels.
- **Small** (Archivo Narrow 500, 13/17): English subtitles, hints, and secondary lines.
- **Tape Type / Tape Body** (Archivo Narrow 600 15/20, +0.6 tracking, caps / Archivo 400 16/22): one tape line is "time  TYPE  who · detail".

Sizes are in sp and scale with the system font setting. Line heights scale with them on Android.

### Named Rules
**The Marker Is For Names Rule.** Permanent Marker is used only for the wordmark, item names, lot chips and stickers. It never sets a sentence, a heading, or a number someone must read precisely.

**The Roles Not Sizes Rule.** Every text uses a type role from the theme. Never hand-pick a size on a screen.

**The Bilingual Pair Rule.** On donor, pantry and driver screens, Filipino leads in Title or Body Strong and English follows in Small, muted, or after a " · " on the same line. The dashboard and results are English only.

## Layout

The layout is a single column on the phone. Each screen is a tarp bar (with the safe-area top inset plus 8dp), then a scrolling body padded 16dp horizontally, with 24dp between sections on home screens and 8dp between items in a group. Spacing follows a 4dp-based scale (4, 8, 12, 16, 24, 32).

- **Donor tags** hang two per row on the string when `width / fontScale` is at least 360dp, and one per row otherwise. Each row of tags gets its own string.
- **The primary action sits at the thumb**: the donor FAB is pinned bottom-right (16dp plus the bottom inset), and the dashboard docks Cancel driver and Replay with baseline as two equal-width buttons along the bottom.
- **Home bodies reserve 120dp bottom padding** so the FAB never covers the last tag.
- **Rows wrap instead of scrolling sideways.** Slot rows, chip groups, driver choosers and dashboard controls use `flexWrap`. The lot strip is the only horizontal scroller, and it follows the newest chip.
- **The tape fills the remaining height** on the dashboard, with the newest line at the bottom. It keeps following new lines while the reader is within 24dp of the end.
- **Text is never truncated.** Nothing uses `numberOfLines`; text grows the container.
- **Touch targets** are at least 48dp. Primary and FAB actions are 52 to 56dp, and list and radio rows are 64dp.

## Elevation & Depth

The system is flat. Surfaces carry no shadow; depth comes from the physical metaphor. Tags hang from a string by a drop line into a punched hole, the tape has a torn zigzag top edge drawn in the paper's own color, and a pressed tag sinks 3dp. The one cast shadow belongs to the Material FAB, which floats over the scrolling tags. The bottom sheet separates itself with a scrim, not a shadow.

### Shadow Vocabulary
- **FAB lift** (Android `elevation: 6`; iOS shadow `0 4px 8px` of tarp-night at 25%): the post FAB only.

### Named Rules
**The Hung, Not Lifted Rule.** Objects show depth by how they hang, punch or tear, never by a drop shadow. A new surface that seems to need a shadow should become kraft, paper, or an outlined box instead.

## Shapes

Corners are nearly square, like card stock and printed boards. The default is the **board corner** (4dp), used on buttons, outlined boxes, chips, the map frame, the session banner and the simulated chip. Stickers are stamped at 3dp and rotated -4°. Pantry tags and draft cards use 6dp. Donor tags are cut paths: a rectangle with 22dp chamfers on both top corners and a 6dp punched hole near the top. Donor post-form controls (the composer, choice chips, steppers, the parse banner) use the 8dp **field** corner. Only Material primitives round further: the FAB at 16dp (a 56dp circle when icon-only), the bottom sheet's top corners at 28dp, and circular icon buttons such as the mic and remove-item buttons.

Borders say what an outline means. 1.5dp is a working outline, 2dp an emphasized one (driver choice chips, stickers, the empty state), and a hairline divides list rows. A **dashed 2dp zinc or tarp outline** marks an empty or pending state ("nothing posted yet", "writes not sent yet").

**The Board Corner Rule.** New boxes and buttons use 4dp. Use 8dp only for donor form controls and larger radii only for the Material FAB and sheet.

## Components

### Buttons
- **Shape:** board corner (4dp), minimum height 48dp, 52dp for the docked dashboard actions.
- **Primary:** tarp fill, white Body Strong label. There is one filled action per area (Replay with baseline, the driver's Offer).
- **Outline:** a transparent 1.5 to 2dp border in ink, or zinc when disabled, with an ink label. A destructive outline (Cancel driver) uses marker red for both border and label.
- **On tarp:** a white 1.5dp outline on the canopy (play and pause, speed, Results, Back). The selected speed is white-filled with a tarp label.
- **Pressed:** opacity drops to 0.7–0.88. There is no ripple color or scale change.
- **Disabled:** opacity 0.4, or a rule-colored fill for a primary with a muted label. The disabled state is also set in `accessibilityState`.

### Post FAB (signature)
This is the one primary action on the donor home: a Material extended FAB in tarp blue with an authored mic icon and "I-post ang tira", 56dp tall with 16dp corners. At 150% font scale and above it becomes a 56dp round icon-only button that keeps the same TalkBack label.

### Chips
- **Choice chips** (pickup time, items): 48dp, 8dp corners, raised-ground fill with a rule outline. Selected chips turn tarp with white text.
- **Lot-strip chips:** kraft, 4dp, 56dp tall and 120 to 200dp wide, with the name in Chip Item and a sticker below. Selection is shown by an ink outline 3dp thick.
- **Driver chooser chips:** 2dp ink outline. Selected chips are tarp-filled.

### Price Tag (signature)
A kraft tag with chamfered top corners and a kraft-edge stroke, hung from the stall string by a 2dp zinc drop into a punched hole. The sticker sits top-right in the layout flow, so it never covers the hole or the name at any scale. Then come the item in Marker, the English gloss in Small, a kraft-edge rule at 60% opacity, and slot rows (an uppercase Narrow label on the left, a Body Strong value on the right, wrapping when needed). An optional fridge note and destination line follow, and the five-station journey line sits at the bottom. The whole tag is one TalkBack sentence and a polite live region.

### Sticker
A stamp rotated -4° with a 2dp border and 3dp corners, set in Marker 15. There are four kinds. **Live** is lime fill with ink; **done** is an ink outline; **problem** is a tag-alert-red outline; **quiet** is a muted outline. It is hidden from TalkBack unless `live`, because its parent already speaks the state.

### Journey Line
A line of five stations: a dashed muted track, a solid 2.5dp ink fill up to the current station, dots 4dp in radius (5.5dp at the current station), and the station name in Small underneath. It turns tag-alert red when a lot fails, and is hidden from TalkBack.

### Receipt Tape (signature)
Off-white paper with a torn top edge, 16dp side padding, and hairline-divided lines. A TENTATIVE wait prints as a lime bar exactly 44dp per simulated minute, 14dp tall with a 1.5dp ink border. That length never scales with font size. A FAILURE strikes the bar with a 3dp tag-alert-red diagonal. While a bar is open it grows in 320ms with an exponential ease-out, or jumps instantly under reduced motion.

### Evening Ruler
A full-width zinc baseline from 17:00 to 21:30, with half-hour ticks, hour labels in Narrow 13, small kraft-edge marks where lots were posted, and an ink needle at the clock. You tap or drag it to seek, and TalkBack treats it as an adjustable control that moves in 5-minute steps.

### Cards / Containers
- **Kraft cards** (driver requests and runs, draft cards): kraft fill with a 1.5dp kraft-edge border, 4–6dp corners, 12–16dp padding, and a kraft-edge rule between the head and the facts.
- **Outlined info boxes** (pantry budget, session banner, evening code): ground or raised-ground fill, a 1–1.5dp rule or zinc border, 4dp corners, and 12dp padding.
- **Empty states:** a dashed 2dp zinc outline with 16dp padding, a Body Strong line, and a muted hint.
- **No elevation** on any container.

### Inputs / Fields
- **Composer:** a raised-ground box with a 1dp rule border and 8dp corners, at least 96dp tall. A 48dp round mic button sits inside on the right and gets a tarp border while listening. The cursor and selection are tarp.
- **Join code:** 48dp tall, a 1.5dp rule border, 4dp corners, and Body Strong with 4dp letter spacing.
- **Errors:** a marker-red Small or Body line under the control, announced through a polite live region.

### Navigation
- **Tarp bar:** the wordmark on the left; on the right, the simulated chip (1.5dp white outline) and the clock in Title. Below them are a subtitle in Small and optional controls, finished with a 3dp hem of white at 18% opacity.
- **Bottom sheet:** raised ground with 28dp top corners, a 32 by 4dp zinc handle, and 64dp radio rows (22dp ring, tarp dot). A CLOSE label button sits at the end, over a scrim.
- **Role list:** 64dp rows divided by rules. Each row shows the Filipino role, then a muted "· English" line and a state label in tarp ink.
- **Screen transitions:** a fade, or no transition under reduced motion.

### Icons
These are authored SVG stroke icons with a single 2dp stroke weight on a 24 grid, with round caps (mic, fridge, play, pause, the donor tag's arrow, the stepper's minus and plus, and the remove cross). They are hidden from TalkBack because their button carries the label.

## Do's and Don'ts

### Do:
- **Do** put every lot on a physical surface (kraft tag, kraft chip, or tape line), and give its name in Permanent Marker.
- **Do** keep lime for TENTATIVE only, on the sticker and the tape bar.
- **Do** use on-kraft, on-tape and on-kraft-alert ink on kraft and paper, in both themes.
- **Do** pair every donor, pantry and driver heading as a Filipino line followed by small muted English.
- **Do** make every touchable at least 48dp, with primary actions at 52–56dp and list rows at 64dp.
- **Do** let text wrap and containers grow; check every new surface at 200% font scale.
- **Do** read `reduceMotion` from the theme for every animation, auto-scroll and transition, and replace motion with instant cuts.
- **Do** make state changes polite live regions, and speak one complete sentence per tag, row or card.
- **Do** carry state in words (sticker text, station name, struck count read as "was N") as well as in color.
- **Do** label simulated data on the tarp bar with the SIMULASYON / SIMULATED chip.

### Don't:
- **Don't** use gradients.
- **Don't** use generic elevated white cards or KPI tiles. Containers are kraft, paper, or flat outlined boxes.
- **Don't** add drop shadows to anything except the post FAB.
- **Don't** use lime for emphasis, selection, success or delivered.
- **Don't** set sentences, headings or numbers in Permanent Marker.
- **Don't** hand-pick font sizes, or truncate essential text with `numberOfLines`.
- **Don't** put theme red or theme text on kraft or tape paper.
- **Don't** make the clock a live region; only state changes are announced.
- **Don't** use text characters as icons. Draw a 2dp stroke SVG instead.
- **Don't** scale the tape's minute bars with the font setting. Bar length is time.
