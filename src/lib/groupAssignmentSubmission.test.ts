import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GROUP_SUBMISSION_STATUS,
  MAX_GROUP_FILE_BYTES,
  assignmentFileKind,
  canSubmit,
  compareGroupKeys,
  formatBytes,
  groupKey,
  groupLabel,
  groupSubmissionsInOrder,
  isGroupRow,
  membersOfGroup,
  parseEnvelope,
  presentersSummary,
  previewKindFor,
  serializeEnvelope,
  submissionForGroup,
  submittedMessage,
  toGroupSubmission,
  validateAssignmentFile,
} from "./groupAssignmentSubmission.ts";
import { normalizeGender, normalizeGroupName, normalizeSeminar } from "./groupAssignment.ts";

const key = { semina: "SEMINA 3", gender: "Mwanaume", group: "GROUP 5" };
const norm = { semina: normalizeSeminar, gender: normalizeGender, group: normalizeGroupName };

test("the same GROUP 5 in one seminar is two different groups by gender", () => {
  const men = groupKey({ ...key, gender: "Mwanaume" });
  const women = groupKey({ ...key, gender: "Mwanamke" });
  assert.notEqual(men, women);
  // Both spellings of the gender land on the same key, or a student would miss
  // the submission their group already made.
  assert.equal(groupKey({ ...key, gender: "male" }), men);
  assert.equal(groupKey({ ...key, gender: "M" }), men);
});

test("the key survives the spacing the imported roster carries", () => {
  assert.equal(
    groupKey({ semina: " semina 3 ", gender: "mwanaume", group: "group  5" }),
    groupKey(key),
  );
});

test("the label is what the admin list is ordered by", () => {
  assert.equal(groupLabel(key), "SEMINA 3 · GROUP 5 · WANAUME");
});

test("only a group row is a group row", () => {
  assert.equal(isGroupRow({ status: GROUP_SUBMISSION_STATUS }), true);
  assert.equal(isGroupRow({ status: "pending" }), false);
  assert.equal(isGroupRow(null), false);
});

test("an envelope round-trips through the one free text column", () => {
  const env = {
    kind: "group_assignment" as const,
    semina: "SEMINA 3",
    gender: "Mwanaume",
    group: "GROUP 5",
    presenters: ["MUM 2025-04-1 ABU", "MUM 2025-04-2 ALI"],
    question: "Eleza uadilifu wa Hadith.",
  };
  assert.deepEqual(parseEnvelope(serializeEnvelope(env)), env);
});

test("a plain answer left in the column is not mistaken for an envelope", () => {
  assert.equal(parseEnvelope("Jibu la mwalimu"), null);
  assert.equal(parseEnvelope(""), null);
  assert.equal(parseEnvelope(null), null);
  assert.equal(parseEnvelope("{not json"), null);
  assert.equal(parseEnvelope('{"kind":"something_else"}'), null);
});

test("only PDF and Word are accepted, by name or by type", () => {
  assert.equal(assignmentFileKind({ name: "kazi.PDF" }), "pdf");
  assert.equal(assignmentFileKind({ name: "kazi.docx" }), "word");
  assert.equal(assignmentFileKind({ name: "kazi.doc" }), "word");
  assert.equal(assignmentFileKind({ name: "kazi.docx", type: "application/word" }), "word");
  assert.equal(assignmentFileKind({ name: "picha.jpg" }), null);
  assert.equal(assignmentFileKind({ name: "kazi", type: "text/plain" }), null);
});

test("a file over 2MB is refused with its real size in the message", () => {
  const verdict = validateAssignmentFile({
    name: "kazi.pdf",
    size: MAX_GROUP_FILE_BYTES + 1024 * 1024,
  });
  assert.equal(verdict.ok, false);
  assert.match((verdict as { error: string }).error, /3\.0MB/);
});

test("a 2MB file is allowed exactly, and an empty one is not", () => {
  assert.equal(validateAssignmentFile({ name: "kazi.pdf", size: MAX_GROUP_FILE_BYTES }).ok, true);
  assert.equal(validateAssignmentFile({ name: "kazi.pdf", size: 0 }).ok, false);
});

test("a Word file of the right size passes", () => {
  const verdict = validateAssignmentFile({ name: "kazi.docx", size: 1024 });
  assert.deepEqual(verdict, { ok: true, kind: "word" });
});

test("submit needs presenters, a question, a file, and a preview", () => {
  const file = { name: "kazi.pdf", size: 1024 };
  assert.deepEqual(canSubmit({ question: "", presenters: [], file: null, previewed: false }), {
    ok: false,
    missing: [
      "Chagua angalau mwanachama mmoja aliyepresent.",
      "Andika swali la kazi yenu.",
      "Pakia faili la kazi (PDF au Word, hadi 2MB).",
    ],
  });
  assert.deepEqual(
    canSubmit({ question: "Swali", presenters: ["A"], file: null, previewed: false }),
    {
      ok: false,
      missing: ["Pakia faili la kazi (PDF au Word, hadi 2MB)."],
    },
  );
  // Everything filled in but never previewed: still refused.
  assert.deepEqual(canSubmit({ question: "Swali", presenters: ["A"], file, previewed: false }), {
    ok: false,
    missing: ["Preview faili kabla ya kutuma."],
  });
  assert.equal(canSubmit({ question: "Swali", presenters: ["A"], file, previewed: true }).ok, true);
});

