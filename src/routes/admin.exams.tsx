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
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { eatLocalInputToUtcIso, utcIsoToEatLocalInput } from "@/lib/time";
import { ACADEMIC_YEARS, STUDY_YEARS } from "@/lib/academicTargeting";

export const Route = createFileRoute("/admin/exams")({ component: Page });

function Page() {
  const [exams, setExams] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);

  const load = async () => {
    const { data } = await supabase.from("exams").select("*").order("created_at", { ascending: false });
    setExams(data || []);
  };
  useEffect(() => { load(); }, []);

  const saveExam = async (e: any) => {
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
      quiz_mode: e.quiz_mode || null,
      quiz_active: !!e.quiz_active,
      target_study_year: e.target_study_year ? Number(e.target_study_year) : null,
      target_academic_year: e.target_academic_year || null,
      assignment_mode: e.quiz_mode === "assignment" ? (e.assignment_mode || "individual") : null,
    };
    (payload as any).test_number = e.test_number ? Number(e.test_number) : null;
    if (e.id) {
      await supabase.from("exams").update(payload as any).eq("id", e.id);
    } else {
      await supabase.from("exams").insert(payload as any);
    }
    toast.success("Imehifadhiwa");
    setEditing(null); load();
  };

  const del = async (id: string) => {
    if (!confirm("Una uhakika?")) return;
    await supabase.from("exams").delete().eq("id", id);
    load();
  };

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
                  {e.target_study_year && <span className="text-xs bg-primary/15 text-primary px-2 py-0.5 rounded">Mwaka {e.target_study_year}</span>}
                  {e.target_academic_year && <span className="text-xs bg-secondary/50 px-2 py-0.5 rounded">{e.target_academic_year}</span>}
                  {e.test_number && <span className="text-xs bg-blue-500/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded font-bold">Test {e.test_number}</span>}
                  {e.quiz_mode && <span className="text-xs bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded">Quiz: {e.quiz_mode}</span>}
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
              <div className="flex gap-1 flex-wrap">
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
              <div className="border-t pt-3">
                <Label className="text-sm font-bold">Aina ya Mtihani / Quiz</Label>
                <Select value={editing.quiz_mode || "exam"} onValueChange={(v) => setEditing({ ...editing, quiz_mode: v === "exam" ? null : v })}>
                  <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exam">Mtihani wa kawaida (mtu binafsi)</SelectItem>
                    <SelectItem value="individual">Quiz — Mtu Binafsi</SelectItem>
                    <SelectItem value="group">Quiz — Group (alama za group hujumlishwa)</SelectItem>
                    <SelectItem value="assignment">Assignment</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Group quiz: kila mwanafunzi anajibu peke yake, kisha matokeo ya wanafunzi wote wa <b>semina + group</b> moja huungana kwenye <b>jumla ya group</b>.
                </p>
              </div>
              {editing.quiz_mode === "assignment" && (
                <div>
                  <Label>Assignment ni ya nani?</Label>
                  <Select value={editing.assignment_mode || "individual"} onValueChange={(v) => setEditing({ ...editing, assignment_mode: v })}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="individual">Individual</SelectItem>
                      <SelectItem value="group">Group</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
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
  const load = async () => {
    const { data } = await supabase.from("questions").select("*").eq("exam_id", examId).order("position");
    setQs(data || []);
  };
  useEffect(() => { load(); }, [examId]);

  const save = async (q: any) => {
    let options = q.options;
    let correct: any = q.correct_answer;
    let concepts: string[] | null = null;
    if (q.question_type === "multiple_choice" && typeof options === "string") options = options.split("\n").map((s: string) => s.trim()).filter(Boolean);
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
            <span className="truncate">{i+1}. [{q.question_type}] {q.body} ({q.points}pt)</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing({...q, options: Array.isArray(q.options) ? q.options.join("\n") : "", correct_answer: q.question_type === "matching" && typeof q.correct_answer === "object" ? Object.entries(q.correct_answer).map(([k,v])=>`${k}=${v}`).join("\n") : q.correct_answer, concepts: Array.isArray(q.concepts) ? q.concepts.join("\n") : "" })}><Pencil className="h-3 w-3" /></Button>
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
                    <SelectItem value="true_false">True / False</SelectItem>
                    <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                    <SelectItem value="short_answer">Short Answer (AI)</SelectItem>
                    <SelectItem value="matching">Matching Items</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Swali</Label><Textarea value={editing.body || ""} onChange={(e) => setEditing({...editing, body: e.target.value})} /></div>
              {editing.question_type === "multiple_choice" && (
                <div><Label>Chaguzi (mstari mmoja kila moja)</Label><Textarea value={editing.options || ""} onChange={(e) => setEditing({...editing, options: e.target.value})} /></div>
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
              {editing.question_type === "short_answer" && (
                <>
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