import assert from "node:assert/strict";
import test from "node:test";

import { assessGpsSamples, frameStats, gpsFlagLabel, judgeFrame, type GpsSample } from "./proctoring.ts";

/** A flat RGBA buffer of one colour, which is what a covered lens produces. */
function solid(r: number, g: number, b: number, pixels = 64): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  }
  return out;
}

test("frameStats reports mean luminance for a solid frame", () => {
  const s = frameStats(solid(100, 100, 100));
  assert.equal(Math.round(s.brightness), 100);
  assert.equal(Math.round(s.contrast), 0);
});

test("frameStats sees contrast in a split frame", () => {
  const px = 64;
  const buf = new Uint8ClampedArray(px * 4);
  for (let i = 0; i < px; i++) {
    const v = i < px / 2 ? 0 : 255;
    buf[i * 4] = buf[i * 4 + 1] = buf[i * 4 + 2] = v;
    buf[i * 4 + 3] = 255;
  }
  const s = frameStats(buf);
  assert.ok(s.contrast > 100, `expected high contrast, got ${s.contrast}`);
});

test("judgeFrame calls a uniform frame covered and a varied one ok", () => {
  assert.equal(judgeFrame({ brightness: 10, contrast: 1, motion: 0 }), "covered");
  assert.equal(judgeFrame({ brightness: 120, contrast: 40, motion: 3 }), "ok");
});

test("judgeFrame does not call a dark but detailed room covered", () => {
  // Dim room: low brightness, but edges still exist.
  assert.equal(judgeFrame({ brightness: 25, contrast: 30, motion: 1 }), "ok");
});

function sample(lat: number, lng: number, accuracy: number, at = Date.now()): GpsSample {
  return { lat, lng, accuracy, at };
}

test("assessGpsSamples picks the most accurate fix", () => {
  const a = assessGpsSamples([
    sample(-6.8, 37.6, 40),
    sample(-6.8001, 37.6001, 8),
    sample(-6.8, 37.6, 25),
  ]);
  assert.ok(a);
  assert.equal(a.best.accuracy, 8);
  assert.equal(a.usable, true);
});

test("assessGpsSamples flags an impossibly accurate fix", () => {
  const a = assessGpsSamples([sample(-6.8, 37.6, 0.1)]);
  assert.ok(a);
  assert.ok(a.flags.includes("implausibly_accurate"));
  // Still usable: the flag is for the teacher, not a hard block.
  assert.equal(a.usable, true);
});

test("assessGpsSamples flags three byte-identical fixes as a possible fake", () => {
  const a = assessGpsSamples([
    sample(-6.8, 37.6, 12),
    sample(-6.8, 37.6, 12),
    sample(-6.8, 37.6, 12),
  ]);
  assert.ok(a);
  assert.ok(a.flags.includes("identical_fixes"));
});

test("assessGpsSamples accepts a real receiver's jitter", () => {
  const a = assessGpsSamples([
    sample(-6.8, 37.6, 12),
    sample(-6.80002, 37.60002, 9),
    sample(-6.79998, 37.60001, 14),
  ]);
  assert.ok(a);
  assert.equal(a.flags.includes("identical_fixes"), false);
  assert.ok(a.spreadM > 0);
});

test("assessGpsSamples rejects a stale fix as unusable", () => {
  const a = assessGpsSamples([sample(-6.8, 37.6, 10, Date.now() - 120000)]);
  assert.ok(a);
  assert.equal(a.usable, false);
  assert.ok(a.flags.includes("stale"));
});

test("assessGpsSamples flags a coarse indoor fix but still lets it through", () => {
  // 2 km is a network estimate, which is what a phone reports indoors with no chip
  // fix. It must be flagged for the teacher, not turned into a locked door.
  const a = assessGpsSamples([sample(-6.8, 37.6, 2000)]);
  assert.ok(a);
  assert.equal(a.usable, true);
  assert.ok(a.flags.includes("too_vague"));
});

test("assessGpsSamples rejects a fix that places the student nowhere", () => {
  const a = assessGpsSamples([sample(-6.8, 37.6, 9000)]);
  assert.ok(a);
  assert.equal(a.usable, false);
});

test("assessGpsSamples returns null when there is no usable input", () => {
  assert.equal(assessGpsSamples([]), null);
  assert.equal(assessGpsSamples([{ lat: NaN, lng: 1, accuracy: 5, at: Date.now() }]), null);
});

test("gpsFlagLabel names every flag", () => {
  for (const f of ["implausibly_accurate", "identical_fixes", "stale", "too_vague"] as const) {
    assert.ok(gpsFlagLabel(f).length > 0);
  }
});
