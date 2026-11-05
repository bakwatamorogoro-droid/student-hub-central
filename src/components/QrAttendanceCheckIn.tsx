import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QrScanner } from "@/components/QrScanner";
import { WizardNav, WizardProgress, type WizardStep } from "@/components/StepWizard";
import { parseAttendanceQr, type ScannedAttendance } from "@/lib/attendance-qr";
import {
  checkIn,
  getPosition,
  listOpenSessions,
  type AttendanceFailure,
  type OpenSession,
} from "@/lib/attendance";
import { loginStudentByPhone } from "@/lib/studentAccount";
import { CheckCircle2, Loader2, LogIn, MapPin, QrCode, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { getStudentToken, setStudentToken } from "@/lib/student-session";

/** Messages the student sees when a check-in is refused. */
const FAILURE_TEXT: Record<AttendanceFailure, string> = {
  not_ready:
    "Mfumo wa mahudhurio haujawashwa bado. Mwambie mwalimu au msimamizi aendeshe usanidi wa mahudhurio.",
  invalid_token: "QR au msimbo haitambuliki. Hakikisha ni wa kipindi kinachoendelea.",
  expired_token: "QR hii imeisha muda wake. Scan tena QR ya sasa.",
  session_closed: "Kipindi hiki kimefungwa. Huwezi kuhudhuria kipindi kilichofungwa.",
  not_registered:
    "Haujatambuliwa kama mwanafunzi. Weka Reg Namba na namba yako ya simu kisha ujaribu tena.",
  gps_required:
    "Umbali hauwezi kuthibitishwa. Ruhusu GPS, na hakikisha kipindi kina eneo la darasa.",
  outside_area: "Uko nje ya eneo lililoruhusiwa la darasa. Sogeza karibu na mwalimu.",
  wrong_group: "Kipindi hiki ni cha group lingine. Hudhuria kipindi cha group lako.",
  already_marked: "Tayari umehudhuria kipindi hiki. Mahudhurio yanarekodiwa mara moja tu.",
};

type Done = { fullName: string; distanceM: number; checkInAt: string; semina: string | null };

/**
 * `onCheckedIn` fires after a successful check-in so a host page can refresh
 * whatever it shows about attendance — the history list on /attendance, for one.
 * Optional, so the component still drops onto a page with nothing to refresh.
 *
 * `initialJoinCode` / `initialToken` come from a scanned poster link, so opening
 * `/attendance?join=K7M2QX` lands the student already holding that session's
 * code instead of asking them to type it.
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

  // A scan that arrived before sign-in waits here until the student is signed in.
  const pendingRef = useRef<ScannedAttendance | null>(
    initialToken
      ? { kind: "token", token: initialToken }
      : initialJoinCode
        ? { kind: "join", joinCode: initialJoinCode }
        : null,
  );

  // Identity is skipped when the student is already signed in — a returning
  // student, or one arriving from a scanned poster link.
  const [step, setStep] = useState(() => {
    if (!getStudentToken()) return 0;
    return pendingRef.current ? 2 : 1;
  });

  // Sign-in happens on this page rather than sending the student to /account and
  // back: a scanned link arrives with a session to join, and a detour loses it.
  // The proof is the phone the school holds, so there is no PIN to remember.
  const [regNo, setRegNo] = useState("");
  const [phone, setPhone] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  // The session the student picked on the pick step and is about to confirm.
  const [chosen, setChosen] = useState<ScannedAttendance | null>(pendingRef.current);

  /** Whether the student has settled who they are; the rail's first step. */
  const identified = !!studentToken;

  /**
   * The three steps a student walks: say who they are, say which session, then
   * confirm it.
   *
   * Identity is its own step because a session cannot be joined without it — and
   * a scanned poster link already carries the code, so once the student is signed
   * in the pick step has nothing left to ask. Splitting it out also means the rail
   * shows why the scan button is not live yet.
   */
  const steps: WizardStep[] = [
    { key: "who", title: "Jitambulishe", hint: "Thibitisha ni wewe kwa Reg Namba na simu yako" },
    { key: "pick", title: "Kipindi", hint: "Skani QR au andika msimbo wa kipindi" },
    { key: "confirm", title: "Thibitisha", hint: "Ruhusu GPS na hudhuria" },
  ];

  const refreshSessions = useCallback(async () => {
    const token = getStudentToken();
    if (!token) {
      setSessions([]);
      return;
    }
    setSessions(await listOpenSessions(token));
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
            distanceM: res.distanceM,
            checkInAt: res.checkInAt,
            semina: res.semina,
          });
          toast.success("Mahudhurio yamekamilika ✓");
          onCheckedIn?.();
        } else {
          setFailure({ reason: res.reason, distanceM: res.distanceM, radiusM: res.radiusM });
        }
      } finally {
        setBusy(false);
      }
    },
    [onCheckedIn],
  );

  const runScan = useCallback(
    async (scanned: ScannedAttendance, st: string) => {
      await record((fix) =>
        scanned.kind === "join"
          ? checkIn({
              studentToken: st,
              joinCode: scanned.joinCode,
              lat: fix.lat,
              lng: fix.lng,
              accuracy: fix.accuracy,
            })
          : checkIn({
              studentToken: st,
              token: scanned.token,
              lat: fix.lat,
              lng: fix.lng,
              accuracy: fix.accuracy,
            }),
      );
    },
    [record],
  );

  /**
   * Pick step → confirm step. A scan or a typed code no longer checks the student
   * in on the spot; it records which session they mean and moves them on, so the
   * check-in is always a deliberate second tap.
   */
  const chooseSession = useCallback((scanned: ScannedAttendance) => {
    setChosen(scanned);
    setFailure(null);
    setScanning(false);
    setStep(2);
  }, []);

  const handleToken = useCallback(
    async (raw: string) => {
      setScanning(false);
      const scanned = parseAttendanceQr(raw);
      if (!scanned) {
        setFailure({ reason: "invalid_token" });
        return;
      }
      // Identity still comes from a real sign-in; the scan only says which
      // session. A scanned link just spares the student the trip to /account.
      const st = getStudentToken();
      if (!st) {
        pendingRef.current = scanned;
        if (scanned.kind === "join") setCode(scanned.joinCode);
        setStep(0);
        toast.error("Weka Reg Namba na namba yako ya simu, kisha mahudhurio yataendelea.");
        return;
      }
      chooseSession(scanned);
    },
    [chooseSession],
  );

  // Signing in completes the identity step: a scan that was waiting on sign-in
  // goes straight to confirm, and otherwise the student lands on the pick step.
  useEffect(() => {
    if (!studentToken) return;
    const scanned = pendingRef.current;
    if (scanned) {
      pendingRef.current = null;
      chooseSession(scanned);
    } else {
      setStep((s) => (s === 0 ? 1 : s));
    }
  }, [studentToken, chooseSession]);

  /**
   * Signs the student in with the two details they already know: their Reg Namba
   * and the phone the school holds. No PIN is needed here — the phone on file is
   * the proof, and the session is minted exactly as a PIN sign-in would mint it.
   */
  const signIn = useCallback(async () => {
    if (!regNo.trim()) return toast.error("Weka Reg Namba yako");
    if (!/^[0-9+\s-]{7,20}$/.test(phone.trim()))
      return toast.error("Weka namba ya simu uliyojisajili nayo");
    setSigningIn(true);
    try {
      const res = await loginStudentByPhone(regNo.trim(), phone.trim());
      if (!res.ok) {
        const msg =
          res.reason === "no_phone"
            ? "Hakuna namba ya simu kwenye taarifa zako. Nenda Akaunti uongeze namba, kisha ujaribu tena."
            : "Reg Namba au namba ya simu si sahihi. Tumia namba uliyojisajili nayo.";
        toast.error(msg);
        return;
      }
      setStudentToken(res.token);
      setTokenState(res.token);
      setPhone("");
      toast.success(`Karibu ${res.fullName}`);
    } finally {
      setSigningIn(false);
    }
  }, [regNo, phone]);

  const handleCode = useCallback(async () => {
    const st = getStudentToken();
    if (!st) {
      toast.error("Weka Reg Namba na namba yako ya simu kwanza.");
      return;
    }
    if (code.trim().length < 4) {
      toast.error("Andika msimbo wa kipindi");
      return;
    }
    chooseSession({ kind: "join", joinCode: code.trim() });
  }, [code, chooseSession]);

  /** Confirm step: the deliberate tap that actually records the attendance. */
  const confirmCheckIn = useCallback(async () => {
    const st = getStudentToken();
    if (!st) {
      toast.error("Weka Reg Namba na namba yako ya simu kwanza.");
      setStep(0);
      return;
    }
    if (!chosen) {
      setStep(1);
      return;
    }
    await runScan(chosen, st);
  }, [chosen, runScan]);

  /** Back to the pick step, or to identity if that is still unsettled. */
  const backToPick = useCallback(() => {
    setFailure(null);
    setStep(getStudentToken() ? 1 : 0);
  }, []);

  /** The words for the session waiting to be confirmed, so step 2 can name it. */
  const chosenLabel = chosen ? (chosen.kind === "join" ? chosen.joinCode : "QR ya kipindi") : "";

  if (done) {
    return (
      <Card className="border-2 border-emerald-500/40">
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="h-14 w-14 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="text-lg font-bold">{done.fullName}</p>
            <p className="text-sm text-muted-foreground">
              Umehudhuria • {new Date(done.checkInAt).toLocaleTimeString("sw-TZ")}
              {done.semina ? ` • ${done.semina}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Umbali uliothibitishwa: {Math.round(done.distanceM)}m
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setDone(null);
              setChosen(null);
              setStep(getStudentToken() ? 1 : 0);
            }}
          >
            Sajili kipindi kingine
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
          Hatua tatu: jitambulishe, chagua kipindi, kisha thibitisha. Umbali unaotakiwa unawekwa na
          mwalimu.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <WizardProgress
          steps={steps}
          current={step}
          onJump={(i) => {
            // Only a step already unlocked can be jumped to, and identity has to
            // be settled before the pick step exists.
            if (i < step && (i === 0 || identified)) setStep(i);
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

        {step === 0 && (
          <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <div className="flex gap-2">
              <ShieldAlert className="h-5 w-5 shrink-0 text-primary" />
              <div className="text-sm">
                <p className="font-medium">Jitambulishe kwa Reg Namba na simu yako</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Mahudhurio huhifadhiwa kwa jina lako, kwa hiyo tunahitaji kuthibitisha ni wewe.
                  Tumia namba ya simu uliyojisajili nayo — hakuna PIN inayohitajika.
                </p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <Label htmlFor="qr-reg" className="text-xs">
                  Reg Namba
                </Label>
                <Input
                  id="qr-reg"
                  value={regNo}
                  onChange={(e) => setRegNo(e.target.value)}
                  placeholder="Mfano MUM2025-04-14106"
                  autoComplete="username"
                />
              </div>
              <div>
                <Label htmlFor="qr-phone" className="text-xs">
                  Namba ya Simu
                </Label>
                <Input
                  id="qr-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^0-9+\s-]/g, ""))}
                  inputMode="tel"
                  type="tel"
                  placeholder="07XXXXXXXX"
                  autoComplete="tel"
                  maxLength={20}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") signIn();
                  }}
                />
              </div>
            </div>
            <Button onClick={signIn} disabled={signingIn} className="w-full gap-1">
              {signingIn ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              Jitambulishe
            </Button>
          </div>
        )}

        {step === 1 && sessions.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Vipindi vinavyoendelea sasa</p>
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm"
              >
                <span className="truncate font-medium">{s.title}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                  {s.studentGroup || "Wote"} • {s.radiusM}m
                </span>
              </div>
            ))}
          </div>
        )}

        {step === 1 ? (
          busy ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">Inaangalia kipindi…</p>
            </div>
          ) : scanning ? (
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
                  <Button variant="outline" onClick={handleCode} disabled={code.trim().length < 4}>
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
          )
        ) : step === 2 ? (
          <div className="space-y-3 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              <div className="text-sm">
                <p className="font-bold">Thibitisha mahudhurio</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Kipindi ulichochagua: <b className="font-mono">{chosenLabel}</b>. Ukibonyeza
                  Hudhuria, eneo lako litathibitishwa kwa GPS.
                </p>
              </div>
            </div>
            {busy ? (
              <div className="flex flex-col items-center gap-2 py-6 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <p className="text-sm">Inathibitisha eneo lako…</p>
              </div>
            ) : (
              <WizardNav
                current={step}
                count={steps.length}
                onBack={backToPick}
                onNext={confirmCheckIn}
                nextLabel="Hudhuria"
              />
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
