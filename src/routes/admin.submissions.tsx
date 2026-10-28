import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as XLSX from "xlsx";
import { toast } from "@/lib/toast";
import { confirmAction } from "@/lib/alerts";
import { Download, FileSpreadsheet, Eye, EyeOff, MapPin, Search, FileText, FileType, Trash2, Pencil, CheckCircle2, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Document, Packer, Paragraph, Table, TableRow, TableCell, HeadingLevel, WidthType, TextRun } from "docx";
import { saveAs } from "file-saver";

export const Route = createFileRoute("/admin/submissions")({ component: Page });

function Page() {
  const [exams, setExams] = useState<any[]>([]);
  const [examId, setExamId] = useState<string>("");
  const [subs, setSubs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<any>(null);
  const [editScores, setEditScores] = useState<Record<string, number>>({});
  const [editTotal, setEditTotal] = useState<number>(0);
  const [questions, setQuestions] = useState<any[]>([]);

  const reload = () => {
    if (!examId) return;
    (async () => {
      const pageSize = 1000;
      let from = 0;
      const all: any[] = [];
      while (true) {
        const { data, error } = await supabase.from("submissions")
          .select("*, students(full_name, phone, course, semina, student_group)")
          .eq("exam_id", examId)
          .order("submitted_at", { ascending: false })
          .range(from, from + pageSize - 1);
        if (error) { toast.error(error.message); break; }
        if (!data || data.length === 0) break;
        all.push(...data);
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setSubs(all);
    })();
  };

  useEffect(() => {
    supabase.from("exams").select("*").order("created_at", { ascending: true })
      .then(({ data }: { data: any }) => setExams(data || []));
  }, []);

  useEffect(() => {
    if (!examId) { setSubs([]); return; }
    reload();
    supabase.from("questions").select("*").eq("exam_id", examId).order("position")
      .then(({ data }: { data: any }) => setQuestions(data || []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId]);

  const examIndex = useMemo(() => exams.findIndex((e) => e.id === examId) + 1, [exams, examId]);
  const fileBase = examIndex > 0 ? `TEST ${examIndex}` : "matokeo";
  const current = exams.find((e) => e.id === examId);

  const filtered = subs.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.reg_no?.toLowerCase().includes(q) ||
      s.students?.full_name?.toLowerCase().includes(q) ||
      s.students?.course?.toLowerCase().includes(q)
    );
  });

  const buildRows = () => filtered.map((s, i) => ({
    "#": i + 1,
    "Jina Kamili": s.students?.full_name ?? "",
    "Reg Namba": s.reg_no,
    "Test": fileBase,
    "Alama": s.score != null ? Math.round(Number(s.score)) : "",
    "Simu": s.students?.phone ?? "",
    "Kozi": s.students?.course ?? "",
    "Semina": s.students?.semina ?? "",
    "Group": s.students?.student_group ?? "",
    "Imetumwa": s.submitted_at ? new Date(s.submitted_at).toLocaleString() : "",
    "GPS": s.gps_lat ? `${s.gps_lat},${s.gps_lng}` : "",
  }));

  const exportExcel = () => {
    if (!filtered.length) return toast.error("Hakuna data");
    // Excel rahisi: Reg Namba, Test, Alama tu (per user request)
    const simpleRows = filtered.map((s) => ({
      "Reg Namba": s.reg_no,
      "Test": fileBase,
      "Alama": s.score != null ? Math.round(Number(s.score)) : "",
    }));
    const ws = XLSX.utils.json_to_sheet(simpleRows);
    ws["!cols"] = [{ wch: 18 }, { wch: 12 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, fileBase);
    XLSX.writeFile(wb, `${fileBase}.xlsx`);
    toast.success(`Imehifadhiwa: ${fileBase}.xlsx`);
  };

  const exportCsv = () => {
    if (!filtered.length) return toast.error("Hakuna data");
    const ws = XLSX.utils.json_to_sheet(buildRows());
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileBase}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Imehifadhiwa: ${fileBase}.csv`);
  };

  const exportPdf = () => {
    if (!filtered.length) return toast.error("Hakuna data");
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text(`${fileBase} - ${current?.title || ""}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Tarehe: ${new Date().toLocaleString()} | Jumla: ${filtered.length}`, 14, 22);
    const rows = buildRows();
    const head = [Object.keys(rows[0])];
    const body = rows.map((r) => Object.values(r).map((v) => String(v)));
    autoTable(doc, { startY: 28, head, body, styles: { fontSize: 8 }, headStyles: { fillColor: [40, 100, 60] } });
    doc.save(`${fileBase}.pdf`);
    toast.success(`Imehifadhiwa: ${fileBase}.pdf`);
  };

  const exportWord = async () => {
    if (!filtered.length) return toast.error("Hakuna data");
    const rows = buildRows();
    const headers = Object.keys(rows[0]);
    const table = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: headers.map((h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })) }),
        ...rows.map((r) => new TableRow({ children: headers.map((h) => new TableCell({ children: [new Paragraph(String((r as any)[h] ?? ""))] })) })),
      ],
    });
    const docx = new Document({
      sections: [{
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`${fileBase} - ${current?.title || ""}`)] }),
          new Paragraph(`Tarehe: ${new Date().toLocaleString()}`),
          new Paragraph(" "),
          table,
        ],
      }],
    });
    const blob = await Packer.toBlob(docx);
    saveAs(blob, `${fileBase}.docx`);
    toast.success(`Imehifadhiwa: ${fileBase}.docx`);
  };

  const togglePublish = async () => {
    if (!current) return;
    const { error } = await supabase.from("exams").update({ results_published: !current.results_published }).eq("id", examId);
    if (error) return toast.error(error.message);
    toast.success(current.results_published ? "Matokeo yamefichwa" : "Matokeo yamepublishiwa");
    setExams(exams.map((e) => e.id === examId ? { ...e, results_published: !e.results_published } : e));
  };

  const deleteSubmission = async (s: any) => {
    if (!(await confirmAction(`Futa jibu la ${s.students?.full_name || s.reg_no}?`, "Haitarudishwa."))) return;
    const { error } = await supabase.from("submissions").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Imefutwa");
    reload();
  };

  const confirmOne = async (s: any) => {
    const { error } = await supabase.from("submissions").update({ ai_confirmed: true }).eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Imethibitishwa");
    reload();
  };

  const confirmAllPending = async () => {
    const pending = subs.filter((s) => !s.ai_confirmed);
    if (!pending.length) return toast.info("Hakuna inayosubiri uthibitisho");
    if (
      !(await confirmAction(
        `Thibitisha alama za AI kwa wanafunzi ${pending.length}?`,
        "Alama zilizopendekezwa na AI zitathibitishwa.",
        "Ndiyo, thibitisha",
      ))
    )
      return;
    const ids = pending.map((s) => s.id);
    const { error } = await supabase.from("submissions").update({ ai_confirmed: true }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Wamethibitishwa ${pending.length}`);
    reload();
  };

  const openEdit = (s: any) => {
    setEditing(s);
    const fb = (s.ai_feedback || {}) as Record<string, any>;
    const scores: Record<string, number> = {};
    Object.keys(fb).forEach((qid) => { scores[qid] = Number(fb[qid]?.score ?? 0); });
    setEditScores(scores);
    setEditTotal(Number(s.score ?? 0));
  };

  const saveEdit = async () => {
    if (!editing) return;
    const fb = { ...(editing.ai_feedback || {}) } as Record<string, any>;
    let aiSum = 0;
    Object.keys(editScores).forEach((qid) => {
      const sc = Number(editScores[qid]) || 0;
      fb[qid] = { ...(fb[qid] || {}), score: sc };
      aiSum += sc;
    });
    const autoScore = Number(editing.auto_score ?? 0);
    const newTotal = Number.isFinite(editTotal) && editTotal >= 0 ? Number(editTotal) : (autoScore + aiSum);
    const { error } = await supabase.from("submissions").update({
      ai_feedback: fb,
      ai_score: aiSum,
      score: newTotal,
      ai_confirmed: true,
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Imehifadhiwa & kuthibitishwa");
    setEditing(null);
    reload();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <Select value={examId} onValueChange={setExamId}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Chagua mtihani" /></SelectTrigger>
              <SelectContent>
                {exams.map((e, i) => (
                  <SelectItem key={e.id} value={e.id}>test{i + 1} — {e.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {examId && (
              <>
                <Button onClick={confirmAllPending} variant="secondary" className="gap-1"><ShieldCheck className="h-4 w-4" /> Thibitisha AI Zote</Button>
                <Button variant={current?.results_published ? "outline" : "default"} onClick={togglePublish} className="gap-1">
                  {current?.results_published ? <><EyeOff className="h-4 w-4" /> Ficha Matokeo</> : <><Eye className="h-4 w-4" /> Publish Matokeo</>}
                </Button>
              </>
            )}
          </div>
          {examId && (
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Tafuta kwa jina, reg namba au kozi..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
          )}
        </CardContent>
      </Card>

      {examId && (
        <Card className="border-2 border-primary/40 bg-gradient-to-br from-primary/10 via-card to-emerald-500/5 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-base font-extrabold tracking-tight">
                  <Download className="h-5 w-5 text-primary" />
                  Pakua Matokeo ({filtered.length})
                </div>
                <p className="text-xs text-muted-foreground mt-1">Chagua muundo wa faili — itahifadhiwa kama <b>{fileBase}</b></p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full sm:w-auto">
                <Button onClick={exportExcel} className="gap-1"><FileSpreadsheet className="h-4 w-4" /> Excel</Button>
                <Button onClick={exportCsv} variant="outline" className="gap-1"><Download className="h-4 w-4" /> CSV</Button>
                <Button onClick={exportPdf} variant="outline" className="gap-1"><FileText className="h-4 w-4" /> PDF</Button>
                <Button onClick={exportWord} variant="outline" className="gap-1"><FileType className="h-4 w-4" /> Word</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {examId && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left p-3">#</th>
                    <th className="text-left p-3">Jina</th>
                    <th className="text-left p-3">Reg Namba</th>
                    <th className="text-left p-3">Kozi</th>
                    <th className="text-left p-3">Simu</th>
                    <th className="text-left p-3">Alama</th>
                    <th className="text-left p-3">Asilimia</th>
                    <th className="text-left p-3">Hali ya AI</th>
                    <th className="text-left p-3">GPS</th>
                    <th className="text-left p-3">Muda</th>
                    <th className="text-left p-3">Vitendo</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={11} className="text-center p-6 text-muted-foreground">Hakuna matokeo bado.</td></tr>
                  )}
                  {filtered.map((s, i) => {
                    const pct = s.max_score ? (Number(s.score) / Number(s.max_score)) * 100 : 0;
                    const scoreInt = s.score != null ? Math.round(Number(s.score)) : "-";
                    return (
                      <tr key={s.id} className="border-b hover:bg-muted/50">
                        <td className="p-3 text-muted-foreground">{i + 1}</td>
                        <td className="p-3 font-medium">{s.students?.full_name ?? "-"}</td>
                        <td className="p-3 font-mono text-xs">{s.reg_no}</td>
                        <td className="p-3">{s.students?.course ?? s.students?.student_group ?? "-"}</td>
                        <td className="p-3">{s.students?.phone ?? "-"}</td>
                        <td className="p-3 font-bold text-lg text-primary">{scoreInt}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${pct >= 50 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                            {pct.toFixed(1)}%
                          </span>
                        </td>
                        <td className="p-3">
                          {s.ai_confirmed ? (
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-primary/10 text-primary inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Imethibitishwa</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/10 text-amber-600">Inasubiri</span>
                          )}
                        </td>
                        <td className="p-3 text-xs">
                          {s.gps_lat ? (
                            <a className="text-primary inline-flex items-center gap-1 hover:underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${s.gps_lat},${s.gps_lng}`}>
                              <MapPin className="h-3 w-3" /> Angalia
                            </a>
                          ) : "-"}
                        </td>
                        <td className="p-3 text-xs">{s.submitted_at ? new Date(s.submitted_at).toLocaleString() : "-"}</td>
                        <td className="p-3">
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" onClick={() => openEdit(s)} title="Hariri"><Pencil className="h-3 w-3" /></Button>
                            {!s.ai_confirmed && (
                              <Button size="sm" variant="secondary" onClick={() => confirmOne(s)} title="Thibitisha AI"><CheckCircle2 className="h-3 w-3" /></Button>
                            )}
                            <Button size="sm" variant="destructive" onClick={() => deleteSubmission(s)} title="Futa"><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {examId && current?.quiz_mode === "group" && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full uppercase tracking-wide">Online Assignment</span>
              <h3 className="font-bold">Mtazamo wa Group — Swali moja kwa kila kikundi</h3>
            </div>
            {(() => {
              // Group submissions by semina + group + answered question id
              const groups = new Map<string, { semina: string; group: string; qid: string; rows: any[] }>();
              filtered.forEach((s) => {
                const ansKeys = Object.keys(s.answers || {});
                const qid = ansKeys[0] || "—";
                const semina = s.students?.semina ?? "-";
                const grp = s.students?.student_group ?? "-";
                const key = `${semina}||${grp}||${qid}`;
                if (!groups.has(key)) groups.set(key, { semina, group: grp, qid, rows: [] });
                groups.get(key)!.rows.push(s);
              });
              if (groups.size === 0) return <p className="text-sm text-muted-foreground">Hakuna majibu ya group bado.</p>;
              return (
                <div className="space-y-4">
                  {Array.from(groups.values()).map((g, gi) => {
                    const q = questions.find((qq) => qq.id === g.qid);
                    return (
                      <div key={gi} className="border-2 rounded-lg p-3 bg-secondary/5">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span className="text-xs font-bold bg-primary/15 text-primary px-2 py-0.5 rounded">{g.semina} • {g.group}</span>
                          <span className="text-xs text-muted-foreground">Wanachama: {g.rows.length}</span>
                        </div>
                        <div className="text-sm p-2 bg-background border rounded mb-2">
                          <b>Swali walilojibu:</b> {q ? q.body : "(swali halipatikani)"}
                          {q && <span className="text-xs text-muted-foreground ml-2">({q.points} alama)</span>}
                        </div>
                        <table className="w-full text-xs">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left p-2">Jina</th>
                              <th className="text-left p-2">Reg</th>
                              <th className="text-left p-2">Alama (swali hili)</th>
                              <th className="text-left p-2">Jumla</th>
                              <th className="text-left p-2">Vitendo</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.rows.map((s) => {
                              const fb = (s.ai_feedback || {})[g.qid] || {};
                              const qScore = fb.score != null ? Number(fb.score) : (s.score != null ? Number(s.score) : null);
                              return (
                                <tr key={s.id} className="border-b">
                                  <td className="p-2 font-medium">{s.students?.full_name ?? "-"}</td>
                                  <td className="p-2 font-mono">{s.reg_no}</td>
                                  <td className="p-2 font-bold text-primary">{qScore != null ? qScore.toFixed(1) : "-"} / {q?.points ?? "-"}</td>
                                  <td className="p-2">{s.score != null ? Math.round(Number(s.score)) : "-"}</td>
                                  <td className="p-2">
                                    <div className="flex gap-1">
                                      <Button size="sm" variant="outline" onClick={() => openEdit(s)}><Pencil className="h-3 w-3" /></Button>
                                      {!s.ai_confirmed && <Button size="sm" variant="secondary" onClick={() => confirmOne(s)}><CheckCircle2 className="h-3 w-3" /></Button>}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}


      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Hariri & Thibitisha AI — {editing?.students?.full_name} ({editing?.reg_no})</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="p-2 bg-muted rounded"><div className="text-xs text-muted-foreground">Auto</div><div className="font-bold">{Number(editing.auto_score ?? 0).toFixed(1)}</div></div>
                <div className="p-2 bg-muted rounded"><div className="text-xs text-muted-foreground">AI</div><div className="font-bold">{Number(editing.ai_score ?? 0).toFixed(1)}</div></div>
                <div className="p-2 bg-muted rounded"><div className="text-xs text-muted-foreground">Jumla / {editing.max_score}</div><div className="font-bold">{Number(editing.score ?? 0).toFixed(1)}</div></div>
              </div>
              <div className="space-y-3">
                <div className="font-semibold text-sm">Maswali ya Maelezo (AI):</div>
                {questions.filter((q) => q.question_type === "short_answer").map((q) => {
                  const fb = (editing.ai_feedback || {})[q.id] || {};
                  const ans = (editing.answers || {})[q.id] || "";
                  return (
                    <Card key={q.id}>
                      <CardContent className="p-3 space-y-2">
                        <div className="text-sm font-medium">{q.body} <span className="text-xs text-muted-foreground">({q.points} alama)</span></div>
                        <div className="text-xs"><b>Jibu sahihi:</b> {String(q.correct_answer)}</div>
                        <div className="text-xs p-2 bg-muted rounded"><b>Jibu la mwanafunzi:</b> {ans || "(hakuna)"}</div>
                        {fb.feedback && <div className="text-xs italic text-muted-foreground">AI: {fb.feedback}</div>}
                        <div className="flex items-center gap-2">
                          <Label className="text-xs">Alama:</Label>
                          <Input type="number" min={0} max={q.points} step="0.5" className="w-24"
                            value={editScores[q.id] ?? 0}
                            onChange={(e) => setEditScores({ ...editScores, [q.id]: Number(e.target.value) })} />
                          <span className="text-xs text-muted-foreground">/ {q.points}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {questions.filter((q) => q.question_type === "short_answer").length === 0 && (
                  <p className="text-sm text-muted-foreground">Mtihani huu hauna maswali ya AI.</p>
                )}
              </div>
              <div className="border-t pt-3">
                <Label className="text-sm">Jumla ya alama (unaweza badilisha):</Label>
                <Input type="number" min={0} max={editing.max_score} step="0.5" value={editTotal}
                  onChange={(e) => setEditTotal(Number(e.target.value))} className="mt-1 w-40" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Ghairi</Button>
            <Button onClick={saveEdit}><CheckCircle2 className="h-4 w-4 mr-1" /> Hifadhi & Thibitisha</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