test("a file that fails validation is refused even when previewed", () => {
  const check = canSubmit({
    question: "Swali",
    presenters: ["A"],
    file: { name: "picha.jpg", size: 100 },
    previewed: true,
  });
  assert.equal(check.ok, false);
  assert.match(check.missing[0], /PDF au Word/);
});

test("the submitted message names the day and the time", () => {
  const text = submittedMessage("2026-11-03T14:05:00.000Z");
  assert.match(text, /^Kazi yenu ilitumwa tarehe /);
  assert.match(text, /2026/);
});

test("an unreadable date still produces a sentence rather than a crash", () => {
  assert.equal(submittedMessage(null), "Kazi yenu ilitumwa.");
  assert.equal(submittedMessage("not-a-date"), "Kazi yenu ilitumwa.");
});

test("groups sort by seminar then group number, not alphabetically", () => {
  const list = [
    { semina: "SEMINA 10", gender: "Mwanaume", group: "GROUP 1" },
    { semina: "SEMINA 2", gender: "Mwanaume", group: "GROUP 10" },
    { semina: "SEMINA 2", gender: "Mwanaume", group: "GROUP 9" },
    { semina: "SEMINA 1", gender: "Mwanaume", group: "GROUP 2" },
  ];
  const sorted = [...list].sort(compareGroupKeys);
  assert.deepEqual(
    sorted.map((k) => `${k.semina} ${k.group}`),
    ["SEMINA 1 GROUP 2", "SEMINA 2 GROUP 9", "SEMINA 2 GROUP 10", "SEMINA 10 GROUP 1"],
  );
});

test("the admin list drops individual rows and keeps group rows in order", () => {
  const rows = [
    { id: "1", status: "pending", reg_no: "MUM1", created_at: "2026-11-03T10:00:00Z" },
    {
      id: "2",
      status: GROUP_SUBMISSION_STATUS,
      reg_no: groupKey(key),
      created_at: "2026-11-03T11:00:00Z",
      ai_extracted_text: serializeEnvelope({
        kind: "group_assignment",
        semina: "SEMINA 3",
        gender: "Mwanaume",
        group: "GROUP 5",
        presenters: ["A"],
        question: "Q",
      }),
    },
    {
      id: "3",
      status: GROUP_SUBMISSION_STATUS,
      reg_no: groupKey({ ...key, semina: "SEMINA 1" }),
      created_at: "2026-11-03T09:00:00Z",
      ai_extracted_text: serializeEnvelope({
        kind: "group_assignment",
        semina: "SEMINA 1",
        gender: "Mwanaume",
        group: "GROUP 5",
        presenters: [],
        question: "Q1",
      }),
    },
  ];
  const list = groupSubmissionsInOrder(rows as never);
  assert.deepEqual(
    list.map((s) => s.row.id),
    ["3", "2"],
  );
  assert.equal(list[0].label, "SEMINA 1 · GROUP 5 · WANAUME");
});

test("a row reads back with its question, presenters and admin answer", () => {
  const sub = toGroupSubmission({
    id: "9",
    reg_no: groupKey(key),
    status: GROUP_SUBMISSION_STATUS,
    teacher_confirmed: true,
    feedback: "Jibu la mwalimu",
    created_at: "2026-11-03T11:00:00Z",
    ai_extracted_text: serializeEnvelope({
      kind: "group_assignment",
      semina: "SEMINA 3",
      gender: "Mwanaume",
      group: "GROUP 5",
      presenters: ["A", "B"],
      question: "Swali",
      answer: "Jibu la mwalimu",
      answer_signature: "data:image/png;base64,AAAA",
      answered_at: "2026-11-04T08:00:00Z",
    }),
  });
  assert.equal(sub.question, "Swali");
  assert.deepEqual(sub.presenters, ["A", "B"]);
  assert.equal(sub.answer, "Jibu la mwalimu");
  assert.equal(sub.answerSignature, "data:image/png;base64,AAAA");
  assert.equal(sub.answered, true);
});

test("a group finds its own submission by key", () => {
  const row = {
    id: "1",
    status: GROUP_SUBMISSION_STATUS,
    reg_no: groupKey(key),
    ai_extracted_text: serializeEnvelope({
      kind: "group_assignment",
      semina: "SEMINA 3",
      gender: "Mwanaume",
      group: "GROUP 5",
      presenters: [],
      question: "Q",
    }),
  };
  assert.equal(submissionForGroup([row] as never, key)?.id, "1");
  assert.equal(submissionForGroup([row] as never, { ...key, gender: "Mwanamke" }), null);
  assert.equal(submissionForGroup([row] as never, { ...key, group: "GROUP 6" }), null);
});

