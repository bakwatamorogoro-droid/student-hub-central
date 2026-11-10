import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/lib/toast";
import { useI18n } from "@/lib/i18n";
import { loadLiveLessons, type Lesson } from "@/lib/elessonsApi";
import { planTutorAnswer, rankLessons, type LessonMatch, type TutorPlan } from "@/lib/openTutor";
import { askTutorAi, type TutorSections } from "@/lib/tutorAi";
import { resolveVerses, quranUrl, type ResolvedVerse } from "@/lib/quranApi";
import {
  BookOpen,
  ExternalLink,
  GraduationCap,
  Info,
  Library,
  Lightbulb,
  ListChecks,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";

export const Route = createFileRoute("/tutor")({
  component: Page,
  head: () => ({
    meta: [
      { title: "OpenTutor — Islamic Studies Test Online" },
      {
        name: "description",
        content:
          "Uliza swali la Islamic Studies, upate maelezo, mambo muhimu na ushahidi wa Qur'an — kwa Kiswahili na Kiingereza.",
      },
      { property: "og:title", content: "OpenTutor — Islamic Studies Test Online" },
      {
        property: "og:description",
        content: "Mwalimu wa mtandaoni: maelezo, mambo muhimu na marejeo ya Qur'an.",
      },
    ],
  }),
});

/** Questions a first-time visitor can tap, so the page is never a blank box. */
const EXAMPLES = [
  { sw: "Eleza maana ya Zaka", en: "Explain the meaning of Zakah" },
  { sw: "Nguzo za Imani ni zipi?", en: "What are the pillars of Iman?" },
  { sw: "Saburi ni nini katika Uislamu?", en: "What is Saburi in Islam?" },
  { sw: "Eleza kuhusu Hijra", en: "Explain the Hijra" },
];

type Answered = {
  plan: TutorPlan;
  verses: (ResolvedVerse | null)[];
  lessons: LessonMatch[];
  /** Set when the bank recognised nothing and the AI answered instead. */
  ai: TutorSections | null;
  /** True while the AI answer is still on its way, so the page can say so. */
  aiLoading: boolean;
};

function Page() {
  const { t, lang } = useI18n();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answered | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsFailed, setLessonsFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Loaded once. A failure is not fatal: the tutor still explains and cites,
  // it just has no course material to point at.
  useEffect(() => {
    let alive = true;
    loadLiveLessons()
      .then((rows) => alive && setLessons(rows))
      .catch(() => alive && setLessonsFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const ask = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (!q || busy) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setBusy(true);
      const plan = planTutorAnswer(q);
      try {
        const verses = plan.verseRefs.length
          ? await resolveVerses(plan.verseRefs, controller.signal)
          : [];
        if (controller.signal.aborted) return;
        const ranked = rankLessons(plan, lessons);
        setAnswer({ plan, verses, lessons: ranked, ai: null, aiLoading: !plan.matched });

        // Only when the bank recognised nothing. The bank's answers are
        // grounded in the course material, so they always win; the AI is here
        // for the questions the bank cannot place at all. It arrives after the
        // grounded answer is already on screen, so the student never waits on a
        // model to see something.
        if (!plan.matched) {
          const ai = await askTutorAi(q, {
            keyPoints: plan.keyPoints,
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          setAnswer((prev) => (prev ? { ...prev, ai, aiLoading: false } : prev));
        }
      } catch {
        if (!controller.signal.aborted) {
          setAnswer({
            plan,
            verses: [],
            lessons: rankLessons(plan, lessons),
            ai: null,
            aiLoading: false,
          });
        }
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    },
    [busy, lessons],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  return (
    <div className="page-shell min-h-screen">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
        <header className="mb-8 text-center">
          <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            {lang === "sw" ? "Mwalimu wa Mtandaoni" : "Online tutor"}
          </span>
          <h1 className="text-display font-display font-extrabold text-foreground">
            {lang === "sw" ? "Uliza, uelewe" : "Ask, and understand"}
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            {lang === "sw"
              ? "Andika swali lako la Islamic Studies. Utapata maelezo mafupi, mambo muhimu ya kutaja, ushahidi wa Qur'an na masomo yanayohusiana na swali lako."
              : "Type your Islamic Studies question. You get a short explanation, the key points to name, Qur'anic evidence, and the course lessons that cover it."}
          </p>
        </header>

        <Card className="surface-raised mb-6">
          <CardContent className="p-4 sm:p-5">
            <label htmlFor="tutor-q" className="sr-only">
              {lang === "sw" ? "Swali lako" : "Your question"}
            </label>
            <Textarea
              id="tutor-q"
              rows={3}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter makes a new line. On a phone the
                // on-screen keyboard's return key is the only submit affordance,
                // so this has to work.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask(question);
                }
              }}
              placeholder={
                lang === "sw"
                  ? "Mfano: Eleza maana ya Zaka na kwa nini ni muhimu…"
                  : "For example: Explain the meaning of Zakah and why it matters…"
              }
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button disabled={busy || !question.trim()} onClick={() => void ask(question)}>
                {busy ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Search className="mr-2 h-4 w-4" />
                )}
                {busy
                  ? lang === "sw"
                    ? "Inatafuta…"
                    : "Looking…"
                  : lang === "sw"
                    ? "Uliza"
                    : "Ask"}
              </Button>
              {answer && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setAnswer(null);
                    setQuestion("");
                  }}
                >
                  {lang === "sw" ? "Safisha" : "Clear"}
                </Button>
              )}
            </div>

            {!answer && (
              <div className="mt-4 flex flex-wrap gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.en}
                    type="button"
                    onClick={() => {
                      const q = lang === "sw" ? ex.sw : ex.en;
                      setQuestion(q);
                      void ask(q);
                    }}
                    className="rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                  >
                    {lang === "sw" ? ex.sw : ex.en}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {busy && !answer && <LoadingCards />}

        {answer && (
          <div className="stagger-grid space-y-4">
            <AnswerCard answer={answer} />
            {answer.ai && <AiAnswerCard sections={answer.ai} />}
            {answer.aiLoading && !answer.ai && <AiThinkingCard />}
            {answer.plan.verseRefs.length > 0 && (
              <VersesCard refs={answer.plan.verseRefs} verses={answer.verses} />
            )}
            <LessonsCard matches={answer.lessons} failed={lessonsFailed} total={lessons.length} />
            {answer.plan.matched && (
              <FollowUpsCard plan={answer.plan} onPick={(q) => void ask(q)} />
            )}
            <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {answer.ai
                ? lang === "sw"
                  ? "Jibu hili limetolewa na AI kwa kuwa kanzi ya maarifa ya mfumo haikuipata mada hii. Ni msaada wa kujifunza — hakikisha na mwalimu wako."
                  : "This answer came from the AI because the system's knowledge bank did not know this topic. It is a study aid — check with your teacher."
                : lang === "sw"
                  ? "Maelezo haya yanatokana na kanzi ya maarifa ya mfumo na maandishi ya Qur'an kutoka quran.com. Ni msaada wa kujifunza — hakikisha na mwalimu wako."
                  : "These explanations come from the system's knowledge bank and Qur'an text from quran.com. This is a study aid — check with your teacher."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function LoadingCards() {
  return (
    <div className="space-y-4">
      {[0, 1].map((i) => (
        <Card key={i} className="surface-raised">
          <CardContent className="space-y-3 p-5">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AiThinkingCard() {
  const { lang } = useI18n();
  return (
    <Card className="surface-raised">
      <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
        {lang === "sw"
          ? "Kanzi ya maarifa haikuipata mada hii — AI inajaribu kujibu…"
          : "The knowledge bank did not know this topic — the AI is trying to answer…"}
      </CardContent>
    </Card>
  );
}

function AiAnswerCard({ sections }: { sections: TutorSections }) {
  const { lang } = useI18n();
  return (
    <Card className="surface-raised border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            {lang === "sw" ? "Jibu la AI" : "AI answer"}
          </CardTitle>
          <Badge variant="secondary" className="font-normal">
            {lang === "sw" ? "AI" : "AI"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed text-foreground/90">{sections.explanation}</p>

        {sections.keyPoints.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" />
              {lang === "sw" ? "Mambo ya kutaja" : "Points to name"}
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {sections.keyPoints.map((p) => (
                <li
                  key={p}
                  className="rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground/85"
                >
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}

        {sections.caveat && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground/85">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
            {sections.caveat}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AnswerCard({ answer }: { answer: Answered }) {
  const { lang } = useI18n();
  const { plan } = answer;

  if (!plan.matched) {
    return (
      <Card className="surface-raised">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-4 w-4 text-primary" />
            {lang === "sw" ? "Sijaipata mada hii" : "I could not place this question"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            {lang === "sw"
              ? "Kanzi ya maarifa ya mfumo haikuipata mada hii. AI inajaribu kujibu kwa chini — kama haitafanikiwa, jaribu kutaja mada yenyewe."
              : "The system's knowledge bank did not place this question. The AI is trying below — if that fails, try naming the topic itself."}
          </p>
          <p className="text-xs text-muted-foreground">
            {lang === "sw"
              ? "Mada kanzi inazojua: swala, zaka, saumu, hajj, tawhid, iman, nikah, talaq, mirath, sharia, wudu, malaika, jannah, jahannam, qiyama, hijra, khulafa, adabu, elimu, ibada, toba, dua, shukrani, saburi."
              : "Topics the bank knows: salah, zakah, fasting, hajj, tawhid, iman, nikah, talaq, mirath, sharia, wudu, angels, jannah, jahannam, qiyama, hijra, khulafa, adabu, elimu, ibada, toba, dua, shukrani, saburi."}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="surface-raised">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <GraduationCap className="h-5 w-5 text-primary" />
            {plan.topicName?.[lang]}
          </CardTitle>
          <Badge variant="secondary" className="font-normal">
            {lang === "sw" ? "Mada" : "Topic"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {plan.summary && (
          <p className="text-sm leading-relaxed text-foreground/90">{plan.summary[lang]}</p>
        )}

        {plan.keyPoints.length > 0 && (
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" />
              {lang === "sw" ? "Mambo ya kutaja" : "Points to name"}
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {plan.keyPoints.map((p) => (
                <li
                  key={p}
                  className="rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-medium text-foreground/85"
                >
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VersesCard({ refs, verses }: { refs: string[]; verses: (ResolvedVerse | null)[] }) {
  const { lang } = useI18n();

  return (
    <Card className="surface-raised">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 text-primary" />
          {lang === "sw" ? "Ushahidi wa Qur'an" : "Qur'anic evidence"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {verses.map((v, i) =>
          v ? (
            <blockquote key={v.ref} className="rounded-xl border border-border/60 bg-muted/30 p-4">
              <p dir="rtl" lang="ar" className="mb-3 text-right text-lg leading-loose">
                {v.arabic}
              </p>
              {(lang === "sw" ? v.sw : v.en) && (
                <p className="mb-2 text-sm leading-relaxed text-foreground/90">
                  {lang === "sw" ? v.sw : v.en}
                </p>
              )}
              <a
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                {v.ref} · quran.com
                <ExternalLink className="h-3 w-3" />
              </a>
            </blockquote>
          ) : (
            // A verse the API would not return is shown as a link and nothing
            // more. Printing an unverified translation would be worse.
            <a
              key={refs[i]}
              href={quranUrl(refs[i])}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {refs[i]}
              {" — "}
              {lang === "sw" ? "fungua kwenye quran.com" : "open on quran.com"}
            </a>
          ),
        )}
      </CardContent>
    </Card>
  );
}

function LessonsCard({
  matches,
  failed,
  total,
}: {
  matches: LessonMatch[];
  failed: boolean;
  total: number;
}) {
  const { lang } = useI18n();
  if (matches.length === 0) return null;

  return (
    <Card className="surface-raised">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Library className="h-4 w-4 text-primary" />
          {lang === "sw" ? "Masomo yanayohusiana" : "Related lessons"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {matches.map((m) => (
          <Link
            key={m.lesson.id}
            to="/elessons"
            className="block rounded-xl border border-border/60 bg-card/60 p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
          >
            <p className="text-sm font-semibold text-foreground">
              {(lang === "sw" ? m.lesson.title : m.lesson.titleEn) || m.lesson.title}
            </p>
            {(lang === "sw" ? m.lesson.description : m.lesson.descriptionEn) && (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {lang === "sw" ? m.lesson.description : m.lesson.descriptionEn}
              </p>
            )}
            <p className="mt-1.5 flex flex-wrap gap-1">
              {m.hits.map((h) => (
                <span
                  key={h}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                >
                  {h}
                </span>
              ))}
            </p>
          </Link>
        ))}
        {failed && total === 0 && (
          <p className="text-xs text-muted-foreground">
            {lang === "sw"
              ? "Masomo ya kozi hayakupatikana kwa sasa."
              : "Course lessons could not be loaded right now."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FollowUpsCard({ plan, onPick }: { plan: TutorPlan; onPick: (q: string) => void }) {
  const { lang } = useI18n();
  return (
    <Card className="surface-raised">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Lightbulb className="h-4 w-4 text-primary" />
          {lang === "sw" ? "Jiulize hivi" : "Test yourself"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {plan.followUps.map((f) => (
          <button
            key={f.en}
            type="button"
            onClick={() => onPick(lang === "sw" ? f.sw : f.en)}
            className="rounded-full border border-border/60 bg-muted/40 px-3 py-1.5 text-left text-xs font-medium text-foreground/80 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
          >
            {lang === "sw" ? f.sw : f.en}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
