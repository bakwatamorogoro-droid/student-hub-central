/**
 * The three kinds of assignment, and nothing else.
 *
 * The owner asked for exactly these three and was explicit that no fourth may be
 * invented, so this module is the single list. `normalizeAssignmentKind` never
 * returns a value that is not in it: anything unrecognised — an empty column, a
 * spelling from an older row, a hand-typed string — falls back to
 * `presentation_group`.
 *
 * That fallback is also the answer to "the work already submitted should be a
 * presentation": every row written before the kind existed carries no value, so
 * it normalises to `presentation_group` and reads correctly without a data
 * migration.
 *
 * Pure and import-free so `node --test` can exercise it directly.
 */

export const ASSIGNMENT_KINDS = ["presentation_group", "normal_group", "individual"] as const;

export type AssignmentKind = (typeof ASSIGNMENT_KINDS)[number];

/** What an assignment is when nobody said otherwise. */
export const DEFAULT_ASSIGNMENT_KIND: AssignmentKind = "presentation_group";

/**
 * The names the owner gave, kept in English in both languages because they are
 * the labels themselves rather than a translation of one.
 */
export const ASSIGNMENT_KIND_LABELS: Record<AssignmentKind, string> = {
  presentation_group: "Presentation Assignment (Group)",
  normal_group: "Normal Assignment (Group)",
  individual: "Individual Assignment",
};

/** One short line under the picker, so the admin knows what each choice means. */
export const ASSIGNMENT_KIND_HINTS: Record<AssignmentKind, string> = {
  presentation_group: "Group work presented in class, with named presenters.",
  normal_group: "Group work handed in without a presentation.",
  individual: "One student works and submits alone.",
};

const LOOKUP: Record<string, AssignmentKind> = {
  presentation_group: "presentation_group",
  presentationgroup: "presentation_group",
  presentation: "presentation_group",
  presentationassignment: "presentation_group",
  presentationassignmentgroup: "presentation_group",
  uwasilishaji: "presentation_group",
  normal_group: "normal_group",
  normalgroup: "normal_group",
  normal: "normal_group",
  normalassignment: "normal_group",
  normalassignmentgroup: "normal_group",
  kawaida: "normal_group",
  individual: "individual",
  individual_assignment: "individual",
  individualassignment: "individual",
  mtu_mmoja: "individual",
  mtummoja: "individual",
};

/**
 * The kind a stored or typed value means.
 *
 * Case, spaces, underscores and brackets are all ignored, so
 * "Presentation Assignment (Group)" — the label itself — round-trips to the same
 * value as the key. An unknown value is never guessed into a new kind; it is the
 * default, which is the only honest answer when the three are the whole set.
 */
export function normalizeAssignmentKind(raw: string | null | undefined): AssignmentKind {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z_]+/g, "");
  return LOOKUP[key] ?? DEFAULT_ASSIGNMENT_KIND;
}

export function assignmentKindLabel(raw: string | null | undefined): string {
  return ASSIGNMENT_KIND_LABELS[normalizeAssignmentKind(raw)];
}

export function assignmentKindHint(raw: string | null | undefined): string {
  return ASSIGNMENT_KIND_HINTS[normalizeAssignmentKind(raw)];
}

/** A group works together; an individual works alone. */
export function isGroupKind(raw: string | null | undefined): boolean {
  return normalizeAssignmentKind(raw) !== "individual";
}

/** Whether a value is one of the three, with no fallback applied. */
export function isKnownAssignmentKind(raw: string | null | undefined): boolean {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z_]+/g, "");
  return key in LOOKUP;
}

/**
 * Where an assignment's kind is kept on an `exam_pdfs` row.
 *
 * The live project cannot run DDL from the workspace — no service key, no
 * management token — so a new column cannot be added, and the kind has to ride
 * in a column that already exists. `uploaded_by` is that column: this app is its
 * only writer (it always wrote the literal "admin") and nothing reads it, which
 * is exactly the property `ai_extracted_text` has for the group submissions.
 *
 * The value stays human-readable — "admin|presentation_group" — so the row can
 * be understood in the Supabase table view without this code. A row written
 * before the kinds existed carries a bare "admin", which decodes to the default.
 */
export function encodeAssignmentKind(raw: string | null | undefined): string {
  return `admin|${normalizeAssignmentKind(raw)}`;
}

/** The kind an `exam_pdfs.uploaded_by` value carries, old rows included. */
export function assignmentKindFromUploadedBy(raw: string | null | undefined): AssignmentKind {
  const text = String(raw ?? "");
  const afterBar = text.includes("|") ? text.slice(text.indexOf("|") + 1) : "";
  return normalizeAssignmentKind(afterBar);
}

/**
 * Where a submission's kind is kept when the row has no envelope of its own.
 *
 * `pdf_submissions.ai_extracted_text` is the one free text column on that table,
 * and an individual submission (unlike a group's) does not use it, so the kind
 * goes there as a small JSON object. The group envelope keeps its own
 * `assignment_kind` key — see `groupAssignmentSubmission.ts` — and the two never
 * collide because a group envelope is recognised by `kind: "group_assignment"`.
 */
export function encodeSubmissionKind(raw: string | null | undefined): string {
  return JSON.stringify({ assignment_kind: normalizeAssignmentKind(raw) });
}

/**
 * The kind a submission row carries.
 *
 * Reads both places a kind can live: the group envelope and the small object an
 * individual submission writes. A row from before the kinds existed — or one
 * whose text is something else entirely — is the default, which is what makes an
 * old submission read as a presentation.
 */
export function submissionKindFromText(raw: string | null | undefined): AssignmentKind {
  const text = String(raw ?? "").trim();
  if (!text.startsWith("{")) return DEFAULT_ASSIGNMENT_KIND;
  try {
    const parsed = JSON.parse(text) as { assignment_kind?: unknown };
    if (parsed?.assignment_kind == null) return DEFAULT_ASSIGNMENT_KIND;
    return normalizeAssignmentKind(String(parsed.assignment_kind));
  } catch {
    return DEFAULT_ASSIGNMENT_KIND;
  }
}
