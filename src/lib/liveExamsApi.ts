import { supabase } from "@/integrations/supabase/client";

import { buildLiveExams, type LiveExam } from "./liveExams";

type SubmissionRow = {
  id: string;
  exam_id: string;
  student_id: string;
  reg_no: string;
  started_at: string;
  submitted_at: string | null;
  answers: unknown;
  device_id: string | null;
  full_name?: string;
  /** Absent until the tracking migration has been applied to the database. */
  gps_distance_m?: number | null;
  last_seen_at?: string | null;
};

function str(value: unknown): string {
  return value == null ? "" : String(value);
}

/**
 * Reads the live rows, dropping any column the database does not have yet, and
 * paging through the result.
 *
 * Two columns here come from migrations that production may not have run
 * (`gps_distance_m`, `last_seen_at`). Asking for one that is absent makes
 * PostgREST reject the **whole** query, which used to leave the panel empty with
 * no visible reason — the teacher saw "hakuna mwanafunzi" while a class was
 * writing. Each optional column is therefore probed and dropped on demand, and
 * the caller still gets the rows it can have.
 *
 * The paging matters because PostgREST caps a response at 1000 rows: the college
 * has thousands of submissions, so a single request returned a truncated list and
 * the panel silently under-counted. Ordered by `id` so the pages do not overlap.
 */
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

async function fetchSubmissionRows(ids: string[]): Promise<SubmissionRow[]> {
  const optional = ["last_seen_at", "gps_distance_m", "gps_radius_m"];
  const base = [
    "id",
    "exam_id",
    "student_id",
    "reg_no",
    "started_at",
    "submitted_at",
    "answers",
    "device_id",
  ];
  let columns = [...base, ...optional];
  const all: SubmissionRow[] = [];

  for (let attempt = 0; attempt <= optional.length; attempt++) {
    all.length = 0;
    let retryWanted = false;

    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE;
      const { data, error } = await supabase
        .from("submissions")
        .select(columns.join(", "))
        .in("exam_id", ids)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        const missing = optional.find((c) => columns.includes(c) && namesColumn(error, c));
        // Not a missing optional column: nothing to salvage by retrying.
        if (!missing) return all;
        columns = columns.filter((c) => c !== missing);
        retryWanted = true;
        break;
      }

      const rows = (data ?? []) as unknown as SubmissionRow[];
      all.push(...rows);
      if (rows.length < PAGE_SIZE) return all;
    }

    if (!retryWanted) return all;
  }

  return all;
}

/** True when a PostgREST error names this column as unknown. */
function namesColumn(error: unknown, column: string): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "42703" || new RegExp(`['"\`]?${column}['"\`]?\\s+does not exist`, "i").test(e.message || "")
  );
}

/**
 * Resolves student names in batches.
 *
 * A single `.in()` over every sitter is sent as a query string, and the college
 * has close to a thousand distinct sitters — the URL ran to ~35 KB and PostgREST
 * answered `400`, so every name came back blank. Batches keep the URL short.
 */
async function fetchStudentNames(studentIds: string[]): Promise<Map<string, string>> {
  const byId = new Map<string, string>();
  const CHUNK = 200;

  for (let i = 0; i < studentIds.length; i += CHUNK) {
    const chunk = studentIds.slice(i, i + CHUNK);
    const { data } = await supabase.from("students").select("id, full_name").in("id", chunk);
    for (const s of (data ?? []) as Array<{ id: string; full_name: string }>) {
      byId.set(s.id, s.full_name);
    }
  }

  return byId;
}

/**
 * Every exam with activity, and who is inside it.
 *
 * The heartbeat is optional: when the column is absent the panel still lists who
 * is writing, it just cannot say who has gone quiet.
 */
export async function loadLiveExams(): Promise<LiveExam[]> {
  const { data: examRows } = await supabase
    .from("exams")
    .select("id, title, duration_minutes")
    .order("created_at", { ascending: false })
    .limit(50);
  const exams = (examRows ?? []) as Array<{
    id: string;
    title: string;
    duration_minutes: number | null;
  }>;
  if (exams.length === 0) return [];

  const ids = exams.map((e) => e.id);
  const rows = await fetchSubmissionRows(ids);

  // `submissions` carries no name, so the roster comes from `students`.
  const studentIds = [...new Set(rows.map((r) => str(r.student_id)).filter(Boolean))];
  if (studentIds.length > 0) {
    const nameById = await fetchStudentNames(studentIds);
    for (const r of rows) r.full_name = nameById.get(str(r.student_id)) ?? "";
  }

  const { data: questionRows } = await supabase
    .from("questions")
    .select("exam_id")
    .in("exam_id", ids);
  const questionCounts = new Map<string, number>();
  for (const q of (questionRows ?? []) as Array<{ exam_id: string }>) {
    questionCounts.set(q.exam_id, (questionCounts.get(q.exam_id) ?? 0) + 1);
  }

  return buildLiveExams(exams, rows, questionCounts);
}

/**
 * Marks a submission as handed in by the teacher, with no score.
 *
 * Used by "Katoa" (remove from the exam): the paper is closed so the student's
 * timer stops being live, but `score` is left alone because a teacher removing a
 * student is not a grading decision.
 */
export async function forceSubmitSubmission(submissionId: string): Promise<boolean> {
  const { error } = await supabase
    .from("submissions")
    .update({ submitted_at: new Date().toISOString() })
    .eq("id", submissionId);
  return !error;
}

/**
 * Records that a student's browser is still on the exam page.
 *
 * The heartbeat is what separates "still writing" from "phone died". It only
 * touches a paper that is still open, so a late beat cannot reopen a finished one,
 * and every failure is swallowed — a dropped request must never interrupt an exam.
 */
export async function touchSubmission(submissionId: string): Promise<void> {
  try {
    await supabase
      .from("submissions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", submissionId)
      .is("submitted_at", null);
  } catch {
    /* heartbeat is optional */
  }
}
