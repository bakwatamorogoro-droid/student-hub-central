/**
 * Group assignment ("Kazi za Kufanya").
 *
 * The owner asked for the Assignment menu to be group work rather than one
 * student's own upload: the group picks its seminar and group, sees its members,
 * names who presented, writes the question, uploads one PDF/Word file, previews
 * it, and submits once. The admin then reads every group's work in group order,
 * signs with the system pen, and sends an answer back.
 *
 * Everything here is pure and import-free so `node --test` can exercise the
 * boundaries directly. The Supabase reads and writes live in
 * `groupAssignmentApi.ts`.
 *
 * Why the storage is shaped this way: no new table or column can be created on
 * the live project (no service key, no management token), so a submission is a
 * `pdf_submissions` row with `status = 'group_submitted'`. That table is already
 * live and anon-writable. `reg_no` holds the group key, `full_name` holds the
 * readable group label, `file_url`/`file_name` hold the upload, and
 * `ai_extracted_text` holds a JSON envelope with the question, the presenters
 * and the admin's answer. `ai_extracted_text` is written by nothing else in the
 * app, so it is the one free text column on that table.
 */

import { formatMark } from "./assignmentMarks.ts";
import { parseAnnotations, type Annotation } from "./assignmentAnnotations.ts";

export const GROUP_SUBMISSION_STATUS = "group_submitted";

/** 2MB, as the owner asked. */
export const MAX_GROUP_FILE_BYTES = 2 * 1024 * 1024;

export const GROUP_FILE_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const GROUP_MAX_SCORE = 100;

/** The three parts that name one gender-pure group. */
export type GroupKey = {
  semina: string;
  gender: string;
  group: string;
};

export type EnvelopePerson = { reg_no: string; full_name: string };

/** The JSON stored in `pdf_submissions.ai_extracted_text` for a group row. */
export type GroupEnvelope = {
  kind: "group_assignment";
  semina: string;
  gender: string;
  group: string;
  presenters: string[];
  question: string;
  submitted_by?: EnvelopePerson;
  /** The admin's written answer, once sent. */
  answer?: string;
  /** The system pen's PNG data URL. */
  answer_signature?: string;
  answered_at?: string;
  /**
   * The mark, as the admin typed it: the score and the total it is out of.
   *
   * Kept in the envelope as two numbers so "7/24" survives a round-trip without
   * having to re-parse a string, and mirrored onto the row's own `score` and
   * `max_score` columns so a reader that does not know the envelope still sees
   * the mark.
   */
  mark?: { score: number; max: number };
  /**
   * The teacher's marks on the group's own work: a tick, a note or an error, on
   * the page it belongs to. A tick may carry no words; a note or an error always
   * does. Kept as plain data (see `assignmentAnnotations.ts`) so the same list
   * can be drawn on the page for the group, written into an export, or handed to
   * a prompt.
   */
  annotations?: Annotation[];
};

/**
 * The key stored in `reg_no`.
 *
 * The gender is part of the key because the same "GROUP 5" exists for both men
 * and women inside one seminar, so keying on (semina, group) alone would merge
 * two different groups into one submission.
 */
export function groupKey(key: GroupKey): string {
  return `GROUP::${normKey(key.semina)}::${normKey(canonicalGender(key.gender))}::${normKey(key.group)}`;
}

/**
 * "Mwanaume", "male", "M" and "Me" all name the same side of a group, and the
 * roster really does carry more than one spelling. Without a canonical form the
 * key would depend on which spelling the student's row happened to hold, and a
 * group would not find the submission it already made.
 */
function canonicalGender(raw: string | null | undefined): string {
  const v = normKey(raw);
  if (v === "FEMALE" || v === "MWANAMKE" || v === "F" || v === "KE") return "MWANAMKE";
  if (v === "MALE" || v === "MWANAUME" || v === "M" || v === "ME") return "MWANAUME";
  return v;
}

function normKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/** "SEMINA 3 · GROUP 5 · WANAUME" — what the admin list is ordered by. */
export function groupLabel(key: GroupKey): string {
  return `${normKey(key.semina)} · ${normKey(key.group)} · ${genderWord(key.gender).toUpperCase()}`;
}

function genderWord(raw: string): string {
  const v = canonicalGender(raw);
  if (v === "MWANAMKE") return "Wanawake";
  if (v === "MWANAUME") return "Wanaume";
  return v || "Jinsia haijulikani";
}

export function isGroupRow(row: { status?: string | null } | null | undefined): boolean {
  return String(row?.status ?? "") === GROUP_SUBMISSION_STATUS;
}

