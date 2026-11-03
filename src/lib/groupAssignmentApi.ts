import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { Mark } from "@/lib/assignmentMarks";
import type { Annotation } from "@/lib/assignmentAnnotations";
import {
  GROUP_MAX_SCORE,
  GROUP_SUBMISSION_STATUS,
  groupKey,
  groupLabel,
  parseEnvelope,
  serializeEnvelope,
  type EnvelopePerson,
  type GroupEnvelope,
  type GroupKey,
  type GroupSubmissionRow,
} from "@/lib/groupAssignmentSubmission";

/**
 * The Supabase half of the group assignment feature.
 *
 * A submission is a `pdf_submissions` row, because no new table or column can be
 * created on the live project. See `groupAssignmentSubmission.ts` for why the
 * fields are packed the way they are. Nothing here is imported by the pure
 * module, so the rules stay testable without a browser.
 *
 * The row keeps `status = 'group_submitted'` even after the admin answers, so
 * "is this a group's work?" stays a single column test. The answer is what
 * `teacher_confirmed` and the envelope's `answer` mark.
 */

const BUCKET = "exam-media";

/** Every group row, newest first. The screens sort them for reading. */
export async function loadGroupSubmissionRows(): Promise<GroupSubmissionRow[]> {
  const { data, error } = await supabase
    .from("pdf_submissions")
    .select("*")
    .eq("status", GROUP_SUBMISSION_STATUS)
    .order("created_at", { ascending: false });
  if (error) throw error as unknown as Error;
  return (data as unknown as GroupSubmissionRow[]) ?? [];
}

/** The one row this group already sent, or null. */
export async function loadGroupSubmission(key: GroupKey): Promise<GroupSubmissionRow | null> {
  const { data, error } = await supabase
    .from("pdf_submissions")
    .select("*")
    .eq("status", GROUP_SUBMISSION_STATUS)
    .eq("reg_no", groupKey(key))
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error as unknown as Error;
  const rows = (data as unknown as GroupSubmissionRow[]) ?? [];
  return rows[0] ?? null;
}

function safeFileName(name: string): string {
  return name.replace(/[^\w.-]+/g, "_");
}

export type SubmitGroupInput = {
  key: GroupKey;
  question: string;
  /** Names of the members who presented, as shown on screen. */
  presenters: string[];
  file: File;
  /** The submitter, when the screen knows who that is. */
  submittedBy?: EnvelopePerson | null;
  /** The submitter's id, so the row joins back to `students`. */
  studentId?: string | null;
};

export type SubmitGroupResult =
  | { ok: true; row: GroupSubmissionRow }
  | { ok: false; error: string };

/**
 * Uploads the file and inserts the group row.
 *
 * A group sends exactly once: the row belongs to the group, and a second insert
 * would show the admin two versions of the same work. The caller checks first
 * and shows the submission date; this re-checks so a race between two phones in
 * the same group cannot slip a duplicate through.
 */
