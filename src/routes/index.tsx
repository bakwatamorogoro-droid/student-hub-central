import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent } from "@/components/ui/card";
import {
  UserPlus,
  FileText,
  Trophy,
  Shield,
  Users,
  UsersRound,
  ClipboardCheck,
  Eye,
  ArrowRight,
  CalendarCheck,
  GraduationCap,
  PlayCircle,
} from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device-id";
import { BigSystemTitle } from "@/components/ExamVideoHero";
import { FounderPurpose } from "@/components/FounderPurpose";
import { HomeAnimationHero } from "@/components/HomeAnimationHero";
import { RealPhotoHero } from "@/components/RealPhotoHero";
import { UpdateTaarifaCard } from "@/components/UpdateTaarifaCard";
import { DashboardActionCard } from "@/components/DashboardActionCard";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { Odometer } from "@/components/Odometer";
import { testCategory, TEST_NUMBERS } from "@/lib/examCatalog";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Islamic Studies Test Online" },
      {
        name: "description",
        content:
          "Islamic Studies Test Online — fanya mitihani, angalia maswali ya semester, na fuatilia matokeo yako.",
      },
      { property: "og:title", content: "Islamic Studies Test Online" },
      {
        property: "og:description",
        content: "Islamic Studies Test Online — mitihani na maswali ya semester.",
      },
    ],
  }),
});

type TestStat = { key: string; labelKey: string; count: number };

/** Read by the home stats so the admin can hide a counter without a rebuild. */
type StatVisibility = { showSubmissions: boolean; showTest1: boolean; hiddenSince: string | null };

