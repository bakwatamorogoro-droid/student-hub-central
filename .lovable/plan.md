## Mpango wa Marekebisho

Nitatumia faili uliyopakia (`deploy-wizard-magic-main`) kama msingi wa mradi, kisha nitaongeza vipengele ulivyoomba bila kubadilisha kitu kingine.

### Hatua 1 — Kuingiza mradi
- Nakili faili zote za zip kwenye `/dev-server/` (bila `.git`), pamoja na `supabase/migrations` na `functions`.
- Hakikisha `package.json`, `vite.config.ts`, na njia (routes) zinafanya kazi vizuri.

### Hatua 2 — Rich Text Editor (Copy & Paste)
Faili: `src/components/RichTextEditor.tsx`
- Ongeza vifungo vya **Copy** na **Paste** kwenye toolbar.
- Wezesha `paste` kupokea maandishi yaliyofomatiwa (rich paste) kutoka Word/Web kwa kutumia `onPaste` handler inayosafisha HTML.
- Copy itanakili maudhui yote ya editor kwenda clipboard.

### Hatua 3 — Edit kwa mwanafunzi (kabla ya kuwasilisha)
Faili: `src/components/HomeAssignments.tsx`, `src/routes/student.tsx`
- Mwanafunzi akiwa hajatuma jibu, onyesha kifungo **"Hariri"** kinachofungua jibu lake la awali kwenye editor.
- Baada ya kuwasilisha (submitted=true), kifungo cha edit kinafichwa.

### Hatua 4 — Tick ya admin kuonyesha aliyetuma
Faili: `src/routes/admin.submissions.tsx`, `src/routes/admin.students.tsx`
- Karibu na kila jina la mwanafunzi, ongeza **alama ya ✓ ya kijani** kama amewasilisha, na **✗ nyekundu** au tupu kama hajatuma.
- Inahesabiwa kutoka jedwali la `submissions`.

### Hatua 5 — Sehemu ya Download ionekane
Faili: `src/routes/admin.submissions.tsx` (na `student.tsx` kama inahitajika)
- Hakikisha kifungo cha **Download** (PDF/CSV) kinaonekana wazi juu ya jedwali kwa rangi tofauti na nafasi.
- Ongeza icon ya download na lebo.

### Hatua 6 — Search ya Group + hesabu ya wanachama (Wa kike/Wa kiume)
Faili: `src/components/GroupAvailability.tsx` (au admin.students)
- Ongeza kisanduku cha **Tafuta Group** (search input).
- Onyesha badges: **Jumla**, **Wa kiume**, **Wa kike** kwa kila group.
- Filter ya haraka inapoandika jina.

### Hatua 7 — Automatic approval kwa Collection/Marekebisho
Faili: `src/routes/admin.requests.tsx`, na server function inayohifadhi request
- Maombi ya aina ya "collection" / "marekebisho" yatawekwa moja kwa moja `status='approved'` yanapotumwa, badala ya kusubiri admin.
- Admin bado anaweza ku-revoke kama anataka.

### Hatua 8 — Maswali matatu yaonekane vizuri (simu + laptop)
Faili: `src/routes/quiz.tsx` au component husika ya maswali matatu
- Tumia grid responsive: `grid-cols-1 md:grid-cols-3` na padding nzuri.
- Hakikisha fonts, spacing, na vifungo vinasomeka kwenye screen ndogo (test breakpoints sm/md/lg).
- Ondoa overflow zisizotakiwa.

### Technical Notes
- Hakuna mabadiliko kwenye schema ya DB isipokuwa kuongeza default `'approved'` kwenye migration mpya kama inahitajika kwa hatua 7.
- Mabadiliko yote ya UI yatatumia design tokens zilizopo (hakuna hardcoded colors).
- Baada ya import, nitaendesha build kuthibitisha.

Ukikubali mpango huu, nitaanza kutekeleza moja kwa moja.
