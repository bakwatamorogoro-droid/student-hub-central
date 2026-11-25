/**
 * The exam clock.
 *
 * Remaining time is derived from a fixed deadline rather than by decrementing a
 * counter. Browsers throttle timers in a background tab to roughly once a
 * minute, so a decremented counter loses real minutes whenever a student
 * switches apps or the screen sleeps — the clock would show time the student no
 * longer has. Reading `Date.now()` against the deadline is correct however
 * irregularly the ticks arrive.
 */

/** Below this the clock draws attention. Five minutes is a last-answers window. */
export const URGENT_BELOW_SECONDS = 300;

export type Countdown = {
  /** Whole seconds left, never negative. */
  totalSeconds: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** `HH:MM:SS`, hours padded to two digits but never truncated. */
  clock: string;
  urgent: boolean;
  expired: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Splits a second count into the parts a clock face needs. */
function splitSeconds(totalSeconds: number): Countdown {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  return {
    totalSeconds: safe,
    hours: Math.floor(safe / 3600),
    minutes: Math.floor((safe % 3600) / 60),
    seconds: safe % 60,
    clock: `${pad(Math.floor(safe / 3600))}:${pad(Math.floor((safe % 3600) / 60))}:${pad(safe % 60)}`,
    urgent: safe > 0 && safe <= URGENT_BELOW_SECONDS,
    expired: safe === 0,
  };
}

/** The clock for a plain second count, which is what the page holds in state. */
export function countdownSeconds(totalSeconds: number): Countdown {
  return splitSeconds(totalSeconds);
}
