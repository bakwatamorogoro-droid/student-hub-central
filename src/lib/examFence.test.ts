import { test } from "node:test";
import assert from "node:assert/strict";

import {
  advanceGate,
  areaModeOf,
  gateStatusFromVerdict,
  googleMapsEmbedUrl,
  INITIAL_GATE,
  judgeFence,
  LOCK_GRACE_MS,
  parseGoogleMapsCoords,
  resolveExamFence,
  verdictDistanceM,
  type LocationGate,
} from "./examFence.ts";

// Kituo cha kumbukumbu: Dar es Salaam (Kariakoo).
const SCHOOL = { lat: -6.8161, lng: 39.2803, radiusM: 300, required: true };
// Darasa la kumbukumbu: mita ~50 kaskazini (0.00045° ya latitudo).
const CLASS = { lat: -6.81565, lng: 39.2803 };

// ------------------------------------------------------------- area mode

test("area mode reads the two words it knows and ignores anything else", () => {
  assert.equal(areaModeOf({ area_mode: "classroom" }), "classroom");
  assert.equal(areaModeOf({ area_mode: "OFF" }), "off");
  assert.equal(areaModeOf({ area_mode: null }), null);
  assert.equal(areaModeOf({}), null);
  assert.equal(areaModeOf(null), null);
});

test("classroom mode fences the paper to the exam's own centre", () => {
  const fence = resolveExamFence(
    { area_mode: "classroom", area_lat: CLASS.lat, area_lng: CLASS.lng, area_radius_m: 60 },
    SCHOOL,
  );
  assert.ok(fence);
  assert.equal(fence.source, "exam");
  assert.equal(fence.enforced, true);
  assert.equal(fence.radiusM, 60);
  assert.equal(fence.lat, CLASS.lat);
});

test("classroom mode without a centre falls back to the school, still enforced", () => {
  const fence = resolveExamFence({ area_mode: "classroom" }, SCHOOL);
  assert.ok(fence);
  assert.equal(fence.source, "school");
  assert.equal(fence.enforced, true);
  assert.equal(fence.radiusM, SCHOOL.radiusM);
});

test("off mode lets the paper be sat anywhere", () => {
  assert.equal(resolveExamFence({ area_mode: "off", area_lat: 1, area_lng: 1 }, SCHOOL), null);
});

test("a paper with no mode inherits the school setting, as it always did", () => {
  const fence = resolveExamFence({}, SCHOOL);
  assert.ok(fence);
  assert.equal(fence.source, "school");
  assert.equal(fence.lat, SCHOOL.lat);
});

test("a paper with no mode follows a switched-off school setting", () => {
  assert.equal(resolveExamFence({}, { ...SCHOOL, required: false }), null);
});

test("a school with no centre is not a fence", () => {
  assert.equal(
    resolveExamFence({ area_mode: "classroom" }, { ...SCHOOL, lat: null, lng: null }),
    null,
  );
});

test("a classroom radius of zero or nonsense becomes one metre, never unbounded", () => {
  const fence = resolveExamFence(
    { area_mode: "classroom", area_lat: CLASS.lat, area_lng: CLASS.lng, area_radius_m: 0 },
    SCHOOL,
  );
  assert.equal(fence?.radiusM, 1);
});

// --------------------------------------------------------------- the gate

test("a student who stays inside never locks", () => {
  let gate = INITIAL_GATE;
  for (let t = 0; t < 60_000; t += 2_000) gate = advanceGate(gate, "inside", t);
  assert.equal(gate.locked, false);
  assert.equal(gate.breaches, 0);
  assert.equal(gate.outsideMs, 0);
});

test("a brief trip outside does not lock, but is remembered", () => {
  let gate = advanceGate(INITIAL_GATE, "outside", 1_000);
  gate = advanceGate(gate, "outside", 4_000);
  assert.equal(gate.locked, false);
  assert.ok(gate.outsideMs >= 2_000);
  gate = advanceGate(gate, "inside", 5_000);
  assert.equal(gate.locked, false);
  assert.equal(gate.outsideSince, null);
});

test("staying outside past the grace period locks the paper once", () => {
  let gate = advanceGate(INITIAL_GATE, "outside", 0);
  gate = advanceGate(gate, "outside", LOCK_GRACE_MS - 1);
  assert.equal(gate.locked, false, "still inside the grace period");
  gate = advanceGate(gate, "outside", LOCK_GRACE_MS);
  assert.equal(gate.locked, true);
  assert.equal(gate.breaches, 1);
  gate = advanceGate(gate, "outside", LOCK_GRACE_MS * 3);
  assert.equal(gate.breaches, 1, "a single run counts as one breach");
});

test("losing the fix mid-run does not reset the clock", () => {
  let gate = advanceGate(INITIAL_GATE, "outside", 0);
  gate = advanceGate(gate, "unknown", LOCK_GRACE_MS);
  assert.equal(gate.locked, true, "turning location off is not a way back in");
});