test("a row written before the envelope existed still finds its group", () => {
  const row = {
    id: "2",
    status: GROUP_SUBMISSION_STATUS,
    reg_no: "GROUP::SEMINA 3::MWANAUME::GROUP 5",
    semina: "SEMINA 3",
    student_group: "GROUP 5",
    ai_extracted_text: null,
  };
  assert.equal(submissionForGroup([row] as never, key)?.id, "2");
});

test("members come from the chosen seminar, group and gender only", () => {
  const roster = [
    { id: "1", reg_no: "A", semina: "SEMINA 3", student_group: "GROUP 5", gender: "Mwanaume" },
    { id: "2", reg_no: "B", semina: "SEMINA 3", student_group: "GROUP 5", gender: "Mwanaume" },
    { id: "3", reg_no: "C", semina: "SEMINA 3", student_group: "GROUP 5", gender: "Mwanamke" },
    { id: "4", reg_no: "D", semina: "SEMINA 4", student_group: "GROUP 5", gender: "Mwanaume" },
    { id: "5", reg_no: "E", semina: "SEMINA 3", student_group: "GROUP 6", gender: "Mwanaume" },
  ];
  const found = membersOfGroup(roster, key, norm);
  assert.deepEqual(
    found.map((m) => m.reg_no),
    ["A", "B"],
  );
});

test("a presenter summary stays short when a group is large", () => {
  assert.equal(presentersSummary([]), "Hakuna aliyechaguliwa");
  assert.equal(presentersSummary(["A", "B"]), "A, B");
  assert.equal(presentersSummary(["A", "B", "C", "D", "E"]), "A, B, C +2");
});

test("the preview knows a PDF from a Word file", () => {
  assert.equal(previewKindFor("kazi.pdf"), "pdf");
  assert.equal(previewKindFor("kazi.DOCX"), "word");
  assert.equal(previewKindFor(null), "other");
});

test("byte sizes read the way a student expects", () => {
  assert.equal(formatBytes(500 * 1024), "500KB");
  assert.equal(formatBytes(2 * 1024 * 1024), "2.0MB");
});

test("ticks travel in the envelope and come back on the same page", () => {
  const env = {
    kind: "group_assignment" as const,
    semina: "SEMINA 10",
    gender: "Mwanaume",
    group: "GROUP 5",
    presenters: ["A"],
    question: "Swali",
    annotations: [
      { id: "t1", page: 2, kind: "tick" as const, text: "", x: 0.3, y: 0.4 },
      { id: "n1", page: 5, kind: "note" as const, text: "Pitia hapa", x: 0.6, y: 0.2 },
    ],
  };
  const round = parseEnvelope(serializeEnvelope(env));
  assert.deepEqual(round?.annotations, env.annotations);
  assert.equal(round?.annotations?.[1].page, 5);
});

test("a damaged tick list is repaired, and the unfixable parts dropped", () => {
  const raw = JSON.stringify({
    kind: "group_assignment",
    semina: "S",
    gender: "Mwanaume",
    group: "G",
    presenters: [],
    question: "",
    annotations: [
      { id: "ok", page: 1, kind: "tick", x: 0.1, y: 0.1 },
      { id: "bad", page: -3, kind: "tick", x: 5, y: 5 },
      { id: "worse", page: 1, kind: "scribble", x: 0.1, y: 0.1 },
    ],
  });
  const env = parseEnvelope(raw);
  // The unknown kind is dropped; the rest is clamped into a real page and spot.
  assert.deepEqual(
    env?.annotations?.map((a) => ({ id: a.id, page: a.page, x: a.x, y: a.y })),
    [
      { id: "ok", page: 1, x: 0.1, y: 0.1 },
      { id: "bad", page: 0, x: 1, y: 1 },
    ],
  );
});

test("a note without words is refused; a tick needs none", () => {
  const raw = JSON.stringify({
    kind: "group_assignment",
    semina: "S",
    gender: "Mwanaume",
    group: "G",
    presenters: [],
    question: "",
    annotations: [
      { id: "t", page: 1, kind: "tick", x: 0.1, y: 0.1 },
      { id: "n", page: 1, kind: "note", text: "   ", x: 0.1, y: 0.1 },
    ],
  });
  const env = parseEnvelope(raw);
  assert.deepEqual(
    env?.annotations?.map((a) => a.id),
    ["t"],
  );
});

test("an envelope with no ticks stays free of an empty list", () => {
  const env = parseEnvelope(
    JSON.stringify({
      kind: "group_assignment",
      semina: "S",
      gender: "Mwanaume",
      group: "G",
      presenters: [],
      question: "",
    }),
  );
  assert.equal(env?.annotations, undefined);
});
