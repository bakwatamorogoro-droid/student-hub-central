import { test } from "node:test";
import assert from "node:assert/strict";
import { canEdit, hasGrant } from "./editPermission.ts";

test("the global switch alone opens the form", () => {
  assert.equal(canEdit({ globallyEnabled: true, unlockedAt: null }), true);
});

test("a grant alone opens the form while the global switch is off", () => {
  // The case this feature exists for: the admin turned Update Taarifa off for the
  // cohort, then one student saved the wrong group.
  assert.equal(canEdit({ globallyEnabled: false, unlockedAt: "2026-11-03T10:00:00.000Z" }), true);
});

test("neither switch means no edit", () => {
  assert.equal(canEdit({ globallyEnabled: false, unlockedAt: null }), false);
  assert.equal(canEdit({ globallyEnabled: false, unlockedAt: undefined }), false);
});

test("both switches still just means yes", () => {
  assert.equal(canEdit({ globallyEnabled: true, unlockedAt: "2026-11-03T10:00:00.000Z" }), true);
});

test("a grant is visible to the student, and absent when there is none", () => {
  assert.equal(hasGrant({ globallyEnabled: true, unlockedAt: "2026-11-03T10:00:00.000Z" }), true);
  assert.equal(hasGrant({ globallyEnabled: true, unlockedAt: null }), false);
  assert.equal(hasGrant({ globallyEnabled: false, unlockedAt: undefined }), false);
});
