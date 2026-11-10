/**
 * Parsing the AI tutor's reply, kept apart from the network call.
 *
 * `tutorAi.ts` imports the Supabase client, which `node --test` cannot resolve.
 * The parsing is the part worth testing — it is the piece that decides whether a
 * free model's untidy reply reaches the student as three tidy sections or as one
 * blob — so it lives here, import-free, where the test can reach it.
 */

export type TutorSections = {
  /** The explanation paragraph, or "" when the model did not label one. */
  explanation: string;
  /** The points worth naming, in the order the model gave them. */
  keyPoints: string[];
  /** A "check this with your teacher" note, when the model added one. */
  caveat: string | null;
};

/**
 * Strips the decoration a chat model wraps around a label.
 *
 * The prompt asks for `MAELEZO:`, but models answer `**MAELEZO:**`, `## MAELEZO`,
 * `MAELEZO :-`, or with a leading bullet. Anchoring the label patterns on the
 * raw line missed every one of those, and the whole reply then fell through as a
 * single unlabelled paragraph — which is what students were seeing. Normalising
 * first means the labels match however the model chose to dress them.
 */
function undecorate(line: string): string {
  return line
    .replace(/^\s*[-*•#>]+\s*/, "")
    .replace(/[*_`]/g, "")
    .replace(/\s*:-?\s*/, ": ")
    .trim();
}

const LABEL_EXPLANATION = /^\s*(MAELEZO|EXPLANATION)\s*:?\s*/i;
const LABEL_KEYPOINTS = /^\s*(MAMBO YA KUTAJA|KEY POINTS|POINTS)\s*:?\s*/i;
const LABEL_CAVEAT = /^\s*(TAHADHARI|CAUTION|WARNING|NOTE)\s*:?\s*/i;

/**
 * A list marker: a bullet, or a number followed by `.` or `)`.
 *
 * Deliberately *not* a bare leading number. `622` is a key point about Hijra,
 * and an earlier `\d+` here deleted it for looking like a list index.
 */
const LIST_MARKER = /^\s*(?:[-*•]|\d+[.)])\s*/;

/** One line may carry several points; a model often writes "a; b; c". */
function splitPoints(line: string): string[] {
  return line
    .split(/\s*[;•]\s*|\s+-\s+/)
    .map((p) => p.replace(LIST_MARKER, "").trim())
    .filter(Boolean);
}

/**
 * Splits the model's labelled reply into its three parts.
 *
 * The prompt asks for `MAELEZO:` / `MAMBO YA KUTAJA:` / `TAHADHARI:` lines, but a
 * free model is not a parser's friend: it may drop a label, use an English one,
 * or ignore the format entirely and just write a paragraph. So the failure mode
 * is "treat the whole reply as the explanation", which still gives the student
 * something readable rather than an empty card.
 */
export function parseTutorSections(raw: string): TutorSections {
  const text = String(raw ?? "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!text) return { explanation: "", keyPoints: [], caveat: null };

  let explanation = "";
  const keyPoints: string[] = [];
  let caveat: string | null = null;
  // Which of the three sections the current line belongs to.
  let section: "explanation" | "keyPoints" | "caveat" = "explanation";

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Labels are matched on the undecorated line; the content keeps its own text.
    const label = undecorate(trimmed);

    if (LABEL_KEYPOINTS.test(label)) {
      section = "keyPoints";
      const rest = label.replace(LABEL_KEYPOINTS, "").trim();
      if (rest) keyPoints.push(...splitPoints(rest));
      continue;
    }
    if (LABEL_CAVEAT.test(label)) {
      section = "caveat";
      const rest = label.replace(LABEL_CAVEAT, "").trim();
      if (rest) caveat = rest;
      continue;
    }
    if (LABEL_EXPLANATION.test(label)) {
      section = "explanation";
      const rest = label.replace(LABEL_EXPLANATION, "").trim();
      if (rest) explanation += (explanation ? " " : "") + rest;
      continue;
    }

    if (section === "keyPoints") {
      keyPoints.push(...splitPoints(label));
    } else if (section === "caveat") {
      caveat = caveat ? `${caveat} ${label}` : label;
    } else {
      explanation += (explanation ? " " : "") + label;
    }
  }

  return { explanation, keyPoints, caveat };
}
