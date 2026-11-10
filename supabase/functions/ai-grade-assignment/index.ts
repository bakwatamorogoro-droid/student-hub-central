/**
 * Suggests a mark for an uploaded assignment, on OpenRouter.
 *
 * This is a *suggestion* the teacher reviews, never a final mark — see the
 * caller in `src/routes/pdf-quiz.tsx`, which writes it to
 * `ai_suggested_score` and leaves `teacher_confirmed` alone. That framing is why
 * the prompt is allowed to be generous: a wrong suggestion costs the teacher a
 * glance, not the student a grade.
 *
 * Reading the file is the hard part. A student's work arrives as a PDF or a
 * `.docx`, and this function cannot render one. So it does the honest thing in
 * order:
 *
 *   1. If the caller already extracted the text (`studentText`), grade that.
 *      This is the best path and the client is free to send it.
 *   2. Otherwise fetch `fileUrl` and, when it is a `.docx`, pull the text out of
 *      the zipped XML. A `.docx` is a zip of XML, which Deno can read without a
 *      library.
 *   3. A PDF is sent to the model as an inline data URL and we let the model
 *      read it. Only some models accept that, so this is attempted, not assumed.
 *   4. If none of those produce words, the function says so. It does **not**
 *      invent a mark from the file name — a fabricated score on a student's work
 *      is worse than no score.
 */

import { chat, chatJson, json, preflight, readBody } from "../_shared/openrouter.ts";

const SYSTEM = `Wewe ni mwalimu mwenye uzoefu wa Islamic Studies. Tathmini kazi ya mwanafunzi.

KANUNI:
1. Tathmini kwa MAANA na kina cha majibu, sio urefu wa maandishi.
2. Linganisha na maelekezo na jibu sahihi uliopewa.
3. Toa maoni mafupi kwa Kiswahili, yenye mambo mawili matatu ya kuboresha.
4. Usibuni ushahidi wa Qur'an au hadith.
5. JIBU TU kwa JSON sahihi: { "score": number, "feedback": string }`;

/** Strips XML tags and unescapes the handful of entities Word emits. */
function xmlToText(xml: string): string {
  return xml
    .replace(/<w:p\b[^>]*>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Reads the text of a `.docx` from its bytes.
 *
 * A `.docx` is a zip; the words are in `word/document.xml`. Rather than pull in
 * a zip library for one file, this walks the zip's central directory and inflates
 * the one entry it needs with `DecompressionStream`, which Deno has built in.
 * Returns null when the bytes are not a readable docx.
 */
async function docxText(bytes: Uint8Array): Promise<string | null> {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Find the End Of Central Directory record by scanning backwards for its
    // signature; a zip may carry a comment, so its position is not fixed.
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65535; i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd === -1) return null;

    const entries = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const decoder = new TextDecoder();

    for (let n = 0; n < entries; n++) {
      if (view.getUint32(p, true) !== 0x02014b50) return null;
      const method = view.getUint16(p + 10, true);
      const compSize = view.getUint32(p + 20, true);
      const nameLen = view.getUint16(p + 28, true);
      const extraLen = view.getUint16(p + 30, true);
      const commentLen = view.getUint16(p + 32, true);
      const localOffset = view.getUint32(p + 42, true);
      const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));

      if (name === "word/document.xml") {
        const lhNameLen = view.getUint16(localOffset + 26, true);
        const lhExtraLen = view.getUint16(localOffset + 28, true);
        const start = localOffset + 30 + lhNameLen + lhExtraLen;
        const raw = bytes.subarray(start, start + compSize);
        if (method === 0) return xmlToText(decoder.decode(raw));
        if (method !== 8) return null;
        // Raw DEFLATE: the zip stores no zlib header, so ask for "deflate-raw".
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return xmlToText(await new Response(stream).text());
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    return null;
  } catch {
    return null;
  }
}

