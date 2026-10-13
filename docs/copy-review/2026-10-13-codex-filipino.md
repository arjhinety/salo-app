# Filipino copy review (Codex, gpt-6-sol, read-only, 2026-10-13)

Strings reviewed: src/i18n/strings.ts and all Filipino literals in src/app, src/components, src/donor, src/live, pasted into the prompt. Codex could not open files from its sandbox on the first attempt, so the second run received the text inline.

**Arjhine's decision:** keep the TENTATIVE and FINAL stickers in English, matching the guide, mockup and dashboard. Apply every other fix in the table.

Sinuri ko ang **user-facing Filipino copy** sa ibinigay na source. Hindi ko isinama ang `dash` strings at dashboard chip: tahasang English-only ang faculty dashboard ayon sa source comment. Wala akong inedit na file.

### `src/i18n/strings.ts`

| Linya | Kasalukuyan | Hatol | Mungkahi / dahilan |
|---|---|---|---|
| 11 | `Simulasyon` | OK | — |
| 12 | `Ngayong gabi` | OK | — |
| 13 | `Ipost ang tira` | fix | `I-post ang tira` — Lagyan ng gitling ang English loan verb. |
| 15 | `Wala ka pang naipost ngayong gabi.` | fix | `Wala ka pang nai-post ngayong gabi.` — Pare-pareho ang baybay ng *post*. |
| 17 | `Pindutin ang “Ipost ang tira” at sabihin o isulat kung ano ang natira, gaya ng pag-text.` | fix | `Pindutin ang “I-post ang tira” at isulat kung ano ang natira, gaya ng pag-text.` — Hindi pa available ang voice input; huwag itong ipangako sa hint. |
| 20 | `Dami` | OK | — |
| 21 | `Kunin bago` | OK | —; malinaw bilang maikling label na sinusundan ng oras. |
| 22 | `Kailangan ng ref kung itatabi` | OK | —; malinaw na para sa pagkaing itatabi, hindi ihahain ngayong gabi. |
| 23 | `Hindi kailangan ng ref` | OK | — |
| 26 | `Naipost` / `NAIPOST` | fix | `Nai-post` / `NAI-POST` — Panatilihin ang gitling sa label at sticker. |
| 27 | `May bid` / `MAY BID` | OK | —; maikli at angkop sa konsepto ng offers. |
| 28 | `Tentative` / `TENTATIVE` | fix | `Hawak muna` / `HAWAK MUNA` — Filipino-first at ipinapahiwatig na may nanalong pantry pero naghihintay pa ng driver. |
| 29 | `May driver na` / `FINAL` | fix | Panatilihin ang label; gawing `MAY DRIVER` ang sticker — English-only at hindi kasinglinaw ng status ang `FINAL`. |
| 30 | `Naihatid` / `NAIHATID` | OK | — |
| 31 | `Hindi naihatid` / `WALANG DRIVER` | fix | Panatilihin ang label; gawing `DI NAIHATID` ang sticker — Posibleng may driver na nag-commit ngunit hindi sumipot; hindi laging “walang driver.” |
| 32 | `Walang kumuha` / `WALANG KUMUHA` | fix | `Walang pantry na tumanggap` / `DI TINANGGAP` — Ilinaw na pantry ang hindi tumanggap, hindi ang driver ang hindi nag-pickup. |
| 34 | `Naipost` | fix | `Nai-post` — Parehong spelling sa state label. |
| 34 | `May bid` | OK | — |
| 34 | `Tentative` | fix | `Hawak muna` — Parehong status wording sa label. |
| 34 | `May driver` | OK | — |
| 34 | `Naihatid` | OK | — |
| 35 | `Hawak muna hanggang may driver.` | fix | `Hawak muna hanggang may driver na mag-confirm.` — Hindi sapat na *may* driver; kailangan niyang mag-commit. |
| 36 | `tray`, `piraso`, `bilao`, `kg`, `tinapay`, `kaldero`, `pakete`, `lata` | OK | —; karaniwang maiikling unit label. |

### Ibang screen at component strings

