import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device-id";
import { z } from "zod";
import {
  digestsEqual,
  generatePin,
  hashDeviceId,
  hashSecret,
  newSalt,
  newSessionToken,
  normalizePhone,
  tokenDigest,
} from "@/lib/pin-crypto";

/**
 * Student sign-in without email, using only tables that already exist.
 *
 * The earlier design called `student_login()` and friends from
 * `supabase/APPLY_STUDENT_PIN_AUTH.sql`. That file has never been applied, and
 * this project has no service-role key and no DB connection, so nothing in this
 * repository can create the tables those functions need. The account system
 * therefore has to be built on storage that is already there.
 *
 * `quiz_participants` is that storage. It is the one table in the schema that is
 * (a) not referenced anywhere in `src/`, so nothing else can be disturbed by
 * these rows, (b) writable and deletable with the publishable key, and (c)
 * carries `UNIQUE (exam_id, student_id)`, which is exactly the one-row-per-
 * student guarantee a credential store needs.
 *
 * Rows are namespaced by `exam_id` so they can never be confused with quiz data
 * or with each other:
 *
 *   a0000000-…-0001  a PIN for one student   (student_id = the student)
 *   a0000000-…-0002  a sign-in session       (student_id = the student)
 *
 * The free-text `semina` column holds the JSON payload. Secrets are never
 * stored in the clear: the PIN is PBKDF2-stretched over a per-row salt, and only
 * the SHA-256 digest of a session token is persisted. See `pin-crypto.ts`.
 *
 * What this can and cannot protect. The publishable key is public, so these
 * rows are world-readable and world-writable. Salting means a stolen row does
 * not reveal a PIN, but an attacker with the key can still overwrite a row and
 * so take over an account. That is a real limit of doing auth without a server,
 * and it is why `supabase/HARDEN_RLS.sql` matters — but that file cannot be
 * applied until the rest of the app stops reading these tables from the browser.
 */

const PIN_NS = "a0000000-0000-4000-8000-000000000001";
const SESSION_NS = "a0000000-0000-4000-8000-000000000002";

const SESSION_HOURS = 12;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const PIN_LENGTH = 6;

const regNoSchema = z.string().trim().min(3).max(40);
const pinSchema = z.string().regex(/^[0-9]{4,10}$/);
const tokenSchema = z.string().trim().min(32).max(200);

export type LoginResult =
  | { ok: true; token: string; fullName: string }
  | {
      ok: false;
      reason: "bad_credentials" | "locked" | "wrong_device" | "not_ready";
      lockedUntil?: string;
    };

export type ClaimPinResult =
  | { ok: true; pin: string; fullName: string }
  | { ok: false; reason: "bad_details" | "disabled" | "already_claimed" | "not_ready" };

export type StudentProfile = {
  fullName: string;
  regNo: string;
  semina: string | null;
  studentGroup: string | null;
  course: string | null;
  studyYear: number | null;
  academicYear: string | null;
  attendance: Array<{
    id: string;
    check_in_date: string | null;
    created_at: string;
    semina: string | null;
    student_group: string | null;
    distance_m: number | null;
    status: string | null;
  }>;
};

type StudentRow = {
  id: string;
  reg_no: string;
  full_name: string;
  phone: string | null;
  semina: string | null;
  student_group: string | null;
  course: string | null;
  study_year: number | null;
  academic_year: string | null;
};

type PinPayload = {
  v: 1;
  t: "pin";
  salt: string;
  hash: string;
  device: string | null;
  fail: number;
  locked_until: string | null;
};

type SessionPayload = {
  v: 1;
  t: "session";
  device: string | null;
  expires_at: string;
};

/** Strips the characters that would turn an `ilike` into a wildcard search. */
function escapeLike(input: string): string {
  return input.replace(/[%_\\]/g, "");
}

async function findStudent(regNoInput: string): Promise<StudentRow | null> {
  const regNo = regNoInput.trim();
  if (regNo.length < 3) return null;

  const { data, error } = await supabase
    .from("students")
    .select(
      "id, reg_no, full_name, phone, semina, student_group, course, study_year, academic_year",
    )
    .ilike("reg_no", escapeLike(regNo))
    .limit(5);
  if (error || !data) return null;

  const wanted = regNo.toUpperCase();
  const exact = (data as StudentRow[]).find((s) => s.reg_no.trim().toUpperCase() === wanted);
  return exact ?? (data as StudentRow[])[0] ?? null;
}

