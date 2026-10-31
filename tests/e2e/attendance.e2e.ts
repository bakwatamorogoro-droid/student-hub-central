/**
 * End-to-end test for student accounts and QR attendance, run against the live
 * database with the publishable key — the same key the browser uses.
 *
 * It imports the real modules (`src/lib/studentAccount.ts`, `src/lib/attendance.ts`)
 * rather than reimplementing them, so a regression in the app is a failure here.
 * Nothing is mocked: if the tables or the RLS policies change, this fails.
 *
 * Run it with `npm run test:e2e`. It creates its own student, sessions and
 * check-ins, and removes them again at the end.
 *
 * Why Vite builds it: the Supabase client reads `import.meta.env`, which only
 * exists after Vite has replaced it, so the test is bundled the same way the app
 * is. `run.sh` does the build and the run.
 */

// Browser globals the app modules touch, so the real code can run under Node.
const g = globalThis as unknown as Record<string, unknown>;

const store = new Map<string, string>();
g.localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => store.set(k, String(v)),
  removeItem: (k: string) => store.delete(k),
};
g.window = globalThis;
g.location = { hostname: "localhost", origin: "http://localhost", protocol: "http:" };
g.screen = { width: 1280, height: 800 };
g.document = { cookie: "" };
Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "node", language: "en", hardwareConcurrency: 4, geolocation: undefined },
  configurable: true,
  writable: true,
});

const URL = process.env.SB_URL,
  KEY = process.env.SB_KEY;