export async function submitGroupAssignment(input: SubmitGroupInput): Promise<SubmitGroupResult> {
  const existing = await loadGroupSubmission(input.key);
  if (existing) return { ok: false, error: "already_submitted" };

  const path = `assignments/groups/${safeFileName(groupKey(input.key))}/${Date.now()}-${safeFileName(input.file.name)}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, input.file, { contentType: input.file.type || "application/octet-stream" });
  if (upErr) return { ok: false, error: upErr.message };
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const envelope: GroupEnvelope = {
    kind: "group_assignment",
    semina: input.key.semina,
    gender: input.key.gender,
    group: input.key.group,
    presenters: input.presenters,
    question: input.question,
  };
  if (input.submittedBy) envelope.submitted_by = input.submittedBy;

  const insert: Database["public"]["Tables"]["pdf_submissions"]["Insert"] = {
    reg_no: groupKey(input.key),
    full_name: groupLabel(input.key),
    semina: input.key.semina,
    student_group: input.key.group,
    student_id: input.studentId,
    file_url: pub.publicUrl,
    file_name: input.file.name,
    max_score: GROUP_MAX_SCORE,
    status: GROUP_SUBMISSION_STATUS,
    ai_extracted_text: serializeEnvelope(envelope),
  };

  const { data, error } = await supabase.from("pdf_submissions").insert(insert).select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data as unknown as GroupSubmissionRow };
}

export type SaveAnswerInput = {
  row: GroupSubmissionRow;
  answer: string;
  /** The system pen's PNG data URL, or null when nothing was drawn. */
  signature: string | null;
  /** The mark the admin typed, e.g. "7/24". Absent means no mark was given. */
  mark?: Mark | null;
  /**
   * The teacher's marks on the group's own work — ticks, notes and errors, each
   * on its page. Replaced wholesale, because the annotator is the source of
   * truth for the list it is showing.
   */
  annotations?: Annotation[] | null;
};

/**
 * The admin's answer, written back into the same envelope.
 *
 * `feedback` carries the plain text as well, so a reader that does not know the
 * envelope still sees the answer, and `teacher_confirmed` is what marks the work
 * answered. `status` is deliberately left alone: it is what identifies the row as
 * a group's work.
 *
 * The mark goes to both places it is useful: the envelope keeps the exact pair of
 * numbers the admin typed, and the row's own `score`/`max_score` columns keep it
 * visible to anything that reads the table without knowing the envelope.
 */
export async function saveAdminAnswer(input: SaveAnswerInput): Promise<Error | null> {
  const raw = String(input.row.ai_extracted_text ?? "").trim();
  const parsed = parseEnvelope(raw);
  // A row that carries an envelope which will not parse is not a row to rebuild
  // from scratch: overwriting it would silently throw away the group's
  // presenters, their question and who submitted it. Refuse, and say so.
  if (!parsed && raw) {
    return new Error(
      "Kazi hii ina data ya zamani isiyosomeka. Tuma tena baada ya kuhakikisha faili, au wasiliana na msimamizi.",
    );
  }
  const env =
    parsed ??
    ({
      kind: "group_assignment",
      semina: String(input.row.semina ?? ""),
      gender: "",
      group: String(input.row.student_group ?? ""),
      presenters: [],
      question: "",
    } satisfies GroupEnvelope);

  const next: GroupEnvelope = {
    ...env,
    answer: input.answer,
    answered_at: new Date().toISOString(),
  };
  if (input.signature) next.answer_signature = input.signature;
  if (input.mark) next.mark = input.mark;
  if (input.annotations) next.annotations = input.annotations;

  const update: Database["public"]["Tables"]["pdf_submissions"]["Update"] = {
    feedback: input.answer,
    ai_extracted_text: serializeEnvelope(next),
    teacher_confirmed: true,
    graded_at: new Date().toISOString(),
  };
  if (input.mark) {
    update.score = input.mark.score;
    update.max_score = input.mark.max;
  }

  const { error } = await supabase.from("pdf_submissions").update(update).eq("id", input.row.id);
  return (error as unknown as Error) ?? null;
}

/**
 * Writes a mark onto a group's row without touching the answer or the signature.
 *
 * The owner asked for a mark entered once to be "propagated to the other groups".
 * That is a separate, explicit action rather than something the answer save does
 * silently: a whole seminar is often marked the same way, but a mark carried to a
 * group that has not been read would be a mark nobody gave.
 */
export async function saveGroupMark(row: GroupSubmissionRow, mark: Mark): Promise<Error | null> {
  const env = parseEnvelope(row.ai_extracted_text);
  const next: GroupEnvelope | null = env ? { ...env, mark } : null;
  const update: Database["public"]["Tables"]["pdf_submissions"]["Update"] = {
    score: mark.score,
    max_score: mark.max,
    graded_at: new Date().toISOString(),
  };
  if (next) update.ai_extracted_text = serializeEnvelope(next);
  const { error } = await supabase.from("pdf_submissions").update(update).eq("id", row.id);
  return (error as unknown as Error) ?? null;
}

/** Removes a group's work, used when a group sent the wrong file. */
export async function deleteGroupSubmission(id: string): Promise<Error | null> {
  const { error } = await supabase.from("pdf_submissions").delete().eq("id", id);
  return (error as unknown as Error) ?? null;
}
