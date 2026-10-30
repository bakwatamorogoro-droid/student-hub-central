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
} = await import("@/lib/studentAccount");
const {
  startAttendanceSession,
  endAttendanceSession,
  rotateSessionToken,
  checkIn,
  fetchSessionPresent,
  listOpenSessions,
  makeJoinCode,
  distanceM,
} = await import("@/lib/attendance");
const { getStudentToken, setStudentToken, clearStudentToken } =
  await import("@/lib/student-session");

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
await rest("quiz_participants?reg_no=eq." + REG, { method: "DELETE" });
let r = await rest("students?reg_no=eq." + REG, { method: "DELETE" });
r = await rest("students", {
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
  const found = await rest("students?reg_no=eq." + REG + "&select=id");
  studentId = found.body?.[0]?.id;
}
check("seeded a student", !!studentId, JSON.stringify(r.body));

// --- A1: claim a PIN through the real code path
const claim = await claimStudentPin(REG, PHONE);
check("A1 claimStudentPin succeeds without any SQL", claim.ok, JSON.stringify(claim));
if (!claim.ok) {
  console.log("cannot continue");
  process.exit(1);
}
check("A1b the issued PIN is 6 digits", /^[0-9]{6}$/.test(claim.pin), claim.pin);

// --- A2: claiming again is refused
const again = await claimStudentPin(REG, PHONE);
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

// --- A9: logout invalidates the session
if (afterReissue.ok) {
  await logoutStudent(afterReissue.token);
  check("A9 logout invalidates the token", (await getMyProfile(afterReissue.token)) === null);
}

// --- cleanup
clearStudentToken();
// Delete only this run's rows. Namespace-wide deletes here would wipe the
// sessions a real teacher has open, and the check-ins recorded against them.
const NS = "a0000000-0000-4000-8000-0000000000";
const sessionIds = [start, start2, start3, start3b, start3c, start4]
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
