import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent } from "@/components/ui/card";
import { UserPlus, FileText, Trophy, Shield, Users, ClipboardCheck, Eye, Sparkles, ArrowRight, Brain } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { StudyGallery } from "@/components/StudyGallery";
import { getDeviceId } from "@/lib/device-id";
import { AttendanceCheckIn } from "@/components/AttendanceCheckIn";
import { HomeAssignments } from "@/components/HomeAssignments";
import { GroupAvailability } from "@/components/GroupAvailability";
import { BigSystemTitle } from "@/components/ExamVideoHero";


export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Islamic Studies Test — Mwanzo" },
      { name: "description", content: "Karibu kwenye Mfumo wa Mtihani wa Islamic Studies. Fanya mitihani, quiz, na angalia matokeo." },
      { property: "og:title", content: "Islamic Studies Test — Mwanzo" },
      { property: "og:description", content: "Karibu kwenye Mfumo wa Mtihani wa Islamic Studies." },
    ],
  }),
});

function useTypewriter(text: string, speed = 60) {
  const [out, setOut] = useState("");
  useEffect(() => {
    setOut("");
    let i = 0;
    const t = setInterval(() => {
      i++;
      setOut(text.slice(0, i));
      if (i >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text, speed]);
  return out;
}

const ROTATING_WORDS = [
  "Wepesi",
  "Salama",
  "Wa Kisasa",
  "Wenye Akili (AI)",
  "Wa Haraka",
];

function useRotator(words: string[], interval = 2200) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % words.length), interval);
    return () => clearInterval(t);
  }, [words, interval]);
  return words[i];
}

