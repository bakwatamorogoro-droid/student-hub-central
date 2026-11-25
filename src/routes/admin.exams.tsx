import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { confirmAction } from "@/lib/alerts";
import { Plus, Pencil, Trash2, Eye, EyeOff, Check } from "lucide-react";
import { eatLocalInputToUtcIso, utcIsoToEatLocalInput } from "@/lib/time";
import { ACADEMIC_YEARS, STUDY_YEARS } from "@/lib/academicTargeting";
import { TypeBadge } from "@/components/ExamAnswerField";
import { QuestionComposer } from "@/components/QuestionComposer";
import { generateReferenceAnswer } from "@/lib/grading.functions";
import { useI18n } from "@/lib/i18n";
import { describeSaveFailure, draftToRow, type QuestionDraft } from "@/lib/questionDraft";
import {
  COURSE_CODE_MAX,
  COURSE_NAME_MAX,
  courseFromRow,
  courseLabel,
  coursePayload,
  publishWarning,
  toggledPublish,
  validateCourse,
  visibilityLabel,
} from "@/lib/examBuilder";
import { retryWithoutMissingColumns } from "@/lib/schema-retry";

export const Route = createFileRoute("/admin/exams")({ component: Page });

function Page() {
  const [exams, setExams] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);

  const load = async () => {
    const { data } = await supabase
      .from("exams")
      .select("*, questions(count)")
      .order("created_at", { ascending: false });
    setExams(data || []);
  };
  useEffect(() => {
    load();
  }, []);

  const saveExam = async (e: any) => {
    // Compulsory on create; on edit an older test without a course can still save.
    const errors = validateCourse({ courseName: e.course_name, courseCode: e.course_code }, !e.id);
    if (Object.keys(errors).length > 0) {
      toast.error(errors.courseName || errors.courseCode || "Kamilisha taarifa za kozi.");
      return;
    }
    const payload = {
      title: e.title,
      description: e.description,
      duration_minutes: Number(e.duration_minutes) || 60,
      start_time: eatLocalInputToUtcIso(e.start_time || ""),
      end_time: eatLocalInputToUtcIso(e.end_time || ""),
      require_camera: !!e.require_camera,
      require_gps: !!e.require_gps,
      require_audio: !!e.require_audio,
      require_signature: !!e.require_signature,
      published: !!e.published,
      randomize_questions: !!e.randomize_questions,
      randomize_mcq: !!e.randomize_mcq,
      randomize_tf: !!e.randomize_tf,
      randomize_matching: !!e.randomize_matching,
      autosave_disabled: !!e.autosave_disabled,
      // Every test composed here is an individual test. The old form let an
      // admin pick "group", which changed how marks were totalled without
      // saying so.
      quiz_mode: null,
      quiz_active: !!e.quiz_active,
      target_study_year: e.target_study_year ? Number(e.target_study_year) : null,
      target_academic_year: e.target_academic_year || null,
      assignment_mode: null,
      ...coursePayload({ courseName: e.course_name, courseCode: e.course_code }),
    };
    (payload as any).test_number = e.test_number ? Number(e.test_number) : null;

    // `course_name`/`course_code` arrive with a migration that may not have been
    // applied yet; the retry drops them so the rest of the test still saves.
    const write = async (body: Record<string, unknown>) =>
      e.id
        ? await supabase
            .from("exams")
            .update(body as any)
            .eq("id", e.id)
        : await supabase.from("exams").insert(body as any);

    const { last, dropped } = await retryWithoutMissingColumns(
      payload as Record<string, unknown>,
      write,
    );
    if (last.error) {
      toast.error("Imeshindikana kuhifadhi. Jaribu tena.");
      return;
    }
    if (dropped.length > 0) {
      toast.info("Kozi haijawekwa: safu za kozi hazijawashwa kwenye hifadhidata bado.");
    }
    toast.success("Imehifadhiwa");
    setEditing(null);
    load();
  };

  /** Publish from the list, so a test is never hidden by accident. */
  const togglePublish = async (e: any) => {
    const next = toggledPublish(e.published);
    const { error } = await supabase.from("exams").update({ published: next }).eq("id", e.id);
    if (error) {
      toast.error("Imeshindikana kubadilisha hali ya kuonekana.");
      return;
    }
    toast.success(next ? "Mtihani unaonekana kwa wanafunzi" : "Mtihani hautaonekana kwa wanafunzi");
    load();
  };

  const del = async (id: string) => {
    if (!(await confirmAction("Futa mtihani huu?", "Haitarudishwa."))) return;
    await supabase.from("exams").delete().eq("id", id);
    load();
  };

  // The list query asks PostgREST for `questions(count)`, which arrives as a
  // one-element array per exam.
  const questionCount = (e: { questions?: Array<{ count: number }> | null }): number =>
    e.questions?.[0]?.count ?? 0;

  // Shown beside the fields while the admin types, but not for a field left
  // empty on an older test: that is allowed, so flagging it would nag.
  const courseErrors = editing
    ? validateCourse(
        { courseName: editing.course_name, courseCode: editing.course_code },
        !editing.id,
      )
    : {};

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Mitihani</h2>
        <Button
          onClick={() =>
            setEditing({
              duration_minutes: 60,
              require_camera: true,
              require_gps: true,
              require_signature: true,
            })
          }
        >
          <Plus className="h-4 w-4 mr-1" />
          Mtihani Mpya
        </Button>
      </div>
      <div className="grid gap-3">
        {exams.map((e) => (
          <Card key={e.id}>
            <CardContent className="p-4 flex justify-between items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-bold">
                  {e.title}{" "}
                  {e.published && (
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded ml-2">
                      Published
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>{e.duration_minutes} dakika</span>
                  <span className={questionCount(e) === 0 ? "text-xs font-semibold" : "text-xs"}>
                    Maswali {questionCount(e)}
                  </span>
                  {courseLabel(courseFromRow(e)) && (
                    <span className="text-xs bg-secondary/50 px-2 py-0.5 rounded font-semibold">
                      {courseLabel(courseFromRow(e))}
                    </span>
                  )}
                  {e.target_study_year && (
                    <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded">
                      Mwaka {e.target_study_year}
                    </span>
                  )}
                  {e.target_academic_year && (
                    <span className="text-xs bg-secondary/50 px-2 py-0.5 rounded">
                      {e.target_academic_year}
                    </span>
                  )}
                  {e.test_number && (
                    <span className="text-xs bg-blue-500/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-bold">
                      Test {e.test_number}
                    </span>
                  )}
                  {e.quiz_mode && (
                    <span className="text-xs bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded">
                      Quiz: {e.quiz_mode}
                    </span>
                  )}
                  {!e.published && publishWarning(questionCount(e)) && (
                    <span className="text-xs text-amber-700 dark:text-amber-300">
                      {publishWarning(questionCount(e))}
                    </span>
                  )}
                  {!e.published && (
                    <span className="text-xs bg-amber-500/20 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded font-semibold">
                      {visibilityLabel(e.published)}
                    </span>
                  )}
                  {e.quiz_mode && (
                    <label className="flex items-center gap-1 text-xs cursor-pointer">
                      <Switch
                        checked={!!e.quiz_active}
                        onCheckedChange={async (v) => {
                          await supabase.from("exams").update({ quiz_active: v }).eq("id", e.id);
                          toast.success(v ? "Quiz imewashwa" : "Quiz imezimwa");
                          load();
                        }}
                      />
                      <span>{e.quiz_active ? "🟢 Hai" : "⚪ Imezimwa"}</span>
                    </label>
                  )}
                </div>
              </div>
              <div className="flex gap-1 flex-wrap items-center">
                <Button
                  size="sm"
                  variant={e.published ? "default" : "outline"}
                  onClick={() => togglePublish(e)}
                  title={visibilityLabel(e.published)}
                  className={e.published ? "" : "border-dashed"}
                >
                  {e.published ? (
                    <Eye className="h-3 w-3 mr-1" />
                  ) : (
                    <EyeOff className="h-3 w-3 mr-1" />
                  )}
                  {e.published ? "Published" : "Publish"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelected(selected === e.id ? null : e.id)}
                >
                  Maswali
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(e)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button size="sm" variant="destructive" onClick={() => del(e.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              {selected === e.id && (
                <div className="w-full">
                  <QuestionsPanel examId={e.id} onChanged={load} />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Hariri" : "Mtihani Mpya"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Jina</Label>
                <Input
                  value={editing.title || ""}
                  onChange={(ev) => setEditing({ ...editing, title: ev.target.value })}
                />
              </div>
              <div>
                <Label>Namba ya Test</Label>
                <Select
                  value={String(editing.test_number || "")}
                  onValueChange={(v) =>
                    setEditing({ ...editing, test_number: v ? Number(v) : null })
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Chagua Test (1-5)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Test 1</SelectItem>
                    <SelectItem value="2">Test 2</SelectItem>
                    <SelectItem value="3">Test 3</SelectItem>
                    <SelectItem value="4">Test 4</SelectItem>
                    <SelectItem value="5">Test 5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Maelezo</Label>
                <Textarea
                  value={editing.description || ""}
                  onChange={(ev) => setEditing({ ...editing, description: ev.target.value })}
                />
              </div>
              <div>
                <Label>Muda (dakika)</Label>
                <Input
                  type="number"
                  value={editing.duration_minutes || 60}
                  onChange={(ev) => setEditing({ ...editing, duration_minutes: ev.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Muda wa kuanza (EAT)</Label>
                  <Input
                    type="datetime-local"
                    value={editing._startLocal ?? utcIsoToEatLocalInput(editing.start_time)}
                    onChange={(ev) =>
                      setEditing({
                        ...editing,
                        _startLocal: ev.target.value,
                        start_time: ev.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Muda wa kuisha (EAT)</Label>
                  <Input
                    type="datetime-local"
                    value={editing._endLocal ?? utcIsoToEatLocalInput(editing.end_time)}
                    onChange={(ev) =>
                      setEditing({
                        ...editing,
                        _endLocal: ev.target.value,
                        end_time: ev.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2">
                  <Switch
                    checked={!!editing.require_camera}
                    onCheckedChange={(v) => setEditing({ ...editing, require_camera: v })}
                  />
                  Kamera
                </label>
                <label className="flex items-center gap-2">
                  <Switch
                    checked={!!editing.require_gps}
                    onCheckedChange={(v) => setEditing({ ...editing, require_gps: v })}
                  />
                  GPS
                </label>
                <label className="flex items-center gap-2">
                  <Switch
                    checked={!!editing.require_audio}
                    onCheckedChange={(v) => setEditing({ ...editing, require_audio: v })}
                  />
                  Sauti
                </label>
                <label className="flex items-center gap-2">
                  <Switch
                    checked={!!editing.require_signature}
                    onCheckedChange={(v) => setEditing({ ...editing, require_signature: v })}
                  />
                  Sahihi
                </label>
                <label className="flex items-center gap-2 col-span-2">
                  <Switch
                    checked={!!editing.published}
                    onCheckedChange={(v) => setEditing({ ...editing, published: v })}
                  />
                  Publish
                </label>
              </div>
              <div className="border-t pt-3 space-y-2">
                <Label className="text-sm font-bold">Kozi</Label>
                <div>
                  <Label className="text-xs">Jina la kozi *</Label>
                  <Input
                    className="mt-1"
                    maxLength={COURSE_NAME_MAX}
                    placeholder="Mfano: Introduction to Qur'an and Hadith Studies"
                    value={editing.course_name || ""}
                    onChange={(ev) => setEditing({ ...editing, course_name: ev.target.value })}
                  />
                  {courseErrors.courseName && (editing.course_name || "").length > 0 && (
                    <p className="mt-1 text-xs text-destructive">{courseErrors.courseName}</p>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Code ya kozi *</Label>
                  <Input
                    className="mt-1 font-mono uppercase"
                    maxLength={COURSE_CODE_MAX}
                    placeholder="Mfano: IS120"
                    value={editing.course_code || ""}
                    onChange={(ev) => setEditing({ ...editing, course_code: ev.target.value })}
                  />
                  {courseErrors.courseCode && (editing.course_code || "").length > 0 && (
                    <p className="mt-1 text-xs text-destructive">{courseErrors.courseCode}</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Kozi inahitajika ili mtihani utambulike kwenye orodha na matokeo.
                </p>
              </div>
              <div className="border-t pt-3">
                <Label className="text-sm font-bold">Aina ya Mtihani</Label>
                <div className="mt-2 rounded-md border bg-muted/40 px-3 py-2 text-sm font-semibold">
                  Individual Test
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Kila mtihani unaoundwa hapa ni wa mtu binafsi — kila mwanafunzi anajibiwa peke
                  yake.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t pt-3">
                <div>
                  <Label>Mwaka wa Masomo</Label>
                  <Select
                    value={editing.target_study_year ? String(editing.target_study_year) : "all"}
                    onValueChange={(v) =>
                      setEditing({ ...editing, target_study_year: v === "all" ? null : Number(v) })
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Miaka yote</SelectItem>
                      {STUDY_YEARS.map((year) => (
                        <SelectItem key={year} value={String(year)}>
                          Mwaka wa {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Mwaka wa Kitaaluma</Label>
                  <Select
                    value={editing.target_academic_year || "all"}
                    onValueChange={(v) =>
                      setEditing({ ...editing, target_academic_year: v === "all" ? null : v })
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Miaka yote</SelectItem>
                      {ACADEMIC_YEARS.map((year) => (
                        <SelectItem key={year} value={year}>
                          {year}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="border-t pt-3">
                <Label className="text-sm font-bold">
                  Mpangilio wa Maswali (Random / Sawa kwa wote)
                </Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={!!editing.randomize_questions}
                      onCheckedChange={(v) => setEditing({ ...editing, randomize_questions: v })}
                    />
                    Maswali random
                  </label>
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={!!editing.randomize_mcq}
                      onCheckedChange={(v) => setEditing({ ...editing, randomize_mcq: v })}
                    />
                    MCQ chaguzi random
                  </label>
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={!!editing.randomize_tf}
                      onCheckedChange={(v) => setEditing({ ...editing, randomize_tf: v })}
                    />
                    True/False random
                  </label>
                  <label className="flex items-center gap-2">
                    <Switch
                      checked={!!editing.randomize_matching}
                      onCheckedChange={(v) => setEditing({ ...editing, randomize_matching: v })}
                    />
                    Matching random
                  </label>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Random imewekwa per-mwanafunzi (kila mwanafunzi anaona mpangilio tofauti lakini
                  imara).
                </p>
                <label className="flex items-center gap-2 mt-3 pt-3 border-t">
                  <Switch
                    checked={!!editing.autosave_disabled}
                    onCheckedChange={(v) => setEditing({ ...editing, autosave_disabled: v })}
                  />
                  Zima auto-save (wanafunzi watahifadhi wenyewe)
                </label>
              </div>
              <Button className="w-full" onClick={() => saveExam(editing)}>
                Hifadhi
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionsPanel({ examId, onChanged }: { examId: string; onChanged: () => void }) {
  const { t } = useI18n();
  const [qs, setQs] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [composing, setComposing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .eq("exam_id", examId)
      .order("position");
    if (error) {
      setLoadError(true);
      return;
    }
    setLoadError(false);
    setQs(data || []);
  };

  useEffect(() => {
    load();
  }, [examId]);

  /**
   * Writes one question and reports back whether it landed.
   *
   * The previous version awaited the write, ignored the error and toasted
   * success anyway — so a rejected question vanished while the teacher was told
   * it had been saved. Returning the failure lets the composer keep the draft on
   * screen, with the reason attached to it.
   */
  const writeQuestion = async (draft: QuestionDraft): Promise<string | null> => {
    const built = draftToRow(draft);
    if ("error" in built) return built.error;

    const row = { ...built.row, exam_id: examId, position: draft.position ?? qs.length };
    const write = draft.id
      ? supabase
          .from("questions")
          .update(row as any)
          .eq("id", draft.id)
      : supabase.from("questions").insert(row as any);

    const { error } = await write;
    if (error) {
      const reason = describeSaveFailure(error);
      toast.error(t(reason));
      return reason;
    }
    toast.success(draft.id ? t("qc_saved_edit") : t("qc_saved_new"));
    await load();
    // The card's "Maswali N" badge comes from a separate query; without this it
    // kept saying 0 after the first question was added.
    onChanged();
    return null;
  };

  const save = async (draft: QuestionDraft): Promise<string | null> => {
    const failure = await writeQuestion(draft);
    if (!failure) {
      setComposing(false);
      setEditing(null);
    }
    return failure;
  };

  const del = async (id: string) => {
    if (!(await confirmAction(t("qc_delete_ask"), t("qc_delete_note")))) return;
    const { error } = await supabase.from("questions").delete().eq("id", id);
    if (error) {
      toast.error(t("question_save_failed"));
      return;
    }
    await load();
    onChanged();
  };

  const generateReference = async (body: string) => {
    try {
      const r = await generateReferenceAnswer(body);
      if (!r.answer) {
        toast.error(t("qc_ai_missing"));
        return null;
      }
      toast.success(
        r.source === "bank"
          ? `${t("qc_ai_found_bank")}${r.topicName ? " (" + r.topicName.sw + ")" : ""}`
          : t("qc_ai_found_ai"),
      );
      return { answer: r.answer, concepts: r.concepts };
    } catch {
      toast.error(t("qc_ai_failed"));
      return null;
    }
  };

  const totalPoints = qs.reduce((sum, q) => sum + (Number(q.points) || 0), 0);

  if (composing || editing) {
    return (
      <div className="mt-3 border-t pt-3">
        <QuestionComposer
          row={editing}
          onSave={save}
          onCancel={() => {
            setComposing(false);
            setEditing(null);
          }}
          onGenerateReference={generateReference}
        />
      </div>
    );
  }

  return (
    <div className="mt-3 border-t pt-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h4 className="font-semibold">{t("qc_list_title")}</h4>
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("qc_list_meta", { n: qs.length, points: totalPoints })}
          </span>
        </div>
        <Button size="sm" onClick={() => setComposing(true)}>
          <Plus className="h-3.5 w-3.5" /> {t("qc_add")}
        </Button>
      </div>

      {loadError && (
        <p className="mb-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {t("qc_load_failed")}
        </p>
      )}

      {qs.length === 0 ? (
        <button
          type="button"
          onClick={() => setComposing(true)}
          className="flex w-full flex-col items-center gap-1 rounded-xl border border-dashed border-border/70 p-8 text-center transition hover:border-primary/50 hover:bg-primary/5"
        >
          <Plus className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-semibold">{t("qc_empty_title")}</span>
          <span className="text-xs text-muted-foreground">{t("qc_empty_body")}</span>
        </button>
      ) : (
        <ol className="space-y-2">
          {qs.map((q, i) => (
            <li
              key={q.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-card/60 p-2.5"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold tabular-nums text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  {/* The whole question, not a truncated line: a teacher checking
                      their work could not tell two questions apart by their first
                      few words. */}
                  <p className="whitespace-pre-wrap break-words text-sm">{q.body}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <TypeBadge type={q.question_type} />
                    <Badge variant="secondary" className="text-[10px]">
                      {q.points} {t("qc_pt")}
                    </Badge>
                    <AnswerSummary question={q} />
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(q)}
                  aria-label={t("qc_edit")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => del(q.id)}
                  aria-label={t("qc_delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * A one-line answer summary, so the teacher can check a question without opening
 * it. The previous list showed no answer at all.
 */
function AnswerSummary({ question }: { question: any }) {
  const { t } = useI18n();
  const type = question.question_type;
  const answer = question.correct_answer;

  let text = "";
  if (type === "true_false") text = answer === "true" ? t("qc_true") : t("qc_false");
  else if (type === "multiple_choice") text = String(answer ?? "");
  else if (type === "multi_select" || type === "ordering") {
    const list = Array.isArray(answer) ? answer.map(String) : [];
    text = list.join(", ");
  } else if (type === "matching") {
    const count = answer && typeof answer === "object" ? Object.keys(answer).length : 0;
    text = t("qc_pairs_count", { n: count });
  } else text = String(answer ?? "");

  const trimmed = text.trim();
  if (!trimmed) return null;

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
      <Check className="h-2.5 w-2.5" />
      <span className="max-w-[18rem] truncate">{trimmed}</span>
    </span>
  );
}
