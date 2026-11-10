import assert from "node:assert/strict";
import test from "node:test";

import { faceVerdictLabel, judgeFaces, type DetectedFace } from "./proctorFaces.ts";

const FRAME = { width: 640, height: 480 };

/** A face of a given size whose centre sits at a fraction of the frame. */
function faceAt(cx: number, cy: number, size = 200): DetectedFace {
  const w = size;
  const h = size;
  return { boundingBox: { x: cx * FRAME.width - w / 2, y: cy * FRAME.height - h / 2, width: w, height: h } };
}

test("judgeFaces reports absent when nothing is detected", () => {
  assert.equal(judgeFaces([], FRAME), "absent");
});

test("judgeFaces reports ok for a single centred face", () => {
  assert.equal(judgeFaces([faceAt(0.5, 0.5)], FRAME), "ok");
});

test("judgeFaces reports multiple when a second person is in frame", () => {
  // This is the "someone is helping him" case, and it outranks every other
  // verdict: a second face is unambiguous in a way that a glance never is.
  assert.equal(judgeFaces([faceAt(0.4, 0.5), faceAt(0.75, 0.5)], FRAME), "multiple");
});

test("judgeFaces reports looking_away for a face at the edge of frame", () => {
  assert.equal(judgeFaces([faceAt(0.95, 0.5)], FRAME), "looking_away");
});

test("judgeFaces tolerates a face that is a little off centre", () => {
  // People do not sit perfectly still; a small drift must not read as a warning.
  assert.equal(judgeFaces([faceAt(0.58, 0.54)], FRAME), "ok");
});

test("judgeFaces does not divide by a zero-sized frame", () => {
  assert.equal(judgeFaces([faceAt(0.5, 0.5)], { width: 0, height: 0 }), "ok");
});

test("faceVerdictLabel has text in both languages for every verdict", () => {
  for (const v of ["ok", "absent", "multiple", "looking_away"] as const) {
    assert.ok(faceVerdictLabel(v, "sw").length > 0);
    assert.ok(faceVerdictLabel(v, "en").length > 0);
  }
});
