import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useLiveAttendance } from "@/lib/useLiveAttendance";
import {
  formatCountdown,
  isLectureOpen,
  lectureWindow,
  msUntilLecture,
} from "@/lib/lectureSchedule";
import { Activity, GraduationCap, Loader2, Radio, Users } from "lucide-react";
import { useEffect, useState } from "react";

/** The live counter's own clock, so the countdown ticks without a page reload. */
function useTick(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * How many students are in the room right now.
 *
 * The number moves on its own: an arrival is pushed over realtime, and the
 * component also re-reads on a slow interval in case the socket drops. The
 * countdown is to the next lecture, or to the close of the one running.
 */
export function LiveAttendanceCard() {
  const { live, loading } = useLiveAttendance();
  const now = useTick();

  if (loading && !live) {
    return (
      <Card className="border-teal-500/30 bg-gradient-to-br from-teal-500/10 to-transparent">
        <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Inapakia mahudhurio…
        </CardContent>
      </Card>
    );
  }

  const lectureOpen = isLectureOpen(now);

  if (!live) {
    return (
      <Card className="border-dashed border-primary/25 bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="h-4 w-4 text-muted-foreground" /> Hakuna kipindi kinachoendelea
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <p>Anzisha kipindi kwenye ukurasa wa Mahudhurio, au subiri muhadhara wa Ijumaa.</p>
          {!lectureOpen && (
            <p className="flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5" />
              Muhadhara wa Ijumaa unaanza baada ya {formatCountdown(msUntilLecture(now))}.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const pct = live.expected ? Math.min(100, Math.round((live.present / live.expected) * 100)) : 0;

  return (
    <Card className="border-teal-500/40 bg-gradient-to-br from-teal-500/12 via-card to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-teal-600" />
          </span>
          <Activity className="h-4 w-4 text-teal-600" />
          <span className="min-w-0 truncate">{live.title}</span>
          {live.kind === "lecture" && (
            <Badge className="bg-primary text-[10px] uppercase">Muhadhara</Badge>
          )}
          <Badge variant="secondary" className="text-[10px] uppercase">
            Live
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-3">
          <div className="text-5xl font-black tabular-nums text-teal-700 dark:text-teal-400">
            {live.present}
          </div>
          <div className="pb-1.5 text-sm text-muted-foreground">
            <div className="flex items-center gap-1 font-medium">
              <Users className="h-3.5 w-3.5" /> wamehudhuria
            </div>
            {live.expected != null && <div className="text-xs">kati ya {live.expected} walioandikishwa</div>}
          </div>
        </div>

        {live.expected != null && (
          <div className="space-y-1">
            <Progress value={pct} className="h-2" />
            <div className="text-right text-xs font-bold text-teal-700 dark:text-teal-400">
              {pct}%
            </div>
          </div>
        )}

        {live.recent.length > 0 && (
          <div className="space-y-1.5 border-t border-teal-500/20 pt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Wa hivi punde
            </p>
            {live.recent.map((r, i) => (
              <div
                key={`${r.studentId}-${r.createdAt}`}
                className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
                  i === 0 ? "bg-teal-500/15 font-semibold" : "bg-muted/50"
                }`}
              >
                <span className="min-w-0 truncate">
                  {r.fullName}
                  {r.regNo && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{r.regNo}</span>
                  )}
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {new Date(r.createdAt).toLocaleTimeString("sw-TZ")}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="border-t border-teal-500/20 pt-2 text-[11px] text-muted-foreground">
          {lectureOpen
            ? `Muhadhara wa Ijumaa unaendelea. Unafungwa baada ya ${formatCountdown(
                lectureWindow(now).closesAtMs - now,
              )}.`
            : "Namba inajisasisha yenyewe kila mwanafunzi anapohudhuria."}
        </p>
      </CardContent>
    </Card>
  );
}
