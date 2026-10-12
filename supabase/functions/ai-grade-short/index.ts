import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Hii edge function inatumia Lovable AI gateway kutathmini jibu fupi la mwanafunzi
// kwa KUELEWA MAANA (semantic) — sio tu maneno yanayofanana. Inarudisha:
//   { score: number, feedback: string, isCorrect: boolean, concepts: [...] }
// Ikishindwa, mfumo wa fallback (token-overlap) wa client utatumika.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) return new Response(JSON.stringify({ error: 'Missing LOVABLE_API_KEY' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const question = String(body?.question || '').trim();
  const correctAnswer = String(body?.correctAnswer || '').trim();
  const studentAnswer = String(body?.studentAnswer || '').trim();
  const points = Number(body?.points || 1);
  const knownCorrect: boolean | null = typeof body?.knownCorrect === 'boolean' ? body.knownCorrect : null;
  const concepts: string[] = Array.isArray(body?.concepts) ? body.concepts.map((c: any) => String(c)) : [];

  if (!studentAnswer) {
    return new Response(JSON.stringify({ score: 0, feedback: 'Hakuna jibu lililotolewa.', isCorrect: false, concepts: concepts.map((c) => ({ concept: c, matched: false })) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const sys = `Wewe ni mwalimu mtaalamu wa Islamic Studies. Kazi yako ni kutathmini jibu la mwanafunzi kwa KUELEWA MAANA ya maneno yake — sio tu kulinganisha maneno. Mwanafunzi anaweza kutumia maneno tofauti lakini akamaanisha kitu kilekile sahihi (mfano: "Mungu" = "Allah" = "Mola"; "Mtume" = "Nabii" = "Rasuli"). Toa alama kwa msingi wa USAHIHI wa MAANA, sio maneno yaliyofanana.

JIBU TU kwa JSON sahihi: { "score": number, "feedback": string, "isCorrect": boolean, "concepts": [{"concept": string, "matched": boolean}] }`;

  if (knownCorrect !== null) {
    const p2 = `Swali: ${question}\nJibu sahihi: ${correctAnswer}\nJibu la mwanafunzi: ${studentAnswer}\nJibu hili ni ${knownCorrect ? 'SAHIHI' : 'SI SAHIHI'}. Eleza kwa Kiswahili kwa sentensi 1-2 KWA NINI ni ${knownCorrect ? 'sahihi' : 'si sahihi'} (na kama si sahihi, jibu sahihi ni lipi na kwa nini). Toa maelezo tu.`;
    try {
      const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key, 'X-Lovable-AIG-SDK': 'fetch' },
        body: JSON.stringify({ model: 'google/gemini-3-flash-preview', messages: [{ role: 'system', content: 'Wewe ni mwalimu wa Islamic Studies.' }, { role: 'user', content: p2 }] }),
      });
      const d = r.ok ? await r.json() : null;
      const reason = String(d?.choices?.[0]?.message?.content || '').trim().slice(0, 1000);
      return new Response(JSON.stringify({ score: knownCorrect ? points : 0, isCorrect: knownCorrect, feedback: `${knownCorrect ? '✅ Sahihi' : '❌ Si sahihi'}${reason ? ' — ' + reason : ''}`, concepts: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ score: knownCorrect ? points : 0, isCorrect: knownCorrect, feedback: knownCorrect ? '✅ Sahihi' : '❌ Si sahihi', concepts: [] }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  }

  const conceptsBlock = concepts.length ? `\nDhana muhimu zinazotakiwa: ${JSON.stringify(concepts)} (kagua kila moja kama mwanafunzi ameielezea kwa maana yoyote ile).` : '';
  const usr = `Swali: ${question}

Jibu sahihi linalotarajiwa: ${correctAnswer || '(halijatolewa — tumia ujuzi wako wa Islamic Studies)'}
${conceptsBlock}

Jibu la mwanafunzi: ${studentAnswer}

Alama za juu: ${points}

Toa alama (0 hadi ${points}) kulingana na asilimia ya usahihi wa MAANA. Sema isCorrect=true ikiwa alama >= ${(points * 0.6).toFixed(2)}. Feedback iwe fupi kwa Kiswahili (sentensi 1-2): sema sahihi/sio sahihi na kwa nini.`;

  try {
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key, 'X-Lovable-AIG-SDK': 'fetch' },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: usr },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      return new Response(JSON.stringify({ error: `AI gateway ${r.status}`, details: txt }), { status: r.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const data = await r.json();
    let content = data?.choices?.[0]?.message?.content || '{}';
    if (typeof content !== 'string') content = JSON.stringify(content);
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) try { parsed = JSON.parse(m[0]); } catch {}
    }
    const score = Math.max(0, Math.min(points, Number(parsed.score) || 0));
    const isCorrect = typeof parsed.isCorrect === 'boolean' ? parsed.isCorrect : (score >= points * 0.6);
    const rawFb = String(parsed.feedback || '').slice(0, 1000);
    const feedback = `${isCorrect ? '✅ Sahihi' : '❌ Si sahihi'}${rawFb ? ' — ' + rawFb : ''}`;
    const conceptsOut = Array.isArray(parsed.concepts) ? parsed.concepts : concepts.map((c) => ({ concept: c, matched: false }));
    return new Response(JSON.stringify({ score: Number(score.toFixed(2)), feedback, isCorrect, concepts: conceptsOut }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});