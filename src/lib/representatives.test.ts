import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashString,
  pickRepresentative,
  representativesFor,
  type GroupMember,
} from "./groupAssignment.ts";

const m = (n: number): GroupMember => ({
  id: `id-${n}`,
  reg_no: `MUM2025-04-${10000 + n}`,
  full_name: `Mwanafunzi ${n}`,
});

const group = [m(1), m(2), m(3), m(4), m(5), m(6), m(7), m(8)];

test("the same group yields the same representative every time", () => {
  const a = representativesFor(group, "SEMINA 1", "female", "GROUP 3");
  const b = representativesFor(group, "SEMINA 1", "female", "GROUP 3");
  assert.deepEqual(a, b);
});

test("the pick is a member of the group, never a stranger", () => {
  for (const g of ["GROUP 1", "GROUP 2", "GROUP 7", "GROUP 11"]) {
    for (const s of ["SEMINA 1", "SEMINA 8", "SEMINA 15"]) {
      const rep = pickRepresentative(group, "female", `${s}|${g}`);
      assert.ok(rep && group.some((x) => x.id === rep.id), `${s} ${g}`);
    }
  }
});

test("different groups mostly get different representatives, not all the same person", () => {
  const picks = new Set<string>();
  for (let g = 1; g <= 11; g++) {
    for (let s = 1; s <= 15; s++) {
      const rep = pickRepresentative(group, "male", `SEMINA ${s}|GROUP ${g}`);
      if (rep) picks.add(rep.id);
    }
  }
  // 165 groups over 8 members: a fixed "first member" rule would give exactly 1.
  assert.ok(picks.size >= 5, `expected a spread, got ${picks.size}`);
});

test("a female group has a female representative and no male one", () => {
  const r = representativesFor(group, "SEMINA 2", "female", "GROUP 4");
  assert.ok(r.female);
  assert.equal(r.male, null);
});

test("a male group has a male representative and no female one", () => {
  const r = representativesFor(group, "SEMINA 2", "male", "GROUP 4");
  assert.ok(r.male);
  assert.equal(r.female, null);
});

test("an empty group has no representative rather than throwing", () => {
  assert.equal(pickRepresentative([], "female", "SEMINA 1|GROUP 1"), null);
});

test("a group of one still yields that one member", () => {
  const solo = [m(9)];
  assert.equal(pickRepresentative(solo, "female", "SEMINA 1|GROUP 1")?.id, "id-9");
});

test("rotating the slot promotes the next member instead of repeating", () => {
  const first = pickRepresentative(group, "female", "SEMINA 1|GROUP 1", 0);
  const second = pickRepresentative(group, "female", "SEMINA 1|GROUP 1", 1);
  assert.notEqual(first?.id, second?.id);
});

test("the hash is stable and unsigned", () => {
  assert.equal(hashString("SEMINA 1|GROUP 3:female"), hashString("SEMINA 1|GROUP 3:female"));
  assert.ok(hashString("x") >= 0);
});
