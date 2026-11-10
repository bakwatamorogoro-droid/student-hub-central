import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { checkArea, getPosition } from "@/lib/geo";
import {
  isLectureOpen,
  lectureDateKey,
  lectureWindow,
  type LectureWindow,
} from "@/lib/lectureSchedule";
import { resolveStudentToken } from "@/lib/studentAccount";
import { deterministicUuid, digestsEqual, hashSecret, newSalt, randomUuid } from "@/lib/pin-crypto";
import { getDeviceId } from "@/lib/device-id";
import { fetchAllStudents } from "@/lib/fetchAllStudents";
import {
  buildAttendanceReport,
  type AttendanceReport,
  type ReportCheckIn,
  type ReportSession,
  type ReportStudent,
} from "@/lib/attendanceReport";

/**
 * Geofenced attendance, built on tables that already exist.
 *
 * The earlier version called `attendance_check_in()` and friends from
 * `supabase/APPLY_STUDENT_PIN_AUTH.sql`. That file has never been applied, and
 * this project has no service-role key and no DB connection, so nothing in this
 * repository can create those tables or functions. Attendance therefore has to
 * run on storage that is already there.
 *
 * Two constraints shape the design:
 *
 * 1. `attendance` carries `UNIQUE (student_id, check_in_date)`, so a student can
 *    only ever have one row per calendar day. That makes it impossible to record
 *    a second lecture on the same day, which is the bug this file fixes. The
 *    per-session record therefore lives in `quiz_participants` instead — unused
 *    by the rest of the app, writable with the publishable key, and carrying
 *    `UNIQUE (exam_id, student_id)`, which is exactly one check-in per student
 *    per session.
 * 2. The publishable key is public, so the browser cannot be trusted to decide
 *    whether a check-in is valid. A rotating token is only meaningful if the
 *    rotation is unguessable and short-lived, which is what makes a screenshot
 *    useless.
 *
 * Namespaces inside `quiz_participants`:
 *
 *   a0000000-…-0003  a session            (student_id = the teacher's id, or zeros)
 *   a0000000-…-0004  one student's check-in for that session
 *   a0000000-…-0005  the session's live QR token
 *
 * The `attendance` row is still written, in parallel, so every existing admin
 * screen, export and statistic keeps working unchanged.
 */

const SESSION_NS = "a0000000-0000-4000-8000-000000000003";
const CHECKIN_NS = "a0000000-0000-4000-8000-000000000004";
const TOKEN_NS = "a0000000-0000-4000-8000-000000000005";

/** Marks a session row as the Friday lecture rather than a teacher's own sitting. */
const LECTURE_KIND = "lecture";

/** Shown on the lecture's row and on the student's card. */
export const LECTURE_TITLE = "Muhadhara wa Ijumaa — Wanafunzi Wote";

/**
 * The id of the Friday lecture for a given EAT date.
 *
 * Derived rather than random, so every browser, phone and tab agrees on the same
 * session without a lookup — and so two students tapping "hudhuria" at the same
 * moment cannot create two lectures for one Friday.
 */
function lectureSessionId(dateKey: string): Promise<string> {
  return deterministicUuid(`lecture:${dateKey}`);
}

/** How long a single QR token stays valid. Short, so a photo goes stale. */
const TOKEN_TTL_SECONDS = 30;

export type AttendanceFailure =
  | "not_ready"
  | "invalid_token"
  | "expired_token"
  | "session_closed"
  | "not_registered"
  | "outside_area"
  | "wrong_group"
  | "gps_required"
  | "already_marked";

export type AttendanceResult =
  | { ok: true; fullName: string; semina: string | null; distanceM: number; checkInAt: string }
  | { ok: false; reason: AttendanceFailure; distanceM?: number; radiusM?: number };

export type OpenSession = {
  id: string;
  title: string;
  semina: string | null;
  studentGroup: string | null;
  radiusM: number;
  hasJoinCode: boolean;
  /** "lecture" is the Friday all-students sitting; "class" is a teacher's own. */
  kind: "lecture" | "class";
  /** Open to every student, regardless of their seminar or group. */
  openToAll: boolean;
  /** The owner has let the CR print this session's wall poster. */
  crQrAllowed: boolean;
};

export type Session = {
  id: string;
  title: string;
  semina: string | null;
  studentGroup: string | null;
  radiusM: number;
  joinCode: string | null;
  kind: "lecture" | "class";
  openToAll: boolean;
  /** The owner has let the CR print this session's wall poster. */
  crQrAllowed: boolean;
};

