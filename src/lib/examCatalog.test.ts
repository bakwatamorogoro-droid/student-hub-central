import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TEST_NUMBERS,
  categoryCounts,
  examsInCategory,
  testCategory,
  testLabel,
  visibleExams,
} from "./examCatalog.ts";

/**
 * The live case that started this: the admin named an exam "MAJARIO" and set
 * `test_number = 1`. The tabs read the title, found no "Test 1", and filed it
 * under "Others" — so a Test 1 the admin had published looked like it was not a
 * test at all.
 */
test("the admin's test_number label wins over the title", () => {
  assert.equal(testCategory({ title: "MAJARIO", test_number: 1 }), "test1");
  assert.equal(testLabel({ title: "MAJARIO", test_number: 1 }), "Test 1");
});

test("test_number covers 1 through 5", () => {
  for (const n of [1, 2, 3, 4, 5]) {
    assert.equal(testCategory({ title: "Anything", test_number: n }), `test${n}`);
    assert.equal(testLabel({ title: "Anything", test_number: n }), `Test ${n}`);
  }
});

test("a number outside the picker is not trusted", () => {
  // 9 was never offered, so the title is the better evidence.
  assert.equal(testCategory({ title: "Test 2 review", test_number: 9 }), "test2");
  assert.equal(testCategory({ title: "Test 2 review", test_number: null }), "test2");
});

test("the title is the fallback for rows with no test_number", () => {
  assert.equal(testCategory({ title: "ASSESSMENT TEST 2" }), "test2");
  assert.equal(testCategory({ title: "MTIHANI 3" }), "test3");
  assert.equal(testCategory({ title: "Test 01" }), "test1");
  assert.equal(testCategory({ title: "Introduction to Qur'an" }), "others");
});

test("a title is matched on the whole word, not a substring", () => {
  // "Testimony" and "latest" both contain "test"; neither is a test number.
  assert.equal(testCategory({ title: "Testimony of faith" }), "others");
  assert.equal(testCategory({ title: "The latest assignment" }), "others");
});

test("an exam with no label has no label to show", () => {
  assert.equal(testLabel({ title: "Introduction to Qur'an" }), null);
  assert.equal(testLabel(null), null);
});

test("every published exam reaches every student", () => {
  // The bug: 959 of 1623 students have no study_year, and the old academic
  // filter hid the exam from all of them. Visibility must not depend on the
  // student's profile at all.
  const exams = [
    { id: "a", title: "MAJARIO", test_number: 1, target_study_year: 2 },
    { id: "b", title: "ASSESSMENT TEST 2", test_number: null },
  ];
  assert.deepEqual(
    visibleExams(exams).map((e) => e.id),
    ["a", "b"],
  );
});

test("the tabs split the list without dropping an exam", () => {
  const exams = [
    { title: "MAJARIO", test_number: 1 },
    { title: "Test 2", test_number: null },
    { title: "ASSESSMENT TEST 3", test_number: null },
    { title: "Seminar questions" },
  ];
  const counts = categoryCounts(exams);
  assert.deepEqual(counts, { all: 4, test1: 1, test2: 1, test3: 1, test4: 0, test5: 0, others: 1 });
  assert.equal(
    counts.test1 + counts.test2 + counts.test3 + counts.test4 + counts.test5 + counts.others,
    counts.all,
  );
  assert.deepEqual(
    examsInCategory(exams, "test1").map((e) => e.title),
    ["MAJARIO"],
  );
  assert.equal(examsInCategory(exams, "all").length, 4);
});

test("every test number the admin can pick has its own tab", () => {
  // The admin's picker offers Test 1-5, so a Test 4 or Test 5 must not fall
  // through to "Others" — and must not vanish from the per-test counts either.
  const exams = TEST_NUMBERS.map((n) => ({ title: `Whatever ${n}`, test_number: n }));
  const counts = categoryCounts(exams);
  for (const n of TEST_NUMBERS) assert.equal(counts[`test${n}`], 1);
  assert.equal(counts.others, 0);
  assert.equal(counts.all, TEST_NUMBERS.length);
});

test("an empty list counts as empty, not as a crash", () => {
  assert.deepEqual(categoryCounts([]), {
    all: 0,
    test1: 0,
    test2: 0,
    test3: 0,
    test4: 0,
    test5: 0,
    others: 0,
  });
  assert.deepEqual(examsInCategory([], "test1"), []);
});