| File:line | Kasalukuyan | Hatol | Mungkahi / dahilan |
|---|---|---|---|
| `src/app/donor/post.tsx:23` | `What's left? Isulat gaya ng pag-text, halimbawa: “may 3 trays adobo pa, kunin before 8”.` | fix | `Ano ang natira? Isulat gaya ng pag-text, halimbawa: “May 3 tray ng adobo pa, kunin bago mag-8 PM.”` — Filipino-first; kailangan ang **ng** bago ang ulam at malinaw na pickup time. |
| `src/app/donor/post.tsx:39` | `Sabihin gamit ang boses. Darating sa susunod na build.` | fix | `Pag-post gamit ang boses, hindi pa available. Darating sa susunod na build.` — Sa TalkBack, ang kasalukuyang unang pangungusap ay tunog available na utos. |
| `src/app/index.tsx:13` | `Walang profile na kailangan` | OK | — |
| `src/app/index.tsx:34` | `Darating sa susunod na build.` | OK | — |
| `src/app/index.tsx:47` | `PUMASOK` / `SA SUSUNOD` | OK | —; maiikling button label. |
| `src/components/SimControl.tsx:27` | `Tapos na ang simulasyon. Simulation finished.` | consider | Malinaw sa TalkBack; ngunit kung susundin ang English-only dashboard decision, gamitin ang `Simulation finished.` |
| `src/components/SimControl.tsx:28` | `Ihinto ang simulasyon. Pause the simulation.` | consider | Ang *ihinto* ay maaaring permanenteng stop ang dating; para sa pause, mas tumpak ang `I-pause ang simulasyon.` o English-only na `Pause simulation.` |
| `src/components/SimControl.tsx:29` | `Ituloy ang simulasyon. Play the simulation.` | consider | Ang *ituloy* ay tunog resume, kahit maaari ring unang play; kung English-only ang dashboard, `Play simulation.` |
| `src/components/Tag.tsx:34` | `Tentative kay ${v.pantryName}. ${S.heldUntilDriver.fil}` | fix | `Para sa ${v.pantryName}, hawak muna ang pagkain. ${S.heldUntilDriver.fil}` — Gamitin ang **sa** para sa organisasyong pantry; alisin ang English-only status. |
| `src/components/Tag.tsx:35` | `Para kay ${v.pantryName}. Driver: ${v.driverName}, darating bago ${hhmm(v.etaMinute!)}.` | fix | `Para sa ${v.pantryName}. Si ${v.driverName} ang driver; tinatayang darating bandang ${hhmm(v.etaMinute!)}.` — **Sa** para sa pantry; ang ETA ay tantiya, hindi pangakong “bago” ang oras. |
| `src/components/Tag.tsx:36` | `Naihatid kay ${v.pantryName} ni ${v.driverName}.` | fix | `Naihatid sa ${v.pantryName} ni ${v.driverName}.` — **Sa** ang natural na marker para sa destinasyong pantry. |
| `src/components/Tag.tsx:37` | `${v.bids} pantry ang nag-bid.` | OK | —; natural na Taglish at tama ang gitling. |
| `src/components/Tag.tsx:39` | `${it.foodItemFil}, ${it.quantity} ${S.units[it.unit]}. Kunin bago ${hhmm(v.lot.pickupByMinute)}. ${st.fil}. ${who}` | OK | —; malinaw ang deadline at buong status sa TalkBack. |
| `src/components/Tag.tsx:59` | `Buksan ang detalye ng lot` | consider | `Buksan ang detalye ng post` — Mas pamilyar kaysa *lot* kung hindi ipinapaliwanag ang terminong iyon sa user. |
| `src/components/TarpBar.tsx:31` | `Oras sa simulasyon ${clock}` | OK | — |

### Mga string na babaguhin

