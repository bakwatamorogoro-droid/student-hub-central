import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { LessonThumb } from "@/components/LessonPlayer";
import {
  PROVIDER_LABELS,
  lessonLinkHint,
  needsLinkResolution,
  parseLessonLink,
  type LessonProvider,
  type ParsedLessonLink,
} from "@/lib/elesson";
import { buildLessonQuiz, lessonTopicLabel, type LessonQuestion } from "@/lib/elessonQuiz";
import {
  LESSON_CATEGORIES,
  LESSON_CATEGORY_LABELS,
  createLesson,
  deleteLesson,
  fetchLessonPreview,
  isMissingLessonsTable,
  loadAllLessons,
  resolveLessonShareLink,
  setLessonActive,
  updateLesson,
  type Lesson,
  type LessonCategory,
} from "@/lib/elessonsApi";
import { alertError, alertSuccess, confirmAction } from "@/lib/alerts";
import { toast } from "@/lib/toast";
import { useI18n } from "@/lib/i18n";
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  Film,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

export const Route = createFileRoute("/admin/elessons")({ component: Page });

type Draft = {
  url: string;
  provider: LessonProvider | null;
  videoId: string | null;
  embedUrl: string;
  thumbnailUrl: string;
  category: LessonCategory;
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  quiz: LessonQuestion[];
};

function emptyDraft(): Draft {
  return {
    url: "",
    provider: null,
    videoId: null,
    embedUrl: "",
    thumbnailUrl: "",
    category: "lecture",
    title: "",
    titleEn: "",
    description: "",
    descriptionEn: "",
    quiz: [],
  };
}

