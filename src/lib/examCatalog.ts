/**
 * Which tests a student may see, and what each one is called.
 *
 * Two things went wrong on the "Test Online" page, and both are decided here so
 * they can be tested without a browser:
 *
 * 1. **The label came from the title.** The tabs asked "does the title contain
 *    the words Test 1?" so an exam the admin named "MAJARIO" and labelled
 *    `test_number = 1` was filed under "Others". The label the admin actually
 *    chose is `test_number`; the title is only a fallback for older rows.
 * 2. **Most students were silently excluded.** `matchesAcademicTarget` hid an
 *    exam from any student whose `study_year` or `academic_year` was missing —
 *    and 945 of 1623 students have no `study_year`, so a published exam aimed at
 *    year 2 reached only the 675 who had it. A published exam is now visible to
 *    everyone who is signed in. The targeting columns still record who an exam
 *    was written for; they no longer hide it from the rest.
 */

export type ExamLike = {
  title?: string | null;
  test_number?: number | null;
};

/** The tabs on the Test Online page. `all` and `others` are not tests. */
export const TEST_CATEGORIES = ["test1", "test2", "test3", "test4", "test5"] as const;
export type TestCategory = (typeof TEST_CATEGORIES)[number] | "others";

/** How many tests the admin can label. Matches the `test_number` picker. */
export const TEST_NUMBERS = [1, 2, 3, 4, 5] as const;

/**
 * The category an exam belongs to.
 *
 * `test_number` wins because it is the admin's own label. Only when it is absent
 * do we fall back to reading the title, which is how the older exams were filed
 * before the column existed.
 */
export function testCategory(exam: ExamLike | null | undefined): TestCategory {
  if (!exam) return "others";
  const n = Number(exam.test_number);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return `test${n}` as TestCategory;

  const t = String(exam.title ?? "").toLowerCase();
  for (const n of TEST_NUMBERS) {
    const word = new RegExp(`\\b(test|mtihani)\\s*0*${n}\\b`);
    if (word.test(t)) return `test${n}` as TestCategory;
  }
  return "others";
}

/**
 * The label shown on an exam card.
 *
 * A student should read the same words the admin typed — "Test 1", not "Others"
 * and not the raw number.
 */
export function testLabel(exam: ExamLike | null | undefined): string | null {
  const n = Number(exam?.test_number);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return `Test ${n}`;
  const c = testCategory(exam);
  return c === "others" ? null : `Test ${c.slice(4)}`;
}

/**
 * Exams a signed-in student may sit.
 *
 * Every published exam, for everyone. The caller has already filtered to
 * `published = true`; this exists so the rule lives in one tested place rather
 * than as an inline `filter` that a later edit can quietly narrow again.
 */
export function visibleExams<T extends ExamLike>(exams: T[]): T[] {
  return exams ?? [];
}

/** The exams in one tab, with `all` meaning "everything". */
export function examsInCategory<T extends ExamLike>(
  exams: T[],
  category: TestCategory | "all",
): T[] {
  const list = visibleExams(exams);
  if (category === "all") return list;
  return list.filter((e) => testCategory(e) === category);
}

/** Counts per tab, so the picker can show "Test 1 (3)" without a second pass. */
export function categoryCounts<T extends ExamLike>(
  exams: T[],
): Record<TestCategory | "all", number> {
  const list = visibleExams(exams);
  const counts: Record<TestCategory | "all", number> = {
    all: list.length,
    test1: 0,
    test2: 0,
    test3: 0,
    test4: 0,
    test5: 0,
    others: 0,
  };
  for (const e of list) counts[testCategory(e)]++;
  return counts;
}
