import { test } from "node:test";
import assert from "node:assert/strict";
import { areaMessage, checkArea, distanceMetres, formatDistance } from "./geo.ts";

// Kituo cha kumbukumbu: Dar es Salaam (Kariakoo).
const DAR = { lat: -6.8161, lng: 39.2803 };

test("distanceMetres is zero for the same point", () => {
  assert.equal(distanceMetres(DAR.lat, DAR.lng, DAR.lat, DAR.lng), 0);
});

test("distanceMetres matches a known separation", () => {
  // Kariakoo -> Posta (Dar es Salaam) ni takriban 1.6 km.
  const d = distanceMetres(-6.8161, 39.2803, -6.8265, 39.2897);
  assert.ok(d > 1400 && d < 1800, `umbali ${d} hauko karibu na 1.6 km`);
});

test("a fix inside the radius is inside", () => {
  // Mita ~50 kaskazini: 0.00045° ya latitudo.
  const v = checkArea({ ...DAR, radiusM: 200 }, { lat: DAR.lat + 0.00045, lng: DAR.lng });
  assert.equal(v.status, "inside");
});

test("a fix outside the radius is outside", () => {
  const v = checkArea({ ...DAR, radiusM: 200 }, { lat: DAR.lat + 0.02, lng: DAR.lng });
  assert.equal(v.status, "outside");
});

test("no fence centre passes rather than blocking everyone", () => {
  const v = checkArea({ lat: null, lng: null, radiusM: 200 }, { lat: DAR.lat, lng: DAR.lng });
  assert.equal(v.status, "no_fence");
});

test("a fence without a fix reports missing_fix", () => {
  const v = checkArea({ ...DAR, radiusM: 200 }, { lat: null, lng: null });
  assert.equal(v.status, "missing_fix");
});

test("the boundary itself counts as inside", () => {
  const v = checkArea({ ...DAR, radiusM: 0 }, { lat: DAR.lat, lng: DAR.lng });
  assert.equal(v.status, "inside");
});

test("formatDistance switches to kilometres", () => {
  assert.equal(formatDistance(140), "140 m");
  assert.equal(formatDistance(1600), "1.60 km");
});

test("every verdict has a message", () => {
  const verdicts = [
    { status: "no_fence" } as const,
    { status: "missing_fix" } as const,
    { status: "inside", distanceM: 10, radiusM: 200 } as const,
    { status: "outside", distanceM: 500, radiusM: 200 } as const,
  ];
  for (const v of verdicts) {
    const m = areaMessage(v);
    assert.ok(typeof m === "string" && m.length > 0, `hakuna ujumbe kwa ${v.status}`);
  }
});
