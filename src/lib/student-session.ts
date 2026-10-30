/**
 * Holds the sign-in token minted by student_login().
 *
 * localStorage is acceptable here because the token is only useful together
 * with a live row in student_sessions, and the server can revoke it at any
 * time. It never contains a PIN or a password.
 */
const KEY = "student_session_token";

export function getStudentToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setStudentToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, token);
}

export function clearStudentToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}
