# Filipino copy review, 2026-11-01 (agy CLI, Gemini 3.8 Flash medium)

Codex CLI was logged out (401), so Arjhine asked for the review to run through the `agy` CLI with `gemini-3.8-flash-medium`. Run read-only (`--mode plan`, from a temp folder, strings pasted inline, no tools). English halves were not reviewed.

| # | Key | String (Filipino part) | Verdict | Applied |
|---|---|---|---|---|
| 1 | `SYNC.join.tooMany` | Masyadong maraming subok. Maghintay ng 10 minuto. | Gemini: use "attempt" (natural) and "nang 10 minuto" | **Changed to "Masyadong maraming attempt. Maghintay ng 10 minuto."** "subok" alone means "proven", so it is an odd noun for a try, and the app already mixes English terms. **"nang" rejected:** after "maghintay", a duration takes "ng" ("maghintay ng sampung minuto"); "nang" is for manner and time adverbs. |
| 2 | `S.clockA11y` | Oras sa simulasyon {clock}. | Gemini: add a colon for a natural screen-reader pause | **Changed to "Oras sa simulasyon: {clock}."** |
| 3 | `DRV.simNote` | Gawa-gawa lang para sa simulasyon ang lahat ng tagahatid, lugar, at numero rito. | FINE | — |
| 4 | `DRV.chooserHint` | Pumili ng tagahatid na tatanggap ng mga request. Ikaw ang gaganap bilang napili mo. | FINE | — |
| 5 | `DRV.chooserLocked` | Hindi na mapapalitan ang tagahatid ngayong gabi. I-pause at i-rewind sa 5:00 PM para mapalitan. | FINE | — |
| 6 | `DRV.requestsEmptyHint` | Lalabas dito ang mga request habang umuusad ang oras sa simulasyon. | FINE | — |
| 7 | `SYNC.join.placeholder` | Hal. ABC123 | FINE | — |

Not sent: the `S.postForm.*` strings (only their separator changed from " / " to " · "; the Filipino text is unchanged).

Model reviews are a second opinion, not native-speaker review: a Filipino speaker should still read the two changed lines.
