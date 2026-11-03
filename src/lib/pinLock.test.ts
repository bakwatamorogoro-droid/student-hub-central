import { test } from "node:test";
import assert from "node:assert/strict";
import { clearedPinPayload, needsUnlock, pinLockFromPayload, pinLockLabel } from "./pinLock.ts";

const NOW = Date.parse("2026-11-03T12:00:00.000Z");

test("no payload means no PIN at all", () => {
  const s = pinLockFromPayload(null, NOW);
  assert.equal(s.hasPin, false);
  assert.equal(s.locked, false);
  assert.equal(needsUnlock(s), false);
});

test("a healthy row is not locked and needs no unlock", () => {
  const s = pinLockFromPayload({ fail: 0, locked_until: null, device: "abc" }, NOW);
  assert.equal(s.hasPin, true);
  assert.equal(s.locked, false);
  // A device binding is the normal state of a claimed PIN and the one thing that
  // stops a PIN being shared around a classroom, so it is not a fault and does
  // not on its own send the CR to the rescue.
  assert.equal(s.deviceBound, true);
  assert.equal(needsUnlock(s), false);
});

test("a lock in the future is a lock", () => {
  const until = new Date(NOW + 60_000).toISOString();
  const s = pinLockFromPayload({ fail: 0, locked_until: until, device: null }, NOW);
  assert.equal(s.locked, true);
  assert.equal(s.lockedUntil, until);
  assert.equal(needsUnlock(s), true);
});

test("a lock in the past is not a lock, so the CR is not sent on a wasted errand", () => {
  const until = new Date(NOW - 1).toISOString();
  const s = pinLockFromPayload({ fail: 0, locked_until: until, device: null }, NOW);
  assert.equal(s.locked, false);
  assert.equal(needsUnlock(s), false);
});

test("counted failures alone ask for an unlock", () => {
  const s = pinLockFromPayload({ fail: 3, locked_until: null, device: null }, NOW);
  assert.equal(s.fails, 3);
  assert.equal(needsUnlock(s), true);
});

test("clearing keeps the secret and the phone binding, and drops the lock and the count", () => {
  const payload = {
    v: 1 as const,
    t: "pin" as const,
    salt: "s",
    hash: "h",
    device: "phone",
    fail: 5,
    locked_until: new Date(NOW + 60_000).toISOString(),
  };
  const cleared = clearedPinPayload(payload);
  assert.equal(cleared.salt, "s");
  assert.equal(cleared.hash, "h");
  assert.equal(cleared.fail, 0);
  assert.equal(cleared.locked_until, null);
  // The binding survives, so helping one student does not weaken the anti-sharing
  // rule for everyone they could hand their PIN to.
  assert.equal(cleared.device, "phone");
  // The original is untouched: this is a copy, not a mutation.
  assert.equal(payload.locked_until !== null, true);
});

test("clearing nothing is still nothing", () => {
  assert.equal(clearedPinPayload(null), null);
});

test("the label names the state a CR is looking at", () => {
  assert.equal(pinLockLabel(pinLockFromPayload(null, NOW)), "Hana PIN bado");
  assert.equal(
    pinLockLabel(pinLockFromPayload({ locked_until: new Date(NOW + 1000).toISOString() }, NOW)),
    "Imefungwa (PIN makosa)",
  );
  assert.equal(
    pinLockLabel(pinLockFromPayload({ fail: 0, device: "d" }, NOW)),
    "Imefungwa kwenye simu nyingine",
  );
  assert.equal(
    pinLockLabel(pinLockFromPayload({ fail: 1, device: null }, NOW)),
    "Makosa yaliyopita",
  );
  assert.equal(pinLockLabel(pinLockFromPayload({ fail: 0, device: null }, NOW)), "Iko sawa");
});