export function parseEnvelope(raw: string | null | undefined): GroupEnvelope | null {
  const text = String(raw ?? "").trim();
  if (!text.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text) as Partial<GroupEnvelope>;
    if (parsed?.kind !== "group_assignment") return null;
    const env: GroupEnvelope = {
      kind: "group_assignment",
      semina: String(parsed.semina ?? ""),
      gender: String(parsed.gender ?? ""),
      group: String(parsed.group ?? ""),
      presenters: Array.isArray(parsed.presenters)
        ? parsed.presenters.map((p) => String(p)).filter(Boolean)
        : [],
      question: String(parsed.question ?? ""),
    };
    // Optional fields are only added when the row actually carries them, so a
    // round-trip does not grow the object with `undefined` keys.
    if (parsed.submitted_by) env.submitted_by = parsed.submitted_by;
    if (parsed.answer != null) env.answer = String(parsed.answer);
    if (parsed.answer_signature != null) env.answer_signature = String(parsed.answer_signature);
    if (parsed.answered_at != null) env.answered_at = String(parsed.answered_at);
    if (parsed.mark && Number.isFinite(Number(parsed.mark.score))) {
      env.mark = { score: Number(parsed.mark.score), max: Number(parsed.mark.max) };
    }
    // Re-validated rather than trusted: the envelope is written by the browser
    // and comes back from the database, so a damaged list must not reach a page.
    if (parsed.annotations != null) {
      const list = parseAnnotations(parsed.annotations);
      if (list.length) env.annotations = list;
    }
    return env;
  } catch {
    return null;
  }
}

export function serializeEnvelope(env: GroupEnvelope): string {
  return JSON.stringify(env);
}

export type FileVerdict = { ok: true; kind: "pdf" | "word" } | { ok: false; error: string };

/** "PDF au Word tu" — the only two formats the owner accepts. */
export function assignmentFileKind(file: { name: string; type?: string }): "pdf" | "word" | null {
  const name = String(file.name ?? "").toLowerCase();
  const type = String(file.type ?? "").toLowerCase();
  if (name.endsWith(".pdf") || type.includes("pdf")) return "pdf";
  if (name.endsWith(".doc") || name.endsWith(".docx") || type.includes("word")) return "word";
  return null;
}

