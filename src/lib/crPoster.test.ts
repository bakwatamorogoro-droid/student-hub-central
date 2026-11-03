import test from "node:test";
import assert from "node:assert/strict";
import { crPosterDecision, crPosterReason, type PosterSessionLike } from "./crPoster.ts";

const open = (over: Partial<PosterSessionLike> = {}): PosterSessionLike => ({
  title: "Fiqh — Somo la 4",
  joinCode: "K7M2QX",
  crQrAllowed: true,
  active: true,
  ...over,
});

test("an allowed, open session with a code may be printed", () => {
  assert.deepEqual(crPosterDecision(open()), { ok: true });
});

test("a session the owner has not opened is refused", () => {
  assert.deepEqual(crPosterDecision(open({ crQrAllowed: false })), {
    ok: false,
    reason: "not_allowed",
  });
});

test("permission does not outlive the session", () => {
  // The flag is still set, but the code is no longer accepted, so a printed
  // sheet would scan into a closed session.
  assert.deepEqual(crPosterDecision(open({ active: false })), { ok: false, reason: "closed" });
});

test("a session with no join code is refused, however it is flagged", () => {
  assert.deepEqual(crPosterDecision(open({ joinCode: null })), { ok: false, reason: "no_code" });
  assert.deepEqual(crPosterDecision(open({ joinCode: "" })), { ok: false, reason: "no_code" });
});

test("refusals come in a fixed order, so the reason is stable", () => {
  // Not allowed is reported before closed and before no-code: the owner's
  // switch is the first thing to check and the one the CR can act on.
  assert.deepEqual(crPosterDecision({ title: "x", joinCode: null, crQrAllowed: false }), {
    ok: false,
    reason: "not_allowed",
  });
  assert.deepEqual(crPosterDecision({ title: "x", joinCode: null, crQrAllowed: true }), {
    ok: false,
    reason: "no_code",
  });
});

test("every reason has words a CR can read", () => {
  for (const reason of ["not_allowed", "closed", "no_code"] as const) {
    assert.ok(crPosterReason(reason).length > 0);
  }
});
