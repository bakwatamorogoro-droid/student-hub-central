/**
 * Biometric identity for registration: a fingerprint or a face, and the one
 * device it is tied to.
 *
 * What a browser can and cannot do here is worth stating once, because the
 * feature is easy to misread. A web page can never read a fingerprint. It can
 * ask the phone's own sensor to *confirm* one, through WebAuthn, and the phone
 * answers with a key pair rather than with any print data. So "fingerprint
 * matches the Reg Namba" cannot mean "compare this print to a stored print" —
 * there is nothing to compare. It means the phone holds a private key that was
 * enrolled for this Reg Namba, and only that phone can produce the matching
 * signature.
 *
 * Two layers therefore guard a registration:
 *
 *   1. Device binding — `regNoForDevice` refuses to enroll a Reg Namba that is
 *      already tied to a different device, and `bindDevice` refuses to re-point
 *      a device that already carries a different number. This is the part that
 *      works on every phone, because it needs no sensor at all.
 *   2. Biometric gate — `enrollBiometric`/`verifyBiometric` use the platform
 *      authenticator (Touch ID / Face ID / Android fingerprint / Windows Hello)
 *      when the device has one, so the student physically confirms it is them.
 *
 * A phone with no sensor is not locked out: it skips layer 2 and is held by
 * layer 1, which is the only guarantee that can be made on hardware without a
 * sensor. `biometricAvailable()` is what the UI asks before offering the scan.
 */

import { storageGet, storageSet } from "./safe-storage.ts";

/** Where the device↔student binding lives. One phone, one Reg Namba. */
const BINDING_KEY = "ist_device_binding";
/** The credential the platform authenticator issued for this device. */
const CREDENTIAL_KEY = "ist_biometric_credential";

export type BiometricKind = "fingerprint" | "face" | "screen" | "none";

export type BiometricAvailability = {
  /** True when the platform authenticator can be used at all. */
  available: boolean;
  /** Which prompt the device will actually show, for labelling the button. */
  kind: BiometricKind;
};

/** A device↔student binding, as it is stored. */
type DeviceBinding = {
  regNo: string;
  deviceId: string;
  boundAt: string;
};

/** A credential, as it is stored. The raw key never leaves the device. */
type StoredCredential = {
  regNo: string;
  credentialId: string;
  /** Base64 of the public key. Kept so a later check can name the credential. */
  publicKey: string | null;
  kind: BiometricKind;
  createdAt: string;
};

