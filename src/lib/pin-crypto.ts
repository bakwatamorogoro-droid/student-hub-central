/**
 * PIN and token cryptography.
 *
 * Why this exists: the publishable key ships inside the JavaScript bundle, and
 * the project has no service-role key, so the browser can read and write the
 * public tables directly. A PIN therefore cannot be stored as plain text or as
 * a bare SHA-256 — anyone holding the key could read it straight out of the
 * database.
 *
 * Instead the PIN is stretched with PBKDF2-SHA256 (210 000 iterations, the OWASP
 * figure for that PRF) over a per-row random salt. Reading the stored value
 * still does not reveal the PIN, so the four-digit space is not brute-forced in
 * one pass. The sign-in token is never stored at all: only its SHA-256 digest
 * is, so a leaked row cannot be replayed as a session.
 *
 * These primitives are pure and run identically in the browser and in Node, so
 * they are covered by `node --test src/lib/pin-crypto.test.ts`.
 */

const PBKDF2_ITERATIONS = 210_000;
const SALT_BYTES = 16;
const TOKEN_BYTES = 32;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/**
 * A random UUIDv4.
 *
 * Used instead of `crypto.randomUUID()` so the app does not depend on a secure
 * context, and instead of `gen_random_uuid()` so the value is known before the
 * insert — `quiz_participants` keys rows by `student_id`, and the session needs
 * to key its own row by itself.
 */
export function randomUuid(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return formatUuid(bytes);
}

/**
 * A UUID derived from a string, so the same input always gives the same UUID.
 *
 * `quiz_participants` allows one row per `(exam_id, student_id)`. Deriving the
 * id from "student + session" therefore enforces exactly one row per student
 * per session — the check-in rule — without needing a new unique index.
 */
export async function deterministicUuid(input: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(input)));
  return formatUuid(digest.slice(0, 16));
}

function formatUuid(bytes: Uint8Array): string {
  const b = bytes.slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** A fresh per-row salt. Stored next to the hash, so it is not secret. */
export function newSalt(): string {
  return randomBase64Url(SALT_BYTES);
}

/**
 * Stretches a PIN over a salt. The salt is part of the derivation, so two
 * students who choose the same PIN do not share a hash.
 */
export async function hashSecret(secret: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: encoder.encode(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return toBase64Url(new Uint8Array(bits));
}

/** Compares two digests without leaking, through timing, how far they matched. */
export function digestsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A new sign-in token. Only its digest is persisted. */
export function newSessionToken(): string {
  return randomBase64Url(TOKEN_BYTES);
}

/** The digest stored in place of the token. */
export async function tokenDigest(token: string): Promise<string> {
  const bits = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return toBase64Url(new Uint8Array(bits));
}

/**
 * Binds a claimed PIN to the device that claimed it.
 *
 * The device id is salted and stretched like a PIN so the raw value is not
 * readable in the shared table, though it is only a deterrent: the id lives in
 * localStorage, so a determined student can copy it. Its real job is to stop a
 * PIN being passed around a classroom by word of mouth.
 */
export async function hashDeviceId(deviceId: string, salt: string): Promise<string> {
  return hashSecret(deviceId, "device:" + salt);
}

const PIN_ALPHABET = "0123456789";

/** A random PIN of the requested length. Never chosen by the student. */
export function generatePin(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += PIN_ALPHABET[b % PIN_ALPHABET.length];
  return out;
}

/**
 * Normalises a Tanzanian mobile number so `0699105527`, `+255699105527` and
 * `255699105527` all compare equal. Returns null when nothing usable is left.
 */
export function normalizePhone(input: string): string | null {
  const digits = (input || "").replace(/[^0-9]/g, "");
  if (!digits) return null;
  if (digits.startsWith("255") && digits.length === 12) return "0" + digits.slice(3);
  if (digits.startsWith("0") && digits.length === 10) return digits;
  // A bare 9-digit subscriber number is the common shorthand for 0XXXXXXXXX.
  if (digits.length === 9) return "0" + digits;
  return digits.length >= 7 ? digits : null;
}
