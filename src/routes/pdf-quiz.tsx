import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, FileText, CheckCircle2, Clock, Sparkles, AlertCircle, ArrowLeft, Pencil } from "lucide-react";
import { findStudentsByQuery } from "@/lib/studentSearch";
import { StudentMatchesPicker } from "@/components/StudentMatchesPicker";
import { matchesAcademicTarget } from "@/lib/academicTargeting";

type Search = { a?: string };

export const Route = createFileRoute("/pdf-quiz")({
  validateSearch: (s: Record<string, unknown>): Search => ({ a: typeof s.a === "string" ? s.a : undefined }),
  head: () => ({
    meta: [
      { title: "Kazi za Nyumbani — Islamic Studies Test" },
      { name: "description", content: "Pakia kazi yako (PDF/Word). AI itapendekeza alama na mwalimu atathibitisha." },
    ],
  }),
  component: Page,
});

const ACCEPT = ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function Page() {
  const { a: aParam } = Route.useSearch();
  const [reg, setReg] = useState("");
  const [student, setStudent] = useState<any | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [checking, setChecking] = useState(false);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [mySubs, setMySubs] = useState<any[]>([]);

  const visibleAssignments = student ? assignments.filter((assignment) => matchesAcademicTarget(assignment, student)) : [];

  useEffect(() => {
    supabase.from("exam_pdfs" as any).select("*").eq("is_assignment", true).eq("active", true).order("created_at", { ascending: false })
      .then(({ data }: { data: any }) => {
        const list = (data as any[]) || [];
        setAssignments(list);
        if (aParam) {
          const found = list.find((x) => x.id === aParam);
          if (found) setActive(found);
        }
      });
    const saved = localStorage.getItem("student_reg");
    if (saved) setReg(saved);
  }, [aParam]);

  const confirmStudent = async (data: any) => {
    setStudent(data);
    setMatches([]);
    setReg(data.reg_no);
    localStorage.setItem("student_reg", data.reg_no);
    const { data: subs } = await supabase.from("pdf_submissions" as any).select("*").eq("reg_no", data.reg_no).order("created_at", { ascending: false });
    setMySubs((subs as any[]) || []);
    if (active && !matchesAcademicTarget(active, data)) setActive(null);
    toast.success(`Karibu, ${data.full_name}`);
  };

  const lookupStudent = async () => {
    if (!reg.trim()) return;
    setChecking(true);
    const results = await findStudentsByQuery(reg);
    setChecking(false);
    if (results.length === 0) { toast.error("Hakuna mwanafunzi anayelingana. Jisajili kwanza."); setStudent(null); setMatches([]); return; }
    if (results.length === 1) { confirmStudent(results[0]); return; }
    setStudent(null);
    setMatches(results);
    toast.info(`Tumepata ${results.length} wanafunzi — chagua wewe ni nani.`);
  };

  const upload = async () => {
    if (!student || !file || !active) { toast.error("Chagua kazi na faili"); return; }
    if (file.size > 15 * 1024 * 1024) { toast.error("Faili kubwa sana (max 15MB)"); return; }
    const okType = /\.(pdf|docx?|)$/i.test(file.name) || /pdf|word/i.test(file.type);
    if (!okType) { toast.error("Tumia PDF au Word tu"); return; }

    // Edit-mode: replace previous submission if not yet teacher-confirmed
    const prev = mySubs.find((s) => s.assignment_id === active.id);
    if (prev?.teacher_confirmed) { toast.error("Mwalimu amethibitisha tayari — huwezi kuhariri."); return; }

    setUploading(true);
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `assignments/${active.id}/${student.reg_no}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage.from("exam-media").upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (upErr) { setUploading(false); toast.error(upErr.message); return; }
    const { data: pub } = supabase.storage.from("exam-media").getPublicUrl(path);

    if (prev) {
      await supabase.from("pdf_submissions" as any).delete().eq("id", prev.id);
    }

    const { data: ins, error } = await supabase.from("pdf_submissions" as any).insert({
      exam_id: active.exam_id,
      assignment_id: active.id,
      student_id: student.id,
      reg_no: student.reg_no,
      full_name: student.full_name,
      semina: student.semina,
      student_group: student.student_group,
      file_url: pub.publicUrl,
      file_name: file.name,
      max_score: active.points || 100,
      status: "pending",
    }).select().single();
    if (error) { setUploading(false); toast.error(error.message); return; }

    toast.success(prev ? "Jibu limehaririwa! AI inakagua..." : "Kazi imepokelewa! AI inakagua...");

    // Fire AI grading (best-effort)
    try {
      const { data: ai } = await supabase.functions.invoke("ai-grade-assignment", {
        body: {
          assignmentText: active.assignment_text || active.title,
          correctAnswer: active.correct_answer || "",
          fileUrl: pub.publicUrl,
          maxPoints: active.points || 100,
        },
      });
      if (ai?.score != null) {
        await supabase.from("pdf_submissions" as any).update({
          ai_suggested_score: ai.score,
          ai_suggested_feedback: ai.feedback,
          ai_suggested_at: new Date().toISOString(),
        }).eq("id", (ins as any).id);
        toast.success(`AI imependekeza: ${ai.score}/${active.points || 100}`);
      }
    } catch { /* admin atagrade mwenyewe */ }

    setUploading(false);
    setFile(null);
    setActive(null);
    lookupStudent();
  };

  return (
    <>
      <SiteHeader />
      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-3xl font-extrabold text-primary flex items-center gap-2">
            <FileText className="h-7 w-7" /> Kazi za Nyumbani
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Mwalimu anaweka swali — wewe pakia jibu (PDF au Word). AI itapendekeza alama, mwalimu atathibitisha.</p>
        </div>

        {!student ? (
          <Card>
            <CardHeader><CardTitle>Anza — Weka Reg Namba yako</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Reg Namba au Jina</Label>
                <Input value={reg} onChange={(e) => setReg(e.target.value)} placeholder="MFN.001 au jina la mwisho" onKeyDown={(e) => { if (e.key === "Enter") lookupStudent(); }} />
              </div>
              <Button className="w-full" onClick={lookupStudent} disabled={checking}>
                {checking ? "Inatafuta..." : "Endelea"}
              </Button>
              {matches.length > 0 && (
                <StudentMatchesPicker matches={matches} onConfirm={confirmStudent} onCancel={() => setMatches([])} />
              )}
              <p className="text-xs text-muted-foreground text-center">
                Hujajisajili? <Link to="/register" className="text-primary underline">Jisajili hapa</Link>
              </p>
            </CardContent>
          </Card>
        ) : active ? (
          <Card className="border-2 border-primary/40">
            <CardHeader>
              <button onClick={() => setActive(null)} className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                <ArrowLeft className="h-3 w-3" /> Rudi kwenye orodha
              </button>
              <CardTitle className="text-xl">{active.title}</CardTitle>
              <div className="flex items-center gap-2 text-xs flex-wrap mt-1">
                <span className="px-2 py-0.5 rounded bg-primary/20 text-primary font-bold">{active.points} alama</span>
                {active.due_at && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3 w-3" /> Mwisho: {new Date(active.due_at).toLocaleString("sw-TZ")}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {active.assignment_text && (
                <div className="p-3 rounded-lg bg-muted/40 border whitespace-pre-wrap text-sm">{active.assignment_text}</div>
              )}
              {active.file_url && (
                <a href={active.file_url} target="_blank" rel="noreferrer" className="block text-sm text-primary underline">📄 Pakua maswali (PDF)</a>
              )}
              {(() => {
                const prev = mySubs.find((s) => s.assignment_id === active.id);
                if (!prev) return null;
                return (
                  <div className="p-3 rounded-lg border-2 border-amber-500/40 bg-amber-500/5 text-sm">
                    <div className="font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                      <Pencil className="h-4 w-4" /> Una jibu la awali — pakia faili jipya kuhariri
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Faili la sasa: <a href={prev.file_url} target="_blank" rel="noreferrer" className="text-primary underline">{prev.file_name || "Faili"}</a>
                      {prev.teacher_confirmed && <span className="ml-2 text-emerald-700 font-bold">(Mwalimu amethibitisha — huwezi kuhariri)</span>}
                    </div>
                  </div>
                );
              })()}
              <div>
                <Label>Pakia jibu lako (PDF au Word, max 15MB)</Label>
                <Input type="file" accept={ACCEPT} onChange={(e) => setFile(e.target.files?.[0] || null)} />
                {file && <p className="text-xs text-muted-foreground mt-1">📎 {file.name} ({(file.size / 1024).toFixed(0)} KB)</p>}
              </div>
              <Button className="w-full" onClick={upload} disabled={uploading || !file || !!mySubs.find((s) => s.assignment_id === active.id && s.teacher_confirmed)}>
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? "Inapakia + AI inakagua..." : (mySubs.find((s) => s.assignment_id === active.id) ? "Hariri / Tuma upya" : "Tuma Kazi")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <Card className="border-primary/30">
              <CardContent className="p-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <div className="text-sm"><b>{student.full_name}</b> • {student.reg_no} • {student.semina} • {student.student_group} • Mwaka {student.study_year || "—"} • {student.academic_year || "—"}</div>
              </CardContent>
            </Card>

            <h2 className="text-lg font-bold">Kazi za mwaka wako ({visibleAssignments.length})</h2>
            {visibleAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Hakuna kazi ya mwaka wako kwa sasa. Subiri mwalimu apandishe.</p>
            ) : (
              <div className="grid gap-3">
                {visibleAssignments.map((a) => {
                  const done = mySubs.find((s) => s.assignment_id === a.id);
                  const overdue = a.due_at && Date.now() > new Date(a.due_at).getTime();
                  const canEdit = done && !done.teacher_confirmed;
                  return (
                    <Card key={a.id} className="hover:shadow-lg transition cursor-pointer" onClick={() => (!done || canEdit) && setActive(a)}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-bold">{a.title}</div>
                            {a.assignment_text && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{a.assignment_text}</p>}
                            <div className="flex items-center gap-2 text-[11px] mt-1 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold">{a.points} alama</span>
                              {a.due_at && (
                                <span className={`inline-flex items-center gap-1 ${overdue ? "text-destructive font-bold" : "text-muted-foreground"}`}>
                                  {overdue ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                  {new Date(a.due_at).toLocaleString("sw-TZ")}
                                </span>
                              )}
                            </div>
                            {done?.file_url && (
                              <a href={done.file_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[11px] text-primary underline mt-1">
                                📥 Pakua jibu lako
                              </a>
                            )}
                          </div>
                          <div className="text-right shrink-0 flex flex-col items-end gap-1">
                            {done ? (
                              done.teacher_confirmed ? (
                                <span className="text-xs bg-emerald-500/20 text-emerald-700 px-2 py-1 rounded font-bold">✓ {done.score}/{done.max_score}</span>
                              ) : done.ai_suggested_score != null ? (
                                <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded font-bold inline-flex items-center gap-1">
                                  <Sparkles className="h-3 w-3" /> AI: {Number(done.ai_suggested_score).toFixed(0)}/{done.max_score}
                                </span>
                              ) : (
                                <span className="text-xs bg-yellow-500/20 text-yellow-700 px-2 py-1 rounded">Subiri</span>
                              )
                            ) : null}
                            {!done && <Button size="sm">Fanya</Button>}
                            {canEdit && (
                              <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setActive(a); }}>
                                <Pencil className="h-3 w-3 mr-1" /> Hariri
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {mySubs.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Historia ya kazi zako ({mySubs.length})</CardTitle></CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {mySubs.map((s) => (
                      <li key={s.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-lg gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 shrink-0 text-primary" />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{s.file_name || "Faili"}</div>
                            <div className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString("sw-TZ")}</div>
                            {s.ai_suggested_feedback && !s.teacher_confirmed && (
                              <div className="text-[11px] text-primary italic mt-0.5 inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> {s.ai_suggested_feedback.slice(0, 80)}...</div>
                            )}
                            {s.feedback && s.teacher_confirmed && (
                              <div className="text-[11px] italic mt-0.5">💬 {s.feedback.slice(0, 80)}</div>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {s.teacher_confirmed ? (
                            <span className="text-xs bg-emerald-500/20 text-emerald-700 px-2 py-1 rounded font-bold">✓ {s.score}/{s.max_score}</span>
                          ) : s.ai_suggested_score != null ? (
                            <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded font-bold inline-flex items-center gap-1">
                              <Sparkles className="h-3 w-3" /> AI: {Number(s.ai_suggested_score).toFixed(0)}
                            </span>
                          ) : (
                            <span className="text-xs bg-yellow-500/20 text-yellow-700 px-2 py-1 rounded">Subiri</span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </main>
    </>
  );
}