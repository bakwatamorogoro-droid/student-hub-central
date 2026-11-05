import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveVerificationCode } from "./verificationCode.ts";

test("code is stable for the same seed", () => {
  const seed = "Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MA";
  assert.equal(deriveVerificationCode(seed), deriveVerificationCode(seed));
});

test("code differs for different seeds", () => {
  const a = deriveVerificationCode("seed-one-digest-value-aaaaaaaa");
  const b = deriveVerificationCode("seed-two-digest-value-bbbbbbbb");
  assert.notEqual(a, b);
});

test("code is 9 characters: 4, a hyphen, 4", () => {
  const code = deriveVerificationCode("c29tZS1kaWdlc3QtdmFsdWUtZm9yLXRlc3Q");
  assert.equal(code.length, 9);
  assert.equal(code[4], "-");
  assert.match(code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
});

test("code uses only the vowel-free alphabet, so it cannot spell a word", () => {
  // Many seeds, because a single one could get lucky.
  for (let n = 0; n < 500; n++) {
    const code = deriveVerificationCode(`seed-${n}-`.repeat(3));
    assert.match(code, /^[BCDFGHJKLMNPQRSTVWXZ23456789]{4}-[BCDFGHJKLMNPQRSTVWXZ23456789]{4}$/);
  }
});

test("an empty seed yields an empty code rather than throwing", () => {
  assert.equal(deriveVerificationCode(""), "");
});

test("a one-character seed still yields a full code", () => {
  assert.match(deriveVerificationCode("x"), /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
});
