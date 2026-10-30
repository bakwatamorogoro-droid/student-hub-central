import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deterministicUuid,
  digestsEqual,
  generatePin,
  hashDeviceId,
  hashSecret,
  newSalt,
  newSessionToken,
  normalizePhone,
  randomUuid,
  tokenDigest,
} from "./pin-crypto.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("a random uuid is a valid v4 uuid, and varies", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const id = randomUuid();
    assert.match(id, UUID_RE);
    seen.add(id);
  }
  assert.equal(seen.size, 300);
});

test("a derived uuid is stable, so it can key a row", async () => {
  const a = await deterministicUuid("checkin:session-1:student-1");
  const b = await deterministicUuid("checkin:session-1:student-1");
  assert.equal(a, b);
  assert.match(a, UUID_RE);
});

test("derived uuids separate students and sessions", async () => {
  const base = await deterministicUuid("checkin:s1:st1");
  assert.notEqual(base, await deterministicUuid("checkin:s1:st2"));
  assert.notEqual(base, await deterministicUuid("checkin:s2:st1"));
  assert.notEqual(base, await deterministicUuid("checkin:s2:st2"));
});

test("a derived uuid is not guessable from the input", async () => {
  const id = await deterministicUuid("checkin:session-1:student-1");
  assert.ok(!id.includes("session-1"));
  assert.ok(!id.includes("student-1"));
});

test("a PIN is not recoverable from what is stored", async () => {
  const salt = newSalt();
  const hash = await hashSecret("482913", salt);
  assert.ok(!hash.includes("482913"));
  assert.notEqual(hash, "482913");
  assert.ok(hash.length > 20);
});

test("the same PIN under two salts gives two hashes", async () => {
  const a = await hashSecret("482913", newSalt());
  const b = await hashSecret("482913", newSalt());
  assert.notEqual(a, b);
});

test("the same PIN under the same salt verifies", async () => {
  const salt = newSalt();
  const stored = await hashSecret("482913", salt);
  const supplied = await hashSecret("482913", salt);
  assert.ok(digestsEqual(stored, supplied));
});

test("a wrong PIN does not verify", async () => {
  const salt = newSalt();
  const stored = await hashSecret("482913", salt);
  const supplied = await hashSecret("482914", salt);
  assert.ok(!digestsEqual(stored, supplied));
});

test("every salt is different", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(newSalt());
  assert.equal(seen.size, 200);
});

test("a generated PIN is six digits and varies", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const pin = generatePin(6);
    assert.match(pin, /^[0-9]{6}$/);
    seen.add(pin);
  }
  assert.ok(seen.size > 400, `expected variety, saw ${seen.size}`);
});

test("a session token is long and unique", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    const t = newSessionToken();
    assert.ok(t.length >= 40);
    seen.add(t);
  }
  assert.equal(seen.size, 200);
});

test("only the token digest is stable, the token itself is not stored", async () => {
  const token = newSessionToken();
  assert.equal(await tokenDigest(token), await tokenDigest(token));
  assert.notEqual(await tokenDigest(token), token);
  assert.ok(!(await tokenDigest(token)).includes(token));
});

test("a device binding differs from the raw device id", async () => {
  const salt = newSalt();
  const bound = await hashDeviceId("dev-abc123", salt);
  assert.ok(!bound.includes("dev-abc123"));
  assert.ok(digestsEqual(bound, await hashDeviceId("dev-abc123", salt)));
  assert.ok(!digestsEqual(bound, await hashDeviceId("dev-abc124", salt)));
});

test("comparison rejects different lengths instead of throwing", () => {
  assert.equal(digestsEqual("abc", "abcd"), false);
  assert.equal(digestsEqual("", "abc"), false);
  assert.equal(digestsEqual("abc", "abc"), true);
});

test("Tanzanian phone numbers normalise to one form", () => {
  const want = "0699105527";
  assert.equal(normalizePhone("0699105527"), want);
  assert.equal(normalizePhone("+255699105527"), want);
  assert.equal(normalizePhone("255699105527"), want);
  assert.equal(normalizePhone("699105527"), want);
  assert.equal(normalizePhone("0699 105 527"), want);
  assert.equal(normalizePhone("0699-105-527"), want);
});

test("a wrong phone normalises to something different", () => {
  assert.notEqual(normalizePhone("0699105528"), normalizePhone("0699105527"));
  assert.notEqual(normalizePhone("0712345678"), normalizePhone("0699105527"));
});

test("an unusable phone is refused rather than guessed at", () => {
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone("   "), null);
  assert.equal(normalizePhone("abc"), null);
  assert.equal(normalizePhone("123"), null);
});

test("normalising is stable, so it cannot drift between claim and check", () => {
  for (const input of ["0699105527", "+255699105527", "255699105527", "699105527"]) {
    assert.equal(normalizePhone(normalizePhone(input) as string), normalizePhone(input));
  }
});
