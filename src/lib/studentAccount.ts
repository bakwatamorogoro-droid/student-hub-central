import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device-id";
import { canonicalRegNo } from "@/lib/regNo";
import { deriveVerificationCode } from "@/lib/verificationCode";
import { z } from "zod";
import {
  clearedPinPayload,
  needsUnlock,
  pinLockFromPayload,
  type PinLockState,
} from "@/lib/pinLock";
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

  return mintSession(student, deviceHash);
}

/**
 * Mints a session row for a student who has already been proved.
 *
 * Shared by the PIN path and the phone path so both mint exactly the same kind
 * of session: one live session per student, only the token's digest stored, and
 * the device the session was created on recorded so a later check can see it.
 */
async function mintSession(student: StudentRow, deviceHash: string): Promise<LoginResult> {
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

/**
 * A short, human-readable code that confirms *this* pair of details.
 *
 * It is derived, never stored: the same Reg Namba and phone always produce the
 * same code, so the student can read it aloud and the office can recompute it
 * from the roster alone. It is a receipt, not a secret — it proves the two
 * details were accepted together, and nothing more.
 */
export async function verificationCodeFor(regNoInput: string, phoneInput: string): Promise<string> {
  const canon = canonicalRegNo(regNoInput);
  const phone = normalizePhone(phoneInput) ?? "";
  const digest = await tokenDigest(`verify:${canon}:${phone}`);
  return deriveVerificationCode(digest);
}

/**
 * Signs a student in with the phone number the school holds for them.
 *
 * This is the shortcut for a phone that was never given a PIN. The number on
 * file is the shared secret the school and the student both know, so a match is
 * treated as proof of identity and a session is minted, exactly as the PIN path
 * does. The device binding the PIN path writes is deliberately *not* applied
 * here: the whole point is that a student can use a phone they have not used
 * before, and locking the account to it would defeat that.
 */
export async function loginStudentByPhone(
  regNoInput: string,
  phoneInput: string,
): Promise<
  | { ok: true; token: string; fullName: string }
  | { ok: false; reason: "bad_credentials" | "no_phone" }
> {
  const regNo = regNoSchema.safeParse(regNoInput);
  const phone = z.string().trim().min(7).max(20).safeParse(phoneInput);
  if (!regNo.success || !phone.success) return { ok: false, reason: "bad_credentials" };

  const student = await findStudent(regNo.data);
  if (!student) return { ok: false, reason: "bad_credentials" };

  const onFile = normalizePhone(student.phone || "");
  const offered = normalizePhone(phone.data);
  if (!onFile) return { ok: false, reason: "no_phone" };
  if (!offered || onFile !== offered) return { ok: false, reason: "bad_credentials" };

  const session = await mintSession(
    student,
    await hashDeviceId(currentDeviceId(), "phone-session"),
  );
  if (!session.ok) return { ok: false, reason: "bad_credentials" };
  return { ok: true, token: session.token, fullName: session.fullName };
}

/**
 * Mints an attendance session from the Reg Namba alone.
 *
 * The owner removed the phone confirmation from the attendance flow: the QR says
 * which session, the Reg Namba says who, and the face step proves a live person
 * is there. The phone was the second secret, and without it the Reg Namba is the
 * only thing between a stranger and this student's session.
 *
 * That is a deliberate trade the owner asked for, and it is worth stating plainly
 * because it is a real weakening: anyone who knows a classmate's Reg Namba can
 * mint a session for them. The face step does not close that gap — it is liveness,
 * not recognition, so it proves a live person is present, not that the person is
 * the student whose number was typed. What keeps it honest is the room: the QR
 * rotates and is only available in the lecture, and the invigilator is watching.
 *
 * Kept separate from `loginStudentByPhone` so the phone path stays available and
 * the weaker path is a thing someone chose, not a default that leaked everywhere.
 */
export async function loginStudentForAttendance(
  regNoInput: string,
): Promise<
  | { ok: true; token: string; fullName: string }
  | { ok: false; reason: "bad_credentials" | "not_ready" }
> {
  const regNo = regNoSchema.safeParse(regNoInput);
  if (!regNo.success) return { ok: false, reason: "bad_credentials" };

  const student = await findStudent(regNo.data);
  if (!student) return { ok: false, reason: "bad_credentials" };

  const session = await mintSession(
    student,
    await hashDeviceId(currentDeviceId(), "attendance-session"),
  );
  if (!session.ok) return { ok: false, reason: "not_ready" };
  return { ok: true, token: session.token, fullName: session.fullName };
}

/**
 * Confirms a Reg Namba and the phone on file, without signing anyone in.
 *
 * The results page needs "is this really this student?" but must not create a
 * session or bind the phone: a student checking marks on a friend's phone
 * should not disturb anything. So this only compares the two details.
 */
export async function verifyStudentByPhone(
  regNoInput: string,
  phoneInput: string,
): Promise<
  | { ok: true; regNo: string; fullName: string; code: string }
  | { ok: false; reason: "bad_credentials" | "no_phone" }
> {
  const regNo = regNoSchema.safeParse(regNoInput);
  const phone = z.string().trim().min(7).max(20).safeParse(phoneInput);
  if (!regNo.success || !phone.success) return { ok: false, reason: "bad_credentials" };

  const student = await findStudent(regNo.data);
  if (!student) return { ok: false, reason: "bad_credentials" };

  const onFile = normalizePhone(student.phone || "");
  const offered = normalizePhone(phone.data);
  if (!onFile) return { ok: false, reason: "no_phone" };
  if (!offered || onFile !== offered) return { ok: false, reason: "bad_credentials" };

  return {
    ok: true,
    regNo: student.reg_no,
    fullName: student.full_name,
    code: await verificationCodeFor(student.reg_no, phone.data),
  };
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

/**
 * Confirms a student's PIN without signing them in.
 *
 * The results page needs to know "is this really this student?" but must not
 * bind the phone: a student checking marks on a friend's phone should not
 * invalidate their own session, and should not be locked to that friend's
 * device. So this checks the PIN and counts failures, but creates no session
 * and never touches the device binding that `loginStudent` writes.
 */
export async function verifyStudentPin(
  regNoInput: string,
  pinInput: string,
): Promise<
  | { ok: true; regNo: string; fullName: string }
  | { ok: false; reason: "bad_credentials" | "locked" | "not_ready" }
> {
  const regNo = regNoSchema.safeParse(regNoInput);
  const pin = pinSchema.safeParse(pinInput);
  if (!regNo.success || !pin.success) return { ok: false, reason: "bad_credentials" };

  const student = await findStudent(regNo.data);
  if (!student) return { ok: false, reason: "bad_credentials" };

  const row = await readPinRow(student.id);
  if (!row) return { ok: false, reason: "bad_credentials" };

  const { payload } = row;
  if (payload.locked_until && new Date(payload.locked_until).getTime() > Date.now()) {
    return { ok: false, reason: "locked" };
  }

  const supplied = await hashSecret(pin.data, payload.salt);
  if (!digestsEqual(supplied, payload.hash)) {
    const fail = (payload.fail || 0) + 1;
    const next: PinPayload = {
      ...payload,
      fail: fail >= MAX_FAILS ? 0 : fail,
      locked_until:
        fail >= MAX_FAILS
          ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
          : (payload.locked_until ?? null),
    };
    await writePinRow(student, next, row.id);
    return { ok: false, reason: fail >= MAX_FAILS ? "locked" : "bad_credentials" };
  }

  if (payload.fail !== 0 || payload.locked_until) {
    await writePinRow(student, { ...payload, fail: 0, locked_until: null }, row.id);
  }

  return { ok: true, regNo: student.reg_no, fullName: student.full_name };
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
 * A student's PIN state, read by Reg Namba, for the CR's list.
 *
 * The CR decides from this whether there is anything to open: a locked row or one
 * bound to another phone is the case they are there for, and a healthy row is not.
 * The PIN itself is never returned — only the salt-and-hash-free state.
 */
export async function studentPinState(
  regNoInput: string,
): Promise<
  | { ok: true; fullName: string; regNo: string; state: PinLockState }
  | { ok: false; message: string }
> {
  const regNo = regNoSchema.safeParse(regNoInput);
  if (!regNo.success) return { ok: false, message: "Reg Namba si sahihi" };

  const student = await findStudent(regNo.data);
  if (!student) return { ok: false, message: "Reg Namba haijasajiliwa" };

  const row = await readPinRow(student.id);
  return {
    ok: true,
    fullName: student.full_name,
    regNo: student.reg_no,
    state: pinLockFromPayload(row?.payload),
  };
}

/**
 * Opens a student's account so they can sign in and change their own PIN.
 *
 * This is the CR's one job. It clears the lockout and the failed-attempt count,
 * and signs out every live session. It deliberately does not touch the salt, the
 * hash, or the device binding: the student keeps the PIN they know, the
 * anti-sharing rule that stops a PIN being passed around a classroom survives,
 * and changing the PIN stays the student's own action on `/account`. Handing out
 * a new PIN from here would let a CR read a classmate's secret, which is not what
 * opening an account means.
 *
 * `clearedPinPayload` owns the shape of the cleared row, so the rule is testable
 * without a database — see `pinLock.test.ts`.
 */
export async function crUnlockStudentPin(
  regNoInput: string,
): Promise<
  { ok: true; fullName: string; regNo: string; changed: boolean } | { ok: false; message: string }
> {
  const regNo = regNoSchema.safeParse(regNoInput);
  if (!regNo.success) return { ok: false, message: "Reg Namba si sahihi" };

  const student = await findStudent(regNo.data);
  if (!student) return { ok: false, message: "Reg Namba haijasajiliwa" };

  const row = await readPinRow(student.id);
  if (!row) return { ok: false, message: "Mwanafunzi hana PIN bado" };

  const state = pinLockFromPayload(row.payload);
  if (!needsUnlock(state)) {
    // Nothing to clear. Say so rather than writing an identical row, which would
    // only churn the record and sign the student out for no reason.
    return { ok: true, fullName: student.full_name, regNo: student.reg_no, changed: false };
  }

  const stored = await writePinRow(student, clearedPinPayload(row.payload) as PinPayload, row.id);
  if (!stored) return { ok: false, message: "Imeshindikana kufungua akaunti" };

  // A lockout and a live session are the same problem seen twice: the student is
  // outside. Clearing the sessions too means the reopened PIN works immediately
  // instead of losing to a token minted before the lock.
  await clearSessions(student.id);

  return { ok: true, fullName: student.full_name, regNo: student.reg_no, changed: true };
}

/**
 * Changes the signed-in student's own PIN, after proving the old one.
 *
 * This is the half the student owns: the CR opens the account, the student picks a
 * new PIN. Proving the old PIN first means a stolen session token alone cannot
 * lock the owner out of their own account.
 *
 * The new PIN is bound to the current device, matching `claimStudentPin`, so the
 * student can sign in from where they changed it.
 */
export async function changeOwnPin(
  tokenInput: string,
  oldPinInput: string,
  newPinInput: string,
): Promise<
  { ok: true } | { ok: false; reason: "bad_credentials" | "locked" | "weak" | "not_ready" }
> {
  const token = tokenSchema.safeParse(tokenInput);
  if (!token.success) return { ok: false, reason: "not_ready" };

  const oldPin = pinSchema.safeParse(oldPinInput);
  const newPin = pinSchema.safeParse(newPinInput);
  if (!newPin.success) return { ok: false, reason: "weak" };
  if (!oldPin.success) return { ok: false, reason: "bad_credentials" };

  const student = await resolveSession(token.data);
  if (!student) return { ok: false, reason: "not_ready" };

  const row = await readPinRow(student.id);
  if (!row) return { ok: false, reason: "bad_credentials" };

  const { payload } = row;
  if (payload.locked_until && new Date(payload.locked_until).getTime() > Date.now()) {
    return { ok: false, reason: "locked" };
  }

  const supplied = await hashSecret(oldPin.data, payload.salt);
  if (!digestsEqual(supplied, payload.hash)) {
    const fail = (payload.fail || 0) + 1;
    await writePinRow(
      student,
      {
        ...payload,
        fail: fail >= MAX_FAILS ? 0 : fail,
        locked_until:
          fail >= MAX_FAILS
            ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
            : (payload.locked_until ?? null),
      },
      row.id,
    );
    return { ok: false, reason: fail >= MAX_FAILS ? "locked" : "bad_credentials" };
  }

  if (newPin.data === oldPin.data) return { ok: false, reason: "weak" };

  const salt = newSalt();
  const next: PinPayload = {
    v: 1,
    t: "pin",
    salt,
    hash: await hashSecret(newPin.data, salt),
    // Bind to the phone the change was made from, the same rule as a fresh claim.
    device: await hashDeviceId(currentDeviceId(), salt),
    fail: 0,
    locked_until: null,
  };
  const stored = await writePinRow(student, next, row.id);
  if (!stored) return { ok: false, reason: "not_ready" };

  // Every other device's session was minted against the old PIN, so the change
  // signs them out. The caller re-signs in with the new PIN.
  await clearSessions(student.id);
  return { ok: true };
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