async function readPinRow(studentId: string): Promise<{ id: string; payload: PinPayload } | null> {
  const { data, error } = await supabase
    .from("quiz_participants")
    .select("id, semina")
    .eq("exam_id", PIN_NS)
    .eq("student_id", studentId)
    .limit(1);
  if (error || !data || data.length === 0) return null;

  const row = data[0] as { id: string; semina: string | null };
  try {
    const payload = JSON.parse(row.semina || "{}") as PinPayload;
    if (payload?.t !== "pin" || !payload.hash || !payload.salt) return null;
    return { id: row.id, payload };
  } catch {
    return null;
  }
}

async function writePinRow(
  student: StudentRow,
  payload: PinPayload,
  existingId?: string,
): Promise<boolean> {
  const body = {
    exam_id: PIN_NS,
    student_id: student.id,
    reg_no: student.reg_no,
    full_name: student.full_name,
    semina: JSON.stringify(payload),
    student_group: student.student_group,
  };
  if (existingId) {
    const { error } = await supabase.from("quiz_participants").update(body).eq("id", existingId);
    return !error;
  }
  const { error } = await supabase.from("quiz_participants").insert(body);
  return !error;
}

async function clearSessions(studentId: string): Promise<void> {
  await supabase
    .from("quiz_participants")
    .delete()
    .eq("exam_id", SESSION_NS)
    .eq("student_id", studentId);
}

/**
 * Claims a PIN for a student who does not have one yet.
 *
 * The student proves who they are with the phone number the school already has
 * on file. The PIN is random, returned once, and bound to this device so it
 * cannot be passed around a classroom. An admin re-issue is the recovery path
 * when a student changes phone.
 */
export async function claimStudentPin(
  regNoInput: string,
  phoneInput: string,
): Promise<ClaimPinResult> {
  const regNo = regNoSchema.safeParse(regNoInput);
  const phone = z.string().trim().min(9).max(20).safeParse(phoneInput);
  if (!regNo.success || !phone.success) return { ok: false, reason: "bad_details" };

  const student = await findStudent(regNo.data);
  if (!student) return { ok: false, reason: "bad_details" };

  // The phone on file is the only thing that proves the claim is genuine.
  const onFile = normalizePhone(student.phone || "");
  const offered = normalizePhone(phone.data);
  if (!onFile || !offered || onFile !== offered) return { ok: false, reason: "bad_details" };

  const existing = await readPinRow(student.id);
  if (existing) return { ok: false, reason: "already_claimed" };

  const salt = newSalt();
  const pin = generatePin(PIN_LENGTH);
  const payload: PinPayload = {
    v: 1,
    t: "pin",
    salt,
    hash: await hashSecret(pin, salt),
    device: await hashDeviceId(currentDeviceId(), salt),
    fail: 0,
    locked_until: null,
  };

  const stored = await writePinRow(student, payload);
  if (!stored) return { ok: false, reason: "not_ready" };

  return { ok: true, pin, fullName: student.full_name };
}

export type ResetPinResult =
  | { ok: true; pin: string; fullName: string; regNo: string }
  | { ok: false; reason: "bad_details" | "disabled" | "not_ready" | "ambiguous" };

/** The last whitespace-separated token of a name, lower-cased. */
function lastNameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return (parts[parts.length - 1] || "").toLowerCase();
}

/**
 * Issues a fresh PIN to a student who forgot theirs.
 *
 * The proof is the phone the school already holds plus the student's last name,
 * which is the same evidence `claimStudentPin` accepts for a first PIN. Both are
 * on file in `students`, so a classmate who knows only a registration number
 * cannot take the account over.
 *
 * What this deliberately does: clears the old PIN, the lockout, and every live
 * session, so a reset also signs the student out everywhere. What it cannot do:
 * stop someone who knows both facts from doing the same. That is the ceiling of
 * doing auth with a publishable key, and the reason `HARDEN_RLS.sql` exists.
 */
