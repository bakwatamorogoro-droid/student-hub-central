import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device-id";
import { gradeShortAnswer, explainAnswer } from "@/lib/grading.functions";
import { toast } from "@/lib/toast";
import SignatureCanvas from "react-signature-canvas";
import { Camera, MapPin, Mic, Clock, Eye, FileDown, Printer } from "lucide-react";
import { RichTextEditor } from "@/components/RichTextEditor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Users } from "lucide-react";
import { formatAcademicSummary } from "@/lib/academicTargeting";

export const Route = createFileRoute("/exam/$examId")({
  component: ExamPage,
  validateSearch: (s: Record<string, unknown>) => ({
    qid: typeof s.qid === "string" ? s.qid : undefined,
    mode: s.mode === "assignment" ? "assignment" : undefined,
  }),
});

function ExamPage() {
  const { examId } = Route.useParams();
  const { qid: pickedQid, mode } = Route.useSearch();
  const isAssignment = mode === "assignment" && !!pickedQid;
  const nav = useNavigate();
  const grade = gradeShortAnswer;
  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [student, setStudent] = useState<any>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [gps, setGps] = useState<{ lat?: number; lng?: number }>({});
  const [camOk, setCamOk] = useState(false);
  const [audioOk, setAudioOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [started, setStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sigRef = useRef<SignatureCanvas>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<Date>(new Date());
  const containerRef = useRef<HTMLDivElement>(null);
  const autosaveKey = `exam_autosave_${examId}`;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [groupMembers, setGroupMembers] = useState<any[]>([]);
  const [selectedShareIds, setSelectedShareIds] = useState<Set<string>>(new Set());
  const [forgottenQ, setForgottenQ] = useState("");
  const [forgottenResults, setForgottenResults] = useState<any[]>([]);
  const [searchingForgotten, setSearchingForgotten] = useState(false);

  useEffect(() => {
    const load = async () => {
      const reg = localStorage.getItem("student_reg");
      if (!reg) {
        nav({ to: "/register" });
        return;
      }
      const { data: s } = await supabase
        .from("students")
        .select("*")
        .ilike("reg_no", reg)
        .maybeSingle();
      if (!s) {
        toast.error("Hujajisajili");
        nav({ to: "/register" });
        return;
      }
      // Kifaa chochote kinaruhusiwa - hakuna kizuizi cha device
      setStudent(s);
      const { data: e } = await supabase.from("exams").select("*").eq("id", examId).maybeSingle();
      if (!e) {
        toast.error("Mtihani haupo");
        nav({ to: "/exams" });
        return;
      }
      setExam(e);
      setTimeLeft(e.duration_minutes * 60);
      const { data: qs } = await supabase
        .from("questions")
        .select("*")
        .eq("exam_id", examId)
        .order("position");
      const all = qs || [];
      // In group-assignment mode, show ONLY the chosen question
      setQuestions(isAssignment ? all.filter((x: any) => x.id === pickedQid) : all);
      if (!e.autosave_disabled) {
        try {
          const saved = localStorage.getItem(autosaveKey);
          if (saved) setAnswers(JSON.parse(saved));
        } catch {}
      }
    };
    load();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [examId, nav]);

  // Autosave
  useEffect(() => {
    if (!exam || exam.autosave_disabled) return;
    if (!started) return;
    try {
      localStorage.setItem(autosaveKey, JSON.stringify(answers));
    } catch {}
  }, [answers, exam, started, autosaveKey]);

  // Load group members (for share-marks list) when in assignment mode
  useEffect(() => {
    if (!isAssignment || !student) return;
    (async () => {
      // Pata WANAFUNZI WOTE wenye semina + group sawa moja kwa moja kutoka students table.
      const { data: stu } = await supabase
        .from("students")
        .select("id, reg_no, full_name, semina, student_group, phone")
        .eq("semina", student.semina)
        .eq("student_group", student.student_group)
        .order("full_name")
        .range(0, 49999);
      const merged = ((stu as any[]) || []).map((s) => ({
        student_id: s.id,
        reg_no: s.reg_no,
        full_name: s.full_name,
        semina: s.semina,
        student_group: s.student_group,
        phone: s.phone || "",
      }));
      if (!merged.find((m) => m.student_id === student.id)) {
        merged.unshift({
          student_id: student.id,
          reg_no: student.reg_no,
          full_name: student.full_name,
          semina: student.semina,
          student_group: student.student_group,
          phone: student.phone || "",
        });
      }
      setGroupMembers(merged);
      // AUTO: tick wote — hamna haja ya mtumiaji kutiki tena.
      setSelectedShareIds(new Set(merged.map((m) => m.student_id)));
    })();
  }, [isAssignment, student, examId]);

  // Tafuta mwanafunzi aliyesahaulika (kwa reg_no au jina) kuongeza kwenye list ya share-marks.
  useEffect(() => {
    if (!isAssignment || !student) return;
    const term = forgottenQ.trim();
    if (term.length < 2) {
      setForgottenResults([]);
      return;
    }
    let cancelled = false;
    setSearchingForgotten(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("students")
        .select("id, reg_no, full_name, semina, student_group, phone")
        .eq("semina", student.semina)
        .or(`reg_no.ilike.%${term}%,full_name.ilike.%${term}%`)
        .limit(8);
      if (cancelled) return;
      const existingIds = new Set(groupMembers.map((m) => m.student_id));
      setForgottenResults(((data as any[]) || []).filter((s) => !existingIds.has(s.id)));
      setSearchingForgotten(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [forgottenQ, isAssignment, student, groupMembers]);

  const addForgotten = (s: any) => {
    const member = {
      student_id: s.id,
      reg_no: s.reg_no,
      full_name: s.full_name,
      semina: s.semina,
      student_group: s.student_group,
      phone: s.phone || "",
    };
    setGroupMembers((prev) => (prev.find((m) => m.student_id === s.id) ? prev : [...prev, member]));
    setSelectedShareIds((prev) => {
      const n = new Set(prev);
      n.add(s.id);
      return n;
    });
    setForgottenQ("");
    setForgottenResults([]);
    toast.success(`${s.full_name} ameongezwa`);
  };

  // Zima copy/paste/right-click/select wakati mtihani unaendelea
  useEffect(() => {
    if (!started) return;
    const block = (e: Event) => {
      e.preventDefault();
      return false;
    };
    const keyBlock = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && ["c", "v", "x", "a", "p", "s", "u"].includes(k)) {
        e.preventDefault();
        toast.error("Copy/Paste hairuhusiwi kwenye mtihani");
      }
      if (k === "f12") e.preventDefault();
    };
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", block);
    document.addEventListener("contextmenu", block);
    document.addEventListener("selectstart", block);
    document.addEventListener("keydown", keyBlock);
    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("selectstart", block);
      document.removeEventListener("keydown", keyBlock);
    };
  }, [started]);

  // Fullscreen imetolewa kwa ombi la mtumiaji — mfumo si fullscreen tena.

  const beginExam = async () => {
    // Zuia kufanya mtihani mara mbili (kwa reg_no AU full_name)
    try {
      const { data: prev } = await supabase
        .from("submissions")
        .select("id, reg_no")
        .eq("exam_id", examId)
        .or(`reg_no.eq.${student.reg_no},student_id.eq.${student.id}`)
        .not("submitted_at", "is", null)
        .limit(1);
      if (prev && prev.length > 0) {
        toast.error("Tayari umeshafanya mtihani huu. Hauruhusiwi kurudia.");
        nav({ to: "/results" });
        return;
      }
      // Pia angalia kwa jina kamili (kuzuia mtu mwingine kutumia reg tofauti lakini jina lile lile)
      const { data: sameName } = await supabase
        .from("students")
        .select("id")
        .ilike("full_name", student.full_name)
        .neq("id", student.id);
      if (sameName && sameName.length > 0) {
        const ids = sameName.map((x: any) => x.id);
        const { data: prevByName } = await supabase
          .from("submissions")
          .select("id")
          .eq("exam_id", examId)
          .in("student_id", ids)
          .not("submitted_at", "is", null)
          .limit(1);
        if (prevByName && prevByName.length > 0) {
          toast.error("Mtihani huu umeshafanywa kwa jina lako. Wasiliana na admin.");
          nav({ to: "/results" });
          return;
        }
      }
    } catch {}

    if (exam.require_gps) {
      try {
        const pos = await new Promise<GeolocationPosition>((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000 }),
        );
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      } catch {
        toast.error("Lazima uruhusu GPS kuendelea");
        return;
      }
    }
    if (exam.require_camera || exam.require_audio) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: exam.require_camera,
          audio: exam.require_audio,
        });
        streamRef.current = stream;
        if (videoRef.current && exam.require_camera) videoRef.current.srcObject = stream;
        setCamOk(exam.require_camera);
        setAudioOk(exam.require_audio);
      } catch {
        toast.error("Lazima uruhusu kamera/sauti kuendelea");
        return;
      }
    }
    startedAtRef.current = new Date();
    setStarted(true);
  };

  useEffect(() => {
    if (!started) return;
    const t = setInterval(
      () =>
        setTimeLeft((s) => {
          if (s <= 1) {
            clearInterval(t);
            doSubmit();
            return 0;
          }
          return s - 1;
        }),
      1000,
    );
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const setAns = (qid: string, v: any) => setAnswers((a) => ({ ...a, [qid]: v }));

  const doSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    if (exam.require_signature && (!sigRef.current || sigRef.current.isEmpty())) {
      toast.error("Lazima usaini kabla ya kutuma");
      setSubmitting(false);
      return;
    }
    // Swali tupu = sifuri (hakuna kujazwa na AI)
    const filledAnswers: Record<string, any> = { ...answers };
    const aiAutoFilled: Record<string, string> = {};

    let totalScore = 0;
    let maxScore = 0;
    let autoScore = 0;
    let aiScore = 0;
    const feedback: Record<string, any> = {};
    const fmt = (v: any) =>
      v == null
        ? ""
        : typeof v === "object"
          ? Object.entries(v)
              .map(([k, x]) => `${k} → ${x}`)
              .join("; ")
          : String(v);
    await Promise.all(
      questions.map(async (q: any) => {
        maxScore += Number(q.points);
        const ans = filledAnswers[q.id];
        if (
          q.question_type === "true_false" ||
          q.question_type === "multiple_choice" ||
          q.question_type === "matching"
        ) {
          let ratio = 0;
          if (q.question_type === "matching") {
            const correct = (q.correct_answer || {}) as Record<string, string>;
            const given = (ans as Record<string, string>) || {};
            const keys = Object.keys(correct);
            ratio = keys.length
              ? keys.filter((k) => given[k] === correct[k]).length / keys.length
              : 0;
          } else {
            ratio = String(ans) === String(q.correct_answer) ? 1 : 0;
          }
          autoScore += ratio * Number(q.points);
          const isCorrect = ratio === 1;
          const reason = await explainAnswer({
            question: q.body,
            correctAnswer: fmt(q.correct_answer),
            studentAnswer: fmt(ans),
            isCorrect,
          });
          feedback[q.id] = {
            score: ratio * Number(q.points),
            isCorrect,
            feedback: reason,
            points: Number(q.points),
          };
        } else if (q.question_type === "short_answer") {
          try {
            const rawAns = typeof ans === "string" ? ans.replace(/<[^>]+>/g, "").trim() : "";
            if (!rawAns) {
              feedback[q.id] = {
                score: 0,
                isCorrect: false,
                feedback: "❌ Hakuna jibu — alama 0.",
                points: Number(q.points),
              };
              return;
            }
            let referenceAnswer = String(q.correct_answer || "").trim();
            if (!referenceAnswer) {
              try {
                const { data } = await supabase.functions.invoke("ai-answer", {
                  body: { question: q.body, context: exam.title },
                });
                if (data?.answer) referenceAnswer = String(data.answer);
              } catch {
                /* ignore */
              }
            }
            const r = await grade({
              question: q.body,
              correctAnswer: referenceAnswer,
              studentAnswer: String(ans || ""),
              points: Number(q.points),
              concepts: Array.isArray(q.concepts) ? (q.concepts as string[]) : undefined,
            });
            aiScore += r.score;
            feedback[q.id] = { ...r, points: Number(q.points), aiAutoFilled: !!aiAutoFilled[q.id] };
          } catch {
            feedback[q.id] = { score: 0, feedback: "AI imeshindwa", points: Number(q.points) };
          }
        }
      }),
    );
    totalScore = autoScore + aiScore;
    let sigData: string | null = null;
    if (sigRef.current && !sigRef.current.isEmpty()) {
      sigData = sigRef.current.toDataURL("image/png");
    }
    // In group-assignment mode: ONLY ticked members share marks.
    // Each ticked member gets the FULL score (e.g. 10 -> each receives 10).
    let memberRows: any[] = [
      { student_id: student.id, reg_no: student.reg_no, full_name: student.full_name },
    ];
    if (isAssignment) {
      const picked = groupMembers.filter((m) => selectedShareIds.has(m.student_id));
      if (picked.length === 0) {
        toast.error("Tick angalau mwanachama mmoja wa kushare marks");
        setSubmitting(false);
        return;
      }
      memberRows = picked;
    }
    const shareCount = memberRows.length;
    const perMember = totalScore; // FULL score for each ticked member

    const rows = memberRows.map((m) => ({
      exam_id: examId,
      student_id: m.student_id,
      reg_no: m.reg_no,
      answers: filledAnswers,
      ai_feedback: {
        ...feedback,
        _group: {
          share_count: shareCount,
          full_score: totalScore,
          per_member: perMember,
          submitted_by: student.full_name,
          members: memberRows.map((x) => ({
            name: x.full_name,
            reg: x.reg_no,
            phone: x.phone || "",
          })),
        },
      },
      score: perMember,
      max_score: maxScore,
      auto_score: autoScore,
      ai_score: aiScore,
      ai_confirmed: true,
      signature_data: sigData,
      gps_lat: gps.lat,
      gps_lng: gps.lng,
      device_id: getDeviceId(),
      started_at: startedAtRef.current.toISOString(),
      submitted_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("submissions")
      .upsert(rows, { onConflict: "exam_id,student_id" });
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    try {
      localStorage.removeItem(autosaveKey);
    } catch {}
    if (isAssignment && shareCount > 1) {
      toast.success(
        `Marks ${totalScore.toFixed(1)} zimeshare kwa wanachama ${shareCount} (kila mmoja: ${perMember})`,
      );
    } else {
      toast.success("Majibu yamewasilishwa!");
    }
    nav({ to: "/results" });
  };

  // Download helpers — Word (.doc as HTML) and PDF (print). ANSWERS ONLY (no questions).
  const buildAnswersHtml = () => {
    const css = `@page{size:A4;margin:18mm}body{font-family:'Times New Roman',serif;line-height:1.6;color:#111;margin:0}h1{font-size:20px;margin:0 0 6px}h2{font-size:15px;color:#0d9488;margin-top:14px}.cover{page-break-after:always;text-align:center}.cover .uni{font-size:24px;font-weight:bold;letter-spacing:1px;margin-bottom:8px}.cover .logo{display:block;margin:6px auto 10px;width:130px;height:auto}.cover .sub{font-size:13px;color:#555;margin-bottom:18px}.cover .row{font-size:14px;text-align:left;margin:6px 0}.cover .row b{display:inline-block;min-width:170px}.cover .qbox{margin-top:14px;padding:10px;border:1px solid #0d9488;border-radius:6px;background:#f0fdfa;text-align:left;font-size:13px}.members{margin:14px 0;padding:8px;border:1px solid #0d9488;border-radius:6px;text-align:left}.members table{width:100%;border-collapse:collapse;font-size:12px}.members th,.members td{border:1px solid #99f6e4;padding:4px 6px;text-align:left}.ans{margin:14px 0;padding:14px;background:#fff;border-left:4px solid #0d9488;border-radius:4px;page-break-inside:avoid}.ans h2,.ans h3{color:#0d9488}.ans blockquote{border-left:3px solid #0d9488;padding-left:8px;color:#555;font-style:italic}.qn-label{font-size:12px;color:#0d9488;font-weight:bold;margin-bottom:4px}.qn-text{font-size:13px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:4px;padding:6px 8px;margin-bottom:8px;color:#111}`;
    const logoUrl = `${window.location.origin}/media/mum-logo.png`;
    const sharers: any[] = isAssignment
      ? groupMembers.filter((m) => selectedShareIds.has(m.student_id))
      : [{ full_name: student.full_name, reg_no: student.reg_no, phone: student.phone || "" }];
    const memberRowsHtml = sharers
      .map(
        (m: any, i: number) =>
          `<tr><td>${i + 1}</td><td>${m.full_name}</td><td>${m.reg_no}</td><td>${m.phone || "-"}</td></tr>`,
      )
      .join("");
    const membersBlock = `<div class="members"><b>NAME OF STUDENTS (${sharers.length}):</b><table><thead><tr><th>#</th><th>Jina</th><th>Reg</th><th>Simu</th></tr></thead><tbody>${memberRowsHtml}</tbody></table></div>`;
    const answeredQuestions = questions.filter((q: any) => {
      const a = answers[q.id];
      return a != null && !(typeof a === "string" && a.trim() === "");
    });
    const chosenList = answeredQuestions.length ? answeredQuestions : questions;
    const questionsListHtml = chosenList
      .map(
        (q: any, i: number) =>
          `<div style="margin:4px 0"><b>QN${i + 1}.</b> ${q.question_text || q.prompt || ""}</div>`,
      )
      .join("");
    const cover = `<div class="cover">
      <div class="uni">MUSLIM UNIVERSITY OF MOROGORO</div>
      <img class="logo" src="${logoUrl}" alt="MUM Logo" />
      <div class="sub">READ IN THE NAME OF ALLAH</div>
      <div class="row"><b>NAME OF LECTURER:</b> MR. JIBA</div>
      <div class="row"><b>COURSE NAME:</b> INTRODUCTION TO QUR'AN AND HADITH STUDIES</div>
      <div class="row"><b>COURSE CODE:</b> IS 120</div>
      <div class="row"><b>ASSIGNMENT:</b> ${exam.title}</div>
      <div class="row"><b>DATE:</b> ${new Date().toLocaleDateString("sw-TZ")}</div>
      ${membersBlock}
      <div class="qbox"><b>MASWALI YALIYOCHAGULIWA:</b>${questionsListHtml || "<div>(angalia maelekezo)</div>"}</div>
    </div>`;
    const items = chosenList
      .map((q: any, i: number) => {
        const a = answers[q.id];
        let ansHtml = "<em>(hakuna jibu)</em>";
        if (q.question_type === "short_answer" && typeof a === "string") ansHtml = a || ansHtml;
        else if (a != null) ansHtml = String(typeof a === "object" ? JSON.stringify(a) : a);
        const qText = q.question_text || q.prompt || "";
        return `<div class="ans"><div class="qn-label">QN${i + 1}</div><div class="qn-text">${qText}</div><div class="qn-label">JIBU</div>${ansHtml}</div>`;
      })
      .join("");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${exam.title}</title><style>${css}</style></head><body>${cover}<div><h1>${exam.title}</h1>${items}</div></body></html>`;
  };

  const downloadWord = () => {
    const html = buildAnswersHtml();
    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exam.title.replace(/[^a-z0-9]+/gi, "_")}_${student.reg_no}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    toast.success("Word imepakuliwa");
  };

  const downloadPdf = () => {
    const html = buildAnswersHtml();
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Ruhusu pop-up kwa PDF");
      return;
    }
    w.document.write(
      html + `<script>window.onload=()=>{setTimeout(()=>window.print(),300)}<\/script>`,
    );
    w.document.close();
    setDownloaded(true);
    toast.success("Tumia 'Save as PDF' kwenye dirisha la print");
  };

  if (!exam || !student)
    return <div className="min-h-screen flex items-center justify-center">Inapakia...</div>;

  if (!started) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="container mx-auto px-4 py-8 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle>{exam.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>{exam.description}</p>
              <div className="text-sm space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Muda: {exam.duration_minutes} dakika
                </div>
                <div className="text-amber-600 text-xs">
                  ⚠️ Copy, Paste na Right-click vimezuiwa wakati wa mtihani.
                </div>
                {exam.require_camera && (
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4" /> Kamera itaruhusiwa
                  </div>
                )}
                {exam.require_gps && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" /> GPS itaruhusiwa
                  </div>
                )}
                {exam.require_audio && (
                  <div className="flex items-center gap-2">
                    <Mic className="h-4 w-4" /> Sauti itaruhusiwa
                  </div>
                )}
              </div>
              <Button onClick={beginExam} className="w-full">
                Anza Mtihani
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-background select-none"
      style={{ userSelect: "none" }}
    >
      <div className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-2 flex justify-between items-center shadow">
        <span className="font-bold truncate">{exam.title}</span>
        <span className="font-mono text-lg flex items-center gap-1">
          <Clock className="h-4 w-4" />
          {mm}:{ss}
        </span>
      </div>
      {camOk && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="fixed bottom-4 right-4 w-32 h-24 rounded border-2 border-primary z-50 bg-black"
        />
      )}
      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-4">
        {isAssignment && (
          <div className="rounded-xl border-2 border-secondary/50 bg-gradient-to-br from-secondary/10 to-primary/5 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-secondary-foreground/80">
              📚 Assignment ya Group
            </div>
            <h2 className="text-lg font-bold mt-1">
              Andika kazi yako kwa undani kwenye eneo kubwa hapa chini.
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Tumia rich text format (bold, italic, orodha, vichwa). Maandishi yako yataonekana wazi
              wakati unaendelea kuandika.
            </p>
          </div>
        )}
        {isAssignment && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Wanachama wa Group ({groupMembers.length}
                )
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">
                <b>Automatic:</b> wanachama <u>wote</u> waliopo kwenye group wamejumuishwa moja kwa
                moja na watapata marks kamili — hamna haja ya kutiki. Hata waliobadilisha group hivi
                karibuni wanaonekana hapa. Unaweza kuondoa tu kama unataka.
              </p>
              {groupMembers.length === 0 && (
                <p className="text-xs text-amber-600">
                  Hakuna wanachama wengine wamejiunga bado — wewe tu utapata marks.
                </p>
              )}
              <div className="grid sm:grid-cols-2 gap-2">
                {groupMembers.map((m) => {
                  const checked = selectedShareIds.has(m.student_id);
                  return (
                    <label
                      key={m.student_id}
                      className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition ${checked ? "border-primary bg-primary/5" : "border-border"}`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setSelectedShareIds((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(m.student_id);
                            else next.delete(m.student_id);
                            return next;
                          });
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {m.full_name}
                          {m.student_id === student.id && (
                            <span className="ml-1 text-[10px] text-primary">(wewe)</span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {m.reg_no}
                        </div>
                        {m.phone && (
                          <a
                            href={`tel:${m.phone}`}
                            className="text-[11px] text-primary hover:underline"
                          >
                            📞 {m.phone}
                          </a>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="text-xs font-semibold text-primary">
                Watapata marks: {selectedShareIds.size} / {groupMembers.length}
              </div>

              <div className="pt-3 border-t mt-2 space-y-2">
                <div className="text-xs font-bold flex items-center gap-1">
                  ➕ Ongeza mwanafunzi aliyesahaulika
                </div>
                <Input
                  value={forgottenQ}
                  onChange={(e) => setForgottenQ(e.target.value)}
                  placeholder="Andika reg no AU jina (semina hiyo hiyo)…"
                  className="h-9"
                />
                {searchingForgotten && (
                  <div className="text-[11px] text-muted-foreground">Inatafuta…</div>
                )}
                {forgottenResults.length > 0 && (
                  <div className="border rounded-lg divide-y max-h-48 overflow-auto">
                    {forgottenResults.map((s) => (
                      <button
                        type="button"
                        key={s.id}
                        onClick={() => addForgotten(s)}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-xs flex items-center justify-between gap-2"
                      >
                        <span className="min-w-0">
                          <span className="font-semibold block truncate">{s.full_name}</span>
                          <span className="text-muted-foreground font-mono">
                            {s.reg_no} • {s.student_group}
                          </span>
                        </span>
                        <span className="text-primary font-bold shrink-0">+ Ongeza</span>
                      </button>
                    ))}
                  </div>
                )}
                {forgottenQ.trim().length >= 2 &&
                  !searchingForgotten &&
                  forgottenResults.length === 0 && (
                    <div className="text-[11px] text-muted-foreground">Hakuna matokeo mapya.</div>
                  )}
              </div>
            </CardContent>
          </Card>
        )}
        {questions.map((q, i) => (
          <Card key={q.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {isAssignment ? "Swali la Assignment" : `Swali ${i + 1}`} ({q.points} alama)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={isAssignment ? "mb-4 font-semibold text-base" : "mb-3 font-medium"}>
                {q.body}
              </p>
              {q.question_type === "true_false" && (
                <RadioGroup value={answers[q.id] || ""} onValueChange={(v) => setAns(q.id, v)}>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="true" id={q.id + "t"} />
                    <Label htmlFor={q.id + "t"}>Kweli</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="false" id={q.id + "f"} />
                    <Label htmlFor={q.id + "f"}>Sikweli</Label>
                  </div>
                </RadioGroup>
              )}
              {q.question_type === "multiple_choice" && (
                <RadioGroup value={answers[q.id] || ""} onValueChange={(v) => setAns(q.id, v)}>
                  {((q.options as string[]) || []).map((opt, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <RadioGroupItem value={opt} id={q.id + j} />
                      <Label htmlFor={q.id + j}>{opt}</Label>
                    </div>
                  ))}
                </RadioGroup>
              )}
              {q.question_type === "short_answer" &&
                (isAssignment ? (
                  <RichTextEditor
                    value={answers[q.id] || ""}
                    onChange={(html) => setAns(q.id, html)}
                    placeholder="Andika kazi yako ya assignment hapa kwa undani…"
                    minHeight={400}
                  />
                ) : (
                  <Textarea
                    value={answers[q.id] || ""}
                    onChange={(e) => setAns(q.id, e.target.value)}
                    onPaste={(e) => {
                      e.preventDefault();
                      toast.error("Paste hairuhusiwi");
                    }}
                    onCopy={(e) => e.preventDefault()}
                    placeholder="Andika jibu lako..."
                    style={{ userSelect: "text" }}
                  />
                ))}
              {q.question_type === "matching" && (
                <div className="space-y-2">
                  {Object.keys((q.correct_answer as Record<string, string>) || {}).map((key) => {
                    const values = Object.values(
                      (q.correct_answer as Record<string, string>) || {},
                    );
                    return (
                      <div key={key} className="grid grid-cols-2 gap-3 items-center">
                        <span className="font-medium">{key}</span>
                        <Select
                          value={(answers[q.id] || {})[key] || ""}
                          onValueChange={(v) =>
                            setAns(q.id, { ...(answers[q.id] || {}), [key]: v })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Chagua" />
                          </SelectTrigger>
                          <SelectContent>
                            {values.map((v) => (
                              <SelectItem key={v} value={v}>
                                {v}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {exam.require_signature && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Sahihi yako</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="border-2 border-dashed rounded bg-white">
                <SignatureCanvas
                  ref={sigRef}
                  canvasProps={{ width: 500, height: 150, className: "w-full" }}
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => sigRef.current?.clear()}
              >
                Futa Sahihi
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setPreviewOpen(true)}
            className="flex-1"
            size="lg"
          >
            <Eye className="h-4 w-4 mr-2" /> Hakiki Majibu Kabla
          </Button>
          <Button
            onClick={() => {
              if (isAssignment && !downloaded) {
                toast.error("Pakua kwanza Word au PDF kabla ya kuwasilisha");
                setPreviewOpen(true);
                return;
              }
              doSubmit();
            }}
            disabled={submitting}
            className="flex-1"
            size="lg"
          >
            {submitting ? "Inatuma..." : "Tuma Majibu"}
          </Button>
        </div>

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-primary" /> Hakiki Majibu Yako
              </DialogTitle>
            </DialogHeader>
            <div className="text-xs text-muted-foreground mb-2">
              <b>{student.full_name}</b> • {student.reg_no} • {student.semina} •{" "}
              {student.student_group}
              {(student.course || student.study_year || student.academic_year) && (
                <span className="block mt-0.5">
                  {student.course}
                  {formatAcademicSummary(student) && (
                    <>
                      {student.course ? " • " : ""}
                      {formatAcademicSummary(student)}
                    </>
                  )}
                </span>
              )}
            </div>
            <div className="space-y-3">
              {questions.map((q, i) => {
                const a = answers[q.id];
                return (
                  <div key={q.id} className="rounded-lg border p-3 bg-muted/20">
                    <div className="text-[11px] font-bold text-primary mb-1">
                      {isAssignment ? "Assignment" : `Swali ${i + 1}`} • {q.points} alama
                    </div>
                    <div className="text-sm font-semibold mb-2">{q.body}</div>
                    <div className="text-sm bg-card rounded p-2 border-l-4 border-primary prose prose-sm dark:prose-invert max-w-none">
                      {q.question_type === "short_answer" && typeof a === "string" ? (
                        a ? (
                          <div dangerouslySetInnerHTML={{ __html: a }} />
                        ) : (
                          <em className="text-muted-foreground">(hakuna jibu)</em>
                        )
                      ) : a != null ? (
                        <span>{String(typeof a === "object" ? JSON.stringify(a) : a)}</span>
                      ) : (
                        <em className="text-muted-foreground">(hakuna jibu)</em>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
              <Button type="button" variant="outline" onClick={downloadWord} className="flex-1">
                <FileDown className="h-4 w-4 mr-2" /> Pakua Word (.doc)
              </Button>
              <Button type="button" variant="outline" onClick={downloadPdf} className="flex-1">
                <Printer className="h-4 w-4 mr-2" /> Pakua PDF
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setPreviewOpen(false);
                  doSubmit();
                }}
                disabled={submitting || (isAssignment && !downloaded)}
                className="flex-1"
              >
                {isAssignment && !downloaded ? "Pakua kwanza" : "Wasilisha Sasa"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
