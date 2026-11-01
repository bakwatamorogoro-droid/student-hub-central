/**
 * Who is sitting an exam right now.
 *
 * A submission row is created when the student starts, carrying `started_at`, and
 * `submitted_at` is filled in only at the end. So "in progress" is exactly
 * `started_at IS NOT NULL AND submitted_at IS NULL`. No new table is needed, and
 * nothing has to be cleaned up if a phone dies: the row simply stops being updated.
 *
 * The heartbeat column is optional — see the migration — and the queries here
 * degrade to the plain start/submit pair when it is absent.
 */

export type LiveStudent = {
  submissionId: string;
  studentId: string;
  regNo: string;
  fullName: string;
  startedAt: string;
  /** Last time the student's browser checked in; null when the column is missing. */
  lastSeenAt: string | null;
  answeredCount: number;
  questionCount: number;
  gpsDistanceM: number | null;
  deviceId: string | null;
  /** Seconds since the last heartbeat, or since the start when there is none. */
  idleSeconds: number;
};

export type LiveExam = {
  examId: string;
  title: string;
  durationMinutes: number;
  live: LiveStudent[];
  startedCount: number;
  submittedCount: number;
  /** Live students whose heartbeat has gone quiet for too long. */
  staleCount: number;
};

/** A student with no heartbeat for this long is shown as "kimya" (quiet). */
export const STALE_AFTER_SECONDS = 90;

type Row = Record<string, unknown>;

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Counts answered questions without assuming the answers blob is an object. */
export function countAnswers(answers: unknown): number {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return 0;
  return Object.values(answers as Record<string, unknown>).filter((v) => {
    if (v == null) return false;
    if (typeof v === "string") return v.trim() !== "";
    if (typeof v === "object") return Object.keys(v as object).length > 0;
    return true;
  }).length;
}

/**
 * Builds the live view from already-fetched rows.
 *
 * Split out from the query so the grouping, the idle arithmetic and the "kimya"
 * rule can be tested without a database.
 */
export function buildLiveExams(
  exams: Array<{ id: string; title: string; duration_minutes: number | null }>,
  submissions: Row[],
  questionCounts: Map<string, number>,
  now = Date.now(),
): LiveExam[] {
  const byExam = new Map<string, LiveExam>();
  for (const e of exams) {
    byExam.set(e.id, {
      examId: e.id,
      title: e.title,
      durationMinutes: e.duration_minutes ?? 0,
      live: [],
      startedCount: 0,
      submittedCount: 0,
      staleCount: 0,
    });
  }

  for (const row of submissions) {
    const examId = str(row.exam_id);
    const group = byExam.get(examId);
    if (!group) continue;

    if (row.submitted_at) {
      group.submittedCount++;
      continue;
    }
    if (!row.started_at) continue;

    const startedAt = str(row.started_at);
    const lastSeenRaw = row.last_seen_at ? str(row.last_seen_at) : null;
    const reference = lastSeenRaw ?? startedAt;
    const idleSeconds = Math.max(0, Math.round((now - new Date(reference).getTime()) / 1000));

    group.startedCount++;
    if (idleSeconds > STALE_AFTER_SECONDS) group.staleCount++;

    group.live.push({
      submissionId: str(row.id),
      studentId: str(row.student_id),
      regNo: str(row.reg_no),
      fullName: str(row.full_name),
      startedAt,
      lastSeenAt: lastSeenRaw,
      answeredCount: countAnswers(row.answers),
      questionCount: questionCounts.get(examId) ?? 0,
      gpsDistanceM: num(row.gps_distance_m),
      deviceId: row.device_id ? str(row.device_id) : null,
      idleSeconds,
    });
  }

  for (const group of byExam.values()) {
    group.live.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  return [...byExam.values()].filter((g) => g.startedCount > 0 || g.submittedCount > 0);
}

/**
 * Loads every exam that has activity, with its live sitters.
 *
 * Deliberately not filtered to "today": an exam left open overnight is exactly the
 * case a teacher wants to see rather than have hidden.
 */
