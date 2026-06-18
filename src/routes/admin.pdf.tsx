import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileText, ExternalLink, Trash2, Upload, Sparkles } from "lucide-react";

export const Route = createFileRoute("/admin/pdf")({ component: Page });

function Page() {
  const [subs, setSubs] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [grading, setGrading] = useState<any | null>(null);
  const [uploadFor, setUploadFor] = useState<string>("");
  const [pdfTitle, setPdfTitle] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [examPdfs, setExamPdfs] = useState<any[]>([]);
  const [isAssignment, setIsAssignment] = useState(true);
  const [assignmentText, setAssignmentText] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [points, setPoints] = useState(100);

  const load = async () => {
    const [{ data: s }, { data: e }, { data: ep }] = await Promise.all([
      supabase.from("pdf_submissions" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("exams").select("id,title,test_number").order("created_at", { ascending: false }),
      supabase.from("exam_pdfs" as any).select("*").order("created_at", { ascending: false }),
    ]);
    setSubs((s as any[]) || []); setExams(e || []); setExamPdfs((ep as any[]) || []);
  };
  useEffect(() => { load(); }, []);

  const saveGrade = async () => {
    if (!grading) return;
    const { error } = await supabase.from("pdf_submissions" as any).update({
      score: Number(grading.score) || 0,
      max_score: Number(grading.max_score) || 100,
      feedback: grading.feedback || "",
      status: "graded",
      teacher_confirmed: true,
      graded_at: new Date().toISOString(),
    }).eq("id", grading.id);
    if (error) toast.error(error.message);
    else { toast.success("Imehifadhiwa"); setGrading(null); load(); }
  };

  const confirmAi = async (s: any) => {
    await supabase.from("pdf_submissions" as any).update({
      score: s.ai_suggested_score,
      max_score: s.max_score || 100,
      feedback: s.ai_suggested_feedback,
      status: "graded",
      teacher_confirmed: true,
      graded_at: new Date().toISOString(),
    }).eq("id", s.id);
    toast.success("Umethibitisha alama ya AI");
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Futa?")) return;
    await supabase.from("pdf_submissions" as any).delete().eq("id", id);
    load();
  };

  const delPdf = async (id: string) => {
    if (!confirm("Futa kazi/PDF hii?")) return;
    await supabase.from("exam_pdfs" as any).delete().eq("id", id);
    load();
  };

  const uploadExamPdf = async () => {
    if (!pdfTitle || !uploadFor) { toast.error("Jaza title na chagua mtihani"); return; }
    if (isAssignment && !assignmentText && !pdfFile) { toast.error("Andika swali AU pakia PDF ya maswali"); return; }
    if (pdfFile && pdfFile.type !== "application/pdf") { toast.error("Faili lazima iwe PDF"); return; }
    setUploading(true);
    let fileUrl = "";
    let fileName = "";
    if (pdfFile) {
      const path = `exam-pdfs/${uploadFor}/${Date.now()}-${pdfFile.name}`;
      const { error: upErr } = await supabase.storage.from("exam-media").upload(path, pdfFile, { contentType: "application/pdf" });
      if (upErr) { setUploading(false); toast.error(upErr.message); return; }
      const { data: pub } = supabase.storage.from("exam-media").getPublicUrl(path);
      fileUrl = pub.publicUrl;
      fileName = pdfFile.name;
    }
    await supabase.from("exam_pdfs" as any).insert({
      exam_id: uploadFor,
      title: pdfTitle,
      file_url: fileUrl,
      file_name: fileName,
      uploaded_by: "admin",
      is_assignment: isAssignment,
      assignment_text: assignmentText || null,
      correct_answer: correctAnswer || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      points: Number(points) || 100,
      active: true,
    });
    setUploading(false);
    toast.success(isAssignment ? "Kazi imepandishwa" : "PDF imepakiwa");
    setPdfFile(null); setPdfTitle(""); setAssignmentText(""); setCorrectAnswer(""); setDueAt(""); setPoints(100);
    load();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">📝 Kazi & PDF Management</h2>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" /> Tengeneza Kazi / Pakia PDF</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isAssignment} onChange={(e) => setIsAssignment(e.target.checked)} />
            <span><b>Hii ni Kazi ya Nyumbani</b> — itaonekana home page; wanafunzi watapakia majibu; AI itakagua</span>
          </label>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Mtihani (mada)</Label>
              <select className="w-full border rounded-md px-3 py-2 bg-background" value={uploadFor} onChange={(e) => setUploadFor(e.target.value)}>
                <option value="">Chagua...</option>
                {exams.map((e) => <option key={e.id} value={e.id}>{e.test_number ? `Test ${e.test_number} — ` : ""}{e.title}</option>)}
              </select>
            </div>
            <div><Label>Jina la Kazi/PDF</Label><Input value={pdfTitle} onChange={(e) => setPdfTitle(e.target.value)} placeholder="Mfano: Kazi 1 — Hijrah" /></div>
          </div>
          {isAssignment && (
            <>
              <div>
                <Label>Swali / Maelekezo</Label>
                <Textarea rows={3} value={assignmentText} onChange={(e) => setAssignmentText(e.target.value)} placeholder="Mfano: Andika kwa kifupi historia ya Hijrah..." />
              </div>
              <div>
                <Label>Jibu Sahihi (AI itatumia kupima)</Label>
                <Textarea rows={3} value={correctAnswer} onChange={(e) => setCorrectAnswer(e.target.value)} placeholder="Muhtasari wa jibu sahihi..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Tarehe ya Mwisho</Label><Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></div>
                <div><Label>Alama za Juu</Label><Input type="number" value={points} onChange={(e) => setPoints(Number(e.target.value))} /></div>
              </div>
            </>
          )}
          <div>
            <Label>{isAssignment ? "PDF ya Maswali (hiari)" : "PDF ya Maswali"}</Label>
            <Input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
          </div>
          <Button onClick={uploadExamPdf} disabled={uploading} className="w-full">
            {uploading ? "Inapakia..." : isAssignment ? "Pandisha Kazi" : "Pakia PDF"}
          </Button>
          {examPdfs.length > 0 && (
            <div className="pt-3 border-t">
              <p className="text-xs font-bold mb-2">Kazi/PDF zilizopo ({examPdfs.length})</p>
              <ul className="space-y-1">
                {examPdfs.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm p-2 bg-muted/40 rounded gap-2">
                    <span className="truncate">{p.is_assignment ? "📝" : "📄"} {p.title} {p.is_assignment && <span className="text-[10px] text-primary font-bold">[KAZI • {p.points}p]</span>}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {p.file_url && <a href={p.file_url} target="_blank" rel="noreferrer" className="text-primary text-xs flex items-center gap-1"><ExternalLink className="h-3 w-3" /></a>}
                      <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => delPdf(p.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Majibu ya Wanafunzi — {subs.length}</CardTitle></CardHeader>
        <CardContent>
          {subs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Hakuna kazi iliyopakiwa bado.</p>
          ) : (
            <ul className="space-y-2">
              {subs.map((s) => {
                const exam = exams.find((e) => e.id === s.exam_id);
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/40 rounded-lg">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{s.full_name} <span className="text-xs text-muted-foreground">({s.reg_no})</span></div>
                      <div className="text-xs text-muted-foreground truncate">
                        {exam?.test_number ? `Test ${exam.test_number} — ` : ""}{exam?.title || "—"} • {s.semina} • {s.student_group}
                      </div>
                      <div className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString("sw-TZ")}</div>
                      {s.ai_suggested_feedback && !s.teacher_confirmed && (
                        <div className="text-[11px] mt-1 p-2 rounded bg-primary/10 border-l-2 border-primary flex items-start gap-1">
                          <Sparkles className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                          <span><b>AI ({Number(s.ai_suggested_score || 0).toFixed(0)}/{s.max_score || 100}):</b> {s.ai_suggested_feedback}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {s.teacher_confirmed || s.status === "graded" ? (
                        <span className="text-xs bg-emerald-500/20 text-emerald-700 px-2 py-1 rounded font-bold">{s.score}/{s.max_score}</span>
                      ) : (
                        <span className="text-xs bg-yellow-500/20 text-yellow-700 px-2 py-1 rounded">Subiri</span>
                      )}
                      <a href={s.file_url} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline"><ExternalLink className="h-3 w-3 mr-1" /> Fungua</Button>
                      </a>
                      {s.ai_suggested_score != null && !s.teacher_confirmed && (
                        <Button size="sm" variant="secondary" onClick={() => confirmAi(s)}>
                          <Sparkles className="h-3 w-3 mr-1" /> Thibitisha AI
                        </Button>
                      )}
                      <Button size="sm" onClick={() => setGrading({ ...s, score: s.score ?? s.ai_suggested_score ?? "", max_score: s.max_score ?? 100, feedback: s.feedback ?? s.ai_suggested_feedback ?? "" })}>Sahihisha</Button>
                      <Button size="sm" variant="destructive" onClick={() => del(s.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!grading} onOpenChange={(o) => !o && setGrading(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Sahihisha — {grading?.full_name}</DialogTitle></DialogHeader>
          {grading && (
            <div className="space-y-3">
              <a href={grading.file_url} target="_blank" rel="noreferrer" className="block text-primary underline text-sm">📄 Fungua faili ya mwanafunzi</a>
              {grading.ai_suggested_feedback && (
                <div className="text-xs p-2 rounded bg-primary/10 border border-primary/30">
                  <b className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> Pendekezo la AI:</b> {grading.ai_suggested_feedback}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Alama</Label><Input type="number" value={grading.score} onChange={(e) => setGrading({ ...grading, score: e.target.value })} /></div>
                <div><Label>Jumla</Label><Input type="number" value={grading.max_score} onChange={(e) => setGrading({ ...grading, max_score: e.target.value })} /></div>
              </div>
              <div><Label>Maoni</Label><Textarea rows={4} value={grading.feedback} onChange={(e) => setGrading({ ...grading, feedback: e.target.value })} /></div>
              <Button className="w-full" onClick={saveGrade}>Hifadhi Alama</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}