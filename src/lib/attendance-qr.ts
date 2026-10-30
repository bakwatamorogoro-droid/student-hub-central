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
 * The prefix is what makes a scan of an unrelated QR code fail fast instead of
 * being sent to the server as a guess.
 */

const QR_PREFIX = "ISL-ATT1:";
const JOIN_PREFIX = "ISL-JOIN1:";

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
