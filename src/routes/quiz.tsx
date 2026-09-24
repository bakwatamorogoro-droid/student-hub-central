import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllStudents } from "@/lib/fetchAllStudents";
import { findStudentsByQuery } from "@/lib/studentSearch";
import { StudentMatchesPicker } from "@/components/StudentMatchesPicker";
import { toast } from "sonner";
import { Users, User, Search, CheckCircle2, Loader2, Sparkles, ArrowRight, Clock } from "lucide-react";

export const Route = createFileRoute("/quiz")({
  component: QuizPage,
  head: () => ({
    meta: [
      { title: "Quiz — Islamic Studies Test" },
      { name: "description", content: "Quiz ya mtu binafsi au group ya Islamic Studies." },
      { property: "og:title", content: "Quiz — Islamic Studies Test" },
    ],
  }),
});

function QuizPage() {
  const nav = useNavigate();
  const [reg, setReg] = useState("");
  const [student, setStudent] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [quizzes, setQuizzes] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [assignMode, setAssignMode] = useState<string>("individual");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const r = localStorage.getItem("student_reg");
    if (r) { setReg(r); lookup(r); }
    loadQuizzes();
  }, []);

  const loadQuizzes = async () => {
    const { data } = await supabase.from("exams")
      .select("*")
      .eq("published", true)
      .in("quiz_mode", ["individual", "group"])
      .order("created_at", { ascending: false });
    setQuizzes(data || []);
  };

  const loadAssignments = async () => {
    const { data } = await supabase.from("exams")
      .select("*")
      .eq("published", true)
      .eq("quiz_mode", "assignment")
      .order("created_at", { ascending: false });
    setAssignments(data || []);
  };

  const confirmStudent = (s: any) => {
    setStudent(s);
    setMatches([]);
    setReg(s.reg_no);
    localStorage.setItem("student_reg", s.reg_no);
  };

  const lookup = async (r: string) => {
    if (!r) return;
    setLoading(true);
    const results = await findStudentsByQuery(r);
    setLoading(false);
    if (results.length === 0) { toast.error("Hakuna mwanafunzi anayelingana. Hakikisha umeandika sahihi au jisajili."); setStudent(null); setMatches([]); return; }
    if (results.length === 1) { confirmStudent(results[0]); return; }
    setStudent(null);
    setMatches(results);
    toast.info(`Tumepata ${results.length} wanafunzi — chagua wewe ni nani.`);
  };

  const individualQuizzes = quizzes.filter((q) => q.quiz_mode === "individual");
  const groupQuizzes = quizzes.filter((q) => q.quiz_mode === "group");

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-emerald-500/5">
      <SiteHeader />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
            <Sparkles className="h-3 w-3" /> Quiz — Tofauti na Mtihani
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">Quiz Zinazopatikana</h1>
          <p className="text-muted-foreground mt-2">Individual: kila mtu peke yake • Group: nenda na wenzako wa semina/group lako</p>
        </div>

        {/* Reg lookup */}
        <Card className="mb-6 border-2 border-emerald-500/30">
          <CardContent className="p-4">
            <div className="flex gap-2">
              <Input
                value={reg}
                onChange={(e) => setReg(e.target.value.toUpperCase())}
                placeholder="Andika Reg Namba au jina (mfano: jina la mwisho)"
                className="font-mono"
                onKeyDown={(e) => { if (e.key === "Enter") lookup(reg); }}
              />
              <Button onClick={() => lookup(reg)} disabled={loading || !reg}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            {student && (
              <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/20 text-sm flex items-center gap-2 flex-wrap">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <b>{student.full_name}</b>
                <span className="text-muted-foreground">• {student.reg_no}</span>
                <span className="ml-auto text-xs bg-primary/10 px-2 py-0.5 rounded">{student.semina} • {student.student_group}</span>
              </div>
            )}
            {matches.length > 0 && (
              <StudentMatchesPicker matches={matches} onConfirm={confirmStudent} onCancel={() => setMatches([])} />
            )}
          </CardContent>
        </Card>

        {/* Individual quizzes */}
        <section className="mb-8">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><User className="h-5 w-5 text-primary" /> Quiz za Mtu Binafsi</h2>
          {individualQuizzes.length === 0 && <p className="text-sm text-muted-foreground">Hakuna quiz ya mtu binafsi sasa hivi.</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            {individualQuizzes.map((q) => (
              <IndividualCard key={q.id} q={q} student={student} onStart={() => nav({ to: "/exam/$examId", params: { examId: q.id }, search: {} as any })} />
            ))}
          </div>
        </section>

        {/* Group quizzes */}
        <section>
          <h2 className="text-lg font-bold flex items-center gap-2 mb-3"><Users className="h-5 w-5 text-emerald-600" /> Quiz za Group</h2>
          {groupQuizzes.length === 0 && <p className="text-sm text-muted-foreground">Hakuna quiz ya group sasa hivi.</p>}
          <div className="space-y-3">
            {groupQuizzes.map((q) => (
              <GroupCard key={q.id} q={q} student={student} onStart={() => nav({ to: "/exam/$examId", params: { examId: q.id }, search: {} as any })} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function IndividualCard({ q, student, onStart }: { q: any; student: any; onStart: () => void }) {
  return (
    <Card className="border-2 hover:border-primary hover:shadow-xl transition-all hover:-translate-y-0.5">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="truncate">{q.title}</span>
          {q.quiz_active
            ? <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full animate-pulse">🟢 HAI</span>
            : <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">⏸ Imezimwa</span>}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        {q.description && <p className="text-muted-foreground text-xs">{q.description}</p>}
        <div className="text-xs flex items-center gap-1 text-muted-foreground"><Clock className="h-3 w-3" /> {q.duration_minutes} dakika</div>
        <Button size="sm" disabled={!student || !q.quiz_active} onClick={onStart} className="w-full">
          {!student ? "Thibitisha Reg" : !q.quiz_active ? "Subiri admin awashe" : <>Anza Quiz <ArrowRight className="h-3 w-3 ml-1" /></>}
        </Button>
      </CardContent>
    </Card>
  );
}

function GroupCard({ q, student, onStart }: { q: any; student: any; onStart: () => void }) {
  const [members, setMembers] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [participants, setParticipants] = useState<any[]>([]);
  const [joining, setJoining] = useState(false);
  const [groupQuestions, setGroupQuestions] = useState<any[]>([]);
  const [pickedQid, setPickedQid] = useState<string>("");
  const nav = useNavigate();

  const loadMembers = async () => {
    if (!student) { setMembers([]); return; }
    const { data } = await supabase.from("students")
      .select("id, reg_no, full_name, student_group, semina, phone")
      .eq("semina", student.semina)
      .eq("student_group", student.student_group)
      .order("full_name");
    setMembers(data || []);
  };

  const loadAllStudents = async () => {
    const data = await fetchAllStudents<any>(
      "id, reg_no, full_name, student_group, semina, phone",
      { orderBy: "full_name" }
    ).catch(() => []);
    setAllStudents(data);
  };


  const loadParticipants = async () => {
    const { data } = await supabase.from("quiz_participants" as any)
      .select("*").eq("exam_id", q.id)
      .order("joined_at");
    setParticipants((data as any[]) || []);
  };

  useEffect(() => { loadMembers(); }, [student?.id]);
  useEffect(() => { loadAllStudents(); }, []);

  useEffect(() => {
    const loadQ = async () => {
      const { data } = await supabase.from("questions")
        .select("id, body, position, points, question_type")
        .eq("exam_id", q.id)
        .order("position");
      setGroupQuestions(data || []);
    };
    loadQ();
  }, [q.id]);

  useEffect(() => {
    loadParticipants();
    const ch = supabase.channel(`quiz-${q.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "quiz_participants", filter: `exam_id=eq.${q.id}` }, () => loadParticipants())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [q.id]);

  const myGroupParticipants = participants.filter((p) =>
    p.semina === student?.semina && p.student_group === student?.student_group
  );
  const iJoined = !!participants.find((p) => p.student_id === student?.id);

  const join = async () => {
    if (!student) return;
    setJoining(true);
    const { error } = await supabase.from("quiz_participants" as any).insert({
      exam_id: q.id, student_id: student.id, reg_no: student.reg_no, full_name: student.full_name,
      semina: student.semina, student_group: student.student_group,
    } as any);
    setJoining(false);
    if (error && !String(error.message).toLowerCase().includes("duplicate")) {
      toast.error(error.message); return;
    }
    toast.success("Umeungana na group");
  };

  return (
    <Card className="border-2 border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
          <span className="truncate">{q.title}</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded">GROUP</span>
            {q.quiz_active
              ? <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full animate-pulse">🟢 HAI</span>
              : <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">⏸ Imezimwa</span>}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm space-y-3">
        {q.description && <p className="text-muted-foreground text-xs">{q.description}</p>}
        {!student ? (
          <p className="text-xs text-muted-foreground">Thibitisha Reg Namba kuona group lako.</p>
        ) : (
          <>
            <div className="text-xs bg-background/60 rounded-lg p-3 border">
              <div className="font-semibold mb-1">Group lako: <span className="text-primary">{student.semina} • {student.student_group}</span></div>
              <div className="text-muted-foreground mb-2">Wanachama ({members.length}):</div>
              <div className="flex flex-col gap-1">
                {members.map((m) => {
                  const joined = participants.find((p) => p.student_id === m.id);
                  return (
                    <div key={m.id} className={`text-[11px] px-2 py-1 rounded-md border flex items-center justify-between gap-2 ${joined ? "bg-emerald-500/15 border-emerald-500/40" : "bg-muted/40 border-muted-foreground/15"}`}>
                      <span className="truncate font-medium">{joined && "✓ "}{m.full_name}</span>
                      {m.phone && <a href={`tel:${m.phone}`} className="font-mono text-[10px] text-primary hover:underline shrink-0">📞 {m.phone}</a>}
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">Walioungana (watagawana alama): <b>{myGroupParticipants.length}/{members.length}</b></div>
            </div>

            {/* Tafuta mtu yeyote aliyesajiliwa kwenye mfumo */}
            <div className="rounded-lg border-2 border-primary/20 bg-background/60 p-3">
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <Search className="h-3.5 w-3.5 text-primary" />
                  Tafuta mwanafunzi yeyote ({allStudents.length.toLocaleString()})
                </div>
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary font-semibold"
                >
                  {showAll ? "Ficha" : "Onyesha wote"}
                </button>
              </div>
              <Input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Andika jina, Reg Namba, semina au group..."
                className="h-9 text-xs"
              />
              {(memberSearch.trim() || showAll) && (() => {
                const term = memberSearch.trim().toLowerCase();
                const list = term
                  ? allStudents.filter((s) =>
                      [s.full_name, s.reg_no, s.semina, s.student_group, s.phone]
                        .filter(Boolean)
                        .some((v: string) => String(v).toLowerCase().includes(term)),
                    )
                  : allStudents;
                const shown = list.slice(0, 300);
                return (
                  <>
                    <div className="mt-2 text-[10px] text-muted-foreground">
                      {list.length.toLocaleString()} matokeo{list.length > shown.length ? ` • inaonyesha ${shown.length}` : ""}
                    </div>
                    <div className="mt-1 max-h-72 overflow-auto flex flex-col gap-1">
                      {shown.map((s) => {
                        const joined = participants.find((p) => p.student_id === s.id);
                        const mine = s.semina === student.semina && s.student_group === student.student_group;
                        return (
                          <div
                            key={s.id}
                            className={`text-[11px] px-2 py-1 rounded-md border flex items-center justify-between gap-2 ${
                              joined
                                ? "bg-emerald-500/15 border-emerald-500/40"
                                : mine
                                ? "bg-primary/10 border-primary/30"
                                : "bg-muted/30 border-muted-foreground/10"
                            }`}
                          >
                            <span className="truncate font-medium">
                              {joined && "✓ "}{s.full_name}
                              <span className="text-muted-foreground font-mono ml-1">• {s.reg_no}</span>
                            </span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {s.semina} • {s.student_group}
                            </span>
                          </div>
                        );
                      })}
                      {list.length === 0 && (
                        <div className="text-[11px] text-muted-foreground text-center py-3">Hakuna mwanafunzi anayelingana.</div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="flex gap-2">
              {!iJoined ? (
                <Button size="sm" variant="outline" onClick={join} disabled={joining || !q.quiz_active} className="flex-1">

                  {joining ? <Loader2 className="h-3 w-3 animate-spin" /> : "Ungana na Group"}
                </Button>
              ) : (
                <Button size="sm" disabled className="flex-1 bg-emerald-500/20 text-emerald-700">✓ Umeungana</Button>
              )}
            </div>

            {iJoined && groupQuestions.length > 0 && (
              <div className="rounded-xl border-2 border-secondary/40 bg-secondary/5 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="text-sm font-bold flex items-center gap-1.5 min-w-0">
                    <Sparkles className="h-4 w-4 text-secondary shrink-0" />
                    <span className="truncate">Chagua swali MOJA kati ya {groupQuestions.length}</span>
                  </div>
                  <span className="text-[10px] font-bold bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full uppercase tracking-wide shrink-0">Online Assignment</span>
                </div>
                <p className="text-[11px] text-muted-foreground">📱 Bonyeza swali unalotaka kujibu (linabaki mahususi kwa group lako).</p>
                {/* Mobile-friendly card picker — all questions visible without scrolling a tiny dropdown */}
                <div className="grid gap-2">
                  {groupQuestions.map((gq, idx) => {
                    const active = pickedQid === gq.id;
                    return (
                      <button
                        key={gq.id}
                        type="button"
                        onClick={() => setPickedQid(gq.id)}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all flex gap-3 items-start min-h-[64px] ${
                          active
                            ? "bg-secondary/20 border-secondary shadow-md ring-2 ring-secondary/40 scale-[1.01]"
                            : "bg-background/70 border-border hover:border-secondary/60 hover:bg-secondary/5"
                        }`}
                      >
                        <span className={`shrink-0 h-9 w-9 rounded-full grid place-items-center text-sm font-extrabold ${
                          active ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"
                        }`}>
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">
                            Swali {idx + 1} {gq.points ? `• ${gq.points} alama` : ""}
                          </div>
                          <div className="text-sm leading-snug break-words" style={{ wordBreak: "break-word", overflowWrap: "anywhere" }}>
                            {String(gq.body)}
                          </div>
                        </div>
                        {active && <CheckCircle2 className="h-5 w-5 text-secondary shrink-0 mt-1" />}
                      </button>
                    );
                  })}
                </div>
                <Button
                  size="lg"
                  className="w-full text-base font-bold h-12"
                  disabled={!pickedQid || !q.quiz_active}
                  onClick={() => nav({ to: "/exam/$examId", params: { examId: q.id }, search: { qid: pickedQid, mode: "assignment" } as any })}
                >
                  {pickedQid ? <>Anza Kujibu Swali {groupQuestions.findIndex(g => g.id === pickedQid) + 1} <ArrowRight className="h-4 w-4 ml-1" /></> : "Chagua swali kwanza"}
                </Button>
              </div>
            )}

            {!q.quiz_active && <p className="text-[11px] text-amber-600">⏸ Subiri admin awashe quiz</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
