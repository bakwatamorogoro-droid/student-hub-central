import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LessonPlayer, LessonThumb } from "@/components/LessonPlayer";
import { LessonQuestions } from "@/components/LessonQuestions";
import { PROVIDER_LABELS } from "@/lib/elesson";
import {
  LESSON_CATEGORIES,
  LESSON_CATEGORY_ICONS,
  LESSON_CATEGORY_LABELS,
  isMissingLessonsTable,
  loadLiveLessons,
  type Lesson,
  type LessonCategory,
} from "@/lib/elessonsApi";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  BookOpen,
  GraduationCap,
  HelpCircle,
  Info,
  Loader2,
  PlayCircle,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/elessons")({
  component: Page,
  head: () => ({
    meta: [
      { title: "E-Learning — Video za Masomo | Islamic Studies Test Online" },
      {
        name: "description",
        content:
          "Lecture, mawaidha na duruus za Dr. Jiba. Angalia video hapa hapa na ujibu maswali ya mada. Watch lectures, sermons and lessons with topic questions.",
      },
      { property: "og:title", content: "E-Learning — Video za Masomo" },
      {
        property: "og:description",
        content: "Video za masomo za Islamic Studies, pamoja na maswali ya mada.",
      },
    ],
  }),
});

type Tab = "all" | LessonCategory;

function Page() {
  const { t, lang } = useI18n();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const rows = await loadLiveLessons();
      setError(null);
      setLessons(rows);
    } catch (e) {
      setError(isMissingLessonsTable(e) ? "missing" : "failed");
      setLessons([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  // The selection is derived rather than stored twice: a lesson that is hidden
  // or deleted while the page is open simply stops being selected.
  const selected = useMemo(
    () => lessons.find((l) => l.id === selectedId) ?? null,
    [lessons, selectedId],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return lessons.filter((l) => {
      if (tab !== "all" && l.category !== tab) return false;
      if (!q) return true;
      return (
        l.title.toLowerCase().includes(q) ||
        (l.titleEn || "").toLowerCase().includes(q) ||
        (l.description || "").toLowerCase().includes(q) ||
        (l.descriptionEn || "").toLowerCase().includes(q)
      );
    });
  }, [lessons, tab, query]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: lessons.length };
    for (const c of LESSON_CATEGORIES) out[c] = lessons.filter((l) => l.category === c).length;
    return out;
  }, [lessons]);

  const title = (l: Lesson) => (lang === "en" ? l.titleEn || l.title : l.title);
  const description = (l: Lesson) =>
    lang === "en" ? l.descriptionEn || l.description : l.description;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <SiteHeader />
      <main className="container mx-auto max-w-6xl space-y-5 px-4 py-8">
        <header className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/12 via-card to-secondary/15 p-6 shadow-[var(--shadow-soft)] backdrop-blur-sm md:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 rounded-full bg-secondary/20 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary shadow-[var(--shadow-edge)]">
              <Sparkles className="h-3 w-3" /> {t("el_kicker")}
            </div>
            <h1 className="mt-3 bg-gradient-to-r from-primary to-secondary bg-clip-text text-display font-black text-transparent">
              {t("el_headline")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("el_sub")}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1 border-primary/30 text-[11px]">
                <Info className="h-3 w-3" /> {t("el_public_note")}
              </Badge>
              <Badge variant="secondary" className="gap-1 text-[11px]">
                <GraduationCap className="h-3 w-3" /> {t("founder_name")}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => void load(false)}
                disabled={refreshing}
              >
                {refreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {t("el_refresh")}
              </Button>
            </div>
          </div>
        </header>

        {selected ? (
          <LessonView
            lesson={selected}
            title={title(selected)}
            description={description(selected)}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1.5">
                <TabButton active={tab === "all"} onClick={() => setTab("all")}>
                  {t("el_all")} <span className="opacity-70">{counts.all}</span>
                </TabButton>
                {LESSON_CATEGORIES.map((c) => (
                  <TabButton key={c} active={tab === c} onClick={() => setTab(c)}>
                    {LESSON_CATEGORY_ICONS[c]} {LESSON_CATEGORY_LABELS[c][lang]} {counts[c]}
                  </TabButton>
                ))}
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("el_search")}
                  className="pl-9"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> {t("el_loading")}
              </div>
            ) : error === "missing" ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                  <AlertCircle className="h-9 w-9 text-amber-500" />
                  <p className="font-medium">{t("el_empty")}</p>
                  <p className="max-w-md text-xs text-muted-foreground">{t("el_empty_body")}</p>
                </CardContent>
              </Card>
            ) : error ? (
              <Card className="border-destructive/40">
                <CardContent className="flex items-center gap-2 py-6 text-sm text-destructive">
                  <AlertCircle className="h-5 w-5 shrink-0" /> {t("el_error")}
                </CardContent>
              </Card>
            ) : filtered.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                  <BookOpen className="h-10 w-10 text-muted-foreground/50" />
                  <p className="font-medium">{t("el_empty")}</p>
                  <p className="max-w-sm text-xs text-muted-foreground">{t("el_empty_body")}</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((l, i) => (
                  <LessonCard
                    key={l.id}
                    lesson={l}
                    title={title(l)}
                    description={description(l)}
                    delay={i * 40}
                    onOpen={() => setSelectedId(l.id)}
                  />
                ))}
              </div>
            )}

            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="space-y-2 py-4 text-xs text-muted-foreground">
                <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                  <HelpCircle className="h-4 w-4 text-primary" /> {t("el_help_title")}
                </p>
                <p className="flex gap-2">
                  <PlayCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{t("el_help_1")}</span>
                </p>
                <p className="flex gap-2">
                  <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{t("el_help_2")}</span>
                </p>
                <p className="flex gap-2">
                  <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{t("el_help_3")}</span>
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-xs font-bold transition-all",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/25"
          : "border-border bg-card text-foreground/75 hover:border-primary/40 hover:text-primary",
      )}
    >
      {children}
    </button>
  );
}

