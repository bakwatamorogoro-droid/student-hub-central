import { supabase } from "@/integrations/supabase/client";
import { matchesAcademicTarget } from "@/lib/academicTargeting";
import {
  assignmentKindFromUploadedBy,
  isGroupKind,
  type AssignmentKind,
} from "@/lib/assignmentKind";

/**
 * The assignments the admin has opened, as a student sees them.
 *
 * "Opening" an assignment is inserting an `exam_pdfs` row with
 * `is_assignment = true, active = true`; that is what the admin's Assignment
 * screen already does. What is new is the kind, which rides in `uploaded_by`
 * (see `assignmentKind.ts`) because the live project cannot add a column.
 *
 * This module is the one place that reads that row into the shape the student
 * pages use, so the picker and the submit path cannot disagree about what an
 * open assignment is.
 */

export type OpenAssignment = {
  id: string;
  title: string;
  kind: AssignmentKind;
  /** The instructions, if the admin wrote any. */
  text: string | null;
  fileUrl: string | null;
  fileName: string | null;
  dueAt: string | null;
  points: number;
  examId: string | null;
  /** Kept whole so the academic-target filter can read every field it needs. */
  row: Record<string, unknown>;
};

function toOpenAssignment(row: Record<string, unknown>): OpenAssignment {
  return {
    id: String(row.id),
    title: String(row.title ?? "Kazi"),
    kind: assignmentKindFromUploadedBy(row.uploaded_by as string | null | undefined),
    text: (row.assignment_text as string | null) ?? null,
    fileUrl: (row.file_url as string | null) || null,
    fileName: (row.file_name as string | null) ?? null,
    dueAt: (row.due_at as string | null) ?? null,
    points: Number(row.points ?? 100) || 100,
    examId: (row.exam_id as string | null) ?? null,
    row,
  };
}

/** Every open assignment, newest first, before any per-student filtering. */
export async function loadOpenAssignments(): Promise<OpenAssignment[]> {
  const { data, error } = await supabase
    .from("exam_pdfs" as never)
    .select("*")
    .eq("is_assignment", true)
    .eq("active", true)
    .order("created_at", { ascending: false });
  if (error) throw error as unknown as Error;
  return openAssignmentsFromRows((data as unknown as Record<string, unknown>[]) ?? []);
}

/**
 * The same mapping for a caller that already has the rows.
 *
 * `/pdf-quiz` loads `exam_pdfs` itself, so it maps with this rather than fetching
 * twice or reimplementing the kind decode.
 */
export function openAssignmentsFromRows(rows: Record<string, unknown>[]): OpenAssignment[] {
  return rows.map(toOpenAssignment);
}

/**
 * The open assignments one student may see.
 *
 * The academic target is the same rule the old assignment list used, so a student
 * still sees only their own year and semester.
 */
export function visibleForStudent(
  assignments: OpenAssignment[],
  student: unknown,
): OpenAssignment[] {
  if (!student) return [];
  return assignments.filter((a) => matchesAcademicTarget(a.row, student as never));
}

/**
 * The open assignments a page should offer.
 *
 * `/pdf-quiz` is the individual flow, so it offers the individual ones; `/quiz`
 * is the group flow, so it offers the two group kinds. Without this a student on
 * the group page would be offered "Individual Assignment" and vice versa.
 */
export function forGroupPage(assignments: OpenAssignment[]): OpenAssignment[] {
  return assignments.filter((a) => isGroupKind(a.kind));
}

export function forIndividualPage(assignments: OpenAssignment[]): OpenAssignment[] {
  return assignments.filter((a) => a.kind === "individual");
}
