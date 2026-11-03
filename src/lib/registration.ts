import { supabase } from "@/integrations/supabase/client";
import { fetchAllStudents } from "@/lib/fetchAllStudents";
import { canonicalRegNo, displayRegNo, isUsableRegNo } from "@/lib/regNo";

/**
 * Decides whether a registration may proceed.
 *
 * The rule this encodes: a registration number identifies a student, a name does
 * not. Names repeat — the cohort has 77 of them — and a repeated name is a fact
 * about two real people, never a reason to refuse one of them. So a number
 * already on file is the only hard stop, and even then only when the name
 * disagrees, because a matching pair means a returning student.
 *
 * The number is compared in its canonical form, not as it was typed. The
 * database's UNIQUE constraint compares the raw string, so `MUM2025 -04-15805`
 * and `MUM2025-04-15805` were both accepted and the same student ended up in the
 * table twice — 200 such rows. Comparing canonically here is what stops a new
 * registration from repeating that, and it also means a student who types their
 * number with a stray space is recognised as the returning student they are,
 * rather than being told the number is taken by someone else (themselves).
 *
 * This lives outside the route so `node --test` and the e2e suite can exercise
 * it against the real project; a bug here silently locks students out of the
 * whole app, and it is not reachable through the UI in a test.
 */
export type RegistrationConflict =
  /** Same number and same name: the student is already registered. */
  | { kind: "returning"; regNo: string; fullName: string }
  /** Same number, different name: the office has to decide which is right. */
  | { kind: "taken_by_other"; regNo: string; fullName: string }
  /** A different number carries the same name; ask, then allow. */
  | { kind: "shared_name"; fullName: string; count: number }
  | { kind: "clear" }
  | { kind: "error"; message: string };

type Row = { id: string; reg_no: string; full_name: string };

function normName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Every spelling of `regNo` that could already be on file.
 *
 * A canonical match has to be found in the database, and PostgREST can only
 * filter on the raw text. So the candidate spellings are generated from the
 * number the student typed — with and without the separators, with and without a
 * space after the year — and looked up with `in`. That covers every duplicate
 * shape the roster actually carries without pulling the whole table.
 */
function candidateSpellings(regNo: string): string[] {
  const display = displayRegNo(regNo);
  const canon = canonicalRegNo(regNo);
  const out = new Set<string>([String(regNo).trim(), display, canon]);
  // Re-insert the separator the cohort uses, at each place it is missing.
  const withDash = canon.replace(/^([A-Z]+\d{4})(\d{2})(\d+)$/, "$1-$2-$3");
  if (withDash !== canon) out.add(withDash);
  return [...out].filter((s) => s.length > 0);
}

export async function checkRegistrationConflicts(
  regNoInput: string,
  fullNameInput: string,
): Promise<RegistrationConflict> {
  const regNo = displayRegNo(regNoInput);
  const canon = canonicalRegNo(regNoInput);
  const fullName = fullNameInput.trim();

  if (!isUsableRegNo(canon)) {
    return { kind: "error", message: "Reg Namba haijakamilika. Andika namba yako yote." };
  }

  const candidates = candidateSpellings(regNo);
  const { data: regRows, error: regError } = await supabase
    .from("students")
    .select("id, reg_no, full_name")
    .in("reg_no", candidates)
    .limit(50);
  if (regError) return { kind: "error", message: regError.message };

  // `.in` is an exact match, so a spelling the candidate list did not guess is
  // still missed. The roster is small enough to scan, and a registration that
  // slips through is a duplicate nobody sees, so fall back to a full read only
  // when the fast lookup found nothing.
  let onFile = ((regRows ?? []) as Row[]).filter((r) => canonicalRegNo(r.reg_no) === canon);
  if (onFile.length === 0) {
    try {
      const all = await fetchAllStudents<Row>("id, reg_no, full_name", { orderBy: "reg_no" });
      onFile = all.filter((r) => canonicalRegNo(r.reg_no) === canon);
    } catch {
      // A failed fallback must not block a real student; the exact lookup above
      // already covered the shapes the roster is known to carry.
    }
  }

  if (onFile.length > 0) {
    // When the same person is on file more than once, the earliest row is the
    // one to greet: it is the record the office created first.
    const byName = onFile.find((r) => normName(r.full_name) === normName(fullName));
    if (byName) {
      return { kind: "returning", regNo: displayRegNo(byName.reg_no), fullName: byName.full_name };
    }
    const first = onFile[0];
    return {
      kind: "taken_by_other",
      regNo: displayRegNo(first.reg_no),
      fullName: first.full_name,
    };
  }

  const { data: nameRows, error: nameError } = await supabase
    .from("students")
    .select("id, reg_no, full_name")
    .ilike("full_name", fullName)
    .limit(20);
  if (nameError) return { kind: "error", message: nameError.message };

  const sameName = ((nameRows ?? []) as Row[]).filter((r) => canonicalRegNo(r.reg_no) !== canon);
  if (sameName.length > 0) {
    return { kind: "shared_name", fullName, count: sameName.length };
  }

  return { kind: "clear" };
}
