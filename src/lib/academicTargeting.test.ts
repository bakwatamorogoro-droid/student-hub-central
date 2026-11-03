import { test } from "node:test";
import assert from "node:assert/strict";

import { matchesAcademicTarget } from "./academicTargeting.ts";

test("an untargeted exam is for everyone", () => {
  assert.equal(matchesAcademicTarget({}, { study_year: 1 }), true);
  assert.equal(
    matchesAcademicTarget({ target_study_year: null, target_academic_year: null }, null),
    true,
  );
});

test("nobody signed in sees a targeted exam", () => {
  assert.equal(matchesAcademicTarget({ target_study_year: 2 }, null), false);
});

test("a matching year is shown, a different one is not", () => {
  assert.equal(matchesAcademicTarget({ target_study_year: 2 }, { study_year: 2 }), true);
  assert.equal(matchesAcademicTarget({ target_study_year: 2 }, { study_year: 3 }), false);
});

/**
 * The live bug: 945 of 1623 students have no `study_year`, and requiring it to
 * equal the target hid the published `MAJARIO` (targeted at year 2) from all of
 * them. An unknown year cannot contradict the admin's choice.
 */
test("an unknown student year keeps a targeted exam", () => {
  assert.equal(matchesAcademicTarget({ target_study_year: 2 }, { study_year: null }), true);
  assert.equal(matchesAcademicTarget({ target_study_year: 2 }, {}), true);
});

test("an unknown academic year keeps a targeted exam", () => {
  assert.equal(matchesAcademicTarget({ target_academic_year: "2026/2027" }, {}), true);
  assert.equal(
    matchesAcademicTarget({ target_academic_year: "2026/2027" }, { academic_year: null }),
    true,
  );
});

test("a known academic year still has to match", () => {
  assert.equal(
    matchesAcademicTarget({ target_academic_year: "2026/2027" }, { academic_year: "2026/2027" }),
    true,
  );
  assert.equal(
    matchesAcademicTarget({ target_academic_year: "2026/2027" }, { academic_year: "2025/2026" }),
    false,
  );
});

test("a string year from the database matches a numeric target", () => {
  assert.equal(matchesAcademicTarget({ target_study_year: 2 }, { study_year: "2" }), true);
});

test("either target excluding is enough", () => {
  const student = { study_year: 2, academic_year: "2026/2027" };
  assert.equal(matchesAcademicTarget({ target_study_year: 3 }, student), false);
  assert.equal(matchesAcademicTarget({ target_academic_year: "2025/2026" }, student), false);
  assert.equal(
    matchesAcademicTarget({ target_study_year: 2, target_academic_year: "2026/2027" }, student),
    true,
  );
});