function b64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const s = atob(value.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Random bytes for the WebAuthn challenge. The server never sees the ceremony here. */
function randomChallenge(): BufferSource {
  const out = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(out);
  else for (let i = 0; i < out.length; i++) out[i] = Math.floor(Math.random() * 256);
  return out as BufferSource;
}

/** A stable id for this browser profile, reused so a binding survives reloads. */
export function deviceId(): string {
  let id = storageGet("ist_reg_device_id");
  if (id) return id;
  const rand =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  id = "dev_" + rand;
  storageSet("ist_reg_device_id", id);
  return id;
}

function readBinding(): DeviceBinding | null {
  const raw = storageGet(BINDING_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DeviceBinding;
    if (!parsed?.regNo || !parsed?.deviceId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readCredential(): StoredCredential | null {
  const raw = storageGet(CREDENTIAL_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredCredential;
  } catch {
    return null;
  }
}

/**
 * Which Reg Namba this device is already carrying, if any.
 *
 * `null` means the phone is free and may be bound to whoever is registering.
 * A string means it already belongs to someone — the caller shows the number so
 * the student knows which phone they are on, rather than a bare refusal.
 */
export function regNoForDevice(): string | null {
  const binding = readBinding();
  if (!binding) return null;
  return binding.deviceId === deviceId() ? binding.regNo : null;
}

export type BindResult =
  | { ok: true }
  | { ok: false; reason: "device_taken"; existingRegNo: string };

/**
 * Ties `regNo` to this phone.
 *
 * The refusal is the point of the function: a phone that already carries a
 * different number cannot take a second one. That is what makes "akiweka Reg
 * Namba nyingine ikate" true even on a phone with no fingerprint sensor.
 */
export function bindDevice(regNo: string): BindResult {
  const normalized = regNo.trim().toUpperCase();
  const existing = readBinding();
  const mine = deviceId();
  if (existing && existing.deviceId === mine && existing.regNo !== normalized) {
    return { ok: false, reason: "device_taken", existingRegNo: existing.regNo };
  }
  storageSet(
    BINDING_KEY,
    JSON.stringify({ regNo: normalized, deviceId: mine, boundAt: new Date().toISOString() }),
  );
  return { ok: true };
}

/** What the browser can offer: a real biometric, a screen lock, or nothing. */
export async function biometricAvailable(): Promise<BiometricAvailability> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) {
    return { available: false, kind: "none" };
  }
  const pkc = window.PublicKeyCredential as typeof PublicKeyCredential & {
    isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
  };
  if (typeof pkc.isUserVerifyingPlatformAuthenticatorAvailable !== "function") {
    return { available: false, kind: "none" };
  }
  try {
    const ok = await pkc.isUserVerifyingPlatformAuthenticatorAvailable();
    return { available: ok, kind: ok ? "fingerprint" : "none" };
  } catch {
    return { available: false, kind: "none" };
  }
}

export type BiometricResult =
  | { ok: true; kind: BiometricKind }
  | { ok: false; reason: "unsupported" | "cancelled" | "failed"; message?: string };

/**
 * Registers a platform credential for `regNo`.
 *
 * The credential is what the phone stores. The Reg Namba is only the label on
 * it, so a later `verifyBiometric` can ask "is this still the same student on
 * this phone?" without any print data ever leaving the device.
 */
export async function enrollBiometric(
  regNo: string,
  studentName: string,
): Promise<BiometricResult> {
  const availability = await biometricAvailable();
  if (!availability.available) return { ok: false, reason: "unsupported" };

  try {
    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: randomChallenge(),
        rp: { name: "Islamic Studies Test", id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(regNo.trim().toUpperCase()) as BufferSource,
          name: regNo.trim().toUpperCase(),
          displayName: studentName || regNo.trim().toUpperCase(),
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 }, // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null;

    if (!credential) return { ok: false, reason: "cancelled" };

    const response = credential.response as AuthenticatorAttestationResponse;
    storageSet(
      CREDENTIAL_KEY,
      JSON.stringify({
        regNo: regNo.trim().toUpperCase(),
        credentialId: b64url(credential.rawId),
        publicKey: response.getPublicKey ? b64url(response.getPublicKey() as ArrayBuffer) : null,
        kind: availability.kind,
        createdAt: new Date().toISOString(),
      } satisfies StoredCredential),
    );
    return { ok: true, kind: availability.kind };
  } catch (e) {
    const err = e as DOMException;
    if (err?.name === "NotAllowedError") return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "failed", message: err?.message };
  }
}

/**
 * Asks the phone to confirm the credential it enrolled for `regNo`.
 *
 * A device with no credential for this number is refused here rather than
 * silently passing, so the biometric step cannot be skipped by clearing storage
 * alone — the caller runs `enrollBiometric` first and only calls this to confirm.
 */
export async function verifyBiometric(regNo: string): Promise<BiometricResult> {
  const stored = readCredential();
  if (!stored) return { ok: false, reason: "unsupported" };
  if (stored.regNo !== regNo.trim().toUpperCase()) {
    return { ok: false, reason: "failed", message: "Kifaa hiki kimesajiliwa kwa namba nyingine." };
  }

  try {
    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: randomChallenge(),
        timeout: 60000,
        userVerification: "required",
        allowCredentials: [
          {
            type: "public-key",
            id: fromB64url(stored.credentialId) as BufferSource,
          },
        ],
      },
    })) as PublicKeyCredential | null;

    if (!assertion) return { ok: false, reason: "cancelled" };
    return { ok: true, kind: stored.kind };
  } catch (e) {
    const err = e as DOMException;
    if (err?.name === "NotAllowedError") return { ok: false, reason: "cancelled" };
    return { ok: false, reason: "failed", message: err?.message };
  }
}

/** True when this device already holds a credential for `regNo`. */
export function hasBiometricFor(regNo: string): boolean {
  const stored = readCredential();
  return !!stored && stored.regNo === regNo.trim().toUpperCase();
}

/** The kind stored for a Reg Namba, so the UI can name what it will ask for. */
export function storedBiometricKind(regNo: string): BiometricKind {
  const stored = readCredential();
  return stored && stored.regNo === regNo.trim().toUpperCase() ? stored.kind : "none";
}

export type RegistrationReceipt = {
  v: 1;
  kind: "ist-registration";
  regNo: string;
  fullName: string;
  semina: string | null;
  group: string | null;
  deviceId: string;
  /** How the student proved it was them: a biometric, or the device alone. */
  verified: BiometricKind;
  issuedAt: string;
};

/**
 * The payload behind the QR shown once registration is accepted.
 *
 * It carries only what the student can already see on screen — no secret — so
 * a screenshot of the code is harmless. It exists so the student leaves with a
 * scannable record the office can read without typing a Reg Namba.
 */
export function buildRegistrationReceipt(input: {
  regNo: string;
  fullName: string;
  semina?: string | null;
  group?: string | null;
  verified: BiometricKind;
}): RegistrationReceipt {
  return {
    v: 1,
    kind: "ist-registration",
    regNo: input.regNo.trim().toUpperCase(),
    fullName: input.fullName.trim(),
    semina: input.semina ?? null,
    group: input.group ?? null,
    deviceId: deviceId(),
    verified: input.verified,
    issuedAt: new Date().toISOString(),
  };
}

/** Serializes a receipt for the QR. Kept short so the code stays easy to scan. */
export function receiptPayload(receipt: RegistrationReceipt): string {
  return JSON.stringify(receipt);
}

/**
 * Reads a scanned receipt back. Used by the office-side reader; returns null on
 * anything that is not one of ours, so a random QR cannot be mistaken for one.
 */
export function parseRegistrationReceipt(raw: string): RegistrationReceipt | null {
  try {
    const parsed = JSON.parse(raw) as RegistrationReceipt;
    if (parsed?.kind !== "ist-registration" || !parsed.regNo) return null;
    return parsed;
  } catch {
    return null;
  }
}
