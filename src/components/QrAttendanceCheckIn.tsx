import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { QrScanner } from "@/components/QrScanner";
import { FaceCheck } from "@/components/FaceCheck";
import { WizardProgress, type WizardStep } from "@/components/StepWizard";
import { parseAttendanceQr, type ScannedAttendance } from "@/lib/attendance-qr";
import {
  checkIn,
  getPosition,
  listOpenSessions,
  type AttendanceFailure,
  type OpenSession,
} from "@/lib/attendance";
import { loginStudentForAttendance } from "@/lib/studentAccount";
import { findStudentsByQuery } from "@/lib/studentSearch";
import { getStudentToken, setStudentToken } from "@/lib/student-session";
import { toast } from "@/lib/toast";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  Loader2,
  LogIn,
  MapPin,
  PartyPopper,
  QrCode,
  ScanFace,
  ShieldAlert,
  UserCheck,
  XCircle,
} from "lucide-react";

/** Messages the student sees when a check-in is refused. */
const FAILURE_TEXT: Record<AttendanceFailure, string> = {
  not_ready:
    "Mfumo wa mahudhurio haujawashwa bado. Mwambie mwalimu au msimamizi aendeshe usanidi wa mahudhurio.",
  invalid_token: "QR au msimbo haitambuliki. Hakikisha ni wa kipindi kinachoendelea.",
  expired_token: "QR hii imeisha muda wake. Scan tena QR ya sasa.",
  session_closed: "Kipindi hiki kimefungwa. Huwezi kuhudhuria kipindi kilichofungwa.",
  not_registered: "Haujatambuliwa kama mwanafunzi. Weka Reg Namba yako sahihi, kisha ujaribu tena.",
  gps_required:
    "Umbali hauwezi kuthibitishwa. Ruhusu GPS, na hakikisha kipindi kina eneo la darasa.",
  outside_area: "Uko nje ya eneo lililoruhusiwa la darasa. Sogeza karibu na mwalimu.",
  wrong_group: "Kipindi hiki ni cha group lingine. Hudhuria kipindi cha group lako.",
  already_marked: "Tayari umehudhuria kipindi hiki. Mahudhurio yanarekodiwa mara moja tu.",
};

type Done = {
  fullName: string;
  regNo: string;
  course: string | null;
  distanceM: number;
  checkInAt: string;
  semina: string | null;
  faceMethod: string;
};

/**
 * What the Reg Namba lookup found, shown so the student confirms it is them.
 */
type Identity = {
  fullName: string;
  regNo: string;
  course: string | null;
  semina: string | null;
  studentGroup: string | null;
};

/**
 * The session the student means.
 *
 * `session` is a tap on one of the listed open sessions, including the Friday
 * lecture, which `checkIn` accepts by id and creates on first tap.
 */
type Chosen = ScannedAttendance | { kind: "session"; sessionId: string; label: string };

/**
 * `onCheckedIn` fires after a successful check-in so a host page can refresh
 * whatever it shows about attendance — the history list on /attendance, for one.
 * Optional, so the component still drops onto a page with nothing to refresh.
 *
 * `initialJoinCode` / `initialToken` come from a scanned poster link, so opening
 * `/attendance?join=K7M2QX` lands the student already holding that session's
 * code instead of asking them to type it.
 *
 * The order is the one the owner asked for: scan the session's QR, say who you
 * are, prove a live face is there, then see the confirmation. The QR comes first
 * because a poster is what the student is standing in front of; identity second
 * because the scan only says *which* session, never *who*; the face third because
 * it is the check that the person who typed the number is the person present.
 */