| File:line | Current | Proposed | Reason |
|---|---|---|---|
| `src/i18n/strings.ts:13` | `Ipost ang tira` | `I-post ang tira` | Gitling sa loan verb. |
| `src/i18n/strings.ts:15` | `Wala ka pang naipost ngayong gabi.` | `Wala ka pang nai-post ngayong gabi.` | Pare-parehong baybay. |
| `src/i18n/strings.ts:17` | `Pindutin ang “Ipost ang tira” at sabihin o isulat kung ano ang natira, gaya ng pag-text.` | `Pindutin ang “I-post ang tira” at isulat kung ano ang natira, gaya ng pag-text.` | Hindi pa available ang voice input. |
| `src/i18n/strings.ts:26` | `Naipost` / `NAIPOST` | `Nai-post` / `NAI-POST` | Gitling sa label at sticker. |
| `src/i18n/strings.ts:28` | `Tentative` / `TENTATIVE` | `Hawak muna` / `HAWAK MUNA` | Filipino-first, maikling held status. |
| `src/i18n/strings.ts:29` | `FINAL` | `MAY DRIVER` | Mas malinaw na Filipino sticker. |
| `src/i18n/strings.ts:31` | `WALANG DRIVER` | `DI NAIHATID` | Sakop pati driver no-show o failure. |
| `src/i18n/strings.ts:32` | `Walang kumuha` / `WALANG KUMUHA` | `Walang pantry na tumanggap` / `DI TINANGGAP` | Iwas kalituhan sa pickup. |
| `src/i18n/strings.ts:34` | `Naipost` | `Nai-post` | Pareho sa state label. |
| `src/i18n/strings.ts:34` | `Tentative` | `Hawak muna` | Pareho sa state label. |
| `src/i18n/strings.ts:35` | `Hawak muna hanggang may driver.` | `Hawak muna hanggang may driver na mag-confirm.` | Kailangan ng driver commitment. |
| `src/app/donor/post.tsx:23` | `What's left? Isulat gaya ng pag-text, halimbawa: “may 3 trays adobo pa, kunin before 8”.` | `Ano ang natira? Isulat gaya ng pag-text, halimbawa: “May 3 tray ng adobo pa, kunin bago mag-8 PM.”` | Filipino-first; ayusin ang **ng** at oras. |
| `src/app/donor/post.tsx:39` | `Sabihin gamit ang boses. Darating sa susunod na build.` | `Pag-post gamit ang boses, hindi pa available. Darating sa susunod na build.` | Hindi magmukhang available na TalkBack action. |
| `src/components/Tag.tsx:34` | `Tentative kay ${v.pantryName}. ${S.heldUntilDriver.fil}` | `Para sa ${v.pantryName}, hawak muna ang pagkain. ${S.heldUntilDriver.fil}` | **Sa** para sa pantry; Filipino status. |
| `src/components/Tag.tsx:35` | `Para kay ${v.pantryName}. Driver: ${v.driverName}, darating bago ${hhmm(v.etaMinute!)}.` | `Para sa ${v.pantryName}. Si ${v.driverName} ang driver; tinatayang darating bandang ${hhmm(v.etaMinute!)}.` | Marker, natural na TalkBack, at tamang kahulugan ng ETA. |
| `src/components/Tag.tsx:36` | `Naihatid kay ${v.pantryName} ni ${v.driverName}.` | `Naihatid sa ${v.pantryName} ni ${v.driverName}.` | **Sa** para sa destinasyon. |
tokens used
26,533
Sinuri ko ang **user-facing Filipino copy** sa ibinigay na source. Hindi ko isinama ang `dash` strings at dashboard chip: tahasang English-only ang faculty dashboard ayon sa source comment. Wala akong inedit na file.

### `src/i18n/strings.ts`

| Linya | Kasalukuyan | Hatol | Mungkahi / dahilan |
|---|---|---|---|
| 11 | `Simulasyon` | OK | — |
| 12 | `Ngayong gabi` | OK | — |
| 13 | `Ipost ang tira` | fix | `I-post ang tira` — Lagyan ng gitling ang English loan verb. |
| 15 | `Wala ka pang naipost ngayong gabi.` | fix | `Wala ka pang nai-post ngayong gabi.` — Pare-pareho ang baybay ng *post*. |
| 17 | `Pindutin ang “Ipost ang tira” at sabihin o isulat kung ano ang natira, gaya ng pag-text.` | fix | `Pindutin ang “I-post ang tira” at isulat kung ano ang natira, gaya ng pag-text.` — Hindi pa available ang voice input; huwag itong ipangako sa hint. |
| 20 | `Dami` | OK | — |
| 21 | `Kunin bago` | OK | —; malinaw bilang maikling label na sinusundan ng oras. |
| 22 | `Kailangan ng ref kung itatabi` | OK | —; malinaw na para sa pagkaing itatabi, hindi ihahain ngayong gabi. |
| 23 | `Hindi kailangan ng ref` | OK | — |
| 26 | `Naipost` / `NAIPOST` | fix | `Nai-post` / `NAI-POST` — Panatilihin ang gitling sa label at sticker. |
| 27 | `May bid` / `MAY BID` | OK | —; maikli at angkop sa konsepto ng offers. |
| 28 | `Tentative` / `TENTATIVE` | fix | `Hawak muna` / `HAWAK MUNA` — Filipino-first at ipinapahiwatig na may nanalong pantry pero naghihintay pa ng driver. |
| 29 | `May driver na` / `FINAL` | fix | Panatilihin ang label; gawing `MAY DRIVER` ang sticker — English-only at hindi kasinglinaw ng status ang `FINAL`. |
| 30 | `Naihatid` / `NAIHATID` | OK | — |
| 31 | `Hindi naihatid` / `WALANG DRIVER` | fix | Panatilihin ang label; gawing `DI NAIHATID` ang sticker — Posibleng may driver na nag-commit ngunit hindi sumipot; hindi laging “walang driver.” |
| 32 | `Walang kumuha` / `WALANG KUMUHA` | fix | `Walang pantry na tumanggap` / `DI TINANGGAP` — Ilinaw na pantry ang hindi tumanggap, hindi ang driver ang hindi nag-pickup. |
| 34 | `Naipost` | fix | `Nai-post` — Parehong spelling sa state label. |
| 34 | `May bid` | OK | — |
| 34 | `Tentative` | fix | `Hawak muna` — Parehong status wording sa label. |
| 34 | `May driver` | OK | — |
| 34 | `Naihatid` | OK | — |
| 35 | `Hawak muna hanggang may driver.` | fix | `Hawak muna hanggang may driver na mag-confirm.` — Hindi sapat na *may* driver; kailangan niyang mag-commit. |
| 36 | `tray`, `piraso`, `bilao`, `kg`, `tinapay`, `kaldero`, `pakete`, `lata` | OK | —; karaniwang maiikling unit label. |

