/**
 * Attendance reporting: one row per student, one column per session.
 *
 * Kept free of imports so it runs under `node --test`, exactly like `geo.ts`.
 * The page feeds it the sessions, the check-ins and the roster; it returns the
 * matrix, the per-student totals and the per-session totals that the Excel export
 * and the on-screen table both read from.
 */

export type ReportSession = {
  id: string;
  title: string;
  /** "Darasa" or "Semina" — the two kinds of sitting this centre records. */
  kind: "darasa" | "semina";
  semina: string | null;
  studentGroup: string | null;
  startedAt: string | null;
  radiusM: number;
};

export type ReportCheckIn = {
  sessionId: string;
  studentId: string;
  regNo: string;
  fullName: string;
  method: string | null;
  distanceM: number | null;
  at: string;
};

export type ReportStudent = {
  studentId: string;
  regNo: string;
  fullName: string;
  studentGroup: string | null;
  semina: string | null;
};

export type MatrixCell = {
  present: boolean;
  method: string | null;
  distanceM: number | null;
  at: string | null;
};

export type MatrixRow = {
  studentId: string;
  regNo: string;
  fullName: string;
  studentGroup: string | null;
  semina: string | null;
  /** Aligned with `sessions`; index i is that session's cell. */
  cells: MatrixCell[];
  attended: number;
  total: number;
  percent: number;
  /** Mean distance across the sessions attended, in metres. */
  avgDistanceM: number | null;
};

export type SessionTotal = {
  sessionId: string;
  title: string;
  kind: "darasa" | "semina";
  present: number;
  /** Percent of the roster that turned up. */
  percent: number;
  avgDistanceM: number | null;
};

export type AttendanceReport = {
  sessions: ReportSession[];
  rows: MatrixRow[];
  sessionTotals: SessionTotal[];
  summary: {
    students: number;
    sessions: number;
    checkIns: number;
    /** Mean attendance rate across every student, as a percentage. */
    avgRate: number;
    bestRate: number;
    worstRate: number;
  };
};

const EMPTY_CELL: MatrixCell = { present: false, method: null, distanceM: null, at: null };

/**
 * Builds the whole report.
 *
 * Sessions are ordered oldest-first so the columns read like a term's timeline.
 * The roster is the union of the supplied students and anyone who appears in a
 * check-in, because a student who attended and was later removed from `students`
 * must still show up in the attendance record — losing that row would understate
 * attendance, which is the one number this report exists to get right.
 */
export function buildAttendanceReport(
  sessions: ReportSession[],
  checkIns: ReportCheckIn[],
  roster: ReportStudent[],
): AttendanceReport {
  const ordered = [...sessions].sort((a, b) =>
    (a.startedAt ?? "").localeCompare(b.startedAt ?? ""),
  );

  const sessionIndex = new Map(ordered.map((s, i) => [s.id, i]));

  const byStudent = new Map<string, { student: ReportStudent; cells: MatrixCell[] }>();
  for (const s of roster) {
    byStudent.set(s.studentId, {
      student: s,
      cells: ordered.map(() => ({ ...EMPTY_CELL })),
    });
  }

  for (const c of checkIns) {
    const idx = sessionIndex.get(c.sessionId);
    if (idx == null) continue; // check-in for a session we were not given
    let entry = byStudent.get(c.studentId);
    if (!entry) {
      entry = {
        student: {
          studentId: c.studentId,
          regNo: c.regNo,
          fullName: c.fullName,
          studentGroup: null,
          semina: null,
        },
        cells: ordered.map(() => ({ ...EMPTY_CELL })),
      };
      byStudent.set(c.studentId, entry);
    }
    const existing = entry.cells[idx];
    // One check-in per student per session is the schema's rule, but keep the
    // first if a legacy duplicate ever appears, so the count cannot exceed 100%.
    if (!existing.present) {
      entry.cells[idx] = {
        present: true,
        method: c.method,
        distanceM: c.distanceM,
        at: c.at,
      };
    }
  }

  const rows: MatrixRow[] = [...byStudent.values()]
    .map(({ student, cells }) => {
      const attended = cells.filter((c) => c.present).length;
      const distances = cells
        .filter((c) => c.present && c.distanceM != null)
        .map((c) => c.distanceM as number);
      return {
        studentId: student.studentId,
        regNo: student.regNo,
        fullName: student.fullName,
        studentGroup: student.studentGroup,
        semina: student.semina,
        cells,
        attended,
        total: ordered.length,
        percent: ordered.length ? Math.round((attended / ordered.length) * 100) : 0,
        avgDistanceM: distances.length
          ? Math.round(distances.reduce((a, b) => a + b, 0) / distances.length)
          : null,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const sessionTotals: SessionTotal[] = ordered.map((s, i) => {
    const presentRows = rows.filter((r) => r.cells[i].present);
    const distances = presentRows
      .map((r) => r.cells[i].distanceM)
      .filter((d): d is number => d != null);
    return {
      sessionId: s.id,
      title: s.title,
      kind: s.kind,
      present: presentRows.length,
      percent: rows.length ? Math.round((presentRows.length / rows.length) * 100) : 0,
      avgDistanceM: distances.length
        ? Math.round(distances.reduce((a, b) => a + b, 0) / distances.length)
        : null,
    };
  });

  const checkInsRecorded = rows.reduce((n, r) => n + r.attended, 0);
  const rates = rows.map((r) => r.percent);
  const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0;

  return {
    sessions: ordered,
    rows,
    sessionTotals,
    summary: {
      students: rows.length,
      sessions: ordered.length,
      checkIns: checkInsRecorded,
      avgRate,
      bestRate: rates.length ? Math.max(...rates) : 0,
      worstRate: rates.length ? Math.min(...rates) : 0,
    },
  };
}

/**
 * The sheet an admin hands to the office: one row per student, one column per
 * session, plus the totals. `P`/`-` keeps it readable when printed.
 */
export function reportToSheet(report: AttendanceReport): Array<Record<string, string | number>> {
  const header: Record<string, string | number> = { Reg: "", Jina: "", Darasa: "", Semina: "" };
  report.sessions.forEach((s, i) => {
    const label = `${s.startedAt ? formatDay(s.startedAt) : `Kipindi ${i + 1}`} — ${s.title}`;
    header[label] = "";
  });

  return report.rows.map((r) => {
    const out: Record<string, string | number> = {
      Reg: r.regNo,
      Jina: r.fullName,
      Darasa: r.studentGroup ?? "",
      Semina: r.semina ?? "",
    };
    report.sessions.forEach((s, i) => {
      const label = `${s.startedAt ? formatDay(s.startedAt) : `Kipindi ${i + 1}`} — ${s.title}`;
      const cell = r.cells[i];
      out[label] = cell.present
        ? cell.distanceM != null
          ? `P (${Math.round(cell.distanceM)}m)`
          : "P"
        : "-";
    });
    out["Alizohudhuria"] = r.attended;
    out["Jumla ya Vipindi"] = r.total;
    out["Asilimia"] = `${r.percent}%`;
    out["Wastani wa Umbali (m)"] = r.avgDistanceM ?? "";
    return out;
  });
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** A filename-safe slug, so a title with spaces or slashes cannot break the download. */
export function slugify(text: string): string {
  return (
    text
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 60) || "mahudhurio"
  );
}
