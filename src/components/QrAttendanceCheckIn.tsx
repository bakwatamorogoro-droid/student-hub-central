import { useCallback, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QrScanner } from "@/components/QrScanner";
import { decodeQrToken } from "@/components/AttendanceSessionPanel";
import { checkInWithQr, type AttendanceFailure } from "@/lib/attendance.functions";
import { CheckCircle2, Loader2, MapPin, QrCode, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { getStudentToken } from "@/lib/student-session";

/** Messages the student sees when a check-in is refused. */
const FAILURE_TEXT: Record<AttendanceFailure, string> = {
  not_ready:
    "Mfumo wa QR haujawashwa bado. Mwambie mwalimu au msimamizi aendeshe usanidi wa mahudhurio.",
  invalid_token: "QR hii haitambuliki. Hakikisha umescan QR ya kipindi kinachoendelea.",
  expired_token: "QR hii imeisha muda wake. Scan tena QR ya sasa.",
  session_closed: "Kipindi hiki kimefungwa. Huwezi kuhudhuria kipindi kilichofungwa.",
  not_registered: "Haujatambuliwa kama mwanafunzi. Ingia kwenye akaunti yako kwanza.",
  gps_required: "Kipindi hiki hakina eneo lililowekwa, kwa hiyo umbali hauwezi kuthibitishwa.",
  outside_area: "Huwezi kuhudhuria kipindi hiki ukiwa nje ya eneo lililoruhusiwa la darasa na semina.",
  already_marked: "Tayari umehudhuria kipindi hiki. Mahudhurio yanarekodiwa mara moja tu.",
};

type Done = { fullName: string; distanceM: number; checkInAt: string; semina: string | null };

/** Reads the phone's GPS fix. Returns null when the student refuses or it times out. */
function getFix(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

export function QrAttendanceCheckIn() {
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done | null>(null);
  const [failure, setFailure] = useState<{ reason: AttendanceFailure; distanceM?: number; radiusM?: number } | null>(null);

  const handleToken = useCallback(async (raw: string) => {
    setScanning(false);
    const token = decodeQrToken(raw);
    if (!token) {
      setFailure({ reason: "invalid_token" });
      return;
    }

    setBusy(true);
    setFailure(null);
    try {
      const fix = await getFix();
      if (!fix) {
        toast.error("Lazima uruhusu GPS ili kuthibitisha kuwa uko darasani.");
        return;
      }

      // Identity comes from the PIN sign-in session. Without it the server has
      // no trustworthy way to tell who is scanning, so ask the student to sign
      // in rather than sending anything the browser could choose.
      const studentToken = getStudentToken();
      if (!studentToken) {
        toast.error("Ingia kwenye akaunti yako kwanza (/account), kisha skani QR.");
        return;
      }

      const res = await checkInWithQr({
        data: {
          token,
          lat: fix.lat,
          lng: fix.lng,
          studentToken,
        },
      });

      if (res.ok) {
        setDone({ fullName: res.fullName, distanceM: res.distanceM, checkInAt: res.checkInAt, semina: res.semina });
        toast.success("Mahudhurio yamekamilika ✓");
      } else {
        setFailure({ reason: res.reason, distanceM: res.distanceM, radiusM: res.radiusM });
      }
    } finally {
      setBusy(false);
    }
  }, []);

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
            <p className="mt-1 text-xs text-muted-foreground">Umbali uliothibitishwa: {Math.round(done.distanceM)}m</p>
          </div>
          <Button variant="outline" onClick={() => setDone(null)}>Sajili kipindi kingine</Button>
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
          Scan QR ya kipindi ukiwa darasani. Umbali wa mita 50 au chini unahitajika.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {failure && (
          <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
            <XCircle className="h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-destructive">{FAILURE_TEXT[failure.reason]}</p>
              {failure.reason === "outside_area" && failure.distanceM != null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Uko mita {Math.round(failure.distanceM)} kutoka darasani; ruhusa ni mita {failure.radiusM ?? 50}.
                </p>
              )}
            </div>
          </div>
        )}

        {busy ? (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Inathibitisha eneo lako…</p>
          </div>
        ) : scanning ? (
          <QrScanner onResult={handleToken} onError={(m) => { setScanning(false); toast.error(m); }} />
        ) : (
          <>
            <Button onClick={() => setScanning(true)} className="w-full">
              <QrCode className="h-4 w-4" /> Fungua kamera kuscan QR
            </Button>
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