### Ibang screen at component strings

| File:line | Kasalukuyan | Hatol | Mungkahi / dahilan |
|---|---|---|---|
| `src/app/donor/post.tsx:23` | `What's left? Isulat gaya ng pag-text, halimbawa: “may 3 trays adobo pa, kunin before 8”.` | fix | `Ano ang natira? Isulat gaya ng pag-text, halimbawa: “May 3 tray ng adobo pa, kunin bago mag-8 PM.”` — Filipino-first; kailangan ang **ng** bago ang ulam at malinaw na pickup time. |
| `src/app/donor/post.tsx:39` | `Sabihin gamit ang boses. Darating sa susunod na build.` | fix | `Pag-post gamit ang boses, hindi pa available. Darating sa susunod na build.` — Sa TalkBack, ang kasalukuyang unang pangungusap ay tunog available na utos. |
| `src/app/index.tsx:13` | `Walang profile na kailangan` | OK | — |
| `src/app/index.tsx:34` | `Darating sa susunod na build.` | OK | — |
| `src/app/index.tsx:47` | `PUMASOK` / `SA SUSUNOD` | OK | —; maiikling button label. |
| `src/components/SimControl.tsx:27` | `Tapos na ang simulasyon. Simulation finished.` | consider | Malinaw sa TalkBack; ngunit kung susundin ang English-only dashboard decision, gamitin ang `Simulation finished.` |
| `src/components/SimControl.tsx:28` | `Ihinto ang simulasyon. Pause the simulation.` | consider | Ang *ihinto* ay maaaring permanenteng stop ang dating; para sa pause, mas tumpak ang `I-pause ang simulasyon.` o English-only na `Pause simulation.` |
| `src/components/SimControl.tsx:29` | `Ituloy ang simulasyon. Play the simulation.` | consider | Ang *ituloy* ay tunog resume, kahit maaari ring unang play; kung English-only ang dashboard, `Play simulation.` |
| `src/components/Tag.tsx:34` | `Tentative kay ${v.pantryName}. ${S.heldUntilDriver.fil}` | fix | `Para sa ${v.pantryName}, hawak muna ang pagkain. ${S.heldUntilDriver.fil}` — Gamitin ang **sa** para sa organisasyong pantry; alisin ang English-only status. |
| `src/components/Tag.tsx:35` | `Para kay ${v.pantryName}. Driver: ${v.driverName}, darating bago ${hhmm(v.etaMinute!)}.` | fix | `Para sa ${v.pantryName}. Si ${v.driverName} ang driver; tinatayang darating bandang ${hhmm(v.etaMinute!)}.` — **Sa** para sa pantry; ang ETA ay tantiya, hindi pangakong “bago” ang oras. |
| `src/components/Tag.tsx:36` | `Naihatid kay ${v.pantryName} ni ${v.driverName}.` | fix | `Naihatid sa ${v.pantryName} ni ${v.driverName}.` — **Sa** ang natural na marker para sa destinasyong pantry. |
| `src/components/Tag.tsx:37` | `${v.bids} pantry ang nag-bid.` | OK | —; natural na Taglish at tama ang gitling. |
| `src/components/Tag.tsx:39` | `${it.foodItemFil}, ${it.quantity} ${S.units[it.unit]}. Kunin bago ${hhmm(v.lot.pickupByMinute)}. ${st.fil}. ${who}` | OK | —; malinaw ang deadline at buong status sa TalkBack. |
| `src/components/Tag.tsx:59` | `Buksan ang detalye ng lot` | consider | `Buksan ang detalye ng post` — Mas pamilyar kaysa *lot* kung hindi ipinapaliwanag ang terminong iyon sa user. |
| `src/components/TarpBar.tsx:31` | `Oras sa simulasyon ${clock}` | OK | — |