export function QrAttendanceCheckIn({
  onCheckedIn,
  initialJoinCode,
  initialToken,
}: {
  onCheckedIn?: () => void;
  initialJoinCode?: string | null;
  initialToken?: string | null;
} = {}) {
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [failure, setFailure] = useState<{
    reason: AttendanceFailure;
    distanceM?: number;
    radiusM?: number;
  } | null>(null);
  const [code, setCode] = useState(initialJoinCode ?? "");
  const [sessions, setSessions] = useState<OpenSession[]>([]);
  const [studentToken, setTokenState] = useState<string | null>(() => getStudentToken());

  /**
   * The session the student picked, whether by scanning, typing a code, or
   * tapping one of the open sessions listed on the page.
   */
  const [chosen, setChosen] = useState<Chosen | null>(
    initialToken
      ? { kind: "token", token: initialToken }
      : initialJoinCode
        ? { kind: "join", joinCode: initialJoinCode }
        : null,
  );

  // Identity, looked up from the Reg Namba so the student sees a name and a
  // course rather than a bare confirmation.
  const [regNo, setRegNo] = useState("");
  const [looking, setLooking] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const identified = !!studentToken && !!identity;

  /**
   * The four steps, in the owner's order: scan, identify, face, finish.
   *
   * The face step sits last before the record is written, because it is the one
   * that has to happen *at* the session, with the student present.
   */
  const steps: WizardStep[] = [
    { key: "scan", title: "Scan QR", hint: "Skani QR ya kipindi au andika msimbo wake" },
    { key: "who", title: "Reg Namba", hint: "Weka Reg Namba yako ili tuone taarifa zako" },
    { key: "face", title: "Sura yako", hint: "Lazima: mfumo ujiscan ukutambue" },
    { key: "done", title: "Hongera", hint: "Mahudhurio yako yamekamilika" },
  ];

  const [step, setStep] = useState(0);

  const refreshSessions = useCallback(async () => {
    const token = getStudentToken();
    const list = await listOpenSessions(token ?? undefined);
    // Without a token the student's group is unknown, so only the sessions that
    // are open to everyone (the Friday lecture) are offered for a tap. The
    // group-filtered ones still appear once they have signed in.
    setSessions(token ? list : list.filter((s) => s.openToAll));
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions, done]);

  const record = useCallback(
    async (
      run: (fix: {
        lat: number | null;
        lng: number | null;
        accuracy: number | null;
      }) => Promise<Awaited<ReturnType<typeof checkIn>>>,
      // Passed in rather than read from state: `submit` sets the state and calls
      // this in the same tick, so a state read here would still see the old value
      // and the record would always say "none".
      faceMethod: string,
    ) => {
      setBusy(true);
      setFailure(null);
      try {
        // A missing fix is not fatal here: only a session with a geofence needs
        // it, and the library is the side that knows which sessions those are.
        const fix = await getPosition();
        const res = await run({
          lat: fix?.lat ?? null,
          lng: fix?.lng ?? null,
          accuracy: fix?.accuracy ?? null,
        });
        if (res.ok) {
          setDone({
            fullName: res.fullName,
            regNo: identity?.regNo ?? regNo.trim().toUpperCase(),
            course: identity?.course ?? null,
            distanceM: res.distanceM,
            checkInAt: res.checkInAt,
            semina: res.semina,
            faceMethod,
          });
          setStep(3);
          toast.success("Mahudhurio yamekamilika ✓");
          onCheckedIn?.();
        } else {
          setFailure({ reason: res.reason, distanceM: res.distanceM, radiusM: res.radiusM });
          // A refused check-in sends the student back to the step that can fix
          // it, rather than leaving them on a face screen that already did its job.
          if (res.reason === "already_marked" || res.reason === "wrong_group") setStep(0);
          else if (res.reason === "not_registered") setStep(1);
        }
      } finally {
        setBusy(false);
      }
    },
    [identity, onCheckedIn, regNo],
  );

  /** Writes the attendance. Called once the face step has passed. */
  const submit = useCallback(
    async (method: string) => {
      const st = getStudentToken();
      if (!st || !chosen) return;
      await record(
        (fix) =>
          chosen.kind === "join"
            ? checkIn({
                studentToken: st,
                joinCode: chosen.joinCode,
                lat: fix.lat,
                lng: fix.lng,
                accuracy: fix.accuracy,
              })
            : chosen.kind === "session"
              ? checkIn({
                  studentToken: st,
                  sessionId: chosen.sessionId,
                  lat: fix.lat,
                  lng: fix.lng,
                  accuracy: fix.accuracy,
                })
              : checkIn({
                  studentToken: st,
                  token: chosen.token,
                  lat: fix.lat,
                  lng: fix.lng,
                  accuracy: fix.accuracy,
                }),
        method,
      );
    },
    [chosen, record],
  );

  /**
   * Step 1 → step 2. A scan, a typed code or a tapped session records which
   * session the student means and moves them on; the check-in itself waits for
   * the face step.
   */
  const chooseSession = useCallback((picked: Chosen) => {
    setChosen(picked);
    setFailure(null);
    setScanning(false);
    setStep(1);
  }, []);

  const handleToken = useCallback(
    (raw: string) => {
      setScanning(false);
      const scanned = parseAttendanceQr(raw);
      if (!scanned) {
        setFailure({ reason: "invalid_token" });
        return;
      }
      chooseSession(scanned);
    },
    [chooseSession],
  );

  const handleCode = useCallback(() => {
    if (code.trim().length < 4) {
      toast.error("Andika msimbo wa kipindi");
      return;
    }
    chooseSession({ kind: "join", joinCode: code.trim() });
  }, [code, chooseSession]);

  /**
   * A tap on one of the listed open sessions — a class session or the Friday
   * lecture. It carries the id, which is the one thing `checkIn` needs, so the
   * student still goes through the face step rather than around it.
   */
  const chooseListedSession = useCallback(
    (s: OpenSession) => {
      chooseSession({ kind: "session", sessionId: s.id, label: s.title });
    },
    [chooseSession],
  );

  /**
   * Step 2: look the Reg Namba up and show who it belongs to.
   *
   * The lookup is the only check now that the phone is gone, so it is worth
   * showing the name and course back: that is what makes "is this me?"
   * answerable, and it catches a mistyped Reg Namba before the face step.
   */
  const lookUp = useCallback(async () => {
    const wanted = regNo.trim();
    if (wanted.length < 3) {
      toast.error("Weka Reg Namba yako");
      return;
    }
    setLooking(true);
    setFailure(null);
    try {
      const rows = await findStudentsByQuery(wanted);
      const exact = rows.find(
        (r) =>
          String(r.reg_no ?? "")
            .trim()
            .toUpperCase() === wanted.toUpperCase(),
      );
      const row = exact ?? rows[0];
      if (!row) {
        setIdentity(null);
        toast.error("Reg Namba hii haipo kwenye mfumo. Angalia vizuri kisha ujaribu tena.");
        return;
      }
      setIdentity({
        fullName: String(row.full_name ?? ""),
        regNo: String(row.reg_no ?? "").trim(),
        course: row.course ?? null,
        semina: row.semina ?? null,
        studentGroup: row.student_group ?? null,
      });
    } finally {
      setLooking(false);
    }
  }, [regNo]);

  /**
   * Step 2 → step 3. Signs the student in so the check-in has an identity to
   * write against, then moves on to the face step.
   *
   * The Reg Namba alone is the identity here — the owner removed the phone
   * confirmation. `loginStudentForAttendance` documents what that costs.
   */
  const signIn = useCallback(async () => {
    if (!identity) return;
    setSigningIn(true);
    try {
      const res = await loginStudentForAttendance(identity.regNo);
      if (!res.ok) {
        toast.error(
          res.reason === "not_ready"
            ? "Mfumo haupatikani kwa sasa. Mwambie mwalimu au msimamizi, kisha ujaribu tena."
            : "Reg Namba hii haipo kwenye mfumo. Angalia vizuri kisha ujaribu tena.",
        );
        return;
      }
      setStudentToken(res.token);
      setTokenState(res.token);
      toast.success(`Karibu ${res.fullName}`);
      // Now that the student is known, the group-filtered sessions can be
      // listed too, not just the ones open to everyone.
      void refreshSessions();
      setStep(2);
    } finally {
      setSigningIn(false);
    }
  }, [identity, refreshSessions]);

  const chosenLabel = chosen
    ? chosen.kind === "join"
      ? chosen.joinCode
      : chosen.kind === "session"
        ? chosen.label
        : "QR ya kipindi"
    : "";

  // ---------------------------------------------------------------
  // Step 4: the congratulations screen
  // ---------------------------------------------------------------

  if (done) {
    return (
      <Card className="border-2 border-emerald-500/40">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15">
            <PartyPopper className="h-11 w-11 text-emerald-600 dark:text-emerald-400" />
          </span>
          <div>
            <h2 className="text-xl font-black text-emerald-700 dark:text-emerald-400">
              Hongera! Umefanikiwa mahudhurio
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {new Date(done.checkInAt).toLocaleString("sw-TZ", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
              {done.semina ? ` • ${done.semina}` : ""}
            </p>
          </div>

          <div className="w-full max-w-sm space-y-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-left text-sm">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              <span className="font-semibold">{done.fullName}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <GraduationCap className="h-4 w-4 shrink-0" />
              <span className="font-mono text-xs">{done.regNo}</span>
            </div>
            {done.course && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <BookOpen className="h-4 w-4 shrink-0" />
                <span className="text-xs">{done.course}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="text-xs">Umbali uliothibitishwa: {Math.round(done.distanceM)}m</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <ScanFace className="h-4 w-4 shrink-0" />
              <span className="text-xs">
                Uthibitisho wa sura:{" "}
                {done.faceMethod === "face_detector" ? "kipimo cha uso" : "mwendo wa kamera"}
              </span>
            </div>
          </div>

          <Badge className="bg-emerald-600 text-[10px] uppercase">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Mahudhurio yamerekodiwa
          </Badge>

          <Button
            variant="outline"
            onClick={() => {
              setDone(null);
              setChosen(null);
              setIdentity(null);
              setRegNo("");
              setStep(0);
            }}
          >
            Hudhuria kipindi kingine
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="h-4 w-4" /> Hudhuria kwa QR Code
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Hatua nne: skani QR, weka Reg Namba yako, thibitisha sura yako (lazima), kisha mahudhurio
          yanakamilika.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <WizardProgress
          steps={steps}
          current={step}
          onJump={(i) => {
            // Only a step already reached can be jumped to, and the face step is
            // only reachable once identity is settled.
            if (i < step && (i <= 1 || identified)) setStep(i);
          }}
        />

        {failure && (
          <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
            <XCircle className="h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-destructive">{FAILURE_TEXT[failure.reason]}</p>
              {failure.reason === "gps_required" && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Kipindi hiki kina eneo. Ruhusu GPS kwenye simu yako, kisha ujaribu tena.
                </p>
              )}
              {failure.reason === "outside_area" && failure.distanceM != null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Uko mita {Math.round(failure.distanceM)} kutoka darasani; ruhusa ni mita{" "}
                  {failure.radiusM ?? 50}.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------ Step 1: scan */}
        {step === 0 && (
          <>
            {chosen && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-sm">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  Kipindi: <b className="font-mono">{chosenLabel}</b>
                </span>
              </div>
            )}

            {sessions.length > 0 && !scanning && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  Vipindi vinavyoendelea sasa — bofya kimoja kuhudhuria
                </p>
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => chooseListedSession(s)}
                    className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/60 px-3 py-2 text-left text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    <span className="truncate font-medium">{s.title}</span>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                      {s.studentGroup || "Wote"} • {s.radiusM}m
                    </span>
                  </button>
                ))}
              </div>
            )}

            {scanning ? (
              <QrScanner
                onResult={handleToken}
                onError={(m) => {
                  setScanning(false);
                  toast.error(m);
                }}
              />
            ) : (
              <>
                <Button onClick={() => setScanning(true)} className="w-full">
                  <QrCode className="h-4 w-4" /> Fungua kamera kuscan QR
                </Button>

                <div className="space-y-2 rounded-xl border border-border p-3">
                  <Label htmlFor="join-code" className="text-xs">
                    Huna kamera? Andika msimbo wa kipindi
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="join-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="Mfano K7M2QX"
                      className="font-mono tracking-widest"
                      maxLength={12}
                    />
                    <Button
                      variant="outline"
                      onClick={handleCode}
                      disabled={code.trim().length < 4}
                    >
                      Endelea
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Mwalimu husoma msimbo kwa sauti. Umbali unahitajika sawa na wa QR.
                  </p>
                </div>

                <p className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
                  <MapPin className="h-3 w-3" /> GPS itatumika kuthibitisha eneo lako
                </p>
                <div className="flex gap-2 rounded-lg border border-border bg-muted/40 p-3">
                  <ShieldAlert className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-[11px] text-muted-foreground">
                    Mahudhurio yanarekodiwa mara moja tu kwa kipindi. QR inabadilika mara kwa mara,
                    kwa hiyo picha iliyotumwa kwa mwenzako haitafanya kazi.
                  </p>
                </div>
              </>
            )}
          </>
        )}

        {/* -------------------------------------- Step 2: Reg Namba + details */}
        {step === 1 && (
          <div className="space-y-3">
            {!identity ? (
              <>
                <div className="flex gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <ShieldAlert className="h-5 w-5 shrink-0 text-primary" />
                  <div className="text-sm">
                    <p className="font-medium">Weka Reg Namba yako</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Tutaonyesha jina lako na kozi yako ili uthibitishe ni wewe, kisha
                      utathibitisha sura yako.
                    </p>
                  </div>
                </div>
                <div>
                  <Label htmlFor="qr-reg" className="text-xs">
                    Reg Namba
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="qr-reg"
                      value={regNo}
                      onChange={(e) => setRegNo(e.target.value)}
                      placeholder="Mfano MUM2025-04-14106"
                      autoComplete="username"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") lookUp();
                      }}
                    />
                    <Button variant="outline" onClick={lookUp} disabled={looking}>
                      {looking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Tafuta"}
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2 rounded-xl border border-emerald-500/35 bg-emerald-500/5 p-3">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    <UserCheck className="h-3.5 w-3.5" /> Taarifa zako
                  </div>
                  <div className="flex items-start gap-2">
                    <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{identity.fullName}</p>
                      <p className="font-mono text-xs text-muted-foreground">{identity.regNo}</p>
                    </div>
                  </div>
                  {identity.course && (
                    <div className="flex items-start gap-2">
                      <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <p className="min-w-0 text-xs">{identity.course}</p>
                    </div>
                  )}
                  {(identity.semina || identity.studentGroup) && (
                    <p className="text-[11px] text-muted-foreground">
                      {[identity.semina, identity.studentGroup].filter(Boolean).join(" • ")}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIdentity(null);
                    }}
                  >
                    Badilisha
                  </Button>
                  <Button onClick={signIn} disabled={signingIn} className="flex-1 gap-1.5">
                    {signingIn ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LogIn className="h-4 w-4" />
                    )}
                    Thibitisha ni mimi
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Kisha utathibitisha sura yako kwenye hatua inayofuata.
                </p>
              </>
            )}
          </div>
        )}

        {/* ------------------------------------------------ Step 3: face */}
        {step === 2 && (
          <>
            {busy ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">Inathibitisha eneo lako na kurekodi mahudhurio…</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 p-2.5 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="min-w-0 truncate">
                    {identity?.fullName} — <b className="font-mono">{chosenLabel}</b>
                  </span>
                </div>
                <FaceCheck onVerified={(method) => void submit(method)} />
                <Button
                  variant="outline"
                  onClick={() => {
                    setFailure(null);
                    setStep(1);
                  }}
                  className="w-full gap-1.5"
                >
                  <ArrowLeft className="h-4 w-4" /> Nyuma
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Uthibitisho wa sura ni lazima. Mahudhurio yanarekodiwa mara tu sura
                  inapothibitishwa.
                </p>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
