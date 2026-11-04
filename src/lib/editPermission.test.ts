import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GRANT_STATUS,
  canEdit,
  isEditSpent,
  grantFromRows,
  hasGrant,
  isGrantRow,
  requestHistory,
  unlockedAtFor,
  unlockedAtFromRows,
  usedAtFor,
} from "./editPermission.ts";

const STUDENT = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

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

test("the grant is found among the student's own request history", () => {
  const rows = [
    { id: "a", student_id: STUDENT, status: "approved", created_at: "2026-11-01T10:00:00.000Z" },
    { id: "g", student_id: STUDENT, status: GRANT_STATUS, created_at: "2026-11-03T10:00:00.000Z" },
  ];
  assert.equal(grantFromRows(rows, STUDENT)?.id, "g");
  assert.equal(unlockedAtFromRows(rows, STUDENT), "2026-11-03T10:00:00.000Z");
});

test("another student's grant is never read as mine", () => {
  const rows = [
    { id: "g", student_id: OTHER, status: GRANT_STATUS, created_at: "2026-11-03T10:00:00.000Z" },
  ];
  assert.equal(grantFromRows(rows, STUDENT), null);
  assert.equal(unlockedAtFromRows(rows, STUDENT), null);
  assert.equal(
    canEdit({ globallyEnabled: false, unlockedAt: unlockedAtFromRows(rows, STUDENT) }),
    false,
  );
});

test("the newest grant wins, so a duplicate is harmless", () => {
  const rows = [
    {
      id: "old",
      student_id: STUDENT,
      status: GRANT_STATUS,
      created_at: "2026-11-02T10:00:00.000Z",
    },
    {
      id: "new",
      student_id: STUDENT,
      status: GRANT_STATUS,
      created_at: "2026-11-03T10:00:00.000Z",
    },
  ];
  assert.equal(grantFromRows(rows, STUDENT)?.id, "new");
});

test("a spent grant reads as absent", () => {
  const rows = [
    { id: "g", student_id: STUDENT, status: GRANT_STATUS, created_at: "2026-11-03T10:00:00.000Z" },
  ];
  // Spending deletes the row, so the page simply sees no grant.
  assert.equal(unlockedAtFromRows([], STUDENT), null);
  assert.equal(grantFromRows(rows, STUDENT)?.id, "g");
});

test("grant rows are not shown to the student as their own corrections", () => {
  const rows = [
    { id: "a", student_id: STUDENT, status: "approved", created_at: "2026-11-01T10:00:00.000Z" },
    { id: "g", student_id: STUDENT, status: GRANT_STATUS, created_at: "2026-11-03T10:00:00.000Z" },
  ];
  assert.deepEqual(
    requestHistory(rows).map((r) => r.id),
    ["a"],
  );
});

test("isGrantRow only matches the grant status", () => {
  assert.equal(isGrantRow({ status: GRANT_STATUS }), true);
  assert.equal(isGrantRow({ status: "approved" }), false);
  assert.equal(isGrantRow(null), false);
});

test("missing input is not a grant", () => {
  assert.equal(grantFromRows(null, STUDENT), null);
  assert.equal(grantFromRows([], STUDENT), null);
  assert.equal(grantFromRows([{ student_id: STUDENT, status: GRANT_STATUS }], null), null);
});

test("the grant column is read straight off the student row", () => {
  // After `20261104120000_student_edit_grant.sql` the grant is a column, and the page
  // already holds the row, so no request rows are needed.
  assert.equal(
    unlockedAtFor({ id: STUDENT, edit_unlocked_at: "2026-11-04T09:00:00.000Z" }, []),
    "2026-11-04T09:00:00.000Z",
  );
});

test("the grant row is the fallback when the column is absent", () => {
  // Before the migration the column does not exist, so the row the page already fetches
  // for the history carries the grant instead.
  const rows = [
    { id: "g", student_id: STUDENT, status: GRANT_STATUS, created_at: "2026-11-04T09:00:00.000Z" },
  ];
  assert.equal(unlockedAtFor({ id: STUDENT }, rows), "2026-11-04T09:00:00.000Z");
  assert.equal(
    unlockedAtFor({ id: STUDENT, edit_unlocked_at: null }, rows),
    "2026-11-04T09:00:00.000Z",
  );
});

test("no grant anywhere means no grant", () => {
  assert.equal(unlockedAtFor({ id: STUDENT }, []), null);
  assert.equal(unlockedAtFor(null, null), null);
  assert.equal(unlockedAtFor({ id: STUDENT, edit_unlocked_at: null }, null), null);
});

/* --- one correction per student -------------------------------------------- */

test("a spent edit closes the form even while the cohort switch is on", () => {
  // The owner's rule: once the student has edited and confirmed, they cannot edit
  // again until the admin opens the form for them.
  assert.equal(
    canEdit({ globallyEnabled: true, unlockedAt: null, usedAt: "2026-11-04T09:00:00.000Z" }),
    false,
  );
});

test("a fresh student under the cohort switch can still edit", () => {
  assert.equal(canEdit({ globallyEnabled: true, unlockedAt: null, usedAt: null }), true);
});

test("a new grant reopens the form after the edit was spent", () => {
  assert.equal(
    canEdit({ globallyEnabled: true, unlockedAt: "2026-11-05T09:00:00.000Z", usedAt: null }),
    true,
  );
});

test("a grant reopens the form even if a spent stamp lingers", () => {
  assert.equal(
    canEdit({
      globallyEnabled: false,
      unlockedAt: "2026-11-05T09:00:00.000Z",
      usedAt: "2026-11-04T09:00:00.000Z",
    }),
    true,
  );
});

test("the spent flag is only set when there is no open grant", () => {
  assert.equal(
    isEditSpent({ globallyEnabled: true, unlockedAt: null, usedAt: "2026-11-04T09:00:00.000Z" }),
    true,
  );
  assert.equal(isEditSpent({ globallyEnabled: true, unlockedAt: null, usedAt: null }), false);
  assert.equal(
    isEditSpent({
      globallyEnabled: true,
      unlockedAt: "2026-11-05T09:00:00.000Z",
      usedAt: "2026-11-04T09:00:00.000Z",
    }),
    false,
  );
  assert.equal(
    isEditSpent({ globallyEnabled: false, unlockedAt: null, usedAt: "2026-11-04T09:00:00.000Z" }),
    false,
  );
});

test("the used stamp is read off the student row, absent means never used", () => {
  assert.equal(usedAtFor({ edit_used_at: "2026-11-04T09:00:00.000Z" }), "2026-11-04T09:00:00.000Z");
  assert.equal(usedAtFor({ edit_used_at: null }), null);
  assert.equal(usedAtFor({}), null);
  assert.equal(usedAtFor(null), null);
});
