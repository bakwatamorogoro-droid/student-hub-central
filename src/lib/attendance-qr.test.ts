import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeJoinQr,
  decodeQrToken,
  encodeJoinQr,
  encodeJoinUrl,
  encodeQrToken,
  encodeTokenUrl,
  parseAttendanceQr,
} from "./attendance-qr.ts";

const ORIGIN = "https://www.islamicstudiestest.online";
const TOKEN = "a".repeat(24);

test("a live token round-trips", () => {
  assert.equal(decodeQrToken(encodeQrToken(TOKEN)), TOKEN);
});

test("a token shorter than the gate is refused", () => {
  assert.equal(decodeQrToken(encodeQrToken("short")), null);
});

test("an unrelated QR code is refused", () => {
  assert.equal(decodeQrToken("https://example.com"), null);
  assert.equal(decodeQrToken(""), null);
  assert.equal(decodeJoinQr("ISL-ATT1:" + TOKEN), null);
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
  assert.equal(decodeJoinQr(encodeQrToken(TOKEN)), null);
});

// --- the poster link a phone's own camera app has to be able to open ---------

test("the poster QR is a link to the attendance page", () => {
  const url = encodeJoinUrl("k7m2qx", ORIGIN);
  assert.equal(url, `${ORIGIN}/attendance?join=K7M2QX`);
  // A generic camera app shows the URL and offers to open it, so it must parse.
  assert.equal(new URL(url).pathname, "/attendance");
  assert.equal(new URL(url).searchParams.get("join"), "K7M2QX");
});

test("the live token QR is a link too", () => {
  const url = encodeTokenUrl(TOKEN, ORIGIN);
  assert.equal(url, `${ORIGIN}/attendance?t=${TOKEN}`);
  assert.equal(new URL(url).searchParams.get("t"), TOKEN);
});

test("a trailing slash on the origin does not double the path", () => {
  assert.equal(encodeJoinUrl("K7M2QX", ORIGIN + "/"), `${ORIGIN}/attendance?join=K7M2QX`);
});

// --- what the in-app scanner accepts -----------------------------------------

test("a scanned poster link is read as a join code", () => {
  assert.deepEqual(parseAttendanceQr(encodeJoinUrl("k7m2qx", ORIGIN)), {
    kind: "join",
    joinCode: "K7M2QX",
  });
});

test("a scanned token link is read as a token", () => {
  assert.deepEqual(parseAttendanceQr(encodeTokenUrl(TOKEN, ORIGIN)), {
    kind: "token",
    token: TOKEN,
  });
});

test("the old bare payloads still decode, so posters already on a wall keep working", () => {
  assert.deepEqual(parseAttendanceQr(encodeJoinQr("K7M2QX")), {
    kind: "join",
    joinCode: "K7M2QX",
  });
  assert.deepEqual(parseAttendanceQr(encodeQrToken(TOKEN)), { kind: "token", token: TOKEN });
});

test("a bare code read aloud off the sheet is accepted", () => {
  assert.deepEqual(parseAttendanceQr("  k7m2qx "), { kind: "join", joinCode: "K7M2QX" });
});

test("a link to somewhere else is not an attendance code", () => {
  assert.equal(parseAttendanceQr("https://example.com/attendance?join=TOOLONGCODE123"), null);
  assert.equal(parseAttendanceQr("https://evil.example/?join="), null);
  assert.equal(parseAttendanceQr("https://example.com/promo"), null);
});

test("a short token in a link is refused", () => {
  assert.equal(parseAttendanceQr(`${ORIGIN}/attendance?t=tooshort`), null);
});

test("junk is refused rather than guessed at", () => {
  assert.equal(parseAttendanceQr(""), null);
  assert.equal(parseAttendanceQr("   "), null);
  assert.equal(parseAttendanceQr("hello world"), null);
});
