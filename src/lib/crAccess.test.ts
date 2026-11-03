import { test } from "node:test";
import assert from "node:assert/strict";
import { CR_PASSWORD, CR_USERNAME, crCredentialsMatch } from "./crAccess.ts";

test("the CR pair signs in", () => {
  assert.equal(crCredentialsMatch(CR_USERNAME, CR_PASSWORD), true);
});

test("the username is trimmed and case-folded, so a pasted notice still works", () => {
  assert.equal(crCredentialsMatch("  is2026  ", CR_PASSWORD), true);
  assert.equal(crCredentialsMatch("Is2026", CR_PASSWORD), true);
});

test("the password is exact: a near miss and a stray space are refused", () => {
  assert.equal(crCredentialsMatch(CR_USERNAME, "cr2026"), false);
  assert.equal(crCredentialsMatch(CR_USERNAME, " CR2026 "), false);
  assert.equal(crCredentialsMatch(CR_USERNAME, "CR2027"), false);
});

test("a wrong username is refused even with the right password", () => {
  assert.equal(crCredentialsMatch("ADMIN", CR_PASSWORD), false);
  assert.equal(crCredentialsMatch("", CR_PASSWORD), false);
});

test("the admin's pair is not the CR's", () => {
  assert.equal(crCredentialsMatch("admin", "admin"), false);
});

test("blank input never passes", () => {
  assert.equal(crCredentialsMatch("", ""), false);
});
