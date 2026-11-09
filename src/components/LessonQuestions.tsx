import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, HelpCircle, Lightbulb, ListChecks } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { LessonQuestion } from "@/lib/elessonQuiz";

/**
 * The study questions beside the player.
 *
 * They are shown one at a time behind a disclosure rather than all at once, so a
 * student can think about the question before seeing the answer — which is the
 * whole point of a study aid. The answer is never hidden from the admin, only
 * from the reader, so nothing is lost if the admin opens this page.
 *
 * The question and the answer are each rendered in the language the reader has
 * chosen; a question that exists in only one language falls back to it (see
 * `readLessonQuiz`), so a half-filled row still reads.
 */
export function LessonQuestions({ quiz, title }: { quiz: LessonQuestion[]; title: string }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const questions = useMemo(() => quiz.filter((q) => q.q.sw || q.q.en), [quiz]);

  if (questions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-5 text-center">
        <HelpCircle className="mx-auto mb-2 h-7 w-7 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t("el_questions_none")}</p>
      </div>
    );
  }

  const pick = (v: { sw: string; en: string }) => (lang === "en" ? v.en || v.sw : v.sw || v.en);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <ListChecks className="h-4 w-4 text-primary" />
        </span>
        <div>
          <h3 className="text-sm font-extrabold uppercase tracking-wide">{t("el_questions")}</h3>
          <p className="text-[11px] leading-snug text-muted-foreground">{t("el_questions_sub")}</p>
        </div>
      </div>

      <ol className="space-y-2.5">
        {questions.map((q, i) => {
          const isOpen = Boolean(open[q.id]);
          const points = q.points.filter(Boolean);
          return (
            <li key={q.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-start gap-2.5 p-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-primary text-[11px] font-black text-primary-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{pick(q.q)}</p>
                  {q.topic && q.topic !== "general" && (
                    <Badge variant="outline" className="mt-1.5 text-[10px] font-normal">
                      {t("el_topic")}: {q.topic}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="border-t border-border/60 px-3 py-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 px-2 text-[11px] font-bold text-primary hover:bg-primary/10"
                  onClick={() => setOpen((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                  aria-expanded={isOpen}
                >
                  {isOpen ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                  {isOpen ? t("el_hide_answer") : t("el_show_answer")}
                </Button>

                {isOpen && (
                  <div className="animate-fade-in space-y-2 pb-1 pt-1">
                    {(q.a.sw || q.a.en) && (
                      <div className="rounded-xl bg-emerald-500/10 p-2.5">
                        <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                          <Lightbulb className="h-3 w-3" /> {t("el_model_answer")}
                        </div>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed">{pick(q.a)}</p>
                      </div>
                    )}
                    {points.length > 0 && (
                      <div>
                        <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          {t("el_key_points")}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {points.map((p) => (
                            <Badge key={p} variant="secondary" className="text-[10px] font-normal">
                              {p}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <p className="text-[11px] text-muted-foreground">{title}</p>
    </div>
  );
}
