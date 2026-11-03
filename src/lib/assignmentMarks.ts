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

/* -------------------------------------------------------------------------- */
/* Which groups did the work, and who to export                               */
/* -------------------------------------------------------------------------- */

/**
 * One group's line in the admin's overview: what it sent, whether it has been
 * marked, and how it did.
 *
 * The overview answers one question the card grid cannot — "which groups have
 * finished?" — so `submitted` and `marked` are kept as plain booleans rather
 * than being re-derived from a string on every render.
 */
export type GroupOverview = {
  /** The same key `markKey` uses, so a mark can be found from a roster row. */
  id: string;
  label: string;
  semina: string;
  gender: string;
  group: string;
  /** The group sent its work. */
  submitted: boolean;
  /** The admin has read it and sent an answer back. */
  answered: boolean;
  /** The admin has put a mark on it. */
  marked: boolean;
  /** "7/24", or "" when there is no mark yet. */
  mark: string;
  score: number | null;
  max: number | null;
  percent: number | null;
  grade: string;
  /** Names of the members who presented. */
  presenters: string[];
  question: string;
  submittedAt: string | null;
  /** The page marks the teacher put on the work. */
  annotations: number;
  /** The group's file, so the admin can open or download it. */
  fileUrl: string | null;
  fileName: string | null;
};

/** The columns the per-group sheet shows. */
export type GroupMarksRow = {
  Group: string;
  Semina: string;
  Jinsia: string;
  "Reg Namba": string;
  Jina: string;
  Kozi: string;
  Alama: string;
  "Daraja (Grade)": string;
};

export const GROUP_MARKS_HEADERS = [
  "Group",
  "Semina",
  "Jinsia",
  "Reg Namba",
  "Jina",
  "Kozi",
  "Alama",
  "Daraja (Grade)",
] as const;

/**
 * A mark found through the group's own key.
 *
 * The overview and the roster spell the group the same way they always have, so
 * `groupMarkId` is the single place that turns (semina, gender, group) into the
 * key a mark is stored under. Keeping it here means the overview and the export
 * cannot drift apart.
 */
export function groupMarkId(
  semina: string | null | undefined,
  gender: string | null | undefined,
  group: string | null | undefined,
): string {
  return markKey(semina, gender, group);
}

/**
 * The groups that did the work, ready for the overview and the export picker.
 *
 * A group that never submitted is not invented here: the caller passes the
 * submissions it already has, and each becomes one line, so this stays a pure
 * map over them and the "who did the work" list cannot drift from the card grid.
 */
export function groupOverviewRows(
  submissions: {
    key: { semina: string; gender: string; group: string };
    label: string;
    presenters: string[];
    question: string;
    answered: boolean;
    submittedAt: string | null;
    mark: string | null;
    markScore: number | null;
    markMax: number | null;
    annotations: unknown[];
    row: { file_url?: string | null; file_name?: string | null };
  }[],
): GroupOverview[] {
  return submissions.map((s) => {
    const percent = markPercent(s.markScore, s.markMax);
    return {
      id: groupMarkId(s.key.semina, s.key.gender, s.key.group),
      label: s.label,
      semina: norm(s.key.semina),
      gender: genderKey(s.key.gender),
      group: norm(s.key.group),
      submitted: true,
      answered: s.answered,
      marked: s.markScore !== null,
      mark: s.mark ?? "",
      score: s.markScore,
      max: s.markMax,
      percent,
      grade: gradeOf(percent),
      presenters: s.presenters,
      question: s.question,
      submittedAt: s.submittedAt,
      annotations: s.annotations.length,
      fileUrl: s.row.file_url ?? null,
      fileName: s.row.file_name ?? null,
    };
  });
}

/** How many groups did the work, how many are marked, and how the marks read. */
export function marksSummary(groups: GroupOverview[]) {
  const total = groups.length;
  const submitted = groups.filter((g) => g.submitted).length;
  const marked = groups.filter((g) => g.marked).length;
  const answered = groups.filter((g) => g.answered).length;
  const percents = groups
    .map((g) => g.percent)
    .filter((p): p is number => p !== null && Number.isFinite(p));
  const average = percents.length
    ? percents.reduce((sum, p) => sum + p, 0) / percents.length
    : null;
  const best = percents.length ? Math.max(...percents) : null;
  const lowest = percents.length ? Math.min(...percents) : null;
  return { total, submitted, marked, answered, average, best, lowest };
}

/** "A" for a mark that passed, "-" when there is nothing to grade yet. */
export function gradeOrDash(percent: number | null): string {
  const grade = gradeOf(percent);
  return grade || "-";
}

/**
 * One line per student in the chosen groups, for a per-group export.
 *
 * Every student seated in a chosen group appears, even one whose group has no
 * mark yet: the sheet is a class roll, and dropping a name would hide who is
 * still outstanding. `groups` is the set of group keys to include.
 */
export function groupMarksRows(
  roster: MarkRosterPerson[],
  marks: GroupMark[],
  groups: string[],
): GroupMarksRow[] {
  const wanted = new Set(groups);
  const byGroup = new Map<string, GroupMark>();
  for (const m of marks) byGroup.set(markKey(m.semina, m.gender, m.group), m);

  const rows: GroupMarksRow[] = [];
  for (const person of roster) {
    const id = groupMarkId(person.semina, person.gender, person.student_group);
    if (!wanted.has(id)) continue;
    const mark = byGroup.get(id);
    const score = mark?.score ?? null;
    const max = mark?.max ?? null;
    const percent = markPercent(score, max);
    rows.push({
      Group: norm(person.student_group),
      Semina: norm(person.semina),
      Jinsia: genderLabelOf(person.gender),
      "Reg Namba": String(person.reg_no ?? "").trim(),
      Jina: String(person.full_name ?? "").trim(),
      Kozi: String(person.course ?? "").trim(),
      Alama: formatMark(score, max),
      "Daraja (Grade)": gradeOrDash(percent),
    });
  }
  return rows.sort(
    (a, b) =>
      a.Semina.localeCompare(b.Semina) ||
      a.Jinsia.localeCompare(b.Jinsia) ||
      a.Group.localeCompare(b.Group) ||
      a["Reg Namba"].localeCompare(b["Reg Namba"]) ||
      a.Jina.localeCompare(b.Jina),
  );
}

/** The same rows as arrays, which is what a PDF table wants. */
export function groupMarksTable(rows: GroupMarksRow[]): string[][] {
  return rows.map((r) => [
    r.Group,
    r.Semina,
    r.Jinsia,
    r["Reg Namba"],
    r.Jina,
    r.Kozi,
    r.Alama,
    r["Daraja (Grade)"],
  ]);
}

/** "Wanaume" / "Wanawake" for the sheet's Jinsia column. */
function genderLabelOf(raw: string | null | undefined): string {
  const v = genderKey(raw);
  if (v === "MWANAMKE") return "Wanawake";
  if (v === "MWANAUME") return "Wanaume";
  return v;
}
