/**
 * Marks for a group's assignment ("Alama").
 *
 * The owner marks a group the way a teacher writes on paper — "7/24" — so the
 * admin types one short string rather than two boxes. Everything here is pure
 * and import-free so `node --test` can pin the parsing rules: what counts as a
 * mark, what is rejected, and how a mark is spelled back to the group and into
 * the exported Excel/Word/PDF.
 */

/** The total the admin marks out of when they type a bare number, e.g. "7". */
export const DEFAULT_MARK_MAX = 100;

export type Mark = { score: number; max: number };

export type ParsedMark = { ok: true; mark: Mark } | { ok: false; error: string };

/**
 * Reads what the admin typed.
 *
 * Accepts `7/24`, `7 / 24`, `7-24`, `7 out of 24`, `7 kati ya 24`, and a bare
 * `7` (which uses `fallbackMax`). Decimals are kept, because half marks are
 * real: `7.5/24`. The score may equal the total but never exceed it — "25/24"
 * is a typo, and storing it would put a mark above 100% in front of the group.
 */
export function parseMark(raw: string, fallbackMax: number = DEFAULT_MARK_MAX): ParsedMark {
  const text = String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
  if (!text) return { ok: false, error: "Weka alama, mfano 7/24." };

  const parts = text.split(/\s*(?:\/|-|kati ya|out of|of)\s*/i);
  if (parts.length > 2) return { ok: false, error: "Muundo si sahihi. Tumia mfano 7/24." };

  const score = toNumber(parts[0]);
  if (score === null) return { ok: false, error: "Alama si namba. Tumia mfano 7/24." };
  if (score < 0) return { ok: false, error: "Alama haiwezi kuwa hasi." };

  const max = parts.length === 2 ? toNumber(parts[1]) : toNumber(fallbackMax);
  if (max === null || max <= 0) {
    return { ok: false, error: "Jumla ya alama lazima iwe kubwa kuliko sifuri." };
  }
  if (score > max) {
    return {
      ok: false,
      error: `Alama ${trimNumber(score)} haiwezi kuzidi jumla ${trimNumber(max)}.`,
    };
  }

  return { ok: true, mark: { score, max } };
}

function toNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value ?? "").trim();
  if (!text) return null;
  // A trailing "%" is not a mark out of a total, so it is rejected rather than
  // silently read as the number before it.
  if (/[^\d.,]/.test(text)) return null;
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** "7/24", and just "7" when nothing was marked out of. */
export function formatMark(
  score: number | null | undefined,
  max: number | null | undefined,
): string {
  const s = numberOrNull(score);
  if (s === null) return "";
  const m = numberOrNull(max);
  return m === null ? trimNumber(s) : `${trimNumber(s)}/${trimNumber(m)}`;
}

function numberOrNull(value: number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Drops a trailing ".0" so 7.0 reads as "7" and 7.5 stays "7.5". */
export function trimNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** 0–100, or null when there is nothing to divide by. */
export function markPercent(
  score: number | null | undefined,
  max: number | null | undefined,
): number | null {
  const s = numberOrNull(score);
  const m = numberOrNull(max);
  if (s === null || m === null || m <= 0) return null;
  return (s / m) * 100;
}

/** The Tanzanian pass bands the owner's own exam grading uses. */
export function gradeOf(percent: number | null): string {
  if (percent === null) return "";
  if (percent >= 75) return "A";
  if (percent >= 65) return "B";
  if (percent >= 50) return "C";
  if (percent >= 40) return "D";
  return "F";
}

export function gradeLabel(percent: number | null): string {
  const grade = gradeOf(percent);
  if (!grade) return "";
  if (grade === "F") return "F — Hajafaulu";
  return `${grade} — Amafaulu`;
}

/** One student's line in the roster that the exports are built from. */
export type MarkRosterPerson = {
  reg_no?: string | null;
  full_name?: string | null;
  course?: string | null;
  semina?: string | null;
  gender?: string | null;
  student_group?: string | null;
};

/** A mark the admin already gave, keyed back to the group that earned it. */
export type GroupMark = {
  semina: string;
  gender: string;
  group: string;
  score: number | null;
  max: number | null;
};

/** The columns the "all groups" export is allowed to show. */
export type AllMarksRow = {
  "Reg Namba": string;
  Jina: string;
  Kozi: string;
  Alama: string;
  "Daraja (Grade)": string;
};

const norm = (value: string | null | undefined) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

/**
 * The gender spellings the roster really carries, collapsed the same way the
 * submission key collapses them, so a mark finds its group whichever spelling
 * the row happens to hold.
 */
function genderKey(raw: string | null | undefined): string {
  const v = norm(raw);
  if (v === "FEMALE" || v === "MWANAMKE" || v === "F" || v === "KE") return "MWANAMKE";
  if (v === "MALE" || v === "MWANAUME" || v === "M" || v === "ME") return "MWANAUME";
  return v;
}

const markKey = (
  semina: string | null | undefined,
  gender: string | null | undefined,
  group: string | null | undefined,
) => `${norm(semina)}||${genderKey(gender)}||${norm(group)}`;

/**
 * The "all groups" sheet the owner asked for: **only** the name, the registration
 * number, the course and the marks.
 *
 * Every student in the roster appears, so the list is a complete class roll even
 * for groups that have not submitted yet; a group with no mark yet is left blank
 * rather than dropped, otherwise the owner cannot see who is still outstanding.
 */
export function allMarksRows(roster: MarkRosterPerson[], marks: GroupMark[]): AllMarksRow[] {
  const byGroup = new Map<string, GroupMark>();
  for (const m of marks) {
    byGroup.set(markKey(m.semina, m.gender, m.group), m);
  }

  return roster
    .map((person) => {
      const mark = byGroup.get(markKey(person.semina, person.gender, person.student_group));
      const score = mark?.score ?? null;
      const max = mark?.max ?? null;
      const percent = markPercent(score, max);
      return {
        "Reg Namba": String(person.reg_no ?? "").trim(),
        Jina: String(person.full_name ?? "").trim(),
        Kozi: String(person.course ?? "").trim(),
        Alama: formatMark(score, max),
        "Daraja (Grade)": gradeOf(percent),
      };
    })
    .sort((a, b) => a["Reg Namba"].localeCompare(b["Reg Namba"]) || a.Jina.localeCompare(b.Jina));
}

/** The same rows as an array of arrays, which is what a PDF table wants. */
export function allMarksTable(rows: AllMarksRow[]): string[][] {
  return rows.map((r) => [r["Reg Namba"], r.Jina, r.Kozi, r.Alama, r["Daraja (Grade)"]]);
}

export const ALL_MARKS_HEADERS = ["Reg Namba", "Jina", "Kozi", "Alama", "Daraja (Grade)"] as const;
