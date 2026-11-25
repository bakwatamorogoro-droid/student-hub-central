/**
 * The rows an admin hands back to the class after marking an exam.
 *
 * The owner asked for one shape in every download — Excel, CSV, Word, PDF — and
 * for it to hold only three things: the student's name, their registration
 * number and their mark. Everything else the table shows (course, phone, GPS,
 * submission time) is for the admin to read on screen, not for the sheet.
 *
 * Pure and import-free so `node --test` can pin the ordering and the shape.
 */

export type ResultRow = {
  Jina: string;
  "Reg Namba": string;
  Alama: string;
};

/** The shape a `submissions` row must have for `resultRows`. */
export type ResultSubmission = {
  reg_no?: string | null;
  score?: number | string | null;
  students?: { full_name?: string | null } | null;
};

/**
 * Sorts by name the way a class register reads: A–Z, ignoring case.
 *
 * `localeCompare` with a fixed locale, because a plain `<` puts "abdul" after
 * "Zainab" (uppercase sorts first in ASCII) and Swahili names carry no accent
 * for the default collation to trip over.
 */
export function compareByName(a: ResultRow, b: ResultRow): number {
  return (
    a.Jina.localeCompare(b.Jina, "sw", { sensitivity: "base" }) ||
    a["Reg Namba"].localeCompare(b["Reg Namba"], "sw", { sensitivity: "base" })
  );
}

/**
 * Folds "fancy text" letters back to the plain ones they stand for.
 *
 * A name typed with a decorative keyboard arrives as mathematical alphanumeric
 * symbols (U+1D400 and up). They read as letters but have no glyph in the PDF's
 * built-in fonts, so the cell printed blank while the mark beside it printed
 * fine. NFKC maps them to "SALIMA ALLY BAULENI", which every format can draw.
 */
function plainName(name: string): string {
  return name.normalize("NFKC");
}

/**
 * One row per submission, in alphabetical order by student name.
 *
 * A missing mark is written as an empty cell rather than "0" or "-": a blank
 * tells the reader the paper was not marked, while a zero claims it scored
 * nothing.
 */
export function resultRows(submissions: ResultSubmission[]): ResultRow[] {
  return (submissions ?? [])
    .map((s) => ({
      Jina: plainName(String(s.students?.full_name ?? "").trim()) || "—",
      "Reg Namba": String(s.reg_no ?? "").trim(),
      Alama: s.score == null || s.score === "" ? "" : String(Math.round(Number(s.score))),
    }))
    .sort(compareByName);
}
