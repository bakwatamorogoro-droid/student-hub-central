import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { checkIn, ensureLectureSession } from "@/lib/attendance";
import { getPosition } from "@/lib/geo";
import { formatCountdown, isLectureOpen, lectureWindow, msUntilLecture } from "@/lib/lectureSchedule";
import { getStudentToken } from "@/lib/student-session";
import { CheckCircle2, Clock, GraduationCap, Loader2, MapPin } from "lucide-react";
import { toast } from "@/lib/toast";

/** Ticks the countdown without needing a reload. */
function useTick(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * The Friday lecture, for every student.
 *
 * It runs 13:00–16:00 EAT every Friday and is open to the whole cohort, so there
 * is no seminar or group to pick — one button, one tap. Outside the window the
 * card shows when the next one starts, which is the useful thing to know.
 */
export function FridayLectureCard({ onCheckedIn }: { onCheckedIn?: () => void }) {
  const now = useTick();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const open = isLectureOpen(now);
  const window = lectureWindow(now);

  const attend = useCallback(async () => {
    const token = getStudentToken();
    if (!token) {
      toast.error("Ingia kwenye akaunti yako kwanza");
      return;
    }
    setBusy(true);
    try {
      const created = await ensureLectureSession();
      if (!created.ok) {
        toast.error(created.message);
        return;
      }
      // A missing fix is not fatal: the fence is the admin's saved point, and if
      // it was never set the lecture has no fence at all.
      const fix = await getPosition();
      const res = await checkIn({
        studentToken: token,
        sessionId: created.session.id,
        lat: fix?.lat ?? null,
        lng: fix?.lng ?? null,
        accuracy: fix?.accuracy ?? null,
      });
      if (res.ok) {
        setDone(true);
        toast.success("Umehudhuria muhadhara wa Ijumaa ✓");
        onCheckedIn?.();
      } else if (res.reason === "already_marked") {
        setDone(true);
        toast.info("Ulishahudhuria muhadhara huu");
      } else if (res.reason === "outside_area") {
        toast.error(
          `Uko mita ${Math.round(res.distanceM ?? 0)} kutoka eneo la muhadhara; ruhusa ni mita ${Math.round(res.radiusM ?? 0)}.`,
        );
      } else if (res.reason === "gps_required") {
        toast.error("Washa GPS ili kuhudhuria");
      } else if (res.reason === "session_closed") {
        toast.error("Muhadhara umefungwa");
      } else {
        toast.error("Imeshindikana kuhudhuria. Jaribu tena.");
      }
    } finally {
      setBusy(false);
    }
  }, [onCheckedIn]);

  const msLeft = open ? window.closesAtMs - now : msUntilLecture(now);

  return (
    <Card
      className={`overflow-hidden border-2 ${
        open
          ? "border-teal-500/50 bg-gradient-to-br from-teal-500/15 via-card to-primary/10"
          : "border-primary/25 bg-gradient-to-br from-primary/8 to-transparent"
      }`}
    >
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
            <GraduationCap className="h-3 w-3" /> Muhadhara wa Ijumaa
          </div>
          {open ? (
            <Badge className="bg-teal-600 text-[10px] uppercase">
              <span className="mr-1 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              Unaendelea
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] uppercase">
              Bado
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] uppercase">
            Wanafunzi wote
          </Badge>
        </div>

        <div>
          <h3 className="text-lg font-black tracking-tight">
            {open ? "Muhadhara unaendelea sasa" : "Muhadhara ujao wa Ijumaa"}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Kila Ijumaa, saa 1 asubuhi hadi saa 4 asubuhi (07:00–10:00 EAT) · darasa la wote
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-primary/20 bg-background/60 px-3 py-2.5">
          <Clock className="h-4 w-4 shrink-0 text-primary" />
          <div className="text-sm">
            <span className="font-semibold tabular-nums">{formatCountdown(msLeft)}</span>
            <span className="ml-1.5 text-muted-foreground">
              {open ? "kabla ya kufungwa" : "kabla ya kuanza"}
            </span>
          </div>
        </div>

        {done ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> Umehudhuria muhadhara huu
          </div>
        ) : (
          <Button
            onClick={() => void attend()}
            disabled={busy || !open}
            className="w-full bg-gradient-to-r from-primary to-teal-600 font-bold"
            size="lg"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Inathibitisha…
              </>
            ) : (
              <>
                <MapPin className="mr-2 h-4 w-4" /> Hudhuria muhadhara
              </>
            )}
          </Button>
        )}

        {!open && (
          <p className="text-center text-[11px] text-muted-foreground">
            Kitufe kitafunguka saa 1 asubuhi, Ijumaa.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
