import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { confirmAction } from "@/lib/alerts";
import { forceSubmitSubmission, loadLiveExams } from "@/lib/liveExamsApi";
import type { LiveExam, LiveStudent } from "@/lib/liveExams";
import { toast } from "@/lib/toast";
import { Activity, CircleAlert, MapPin, Radio, RefreshCw, Square, Users } from "lucide-react";

/** How often the panel refreshes. A teacher watching a class needs seconds, not minutes. */
const REFRESH_MS = 15000;

export function LiveExamPanel() {
  const [exams, setExams] = useState<LiveExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setExams(await loadLiveExams());
    } catch {
      // A failed poll must not clear the panel; the next tick will retry.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    timer.current = setInterval(() => void load(), REFRESH_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [autoRefresh, load]);

  const totals = useMemo(() => {
    const live = exams.reduce((n, e) => n + e.live.length, 0);
    const stale = exams.reduce((n, e) => n + e.staleCount, 0);
    const done = exams.reduce((n, e) => n + e.submittedCount, 0);
    return { live, stale, done };
  }, [exams]);

  const remove = async (student: LiveStudent) => {
    if (
      !(await confirmAction(
        `Katoa ${student.fullName || student.regNo}?`,
        "Mtihani wake utafungwa mara moja. Alama hazitabadilika — unaweza kumfanyia alama baadaye kama kawaida.",
        "Ndiyo, katoa",
      ))
    )
      return;
    setRemoving(student.submissionId);
    const ok = await forceSubmitSubmission(student.submissionId);
    setRemoving(null);
    if (ok) {
      toast.success(`${student.fullName || student.regNo} ametolewa kwenye mtihani`);
      await load();
    } else {
      toast.error("Imeshindikana kumtoa");
    }
  };

  return (
    <Card className="overflow-hidden border-primary/25">
      <CardHeader className="border-b border-primary/15 bg-gradient-to-r from-primary/10 via-transparent to-secondary/10 pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <Radio className="h-4 w-4 text-primary" />
          Live Test — Wanafunzi Wanaofanya Sasa
          <span className="ml-auto flex items-center gap-2">
            <Badge variant={totals.live > 0 ? "default" : "secondary"} className="tabular-nums">
              {totals.live} wanaendelea
            </Badge>
            {totals.stale > 0 && (
              <Badge variant="destructive" className="tabular-nums">
                {totals.stale} kimya
              </Badge>
            )}
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Inasasishwa kila sekunde 15. "Kimya" ni mwanafunzi ambaye kivinjari chake hakijatuma ishara kwa
          sekunde 90 — simu inaweza kuwa imezimika au ametoka kwenye ukurasa.
        </p>
      </CardHeader>

      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Sasisha
          </Button>
          <Button
            size="sm"
            variant={autoRefresh ? "default" : "outline"}
            onClick={() => setAutoRefresh((v) => !v)}
          >
            <Activity className="mr-1 h-3.5 w-3.5" />
            {autoRefresh ? "Inasasisha yenyewe" : "Imesimama"}
          </Button>
          <span className="text-xs text-muted-foreground">
            {totals.done} wamewasilisha kati ya mitihani inayoonekana
          </span>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Inapakia…</p>
        ) : exams.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 py-8 text-center">
            <Users className="mx-auto h-7 w-7 text-muted-foreground/60" />
            <p className="mt-2 text-sm text-muted-foreground">
              Hakuna mwanafunzi anayefanya mtihani kwa sasa.
            </p>
          </div>
        ) : (
          exams.map((exam) => <ExamLiveCard key={exam.examId} exam={exam} onRemove={remove} removing={removing} />)
        )}
      </CardContent>
    </Card>
  );
}

function ExamLiveCard({
  exam,
  onRemove,
  removing,
}: {
  exam: LiveExam;
  onRemove: (s: LiveStudent) => void;
  removing: string | null;
}) {
  const pct = exam.startedCount + exam.submittedCount > 0
    ? Math.round((exam.submittedCount / (exam.startedCount + exam.submittedCount)) * 100)
    : 0;

  return (
    <div className="rounded-xl border border-border/70 bg-card/60">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{exam.title}</span>
        <Badge variant="outline" className="tabular-nums">
          {exam.live.length} wanaendelea
        </Badge>
        <Badge variant="secondary" className="tabular-nums">
          {exam.submittedCount} wamemaliza
        </Badge>
        <span className="text-xs text-muted-foreground tabular-nums">{pct}%</span>
      </div>
      <Progress value={pct} className="h-1 rounded-none" />

      {exam.live.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          Hakuna anayefanya sasa. {exam.submittedCount > 0 ? "Wote wamemaliza." : ""}
        </p>
      ) : (
        <ul className="divide-y divide-border/50">
          {exam.live.map((s) => (
            <li key={s.submissionId} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                {initials(s.fullName)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">{s.fullName || s.regNo}</span>
                  {s.idleSeconds > 90 && (
                    <span title={`Kimya kwa sekunde ${s.idleSeconds}`}>
                      <CircleAlert className="h-3.5 w-3.5 shrink-0 text-destructive" />
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                  <span className="font-mono">{s.regNo}</span>
                  <span>• ameanza {new Date(s.startedAt).toLocaleTimeString("sw-TZ")}</span>
                  {s.gpsDistanceM != null && (
                    <span className="inline-flex items-center gap-0.5">
                      • <MapPin className="h-3 w-3" /> {Math.round(s.gpsDistanceM)} m
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {s.answeredCount}/{s.questionCount}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-destructive hover:bg-destructive/10"
                  disabled={removing === s.submissionId}
                  onClick={() => onRemove(s)}
                >
                  <Square className="mr-1 h-3 w-3" />
                  {removing === s.submissionId ? "Inatoa…" : "Katoa"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
