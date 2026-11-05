import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bindDevice,
  biometricAvailable,
  buildRegistrationReceipt,
  deviceId,
  hasBiometricFor,
  parseRegistrationReceipt,
  receiptPayload,
  regNoForDevice,
  storedBiometricKind,
  verifyBiometric,
} from "./biometric.ts";

/**
 * The device binding is the layer that has to hold on every phone, including one
 * with no fingerprint sensor, so it is the part worth pinning down with tests.
 * `node --test` has no `window`, which is exactly the no-sensor case: the
 * biometric functions must decline rather than throw, and the binding must still
 * refuse a second number.
 */

test("a fresh device carries no registration number", () => {
  assert.equal(regNoForDevice(), null);
});

test("the device id is stable across calls", () => {
  assert.equal(deviceId(), deviceId());
  assert.match(deviceId(), /^dev_/);
});

test("binding a device then reading it back returns the same number", () => {
  const res = bindDevice("mum2025-04-14106");
  assert.equal(res.ok, true);
  assert.equal(regNoForDevice(), "MUM2025-04-14106");
});

test("re-binding the same number is allowed", () => {
  assert.equal(bindDevice("MUM2025-04-14106").ok, true);
  assert.equal(bindDevice("MUM2025-04-14106").ok, true);
  assert.equal(regNoForDevice(), "MUM2025-04-14106");
});

test("a device already bound to one number refuses a different one", () => {
  bindDevice("MUM2025-04-14106");
  const res = bindDevice("MUM2025-04-99999");
  assert.equal(res.ok, false);
  assert.equal(res.reason, "device_taken");
  if (!res.ok) assert.equal(res.existingRegNo, "MUM2025-04-14106");
  // The refusal must not have moved the binding.
  assert.equal(regNoForDevice(), "MUM2025-04-14106");
});

test("binding normalizes case and spacing, so a re-typed number still matches", () => {
  bindDevice("MUM2025-04-14106");
  const res = bindDevice(" mum2025-04-14106 ");
  assert.equal(res.ok, true);
});

test("with no platform authenticator the biometric step declines, not throws", async () => {
  const availability = await biometricAvailable();
  assert.equal(availability.available, false);
  assert.equal(availability.kind, "none");
});

test("verifying with no enrolled credential fails instead of passing", async () => {
  const res = await verifyBiometric("MUM2025-04-14106");
  assert.equal(res.ok, false);
  if (!res.ok) assert.equal(res.reason, "unsupported");
});

test("no credential is reported for any number before enrolment", () => {
  assert.equal(hasBiometricFor("MUM2025-04-14106"), false);
  assert.equal(storedBiometricKind("MUM2025-04-14106"), "none");
});

test("the receipt carries only what the student can already see", () => {
  const receipt = buildRegistrationReceipt({
    regNo: "mum2025-04-14106",
    fullName: "  JOELY ELIA GLABA ",
    semina: "SEMINA 4",
    group: "GROUP 3",
    verified: "fingerprint",
  });
  assert.equal(receipt.kind, "ist-registration");
  assert.equal(receipt.regNo, "MUM2025-04-14106");
  assert.equal(receipt.fullName, "JOELY ELIA GLABA");
  assert.equal(receipt.semina, "SEMINA 4");
  assert.equal(receipt.group, "GROUP 3");
  assert.equal(receipt.verified, "fingerprint");
  assert.match(receipt.issuedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("a receipt round-trips through the QR payload", () => {
  const receipt = buildRegistrationReceipt({
    regNo: "MUM2025-04-14106",
    fullName: "ATHUMANI ATHUMANI HASHIMU",
    verified: "none",
  });
  const back = parseRegistrationReceipt(receiptPayload(receipt));
  assert.deepEqual(back, receipt);
});

test("a foreign QR is not mistaken for a registration receipt", () => {
  assert.equal(parseRegistrationReceipt("https://example.com"), null);
  assert.equal(parseRegistrationReceipt('{"kind":"something-else"}'), null);
  assert.equal(parseRegistrationReceipt("not json at all"), null);
});
