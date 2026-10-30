import test from "node:test";
import assert from "node:assert/strict";
import { decodeJoinQr, decodeQrToken, encodeJoinQr, encodeQrToken } from "./attendance-qr.ts";

test("a live token round-trips", () => {
  const token = "a".repeat(24);
  assert.equal(decodeQrToken(encodeQrToken(token)), token);
});

test("a token shorter than the gate is refused", () => {
  assert.equal(decodeQrToken(encodeQrToken("short")), null);
});

test("an unrelated QR code is refused", () => {
  assert.equal(decodeQrToken("https://example.com"), null);
  assert.equal(decodeQrToken(""), null);
  assert.equal(decodeJoinQr("ISL-ATT1:" + "a".repeat(24)), null);
});

test("a printed join code round-trips, upper-cased", () => {
  assert.equal(decodeJoinQr(encodeJoinQr("k7m2qx")), "K7M2QX");
  assert.equal(decodeJoinQr("  ISL-JOIN1: ab12cd  "), "AB12CD");
});

test("a join code too short or too long is refused", () => {
  assert.equal(decodeJoinQr(encodeJoinQr("ab")), null);
  assert.equal(decodeJoinQr(encodeJoinQr("a".repeat(13))), null);
});

test("the live-token format is not accepted as a join code", () => {
  assert.equal(decodeJoinQr(encodeQrToken("b".repeat(24))), null);
});