/** The words of an uploaded file, or null when this function cannot read it. */
async function extractText(
  url: string,
  mime: string,
  bytes: Uint8Array,
): Promise<{ text: string | null; pdfDataUrl: string | null }> {
  const isDocx =
    mime.includes("wordprocessingml") ||
    mime.includes("officedocument") ||
    /\.docx(\?|$)/i.test(url);
  const isPdf = mime.includes("pdf") || /\.pdf(\?|$)/i.test(url);

  if (isDocx) return { text: await docxText(bytes), pdfDataUrl: null };
  if (isPdf) {
    // Hand the PDF to the model inline. Whether it can read it depends on the
    // model, so the caller treats a poor result as a poor result.
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return { text: null, pdfDataUrl: `data:application/pdf;base64,${btoa(bin)}` };
  }
  // Anything else is assumed to be plain text.
  try {
    return { text: new TextDecoder().decode(bytes).slice(0, 20000), pdfDataUrl: null };
  } catch {
    return { text: null, pdfDataUrl: null };
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const body = await readBody(req);
  if (!body) return json({ error: "Invalid JSON" }, 400);

  const assignmentText = String(body.assignmentText ?? "").trim();
  const correctAnswer = String(body.correctAnswer ?? "").trim();
  const fileUrl = String(body.fileUrl ?? "").trim();
  const studentText = String(body.studentText ?? "").trim();
  const maxPoints = Number(body.maxPoints ?? 100);

  if (!fileUrl && !studentText) return json({ error: "fileUrl or studentText is required" }, 400);

  let text = studentText;
  let pdfDataUrl: string | null = null;

  if (!text && fileUrl) {
    try {
      const fr = await fetch(fileUrl);
      if (!fr.ok) return json({ error: "fetch_failed", detail: `file returned ${fr.status}` }, 502);
      const bytes = new Uint8Array(await fr.arrayBuffer());
      const mime = fr.headers.get("content-type") ?? "";
      const got = await extractText(fileUrl, mime, bytes);
      text = got.text ?? "";
      pdfDataUrl = got.pdfDataUrl;
    } catch (e) {
      return json({ error: "fetch_failed", detail: String(e).slice(0, 200) }, 502);
    }
  }

  if (!text && !pdfDataUrl) {
    // Honest failure: the teacher grades this one by hand.
    return json(
      {
        error: "unreadable_file",
        detail:
          "Could not read the text of this file. Send `studentText` (extracted on the client) or a .docx.",
      },
      422,
    );
  }

  const instructions = `Maelekezo/Swali: ${assignmentText || "(hayajatolewa)"}

Jibu sahihi linalotarajiwa: ${correctAnswer || "(halijatolewa — kagua ubora wa kazi)"}

Alama za juu: ${maxPoints}`;

  const userContent = pdfDataUrl
    ? [
        {
          type: "text",
          text: `${instructions}\n\nKazi ya mwanafunzi iko kwenye faili iliyoambatishwa. Soma kisha toa JSON tu.`,
        },
        { type: "file", file: { filename: "student-work.pdf", file_data: pdfDataUrl } },
      ]
    : `${instructions}\n\nKazi ya mwanafunzi:\n${text.slice(0, 20000)}\n\nToa JSON tu.`;

  // A whole class submits the same assignment, so the same file often arrives
  // more than once (a resubmit, or a group handing in the same document). The
  // key is the extracted text, not the file, so those collide and cost one
  // request. When only a PDF data URL is available the key falls back to it.
  const key = await cacheKey("grade-assignment", {
    instructions,
    text: text.slice(0, 20000),
    pdf: pdfDataUrl ? pdfDataUrl.slice(0, 4000) : "",
    maxPoints,
  });
  const hit = await readCache(key);
  if (hit) {
    void noteCacheHit();
    return json({ ...hit, cached: true });
  }

  const budget = await spend();
  if (!budget.allowed) {
    return json(
      { error: "ai_quota_exhausted", detail: "Daily free-tier request limit reached" },
      429,
    );
  }

  const r = await chatJson(
    [
      { role: "system", content: SYSTEM },
      // The multimodal shape is only sent when there is a file to attach.
      { role: "user", content: userContent as unknown as string },
    ],
    { maxTokens: 1200 },
  );

  if (!r.ok)
    return json({ error: "ai_unavailable", detail: r.detail }, r.status === 502 ? 502 : 503);

  const parsed = r.data;
  const score = Math.max(0, Math.min(maxPoints, Number(parsed.score) || 0));
  const response = {
    score: Number(score.toFixed(2)),
    feedback: String(parsed.feedback ?? "").slice(0, 2000),
    maxPoints,
    ai: true,
    model: r.model,
  };
  void writeCache(key, response, "grade-assignment", r.model);
  return json(response);
});