function Index() {
  const { t } = useI18n();
  const title = useTypewriter(t("title_app"));
  const rotating = useRotator(ROTATING_WORDS);
  const [stats, setStats] = useState({ students: 0, submissions: 0, visitsToday: 0 });

  useEffect(() => {
    (async () => {
      // Track today's visit (silent — unique per device per day)
      try {
        const did = getDeviceId();
        if (did) {
          await supabase.from("daily_visits").insert({ device_id: did }).select().maybeSingle();
        }
      } catch { /* duplicate per day is fine */ }

      const today = new Date();
      const tzOffset = today.getTimezoneOffset() * 60000;
      const localDate = new Date(today.getTime() - tzOffset).toISOString().slice(0, 10);
      const [s, sub, v] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("submissions").select("id", { count: "exact", head: true }).not("submitted_at", "is", null),
        supabase.from("daily_visits").select("id", { count: "exact", head: true }).eq("visit_date", localDate),
      ]);
      setStats({ students: s.count || 0, submissions: sub.count || 0, visitsToday: v.count || 0 });
    })();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-20 -left-20 w-96 h-96 rounded-full bg-primary/20 blur-3xl animate-pulse" />
        <div className="absolute bottom-40 -right-20 w-[28rem] h-[28rem] rounded-full bg-emerald-500/15 blur-3xl animate-pulse" style={{ animationDelay: "1.5s" }} />
      </div>
      <SiteHeader />
      <main className="container mx-auto px-4 py-10">
        <div className="text-center mb-8 min-h-[160px]">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary animate-fade-in">
            <Sparkles className="h-3 w-3 animate-pulse" /> Mfumo wa Kisasa wa Mitihani
          </div>
          <h1 className="text-3xl md:text-5xl font-bold text-primary mb-3 tracking-tight">
            {title}<span className="inline-block w-1 h-8 md:h-12 bg-primary ml-1 animate-pulse" />
          </h1>
          <p className="text-muted-foreground text-base md:text-lg animate-fade-in">{t("subtitle_app")}</p>
          <div className="mt-4 flex items-center justify-center gap-2 text-lg md:text-2xl font-semibold">
            <span className="text-foreground/70">Mfumo</span>
            <span
              key={rotating}
              className="text-primary inline-block animate-fade-in"
              style={{ animation: "fade-in 600ms ease-out" }}
            >
              {rotating}
            </span>
          </div>
        </div>

        {/* BENTO GRID */}
        <div className="grid grid-cols-2 md:grid-cols-4 auto-rows-[120px] gap-3 md:gap-4 max-w-6xl mx-auto">
          {/* Big CTA: Do exam (2x2) */}
          <Link to="/exams" className="col-span-2 row-span-2 group animate-fade-in">
            <Card className="h-full border-2 hover:border-primary hover:shadow-2xl transition-all hover:-translate-y-1 bg-gradient-to-br from-primary via-primary/80 to-primary/40 text-primary-foreground overflow-hidden relative">
              <div className="absolute -right-10 -bottom-10 w-48 h-48 rounded-full bg-primary-foreground/10 blur-2xl" />
              <CardContent className="p-6 h-full flex flex-col justify-between relative">
                <div>
                  <div className="w-14 h-14 rounded-2xl bg-primary-foreground/20 backdrop-blur flex items-center justify-center mb-3">
                    <FileText className="h-7 w-7" />
                  </div>
                  <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">{t("do_exam")}</h2>
                  <p className="text-sm opacity-90 mt-1">Fanya mtihani rasmi — mtu mmoja</p>
                </div>
                <div className="flex items-center gap-2 text-sm font-bold group-hover:translate-x-1 transition-transform">
                  Anza sasa <ArrowRight className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Stat: Waliojisajili */}
          <Card className="col-span-1 row-span-1 bg-gradient-to-br from-primary/15 to-transparent border-primary/20 animate-fade-in" style={{ animationDelay: "60ms" }}>
            <CardContent className="p-4 h-full flex flex-col justify-between">
              <Users className="h-6 w-6 text-primary" />
              <div>
                <div className="text-2xl font-extrabold tabular-nums">{stats.students.toLocaleString()}</div>
                <div className="text-[10px] uppercase text-muted-foreground">Waliojisajili</div>
              </div>
            </CardContent>
          </Card>

          {/* Stat: Waliofanya */}
          <Card className="col-span-1 row-span-1 bg-gradient-to-br from-secondary/40 to-transparent border-secondary/30 animate-fade-in" style={{ animationDelay: "120ms" }}>
            <CardContent className="p-4 h-full flex flex-col justify-between">
              <ClipboardCheck className="h-6 w-6 text-primary" />
              <div>
                <div className="text-2xl font-extrabold tabular-nums">{stats.submissions.toLocaleString()}</div>
                <div className="text-[10px] uppercase text-muted-foreground">Waliofanya</div>
              </div>
            </CardContent>
          </Card>

          {/* Register */}
          <Link to="/register" className="col-span-1 row-span-1 group animate-fade-in" style={{ animationDelay: "180ms" }}>
            <Card className="h-full border-2 hover:border-primary hover:shadow-xl transition-all hover:-translate-y-1">
              <CardContent className="p-4 h-full flex flex-col justify-between">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <UserPlus className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <div className="font-bold">{t("register")}</div>
                  <div className="text-[11px] text-muted-foreground">Pata Reg Namba</div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Results */}
          <Link to="/results" className="col-span-1 row-span-1 group animate-fade-in" style={{ animationDelay: "240ms" }}>
            <Card className="h-full border-2 hover:border-amber-500 hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-amber-500/10 to-transparent">
              <CardContent className="p-4 h-full flex flex-col justify-between">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Trophy className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="font-bold">{t("view_results")}</div>
                  <div className="text-[11px] text-muted-foreground">Mtu binafsi / Group</div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Attendance (2x2) */}
          <div className="col-span-2 row-span-2 animate-fade-in" style={{ animationDelay: "300ms" }}>
            <AttendanceCheckIn />
          </div>

          {/* Quiz (new) */}
          <Link to="/quiz" className="col-span-2 row-span-1 group animate-fade-in" style={{ animationDelay: "330ms" }}>
            <Card className="h-full border-2 hover:border-emerald-500 hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-emerald-500/20 via-card to-primary/10 overflow-hidden relative">
              <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-emerald-500/10 blur-2xl" />
              <CardContent className="p-4 h-full flex items-center justify-between gap-3 relative">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-primary flex items-center justify-center shadow-lg shrink-0 group-hover:scale-110 transition-transform">
                    <Brain className="h-6 w-6 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-extrabold text-base">Quiz — Group / Individual</div>
                    <div className="text-[11px] text-muted-foreground truncate">Ungana na group lako au fanya peke yako</div>
                  </div>
                </div>
                <ArrowRight className="h-5 w-5 text-emerald-600 group-hover:translate-x-1 transition-transform shrink-0" />
              </CardContent>
            </Card>
          </Link>

          {/* Visits today */}
          <Card className="col-span-1 row-span-1 bg-gradient-to-br from-emerald-500/15 to-transparent border-emerald-500/30 animate-fade-in" style={{ animationDelay: "360ms" }}>
            <CardContent className="p-4 h-full flex flex-col justify-between">
              <div className="relative w-fit">
                <Eye className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-500" />
              </div>
              <div>
                <div className="text-2xl font-extrabold tabular-nums">{stats.visitsToday.toLocaleString()}</div>
                <div className="text-[10px] uppercase text-muted-foreground">Wametembelea Leo</div>
              </div>
            </CardContent>
          </Card>

          {/* Admin */}
          <Link to="/admin" className="col-span-1 row-span-1 group animate-fade-in" style={{ animationDelay: "420ms" }}>
            <Card className="h-full border-2 hover:border-primary hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-muted to-transparent">
              <CardContent className="p-4 h-full flex flex-col justify-between">
                <Shield className="h-6 w-6 text-primary" />
                <div>
                  <div className="font-bold">{t("admin")}</div>
                  <div className="text-[11px] text-muted-foreground">Walimu pekee</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <StudyGallery />
        <GroupAvailability />
        <HomeAssignments />
        <BigSystemTitle sub="Islamic Studies · Mtandaoni" />
      </main>

    </div>
  );
}
