import { supabase } from "@/integrations/supabase/client";

/**
 * Decides whether a registration may proceed.
 *
 * The rule this encodes: a registration number identifies a student, a name does
 * not. Names repeat — the cohort has 77 of them — and a repeated name is a fact
 * about two real people, never a reason to refuse one of them. So a number
 * already on file is the only hard stop, and even then only when the name
 * disagrees, because a matching pair means a returning student.
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

export async function checkRegistrationConflicts(
  regNoInput: string,
  fullNameInput: string,
): Promise<RegistrationConflict> {
  const regNo = regNoInput.trim().toUpperCase();
  const fullName = fullNameInput.trim();

  const { data: regRows, error: regError } = await supabase
    .from("students")
    .select("id, reg_no, full_name")
    .ilike("reg_no", regNo)
    .limit(10);
  if (regError) return { kind: "error", message: regError.message };

  const byReg = ((regRows ?? []) as Row[]).find((r) => r.reg_no.trim().toUpperCase() === regNo);
  if (byReg) {
    if (normName(byReg.full_name) === normName(fullName)) {
      return { kind: "returning", regNo: byReg.reg_no, fullName: byReg.full_name };
    }
    return { kind: "taken_by_other", regNo: byReg.reg_no, fullName: byReg.full_name };
  }

  const { data: nameRows, error: nameError } = await supabase
    .from("students")
    .select("id, reg_no, full_name")
    .ilike("full_name", fullName)
    .limit(20);
  if (nameError) return { kind: "error", message: nameError.message };

  const sameName = ((nameRows ?? []) as Row[]).filter(
    (r) => r.reg_no.trim().toUpperCase() !== regNo,
  );
  if (sameName.length > 0) {
    return { kind: "shared_name", fullName, count: sameName.length };
  }

  return { kind: "clear" };
}
