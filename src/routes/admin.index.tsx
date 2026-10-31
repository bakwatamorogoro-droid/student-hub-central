import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";
import { formatEat } from "@/lib/time";

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
  const [stats, setStats] = useState({
    students: 0,
    exams: 0,
    submissions: 0,
    completed: 0,
    pendingRequests: 0,
  });
  const [exams, setExams] = useState<ExamRow[]>([]);

  useEffect(() => {
    (async () => {
      const [s, e, sub, done, pending, examsRes] = await Promise.all([
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
      ]);
      setStats({
        students: s.count || 0,
        exams: e.count || 0,
        submissions: sub.count || 0,
        completed: done.count || 0,
        pendingRequests: pending.count || 0,
      });
      setExams((examsRes.data as ExamRow[]) || []);
    })();
  }, []);

  const tiles = [
    {
      to: "/admin/students" as const,
      label: "Wanafunzi Waliojisajili",
      value: stats.students,
      Icon: Users,
    },
    { to: "/admin/exams" as const, label: "Jumla ya Mitihani", value: stats.exams, Icon: FileText },
    {
      to: "/admin/submissions" as const,
      label: "Waliofanya Mtihani",
      value: stats.completed,
      Icon: CheckCircle2,
    },
    {
      to: "/admin/submissions" as const,
      label: "Jumla ya Majibu",
      value: stats.submissions,
      Icon: ListChecks,
    },
    {
      to: "/admin/requests" as const,
      label: "Maombi Yanayosubiri",
      value: stats.pendingRequests,
      Icon: Inbox,
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
      <div>
        <h1 className="text-2xl font-bold">Karibu kwenye Dashibodi</h1>
        <p className="text-sm text-muted-foreground">
          Hapa unaona muhtasari wa mfumo wako na muda wa mitihani inayokuja.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to}>
            <Card className="hover:shadow-lg hover:border-primary transition-all h-full">
              <CardContent className="p-5">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm text-muted-foreground">{t.label}</div>
                    <div className="text-3xl font-bold text-primary mt-1">{t.value}</div>
                  </div>
                  <t.Icon className="h-8 w-8 text-primary/40" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

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
