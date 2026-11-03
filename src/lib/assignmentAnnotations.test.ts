import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ANNOTATION_META,
  annotationCounts,
  annotationSummary,
  annotationTextForPage,
  annotationsByPage,
  annotationsForPage,
  makeAnnotation,
  parseAnnotations,
  serializeAnnotations,
  type Annotation,
} from "./assignmentAnnotations.ts";

test("a tick needs no words; a note or an error does", () => {
  assert.ok(makeAnnotation({ page: 1, kind: "tick", x: 0.2, y: 0.3 }));
  assert.equal(makeAnnotation({ page: 1, kind: "note", x: 0.2, y: 0.3, text: "  " }), null);
  assert.equal(makeAnnotation({ page: 1, kind: "error", x: 0.2, y: 0.3 }), null);
  assert.ok(makeAnnotation({ page: 1, kind: "note", x: 0.2, y: 0.3, text: "Pitia aya ya 3" }));
});

test("a mark remembers which page of the work it belongs to", () => {
  const a = makeAnnotation({ page: 3, kind: "tick", x: 0.1, y: 0.1 })!;
  assert.equal(a.page, 3);
  assert.equal(annotationsForPage([a], 3).length, 1);
  assert.equal(annotationsForPage([a], 2).length, 0);
});

test("a spot is a fraction of the page, so it lands on the same word everywhere", () => {
  const a = makeAnnotation({ page: 1, kind: "tick", x: 0.5, y: 0.25 })!;
  assert.equal(a.x, 0.5);
  assert.equal(a.y, 0.25);
});

test("a click outside the page is pulled back inside it", () => {
  const a = makeAnnotation({ page: 1, kind: "tick", x: 1.4, y: -0.3 })!;
  assert.equal(a.x, 1);
  assert.equal(a.y, 0);
});

test("a page number is a whole page, never a fraction or a negative", () => {
  assert.equal(makeAnnotation({ page: 2.7, kind: "tick", x: 0, y: 0 })!.page, 2);
  assert.equal(makeAnnotation({ page: -4, kind: "tick", x: 0, y: 0 })!.page, 0);
});

test("an unknown kind is refused rather than stored", () => {
  assert.equal(makeAnnotation({ page: 1, kind: "scribble" as never, x: 0, y: 0 }), null);
});

test("marks survive a round-trip through storage", () => {
  const list: Annotation[] = [
    makeAnnotation({ page: 1, kind: "tick", x: 0.11111, y: 0.2 })!,
    makeAnnotation({ page: 2, kind: "note", x: 0.3, y: 0.4, text: "Sahihi hapa" })!,
    makeAnnotation({ page: 2, kind: "error", x: 0.5, y: 0.6, text: "Kosa la herufi" })!,
  ];
  const back = parseAnnotations(serializeAnnotations(list));
  assert.equal(back.length, 3);
  assert.deepEqual(
    back.map((a) => ({ page: a.page, kind: a.kind, text: a.text })),
    [
      { page: 1, kind: "tick", text: "" },
      { page: 2, kind: "note", text: "Sahihi hapa" },
      { page: 2, kind: "error", text: "Kosa la herufi" },
    ],
  );
});

test("damaged stored data is dropped, not trusted", () => {
  const back = parseAnnotations([
    null,
    "not a mark",
    { page: 1, kind: "scribble" },
    { page: 1, kind: "note", text: "" },
    { page: "2", kind: "tick", x: "0.5", y: "0.5" },
  ]);
  assert.equal(back.length, 1);
  assert.equal(back[0].page, 2);
  assert.equal(back[0].kind, "tick");
  assert.equal(back[0].x, 0.5);
});

test("a missing page field is treated as the whole document, not page 1", () => {
  const back = parseAnnotations([{ kind: "tick", x: 0, y: 0 }]);
  assert.equal(back[0].page, 0);
});

test("marks are grouped by page, with the whole document last", () => {
  const list = parseAnnotations([
    { page: 2, kind: "tick", x: 0, y: 0 },
    { page: 1, kind: "tick", x: 0, y: 0 },
    { page: 0, kind: "note", text: "Jumla" },
  ]);
  assert.deepEqual(
    annotationsByPage(list).map((g) => g.page),
    [1, 2, 0],
  );
});

test("the counts the summary shows are the real ones", () => {
  const list = parseAnnotations([
    { page: 1, kind: "tick", x: 0, y: 0 },
    { page: 1, kind: "tick", x: 0, y: 0 },
    { page: 2, kind: "note", text: "a" },
    { page: 2, kind: "error", text: "b" },
  ]);
  assert.deepEqual(annotationCounts(list), { tick: 2, note: 1, error: 1, total: 4 });
});

test("a mark is described to the group with its page", () => {
  const list = parseAnnotations([
    { page: 2, kind: "tick", x: 0, y: 0 },
    { page: 2, kind: "error", text: "Herufi" },
  ]);
  assert.deepEqual(annotationSummary(list), ["Ukurasa 2: ✓ · ✕ Herufi"]);
});

test("the words for a page are what a prompt or a file would carry", () => {
  const list = parseAnnotations([
    { page: 1, kind: "tick", x: 0, y: 0 },
    { page: 1, kind: "note", text: "Nzuri" },
  ]);
  assert.equal(annotationTextForPage(list, 1), "Sahihi; Maelezo: Nzuri");
  assert.equal(annotationTextForPage(list, 9), "");
});

test("every kind has a Swahili label and a glyph to draw", () => {
  for (const kind of ["tick", "note", "error"] as const) {
    assert.ok(ANNOTATION_META[kind].label.length > 0, kind);
    assert.ok(ANNOTATION_META[kind].glyph.length > 0, kind);
  }
  assert.equal(ANNOTATION_META.tick.tone, "ok");
  assert.equal(ANNOTATION_META.error.tone, "bad");
});