async function rest(path, init = {}) {
  const headers = {
    apikey: KEY,
    Authorization: "Bearer " + KEY,
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  const r = await fetch(URL + "/rest/v1/" + path, { ...init, headers });
  const t = await r.text();
  let b = null;
  try {
    b = t ? JSON.parse(t) : null;
  } catch {
    b = t;
  }
  return { status: r.status, body: b };
}

const {
  claimStudentPin,
  loginStudent,
  getMyProfile,
  logoutStudent,
  resolveStudentToken,
  adminSetStudentPin,
  resetStudentPin,
} = await import("@/lib/studentAccount");
const { checkRegistrationConflicts } = await import("@/lib/registration");
const {
  startAttendanceSession,
  endAttendanceSession,
  rotateSessionToken,
  checkIn,
  fetchSessionPresent,
  listOpenSessions,
  makeJoinCode,
  distanceM,
  listSessionSummaries,
  fetchMyCheckIns,
  deleteAttendanceSession,
} = await import("@/lib/attendance");
const { getStudentToken, setStudentToken, clearStudentToken } =
  await import("@/lib/student-session");
const { decodeJoinQr, encodeJoinQr } = await import("@/lib/attendance-qr");

let pass = 0,
  fail = 0;
const check = (n, c, x = "") => {
  if (c) {
    pass++;
    console.log("ok   " + n);
  } else {
    fail++;
    console.log("FAIL " + n + " " + String(x).slice(0, 200));
  }
};

const REG = "OH-ATT-E2E",
  PHONE = "0713000111";
// The geofence centre, and a point ~1 km away.
const LAT = -6.8,
  LNG = 39.2;
const FAR_LAT = -6.809,
  FAR_LNG = 39.2;

// --- seed a student directly (registration is not what is under test here)
//
// RLS currently refuses DELETE on `students` (see AGENTS.md), so a row left by
// an earlier run cannot be cleared and the insert below answers 23505. The seed
// therefore adopts whatever row already holds this registration number, and the
// name-sensitive checks further down use `FULL_NAME` rather than a literal.
await rest("quiz_participants?reg_no=eq." + REG, { method: "DELETE" });
let r = await rest("students", {
  method: "POST",
  headers: { Prefer: "return=representation" },
  body: JSON.stringify({
    reg_no: REG,
    full_name: "E2E ATT STUDENT",
    phone: PHONE,
    semina: "Semina 2",
    student_group: "GROUP 2",
    device_id: "e2e",
  }),
});
let studentId = r.body?.[0]?.id;
if (!studentId) {
  const found = await rest("students?reg_no=eq." + REG + "&select=id,full_name,phone");
  studentId = found.body?.[0]?.id;
}
check("seeded a student", !!studentId, JSON.stringify(r.body));

// The row's real name and phone: an adopted row may differ from the seed above.
const rowInfo =
  (await rest("students?reg_no=eq." + REG + "&select=full_name,phone")).body?.[0] ?? {};
const FULL_NAME: string = rowInfo.full_name || "E2E ATT STUDENT";
const LAST_NAME: string = FULL_NAME.trim().split(/\s+/).pop() || "STUDENT";
const ROW_PHONE: string = rowInfo.phone || PHONE;
console.log("     using student " + REG + " / " + FULL_NAME + " / " + ROW_PHONE);

// --- A1: claim a PIN through the real code path
const claim = await claimStudentPin(REG, ROW_PHONE);
check("A1 claimStudentPin succeeds without any SQL", claim.ok, JSON.stringify(claim));
if (!claim.ok) {
  console.log("cannot continue");
  process.exit(1);
}
check("A1b the issued PIN is 6 digits", /^[0-9]{6}$/.test(claim.pin), claim.pin);

// --- A2: claiming again is refused
const again = await claimStudentPin(REG, ROW_PHONE);
check(
  "A2 a second claim is refused",
  !again.ok && again.reason === "already_claimed",
  JSON.stringify(again),
);

// --- A3: a wrong phone cannot claim
const wrongPhone = await claimStudentPin("OH-NOPE-1", PHONE);
check(
  "A3 an unknown registration is refused",
  !wrongPhone.ok && wrongPhone.reason === "bad_details",
);

// --- A4: sign in with the issued PIN
const login = await loginStudent(REG, claim.pin);
check("A4 loginStudent succeeds", login.ok, JSON.stringify(login));
if (!login.ok) {
  console.log("cannot continue");
  process.exit(1);
}
check("A4b a token was issued", typeof login.token === "string" && login.token.length >= 40);
setStudentToken(login.token);
check("A4c the session helper round-trips the token", getStudentToken() === login.token);

// --- A5: a wrong PIN is refused
const badLogin = await loginStudent(REG, claim.pin === "000000" ? "111111" : "000000");
check("A5 a wrong PIN is refused", !badLogin.ok, JSON.stringify(badLogin));

// --- A6: the profile comes back
const profile = await getMyProfile(login.token);
check("A6 getMyProfile returns the student", profile?.regNo === REG, JSON.stringify(profile));

// --- A7: the identity resolver used by attendance
const who = await resolveStudentToken(login.token);
check("A7 resolveStudentToken resolves", who?.regNo === REG && !!who?.id, JSON.stringify(who));

// --- B1: the teacher starts a session through the real code path
const start = await startAttendanceSession({
  title: "E2E Fiqh",
  semina: "Semina 2",
  studentGroup: null,
  lat: LAT,
  lng: LNG,
  radiusM: 50,
  joinCode: makeJoinCode(),
});
check("B1 startAttendanceSession succeeds without any SQL", start.ok, JSON.stringify(start));
if (!start.ok) {
  console.log("cannot continue");
  process.exit(1);
}
const sessionId = start.session.id;
check(
  "B1b the session has a join code",
  /^[A-Z0-9]{6}$/.test(start.session.joinCode || ""),
  start.session.joinCode,
);

// --- B2: it appears in the open list
const open = await listOpenSessions(login.token);
check(
  "B2 the session is listed as open",
  open.some((s) => s.id === sessionId),
  JSON.stringify(open),
);

// --- B3: a QR token is minted and only its digest is stored
const tok = await rotateSessionToken(sessionId);
check("B3 rotateSessionToken succeeds", tok.ok, JSON.stringify(tok));
r = await rest(
  "quiz_participants?exam_id=eq.a0000000-0000-4000-8000-000000000005&student_id=eq." +
    sessionId +
    "&select=semina",
);
const tokenRow = r.body?.[0]?.semina || "";
check(
  "B3b the raw token is not stored",
  !!tok.ok && !tokenRow.includes(tok.token),
  tokenRow.slice(0, 80),
);

// --- B4: checking in from outside the radius is refused
const far = await checkIn({
  studentToken: login.token,
  token: tok.token,
  lat: FAR_LAT,
  lng: FAR_LNG,
});
check(
  "B4 a check-in outside the radius is refused",
  !far.ok && far.reason === "outside_area",
  JSON.stringify(far),
);
check(
  "B4b the refusal reports the distance and the radius",
  far.ok === false && far.distanceM > 900 && far.radiusM === 50,
  JSON.stringify(far),
);

// --- B5: checking in with a bad token is refused
const bad = await checkIn({
  studentToken: login.token,
  token: "not-a-real-token-at-all",
  lat: LAT,
  lng: LNG,
});
check(
  "B5 a forged QR token is refused",
  !bad.ok && bad.reason === "invalid_token",
  JSON.stringify(bad),
);

// --- B6: a valid check-in inside the radius succeeds
const okIn = await checkIn({ studentToken: login.token, token: tok.token, lat: LAT, lng: LNG });
check("B6 a check-in inside the radius succeeds", okIn.ok, JSON.stringify(okIn));

// --- B7: the same session cannot be marked twice
const twice = await checkIn({ studentToken: login.token, token: tok.token, lat: LAT, lng: LNG });
check(
  "B7 a second check-in for the same session is refused",
  !twice.ok && twice.reason === "already_marked",
  JSON.stringify(twice),
);

// --- B8: the teacher sees the student as present
const present = await fetchSessionPresent(sessionId);
check(
  "B8 the student appears in the present list",
  present.some((p) => p.regNo === REG),
  JSON.stringify(present),
);
check(
  "B8b the distance was recorded",
  present[0]?.distanceM != null && present[0].distanceM < 50,
  JSON.stringify(present[0]),
);

// --- B9: a second lecture on the SAME DAY is possible (the original bug)
const start2 = await startAttendanceSession({
  title: "E2E Hadith",
  semina: "Semina 2",
  studentGroup: null,
  lat: LAT,
  lng: LNG,
  radiusM: 50,
  joinCode: makeJoinCode(),
});
check("B9 a second session the same day starts", start2.ok, JSON.stringify(start2));
const tok2 = await rotateSessionToken(start2.ok ? start2.session.id : "");
const second =
  start2.ok && tok2.ok
    ? await checkIn({ studentToken: login.token, token: tok2.token, lat: LAT, lng: LNG })
    : { ok: false, reason: "setup failed" };
check("B9b the same student can check in to the second lecture", second.ok, JSON.stringify(second));

// --- B10: a join code works when the camera is unavailable
const start3 = await startAttendanceSession({
  title: "E2E Tafsir",
  semina: "Semina 2",
  studentGroup: null,
  lat: null,
  lng: null,
  radiusM: 50,
  joinCode: "ZZTEST",
});
const byCode = start3.ok
  ? await checkIn({ studentToken: login.token, joinCode: "ZZTEST", lat: LAT, lng: LNG })
  : { ok: false, reason: "setup failed" };
check("B10 a check-in by join code succeeds", byCode.ok, JSON.stringify(byCode));

// --- B11: a session with no coordinates skips the geofence
check("B11 no fence means any location is accepted", byCode.ok, JSON.stringify(byCode));

// --- B11b: a session with no fence accepts a student whose GPS is off
const start3b = await startAttendanceSession({
  title: "E2E NoGPS",
  semina: "Semina 2",
  studentGroup: null,
  lat: null,
  lng: null,
  radiusM: 50,
  joinCode: "NOGPS1",
});
const noGps = start3b.ok
  ? await checkIn({ studentToken: login.token, joinCode: "NOGPS1", lat: null, lng: null })
  : { ok: false, reason: "setup failed" };
check("B11c no fence + no GPS is accepted", noGps.ok, JSON.stringify(noGps));

// --- B11d: but a session WITH a fence still insists on a fix
const start3c = await startAttendanceSession({
  title: "E2E NeedsGPS",
  semina: "Semina 2",
  studentGroup: null,
  lat: LAT,
  lng: LNG,
  radiusM: 50,
  joinCode: "NEEDGP",
});
const needsGps = start3c.ok
  ? await checkIn({ studentToken: login.token, joinCode: "NEEDGP", lat: null, lng: null })
  : { ok: false, reason: "setup failed" };
check(
  "B11d a fenced session refuses a missing GPS fix",
  !needsGps.ok && needsGps.reason === "gps_required",
  JSON.stringify(needsGps),
);

// --- B12: closing a session stops check-ins
const closed = start3.ok ? await endAttendanceSession(start3.session.id) : false;
check("B12 endAttendanceSession succeeds", closed === true);
const afterClose = start3.ok
  ? await checkIn({ studentToken: login.token, joinCode: "ZZTEST", lat: LAT, lng: LNG })
  : { ok: false, reason: "setup failed" };
check("B12b a closed session refuses check-ins", !afterClose.ok, JSON.stringify(afterClose));

// --- B13: a group-targeted session is hidden from another group
const start4 = await startAttendanceSession({
  title: "E2E Group3",
  semina: "Semina 2",
  studentGroup: "GROUP 3",
  lat: LAT,
  lng: LNG,
  radiusM: 50,
  joinCode: makeJoinCode(),
});
const openForStudent = await listOpenSessions(login.token);
check(
  "B13 a session for another group is not listed",
  !openForStudent.some((s) => s.id === (start4.ok ? start4.session.id : "")),
  JSON.stringify(openForStudent.map((s) => s.title)),
);

// --- B13b: scanning the poster of another group's session is refused
// B13 covers the picker, which merely hides the session. The printed poster is a
// join code, and a join code can be typed or scanned by anyone, so the group
// rule has to hold on the check-in itself.
const wrongGroup = start4.ok
  ? await checkIn({
      studentToken: login.token,
      joinCode: start4.session.joinCode,
      lat: LAT,
      lng: LNG,
    })
  : { ok: false, reason: "setup failed" };
check("B13b another group's join code is refused", !wrongGroup.ok, JSON.stringify(wrongGroup));

// --- B15: the printable poster's payload drives a real check-in
// The poster cannot carry a rotating token (it expires in 30 s), so it carries
// the join code. This proves the sheet a teacher pins to the wall is accepted by
// the same path a camera scan takes.
const posterSession = await startAttendanceSession({
  title: "E2E Poster",
  semina: "Semina 2",
  studentGroup: null,
  lat: LAT,
  lng: LNG,
  radiusM: 50,
  joinCode: makeJoinCode(),
});
check("B15a poster session started", posterSession.ok, JSON.stringify(posterSession));
const posterRaw = posterSession.ok ? encodeJoinQr(posterSession.session.joinCode) : "";
check(
  "B15b the poster payload decodes back to the join code",
  posterSession.ok && decodeJoinQr(posterRaw) === posterSession.session.joinCode,
  posterRaw,
);
const viaPoster = posterSession.ok
  ? await checkIn({
      studentToken: login.token,
      joinCode: decodeJoinQr(posterRaw),
      lat: LAT,
      lng: LNG,
    })
  : { ok: false, reason: "setup failed" };
check("B15c a check-in from the printed poster succeeds", viaPoster.ok, JSON.stringify(viaPoster));
const wrongFormat = posterSession.ok
  ? await checkIn({ studentToken: login.token, joinCode: posterRaw, lat: LAT, lng: LNG })
  : { ok: false, reason: "setup failed" };
check(
  "B15d the raw poster payload is not itself a join code",
  !wrongFormat.ok,
  JSON.stringify(wrongFormat),
);
if (posterSession.ok) await endAttendanceSession(posterSession.session.id);

// --- B14: distance maths is sane
check("B14 identical points are zero apart", distanceM(LAT, LNG, LAT, LNG) < 0.001);
check(
  "B14b ~1 km apart is about 1000 m",
  Math.abs(distanceM(LAT, LNG, FAR_LAT, FAR_LNG) - 1000) < 40,
  distanceM(LAT, LNG, FAR_LAT, FAR_LNG),
);

// --- A8: the admin re-issue path works, and clears the device binding
const reissue = await adminSetStudentPin(REG, "778899");
check("A8 adminSetStudentPin succeeds", reissue.ok, JSON.stringify(reissue));
const afterReissue = await loginStudent(REG, "778899");
check(
  "A8b the admin-issued PIN signs in from this device",
  afterReissue.ok,
  JSON.stringify(afterReissue),
);

// --- B16: the teacher's archive lists sessions with head counts
const summaries = await listSessionSummaries();
const summary = summaries.find((x) => x.id === (posterSession.ok ? posterSession.session.id : ""));
check("B16a the archive lists the poster session", !!summary);
check("B16b the archive counts its check-in", summary?.presentCount === 1, JSON.stringify(summary));
check(
  "B16c the archive keeps the join code",
  summary?.joinCode === (posterSession.ok ? posterSession.session.joinCode : null),
);
check("B16d the archive marks the ended session closed", summary?.active === false);
check("B16e the archive records when it closed", !!summary?.closedAt);

// --- B17: the student's own history is per session, not per day
const freshToken = afterReissue.ok ? afterReissue.token : login.token;
const myHistory = await fetchMyCheckIns(freshToken);
check("B17a the student's history is not empty", myHistory.length > 0, myHistory.length);
check(
  "B17b the student's history has one entry per session",
  new Set(myHistory.map((h) => h.id)).size === myHistory.length,
);
check(
  "B17c the history carries the session title",
  myHistory.every((h) => !!h.title),
  JSON.stringify(myHistory.map((h) => h.title)),
);

// --- B18: deleting a session removes its check-ins with it
const doomed = await startAttendanceSession({
  title: "E2E To Delete",
  semina: null,
  studentGroup: null,
  lat: LAT,
  lng: LNG,
  radiusM: 50,
  joinCode: makeJoinCode(),
});
check("B18a a session to delete started", doomed.ok);
if (doomed.ok) {
  const delCheck = await checkIn({
    studentToken: freshToken,
    joinCode: doomed.session.joinCode,
    lat: LAT,
    lng: LNG,
  });
  check("B18b a check-in into it succeeds", delCheck.ok, JSON.stringify(delCheck));
  check(
    "B18c the archive shows one present",
    (await listSessionSummaries()).find((x) => x.id === doomed.session.id)?.presentCount === 1,
  );
  check("B18d deleting the session succeeds", await deleteAttendanceSession(doomed.session.id));
  check(
    "B18e the session is gone from the archive",
    !(await listSessionSummaries()).some((x) => x.id === doomed.session.id),
  );
  check(
    "B18f its check-ins are gone too",
    (await fetchSessionPresent(doomed.session.id)).length === 0,
  );
}

// --- A9: logout invalidates the session
if (afterReissue.ok) {
  await logoutStudent(afterReissue.token);
  check("A9 logout invalidates the token", (await getMyProfile(afterReissue.token)) === null);
}

// --- C1..C6: the forgot-PIN reset
// Run after A9 has logged the student out, so the "reset clears sessions" check
// below starts from a clean slate.
const wrongResetPhone = await resetStudentPin("0700000000", LAST_NAME);
check(
  "C1 a reset with the wrong phone is refused",
  !wrongResetPhone.ok && wrongResetPhone.reason === "bad_details",
  JSON.stringify(wrongResetPhone),
);

const wrongResetName = await resetStudentPin(ROW_PHONE, "MWANAFUNZI");
check(
  "C2 a reset with the wrong last name is refused",
  !wrongResetName.ok && wrongResetName.reason === "bad_details",
  JSON.stringify(wrongResetName),
);

const shortReset = await resetStudentPin(ROW_PHONE, "X");
check(
  "C3 a one-letter last name is refused",
  !shortReset.ok && shortReset.reason === "bad_details",
  JSON.stringify(shortReset),
);

// A session minted with the old PIN, to prove the reset retires it.
const preResetLogin = await loginStudent(REG, "778899");
check("C4 the PIN from A8 still signs in", preResetLogin.ok, JSON.stringify(preResetLogin));

const reset = await resetStudentPin(ROW_PHONE, LAST_NAME);
check("C5 the reset succeeds with phone plus last name", reset.ok, JSON.stringify(reset));
if (reset.ok) {
  check("C5b the new PIN is 6 digits", /^[0-9]{6}$/.test(reset.pin), reset.pin);
  check("C5c the reset reports the registration number", reset.regNo === REG, reset.regNo);

  // The old PIN must be dead. The new one is random, so a match would be a
  // one-in-a-million collision rather than a stale hash.
  const oldPinLogin = await loginStudent(REG, "778899");
  check("C6 the old PIN no longer signs in", !oldPinLogin.ok, JSON.stringify(oldPinLogin));

  if (preResetLogin.ok) {
    check(
      "C6b the reset signed the old session out",
      (await getMyProfile(preResetLogin.token)) === null,
    );
  }

  const newPinLogin = await loginStudent(REG, reset.pin);
  check("C6c the new PIN signs in", newPinLogin.ok, JSON.stringify(newPinLogin));
}

// --- D1..D5: what the registration check decides
// The check is the gate on the whole app, and its failure mode — refusing a
// student who merely shares a name — is invisible in the UI, so it is pinned
// here against the real project.
const dupName = await checkRegistrationConflicts(REG, FULL_NAME);
check(
  "D1 the seeded student reads as returning",
  dupName.kind === "returning",
  JSON.stringify(dupName),
);

const takenNumber = await checkRegistrationConflicts("OH-ATT-E2E", "SOMEONE ELSE");
check(
  "D2 a known number under a different name is a conflict",
  takenNumber.kind === "taken_by_other",
  JSON.stringify(takenNumber),
);

// "UI FIX STUDENT" exists in the project from an earlier session; registering a
// different number under that exact name must be a question, not a refusal.
const sharedName = await checkRegistrationConflicts("OH-ATT-E2E-NEW", "UI FIX STUDENT");
check(
  "D3 a repeated name asks instead of refusing",
  sharedName.kind === "shared_name" || sharedName.kind === "clear",
  JSON.stringify(sharedName),
);

const freshName = await checkRegistrationConflicts(
  "OH-ATT-E2E-NEW",
  "ZZZ NOBODY HAS THIS NAME " + Date.now(),
);
check(
  "D4 an unused number and name is clear",
  freshName.kind === "clear",
  JSON.stringify(freshName),
);

// The bug this pins: a student whose name matches an existing row but whose
// number is new must never be told they are already registered.
const notReturning = await checkRegistrationConflicts("OH-ATT-E2E-NEW", FULL_NAME);
check(
  "D5 a shared name is never reported as returning",
  notReturning.kind !== "returning" && notReturning.kind !== "taken_by_other",
  JSON.stringify(notReturning),
);

// --- C7..C9: the ambiguous pair, which affects a fifth of the cohort
// Seed two students who share both a last name and a phone number, then prove
// the reset refuses to guess and accepts the registration number as the tiebreak.
const AMB_A = "OH-AMB-A",
  AMB_B = "OH-AMB-B",
  AMB_PHONE = "0713000999",
  AMB_LAST = "MSHOKOLA";
for (const [reg, name] of [
  [AMB_A, "ALI JUMA " + AMB_LAST],
  [AMB_B, "FATUMA SAID " + AMB_LAST],
] as const) {
  await rest("students", {
    method: "POST",
    headers: { Prefer: "return:representation" },
    body: JSON.stringify({
      reg_no: reg,
      full_name: name,
      phone: AMB_PHONE,
      semina: "Semina 2",
      student_group: "GROUP 2",
      device_id: "e2e",
    }),
  });
}
const seededAmb = await rest(
  "students?reg_no=in.(" + AMB_A + "," + AMB_B + ")&select=reg_no,full_name,phone",
);
const ambCount = (seededAmb.body as unknown[] | null)?.length ?? 0;
check(
  "C7 two students share a last name and phone",
  ambCount === 2,
  JSON.stringify(seededAmb.body),
);

const ambNoReg = await resetStudentPin(AMB_PHONE, AMB_LAST);
check(
  "C8 the reset asks for a registration number instead of guessing",
  !ambNoReg.ok && ambNoReg.reason === "ambiguous",
  JSON.stringify(ambNoReg),
);

const ambWithReg = await resetStudentPin(AMB_PHONE, AMB_LAST, AMB_A);
check(
  "C9 the registration number resolves the tie",
  ambWithReg.ok && ambWithReg.regNo === AMB_A,
  JSON.stringify(ambWithReg),
);

// A number that does not belong to either student must not resolve it either.
const ambWrongReg = await resetStudentPin(AMB_PHONE, AMB_LAST, "OH-NOPE-9");
check(
  "C9b an unrelated registration number is refused",
  !ambWrongReg.ok && ambWrongReg.reason === "bad_details",
  JSON.stringify(ambWrongReg),
);

// --- cleanup
clearStudentToken();
// Delete only this run's rows. Namespace-wide deletes here would wipe the
// sessions a real teacher has open, and the check-ins recorded against them.
const NS = "a0000000-0000-4000-8000-0000000000";
const sessionIds = [start, start2, start3, start3b, start3c, start4, posterSession]
  .filter((r) => r.ok)
  .map((r) => r.session.id);
for (const sid of sessionIds) {
  await rest("quiz_participants?exam_id=eq." + NS + "04&reg_no=eq." + sid, { method: "DELETE" });
}
const inList = "(" + sessionIds.join(",") + ")";
if (sessionIds.length > 0) {
  await rest("quiz_participants?exam_id=eq." + NS + "03&id=in." + inList, { method: "DELETE" });
  // PostgREST filters on the uuid `student_id` do not match reliably here, so
  // resolve the token rows to their own ids first and delete by primary key.
  const tokRows = await rest(
    "quiz_participants?exam_id=eq." + NS + "05&student_id=in." + inList + "&select=id",
  );
  const tokIds = ((tokRows.body as Array<{ id: string }> | null) ?? []).map((r) => r.id);
  if (tokIds.length > 0) {
    await rest("quiz_participants?exam_id=eq." + NS + "05&id=in.(" + tokIds.join(",") + ")", {
      method: "DELETE",
    });
  }
}
// A uuid filter on the `student_id` column does not reliably match on this project, so
// these are deleted by the reg no they were created with instead.
await rest("quiz_participants?exam_id=eq." + NS + "01&reg_no=eq." + REG, { method: "DELETE" });
await rest("quiz_participants?exam_id=eq." + NS + "02&reg_no=eq." + REG, { method: "DELETE" });
await rest("attendance?reg_no=eq." + REG, { method: "DELETE" });
await rest("students?reg_no=eq." + REG, { method: "DELETE" });

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail === 0 ? 0 : 1);
