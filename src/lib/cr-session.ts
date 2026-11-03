import { crCredentialsMatch } from "@/lib/crAccess";
import { randomUuid } from "@/lib/pin-crypto";
import { storageGet, storageSet, storageRemove } from "@/lib/safe-storage";

/**
 * The CR's sign-in state. See `crLogin` for what this does and does not protect.
 *
 * A separate key from the admin's, on purpose: a CR who signs in must not be
 * signed in as an admin, and the two screens read different flags. See
 * `crAccess.ts` for why the credentials are fixed and what the gate is worth.
 */
const KEY = "cr_session_token";

export function getCrToken(): string | null {
  if (typeof window === "undefined") return null;
  return storageGet(KEY);
}

export function isCr(): boolean {
  return getCrToken() !== null;
}

/**
 * Checks the CR credentials and remembers that the screen is unlocked.
 *
 * `randomUuid()` rather than `crypto.randomUUID()` for the same reason as the
 * admin's: the latter needs a secure context and throws over plain HTTP, which
 * would reject the correct pair on a LAN preview or an older phone.
 */
export function crLogin(username: string, password: string): boolean {
  if (!crCredentialsMatch(username, password)) return false;
  storageSet(KEY, randomUuid());
  return true;
}

export function crLogout(): void {
  storageRemove(KEY);
}