export async function resetStudentPin(
  phoneInput: string,
  lastNameInput: string,
  regNoInput?: string,
): Promise<ResetPinResult> {
  const phone = normalizePhone(phoneInput || "");
  const lastName = (lastNameInput || "").trim().toLowerCase();
  if (!phone || lastName.length < 2) return { ok: false, reason: "bad_details" };

  // Search by last name rather than by phone: `phone` is free text in the table,
  // so the stored spelling varies (0712…, +255712…, 255712…) while the name is
  // entered the same way by everyone.
  const { data, error } = await supabase
    .from("students")
    .select(
      "id, reg_no, full_name, phone, semina, student_group, course, study_year, academic_year",
    )
    .ilike("full_name", `%${escapeLike(lastNameInput.trim())}`)
    .limit(200);
  if (error) return { ok: false, reason: "not_ready" };

  let matches = ((data ?? []) as StudentRow[]).filter(
    (s) => lastNameOf(s.full_name) === lastName && normalizePhone(s.phone || "") === phone,
  );

  // A fifth of this cohort shares a last name *and* a phone number with at least
  // one other student, so the pair alone often does not name one person. When it
  // does not, ask for the registration number rather than refusing or guessing:
  // it is on the student's ID card, and it resolves the tie exactly.
  if (matches.length > 1) {
    const wanted = (regNoInput || "").trim().toUpperCase();
    if (!wanted) return { ok: false, reason: "ambiguous" };
    matches = matches.filter((s) => s.reg_no.trim().toUpperCase() === wanted);
  }

  if (matches.length !== 1) return { ok: false, reason: "bad_details" };
  const student = matches[0];

  const existing = await readPinRow(student.id);
  const salt = newSalt();
  const pin = generatePin(PIN_LENGTH);
  const payload: PinPayload = {
    v: 1,
    t: "pin",
    salt,
    hash: await hashSecret(pin, salt),
    // The student is very likely on the phone they are resetting from, so bind
    // to this device; a later phone change goes through the admin.
    device: await hashDeviceId(currentDeviceId(), salt),
    fail: 0,
    locked_until: null,
  };

  const stored = await writePinRow(student, payload, existing?.id);
  if (!stored) return { ok: false, reason: "not_ready" };

  // A reset is a credential change, so every session minted with the old PIN
  // stops working.
  await clearSessions(student.id);

  return { ok: true, pin, fullName: student.full_name, regNo: student.reg_no };
}

export async function loginStudent(regNoInput: string, pinInput: string): Promise<LoginResult> {
  const regNo = regNoSchema.safeParse(regNoInput);
  const pin = pinSchema.safeParse(pinInput);
  if (!regNo.success || !pin.success) return { ok: false, reason: "bad_credentials" };

  const student = await findStudent(regNo.data);
  if (!student) return { ok: false, reason: "bad_credentials" };

  const row = await readPinRow(student.id);
  if (!row) return { ok: false, reason: "bad_credentials" };

  const { payload } = row;
  if (payload.locked_until && new Date(payload.locked_until).getTime() > Date.now()) {
    return { ok: false, reason: "locked", lockedUntil: payload.locked_until };
  }

  const supplied = await hashSecret(pin.data, payload.salt);
  const pinOk = digestsEqual(supplied, payload.hash);

  const deviceHash = await hashDeviceId(currentDeviceId(), payload.salt);
  const deviceOk = !payload.device || digestsEqual(deviceHash, payload.device);

  if (!pinOk || !deviceOk) {
    // Count the attempt, and lock the account after too many. A wrong device is
    // not counted: the student is probably just on a second phone.
    const next: PinPayload = { ...payload, locked_until: payload.locked_until ?? null };
    if (!pinOk) {
      next.fail = (payload.fail || 0) + 1;
      if (next.fail >= MAX_FAILS) {
        next.locked_until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
        next.fail = 0;
      }
    }
    await writePinRow(student, next, row.id);
    if (!deviceOk && pinOk) return { ok: false, reason: "wrong_device" };
    if (next.locked_until && new Date(next.locked_until).getTime() > Date.now()) {
      return { ok: false, reason: "locked", lockedUntil: next.locked_until };
    }
    return { ok: false, reason: "bad_credentials" };
  }

  if (payload.fail !== 0 || payload.locked_until) {
    await writePinRow(student, { ...payload, fail: 0, locked_until: null }, row.id);
  }

  // One live session per student, so signing in elsewhere ends the old one.
  await clearSessions(student.id);

  const token = newSessionToken();
  const session: SessionPayload = {
    v: 1,
    t: "session",
    device: deviceHash,
    expires_at: new Date(Date.now() + SESSION_HOURS * 3_600_000).toISOString(),
  };
  const { error } = await supabase.from("quiz_participants").insert({
    exam_id: SESSION_NS,
    student_id: student.id,
    reg_no: student.reg_no,
    // The digest is stored in `full_name` because it needs an exact-match
    // filter, and that is a free-text column with no JSON escaping.
    full_name: await tokenDigest(token),
    semina: JSON.stringify(session),
    student_group: student.student_group,
  });
  if (error) return { ok: false, reason: "not_ready" };

  return { ok: true, token, fullName: student.full_name };
}