export type PresentRow = {
  fullName: string;
  regNo: string;
  studentId: string;
  createdAt: string;
  distanceM: number | null;
  method: string | null;
};

type SessionPayload = {
  v: 1;
  t: "session";
  /** Device that started the session; lets a test clean up only its own rows. */
  device: string | null;
  title: string;
  semina: string | null;
  student_group: string | null;
  lat: number | null;
  lng: number | null;
  radius_m: number;
  join_code: string | null;
  active: boolean;
  closes_at: string | null;
  /**
   * Absent on every row written before the Friday lecture existed, so a missing
   * value must read as "class" — that is what those rows are.
   */
  kind?: "lecture" | "class";
  /** The lecture is for everyone, so the group filter never applies to it. */
  open_to_all?: boolean;
  /**
   * The owner has let the CR print this session's wall poster.
   *
   * Absent on every row written before this switch existed, so a missing value
   * must read as "not allowed" — the safe default, and the state those sessions
   * were actually in.
   */
  cr_qr_allowed?: boolean;
};

type TokenPayload = {
  v: 1;
  t: "token";
  salt: string;
  hash: string;
  expires_at: string;
};

type CheckInPayload = {
  v: 1;
  t: "checkin";
  session_id: string;
  reg_no: string;
  student_id: string;
  method: "qr" | "code";
  distance_m: number | null;
  check_in_at: string;
};

