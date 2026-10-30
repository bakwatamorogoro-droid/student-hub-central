import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Trophy, User, GraduationCap, RefreshCw, Users, CheckCircle2, XCircle, ChevronDown, ChevronUp, Sparkles, BookOpen } from "lucide-react";
import { gradeShortAnswer } from "@/lib/grading.functions";
import { findStudentsByQuery } from "@/lib/studentSearch";
import { StudentMatchesPicker } from "@/components/StudentMatchesPicker";
import { formatAcademicSummary } from "@/lib/academicTargeting";
import { toast } from "@/lib/toast";

type QA = { q: any; given: any; correct: boolean; partial?: number };

export const Route = createFileRoute("/results")({
  component: ResultsPage,
  head: () => ({
    meta: [
      { title: "Matokeo — Islamic Studies Test" },
      { name: "description", content: "Angalia matokeo ya mitihani na quiz za Islamic Studies." },
      { property: "og:title", content: "Matokeo — Islamic Studies Test" },
    ],
  }),
});

function ResultsPage() {
  const [regNo, setRegNo] = useState("");
  const [student, setStudent] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [matches, setMatches] = useState<any[]>([]);
  const [groupTotals, setGroupTotals] = useState<Record<string, { sum: number; max: number; count: number; title: string }>>({});
  const [searched, setSearched] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [questionsByExam, setQuestionsByExam] = useState<Record<string, any[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const grade = gradeShortAnswer;

  // Jaribu tena grading kwa submission yoyote yenye matatizo (score=null au ai_confirmed=false)
  const retryGrading = async (subs: any[]) => {
    const broken = subs.filter((s: any) => s.score == null || s.max_score == null || s.ai_confirmed === false);
    if (broken.length === 0) return subs;
    setRetrying(true);
    for (const sub of broken) {
      try {
        const { data: qs } = await supabase.from("questions").select("*").eq("exam_id", sub.exam_id).order("position");
        if (!qs || qs.length === 0) continue;
        const answers = sub.answers || {};
        let autoScore = 0, aiScore = 0, maxScore = 0;
        const feedback: Record<string, any> = {};
        for (const q of qs) {
          maxScore += Number(q.points);
          const ans = answers[q.id];
          if (q.question_type === "true_false" || q.question_type === "multiple_choice") {
            if (String(ans) === String(q.correct_answer)) autoScore += Number(q.points);
          } else if (q.question_type === "matching") {
            const correct = (q.correct_answer || {}) as Record<string, string>;
            const given = (ans || {}) as Record<string, string>;
            const keys = Object.keys(correct);
            if (keys.length) {
              const right = keys.filter((k) => given[k] === correct[k]).length;
              autoScore += (right / keys.length) * Number(q.points);
            }
          } else if (q.question_type === "short_answer") {
            try {
              const r = await grade({
                question: q.body,
                correctAnswer: String(q.correct_answer),
                studentAnswer: String(ans || ""),
                points: Number(q.points),
                concepts: Array.isArray(q.concepts) ? (q.concepts as string[]) : undefined,
              });
              aiScore += r.score;
              feedback[q.id] = { ...r, points: Number(q.points) };
            } catch {
              feedback[q.id] = { score: 0, feedback: "AI imeshindwa", points: Number(q.points) };
            }
          }
        }
        const total = autoScore + aiScore;
        await supabase.from("submissions").update({
          score: total, max_score: maxScore, auto_score: autoScore, ai_score: aiScore,
          ai_feedback: feedback, ai_confirmed: true,
        }).eq("id", sub.id);
        sub.score = total; sub.max_score = maxScore; sub.ai_confirmed = true;
      } catch {}
    }
    setRetrying(false);
    return subs;
  };

  useEffect(() => {
    const r = localStorage.getItem("student_reg");
    if (r) { setRegNo(r); fetchResults(r); }
  }, []);

  const fetchResults = async (reg: string) => {
    if (!reg) return;
    const results = await findStudentsByQuery(reg);
    if (results.length === 0) { toast.error("Hakuna mwanafunzi anayelingana."); setStudent(null); setMatches([]); setRows([]); setSearched(true); return; }
    if (results.length > 1) { setStudent(null); setMatches(results); toast.info(`Tumepata ${results.length} wanafunzi — chagua wewe ni nani.`); return; }
    const s = results[0];
    setMatches([]);
    setStudent(s);
    setRegNo(s.reg_no);
    localStorage.setItem("student_reg", s.reg_no);
    const r = s.reg_no.toUpperCase();
    const { data } = await supabase
      .from("submissions")
      .select("*, exams!inner(title, results_published, quiz_mode)")
      .eq("reg_no", r)
      .order("submitted_at", { ascending: false });
    const published = (data || []).filter((x: any) => x.exams.results_published);
    // Onyesha kwanza, kisha jaribu tena grading nyuma-nyuma
    setRows(published);
    // Load questions for each exam (kuonyesha makosa + jibu sahihi)
    const examIds = Array.from(new Set(published.map((x: any) => x.exam_id)));
    if (examIds.length > 0) {
      const { data: qs } = await supabase.from("questions").select("*").in("exam_id", examIds).order("position");
      const map: Record<string, any[]> = {};
      (qs || []).forEach((q: any) => { (map[q.exam_id] = map[q.exam_id] || []).push(q); });
      setQuestionsByExam(map);
    }
    const fixed = await retryGrading(published);
    setRows([...fixed]);
    setSearched(true);

    // Compute group totals for any group-quiz exam in this list
    if (s && s.semina && s.student_group) {
      const groupExams = published.filter((x: any) => x.exams.quiz_mode === "group");
      const totals: Record<string, { sum: number; max: number; count: number; title: string }> = {};
      for (const ge of groupExams) {
        const { data: mates } = await supabase
          .from("students").select("reg_no")
          .eq("semina", s.semina).eq("student_group", s.student_group);
        const regs = (mates || []).map((m: any) => m.reg_no);
        if (regs.length === 0) continue;
        const { data: subs } = await supabase
          .from("submissions").select("score, max_score")
          .eq("exam_id", ge.exam_id).in("reg_no", regs);
        const valid = (subs || []).filter((x: any) => x.score != null);
        const sum = valid.reduce((a: number, x: any) => a + Number(x.score || 0), 0);
        const max = valid.reduce((a: number, x: any) => a + Number(x.max_score || 0), 0);
        totals[ge.exam_id] = { sum, max, count: valid.length, title: ge.exams.title };
      }
      setGroupTotals(totals);
    }
  };

  const evaluate = (sub: any, qs: any[]): QA[] => {
    const ans = sub.answers || {};
    const fb = sub.ai_feedback || {};
    return qs.map((q: any) => {
      const given = ans[q.id];
      if (q.question_type === "true_false" || q.question_type === "multiple_choice") {
        return { q, given, correct: String(given) === String(q.correct_answer) };
      }
      if (q.question_type === "matching") {
        const correct = (q.correct_answer || {}) as Record<string, string>;
        const givenObj = (given || {}) as Record<string, string>;
        const keys = Object.keys(correct);
        const hits = keys.filter((k) => givenObj[k] === correct[k]).length;
        return { q, given, correct: hits === keys.length, partial: keys.length ? hits / keys.length : 0 };
      }
      // short answer — tumia AI feedback score / points
      const score = Number(fb?.[q.id]?.score || 0);
      const points = Number(q.points || 1);
      const ratio = points > 0 ? score / points : 0;
      const ic = fb?.[q.id]?.isCorrect;
      return { q, given, correct: typeof ic === "boolean" ? ic : ratio >= 0.8, partial: ratio };
    });
  };

  const renderGiven = (q: any, given: any) => {
    if (given == null || given === "") return <em className="text-muted-foreground">(hakuna jibu)</em>;
    if (q.question_type === "matching") {
      const entries = Object.entries(given as Record<string, string>);
      return <ul className="text-sm space-y-0.5">{entries.map(([k, v]) => <li key={k}><b>{k}</b> → {v}</li>)}</ul>;
    }
    return <span>{String(given)}</span>;
  };
  const renderCorrect = (q: any) => {
    if (q.question_type === "matching") {
      const entries = Object.entries((q.correct_answer || {}) as Record<string, string>);
      return <ul className="text-sm space-y-0.5">{entries.map(([k, v]) => <li key={k}><b>{k}</b> → {v}</li>)}</ul>;
    }
    return <span>{String(q.correct_answer ?? "—")}</span>;
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <Card className="mb-6">
          <CardHeader><CardTitle className="flex items-center gap-2">Angalia Matokeo Yako {retrying && <RefreshCw className="h-4 w-4 animate-spin text-primary" />}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input value={regNo} onChange={(e) => setRegNo(e.target.value.toUpperCase())} placeholder="Reg Namba au jina (mfano: jina la mwisho)" onKeyDown={(e) => { if (e.key === "Enter") fetchResults(regNo); }} />
              <Button onClick={() => fetchResults(regNo)}>Tafuta</Button>
            </div>
            {matches.length > 0 && (
              <StudentMatchesPicker matches={matches} onConfirm={(s) => fetchResults(s.reg_no)} onCancel={() => setMatches([])} />
            )}
          </CardContent>
        </Card>

        {student && (
          <Card className="mb-6 border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-5 grid sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2"><User className="h-5 w-5 text-primary" /><div><div className="text-xs text-muted-foreground">Jina</div><div className="font-bold">{student.full_name}</div></div></div>
              <div><div className="text-xs text-muted-foreground">Reg Namba</div><div className="font-mono">{student.reg_no}</div></div>
              <div className="flex items-center gap-2"><GraduationCap className="h-5 w-5 text-primary" /><div><div className="text-xs text-muted-foreground">Kozi</div><div>{student.course || student.student_group}</div></div></div>
              <div><div className="text-xs text-muted-foreground">Semina / Group</div><div>{student.semina} • {student.student_group}</div></div>
              {formatAcademicSummary(student) && (
                <div className="sm:col-span-2"><div className="text-xs text-muted-foreground">Mwaka wa Masomo</div><div>{formatAcademicSummary(student)}</div></div>
              )}
            </CardContent>
          </Card>
        )}

        {searched && rows.length === 0 && <p className="text-center text-muted-foreground">Hakuna matokeo yaliyopublishiwa bado.</p>}

        {Object.keys(groupTotals).length > 0 && (
          <Card className="mb-6 border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-5 w-5 text-emerald-600" /> Jumla ya Group ({student?.semina} • {student?.student_group})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(groupTotals).map(([id, g]) => (
                <div key={id} className="flex justify-between items-center p-3 rounded-lg bg-background/60 border">
                  <div>
                    <div className="font-bold">{g.title}</div>
                    <div className="text-xs text-muted-foreground">{g.count} wanafunzi wamechangia</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">
                      {g.sum.toFixed(1)}<span className="text-sm text-muted-foreground"> / {g.max.toFixed(0)}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{g.max > 0 ? ((g.sum / g.max) * 100).toFixed(1) : 0}% (jumla)</div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          {rows.map((r) => {
            const pct = r.max_score ? (Number(r.score) / Number(r.max_score)) * 100 : 0;
            const pass = pct >= 50;
            const isGroup = r.exams.quiz_mode === "group";
            const qs = questionsByExam[r.exam_id] || [];
            const evals = evaluate(r, qs);
            const wrong = evals.filter((e) => !e.correct);
            const right = evals.filter((e) => e.correct);
            const isOpen = !!open[r.id];
            return (
              <Card key={r.id} className="overflow-hidden">
                <div className={`h-1.5 ${pass ? "bg-primary" : "bg-destructive"}`} />
                <CardContent className="p-4">
                  <div className="flex justify-between items-center gap-3">
                    <div className="min-w-0">
                      <div className="font-bold truncate flex items-center gap-2">
                        {r.exams.title}
                        {isGroup && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold">GROUP</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{new Date(r.submitted_at).toLocaleString()}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold">
                          <CheckCircle2 className="h-3 w-3" /> Sahihi: {right.length}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-destructive/15 text-destructive font-bold">
                          <XCircle className="h-3 w-3" /> Makosa: {wrong.length}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted text-muted-foreground">
                          Jumla maswali: {evals.length}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-2 justify-end">
                        <Trophy className={`h-5 w-5 ${pass ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="text-3xl font-extrabold tabular-nums">{r.score != null ? Number(r.score).toFixed(1) : "-"}<span className="text-sm text-muted-foreground"> / {r.max_score ?? "-"}</span></span>
                      </div>
                      <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-bold ${pass ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>{pct.toFixed(1)}% {pass ? "FAULU" : "FELI"}</span>
                    </div>
                  </div>

                  {evals.length > 0 && (
                    <button
                      onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}
                      className="mt-3 w-full flex items-center justify-center gap-1 text-xs font-bold text-primary py-2 rounded bg-primary/10 hover:bg-primary/20 transition"
                    >
                      {isOpen ? <><ChevronUp className="h-3 w-3" /> Ficha muhtasari</> : <><ChevronDown className="h-3 w-3" /> Angalia makosa na majibu sahihi</>}
                    </button>
                  )}

                  {isOpen && (
                    <div className="mt-3 space-y-2">
                      {evals.map((e, i) => {
                        const fb = (r.ai_feedback || {})[e.q.id];
                        const isShort = e.q.question_type === "short_answer";
                        const autoFilled = fb?.aiAutoFilled;
                        return (
                          <div key={e.q.id} className={`p-3 rounded-lg border-l-4 ${e.correct ? "border-l-emerald-500 bg-emerald-500/5" : "border-l-destructive bg-destructive/5"}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-semibold text-sm flex items-center gap-2">
                                {e.correct ? <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" /> : <XCircle className="h-4 w-4 text-destructive shrink-0" />}
                                Swali {i + 1}
                                {autoFilled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary inline-flex items-center gap-0.5"><Sparkles className="h-2.5 w-2.5" /> AI ilijaza</span>}
                              </div>
                              <span className="text-xs font-mono text-muted-foreground shrink-0">
                                {isShort ? `${(fb?.score || 0).toFixed(1)}/${e.q.points}` : (e.correct ? `${e.q.points}/${e.q.points}` : `${((e.partial || 0) * e.q.points).toFixed(1)}/${e.q.points}`)}
                              </span>
                            </div>
                            <p className="text-sm mt-1 mb-2">{e.q.body}</p>
                            <div className="grid sm:grid-cols-2 gap-2 text-sm">
                              <div className="p-2 rounded bg-background/70 border">
                                <div className="text-[10px] uppercase text-muted-foreground font-bold mb-0.5">Jibu lako</div>
                                {renderGiven(e.q, e.given)}
                              </div>
                              <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/30">
                                <div className="text-[10px] uppercase text-emerald-700 dark:text-emerald-300 font-bold mb-0.5 flex items-center gap-1"><BookOpen className="h-3 w-3" /> Jibu sahihi</div>
                                {renderCorrect(e.q)}
                              </div>
                            </div>
                            {fb?.feedback && (
                              <div className="mt-2 text-xs rounded-md bg-background/60 border p-2 text-foreground/80"><b>Sababu (AI):</b> {fb.feedback}</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
