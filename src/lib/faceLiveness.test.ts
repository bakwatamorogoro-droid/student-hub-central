import { test } from "node:test";
import assert from "node:assert/strict";
import {
  challengeSatisfied,
  motionInFrame,
  motionMoved,
  readFaces,
  FACE_CHALLENGES,
  NO_FACE,
  type FaceReading,
} from "./faceLiveness.ts";

const frame = { width: 400, height: 300 };

function box(x: number, y: number, w: number, h: number) {
  return { boundingBox: { x, y, width: w, height: h } };
}

/** A face of `width` fraction, centred. */
function face(width: number, cx = 0.5, cy = 0.5): FaceReading {
  return { count: 1, cx, cy, width };
}

test("readFaces reports nothing for an empty frame", () => {
  assert.deepEqual(readFaces([], frame), NO_FACE);
});

test("readFaces takes the largest face when someone is in the background", () => {
  // A small face behind the student must not become the subject.
  const reading = readFaces([box(10, 10, 40, 40), box(150, 100, 200, 150)], frame);
  assert.equal(reading.count, 2);
  assert.equal(reading.width, 200 / 400);
  assert.equal(reading.cx, (150 + 100) / 400);
});

test("readFaces still counts faces when the frame has no size", () => {
  const reading = readFaces([box(0, 0, 10, 10)], { width: 0, height: 0 });
  assert.equal(reading.count, 1);
  assert.equal(reading.cx, null);
});

test("centred needs one face, near the middle, close enough", () => {
  assert.ok(challengeSatisfied("centred", face(0.4), null));
  // Off to the side.
  assert.ok(!challengeSatisfied("centred", face(0.4, 0.9), null));
  // Too far away.
  assert.ok(!challengeSatisfied("centred", face(0.05), null));
});

test("a second person fails every step, including centred", () => {
  for (const challenge of FACE_CHALLENGES) {
    const two: FaceReading = { count: 2, cx: 0.5, cy: 0.5, width: 0.5 };
    assert.ok(
      !challengeSatisfied(challenge, two, face(0.3)),
      `${challenge} must not pass with two faces`,
    );
  }
});

test("closer needs measurable growth against the baseline", () => {
  const baseline = face(0.3);
  assert.ok(challengeSatisfied("closer", face(0.4), baseline));
  // The same distance is not closer.
  assert.ok(!challengeSatisfied("closer", face(0.3), baseline));
  // A hair bigger is noise, not movement.
  assert.ok(!challengeSatisfied("closer", face(0.31), baseline));
});

test("closer cannot be judged without a baseline", () => {
  assert.ok(!challengeSatisfied("closer", face(0.9), null));
});

test("turn needs the face centre to travel, either direction", () => {
  const baseline = face(0.3, 0.5);
  assert.ok(challengeSatisfied("turn", face(0.3, 0.65), baseline));
  assert.ok(challengeSatisfied("turn", face(0.3, 0.35), baseline));
  assert.ok(!challengeSatisfied("turn", face(0.3, 0.52), baseline));
});

test("a photo held still fails turn, which is the point", () => {
  // The same reading repeated can satisfy centred and never satisfies turn.
  const still = face(0.3, 0.5);
  assert.ok(challengeSatisfied("centred", still, null));
  assert.ok(!challengeSatisfied("turn", still, still));
  assert.ok(!challengeSatisfied("closer", still, still));
});

test("a face with no usable geometry fails every step", () => {
  for (const challenge of FACE_CHALLENGES) {
    assert.ok(!challengeSatisfied(challenge, NO_FACE, face(0.3)));
    assert.ok(!challengeSatisfied(challenge, { ...NO_FACE, count: 1 }, face(0.3)));
  }
});

test("motionInFrame rejects a covered or blank lens", () => {
  assert.ok(motionInFrame({ brightness: 120, contrast: 40, motion: 0 }));
  // A finger over the lens: dark and flat.
  assert.ok(!motionInFrame({ brightness: 3, contrast: 30, motion: 0 }));
  // Pointed at a blank wall: bright but flat.
  assert.ok(!motionInFrame({ brightness: 200, contrast: 2, motion: 0 }));
});

test("motionMoved needs two agreeing samples, so one noisy frame cannot carry it", () => {
  assert.ok(!motionMoved([]));
  assert.ok(!motionMoved([{ brightness: 100, contrast: 20, motion: 9 }]));
  assert.ok(
    motionMoved([
      { brightness: 100, contrast: 20, motion: 4 },
      { brightness: 104, contrast: 20, motion: 5 },
    ]),
  );
  // Mostly still.
  assert.ok(
    !motionMoved([
      { brightness: 100, contrast: 20, motion: 0.2 },
      { brightness: 100, contrast: 20, motion: 0.1 },
    ]),
  );
});
