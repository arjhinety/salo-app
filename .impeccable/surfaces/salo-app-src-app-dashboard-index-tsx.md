---
version: 1
slug: "salo-app-src-app-dashboard-index-tsx"
primary_target: "salo-app/src/app/dashboard/index.tsx"
related_targets: []
---

# Surface brief: Salo live dashboard (receipt-tape trace)

Scope: the live dashboard screen in the Android app, shown on a phone that is mirrored to the projector for the CS 403 panel. Mode: Operate. Platform: android. English copy (decision: the dashboard and results are in English).
Audience: the faculty panel watching a projected demo, and the presenter driving it one-handed. The panel must see that the agents really negotiate.
Task: follow the simulated evening as the agents' messages print, pick a lot, force a failure (Cancel driver), and replay the same evening under a baseline.
Constraints: legible when mirrored (large type, high contrast); a list-based, screen-reader-friendly trace; reduced motion turns the printing into instant appends; light and dark; simulated data labelled.
Memorable moment: a lot's TENTATIVE wait is printed on the tape as a lime bar whose length is the minutes it waited, and it is cut off cleanly when a driver COMMITs, or struck in marker red when the driver fails and the delivery is re-announced.
Unresolved: two-phone sync (M5); the results screen (M6).

## Direction contract

THESIS: The evening prints as a palengke receipt tape: every contract-net message is a line on the tape, grouped by lot, so the panel reads the negotiation itself. It refuses the KPI-card ops dashboard.

OWN-WORLD: Tarp-blue band with the clock and play/speed; an evening ruler 17:00–21:00 with a needle; an off-white receipt tape with a torn edge, set in Archivo with message types in Archivo Narrow caps; lot headers carry a kraft tag chip in Permanent Marker; lime TENTATIVE duration bars; marker-red strikes for FAILURE; zinc rules. No gradients, no cards.

STORY: The panel watches announcements, bids, refusals with plain reasons, a tentative award held until a driver commits, and recovery after a forced failure; then the same evening replays under a baseline.

FIRST VIEWPORT: The tarp band (Salo, evening id, SIMULATED, clock, play/pause, speed) over the full-width evening ruler; below, the tape for the selected lot fills the screen, newest line at the bottom, each line "time · TYPE · who · detail"; a lot strip of kraft chips and two actions, Cancel driver and Replay with baseline, docked at the thumb. The signature lime TENTATIVE bar sits inside the tape.

FORM: Receipt-tape trace, grounded list #6 (the roll's lead), seed 1cb6eaaf; raised with labanotation's rule that a mark's length is its exact duration (TENTATIVE bar length = minutes waited).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
