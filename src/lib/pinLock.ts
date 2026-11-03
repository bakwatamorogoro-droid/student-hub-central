/**
 * What a stored PIN row says about whether a student can sign in.
 *
 * A student locks themselves out by typing the wrong PIN `MAX_FAILS` times, and a
 * PIN is bound to the phone it was claimed on. Either one leaves a student who is
 * not at fault stuck outside — and a student who cannot sign in cannot correct
 * anything, which is the whole reason the CR has a screen. So the CR's one job,
 * opening an account, has to clear this state as well as grant the edit.
 *
 * Pure and import-free so `node --test` pins the reading of a row before any of
 * it is wired to the database. `studentAccount.ts` owns the row and calls in
 * here; `pinLock.test.ts` pins the rules.
 */

/** The parts of a stored PIN payload this module reads. */
export type PinPayloadLike =
  | {
      fail?: number | null;
      locked_until?: string | null;
      device?: string | null;
    }
  | null
  | undefined;

export type PinLockState = {
  /** Whether the student has claimed a PIN at all. */
  hasPin: boolean;
  /** Locked out right now, i.e. `locked_until` is still in the future. */
  locked: boolean;
  /** The raw lockout time, so a caller can show it. */
  lockedUntil: string | null;
  /** Wrong attempts since the last successful sign-in. */
  fails: number;
  /** Whether the PIN is tied to the phone it was claimed on. */
  deviceBound: boolean;
};

/**
 * Reads a stored payload into a state.
 *
 * An expired `locked_until` is not a lock: the student can sign in again, and
 * calling it locked would send the CR to fix something that is not broken. `now`
 * is injectable so the boundary can be tested without waiting 15 minutes.
 */
export function pinLockFromPayload(
  payload: PinPayloadLike,
  now: number = Date.now(),
): PinLockState {
  if (!payload) {
    return { hasPin: false, locked: false, lockedUntil: null, fails: 0, deviceBound: false };
  }
  const lockedUntil = payload.locked_until ?? null;
  const locked = !!lockedUntil && new Date(lockedUntil).getTime() > now;
  return {
    hasPin: true,
    locked,
    lockedUntil,
    fails: payload.fail ?? 0,
    deviceBound: !!payload.device,
  };
}

/**
 * True when opening this account would actually change something.
 *
 * A device binding is deliberately *not* counted. It is the normal state of a
 * claimed PIN, and it is the one thing that stops a PIN being passed around a
 * classroom; clearing it on every CR press would quietly disable that. A student
 * who changed phone has two paths already — their own "Sahau PIN" tab, which
 * re-binds to the new phone, and the admin's set-PIN. The CR is for the student
 * who is shut out, which is a lockout or a pile of failed attempts.
 */
export function needsUnlock(state: PinLockState): boolean {
  return state.hasPin && (state.locked || state.fails > 0);
}

/**
 * The payload with the lock and the attempt count cleared.
 *
 * The salt and hash are carried through untouched: opening an account is not a
 * password change, so the student keeps the PIN they already know. `device` is
 * left alone too, so the anti-sharing binding survives the CR's help.
 */
export function clearedPinPayload<T extends PinPayloadLike>(payload: T): T {
  if (!payload) return payload;
  return { ...payload, fail: 0, locked_until: null };
}

/** A short Swahili label for the row, so the CR reads the state at a glance. */
export function pinLockLabel(state: PinLockState): string {
  if (!state.hasPin) return "Hana PIN bado";
  if (state.locked) return "Imefungwa (PIN makosa)";
  if (state.deviceBound) return "Imefungwa kwenye simu nyingine";
  if (state.fails > 0) return "Makosa yaliyopita";
  return "Iko sawa";
}