function Index() {
  const { t } = useI18n();
  const [stats, setStats] = useState({ students: 0, submissions: 0, visitsToday: 0 });
  const [testStats, setTestStats] = useState<TestStat[]>([]);
  const [vis, setVis] = useState<StatVisibility>({
    showSubmissions: true,
    showTest1: true,
    hiddenSince: null,
  });

  useEffect(() => {
    (async () => {
      try {
        const did = getDeviceId();
        if (did) {
          await supabase.from("daily_visits").insert({ device_id: did }).select().maybeSingle();
        }
      } catch {
        /* duplicate per day is fine */
      }

      const { data: settings } = await supabase
        .from("app_settings")
        .select("show_submissions_stat, show_test1_stat, stats_hidden_at")
        .eq("id", 1)
        .single();
      const s0 = settings as {
        show_submissions_stat: boolean | null;
        show_test1_stat: boolean | null;
        stats_hidden_at: string | null;
      } | null;
      const visibility: StatVisibility = {
        showSubmissions: s0?.show_submissions_stat !== false,
        showTest1: s0?.show_test1_stat !== false,
        hiddenSince: s0?.stats_hidden_at ?? null,
      };
      setVis(visibility);

      const today = new Date();
      const tzOffset = today.getTimezoneOffset() * 60000;
      const localDate = new Date(today.getTime() - tzOffset).toISOString().slice(0, 10);
      // Once a counter has been hidden, only takers after that moment are
      // counted, so switching it back on shows fresh activity rather than the
      // old total the admin asked to hide.
      let submissionsQuery = supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .not("submitted_at", "is", null);
      if (visibility.hiddenSince) {
        submissionsQuery = submissionsQuery.gt("submitted_at", visibility.hiddenSince);
      }
      const [s, sub, v, ex] = await Promise.all([
        supabase.from("students").select("id", { count: "exact", head: true }),
        submissionsQuery,
        supabase
          .from("daily_visits")
          .select("id", { count: "exact", head: true })
          .eq("visit_date", localDate),
        supabase.from("exams").select("id,title,test_number"),
      ]);
      setStats({ students: s.count || 0, submissions: sub.count || 0, visitsToday: v.count || 0 });

      const exams = (ex.data || []) as { id: string; title: string; test_number: number | null }[];
      // Only keys are stored here: translating inside this one-shot effect would
      // freeze the label to whichever language was active on first paint.
      const groups: { key: string; labelKey: string }[] = [
        ...TEST_NUMBERS.map((n) => ({ key: `test${n}`, labelKey: `test_${n}` })),
        { key: "others", labelKey: "test_other" },
      ];
      const results = await Promise.all(
        groups.map(async (g) => {
          // Filed by the admin's `test_number`, with the title only as a fallback,
          // so a Test 1 named "MAJARIO" counts as Test 1 here too.
          const ids = exams.filter((e) => testCategory(e) === g.key).map((e) => e.id);
          if (ids.length === 0) return { ...g, count: 0 };
          let q = supabase
            .from("submissions")
            .select("id", { count: "exact", head: true })
            .in("exam_id", ids)
            .not("submitted_at", "is", null);
          if (visibility.hiddenSince) q = q.gt("submitted_at", visibility.hiddenSince);
          const { count } = await q;
          return { ...g, count: count || 0 };
        }),
      );
      setTestStats(results);
    })();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-20 -left-20 w-96 h-96 rounded-full bg-primary/20 blur-3xl animate-pulse" />
        <div
          className="absolute bottom-40 -right-20 w-[28rem] h-[28rem] rounded-full bg-emerald-500/15 blur-3xl animate-pulse"
          style={{ animationDelay: "1.5s" }}
        />
      </div>
      <AnnouncementBanner />
      <SiteHeader />
      <main className="container mx-auto px-4 py-6 max-w-6xl">
        <RealPhotoHero fallback={<HomeAnimationHero />} />

        {/* E-LEARNING — the owner asked for this in front of the page, so it
            sits above everything else a student sees on arrival. Kept as a
            single compact banner so it leads without pushing the tiles down. */}
        <div className="animate-fade-in mb-3">
          <Link to="/elessons" className="group block">
            {/* A fixed dark banner in both themes: `--primary` turns light in
                dark mode, which would leave white copy on a pale blue. */}
            <Card className="relative overflow-hidden border-2 border-sky-500/30 bg-gradient-to-br from-slate-900 via-sky-900 to-teal-900 text-white shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-float">
              <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-sky-400/25 blur-2xl" />
              <div className="absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-teal-400/20 blur-2xl" />
              <CardContent className="relative flex items-center gap-3 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 shadow-lg backdrop-blur">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.14em] backdrop-blur">
                    <PlayCircle className="h-2.5 w-2.5" /> {t("el_kicker")}
                  </div>
                  <h2 className="mt-1 font-display text-lg font-extrabold leading-tight tracking-tight">
                    {t("elearning")}
                  </h2>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/85">
                    {t("el_card_sub")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5 text-xs font-bold">
                  <span className="hidden sm:inline">{t("el_watch")}</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Update Taarifa — the self-service flow, one tap from the dashboard */}
        <div className="animate-fade-in mb-3">
          <UpdateTaarifaCard />
        </div>

        {/* The four things a student opens daily, as equal compact tiles: 2x2 on
            a phone, one row of four from `md`. Attendance keeps the first
            position because it is the one used during a lecture. */}
        <div className="mb-4 grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
          <DashboardActionCard
            to="/attendance"
            tone="emerald"
            icon={CalendarCheck}
            kicker={t("attendance_kicker")}
            title={t("nav_attendance")}
            sub={t("attendance_card_sub")}
            cta={t("attendance_open_now")}
          />
          <DashboardActionCard
            to="/exams"
            tone="primary"
            icon={FileText}
            kicker={t("do_exam_kicker")}
            title={t("do_exam")}
            sub={t("do_exam_sub")}
            cta={t("start_now")}
            delay={70}
          />
          <DashboardActionCard
            to="/quiz"
            tone="violet"
            icon={Users}
            kicker={t("quiz_badge")}
            title={t("quiz")}
            sub={t("quiz_sub")}
            cta={t("quiz_cta")}
            delay={140}
          />
          <DashboardActionCard
            to="/group"
            tone="sky"
            icon={UsersRound}
            kicker={t("gh_card_kicker")}
            title={t("gh_title")}
            sub={t("gh_card_sub")}
            cta={t("gh_card_cta")}
            delay={210}
          />
        </div>

        {/* TAKWIMU — chini kwa mpangilio */}
        <section className="mt-10">
          <h2 className="mb-4 flex items-center gap-3 text-xl font-extrabold tracking-tight md:text-2xl">
            <span className="h-6 w-1.5 rounded-full bg-gradient-to-b from-primary to-secondary" />
            {t("stats_title")}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <Card className="border-primary/20 bg-gradient-to-br from-primary/15 to-transparent transition-transform hover:-translate-y-1">
              <CardContent className="p-4">
                <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                  <Users className="h-5 w-5 text-primary" />
                </span>
                <Odometer value={stats.students} className="text-2xl font-extrabold" />
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t("stat_registered")}
                </div>
              </CardContent>
            </Card>
            {vis.showSubmissions ? (
              <Card className="border-secondary/30 bg-gradient-to-br from-secondary/40 to-transparent transition-transform hover:-translate-y-1">
                <CardContent className="p-4">
                  <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/25">
                    <ClipboardCheck className="h-5 w-5 text-primary" />
                  </span>
                  <Odometer value={stats.submissions} className="text-2xl font-extrabold" />
                  <div className="text-[10px] uppercase text-muted-foreground">
                    {t("stat_took_exam")}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed border-secondary/30 bg-transparent">
                <CardContent className="p-4">
                  <ClipboardCheck className="h-6 w-6 text-muted-foreground/50 mb-3" />
                  <div className="text-2xl font-extrabold text-muted-foreground/50">—</div>
                  <div className="text-[10px] uppercase text-muted-foreground">
                    {t("stat_took_exam")}
                  </div>
                </CardContent>
              </Card>
            )}
            <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 to-transparent transition-transform hover:-translate-y-1">
              <CardContent className="p-4">
                <div className="relative mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15">
                  <Eye className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 animate-ping rounded-full bg-emerald-500" />
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500" />
                </div>
                <Odometer value={stats.visitsToday} className="text-2xl font-extrabold" />
                <div className="text-[10px] uppercase text-muted-foreground">
                  {t("stat_visits_today")}
                </div>
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

          <h3 className="mt-8 mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground">
            <span className="h-3.5 w-1 rounded-full bg-secondary" />
            {t("per_test_title")}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {testStats.map((ts) => {
              const hidden = ts.key === "test1" && !vis.showTest1;
              return (
                <Card
                  key={ts.key}
                  className={`border-primary/20 bg-gradient-to-br from-primary/10 to-transparent ${hidden ? "border-dashed opacity-70" : ""}`}
                >
                  <CardContent className="p-4">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-primary">
                      {t(ts.labelKey)}
                    </div>
                    {hidden ? (
                      <div className="text-3xl font-black mt-1 text-muted-foreground/50">—</div>
                    ) : (
                      <Odometer value={ts.count} className="text-3xl font-black mt-1" />
                    )}
                    <div className="text-[10px] uppercase text-muted-foreground">{t("took")}</div>
                  </CardContent>
                </Card>
              );
            })}
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

        <BigSystemTitle sub={t("badge_islamic")} />

        <FounderPurpose />
      </main>
    </div>
  );
}
