/**
 * Turning a teacher's draft into the row the database will accept.
 *
 * The builder used to hand the raw form straight to Supabase. Three things went
 * wrong because of that, and all three were silent:
 *
 * 1. **The save reported success when it had failed.** `save()` awaited the
 *    write, ignored the returned error, and showed "Imehifadhiwa" regardless.
 *    A teacher whose question was rejected saw a success toast and an unchanged
 *    list, with nothing to explain the gap.
 * 2. **"Kweli / Sikweli" had no answer.** The select displayed `Kweli` from its
 *    placeholder, but `correct_answer` was never set on a new draft, so the
 *    insert hit `correct_answer NOT NULL` and was rejected. That is the type
 *    the form opens on, so the first question most teachers wrote was the one
 *    that vanished.
 * 3. **Two offered types were rejected by a CHECK constraint.** The UI lists six
 *    types; `questions_question_type_check` allows four. `multi_select` and
 *    `ordering` failed on insert.
 *
 * This module keeps the draft → row conversion pure, so those rules are testable
 * without a browser or a database.
 */

/** The types the database accepts. Mirrors `questions_question_type_check`. */
export const STORED_QUESTION_TYPES = [
  "true_false",
  "multiple_choice",
  "short_answer",
  "matching",
] as const;

/**
 * Types the builder offers that the constraint did not allow.
 *
 * Kept separate rather than deleted: the grading and rendering for both already
 * work, and `20261126090000_question_types.sql` widens the constraint. Until that
 * migration is applied, saving one of these fails with a clear message instead
 * of a silent success.
 */
export const EXTENDED_QUESTION_TYPES = ["multi_select", "ordering"] as const;

export const ALL_QUESTION_TYPES = [...STORED_QUESTION_TYPES, ...EXTENDED_QUESTION_TYPES] as const;

export type QuestionDraft = {
  id?: string;
  question_type: string;
  body?: string | null;
  /** Newline-separated in the form; an array once stored. */
  options?: unknown;
  correct_answer?: unknown;
  /** Newline-separated in the form; an array once stored. */
  concepts?: unknown;
  points?: unknown;
  position?: unknown;
};

export type DraftErrors = Partial<Record<"body" | "options" | "correct_answer" | "points", string>>;

/** Splits a textarea into trimmed, non-empty lines. */
export function linesOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value !== "string") return [];
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** `a=b` per line, with the first `=` as the separator so answers may contain one. */
export function pairsOf(value: unknown): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
    );
  }
  const out: Record<string, string> = {};
  for (const line of linesOf(value)) {
    const at = line.indexOf("=");
    if (at < 1) continue;
    const left = line.slice(0, at).trim();
    const right = line.slice(at + 1).trim();
    if (left && right) out[left] = right;
  }
  return out;
}

/**
 * What is wrong with this draft, keyed by field.
 *
 * Empty means the draft can be saved. The checks are the ones the database would
 * reject anyway, moved to where the teacher is still looking at the field.
 */
export function validateDraft(draft: QuestionDraft): DraftErrors {
  const errors: DraftErrors = {};
  const type = draft.question_type;

  if (!String(draft.body ?? "").trim()) errors.body = "question_body_required";

  const points = Number(draft.points);
  if (!Number.isFinite(points) || points <= 0) errors.points = "question_points_positive";

  if (type === "multiple_choice" || type === "multi_select") {
    const options = linesOf(draft.options);
    if (options.length < 2) {
      errors.options = "question_options_two";
    } else if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
      // Two identical choices make one of them unselectable and make the
      // correct answer ambiguous.
      errors.options = "question_options_duplicate";
    }

    if (type === "multiple_choice") {
      const answer = String(draft.correct_answer ?? "").trim();
      if (!answer) errors.correct_answer = "question_answer_required";
      else if (!options.some((o) => o === answer)) {
        errors.correct_answer = "question_answer_must_match_option";
      }
    } else {
      const chosen = linesOf(draft.correct_answer);
      if (chosen.length === 0) errors.correct_answer = "question_answer_required";
      else if (chosen.some((c) => !options.includes(c))) {
        errors.correct_answer = "question_answer_must_match_option";
      }
    }
  }

  if (type === "true_false") {
    const answer = String(draft.correct_answer ?? "").trim();
    if (answer !== "true" && answer !== "false") errors.correct_answer = "question_answer_required";
  }

  if (type === "matching") {
    const pairs = pairsOf(draft.correct_answer);
    if (Object.keys(pairs).length < 2) errors.correct_answer = "question_pairs_two";
    else if (new Set(Object.values(pairs)).size !== Object.keys(pairs).length) {
      // A right-hand value used twice cannot be told apart when marking.
      errors.correct_answer = "question_pairs_duplicate";
    }
  }

  if (type === "ordering") {
    if (linesOf(draft.correct_answer).length < 2) errors.correct_answer = "question_order_two";
  }

  if (type === "short_answer" && !String(draft.correct_answer ?? "").trim()) {
    errors.correct_answer = "question_answer_required";
  }

  return errors;
}