/** Resolves a session token to the student it belongs to, or null. */
async function resolveSession(tokenInput: string): Promise<StudentRow | null> {
  const token = tokenSchema.safeParse(tokenInput);
  if (!token.success) return null;

  const digest = await tokenDigest(token.data);
  const { data, error } = await supabase
    .from("quiz_participants")
    .select("id, student_id, semina")
    .eq("exam_id", SESSION_NS)
    .eq("full_name", digest)
    .limit(1);
  if (error || !data || data.length === 0) return null;

  const row = data[0] as { id: string; student_id: string; semina: string | null };
  let payload: SessionPayload | null = null;
  try {
    payload = JSON.parse(row.semina || "{}") as SessionPayload;
  } catch {
    payload = null;
  }
  if (!payload?.expires_at || new Date(payload.expires_at).getTime() <= Date.now()) {
    await supabase.from("quiz_participants").delete().eq("id", row.id);
    return null;
  }

  const { data: students } = await supabase
    .from("students")
    .select(
      "id, reg_no, full_name, phone, semina, student_group, course, study_year, academic_year",
    )
    .eq("id", row.student_id)
    .limit(1);
  if (!students || students.length === 0) return null;
  return students[0] as StudentRow;
}

export async function getMyProfile(tokenInput: string): Promise<StudentProfile | null> {
  const student = await resolveSession(tokenInput);
  if (!student) return null;

  const { data } = await supabase
    .from("attendance")
    .select("id, check_in_date, created_at, semina, student_group, distance_m, status")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return {
    fullName: student.full_name,
    regNo: student.reg_no,
    semina: student.semina,
    studentGroup: student.student_group,
    course: student.course,
    studyYear: student.study_year,
    academicYear: student.academic_year,
    attendance: (data as StudentProfile["attendance"]) || [],
  };
}

export async function logoutStudent(tokenInput: string): Promise<void> {
  const token = tokenSchema.safeParse(tokenInput);
  if (!token.success) return;
  await supabase
    .from("quiz_participants")
    .delete()
    .eq("exam_id", SESSION_NS)
    .eq("full_name", await tokenDigest(token.data));
}

/**
 * Issues a fresh PIN for a student, clearing the device binding.
 *
 * This is the recovery path when a student changes phone, and the only way to
 * set a PIN by hand. It is called from the admin area, which is already gated
 * by `admin-session.ts`.
 */
export async function adminSetStudentPin(
  regNoInput: string,
  pinInput: string,
): Promise<{ ok: true; fullName: string } | { ok: false; message: string }> {
  const regNo = regNoSchema.safeParse(regNoInput);
  const pin = pinSchema.safeParse(pinInput);
  if (!regNo.success) return { ok: false, message: "Reg Namba si sahihi" };
  if (!pin.success) return { ok: false, message: "PIN inatakiwa tarakimu 4 hadi 10" };

  const student = await findStudent(regNo.data);
  if (!student) return { ok: false, message: "Reg Namba haijasajiliwa" };

  const existing = await readPinRow(student.id);
  const salt = newSalt();
  const payload: PinPayload = {
    v: 1,
    t: "pin",
    salt,
    hash: await hashSecret(pin.data, salt),
    // No device binding: the student will sign in from their new phone.
    device: null,
    fail: 0,
    locked_until: null,
  };

  const stored = await writePinRow(student, payload, existing?.id);
  if (!stored) return { ok: false, message: "Imeshindikana kuhifadhi PIN" };
  return { ok: true, fullName: student.full_name };
}

/** Whether a student already holds a PIN, for the admin table. */
export async function studentHasPin(studentId: string): Promise<boolean> {
  return (await readPinRow(studentId)) !== null;
}

/**
 * The signed-in student behind a token, for callers that need the identity
 * (attendance, for example) without the full profile.
 */
export async function resolveStudentToken(tokenInput: string): Promise<{
  id: string;
  regNo: string;
  fullName: string;
  semina: string | null;
  studentGroup: string | null;
} | null> {
  const student = await resolveSession(tokenInput);
  if (!student) return null;
  return {
    id: student.id,
    regNo: student.reg_no,
    fullName: student.full_name,
    semina: student.semina,
    studentGroup: student.student_group,
  };
}

function currentDeviceId(): string {
  // One device identity for the whole app, so the value bound at claim time is
  // the same one presented at sign-in.
  return getDeviceId() || "server";
}
