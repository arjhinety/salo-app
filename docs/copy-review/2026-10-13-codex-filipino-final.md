# Filipino copy final check (Codex, 2026-10-13, after m3d)

| Linya | Hatol | Mungkahing teksto / dahilan |
|---|---|---|
| `example` | OK | — |
| `voiceSoon` | OK | — |
| `voiceBody` | OK | — |
| `back` | **Fix** | `Bumalik` — Inuulit lang ng “Back” ang utos kapag binasa nang malakas. |
| `tentative` | OK | — |
| `final` | **Fix** | `Para sa ${pantry} ang pagkain. Si ${driver} ang maghahatid; darating bandang ${eta}.` — Iniiwasan ang paulit-ulit na “Si … ang driver.” |
| `delivered` | OK | — |
| `finished` | OK | — |
| `pause` | **Fix** | `I-pause ang simulasyon.` — Dalawang beses ibinibigay ang parehong utos sa TalkBack. |
| `unawarded` | **Fix** | `{ fil: 'Walang pantry ang tumanggap', en: 'No pantry accepted it', sticker: 'WALANG TUMANGGAP' }` — Mas natural ang pangungusap; ang “WALANG PANTRY” ay maaaring mangahulugang walang pantry na umiiral. |
| `accessibilityLabel="Bumalik"` | OK | — |

**Remaining fixes**

| Key | Palitan ng |
|---|---|
| `back` | `Bumalik` |
| `final` | `Para sa ${pantry} ang pagkain. Si ${driver} ang maghahatid; darating bandang ${eta}.` |
| `pause` | `I-pause ang simulasyon.` |
| `unawarded` | `{ fil: 'Walang pantry ang tumanggap', en: 'No pantry accepted it', sticker: 'WALANG TUMANGGAP' }` |

**Applied:** final, pause (donor screens), unawarded. **Skipped:** back (the TalkBack label is already 'Bumalik'; the visible 'Bumalik · Back' follows the Filipino-first-with-English convention). The copy loop stops here.