/**
 * The row to write, or a reason it cannot be written yet.
 *
 * `position` is left to the caller: a new question belongs after the last one,
 * which only the caller knows.
 */
export function draftToRow(
  draft: QuestionDraft,
): { row: Record<string, unknown> } | { error: string } {
  const errors = validateDraft(draft);
  const first = Object.values(errors)[0];
  if (first) return { error: first };

  const type = draft.question_type;
  const base: Record<string, unknown> = {
    question_type: type,
    body: String(draft.body ?? "").trim(),
    points: Number(draft.points),
    options: null,
    concepts: null,
  };

  switch (type) {
    case "multiple_choice":
      base.options = linesOf(draft.options);
      base.correct_answer = String(draft.correct_answer ?? "").trim();
      break;

    case "multi_select":
      base.options = linesOf(draft.options);
      base.correct_answer = linesOf(draft.correct_answer);
      break;

    case "true_false":
      // Stored as the strings "true" / "false", which is what the student page
      // compares against.
      base.correct_answer = String(draft.correct_answer);
      break;

    case "matching":
      base.correct_answer = pairsOf(draft.correct_answer);
      break;

    case "ordering":
      base.correct_answer = linesOf(draft.correct_answer);
      break;

    default:
      base.correct_answer = String(draft.correct_answer ?? "").trim();
      base.concepts = linesOf(draft.concepts);
      break;
  }

  return { row: base };
}

/**
 * A readable reason a write failed.
 *
 * The CHECK violation is the one worth naming: it means the migration that
 * widens the constraint has not been applied, which is a deployment problem
 * rather than anything the teacher typed.
 */
export function describeSaveFailure(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return "question_save_failed";

  if (e.code === "23514" && /question_type/i.test(e.message ?? "")) {
    return "question_type_not_enabled";
  }
  if (e.code === "23502") return "question_answer_required";
  if (e.code === "42501" || /row-level security/i.test(e.message ?? "")) {
    return "question_save_forbidden";
  }
  return "question_save_failed";
}

/**
 * A stored row, back in the shape the form edits.
 *
 * Stored answers are JSON (arrays and objects); the form edits text. Converting
 * once, here, keeps the editors from each having to know about both shapes.
 */
export function rowToDraft(row: {
  id?: string;
  question_type?: string | null;
  body?: string | null;
  options?: unknown;
  correct_answer?: unknown;
  concepts?: unknown;
  points?: unknown;
  position?: unknown;
}): QuestionDraft {
  const type = row.question_type ?? "true_false";
  const answer = row.correct_answer;

  let correct: string;
  if (type === "matching") {
    correct = Object.entries(pairsOf(answer))
      .map(([left, right]) => `${left}=${right}`)
      .join("\n");
  } else if (type === "multi_select" || type === "ordering") {
    correct = linesOf(answer).join("\n");
  } else if (answer === null || answer === undefined) {
    // A new true/false draft has no answer yet; the form must not display one
    // as though it were chosen.
    correct = "";
  } else {
    correct = String(answer);
  }

  return {
    id: row.id,
    question_type: type,
    body: row.body ?? "",
    options: linesOf(row.options).join("\n"),
    correct_answer: correct,
    concepts: linesOf(row.concepts).join("\n"),
    points: row.points ?? 1,
    position: row.position,
  };
}
