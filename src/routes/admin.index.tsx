import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveExamPanel } from "@/components/LiveExamPanel";
import { LiveAttendanceCard } from "@/components/LiveAttendanceCard";
import { supabase } from "@/integrations/supabase/client";
import {
  Users,
  FileText,
  CheckCircle2,
  ListChecks,
  Clock,
  Timer,
  CalendarClock,
  Inbox,
  ClipboardCheck,
  Sparkles,
  ArrowRight,
  GraduationCap,
} from "lucide-react";
import { formatEat } from "@/lib/time";
import { useI18n } from "@/lib/i18n";
import { listSessionSummaries, type SessionSummary } from "@/lib/attendance";

export const Route = createFileRoute("/admin/")({ component: Dash });

type ExamRow = {
  id: string;
  title: string;
  start_time: string | null;
  end_time: string | null;
  duration_minutes: number;
  published: boolean;
};

function useCountdown(target: Date | null) {
  const [ms, setMs] = useState<number>(target ? target.getTime() - Date.now() : 0);
  useEffect(() => {
    if (!target) return;
    const t = setInterval(() => setMs(target.getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (!target) return null;
  const total = Math.max(0, ms);
  const sec = Math.floor(total / 1000);
  return {
    expired: total <= 0,
    days: Math.floor(sec / 86400),
    hours: Math.floor((sec % 86400) / 3600),
    minutes: Math.floor((sec % 3600) / 60),
    seconds: sec % 60,
  };
}

function CountdownPill({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center bg-primary/10 rounded-lg px-3 py-2 min-w-[64px]">
      <span className="text-2xl font-bold text-primary tabular-nums">
        {String(value).padStart(2, "0")}
      </span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
    </div>
  );
}

function ExamCountdown({ exam }: { exam: ExamRow }) {
  const now = Date.now();
  const start = exam.start_time ? new Date(exam.start_time) : null;
  const end = exam.end_time ? new Date(exam.end_time) : null;
  const startMs = start ? start.getTime() : null;
  const endMs = end ? end.getTime() : null;

  let target: Date | null = null;
  let phase: "kabla" | "unaendelea" | "umekwisha" | "haujapangwa" = "haujapangwa";
  if (startMs && now < startMs) {
    target = start;
    phase = "kabla";
  } else if (endMs && now < endMs) {
    target = end;
    phase = "unaendelea";
  } else if (endMs && now >= endMs) {
    phase = "umekwisha";
  } else if (startMs && !endMs) {
    phase = "umekwisha";
  }

  const cd = useCountdown(target);

  return (
    <Card className="border-l-4 border-l-primary">
      <CardContent className="p-4 space-y-3">
        <div className="flex justify-between items-start gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-bold truncate">{exam.title}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
              <Clock className="h-3 w-3" /> {exam.duration_minutes} dakika
              {start && <span className="ml-2">• Huanza: {formatEat(start)}</span>}
              {end && <span className="ml-2">• Humalizika: {formatEat(end)}</span>}
            </div>
          </div>
          <span
            className={`text-xs font-semibold px-2 py-1 rounded ${
              phase === "unaendelea"
                ? "bg-green-500/15 text-green-700"
                : phase === "kabla"
                  ? "bg-blue-500/15 text-blue-700"
                  : phase === "umekwisha"
                    ? "bg-muted text-muted-foreground"
                    : "bg-amber-500/15 text-amber-700"
            }`}
          >
            {phase === "unaendelea" && "UNAENDELEA"}
            {phase === "kabla" && "BADO HAUJAANZA"}
            {phase === "umekwisha" && "UMEKWISHA"}
            {phase === "haujapangwa" && "HAUJAPANGWA"}
          </span>
        </div>
        {cd && !cd.expired && (
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Timer className="h-3 w-3" />{" "}
              {phase === "kabla"
                ? "Muda uliosalia kabla ya kuanza"
                : "Muda uliosalia kabla ya kuisha"}
            </div>
            <div className="flex gap-2 flex-wrap">
              <CountdownPill value={cd.days} label="Siku" />
              <CountdownPill value={cd.hours} label="Masaa" />
              <CountdownPill value={cd.minutes} label="Dakika" />
              <CountdownPill value={cd.seconds} label="Sekunde" />
            </div>
          </div>
        )}
        {phase === "haujapangwa" && (
          <div className="text-xs text-amber-700">
            Mtihani huu haujawekwa muda wa kuanza / kuisha. Nenda{" "}
            <Link to="/admin/exams" className="underline font-semibold">
              Mitihani
            </Link>{" "}
            kuweka muda.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Dash() {
  const { t } = useI18n();
  const [stats, setStats] = useState({
    students: 0,
    exams: 0,
    submissions: 0,
    completed: 0,
    pendingRequests: 0,
    presentToday: 0,
  });
  const [exams, setExams] = useState<ExamRow[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    (async () => {
      const now = new Date();
      const tzOffset = now.getTimezoneOffset() * 60000;
      const localDate = new Date(now.getTime() - tzOffset).toISOString().slice(0, 10);
      const [s, e, sub, done, pending, examsRes, presentToday, sess] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("exams").select("id", { count: "exact", head: true }),
        supabase.from("submissions").select("id", { count: "exact", head: true }),
        supabase
          .from("submissions")
          .select("id", { count: "exact", head: true })
          .not("submitted_at", "is", null),
        supabase
          .from("profile_update_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("exams")
          .select("id, title, start_time, end_time, duration_minutes, published")
          .eq("published", true)
          .order("start_time", { ascending: true, nullsFirst: false }),
        supabase
          .from("attendance")
          .select("id", { count: "exact", head: true })
          .eq("check_in_date", localDate),
        listSessionSummaries(),
      ]);
      setStats({
        students: s.count || 0,
        exams: e.count || 0,
        submissions: sub.count || 0,
        completed: done.count || 0,
        pendingRequests: pending.count || 0,
        presentToday: presentToday.count || 0,
      });
      setExams((examsRes.data as ExamRow[]) || []);
      setSessions(sess);
    })();
  }, []);

  const openSessions = sessions.filter((x) => x.active);
  const recentSessions = sessions.slice(0, 4);

  const tiles = [
    {
      to: "/admin/students" as const,
      label: "Wanafunzi Waliojisajili",
      value: stats.students,
      Icon: Users,
      tone: "from-primary/15",
    },
    {
      to: "/admin/exams" as const,
      label: "Jumla ya Mitihani",
      value: stats.exams,
      Icon: FileText,
      tone: "from-secondary/25",
    },
    {
      to: "/admin/submissions" as const,
      label: "Waliofanya Mtihani",
      value: stats.completed,
      Icon: CheckCircle2,
      tone: "from-emerald-500/15",
    },
    {
      to: "/admin/submissions" as const,
      label: "Jumla ya Majibu",
      value: stats.submissions,
      Icon: ListChecks,
      tone: "from-primary/10",
    },
    {
      to: "/admin/attendance" as const,
      label: t("admin_attendance"),
      value: stats.presentToday,
      Icon: ClipboardCheck,
      tone: "from-teal-500/20",
    },
    {
      to: "/admin/requests" as const,
      label: "Maombi Yanayosubiri",
      value: stats.pendingRequests,
      Icon: Inbox,
      tone: "from-amber-500/15",
    },
  ];

  const now = Date.now();
  const active = exams.filter((e) => {
    const end = e.end_time ? new Date(e.end_time).getTime() : null;
    const start = e.start_time ? new Date(e.start_time).getTime() : null;
    if (end && end < now) return false; // expired
    if (start && start > now) return true; // upcoming
    if (start && end && start <= now && now <= end) return true; // ongoing
    return !start && !end; // unscheduled but published
  });

  return (
    <div className="space-y-6">
      <LiveAttendanceCard />
      <div className="relative overflow-hidden rounded-3xl border-2 border-primary/25 bg-gradient-to-br from-primary/12 via-card to-secondary/15 p-6 shadow-lg">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <GraduationCap className="h-3 w-3" /> {t("system_full_name")}
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight md:text-3xl">
              {t("admin_welcome")}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("admin_welcome_sub")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-primary/20 bg-background/60 px-4 py-3 backdrop-blur">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary text-lg font-black text-primary-foreground">
              DJ
            </div>
            <div className="text-left">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("founder_role")}
              </div>
              <div className="text-sm font-bold">{t("founder_name")}</div>
              <div className="text-[10px] text-primary">{t("founder_title")}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Link key={tile.label} to={tile.to}>
            <Card
              className={`h-full bg-gradient-to-br ${tile.tone} to-transparent transition-all hover:-translate-y-1 hover:border-primary hover:shadow-lg`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">{tile.label}</div>
                    <div className="mt-1 text-3xl font-black text-primary tabular-nums">
                      {tile.value}
                    </div>
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
                    <tile.Icon className="h-5 w-5 text-primary" />
                  </span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ClipboardCheck className="h-5 w-5 text-emerald-600" />
              {t("admin_att_recent")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("admin_att_none")}</p>
            ) : (
              recentSessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-background/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{s.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {s.semina || "—"}
                      {s.startedAt && ` · ${formatEat(new Date(s.startedAt))}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-lg bg-emerald-500/15 px-2 py-1 text-xs font-bold text-emerald-700">
                      {s.presentCount} {t("admin_att_present")}
                    </span>
                    {s.active && (
                      <span className="rounded-lg bg-emerald-500 px-2 py-1 text-[10px] font-bold uppercase text-white">
                        Live
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
            <Link
              to="/admin/attendance"
              className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-emerald-700 hover:underline"
            >
              {t("admin_att_manage")} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card className="border-primary/25 bg-gradient-to-br from-primary/10 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5 text-primary" />
              {t("admin_ai_ready")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("admin_ai_ready_sub")}</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-primary/20 bg-background/60 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t("admin_att_open")}
                </div>
                <div className="text-2xl font-black text-primary tabular-nums">
                  {openSessions.length}
                </div>
              </div>
              <div className="rounded-xl border border-primary/20 bg-background/60 p-3">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t("admin_att_short")}
                </div>
                <div className="text-2xl font-black text-primary tabular-nums">
                  {stats.presentToday}
                </div>
              </div>
            </div>
            <Link
              to="/admin/submissions"
              className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
            >
              Angalia matokeo <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>

        <LiveExamPanel />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarClock className="h-5 w-5 text-primary" />
            Mitihani Iliyochapishwa — Muda Uliosalia
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {exams.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Hakuna mtihani uliochapishwa bado.{" "}
              <Link to="/admin/exams" className="underline text-primary">
                Unda mtihani mpya
              </Link>
              .
            </p>
          )}
          {active.length === 0 && exams.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Mitihani yote iliyochapishwa imeshakwisha au haina muda uliopangwa.
            </p>
          )}
          {active.map((e) => (
            <ExamCountdown key={e.id} exam={e} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
