# Filipino copy re-check (Codex, gpt-6-sol, read-only, 2026-10-13, after the m3c edits)

**Re-check:** “I-post” and “nai-post” are now consistently hyphenated. I would keep **TENTATIVE**, **FINAL**, and **Tentative** as decided. I skipped the English-only `dash` section; its replay note contains no Filipino. No files were edited.

| File:line | Text | Verdict | Reason / corrected version if needed |
|---|---|---|---|
| `src/i18n/strings.ts:11` | Simulasyon | OK | Natural label. |
| `src/i18n/strings.ts:12` | Ngayong gabi | OK | Natural. |
| `src/i18n/strings.ts:13` | I-post ang tira | OK | Hyphenation is consistent; “tira” fits everyday speech. |
| `src/i18n/strings.ts:15` | Wala ka pang nai-post ngayong gabi. | OK | Natural; **nai-post** is consistent. |
| `src/i18n/strings.ts:17` | Pindutin ang “I-post ang tira” at isulat kung ano ang natira, gaya ng pag-text. | OK | Clear instruction. |
| `src/i18n/strings.ts:21` | Ano ang natira? | OK | Good, direct heading. |
| `src/i18n/strings.ts:22` | Ano ang natira? Isulat gaya ng pag-text, halimbawa: “May 3 tray ng adobo pa, kunin bago mag-8 PM.” | **fix** | Repeats the heading immediately. Use **“Isulat gaya ng pag-text. Halimbawa: ‘May 3 tray ng adobo pa, kunin bago mag-8 PM.’”** |
| `src/i18n/strings.ts:23` | May 3 tray ng adobo pa, kunin bago mag-8 | OK | Plausible, concise example input. |
| `src/i18n/strings.ts:24` | Pag-post gamit ang boses, hindi pa available. Darating sa susunod na build. | **fix** | “Build” sounds developer-facing when read aloud. Use **“Hindi pa puwedeng mag-post gamit ang boses. Sa susunod na bersyon pa ito.”** |
| `src/i18n/strings.ts:25` | Ang pag-unawa sa mensahe at boses ay darating sa susunod na build. Babasahin ito ni Salo at gagawing tag na iyong kukumpirmahin. | **fix** | Abstract and robotic; “build” is developer-facing. Use **“Sa susunod na bersyon, mauunawaan ni Salo ang text o boses mo at gagawa ng mga tag na kukumpirmahin mo.”** |
| `src/i18n/strings.ts:26` | Bumalik · Back | consider | Fine visually, but TalkBack reads both languages. If this is also its accessibility label, use **“Bumalik”** for that label. |
| `src/i18n/strings.ts:29` | Buksan ang detalye ng lot | OK | Actionable TalkBack hint; “lot” matches the UI vocabulary. |
| `src/i18n/strings.ts:32` | `${n} pantry ang nag-bid.` | OK | Everyday Taglish and clear. |
| `src/i18n/strings.ts:33` | `Para sa ${pantry}, hawak muna ang pagkain. ${held}` | **fix** | With line 59, “hawak muna” is said twice. Best short form: **“Para sa ${pantry} muna ang pagkain hanggang may driver na mag-confirm.”** Omit the appended `held` in this sentence. |
| `src/i18n/strings.ts:34` | `Para sa ${pantry}. Si ${driver} ang driver; tinatayang darating bandang ${eta}.` | **fix** | The first sentence is a fragment; “tinatayang” plus “bandang” is overqualified. Use **“Para sa ${pantry} ang pagkain. Si ${driver} ang driver at darating bandang ${eta}.”** |
| `src/i18n/strings.ts:35` | `Naihatid sa ${pantry} ni ${driver}.` | OK | Natural alone; the repetition comes from its caller at `Tag.tsx:42`. |
| `src/i18n/strings.ts:39` | Tapos na ang simulasyon. Simulation finished. | consider | Bilingual repetition is noticeable in TalkBack; if this is an accessibility-only label, **“Tapos na ang simulasyon.”** is enough. |
| `src/i18n/strings.ts:40` | Ihinto ang simulasyon. Pause the simulation. | **fix** | “Ihinto” suggests stopping, not pausing. Use **“I-pause ang simulasyon. Pause the simulation.”** |
| `src/i18n/strings.ts:41` | Ituloy ang simulasyon. Play the simulation. | OK | The Filipino action is clear. |
| `src/i18n/strings.ts:44–47` | Dami; Kunin bago; Kailangan ng ref kung itatabi; Hindi kailangan ng ref | OK | Short, understandable labels. |
| `src/i18n/strings.ts:50` | Nai-post; NAI-POST | OK | Consistent hyphenation. |
| `src/i18n/strings.ts:51` | May bid; MAY BID | OK | Natural Taglish. |
| `src/i18n/strings.ts:52` | Tentative; TENTATIVE | OK | Keep as decided. |
| `src/i18n/strings.ts:53–54` | May driver na; FINAL; Naihatid; NAIHATID | OK | Clear states; keep FINAL. |
| `src/i18n/strings.ts:55` | Hindi naihatid; DI NAIHATID | OK | The sticker’s “DI” is conversational and still clear. |
| `src/i18n/strings.ts:56` | Walang pantry na tumanggap; DI TINANGGAP | **fix** | The full label is clear, but the sticker loses *who* did not accept and can sound like a rejection. Keep **“Walang pantry na tumanggap”**; change the sticker to **“WALANG PANTRY”**. |
| `src/i18n/strings.ts:58` | Nai-post; May bid; Tentative; May driver; Naihatid | OK | Consistent journey labels. |
| `src/i18n/strings.ts:59` | Hawak muna hanggang may driver na mag-confirm. | OK | Clear **when used alone**; don’t append it to line 33. |
| `src/i18n/strings.ts:60` | tray; piraso; bilao; kg; tinapay; kaldero; pakete; lata | consider | Most are fine. For a quantity measured in loaves, **“loaf ng tinapay”** is more precise than `loaf: 'tinapay'` when TalkBack reads “3 tinapay.” |
| `src/components/Tag.tsx:35` | `${it.foodItemFil}, ${it.quantity} ${S.units[it.unit]}. Kunin bago …` | OK | Compact spoken summary; the loaf unit caveat is above. |
| `src/components/Tag.tsx:38` | Tentative tag sentence | **fix** | Stop passing/appending `S.heldUntilDriver.fil` after adopting the shorter line 33 wording. |
| `src/components/Tag.tsx:40` | `May driver na. Para sa … Si … ang driver…` | consider | Understandable, though “May driver na” and “Si … ang driver” overlap. If shortening further, omit the state prefix in the spoken label. |
| `src/components/Tag.tsx:42` | `Naihatid. Naihatid sa …` | **fix** | Definite TalkBack repetition. Speak the `tagWho.delivered` sentence without the preceding `S.states.delivered.fil`. |
| `src/components/Tag.tsx:44` | `May bid. ${n} pantry ang nag-bid.` | consider | Slight repetition, but the second sentence adds the count; acceptable. |
| `src/components/Tag.tsx:46` | State label after item summary | OK | No evident repetition for the remaining states. |