export function validateAssignmentFile(file: {
  name: string;
  type?: string;
  size: number;
}): FileVerdict {
  if (!file || !file.name) return { ok: false, error: "Chagua faili la kazi yenu." };
  const kind = assignmentFileKind(file);
  if (!kind) {
    return { ok: false, error: "Tumia PDF au Word tu (.pdf, .doc, .docx)." };
  }
  if (file.size > MAX_GROUP_FILE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return { ok: false, error: `Faili ni ${mb}MB — kikomo ni 2MB.` };
  }
  if (file.size <= 0) return { ok: false, error: "Faili hili halina maudhui." };
  return { ok: true, kind };
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/** True once the admin has sent an answer for this group's work. */
export function isAnswered(row: { teacher_confirmed?: boolean | null }): boolean {
  return !!row?.teacher_confirmed;
}

export type SubmitCheck = {
  ok: boolean;
  /** Every unmet requirement, in the order the student meets them on screen. */
  missing: string[];
};

/**
 * The submit gate. The owner was explicit that preview comes before sending, so
 * a file that was never previewed cannot be submitted even if everything else is
 * filled in.
 */
export function canSubmit(input: {
  question: string;
  presenters: string[];
  file: { name: string; type?: string; size: number } | null;
  previewed: boolean;
}): SubmitCheck {
  const missing: string[] = [];
  if (!input.presenters.length) missing.push("Chagua angalau mwanachama mmoja aliyepresent.");
  if (!String(input.question ?? "").trim()) missing.push("Andika swali la kazi yenu.");
  if (!input.file) {
    missing.push("Pakia faili la kazi (PDF au Word, hadi 2MB).");
  } else {
    const verdict = validateAssignmentFile(input.file);
    if (!verdict.ok) missing.push(verdict.error);
  }
  if (input.file && !input.previewed) missing.push("Preview faili kabla ya kutuma.");
  return { ok: missing.length === 0, missing };
}

/** "Kazi yenu ilitumwa tarehe 3 Novemba 2026, 14:05." */
export function submittedMessage(iso: string | null | undefined): string {
  const ms = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(ms)) return "Kazi yenu ilitumwa.";
  const when = new Date(ms).toLocaleString("sw-TZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Kazi yenu ilitumwa tarehe ${when}.`;
}

/** Seminar then group, numerically, so GROUP 10 follows GROUP 9 rather than GROUP 1. */
export function compareGroupKeys(a: GroupKey, b: GroupKey): number {
  const sa = numberOf(a.semina);
  const sb = numberOf(b.semina);
  if (sa !== sb) return sa - sb;
  const ga = numberOf(a.group);
  const gb = numberOf(b.group);
  if (ga !== gb) return ga - gb;
  return genderWord(a.gender).localeCompare(genderWord(b.gender));
}

function numberOf(value: string): number {
  const n = Number(String(value ?? "").replace(/\D+/g, ""));
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

export type GroupSubmissionRow = {
  id: string;
  reg_no?: string | null;
  full_name?: string | null;
  semina?: string | null;
  student_group?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  status?: string | null;
  feedback?: string | null;
  teacher_confirmed?: boolean | null;
  created_at?: string | null;
  ai_extracted_text?: string | null;
  student_id?: string | null;
  score?: number | null;
  max_score?: number | null;
};

export type GroupSubmission = {
  row: GroupSubmissionRow;
  key: GroupKey;
  label: string;
  presenters: string[];
  question: string;
  answer: string | null;
  answerSignature: string | null;
  answeredAt: string | null;
  submittedAt: string | null;
  answered: boolean;
  /** "7/24" as the admin typed it, or null when no mark was given. */
  mark: string | null;
  markScore: number | null;
  markMax: number | null;
  /** The teacher's ticks, notes and errors, per page. */
  annotations: Annotation[];
};

/** Reads one row back into the shape the screens use. */
export function toGroupSubmission(row: GroupSubmissionRow): GroupSubmission {
  const env = parseEnvelope(row.ai_extracted_text);
  const key: GroupKey = {
    semina: env?.semina || String(row.semina ?? ""),
    gender: env?.gender || "",
    group: env?.group || String(row.student_group ?? ""),
  };
  // The envelope is the source of truth, but a row written before the mark lived
  // there still carries it in `score`/`max_score`, so those are the fallback.
  const score = env?.mark?.score ?? numberOrNull(row.score);
  const max = env?.mark?.max ?? numberOrNull(row.max_score);
  return {
    row,
    key,
    label: groupLabel(key),
    presenters: env?.presenters ?? [],
    question: env?.question ?? "",
    answer: env?.answer ?? (row.feedback ? String(row.feedback) : null),
    answerSignature: env?.answer_signature ?? null,
    answeredAt: env?.answered_at ?? null,
    submittedAt: row.created_at ?? null,
    answered: isAnswered(row),
    mark: formatMark(score, max),
    annotations: env?.annotations ?? [],
    markScore: score,
    markMax: max,
  };
}

function numberOrNull(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** All group rows, in the order the admin reads them. */
export function groupSubmissionsInOrder(rows: GroupSubmissionRow[]): GroupSubmission[] {
  return rows
    .filter(isGroupRow)
    .map(toGroupSubmission)
    .sort((a, b) => {
      const byKey = compareGroupKeys(a.key, b.key);
      if (byKey !== 0) return byKey;
      return String(a.submittedAt ?? "").localeCompare(String(b.submittedAt ?? ""));
    });
}

/** The group's submission, if this group already sent one. */
export function submissionForGroup(
  rows: GroupSubmissionRow[],
  key: GroupKey,
): GroupSubmissionRow | null {
  const wanted = groupKey(key);
  return (
    rows.find((r) => isGroupRow(r) && normKey(r.reg_no) === normKey(wanted)) ??
    rows.find((r) => isGroupRow(r) && envelopeMatches(r, key)) ??
    null
  );
}

function envelopeMatches(row: GroupSubmissionRow, key: GroupKey): boolean {
  const env = parseEnvelope(row.ai_extracted_text);
  if (!env) return false;
  return (
    normKey(env.semina) === normKey(key.semina) &&
    normKey(env.group) === normKey(key.group) &&
    normKey(genderWord(env.gender)) === normKey(genderWord(key.gender))
  );
}

/** A member of a group, as the picker and the admin list show them. */
export type RosterPerson = {
  id: string;
  reg_no?: string | null;
  full_name?: string | null;
  semina?: string | null;
  gender?: string | null;
  student_group?: string | null;
  group_confirmed_at?: string | null;
};

export function personName(person: RosterPerson): string {
  return String(person.full_name ?? "").trim();
}

export function personReg(person: RosterPerson): string {
  return String(person.reg_no ?? "").trim();
}

/**
 * Everyone seated in the chosen group.
 *
 * `seminaOf`/`genderOf`/`groupOf` are the normalisers from `groupAssignment`,
 * injected so this file stays import-free for the test runner.
 */
export function membersOfGroup(
  roster: RosterPerson[],
  key: GroupKey,
  normalise: {
    semina: (raw: string | null | undefined) => string | null;
    gender: (raw: string | null | undefined) => string;
    group: (raw: string | null | undefined) => string | null;
  },
): RosterPerson[] {
  const wantSemina = normKey(normalise.semina(key.semina) ?? key.semina);
  const wantGroup = normKey(normalise.group(key.group) ?? key.group);
  const wantGender = normKey(normalise.gender(key.gender));
  return roster
    .filter((s) => {
      const semina = normKey(normalise.semina(s.semina) ?? s.semina);
      const group = normKey(normalise.group(s.student_group) ?? s.student_group);
      const gender = normKey(normalise.gender(s.gender));
      return semina === wantSemina && group === wantGroup && gender === wantGender;
    })
    .sort((a, b) => personReg(a).localeCompare(personReg(b)));
}

/** "Amina · 3 wengine" style summary of who presented. */
export function presentersSummary(presenters: string[]): string {
  const list = presenters.map((p) => String(p).trim()).filter(Boolean);
  if (!list.length) return "Hakuna aliyechaguliwa";
  if (list.length <= 3) return list.join(", ");
  return `${list.slice(0, 3).join(", ")} +${list.length - 3}`;
}

/** The file extension label the preview needs. */
export function previewKindFor(fileName: string | null | undefined): "pdf" | "word" | "other" {
  const name = String(fileName ?? "").toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".doc") || name.endsWith(".docx")) return "word";
  return "other";
}
