---
version: 1
slug: "salo-app-src-app-donor-index-tsx"
primary_target: "salo-app/src/app/donor/index.tsx"
related_targets: ["salo-app/src/app/donor/post.tsx"]
---

# Surface brief: Salo donor home ("Ngayong gabi")

Scope: the donor's home and post flow in the Android app (Expo). Mode: Operate. Platform: android (Material 3 structure, brand through theming).
Audience: owners and staff of karinderyas, panaderias and stalls in Cubao–Project 4, posting surplus at closing time on a phone, often one-handed and in poor light. Filipino-first copy with small English subtitles; Taglish accepted.
Task: post tonight's surplus as easily as sending a text, then see where each lot stands (bids, tentative award, driver, delivered).
Constraints: WCAG 2.2 AA; TalkBack labels on every tag; layouts hold at 200% font scale; motion calms under Remove animations; light and dark follow the system; 48dp targets; simulated data labelled as simulated.
Memorable moment: the lime TENTATIVE sticker stays slapped on a tag until a driver commits, and the tag's journey line fills station by station.
Unresolved: parsing (M4) and live sync (M5) land later; M2 shows the engine's simulated evening.

## Direction contract

THESIS: Tonight's surplus hangs as kraft price tags on one zinc string across the stall; each tag is a lot, re-marked as the evening moves. It refuses the generic card list and the chat-bot thread.

OWN-WORLD: Tarp-blue top band (wordmark, simulated clock); pale tarp-lit ground (dark: night canopy navy); kraft tags with a punched hole and string, chamfered top corners; Permanent Marker for the item name only; Archivo for every reading line, Archivo Narrow for slot labels; lime sticker as the one live-state stamp; marker-red strike for withdrawn; no gradients, no card boxes.

STORY: The donor sees tonight's lots at a glance, reads each one's state in words and on its journey line, and posts a new lot with one thumb-reach button.

FIRST VIEWPORT: Tarp band with "Salo" and the clock 18:42 plus a SIMULATED chip; one zinc string spanning the width; two to four tags hanging from it in a wrapping row, each with item (marker), dami, kunin bago, and its sticker; a journey line of five stations under each tag; an extended Material FAB "Ipost ang tira" with a mic glyph at bottom right. Signature interaction: pressing a tag lifts it off the string into a detail sheet; the sticker re-slaps when state changes.

FORM: Tonight's string of tags, grounded list #4 (the roll's lead), seed 77abcade; raised with the transit diagram's line-of-stations journey.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