function Page() {
  const { t, lang } = useI18n();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [linkNote, setLinkNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await loadAllLessons();
      setLessons(rows);
      setTableMissing(false);
    } catch (e) {
      if (isMissingLessonsTable(e)) setTableMissing(true);
      else alertError(t("el_admin_save_failed"), String((e as Error)?.message ?? e));
      setLessons([]);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Fill the draft from a link we have already parsed, and fetch its preview. */
  const applyParsedLink = useCallback(
    async (url: string, parsed: ParsedLessonLink) => {
      setLinkNote({
        ok: true,
        text: `${t("el_admin_ready")} — ${PROVIDER_LABELS[parsed.provider]}`,
      });
      setDraft((d) => ({
        ...d,
        url,
        provider: parsed.provider,
        videoId: parsed.videoId,
        embedUrl: parsed.embedUrl,
        thumbnailUrl: parsed.thumbnailUrl || d.thumbnailUrl,
      }));

      // The provider's own title fills a blank field; it never overwrites what
      // the admin has typed.
      try {
        const preview = await fetchLessonPreview({
          provider: parsed.provider,
          url,
          videoId: parsed.videoId,
        });
        if (preview) {
          setDraft((d) => ({
            ...d,
            title: d.title || preview.title || "",
            thumbnailUrl: d.thumbnailUrl || preview.thumbnailUrl || "",
          }));
          if (!preview.title) {
            setLinkNote({ ok: true, text: t("el_admin_preview_missing") });
          }
        }
      } finally {
        setChecking(false);
      }
    },
    [t],
  );

  /** Read the pasted link and fill in whatever the provider will tell us. */
  const checkLink = useCallback(
    async (raw: string) => {
      const url = raw.trim();
      if (!url) {
        setLinkNote({ ok: false, text: t("el_admin_need_link") });
        return;
      }

      setChecking(true);

      // A share short link (`facebook.com/share/v/<code>`, `fb.watch/<code>`,
      // `vm.tiktok.com/<code>`) has no video id in it and the player refuses it.
      // Follow it to the real address first; the browser cannot, so the hop is
      // made server-side. A failed hop falls through to the normal refusal, so
      // the admin still learns the link will not play.
      let effective = url;
      if (needsLinkResolution(url)) {
        setLinkNote({ ok: true, text: t("el_admin_resolving") });
        const resolved = await resolveLessonShareLink(url);
        if (!resolved) {
          setChecking(false);
          setLinkNote({ ok: false, text: t("el_admin_resolve_failed") });
          setDraft((d) => ({ ...d, url, provider: null, videoId: null, embedUrl: "" }));
          return;
        }
        effective = resolved;
      }

      const parsed = parseLessonLink(effective);
      if (!parsed) {
        setChecking(false);
        setLinkNote({ ok: false, text: lessonLinkHint(effective) });
        setDraft((d) => ({ ...d, url, provider: null, videoId: null, embedUrl: "" }));
        return;
      }

      await applyParsedLink(effective, parsed);
    },
    [t, applyParsedLink],
  );

  const generateQuiz = useCallback(() => {
    const quiz = buildLessonQuiz({
      title: draft.title || draft.titleEn,
      description: draft.description || draft.descriptionEn,
    });
    setDraft((d) => ({ ...d, quiz }));
    const label = lessonTopicLabel(
      draft.title || draft.titleEn,
      draft.description || draft.descriptionEn,
    );
    toast.success(
      label
        ? `${t("el_admin_detected")}: ${lang === "en" ? label.en : label.sw}`
        : t("el_admin_no_topic"),
    );
  }, [draft.title, draft.titleEn, draft.description, draft.descriptionEn, t, lang]);

  const reset = () => {
    setDraft(emptyDraft());
    setEditingId(null);
    setLinkNote(null);
  };

  const startEdit = (l: Lesson) => {
    setEditingId(l.id);
    setLinkNote({ ok: true, text: `${t("el_admin_ready")} — ${PROVIDER_LABELS[l.provider]}` });
    setDraft({
      url: l.url,
      provider: l.provider,
      videoId: l.videoId,
      embedUrl: l.embedUrl,
      thumbnailUrl: l.thumbnailUrl || "",
      category: l.category,
      title: l.title,
      titleEn: l.titleEn || "",
      description: l.description || "",
      descriptionEn: l.descriptionEn || "",
      quiz: l.quiz,
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    if (!draft.provider || !draft.embedUrl) {
      setLinkNote({ ok: false, text: t("el_admin_need_link") });
      return;
    }
    if (!draft.title.trim()) {
      toast.error(t("el_admin_need_title"));
      return;
    }
    setSaving(true);
    try {
      const input = {
        provider: draft.provider,
        videoId: draft.videoId,
        url: draft.url,
        embedUrl: draft.embedUrl,
        thumbnailUrl: draft.thumbnailUrl.trim() || null,
        category: draft.category,
        title: draft.title.trim(),
        titleEn: draft.titleEn.trim() || null,
        description: draft.description.trim() || null,
        descriptionEn: draft.descriptionEn.trim() || null,
        quiz: draft.quiz,
        sourceMeta: null,
      };
      if (editingId) {
        await updateLesson(editingId, input);
        await alertSuccess(t("el_admin_saved"));
      } else {
        await createLesson({ ...input, active: true });
        await alertSuccess(t("el_admin_saved"));
      }
      reset();
      await load();
    } catch (e) {
      alertError(t("el_admin_save_failed"), String((e as Error)?.message ?? e));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (l: Lesson) => {
    try {
      await setLessonActive(l.id, !l.active);
      toast.success(!l.active ? t("el_admin_active") : t("el_admin_hidden"));
      await load();
    } catch (e) {
      alertError(t("el_admin_save_failed"), String((e as Error)?.message ?? e));
    }
  };

  const remove = async (l: Lesson) => {
    if (!(await confirmAction(t("el_admin_delete_confirm"), t("el_admin_delete_body")))) return;
    try {
      await deleteLesson(l.id);
      toast.success(t("el_admin_deleted"));
      if (editingId === l.id) reset();
      await load();
    } catch (e) {
      alertError(t("el_admin_save_failed"), String((e as Error)?.message ?? e));
    }
  };

  const detected = lessonTopicLabel(
    draft.title || draft.titleEn,
    draft.description || draft.descriptionEn,
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Film className="h-5 w-5" /> {t("el_admin_title")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{t("el_admin_sub")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {tableMissing && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>
                Jedwali la video halipo bado kwenye hifadhidata. Tumia migration{" "}
                <code className="rounded bg-muted px-1">20261105120000_elessons.sql</code> kisha
                onyesha upya ukurasa.
              </span>
            </div>
          )}

          {editingId && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/10 p-2.5 text-xs font-bold text-primary">
              <span className="flex items-center gap-1.5">
                <Pencil className="h-3.5 w-3.5" /> {t("el_admin_editing")}
              </span>
              <Button size="sm" variant="ghost" className="h-6 gap-1 px-2" onClick={reset}>
                <X className="h-3 w-3" /> {t("el_admin_cancel_edit")}
              </Button>
            </div>
          )}

          {/* Step 1 — the link */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-xs font-bold">
              <Link2 className="h-3.5 w-3.5" /> {t("el_admin_link")}
            </Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={draft.url}
                onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData("text");
                  if (pasted) {
                    e.preventDefault();
                    setDraft((d) => ({ ...d, url: pasted }));
                    void checkLink(pasted);
                  }
                }}
                placeholder={t("el_admin_link_ph")}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                className="gap-1"
                onClick={() => void checkLink(draft.url)}
                disabled={checking}
              >
                {checking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {t("el_admin_check")}
              </Button>
            </div>
            {linkNote && (
              <p
                className={`flex items-center gap-1.5 text-xs ${linkNote.ok ? "text-emerald-600" : "text-destructive"}`}
              >
                {linkNote.ok ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5" />
                )}
                {linkNote.text}
              </p>
            )}
          </div>

          {/* Live preview of the card, so the admin sees what the student will */}
          {draft.provider && draft.embedUrl && (
            <div className="grid gap-3 rounded-2xl border border-border bg-muted/30 p-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
              <LessonThumb
                provider={draft.provider}
                thumbnailUrl={draft.thumbnailUrl || null}
                title={draft.title || "Video"}
                className="aspect-video w-full rounded-xl"
              />
              <div className="space-y-2 text-xs">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {PROVIDER_LABELS[draft.provider]}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {LESSON_CATEGORY_LABELS[draft.category][lang]}
                  </Badge>
                  {detected && (
                    <Badge className="bg-primary/90 text-[10px]">
                      {t("el_admin_detected")}: {lang === "en" ? detected.en : detected.sw}
                    </Badge>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-bold">{t("el_admin_thumb")}</Label>
                  <Input
                    value={draft.thumbnailUrl}
                    onChange={(e) => setDraft((d) => ({ ...d, thumbnailUrl: e.target.value }))}
                    className="h-8 text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground">{t("el_admin_thumb_hint")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — the words, both languages */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{t("el_admin_title_sw")}</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Mfano: Nguzo tano za Uislamu"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{t("el_admin_title_en")}</Label>
              <Input
                value={draft.titleEn}
                onChange={(e) => setDraft((d) => ({ ...d, titleEn: e.target.value }))}
                placeholder="e.g. The five pillars of Islam"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{t("el_admin_desc_sw")}</Label>
              <Textarea
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{t("el_admin_desc_en")}</Label>
              <Textarea
                rows={2}
                value={draft.descriptionEn}
                onChange={(e) => setDraft((d) => ({ ...d, descriptionEn: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold">{t("el_admin_category")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {LESSON_CATEGORIES.map((c) => (
                <Button
                  key={c}
                  type="button"
                  size="sm"
                  variant={draft.category === c ? "default" : "outline"}
                  onClick={() => setDraft((d) => ({ ...d, category: c }))}
                >
                  {LESSON_CATEGORY_LABELS[c][lang]}
                </Button>
              ))}
            </div>
          </div>

          {/* Step 3 — the questions */}
          <div className="space-y-2 rounded-2xl border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-bold">{t("el_admin_quiz")}</div>
                <p className="max-w-xl text-[11px] text-muted-foreground">
                  {t("el_admin_quiz_hint")}
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button type="button" size="sm" className="gap-1" onClick={generateQuiz}>
                  <Sparkles className="h-3.5 w-3.5" />
                  {draft.quiz.length ? t("el_admin_regenerate") : t("el_admin_generate")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      quiz: [
                        ...d.quiz,
                        {
                          id: `q${Date.now()}`,
                          q: { sw: "", en: "" },
                          a: { sw: "", en: "" },
                          points: [],
                          topic: "general",
                        },
                      ],
                    }))
                  }
                >
                  <Plus className="h-3.5 w-3.5" /> {t("el_admin_add_q")}
                </Button>
              </div>
            </div>

            {draft.quiz.length === 0 && (
              <p className="rounded-lg bg-muted/40 p-3 text-center text-xs text-muted-foreground">
                {t("el_questions_none")}
              </p>
            )}

            <div className="space-y-2">
              {draft.quiz.map((q, i) => (
                <div
                  key={q.id}
                  className="space-y-2 rounded-xl border border-border bg-muted/20 p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted-foreground">
                      {t("el_question_n")} {i + 1}
                      {q.topic && q.topic !== "general" && ` · ${q.topic}`}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 gap-1 px-2 text-destructive hover:bg-destructive/10"
                      onClick={() =>
                        setDraft((d) => ({ ...d, quiz: d.quiz.filter((x) => x.id !== q.id) }))
                      }
                    >
                      <Trash2 className="h-3 w-3" /> {t("el_admin_remove_q")}
                    </Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={q.q.sw}
                      placeholder={t("el_admin_q_sw")}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          quiz: d.quiz.map((x) =>
                            x.id === q.id ? { ...x, q: { ...x.q, sw: e.target.value } } : x,
                          ),
                        }))
                      }
                    />
                    <Input
                      value={q.q.en}
                      placeholder={t("el_admin_q_en")}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          quiz: d.quiz.map((x) =>
                            x.id === q.id ? { ...x, q: { ...x.q, en: e.target.value } } : x,
                          ),
                        }))
                      }
                    />
                    <Textarea
                      rows={2}
                      value={q.a.sw}
                      placeholder={t("el_admin_a_sw")}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          quiz: d.quiz.map((x) =>
                            x.id === q.id ? { ...x, a: { ...x.a, sw: e.target.value } } : x,
                          ),
                        }))
                      }
                    />
                    <Textarea
                      rows={2}
                      value={q.a.en}
                      placeholder={t("el_admin_a_en")}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          quiz: d.quiz.map((x) =>
                            x.id === q.id ? { ...x, a: { ...x.a, en: e.target.value } } : x,
                          ),
                        }))
                      }
                    />
                  </div>
                  <Input
                    value={q.points.join(", ")}
                    placeholder={t("el_admin_points")}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        quiz: d.quiz.map((x) =>
                          x.id === q.id
                            ? {
                                ...x,
                                points: e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              }
                            : x,
                        ),
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void save()} disabled={saving} className="gap-1">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {t("el_admin_save")}
            </Button>
            <Button variant="outline" onClick={reset} className="gap-1">
              <X className="h-4 w-4" /> {t("el_admin_cancel_edit")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Film className="h-4 w-4" /> {t("el_admin_list")} ({lessons.length})
          </CardTitle>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> {t("el_refresh")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> {t("el_loading")}
            </div>
          ) : lessons.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("el_admin_none")}</p>
          ) : (
            lessons.map((l) => (
              <div
                key={l.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center"
              >
                <LessonThumb
                  provider={l.provider}
                  thumbnailUrl={l.thumbnailUrl}
                  title={l.title}
                  className="aspect-video w-full shrink-0 rounded-lg sm:w-28"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold">{l.title}</span>
                    {l.titleEn && (
                      <span className="text-xs text-muted-foreground">· {l.titleEn}</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {PROVIDER_LABELS[l.provider]}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] font-normal">
                      {LESSON_CATEGORY_LABELS[l.category][lang]}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {l.quiz.length} {t("el_questions_badge")}
                    </Badge>
                    {l.active ? (
                      <Badge className="gap-1 bg-emerald-600 text-[10px]">
                        <Eye className="h-3 w-3" /> {t("el_admin_active")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-[10px] text-muted-foreground">
                        <EyeOff className="h-3 w-3" /> {t("el_admin_hidden")}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <Switch checked={l.active} onCheckedChange={() => void toggle(l)} />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1"
                    onClick={() => startEdit(l)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> {t("el_admin_edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-destructive hover:bg-destructive/10"
                    onClick={() => void remove(l)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> {t("el_admin_delete")}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