function parse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Great-circle distance in metres. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** EAT (UTC+3, no DST) calendar date, for the legacy `attendance` row. */
function todayEat(): string {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------

/**
 * Starts a session and returns it.
 *
 * The join code is allocated here and checked for collisions by retrying,
 * because `quiz_participants` has no unique index on it.
 */
export async function startAttendanceSession(input: {
  title: string;
  semina: string | null;
  studentGroup: string | null;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  joinCode: string;
}): Promise<{ ok: true; session: Session } | { ok: false; message: string }> {
  const schema = z.object({
    title: z.string().trim().min(1).max(120),
    semina: z.string().nullable(),
    studentGroup: z.string().nullable(),
    lat: z.number().nullable(),
    lng: z.number().nullable(),
    radiusM: z.number().int().min(5).max(5000),
    joinCode: z.string().trim().min(4).max(12),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Taarifa za kipindi hazijakamilika" };
  const d = parsed.data;

  const live = await listOpenSessions();
  let code = d.joinCode.toUpperCase();
  for (let i = 0; i < 8 && live.some((s) => s.joinCode === code); i++) code = makeJoinCode();

  // The session's own id keys its row, so `UNIQUE (exam_id, student_id)` cannot
  // make two sessions collide with each other.
  const sessionId = randomUuid();
  const payload: SessionPayload = {
    v: 1,
    t: "session",
    device: getDeviceId() || null,
    title: d.title,
    semina: d.semina,
    student_group: d.studentGroup,
    lat: d.lat,
    lng: d.lng,
    radius_m: d.radiusM,
    join_code: code,
    active: true,
    closes_at: null,
    // A new session starts closed to the CR: the owner opens the poster to the CR
    // only when they mean to, so permission is a deliberate act, not a default.
    cr_qr_allowed: false,
  };

  const { error } = await supabase.from("quiz_participants").insert({
    // The row's own id *is* the session id, so callers can address the session
    // without a second lookup.
    id: sessionId,
    exam_id: SESSION_NS,
    student_id: sessionId,
    reg_no: "SESSION",
    full_name: d.title,
    semina: JSON.stringify(payload),
    student_group: d.studentGroup,
  });
  if (error) return { ok: false, message: error.message ?? "Imeshindikana kuanzisha kipindi" };

  return {
    ok: true,
    session: {
      id: sessionId,
      title: d.title,
      semina: d.semina,
      studentGroup: d.studentGroup,
      radiusM: d.radiusM,
      joinCode: code,
      kind: "class",
      openToAll: false,
      crQrAllowed: false,
    },
  };
}

/**
 * The admin's saved attendance point, which is the fence the Friday lecture
 * measures against. A null centre means no fence, exactly as for a class.
 */
async function loadAttendanceFence(): Promise<{
  lat: number | null;
  lng: number | null;
  radiusM: number;
}> {
  const { data } = await supabase
    .from("app_settings")
    .select("attendance_lat, attendance_lng, attendance_radius_m")
    .eq("id", 1)
    .maybeSingle();
  const s = data as {
    attendance_lat: number | null;
    attendance_lng: number | null;
    attendance_radius_m: number | null;
  } | null;
  return {
    lat: s?.attendance_lat ?? null,
    lng: s?.attendance_lng ?? null,
    radiusM: s?.attendance_radius_m ?? 200,
  };
}

/**
 * The Friday lecture for the Friday owning `at`, created on first use.
 *
 * Nothing schedules this ahead of time: the row appears the moment a student
 * checks in or an admin opens it, and it is keyed by the date so every caller
 * converges on one session. `closes_at` is the window's end, so the lecture stops
 * accepting check-ins at 10:00 without anyone pressing anything.
 */
export async function ensureLectureSession(
  at: Date | number = Date.now(),
): Promise<{ ok: true; session: Session; window: LectureWindow } | { ok: false; message: string }> {
  const window = lectureWindow(at);
  const id = await lectureSessionId(window.dateKey);

  const existing = await getSession(id);
  if (existing) return { ok: true, session: existing, window };

  const fence = await loadAttendanceFence();
  const payload: SessionPayload = {
    v: 1,
    t: "session",
    device: getDeviceId() || null,
    title: LECTURE_TITLE,
    semina: null,
    student_group: null,
    lat: fence.lat,
    lng: fence.lng,
    radius_m: fence.radiusM,
    join_code: makeJoinCode(),
    active: true,
    closes_at: window.closesAt,
    kind: "lecture",
    open_to_all: true,
    cr_qr_allowed: false,
  };

  const { error } = await supabase.from("quiz_participants").insert({
    id,
    exam_id: SESSION_NS,
    student_id: id,
    reg_no: "SESSION",
    full_name: LECTURE_TITLE,
    semina: JSON.stringify(payload),
    student_group: null,
  });
  // A concurrent create from another phone loses the race on the primary key.
  // That is the desired outcome, so fall back to reading the winner's row.
  if (error) {
    const raced = await getSession(id);
    if (raced) return { ok: true, session: raced, window };
    return { ok: false, message: error.message ?? "Imeshindikana kufungua muhadhara" };
  }

  return {
    ok: true,
    session: {
      id,
      title: LECTURE_TITLE,
      semina: null,
      studentGroup: null,
      radiusM: fence.radiusM,
      joinCode: payload.join_code,
      kind: "lecture",
      openToAll: true,
      crQrAllowed: false,
    },
    window,
  };
}

/**
 * Sessions that are still open. Pass the student's token to filter by group.
 *
 * The Friday lecture is added from the clock rather than from the table, so it is
 * listed to every student whether or not its row has been written yet.
 */
export async function listOpenSessions(
  studentToken?: string,
): Promise<Array<OpenSession & { joinCode: string | null }>> {
  const { data, error } = await supabase
    .from("quiz_participants")
    .select("id, semina")
    .eq("exam_id", SESSION_NS);
  if (error || !data) return [];

  let student: Awaited<ReturnType<typeof resolveStudentToken>> = null;
  if (studentToken) student = await resolveStudentToken(studentToken);

  const now = Date.now();
  const out: Array<OpenSession & { joinCode: string | null }> = [];
  for (const row of data as Array<{ id: string; semina: string | null }>) {
    const p = parse<SessionPayload>(row.semina);
    if (!p || p.t !== "session" || !p.active) continue;
    if (p.closes_at && new Date(p.closes_at).getTime() <= now) continue;
    const openToAll = p.open_to_all === true;
    // A group-targeted session is only shown to that group.
    if (student && !openToAll && p.student_group && p.student_group !== student.studentGroup)
      continue;
    out.push({
      id: row.id,
      title: p.title,
      semina: p.semina,
      studentGroup: p.student_group,
      radiusM: p.radius_m,
      hasJoinCode: !!p.join_code,
      joinCode: p.join_code,
      kind: p.kind === LECTURE_KIND ? "lecture" : "class",
      openToAll,
      crQrAllowed: p.cr_qr_allowed === true,
    });
  }

  if (isLectureOpen(now)) {
    const window = lectureWindow(now);
    const id = await lectureSessionId(window.dateKey);
    if (!out.some((s) => s.id === id)) {
      const fence = await loadAttendanceFence();
      out.unshift({
        id,
        title: LECTURE_TITLE,
        semina: null,
        studentGroup: null,
        radiusM: fence.radiusM,
        hasJoinCode: false,
        joinCode: null,
        kind: "lecture",
        openToAll: true,
        crQrAllowed: false,
      });
    }
  }

  return out;
}

/** Reads one session by id. */
export async function getSession(sessionId: string): Promise<Session | null> {
  const { data, error } = await supabase
    .from("quiz_participants")
    .select("id, semina")
    .eq("id", sessionId)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const p = parse<SessionPayload>((data[0] as { semina: string | null }).semina);
  if (!p || p.t !== "session") return null;
  return {
    id: sessionId,
    title: p.title,
    semina: p.semina,
    studentGroup: p.student_group,
    radiusM: p.radius_m,
    joinCode: p.join_code,
    kind: p.kind === LECTURE_KIND ? "lecture" : "class",
    openToAll: p.open_to_all === true,
    crQrAllowed: p.cr_qr_allowed === true,
  };
}

/**
 * Opens or closes one session's poster to the CR.
 *
 * The permission rides in the session's own JSON payload rather than in a new
 * table or column, because nothing in this environment can run DDL against the
 * live project — the same constraint that shaped the rest of this file. It is
 * read back by `listOpenSessions`, so the CR's screen and the admin's switch
 * agree without either telling the other.
 *
 * Only the session's owner opens it, and only for as long as the session lives:
 * ending the session ends the permission with it, because the poster is only
 * meaningful while the join code is being accepted.
 */
export async function setSessionCrQr(
  sessionId: string,
  allowed: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { data, error } = await supabase
    .from("quiz_participants")
    .select("semina")
    .eq("id", sessionId)
    .limit(1);
  if (error || !data?.length) return { ok: false, message: "Kipindi hakipatikani" };

  const p = parse<SessionPayload>((data[0] as { semina: string | null }).semina);
  if (!p || p.t !== "session") return { ok: false, message: "Kipindi hakipatikani" };

  const { error: writeError } = await supabase
    .from("quiz_participants")
    .update({ semina: JSON.stringify({ ...p, cr_qr_allowed: allowed }) })
    .eq("id", sessionId);
  if (writeError) return { ok: false, message: writeError.message ?? "Imeshindikana kubadilisha" };
  return { ok: true };
}

/** Closes a session so no further check-ins are accepted. */
export async function endAttendanceSession(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session) return false;

  const { data } = await supabase
    .from("quiz_participants")
    .select("semina")
    .eq("id", sessionId)
    .limit(1);
  const p = parse<SessionPayload>((data?.[0] as { semina: string | null })?.semina);
  if (!p) return false;

  const { error } = await supabase
    .from("quiz_participants")
    .update({
      semina: JSON.stringify({ ...p, active: false, closes_at: new Date().toISOString() }),
    })
    .eq("id", sessionId);
  return !error;
}

// ---------------------------------------------------------------
// Rotating QR token
// ---------------------------------------------------------------

/**
 * Mints a new QR token for a session and stores only its digest.
 *
 * The token itself is returned to the caller and never persisted, so a leaked
 * database row cannot be used to mint a valid scan.
 */
export async function rotateSessionToken(
  sessionId: string,
): Promise<{ ok: true; token: string; expiresAt: string } | { ok: false }> {
  const salt = newSalt();
  const secret = newSalt() + newSalt();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
  const payload: TokenPayload = {
    v: 1,
    t: "token",
    salt,
    hash: await hashSecret(secret, salt),
    expires_at: expiresAt,
  };

  // One token row per session, replaced in place.
  const { data } = await supabase
    .from("quiz_participants")
    .select("id")
    .eq("exam_id", TOKEN_NS)
    .eq("student_id", sessionId)
    .limit(1);

  const existing = (data as Array<{ id: string }> | null)?.[0]?.id;
  const body = {
    exam_id: TOKEN_NS,
    student_id: sessionId,
    reg_no: "TOKEN",
    full_name: "QR",
    semina: JSON.stringify(payload),
  };
  const { error } = existing
    ? await supabase.from("quiz_participants").update(body).eq("id", existing)
    : await supabase.from("quiz_participants").insert(body);
  if (error) return { ok: false };

  return { ok: true, token: secret, expiresAt };
}

/** Whether a scanned token matches the session's live token, and is fresh. */
async function tokenIsLive(
  sessionId: string,
  scanned: string,
): Promise<"ok" | "expired" | "wrong"> {
  const { data, error } = await supabase
    .from("quiz_participants")
    .select("semina")
    .eq("exam_id", TOKEN_NS)
    .eq("student_id", sessionId)
    .limit(1);
  if (error || !data || data.length === 0) return "wrong";

  const p = parse<TokenPayload>((data[0] as { semina: string | null }).semina);
  if (!p || p.t !== "token") return "wrong";
  // The digest is compared before the clock, so "expired" is only ever reported
  // for a token that really belongs to this session. Checking the clock first
  // made any unrelated open session whose token had timed out answer
  // "expired_token" for a forged code, which is the wrong message and, because
  // the caller returns on the first "expired", hid the session that would have
  // matched.
  if (!digestsEqual(await hashSecret(scanned, p.salt), p.hash)) return "wrong";
  if (new Date(p.expires_at).getTime() <= Date.now()) return "expired";
  return "ok";
}

// ---------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------

/**
 * Records one check-in.
 *
 * Every gate is applied here, in order: the session must exist and be open, the
 * token or code must match, GPS must be available, and the student must be
 * inside the radius the teacher set. The student's identity comes from their
 * sign-in token, never from anything the caller supplies directly.
 */
export async function checkIn(input: {
  studentToken: string;
  token?: string | null;
  joinCode?: string | null;
  /** A session the student tapped directly, e.g. the Friday lecture row. */
  sessionId?: string | null;
  /** The phone's fix, or null when GPS is off, refused or unavailable. */
  lat: number | null;
  lng: number | null;
  /** The phone's own error bar, so a vague indoor fix is not read as "far away". */
  accuracy?: number | null;
}): Promise<AttendanceResult> {
  const student = await resolveStudentToken(input.studentToken);
  if (!student) return { ok: false, reason: "not_registered" };

  // Resolve which session this is for.
  let session: Session | null = null;
  let method: "qr" | "code" = "qr";

  if (input.sessionId) {
    // A direct tap on a listed session. No token or code is involved, so the
    // gates below are the only thing between the student and a check-in.
    method = "code";
    session = await getSession(input.sessionId);
    if (!session) {
      // The Friday lecture is listed from the clock, so the student may be
      // tapping a session whose row has not been written yet. Creating it here
      // is what turns that tap into a check-in.
      const lecture = await ensureLectureSession();
      if (lecture.ok && lecture.session.id === input.sessionId) session = lecture.session;
    }
    if (!session) return { ok: false, reason: "invalid_token" };
  } else if (input.token) {
    const sessions = await listOpenSessions();
    for (const s of sessions) {
      const verdict = await tokenIsLive(s.id, input.token);
      if (verdict === "ok") {
        session = await getSession(s.id);
        break;
      }
      if (verdict === "expired") return { ok: false, reason: "expired_token" };
    }
    if (!session) return { ok: false, reason: "invalid_token" };
  } else if (input.joinCode) {
    method = "code";
    const wanted = input.joinCode.trim().toUpperCase();
    const sessions = await listOpenSessions();
    const match = sessions.find((s) => (s.joinCode || "").toUpperCase() === wanted);
    if (!match) return { ok: false, reason: "invalid_token" };
    session = await getSession(match.id);
  } else {
    return { ok: false, reason: "invalid_token" };
  }

  if (!session) return { ok: false, reason: "invalid_token" };

  // Reload the raw payload: the radius and coordinates are the teacher's, not
  // the browser's.
  const { data: raw } = await supabase
    .from("quiz_participants")
    .select("semina")
    .eq("id", session.id)
    .limit(1);
  const payload = parse<SessionPayload>((raw?.[0] as { semina: string | null })?.semina);
  if (!payload) return { ok: false, reason: "invalid_token" };
  if (!payload.active) return { ok: false, reason: "session_closed" };
  if (payload.closes_at && new Date(payload.closes_at).getTime() <= Date.now()) {
    return { ok: false, reason: "session_closed" };
  }

  // A group-targeted session is only for that group. The picker hides the others,
  // but a scanned join code bypasses the picker, so the rule is enforced here.
  // The Friday lecture is open to all, so the group rule never applies to it.
  if (
    payload.open_to_all !== true &&
    payload.student_group &&
    payload.student_group !== student.studentGroup
  ) {
    return { ok: false, reason: "wrong_group" };
  }

  // Geofence. A session the teacher started without coordinates has no fence,
  // so a student whose GPS is off can still check in — otherwise turning GPS on
  // would be a requirement the teacher never asked for.
  //
  // The phone's own error bar is allowed for, so a student indoors on a coarse
  // fix is not refused from a room they are standing in. `checkArea` only ever
  // moves a fix closer, so this cannot admit someone who is genuinely away.
  let dist: number | null = null;
  const verdict = checkArea(
    { lat: payload.lat, lng: payload.lng, radiusM: payload.radius_m },
    { lat: input.lat, lng: input.lng, accuracy: input.accuracy ?? null },
  );
  if (verdict.status === "missing_fix") return { ok: false, reason: "gps_required" };
  if (verdict.status === "outside") {
    return {
      ok: false,
      reason: "outside_area",
      distanceM: verdict.distanceM,
      radiusM: verdict.radiusM,
    };
  }
  if (verdict.status === "inside" || verdict.status === "near_edge") dist = verdict.distanceM;

  // The row id is derived from "student + session", and `student_id` holds that
  // same derived value: `UNIQUE (exam_id, student_id)` then makes a second
  // check-in for the same session impossible, even from two devices at once.
  const checkInId = await deterministicUuid(`checkin:${session.id}:${student.id}`);

  const { data: existing } = await supabase
    .from("quiz_participants")
    .select("id")
    .eq("exam_id", CHECKIN_NS)
    .eq("student_id", checkInId)
    .limit(1);
  if (existing && existing.length > 0) return { ok: false, reason: "already_marked" };

  const checkInAt = new Date().toISOString();
  const record: CheckInPayload = {
    v: 1,
    t: "checkin",
    session_id: session.id,
    // The row's `reg_no` column holds the session id, so the student's own
    // number is carried in the payload for the teacher's list.
    reg_no: student.regNo,
    student_id: student.id,
    method,
    distance_m: dist,
    check_in_at: checkInAt,
  };

  const { error } = await supabase.from("quiz_participants").insert({
    id: checkInId,
    exam_id: CHECKIN_NS,
    student_id: checkInId,
    // The session id in `reg_no` is what the teacher's list filters on.
    reg_no: session.id,
    full_name: student.fullName,
    semina: JSON.stringify(record),
    student_group: student.studentGroup,
  });
  if (error) {
    // 23505 is the unique index: a racing second scan.
    if ((error as { code?: string }).code === "23505")
      return { ok: false, reason: "already_marked" };
    return { ok: false, reason: "not_ready" };
  }

  // Mirror into the legacy `attendance` table so every existing admin screen
  // keeps working. This can legitimately fail on a second lecture the same day,
  // because that table only allows one row per student per date; the per-session
  // record above is the authoritative one.
  await supabase.from("attendance").insert({
    student_id: student.id,
    reg_no: student.regNo,
    full_name: student.fullName,
    semina: session.semina,
    student_group: student.studentGroup,
    check_in_date: todayEat(),
    status: "present",
    confirmed_by_admin: false,
    gps_lat: input.lat,
    gps_lng: input.lng,
    distance_m: dist,
  });

  return {
    ok: true,
    fullName: student.fullName,
    semina: session.semina,
    distanceM: dist ?? 0,
    checkInAt,
  };
}

/** The students checked in to one session, for the teacher's screen. */
export async function fetchSessionPresent(sessionId: string): Promise<PresentRow[]> {
  const { data, error } = await supabase
    .from("quiz_participants")
    .select("full_name, reg_no, semina, joined_at")
    .eq("exam_id", CHECKIN_NS)
    .eq("reg_no", sessionId);
  if (error || !data) return [];

  return (
    data as Array<{ full_name: string; reg_no: string; semina: string | null; joined_at: string }>
  )
    .map((r) => {
      const p = parse<CheckInPayload>(r.semina);
      return {
        fullName: r.full_name,
        regNo: p?.reg_no ?? "",
        studentId: p?.student_id ?? "",
        createdAt: p?.check_in_at ?? r.joined_at,
        distanceM: p?.distance_m ?? null,
        method: p?.method ?? null,
      };
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// ---------------------------------------------------------------
// Teacher's archive
// ---------------------------------------------------------------

export type SessionSummary = {
  id: string;
  title: string;
  semina: string | null;
  studentGroup: string | null;
  radiusM: number;
  joinCode: string | null;
  active: boolean;
  startedAt: string | null;
  closedAt: string | null;
  presentCount: number;
  kind: "lecture" | "class";
  openToAll: boolean;
  /** The owner has let the CR print this session's wall poster. */
  crQrAllowed: boolean;
};

/**
 * Every session ever started, newest first, each with its head count.
 *
 * The legacy `attendance` table can only hold one row per student per calendar
 * day, so it cannot represent a second lecture — this is the authoritative view.
 */
export async function listSessionSummaries(): Promise<SessionSummary[]> {
  const { data, error } = await supabase
    .from("quiz_participants")
    .select("id, semina, joined_at")
    .eq("exam_id", SESSION_NS);
  if (error || !data) return [];

  // One query for every check-in, then count in memory: the alternative is a
  // round trip per session, and a teacher has few enough of them.
  const { data: checkIns } = await supabase
    .from("quiz_participants")
    .select("reg_no")
    .eq("exam_id", CHECKIN_NS);
  const counts = new Map<string, number>();
  for (const c of (checkIns ?? []) as Array<{ reg_no: string | null }>) {
    if (!c.reg_no) continue;
    counts.set(c.reg_no, (counts.get(c.reg_no) ?? 0) + 1);
  }

  const out: SessionSummary[] = [];
  for (const row of data as Array<{ id: string; semina: string | null; joined_at: string }>) {
    const p = parse<SessionPayload>(row.semina);
    if (!p || p.t !== "session") continue;
    out.push({
      id: row.id,
      title: p.title,
      semina: p.semina,
      studentGroup: p.student_group,
      radiusM: p.radius_m,
      joinCode: p.join_code,
      active: !!p.active,
      startedAt: row.joined_at,
      closedAt: p.closes_at,
      presentCount: counts.get(row.id) ?? 0,
      kind: p.kind === LECTURE_KIND ? "lecture" : "class",
      openToAll: p.open_to_all === true,
      crQrAllowed: p.cr_qr_allowed === true,
    });
  }
  return out.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
}

/** Removes a session and every check-in recorded against it. */
export async function deleteAttendanceSession(sessionId: string): Promise<boolean> {
  const { error: checkInError } = await supabase
    .from("quiz_participants")
    .delete()
    .eq("exam_id", CHECKIN_NS)
    .eq("reg_no", sessionId);
  if (checkInError) return false;
  const { error } = await supabase.from("quiz_participants").delete().eq("id", sessionId);
  return !error;
}

/**
 * One student's own check-ins, session by session.
 *
 * Read from the check-in rows rather than the legacy mirror, so a student who
 * attended two lectures on the same day sees both.
 */
export async function fetchMyCheckIns(studentToken: string): Promise<SessionSummary[]> {
  const student = await resolveStudentToken(studentToken);
  if (!student) return [];

  const { data: sessions } = await supabase
    .from("quiz_participants")
    .select("id, semina, joined_at")
    .eq("exam_id", SESSION_NS);
  const byId = new Map<
    string,
    {
      title: string;
      semina: string | null;
      group: string | null;
      kind: "lecture" | "class";
      openToAll: boolean;
    }
  >();
  for (const row of (sessions ?? []) as Array<{ id: string; semina: string | null }>) {
    const p = parse<SessionPayload>(row.semina);
    if (!p || p.t !== "session") continue;
    byId.set(row.id, {
      title: p.title,
      semina: p.semina,
      group: p.student_group,
      kind: p.kind === LECTURE_KIND ? "lecture" : "class",
      openToAll: p.open_to_all === true,
    });
  }

  const { data: checkIns } = await supabase
    .from("quiz_participants")
    .select("id, semina, joined_at")
    .eq("exam_id", CHECKIN_NS);

  const out: SessionSummary[] = [];
  for (const row of (checkIns ?? []) as Array<{
    id: string;
    semina: string | null;
    joined_at: string;
  }>) {
    const p = parse<CheckInPayload>(row.semina);
    if (!p || p.student_id !== student.id) continue;
    const meta = byId.get(p.session_id);
    out.push({
      id: p.session_id,
      title: meta?.title ?? "Kipindi",
      semina: meta?.semina ?? null,
      studentGroup: meta?.group ?? null,
      radiusM: 0,
      joinCode: null,
      active: false,
      crQrAllowed: false,
      startedAt: p.check_in_at ?? row.joined_at,
      closedAt: null,
      presentCount: 0,
      kind: meta?.kind ?? "class",
      openToAll: meta?.openToAll ?? false,
    });
  }
  return out.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
}

// ---------------------------------------------------------------
// Full-term report (every session x every student)
// ---------------------------------------------------------------

/**
 * Everything the reporting screen and the Excel export need.
 *
 * One query for the sessions and one for every check-in, then the pure builder
 * in `attendanceReport.ts` does the grouping. Fetching per session would be a
 * round trip per lecture, which on a phone on campus data is the difference
 * between a report that loads and one that does not.
 */
export async function loadAttendanceReport(): Promise<AttendanceReport> {
  const { data: sessionRows } = await supabase
    .from("quiz_participants")
    .select("id, semina, joined_at")
    .eq("exam_id", SESSION_NS);

  const sessions: ReportSession[] = [];
  for (const row of (sessionRows ?? []) as Array<{
    id: string;
    semina: string | null;
    joined_at: string;
  }>) {
    const p = parse<SessionPayload>(row.semina);
    if (!p || p.t !== "session") continue;
    sessions.push({
      id: row.id,
      title: p.title,
      // Three kinds reach the office: the Friday lecture, a seminar, and an
      // ordinary class. A seminar is a session that names one.
      kind: p.kind === LECTURE_KIND ? "lecture" : p.semina ? "semina" : "darasa",
      semina: p.semina,
      studentGroup: p.student_group,
      startedAt: row.joined_at,
      radiusM: p.radius_m,
    });
  }

  const { data: checkInRows } = await supabase
    .from("quiz_participants")
    .select("reg_no, full_name, semina, joined_at")
    .eq("exam_id", CHECKIN_NS);

  const checkIns: ReportCheckIn[] = [];
  for (const row of (checkInRows ?? []) as Array<{
    reg_no: string | null;
    full_name: string | null;
    semina: string | null;
    joined_at: string;
  }>) {
    const p = parse<CheckInPayload>(row.semina);
    if (!p || p.t !== "checkin") continue;
    checkIns.push({
      sessionId: p.session_id,
      studentId: p.student_id,
      regNo: p.reg_no || row.reg_no || "",
      fullName: row.full_name || "",
      method: p.method,
      distanceM: p.distance_m,
      at: p.check_in_at ?? row.joined_at,
    });
  }

  let roster: ReportStudent[] = [];
  try {
    const students = await fetchAllStudents<{
      id: string;
      reg_no: string;
      full_name: string;
      student_group: string | null;
      semina: string | null;
    }>("id, reg_no, full_name, student_group, semina");
    roster = students.map((s) => ({
      studentId: s.id,
      regNo: s.reg_no,
      fullName: s.full_name,
      studentGroup: s.student_group,
      semina: s.semina,
    }));
  } catch {
    // The check-ins still produce a usable report without the roster; students
    // who never attended are simply absent from it.
  }

  return buildAttendanceReport(sessions, checkIns, roster);
}

// ---------------------------------------------------------------
// Live head count
// ---------------------------------------------------------------

export type LiveAttendance = {
  /** The open session, or null when nothing is running. */
  sessionId: string | null;
  title: string;
  kind: "lecture" | "class";
  openToAll: boolean;
  /** How many students are checked in right now. */
  present: number;
  /** The whole roll, for a percentage. Null when the roster is unreadable. */
  expected: number | null;
  /** The most recent arrivals, newest first — the "live" part of the counter. */
  recent: PresentRow[];
};

/**
 * The current head count for the open session, for the dashboard.
 *
 * The roster is fetched only for a percentage, and a failure there leaves the
 * count intact: the number that matters is how many students are in the room,
 * and that comes from the check-ins alone.
 */
export async function loadLiveAttendance(): Promise<LiveAttendance | null> {
  const open = await listOpenSessions();
  // The lecture is listed first when it is running, so it is what a Friday
  // dashboard should show. Otherwise the newest class session wins.
  const session = open[0];
  if (!session) return null;

  const present = await fetchSessionPresent(session.id);

  let expected: number | null = null;
  try {
    const students = await fetchAllStudents<{ id: string }>("id");
    expected = students.length || null;
  } catch {
    expected = null;
  }

  const recent = [...present].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  return {
    sessionId: session.id,
    title: session.title,
    kind: session.kind,
    openToAll: session.openToAll,
    present: present.length,
    expected,
    recent,
  };
}

/** A short, unambiguous code the teacher can read out. */
export function makeJoinCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = new Uint32Array(6);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export { getPosition };
