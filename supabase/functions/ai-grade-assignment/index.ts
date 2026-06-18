import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const key = Deno.env.get('LOVABLE_API_KEY');
  if (!key) return new Response(JSON.stringify({ error: 'Missing LOVABLE_API_KEY' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const assignmentText = String(body?.assignmentText || '').trim();
  const correctAnswer = String(body?.correctAnswer || '').trim();
  const fileUrl = String(body?.fileUrl || '').trim();
  const maxPoints = Number(body?.maxPoints || 100);

  if (!fileUrl) return new Response(JSON.stringify({ error: 'fileUrl required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  // Fetch student's PDF/Word file as base64 for multimodal model
  let fileB64 = '';
  let mimeType = 'application/pdf';
  try {
    const fr = await fetch(fileUrl);
    if (!fr.ok) throw new Error(`fetch file ${fr.status}`);
    mimeType = fr.headers.get('content-type') || mimeType;
    const buf = new Uint8Array(await fr.arrayBuffer());
    // base64
    let s = '';
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    fileB64 = btoa(s);
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to fetch file', details: String(e) }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const sys = `Wewe ni mwalimu mwenye uzoefu. Tathmini kazi ya mwanafunzi kwa kuilinganisha na jibu sahihi/maelekezo. Toa alama (0 - ${maxPoints}) na maoni mafupi kwa Kiswahili. JIBU TU kwa JSON sahihi yenye fields: { "score": number, "feedback": string }. Hakuna maandishi mengine.`;
  const usr = `Swali/Maelekezo: ${assignmentText || '(hayajatolewa)'}\n\nJibu sahihi linalotarajiwa: ${correctAnswer || '(halijatolewa — kagua tu ubora wa kazi)'}\n\nAlama za juu: ${maxPoints}\n\nSoma faili ya mwanafunzi iliyoambatishwa kisha toa JSON tu.`;

  try {
    const r = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Lovable-API-Key': key, 'X-Lovable-AIG-SDK': 'fetch' },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: [
            { type: 'text', text: usr },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${fileB64}` } },
          ] },
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
    const score = Math.max(0, Math.min(maxPoints, Number(parsed.score) || 0));
    const feedback = String(parsed.feedback || '').slice(0, 2000);
    return new Response(JSON.stringify({ score, feedback, maxPoints }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});