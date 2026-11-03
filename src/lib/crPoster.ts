/**
 * Whether the CR may print a session's attendance poster, and which one.
 *
 * The owner opens this deliberately, session by session. A new session starts
 * closed, and ending a session closes it again, because the poster only means
 * anything while the join code is still being accepted — a printed sheet for a
 * closed session is a sheet a student would scan into nothing.
 *
 * The rule is kept here, pure and import-free, so `crPoster.test.ts` can pin it
 * without a database and the CR's screen and the admin's switch cannot drift
 * apart on who may print what. `attendance.ts` owns the stored flag and calls in
 * here to decide.
 */

/** The session fields this rule reads. */
export type PosterSessionLike = {
  title: string;
  joinCode: string | null;
  crQrAllowed: boolean;
  /** A closed session is not printable, however the flag reads. */
  active?: boolean;
};

export type PosterDecision =
  | { ok: true }
  | { ok: false; reason: "not_allowed" | "closed" | "no_code" };

/**
 * Whether this session's poster can be printed by the CR right now.
 *
 * Three things have to hold, and each has its own reason so the screen can say
 * which one is missing instead of a blank "not available":
 *
 *  - the owner allowed it (`crQrAllowed`),
 *  - the session is still open (the code is being accepted), and
 *  - there is a join code to encode — a poster with no code is a blank square.
 */
export function crPosterDecision(session: PosterSessionLike): PosterDecision {
  if (!session.crQrAllowed) return { ok: false, reason: "not_allowed" };
  if (session.active === false) return { ok: false, reason: "closed" };
  if (!session.joinCode) return { ok: false, reason: "no_code" };
  return { ok: true };
}

/** A short Swahili reason, so the CR knows what to ask the owner for. */
export function crPosterReason(reason: "not_allowed" | "closed" | "no_code"): string {
  switch (reason) {
    case "not_allowed":
      return "Mwalimu hajaruhusu CR kuchapisha QR ya kipindi hiki bado.";
    case "closed":
      return "Kipindi kimefungwa — QR ya kuchapisha haitumiki tena.";
    case "no_code":
      return "Kipindi hiki hakina msimbo wa kujiunga.";
  }
}
