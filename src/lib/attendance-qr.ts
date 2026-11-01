/**
 * The QR payload formats, with no Supabase dependency so they can be unit
 * tested under `node --test` (the attendance module reads `import.meta.env` at
 * module scope and cannot load there).
 *
 * Two payloads exist because they answer two different questions:
 *
 *   ISL-ATT1:<token>   a token that rotates every 25 s, shown on the teacher's
 *                      screen. Short-lived, so a screenshot is worthless.
 *   ISL-JOIN1:<code>   the session's join code, stable for as long as the
 *                      session is open. This is what a printed poster carries,
 *                      because a token would be dead before it reached the wall.
 *
 * Both are also encoded as **links to this site** rather than as bare text.
 * That is the point of the `encodeJoinUrl` / `encodeTokenUrl` helpers: a student
 * holding nothing but the phone's own camera app scans the poster and the phone
 * offers to open `/attendance?join=…`, so no app of ours is needed to read it. A
 * bare `ISL-JOIN1:K7M2QX` means nothing to a generic scanner.
 *
 * The legacy prefixes are still decoded, because posters already on a wall carry
 * them and must keep working.
 */

const QR_PREFIX = "ISL-ATT1:";
const JOIN_PREFIX = "ISL-JOIN1:";

/** Query keys the site reads back. Kept short: the token one sits in a QR code. */
const JOIN_PARAM = "join";
const TOKEN_PARAM = "t";

/** Where the attendance page lives, relative to the site root. */
const ATTENDANCE_PATH = "/attendance";

/** Wraps a raw token so a scan of an unrelated QR code is rejected outright. */
export function encodeQrToken(token: string): string {
  return QR_PREFIX + token;
}

export function decodeQrToken(raw: string): string | null {
  const text = (raw || "").trim();
  if (!text.startsWith(QR_PREFIX)) return null;
  const token = text.slice(QR_PREFIX.length).trim();
  return token.length >= 20 ? token : null;
}

export function encodeJoinQr(joinCode: string): string {
  return JOIN_PREFIX + joinCode.trim().toUpperCase();
}

export function decodeJoinQr(raw: string): string | null {
  const text = (raw || "").trim();
  if (!text.startsWith(JOIN_PREFIX)) return null;
  const code = text.slice(JOIN_PREFIX.length).trim().toUpperCase();
  return /^[A-Z0-9]{4,12}$/.test(code) ? code : null;
}

/**
 * The poster's payload: a link the phone's own camera app can open.
 *
 * `origin` is passed in rather than read from `window` so this module stays
 * loadable under `node --test`.
 */
export function encodeJoinUrl(joinCode: string, origin: string): string {
  const code = joinCode.trim().toUpperCase();
  return `${trimOrigin(origin)}${ATTENDANCE_PATH}?${JOIN_PARAM}=${encodeURIComponent(code)}`;
}

/** The live screen's payload: the rotating token, as an openable link. */
export function encodeTokenUrl(token: string, origin: string): string {
  return `${trimOrigin(origin)}${ATTENDANCE_PATH}?${TOKEN_PARAM}=${encodeURIComponent(token.trim())}`;
}

export type ScannedAttendance =
  | { kind: "join"; joinCode: string }
  | { kind: "token"; token: string };

/**
 * Reads whatever a scanner handed back and says what it means.
 *
 * Accepts a link (either parameter), the legacy bare payloads, and a bare join
 * code typed by hand — a student who reads the poster aloud should not be
 * defeated by the QR having a link in it.
 */
export function parseAttendanceQr(raw: string): ScannedAttendance | null {
  const text = (raw || "").trim();
  if (!text) return null;

  const join = decodeJoinQr(text);
  if (join) return { kind: "join", joinCode: join };

  const token = decodeQrToken(text);
  if (token) return { kind: "token", token };

  const fromUrl = parseAttendanceUrl(text);
  if (fromUrl) return fromUrl;

  // A bare code, as read off the printed sheet.
  const bare = text.toUpperCase();
  if (/^[A-Z0-9]{4,12}$/.test(bare)) return { kind: "join", joinCode: bare };

  return null;
}

/** Pulls `join` or `t` out of a link, whatever host it points at. */
function parseAttendanceUrl(text: string): ScannedAttendance | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }

  const joinCode = (url.searchParams.get(JOIN_PARAM) || "").trim().toUpperCase();
  if (/^[A-Z0-9]{4,12}$/.test(joinCode)) return { kind: "join", joinCode };

  const token = (url.searchParams.get(TOKEN_PARAM) || "").trim();
  if (token.length >= 20) return { kind: "token", token };

  return null;
}

/** Strips a trailing slash so the path is never doubled. */
function trimOrigin(origin: string): string {
  return (origin || "").replace(/\/+$/, "");
}
