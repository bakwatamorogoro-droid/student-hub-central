import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QrScanner } from "@/components/QrScanner";
import { decodeJoinQr, decodeQrToken } from "@/lib/attendance-qr";
import {
  checkIn,
  getPosition,
  listOpenSessions,
  type AttendanceFailure,
  type OpenSession,
} from "@/lib/attendance";
import { CheckCircle2, Loader2, MapPin, QrCode, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { getStudentToken } from "@/lib/student-session";

/** Messages the student sees when a check-in is refused. */
const FAILURE_TEXT: Record<AttendanceFailure, string> = {
  not_ready:
    "Mfumo wa mahudhurio haujawashwa bado. Mwambie mwalimu au msimamizi aendeshe usanidi wa mahudhurio.",
  invalid_token: "QR au msimbo haitambuliki. Hakikisha ni wa kipindi kinachoendelea.",
  expired_token: "QR hii imeisha muda wake. Scan tena QR ya sasa.",
  session_closed: "Kipindi hiki kimefungwa. Huwezi kuhudhuria kipindi kilichofungwa.",
  not_registered: "Haujatambuliwa kama mwanafunzi. Ingia kwenye akaunti yako kwanza.",
  gps_required:
    "Umbali hauwezi kuthibitishwa. Ruhusu GPS, na hakikisha kipindi kina eneo la darasa.",
  outside_area: "Uko nje ya eneo lililoruhusiwa la darasa. Sogeza karibu na mwalimu.",
  wrong_group: "Kipindi hiki ni cha group lingine. Hudhuria kipindi cha group lako.",
  already_marked: "Tayari umehudhuria kipindi hiki. Mahudhurio yanarekodiwa mara moja tu.",
};

type Done = { fullName: string; distanceM: number; checkInAt: string; semina: string | null };

/**
 * `onCheckedIn` fires after a successful check-in so a host page can refresh
 * whatever it shows about attendance — the history list on /attendance, for
 * one. Optional, so the component still drops onto a page with nothing to
 * refresh.
 */
export function QrAttendanceCheckIn({ onCheckedIn }: { onCheckedIn?: () => void } = {}) {
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [failure, setFailure] = useState<{
    reason: AttendanceFailure;
    distanceM?: number;
    radiusM?: number;
  } | null>(null);
  const [code, setCode] = useState("");
  const [sessions, setSessions] = useState<OpenSession[]>([]);

  const studentToken = getStudentToken();

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
      }) => Promise<Awaited<ReturnType<typeof checkIn>>>,
    ) => {
      setBusy(true);
      setFailure(null);
      try {
        // A missing fix is not fatal here: only a session with a geofence needs
        // it, and the library is the side that knows which sessions those are.
        const fix = await getPosition();
        const res = await run({ lat: fix?.lat ?? null, lng: fix?.lng ?? null });
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

  const handleToken = useCallback(
    async (raw: string) => {
      setScanning(false);
      // A printed poster carries the session's join code, a live screen carries a
      // rotating token. Accept both so one scanner serves either.
      const joinCode = decodeJoinQr(raw);
      const token = joinCode ? null : decodeQrToken(raw);
      if (!joinCode && !token) {
        setFailure({ reason: "invalid_token" });
        return;
      }
      // Identity comes from the PIN sign-in session. Without it the server has
      // no trustworthy way to tell who is scanning, so ask the student to sign
      // in rather than sending anything the browser could choose.
      const st = getStudentToken();
      if (!st) {
        toast.error("Ingia kwenye akaunti yako kwanza (/account), kisha skani QR.");
        return;
      }
      await record((fix) =>
        checkIn(
          joinCode
            ? { studentToken: st, joinCode, lat: fix.lat, lng: fix.lng }
            : { studentToken: st, token, lat: fix.lat, lng: fix.lng },
        ),
      );
    },
    [record],
  );

  const handleCode = useCallback(async () => {
    const st = getStudentToken();
    if (!st) {
      toast.error("Ingia kwenye akaunti yako kwanza (/account).");
      return;
    }
    if (code.trim().length < 4) {
      toast.error("Andika msimbo wa kipindi");
      return;
    }
    await record((fix) =>
      checkIn({ studentToken: st, joinCode: code.trim(), lat: fix.lat, lng: fix.lng }),
    );
  }, [code, record]);

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
          <Button variant="outline" onClick={() => setDone(null)}>
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
          Ingia kwa Reg Namba na PIN, kisha scan QR ya kipindi ukiwa darasani. Umbali unaotakiwa
          unawekwa na mwalimu.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!studentToken && (
          <div className="flex gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <ShieldAlert className="h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm">
              Ingia kwenye akaunti yako kwanza: nenda <b>/account</b> uweke Reg Namba na PIN yako.
            </p>
          </div>
        )}

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

        {sessions.length > 0 && (
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

        {busy ? (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Inathibitisha eneo lako…</p>
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
            <Button onClick={() => setScanning(true)} className="w-full" disabled={!studentToken}>
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
                  disabled={!studentToken}
                />
                <Button
                  variant="outline"
                  onClick={handleCode}
                  disabled={!studentToken || code.trim().length < 4}
                >
                  Hudhuria
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
                Mahudhurio yanarekodiwa mara moja tu kwa kipindi. QR inabadilika mara kwa mara, kwa
                hiyo picha iliyotumwa kwa mwenzako haitafanya kazi.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