The handoff mentions additional inline Filipino in `src/app/index.tsx`, `src/app/donor/index.tsx`, and `src/components/TarpBar.tsx`, but does not provide those strings or line numbers. I can only verify the supplied `Oras sa simulasyon` (natural, **OK**) and the non-UI comment “Naipost” (not spoken UI copy).

### Strings still to change

| File:line | Current | Proposed | Reason |
|---|---|---|---|
| `src/i18n/strings.ts:22` | Ano ang natira? Isulat gaya ng pag-text, halimbawa: … | Isulat gaya ng pag-text. Halimbawa: … | Repeats the heading. |
| `src/i18n/strings.ts:24` | Pag-post gamit ang boses, hindi pa available. Darating sa susunod na build. | Hindi pa puwedeng mag-post gamit ang boses. Sa susunod na bersyon pa ito. | More natural; avoids “build.” |
| `src/i18n/strings.ts:25` | Ang pag-unawa sa mensahe at boses ay darating sa susunod na build. … | Sa susunod na bersyon, mauunawaan ni Salo ang text o boses mo at gagawa ng mga tag na kukumpirmahin mo. | Less robotic. |
| `src/i18n/strings.ts:33` + `src/components/Tag.tsx:38` | Para sa X, hawak muna ang pagkain. Hawak muna hanggang may driver na mag-confirm. | Para sa X muna ang pagkain hanggang may driver na mag-confirm. | Removes spoken repetition; stop appending `held`. |
| `src/i18n/strings.ts:34` | Para sa X. Si Y ang driver; tinatayang darating bandang HH:MM. | Para sa X ang pagkain. Si Y ang driver at darating bandang HH:MM. | Removes fragment and double hedging. |
| `src/i18n/strings.ts:40` | Ihinto ang simulasyon. Pause the simulation. | I-pause ang simulasyon. Pause the simulation. | Matches the pause action. |
| `src/i18n/strings.ts:56` | DI TINANGGAP | WALANG PANTRY | Clarifies the no-pantry outcome. |
| `src/components/Tag.tsx:42` | Naihatid. Naihatid sa X ni Y. | Naihatid sa X ni Y. | Removes exact spoken repetition. |
