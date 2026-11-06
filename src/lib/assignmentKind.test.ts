import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSIGNMENT_KINDS,
  DEFAULT_ASSIGNMENT_KIND,
  assignmentKindFromUploadedBy,
  assignmentKindLabel,
  encodeAssignmentKind,
  encodeSubmissionKind,
  isGroupKind,
  isKnownAssignmentKind,
  normalizeAssignmentKind,
  submissionKindFromText,
} from "./assignmentKind.ts";

test("there are exactly three kinds, and no fourth", () => {
  assert.deepEqual([...ASSIGNMENT_KINDS], ["presentation_group", "normal_group", "individual"]);
});

test("the default is a presentation, so legacy work reads as one", () => {
  assert.equal(DEFAULT_ASSIGNMENT_KIND, "presentation_group");
  // A row written before the kind existed carries nothing at all.
  assert.equal(normalizeAssignmentKind(null), "presentation_group");
  assert.equal(normalizeAssignmentKind(undefined), "presentation_group");
  assert.equal(normalizeAssignmentKind(""), "presentation_group");
});

test("an unknown value is the default, never a new kind", () => {
  assert.equal(normalizeAssignmentKind("group_project"), "presentation_group");
  assert.equal(normalizeAssignmentKind("essay"), "presentation_group");
  assert.equal(normalizeAssignmentKind("42"), "presentation_group");
  assert.ok(ASSIGNMENT_KINDS.includes(normalizeAssignmentKind("something else")));
});

test("the label itself round-trips", () => {
  assert.equal(normalizeAssignmentKind("Presentation Assignment (Group)"), "presentation_group");
  assert.equal(normalizeAssignmentKind("Normal Assignment (Group)"), "normal_group");
  assert.equal(normalizeAssignmentKind("Individual Assignment"), "individual");
});

test("case, spaces and underscores do not matter", () => {
  assert.equal(normalizeAssignmentKind("  INDIVIDUAL  "), "individual");
  assert.equal(normalizeAssignmentKind("individual_assignment"), "individual");
  assert.equal(normalizeAssignmentKind("Normal-Group"), "normal_group");
});

test("labels are the owner's exact wording", () => {
  assert.equal(assignmentKindLabel("presentation_group"), "Presentation Assignment (Group)");
  assert.equal(assignmentKindLabel("normal_group"), "Normal Assignment (Group)");
  assert.equal(assignmentKindLabel("individual"), "Individual Assignment");
});

test("only individual is not group work", () => {
  assert.equal(isGroupKind("presentation_group"), true);
  assert.equal(isGroupKind("normal_group"), true);
  assert.equal(isGroupKind("individual"), false);
  assert.equal(isGroupKind(null), true);
});

test("isKnownAssignmentKind separates a real value from the fallback", () => {
  assert.equal(isKnownAssignmentKind("individual"), true);
  assert.equal(isKnownAssignmentKind("Individual Assignment"), true);
  assert.equal(isKnownAssignmentKind("essay"), false);
  assert.equal(isKnownAssignmentKind(""), false);
});

test("the kind rides in uploaded_by and comes back out", () => {
  for (const kind of ASSIGNMENT_KINDS) {
    assert.equal(assignmentKindFromUploadedBy(encodeAssignmentKind(kind)), kind);
  }
});

test("a bare 'admin' row reads as the default, not as an unknown", () => {
  assert.equal(assignmentKindFromUploadedBy("admin"), "presentation_group");
  assert.equal(assignmentKindFromUploadedBy(""), "presentation_group");
  assert.equal(assignmentKindFromUploadedBy(null), "presentation_group");
  assert.equal(assignmentKindFromUploadedBy(undefined), "presentation_group");
});

test("a damaged suffix is still the default, never a crash", () => {
  assert.equal(assignmentKindFromUploadedBy("admin|"), "presentation_group");
  assert.equal(assignmentKindFromUploadedBy("admin|nonsense"), "presentation_group");
  assert.equal(assignmentKindFromUploadedBy("admin|normal_group|extra"), "presentation_group");
  assert.equal(assignmentKindFromUploadedBy("admin|normal_group"), "normal_group");
});

test("a submission's kind round-trips through its own text column", () => {
  for (const kind of ASSIGNMENT_KINDS) {
    assert.equal(submissionKindFromText(encodeSubmissionKind(kind)), kind);
  }
});

test("a row with no kind, or with text that is not ours, reads as the default", () => {
  assert.equal(submissionKindFromText(null), "presentation_group");
  assert.equal(submissionKindFromText(""), "presentation_group");
  assert.equal(submissionKindFromText("plain feedback text"), "presentation_group");
  assert.equal(submissionKindFromText("{not json"), "presentation_group");
  assert.equal(submissionKindFromText("{}"), "presentation_group");
  assert.equal(submissionKindFromText('{"answer":"hi"}'), "presentation_group");
});

test("a group envelope's kind is read by the same reader", () => {
  const envelope = JSON.stringify({
    kind: "group_assignment",
    semina: "SEMINA 1",
    gender: "MWANAUME",
    group: "GROUP 1",
    presenters: [],
    question: "",
    assignment_kind: "normal_group",
  });
  assert.equal(submissionKindFromText(envelope), "normal_group");
});