function LessonCard({
  lesson,
  title,
  description,
  delay,
  onOpen,
}: {
  lesson: Lesson;
  title: string;
  description: string | null;
  delay: number;
  onOpen: () => void;
}) {
  const { t, lang } = useI18n();
  const count = lesson.quiz.length;

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ animationDelay: `${delay}ms` }}
      className="group animate-fade-in overflow-hidden rounded-2xl border-2 border-border bg-card text-left transition-all hover:-translate-y-1 hover:border-primary hover:shadow-2xl"
    >
      <LessonThumb
        provider={lesson.provider}
        thumbnailUrl={lesson.thumbnailUrl}
        title={title}
        className="aspect-video w-full"
      />
      <div className="space-y-2 p-3.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge className="gap-1 bg-primary/90 text-[10px] uppercase">
            {LESSON_CATEGORY_ICONS[lesson.category]} {LESSON_CATEGORY_LABELS[lesson.category][lang]}
          </Badge>
          <Badge variant="outline" className="text-[10px] font-normal">
            {PROVIDER_LABELS[lesson.provider]}
          </Badge>
          {count > 0 ? (
            <Badge variant="secondary" className="text-[10px] font-normal">
              {count} {t("el_questions_badge")}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
              {t("el_no_questions_badge")}
            </Badge>
          )}
        </div>

        <h3 className="line-clamp-2 text-sm font-extrabold leading-snug">{title}</h3>
        {description && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}

        <span className="inline-flex items-center gap-1 pt-0.5 text-xs font-bold text-primary">
          <PlayCircle className="h-3.5 w-3.5" /> {t("el_watch_now")}
        </span>
      </div>
    </button>
  );
}

function LessonView({
  lesson,
  title,
  description,
  onBack,
}: {
  lesson: Lesson;
  title: string;
  description: string | null;
  onBack: () => void;
}) {
  const { t, lang } = useI18n();

  return (
    <div className="animate-fade-in space-y-4">
      <Button variant="ghost" size="sm" className="gap-1" onClick={onBack}>
        ← {t("el_back")}
      </Button>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <LessonPlayer
            embedUrl={lesson.embedUrl}
            url={lesson.url}
            provider={lesson.provider}
            title={title}
          />

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge className="gap-1 bg-primary/90 text-[10px] uppercase">
                {LESSON_CATEGORY_ICONS[lesson.category]}{" "}
                {LESSON_CATEGORY_LABELS[lesson.category][lang]}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-normal">
                {PROVIDER_LABELS[lesson.provider]}
              </Badge>
              <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
                <GraduationCap className="h-3 w-3" /> {t("el_teacher")}: {t("founder_name")}
              </Badge>
            </div>
            <h1 className="text-xl font-black leading-tight tracking-tight md:text-2xl">{title}</h1>
            {description && (
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>

        {/* The questions sit in their own column on a wide screen and drop below
            the player on a phone, so a student never scrolls past the video to
            find them. */}
        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <Card className="border-primary/20">
            <CardContent className="pt-4">
              <LessonQuestions quiz={lesson.quiz} title={title} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
