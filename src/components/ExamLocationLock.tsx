import { Button } from "@/components/ui/button";
import { Crosshair, Lock, MapPin, ShieldCheck } from "lucide-react";
import { areaMessage, formatDistance, type AreaVerdict } from "@/lib/geo";

/**
 * The screen a student sees when the paper is suspended because they left.
 *
 * Three things have to be true at once for this to be fair and to work:
 *
 * 1. It covers the paper. Not a toast, not a badge — the questions are replaced,
 *    because a warning you can scroll past is not a lock.
 * 2. It says exactly how far away they are and how close they must be, so a
 *    student standing at the wrong end of a corridor can fix it without asking.
 * 3. It lets them back in the moment they are inside again. The paper is
 *    suspended, not failed: answers stay in state, the clock keeps running
 *    (which is itself the deterrent), and nothing is submitted for them.
 *
 * The countdown is deliberately absent. Showing "back in 8 seconds" invites a
 * student to wait it out; showing only the distance invites them to walk back.
 */
export function ExamLocationLock({
  verdict,
  onRetry,
  retrying,
}: {
  verdict: AreaVerdict | null;
  onRetry: () => void;
  retrying: boolean;
}) {
  const distanceM = verdict && "distanceM" in verdict ? verdict.distanceM : null;
  const radiusM = verdict && "radiusM" in verdict ? verdict.radiusM : null;
  const overBy = distanceM != null && radiusM != null ? Math.max(0, distanceM - radiusM) : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/98 p-4 backdrop-blur">
      <div className="w-full max-w-md space-y-4 rounded-3xl border-2 border-destructive/40 bg-card p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-destructive/15">
            <Lock className="h-5 w-5 text-destructive" />
          </span>
          <div>
            <h2 className="text-lg font-black tracking-tight">Mtihani umefungwa</h2>
            <p className="text-xs text-muted-foreground">
              Umetoka nje ya eneo la mtihani. Majibu yako yote yamehifadhiwa.
            </p>
          </div>
        </div>

        {distanceM != null ? (
          <div className="space-y-2 rounded-2xl border border-border bg-muted/40 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Umbali wako
              </span>
              <span className="text-2xl font-black tabular-nums text-destructive">
                {formatDistance(distanceM)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Unaruhusiwa
              </span>
              <span className="text-sm font-bold tabular-nums">{formatDistance(radiusM ?? 0)}</span>
            </div>
            {overBy != null && overBy > 0 && (
              <p className="pt-1 text-xs text-muted-foreground">
                Unahitaji kurudi karibu kwa {formatDistance(overBy)}.
              </p>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-800">
            {verdict ? areaMessage(verdict) : "Mfumo unatafuta mahali pako…"}
          </div>
        )}

        <div className="rounded-2xl border border-border bg-background p-4 text-xs text-muted-foreground">
          <p className="flex items-center gap-1.5 font-semibold text-foreground">
            <MapPin className="h-3.5 w-3.5 text-primary" /> Rudi darasani
          </p>
          <p className="mt-1 leading-relaxed">
            Rudi ndani ya eneo la mtihani. Kifaa hiki kitafunguka chenyewe mara GPS itakapoona uko
            ndani — huna haja ya kufungua upya ukurasa.
          </p>
        </div>

        <Button onClick={onRetry} disabled={retrying} className="w-full" size="lg">
          <Crosshair className={`mr-1 h-4 w-4 ${retrying ? "animate-spin" : ""}`} />
          {retrying ? "Inapima mahali…" : "Pima tena mahali pangu"}
        </Button>

        <p className="text-center text-[11px] text-muted-foreground">
          Saa ya mtihani inaendelea. Ukikaa nje, muda wako unaisha bila kurudi.
        </p>
      </div>
    </div>
  );
}

/**
 * The quiet strip that says the fence is working, so the lock never arrives as
 * a surprise. Two states matter: "you are inside", and "you are drifting".
 */
export function ExamLocationPill({
  verdict,
  accuracy,
}: {
  verdict: AreaVerdict | null;
  accuracy: number | null;
}) {
  if (!verdict) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
        <MapPin className="h-3 w-3" /> GPS…
      </span>
    );
  }

  if (verdict.status === "inside" || verdict.status === "near_edge") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-700">
        <ShieldCheck className="h-3 w-3" />
        Darasani
        {accuracy != null && <span className="opacity-70">±{Math.round(accuracy)} m</span>}
      </span>
    );
  }

  if (verdict.status === "outside") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 font-semibold text-destructive">
        <MapPin className="h-3 w-3" />
        Nje ya eneo · {formatDistance(verdict.distanceM)}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700">
      <MapPin className="h-3 w-3" /> Hakuna GPS
    </span>
  );
}