test("coming back inside unlocks the paper and permits a second breach", () => {
  let gate: LocationGate = advanceGate(INITIAL_GATE, "outside", 0);
  gate = advanceGate(gate, "outside", LOCK_GRACE_MS);
  gate = advanceGate(gate, "inside", LOCK_GRACE_MS + 1_000);
  assert.equal(gate.locked, false);
  gate = advanceGate(gate, "outside", 100_000);
  gate = advanceGate(gate, "outside", 100_000 + LOCK_GRACE_MS);
  assert.equal(gate.locked, true);
  assert.equal(gate.breaches, 2);
});

test("the grace period is measured in wall time, so a throttled tab cannot stretch it", () => {
  // One reading before the gap, one after: the clock jumps the whole interval.
  let gate = advanceGate(INITIAL_GATE, "outside", 0);
  gate = advanceGate(gate, "outside", LOCK_GRACE_MS + 30_000);
  assert.equal(gate.locked, true);
});

test("verdicts read as gate statuses, with the error margin counted as inside", () => {
  assert.equal(gateStatusFromVerdict({ status: "inside", distanceM: 10, radiusM: 300 }), "inside");
  assert.equal(
    gateStatusFromVerdict({ status: "near_edge", distanceM: 320, radiusM: 300 }),
    "inside",
  );
  assert.equal(
    gateStatusFromVerdict({ status: "outside", distanceM: 900, radiusM: 300 }),
    "outside",
  );
  assert.equal(gateStatusFromVerdict({ status: "missing_fix" }), "outside");
  assert.equal(gateStatusFromVerdict(null), "unknown");
});

test("distances are rounded for the student, and absent when there is no verdict", () => {
  assert.equal(verdictDistanceM({ status: "inside", distanceM: 41.7, radiusM: 300 }), 42);
  assert.equal(verdictDistanceM({ status: "missing_fix" }), null);
  assert.equal(verdictDistanceM(null), null);
});

test("a fence with no centre cannot judge anything", () => {
  assert.equal(judgeFence(null, { lat: 1, lng: 1 }), null);
  assert.equal(
    judgeFence(
      { lat: null, lng: null, radiusM: 300, enforced: true, source: "exam" },
      { lat: 1, lng: 1 },
    ),
    null,
  );
});

test("a student in the next building is outside a classroom fence", () => {
  const fence = {
    lat: CLASS.lat,
    lng: CLASS.lng,
    radiusM: 60,
    enforced: true,
    source: "exam" as const,
  };
  const near = judgeFence(fence, { lat: CLASS.lat + 0.0001, lng: CLASS.lng, accuracy: 10 });
  const far = judgeFence(fence, { lat: CLASS.lat + 0.005, lng: CLASS.lng, accuracy: 10 });
  assert.equal(near?.status, "inside");
  assert.equal(far?.status, "outside");
});

// ------------------------------------------------------- Maps link parsing

test("coordinates come out of every Maps link shape teachers paste", () => {
  const want = { lat: -6.8161, lng: 39.2803 };
  const cases = [
    "https://www.google.com/maps/@-6.8161,39.2803,17z",
    "https://www.google.com/maps/place/College/@-6.8161,39.2803,19z/data=!3m1",
    "https://maps.google.com/?q=-6.8161,39.2803",
    "https://www.google.com/maps?ll=-6.8161,39.2803&z=17",
    "https://www.google.com/maps/place/x/data=!4m6!3d-6.8161!4d39.2803",
    "-6.8161, 39.2803",
  ];
  for (const c of cases) assert.deepEqual(parseGoogleMapsCoords(c), want, c);
});

test("a share link with no coordinates is reported as unreadable", () => {
  assert.equal(parseGoogleMapsCoords("https://maps.app.goo.gl/abc123"), null);
  assert.equal(parseGoogleMapsCoords(""), null);
  assert.equal(parseGoogleMapsCoords(null), null);
});

test("coordinates that cannot exist are refused rather than stored", () => {
  assert.equal(parseGoogleMapsCoords("200.1,39.2"), null);
  assert.equal(parseGoogleMapsCoords("-6.8161,400.5"), null);
});

test("the embed URL carries the point and needs no API key", () => {
  assert.equal(
    googleMapsEmbedUrl(-6.8161, 39.2803),
    "https://maps.google.com/maps?q=-6.8161,39.2803&z=17&output=embed",
  );
});

// ----------------------------------------------------- the paper's GPS switch

test("turning GPS off on a paper unlocks it even in classroom mode", () => {
  const row = {
    area_mode: "classroom",
    area_lat: CLASS.lat,
    area_lng: CLASS.lng,
    area_radius_m: 60,
  };
  assert.equal(resolveExamFence(row, SCHOOL, false), null);
});

test("turning GPS off also silences a paper that was inheriting the school fence", () => {
  assert.equal(resolveExamFence({}, SCHOOL, false), null);
});

test("leaving the switch alone keeps every old behaviour", () => {
  assert.ok(resolveExamFence({}, SCHOOL));
  assert.ok(resolveExamFence({ area_mode: "classroom" }, SCHOOL));
});
