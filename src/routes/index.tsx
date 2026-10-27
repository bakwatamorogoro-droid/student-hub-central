import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent } from "@/components/ui/card";
import { UserPlus, FileText, Trophy, Shield, Users, ClipboardCheck, Eye, ArrowRight, Brain } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device-id";
import { AttendanceCheckIn } from "@/components/AttendanceCheckIn";
import { BigSystemTitle } from "@/components/ExamVideoHero";
import { HomeAnimationHero } from "@/components/HomeAnimationHero";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { ExamHallGallery } from "@/components/ExamHallGallery";
import { StudyGallery } from "@/components/StudyGallery";

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

type TestStat = { key: string; labelKey: string; count: number };

function categorize(title: string): string {
  const t = (title || "").toLowerCase();
  if (/\btest\s*0*1\b/.test(t) || /\bmtihani\s*0*1\b/.test(t)) return "test1";
  if (/\btest\s*0*2\b/.test(t) || /\bmtihani\s*0*2\b/.test(t)) return "test2";
  if (/\btest\s*0*3\b/.test(t) || /\bmtihani\s*0*3\b/.test(t)) return "test3";
  return "others";
}

function Index() {
  const { t } = useI18n();
  const [stats, setStats] = useState({ students: 0, submissions: 0, visitsToday: 0 });
  const [testStats, setTestStats] = useState<TestStat[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const did = getDeviceId();
        if (did) {
          await supabase.from("daily_visits").insert({ device_id: did }).select().maybeSingle();
        }
      } catch { /* duplicate per day is fine */ }

      const today = new Date();
      const tzOffset = today.getTimezoneOffset() * 60000;
      const localDate = new Date(today.getTime() - tzOffset).toISOString().slice(0, 10);
      const [s, sub, v, ex] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("submissions").select("id", { count: "exact", head: true }).not("submitted_at", "is", null),
        supabase.from("daily_visits").select("id", { count: "exact", head: true }).eq("visit_date", localDate),
        supabase.from("exams").select("id,title"),
      ]);
      setStats({ students: s.count || 0, submissions: sub.count || 0, visitsToday: v.count || 0 });

      const exams = (ex.data || []) as { id: string; title: string }[];
      // Only keys are stored here: translating inside this one-shot effect would
      // freeze the label to whichever language was active on first paint.
      const groups: { key: string; labelKey: string }[] = [
        { key: "test1", labelKey: "test_1" },
        { key: "test2", labelKey: "test_2" },
        { key: "test3", labelKey: "test_3" },
        { key: "others", labelKey: "test_other" },
      ];
      const results = await Promise.all(
        groups.map(async (g) => {
          const ids = exams.filter((e) => categorize(e.title) === g.key).map((e) => e.id);
          if (ids.length === 0) return { ...g, count: 0 };
          const { count } = await supabase
            .from("submissions")
            .select("id", { count: "exact", head: true })
            .in("exam_id", ids)
            .not("submitted_at", "is", null);
          return { ...g, count: count || 0 };
        })
      );
      setTestStats(results);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-20 -left-20 w-96 h-96 rounded-full bg-primary/20 blur-3xl animate-pulse" />
        <div className="absolute bottom-40 -right-20 w-[28rem] h-[28rem] rounded-full bg-emerald-500/15 blur-3xl animate-pulse" style={{ animationDelay: "1.5s" }} />
      </div>
      <AnnouncementBanner />
      <SiteHeader />
      <main className="container mx-auto px-4 py-6 max-w-6xl">
        <HomeAnimationHero />

        {/* VITENDO VIKUU: Fanya Mtihani · Attendance · Quiz */}
        <div className="grid gap-4 md:grid-cols-3">
          <Link to="/exams" className="group animate-fade-in">
            <Card className="h-full min-h-[190px] border-2 hover:border-primary hover:shadow-2xl transition-all hover:-translate-y-1 bg-gradient-to-br from-primary via-primary/80 to-primary/40 text-primary-foreground overflow-hidden relative">
              <div className="absolute -right-10 -bottom-10 w-48 h-48 rounded-full bg-primary-foreground/10 blur-2xl" />
              <CardContent className="p-6 h-full flex flex-col justify-between relative">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-primary-foreground/20 backdrop-blur flex items-center justify-center mb-3">
                    <FileText className="h-6 w-6" />
                  </div>
                  <h2 className="text-2xl font-extrabold tracking-tight">{t("do_exam")}</h2>
                  <p className="text-sm opacity-90 mt-1">{t("do_exam_sub")}</p>
                </div>
                <div className="flex items-center gap-2 text-sm font-bold group-hover:translate-x-1 transition-transform">
                  {t("start_now")} <ArrowRight className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          </Link>

          <div className="animate-fade-in" style={{ animationDelay: "80ms" }}>
            <AttendanceCheckIn />
          </div>

          <Link to="/quiz" className="group animate-fade-in" style={{ animationDelay: "160ms" }}>
            <Card className="h-full min-h-[190px] border-2 hover:border-emerald-500 hover:shadow-2xl transition-all hover:-translate-y-1 bg-gradient-to-br from-emerald-500/20 via-card to-primary/10 overflow-hidden relative">
              <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-emerald-500/10 blur-2xl" />
              <CardContent className="p-6 h-full flex flex-col justify-between relative">
                <div>
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-primary flex items-center justify-center shadow-lg mb-3">
                    <Brain className="h-6 w-6 text-white" />
                  </div>
                  <div className="font-extrabold text-2xl tracking-tight">{t("quiz")}</div>
                  <p className="text-sm text-muted-foreground mt-1">{t("quiz_sub")}</p>
                </div>
                <div className="flex items-center gap-2 text-sm font-bold text-emerald-600 group-hover:translate-x-1 transition-transform">
                  {t("enter")} <ArrowRight className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* TAKWIMU — chini kwa mpangilio */}
        <section className="mt-10">
          <h2 className="text-xl md:text-2xl font-extrabold tracking-tight mb-4">{t("stats_title")}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <Card className="bg-gradient-to-br from-primary/15 to-transparent border-primary/20">
              <CardContent className="p-4">
                <Users className="h-6 w-6 text-primary mb-3" />
                <div className="text-2xl font-extrabold tabular-nums">{stats.students.toLocaleString()}</div>
                <div className="text-[10px] uppercase text-muted-foreground">{t("stat_registered")}</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-secondary/40 to-transparent border-secondary/30">
              <CardContent className="p-4">
                <ClipboardCheck className="h-6 w-6 text-primary mb-3" />
                <div className="text-2xl font-extrabold tabular-nums">{stats.submissions.toLocaleString()}</div>
                <div className="text-[10px] uppercase text-muted-foreground">{t("stat_took_exam")}</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-emerald-500/15 to-transparent border-emerald-500/30">
              <CardContent className="p-4">
                <div className="relative w-fit mb-3">
                  <Eye className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <div className="text-2xl font-extrabold tabular-nums">{stats.visitsToday.toLocaleString()}</div>
                <div className="text-[10px] uppercase text-muted-foreground">{t("stat_visits_today")}</div>
              </CardContent>
            </Card>
            <Link to="/results" className="group">
              <Card className="h-full border-2 hover:border-amber-500 hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-amber-500/10 to-transparent">
                <CardContent className="p-4">
                  <Trophy className="h-6 w-6 text-amber-600 mb-3" />
                  <div className="font-bold">{t("view_results")}</div>
                  <div className="text-[11px] text-muted-foreground">{t("view_results_sub")}</div>
                </CardContent>
              </Card>
            </Link>
          </div>

          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mt-8 mb-3">{t("per_test_title")}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {testStats.map((ts) => (
              <Card key={ts.key} className="border-primary/20 bg-gradient-to-br from-primary/10 to-transparent">
                <CardContent className="p-4">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-primary">{t(ts.labelKey)}</div>
                  <div className="text-3xl font-black tabular-nums mt-1">{ts.count.toLocaleString()}</div>
                  <div className="text-[10px] uppercase text-muted-foreground">{t("took")}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 md:gap-4 mt-4">
            <Link to="/register" className="group">
              <Card className="h-full border-2 hover:border-primary hover:shadow-xl transition-all hover:-translate-y-1">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center">
                    <UserPlus className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <div className="font-bold">{t("register")}</div>
                    <div className="text-[11px] text-muted-foreground">{t("get_reg")}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link to="/admin" className="group">
              <Card className="h-full border-2 hover:border-primary hover:shadow-xl transition-all hover:-translate-y-1 bg-gradient-to-br from-muted to-transparent">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
                    <Shield className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-bold">{t("admin")}</div>
                    <div className="text-[11px] text-muted-foreground">{t("teachers_only")}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </section>

        <ExamHallGallery />

        <StudyGallery />

        <BigSystemTitle sub={t("badge_islamic")} />
      </main>
    </div>
  );
}