### Mga string na babaguhin

| File:line | Current | Proposed | Reason |
|---|---|---|---|
| `src/i18n/strings.ts:13` | `Ipost ang tira` | `I-post ang tira` | Gitling sa loan verb. |
| `src/i18n/strings.ts:15` | `Wala ka pang naipost ngayong gabi.` | `Wala ka pang nai-post ngayong gabi.` | Pare-parehong baybay. |
| `src/i18n/strings.ts:17` | `Pindutin ang “Ipost ang tira” at sabihin o isulat kung ano ang natira, gaya ng pag-text.` | `Pindutin ang “I-post ang tira” at isulat kung ano ang natira, gaya ng pag-text.` | Hindi pa available ang voice input. |
| `src/i18n/strings.ts:26` | `Naipost` / `NAIPOST` | `Nai-post` / `NAI-POST` | Gitling sa label at sticker. |
| `src/i18n/strings.ts:28` | `Tentative` / `TENTATIVE` | `Hawak muna` / `HAWAK MUNA` | Filipino-first, maikling held status. |
| `src/i18n/strings.ts:29` | `FINAL` | `MAY DRIVER` | Mas malinaw na Filipino sticker. |
| `src/i18n/strings.ts:31` | `WALANG DRIVER` | `DI NAIHATID` | Sakop pati driver no-show o failure. |
| `src/i18n/strings.ts:32` | `Walang kumuha` / `WALANG KUMUHA` | `Walang pantry na tumanggap` / `DI TINANGGAP` | Iwas kalituhan sa pickup. |
| `src/i18n/strings.ts:34` | `Naipost` | `Nai-post` | Pareho sa state label. |
| `src/i18n/strings.ts:34` | `Tentative` | `Hawak muna` | Pareho sa state label. |
| `src/i18n/strings.ts:35` | `Hawak muna hanggang may driver.` | `Hawak muna hanggang may driver na mag-confirm.` | Kailangan ng driver commitment. |
| `src/app/donor/post.tsx:23` | `What's left? Isulat gaya ng pag-text, halimbawa: “may 3 trays adobo pa, kunin before 8”.` | `Ano ang natira? Isulat gaya ng pag-text, halimbawa: “May 3 tray ng adobo pa, kunin bago mag-8 PM.”` | Filipino-first; ayusin ang **ng** at oras. |
| `src/app/donor/post.tsx:39` | `Sabihin gamit ang boses. Darating sa susunod na build.` | `Pag-post gamit ang boses, hindi pa available. Darating sa susunod na build.` | Hindi magmukhang available na TalkBack action. |
| `src/components/Tag.tsx:34` | `Tentative kay ${v.pantryName}. ${S.heldUntilDriver.fil}` | `Para sa ${v.pantryName}, hawak muna ang pagkain. ${S.heldUntilDriver.fil}` | **Sa** para sa pantry; Filipino status. |
| `src/components/Tag.tsx:35` | `Para kay ${v.pantryName}. Driver: ${v.driverName}, darating bago ${hhmm(v.etaMinute!)}.` | `Para sa ${v.pantryName}. Si ${v.driverName} ang driver; tinatayang darating bandang ${hhmm(v.etaMinute!)}.` | Marker, natural na TalkBack, at tamang kahulugan ng ETA. |
| `src/components/Tag.tsx:36` | `Naihatid kay ${v.pantryName} ni ${v.driverName}.` | `Naihatid sa ${v.pantryName} ni ${v.driverName}.` | **Sa** para sa destinasyon. |
