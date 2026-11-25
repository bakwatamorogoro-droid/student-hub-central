import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/lib/toast";
import { confirmAction } from "@/lib/alerts";
import { Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { eatLocalInputToUtcIso, utcIsoToEatLocalInput } from "@/lib/time";
import { ACADEMIC_YEARS, STUDY_YEARS } from "@/lib/academicTargeting";
import {
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPE_HINTS,
} from "@/lib/examQuestions";
import { TypeBadge } from "@/components/ExamAnswerField";
import { generateReferenceAnswer } from "@/lib/grading.functions";
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
  useEffect(() => { load(); }, []);

  const saveExam = async (e: any) => {
    // Compulsory on create; on edit an older test without a course can still save.
    const errors = validateCourse(
      { courseName: e.course_name, courseCode: e.course_code },
      !e.id,
    );
    if (Object.keys(errors).length > 0) {
      toast.error(errors.courseName || errors.courseCode || "Kamilisha taarifa za kozi.");
      return;
    }
    const payload = {
      title: e.title, description: e.description, duration_minutes: Number(e.duration_minutes) || 60,
      start_time: eatLocalInputToUtcIso(e.start_time || ""),
      end_time: eatLocalInputToUtcIso(e.end_time || ""),
      require_camera: !!e.require_camera, require_gps: !!e.require_gps,
      require_audio: !!e.require_audio, require_signature: !!e.require_signature,
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
        ? await supabase.from("exams").update(body as any).eq("id", e.id)
        : await supabase.from("exams").insert(body as any);

    const { last, dropped } = await retryWithoutMissingColumns(payload as Record<string, unknown>, write);
    if (last.error) {
      toast.error("Imeshindikana kuhifadhi. Jaribu tena.");
      return;
    }
    if (dropped.length > 0) {
      toast.info("Kozi haijawekwa: safu za kozi hazijawashwa kwenye hifadhidata bado.");
    }
    toast.success("Imehifadhiwa");
    setEditing(null); load();
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
        <Button onClick={() => setEditing({ duration_minutes: 60, require_camera: true, require_gps: true, require_signature: true })}><Plus className="h-4 w-4 mr-1" />Mtihani Mpya</Button>
      </div>
      <div className="grid gap-3">
        {exams.map((e) => (
          <Card key={e.id}>
            <CardContent className="p-4 flex justify-between items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-bold">{e.title} {e.published && <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded ml-2">Published</span>}</div>
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
                  {e.target_study_year && <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded">Mwaka {e.target_study_year}</span>}
                  {e.target_academic_year && <span className="text-xs bg-secondary/50 px-2 py-0.5 rounded">{e.target_academic_year}</span>}
                  {e.test_number && <span className="text-xs bg-blue-500/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-bold">Test {e.test_number}</span>}
                  {e.quiz_mode && <span className="text-xs bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded">Quiz: {e.quiz_mode}</span>}
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
                      <Switch checked={!!e.quiz_active} onCheckedChange={async (v) => {
                        await supabase.from("exams").update({ quiz_active: v }).eq("id", e.id);
                        toast.success(v ? "Quiz imewashwa" : "Quiz imezimwa");
                        load();
                      }} />
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
                  {e.published ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
                  {e.published ? "Published" : "Publish"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setSelected(selected === e.id ? null : e.id)}>Maswali</Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(e)}><Pencil className="h-3 w-3" /></Button>
                <Button size="sm" variant="destructive" onClick={() => del(e.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
              {selected === e.id && <div className="w-full"><QuestionsPanel examId={e.id} /></div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Hariri" : "Mtihani Mpya"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div><Label>Jina</Label><Input value={editing.title || ""} onChange={(ev) => setEditing({ ...editing, title: ev.target.value })} /></div>
              <div>
                <Label>Namba ya Test</Label>
                <Select value={String(editing.test_number || "")} onValueChange={(v) => setEditing({ ...editing, test_number: v ? Number(v) : null })}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Chagua Test (1-5)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Test 1</SelectItem>
                    <SelectItem value="2">Test 2</SelectItem>
                    <SelectItem value="3">Test 3</SelectItem>
                    <SelectItem value="4">Test 4</SelectItem>
                    <SelectItem value="5">Test 5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Maelezo</Label><Textarea value={editing.description || ""} onChange={(ev) => setEditing({ ...editing, description: ev.target.value })} /></div>
              <div><Label>Muda (dakika)</Label><Input type="number" value={editing.duration_minutes || 60} onChange={(ev) => setEditing({ ...editing, duration_minutes: ev.target.value })} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Muda wa kuanza (EAT)</Label><Input type="datetime-local" value={editing._startLocal ?? utcIsoToEatLocalInput(editing.start_time)} onChange={(ev) => setEditing({ ...editing, _startLocal: ev.target.value, start_time: ev.target.value })} /></div>
                <div><Label>Muda wa kuisha (EAT)</Label><Input type="datetime-local" value={editing._endLocal ?? utcIsoToEatLocalInput(editing.end_time)} onChange={(ev) => setEditing({ ...editing, _endLocal: ev.target.value, end_time: ev.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2"><Switch checked={!!editing.require_camera} onCheckedChange={(v) => setEditing({ ...editing, require_camera: v })} />Kamera</label>
                <label className="flex items-center gap-2"><Switch checked={!!editing.require_gps} onCheckedChange={(v) => setEditing({ ...editing, require_gps: v })} />GPS</label>
                <label className="flex items-center gap-2"><Switch checked={!!editing.require_audio} onCheckedChange={(v) => setEditing({ ...editing, require_audio: v })} />Sauti</label>
                <label className="flex items-center gap-2"><Switch checked={!!editing.require_signature} onCheckedChange={(v) => setEditing({ ...editing, require_signature: v })} />Sahihi</label>
                <label className="flex items-center gap-2 col-span-2"><Switch checked={!!editing.published} onCheckedChange={(v) => setEditing({ ...editing, published: v })} />Publish</label>
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
                  Kila mtihani unaoundwa hapa ni wa mtu binafsi — kila mwanafunzi anajibiwa
                  peke yake.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 border-t pt-3">
                <div>
                  <Label>Mwaka wa Masomo</Label>
                  <Select value={editing.target_study_year ? String(editing.target_study_year) : "all"} onValueChange={(v) => setEditing({ ...editing, target_study_year: v === "all" ? null : Number(v) })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Miaka yote</SelectItem>
                      {STUDY_YEARS.map((year) => <SelectItem key={year} value={String(year)}>Mwaka wa {year}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Mwaka wa Kitaaluma</Label>
                  <Select value={editing.target_academic_year || "all"} onValueChange={(v) => setEditing({ ...editing, target_academic_year: v === "all" ? null : v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Miaka yote</SelectItem>
                      {ACADEMIC_YEARS.map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="border-t pt-3">
                <Label className="text-sm font-bold">Mpangilio wa Maswali (Random / Sawa kwa wote)</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <label className="flex items-center gap-2"><Switch checked={!!editing.randomize_questions} onCheckedChange={(v) => setEditing({ ...editing, randomize_questions: v })} />Maswali random</label>
                  <label className="flex items-center gap-2"><Switch checked={!!editing.randomize_mcq} onCheckedChange={(v) => setEditing({ ...editing, randomize_mcq: v })} />MCQ chaguzi random</label>
                  <label className="flex items-center gap-2"><Switch checked={!!editing.randomize_tf} onCheckedChange={(v) => setEditing({ ...editing, randomize_tf: v })} />True/False random</label>
                  <label className="flex items-center gap-2"><Switch checked={!!editing.randomize_matching} onCheckedChange={(v) => setEditing({ ...editing, randomize_matching: v })} />Matching random</label>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Random imewekwa per-mwanafunzi (kila mwanafunzi anaona mpangilio tofauti lakini imara).</p>
                <label className="flex items-center gap-2 mt-3 pt-3 border-t"><Switch checked={!!editing.autosave_disabled} onCheckedChange={(v) => setEditing({ ...editing, autosave_disabled: v })} />Zima auto-save (wanafunzi watahifadhi wenyewe)</label>
              </div>
              <Button className="w-full" onClick={() => saveExam(editing)}>Hifadhi</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionsPanel({ examId }: { examId: string }) {
  const [qs, setQs] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  // Reference-answer generation. The toast names the source, because a teacher
  // must not mistake a model's words for the bank's.
  const [aiBusy, setAiBusy] = useState(false);
  const load = async () => {
    const { data } = await supabase.from("questions").select("*").eq("exam_id", examId).order("position");
    setQs(data || []);
  };
  useEffect(() => { load(); }, [examId]);

  const save = async (q: any) => {
    let options = q.options;
    let correct: any = q.correct_answer;
    let concepts: string[] | null = null;
    if (
      (q.question_type === "multiple_choice" || q.question_type === "multi_select") &&
      typeof options === "string"
    )
      options = options.split("\n").map((s: string) => s.trim()).filter(Boolean);
    if (
      (q.question_type === "multi_select" || q.question_type === "ordering") &&
      typeof correct === "string"
    ) {
      // Both are stored as arrays: the correct picks, and the correct order.
      correct = correct.split("\n").map((s: string) => s.trim()).filter(Boolean);
    }
    if (q.question_type === "matching" && typeof correct === "string") {
      const obj: any = {};
      correct.split("\n").forEach((line: string) => {
        const [k, v] = line.split("=").map((s) => s.trim());
        if (k && v) obj[k] = v;
      });
      correct = obj;
    }
    if (q.question_type === "short_answer") {
      if (typeof q.concepts === "string") concepts = q.concepts.split("\n").map((s: string) => s.trim()).filter(Boolean);
      else if (Array.isArray(q.concepts)) concepts = q.concepts;
    }
    const payload: any = {
      exam_id: examId, question_type: q.question_type, body: q.body,
      options, correct_answer: correct, points: Number(q.points) || 1,
      position: Number(q.position) || qs.length,
      concepts: q.question_type === "short_answer" ? concepts : null,
    };
    if (q.id) await supabase.from("questions").update(payload).eq("id", q.id);
    else await supabase.from("questions").insert(payload);
    toast.success("Imehifadhiwa");
    setEditing(null); load();
  };
  const del = async (id: string) => { await supabase.from("questions").delete().eq("id", id); load(); };

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex justify-between items-center mb-2">
        <h4 className="font-semibold">Maswali ({qs.length})</h4>
        <Button size="sm" onClick={() => setEditing({ question_type: "true_false", points: 1 })}><Plus className="h-3 w-3 mr-1" />Ongeza</Button>
      </div>
      <ul className="space-y-1 text-sm">
        {qs.map((q, i) => (
          <li key={q.id} className="flex justify-between items-center p-2 bg-muted rounded">
            <span className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{i + 1}.</span>
              <TypeBadge type={q.question_type} />
              <span className="truncate">{q.body}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{q.points}pt</span>
            </span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing({
                  ...q,
                  options: Array.isArray(q.options) ? q.options.join("\n") : "",
                  correct_answer:
                    q.question_type === "matching" && typeof q.correct_answer === "object"
                      ? Object.entries(q.correct_answer).map(([k, v]) => `${k}=${v}`).join("\n")
                      : Array.isArray(q.correct_answer)
                        ? q.correct_answer.join("\n")
                        : q.correct_answer,
                  concepts: Array.isArray(q.concepts) ? q.concepts.join("\n") : "",
                })}><Pencil className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" onClick={() => del(q.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          </li>
        ))}
      </ul>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-auto">
          <DialogHeader><DialogTitle>Swali</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Aina</Label>
                <Select value={editing.question_type} onValueChange={(v) => setEditing({ ...editing, question_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QUESTION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {QUESTION_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  {QUESTION_TYPE_HINTS[editing.question_type]}
                </p>
              </div>
              <div><Label>Swali</Label><Textarea value={editing.body || ""} onChange={(e) => setEditing({...editing, body: e.target.value})} /></div>
              {(editing.question_type === "multiple_choice" ||
                editing.question_type === "multi_select") && (
                <div>
                  <Label>Chaguzi (mstari mmoja kila moja)</Label>
                  <Textarea
                    rows={5}
                    placeholder={"Mfano:\nTawhid\nSalat\nZakat\nHajj"}
                    value={editing.options || ""}
                    onChange={(e) => setEditing({ ...editing, options: e.target.value })}
                  />
                </div>
              )}
              {editing.question_type === "true_false" && (
                <div><Label>Jibu sahihi</Label>
                  <Select value={String(editing.correct_answer ?? "true")} onValueChange={(v) => setEditing({...editing, correct_answer: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="true">Kweli</SelectItem><SelectItem value="false">Sikweli</SelectItem></SelectContent>
                  </Select>
                </div>
              )}
              {editing.question_type === "multiple_choice" && (
                <div><Label>Jibu sahihi (andika sawa kabisa na chaguo)</Label><Input value={editing.correct_answer || ""} onChange={(e) => setEditing({...editing, correct_answer: e.target.value})} /></div>
              )}
              {editing.question_type === "multi_select" && (
                <div>
                  <Label>Majibu sahihi (mstari mmoja kila jibu, sawa kabisa na chaguo)</Label>
                  <Textarea
                    rows={4}
                    placeholder={"Tawhid\nSalat"}
                    value={editing.correct_answer || ""}
                    onChange={(e) => setEditing({ ...editing, correct_answer: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Jibu moja baya hupunguza alama moja sahihi, hivyo kutiki kila kitu hakupi alama.
                  </p>
                </div>
              )}
              {editing.question_type === "ordering" && (
                <div>
                  <Label>Mpangilio sahihi (mstari wa kwanza ni wa kwanza)</Label>
                  <Textarea
                    rows={5}
                    placeholder={"Subiri adhana\nSafisha mdomo\nTia maji puani\nOsha uso"}
                    value={editing.correct_answer || ""}
                    onChange={(e) => setEditing({ ...editing, correct_answer: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Mwanafunzi anaona mpangilio uliochanganywa na hupanga mwenyewe.
                  </p>
                </div>
              )}
              {editing.question_type === "short_answer" && (
                <>
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Andika swali pekee, kisha bofya hapa — mfumo utatafuta jibu na maana yake
                      (kanzi ya Islamic Studies kwanza, AI inasaidia pale tu kanzi haijui).
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="w-full"
                      disabled={aiBusy || !String(editing.body || "").trim()}
                      onClick={async () => {
                        setAiBusy(true);
                        try {
                          const r = await generateReferenceAnswer(String(editing.body || ""));
                          if (!r.answer) {
                            toast.error("Kanzi haikupata jibu la swali hili. Andika jibu mwenyewe.");
                            return;
                          }
                          setEditing((prev: any) => ({
                            ...prev,
                            correct_answer: r.answer,
                            concepts: r.concepts.length ? r.concepts.join("\n") : prev.concepts,
                          }));
                          toast.success(
                            r.source === "bank"
                              ? `Jibu limetoka kanzi ya maarifa${r.topicName ? " (" + r.topicName.sw + ")" : ""}.`
                              : "Jibu limetoka kwa AI — liangalie kabla ya kuhifadhi.",
                          );
                        } finally {
                          setAiBusy(false);
                        }
                      }}
                    >
                      {aiBusy ? "Inatafuta…" : "Tengeneza jibu + maana (AI)"}
                    </Button>
                  </div>
                  <div><Label>Jibu sahihi / muundo (AI italinganisha kwa maana)</Label><Textarea value={editing.correct_answer || ""} onChange={(e) => setEditing({...editing, correct_answer: e.target.value})} /></div>
                  <div>
                    <Label>Mawazo Muhimu / Concepts (mstari mmoja kila wazo)</Label>
                    <Textarea rows={5}
                      placeholder={"Mfano:\nKumtaja Allah kuwa wa pekee\nKumwamini Mtume Muhammad\nKusoma shahada"}
                      value={editing.concepts || ""}
                      onChange={(e) => setEditing({...editing, concepts: e.target.value})} />
                    <p className="text-xs text-muted-foreground mt-1">
                      AI itahesabu concepts ngapi mwanafunzi ameelezea (hata kwa maneno tofauti) na kumpa alama: <b>(matched / jumla) × alama</b>. Ukiacha tupu, AI italinganisha jibu zima.
                    </p>
                  </div>
                </>
              )}
              {editing.question_type === "matching" && (
                <div><Label>Mfumo: kushoto=kulia, mstari mmoja kila jozi</Label>
                  <Textarea rows={5} placeholder="Mfano:\nQuran=Kitabu cha Allah\nHadith=Maneno ya Mtume" value={editing.correct_answer || ""} onChange={(e) => setEditing({...editing, correct_answer: e.target.value})} />
                </div>
              )}
              <div><Label>Alama</Label><Input type="number" value={editing.points || 1} onChange={(e) => setEditing({...editing, points: e.target.value})} /></div>
              <Button className="w-full" onClick={() => save(editing)}>Hifadhi</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}