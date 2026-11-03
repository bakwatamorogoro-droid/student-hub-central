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
import { Camera, MapPin, Mic, Clock, Eye, FileDown, Printer, MonitorSmartphone } from "lucide-react";
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
import { areaMessage, checkArea, type AreaVerdict } from "@/lib/geo";
import { ExamAnswerField } from "@/components/ExamAnswerField";
import { answerRatio, isAutoGraded } from "@/lib/examQuestions";
import { retryRowsWithoutMissingColumns } from "@/lib/schema-retry";
import {
  assessGpsSamples,
  enterFullscreen,
  exitFullscreen,
  gpsFlagLabel,
  isFullscreen,
  isFullscreenSupported,
  judgeFrame,
  monitorCamera,
  onFullscreenChange,
  type CameraVerdict,
  type GpsSample,
} from "@/lib/proctoring";
import { storageGet, storageRemove, storageSet } from "@/lib/safe-storage";
import { touchSubmission } from "@/lib/liveExamsApi";
import {
  ExamStepper,
  ExamProgress,
  QuestionPalette,
  type ExamStep,
} from "@/components/ExamStepper";

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
  const [area, setArea] = useState<{
    lat: number | null;
    lng: number | null;
    radiusM: number;
  } | null>(null);
  const [areaVerdict, setAreaVerdict] = useState<AreaVerdict | null>(null);
  const [examGpsRequired, setExamGpsRequired] = useState(true);
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
  // Integrity state. `fsLost` counts how many times the student left fullscreen;
  // it is reported to the teacher rather than blocking the exam, because a phone
  // call or a notification legitimately drops fullscreen for a moment.
  const [fsLost, setFsLost] = useState(0);
  const [camVerdict, setCamVerdict] = useState<CameraVerdict | null>(null);
  const [gpsFlags, setGpsFlags] = useState<string[]>([]);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [gpsLive, setGpsLive] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      const reg = storageGet("student_reg");
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

      // Eneo la chuo: kituo kimoja, umbali wa mtihani. Safu za eneo la mtihani
      // huenda hazipo bado kwenye hifadhidata, kwa hivyo zikikataliwa tunarudi kwenye
      // kituo pekee (kinachojulikana kuwepo) na umbali wa kawaida. Mtihani hauvunjiki,
      // na geofence inaanza kufanya kazi mara kituo kinapowekwa.
      const loadArea = async () => {
        const full = await supabase
          .from("app_settings")
          .select("attendance_lat,attendance_lng,exam_radius_m,exam_gps_required")
          .eq("id", 1)
          .maybeSingle();
        if (!full.error && full.data) return full.data as Record<string, unknown>;
        const lean = await supabase
          .from("app_settings")
          .select("attendance_lat,attendance_lng")
          .eq("id", 1)
          .maybeSingle();
        return (lean.data as Record<string, unknown> | null) ?? null;
      };

      try {
        const row = await loadArea();
        if (row) {
          setArea({
            lat: (row.attendance_lat as number | null) ?? null,
            lng: (row.attendance_lng as number | null) ?? null,
            radiusM: Number(row.exam_radius_m) || 300,
          });
          // Only an explicit `false` turns the fence off. `exam_gps_required`
          // arrives with a migration production has not applied, so the key is
          // simply absent there — treating that as "off" is what let a student
          // start an exam from anywhere. Absent means the safe default.
          setExamGpsRequired(row.exam_gps_required !== false);
        }
      } catch {}
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
          const saved = storageGet(autosaveKey);
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
      storageSet(autosaveKey, JSON.stringify(answers));
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

  // Fullscreen: entered when the exam starts and re-entered when the student comes
  // back to the tab. Every exit is counted, and the count travels with the
  // submission so the teacher can see it. iPhone Safari will not grant fullscreen
  // to a normal page, so a refusal is not treated as a failure.
  useEffect(() => {
    if (!started) return;
    let wasFull = isFullscreen();
    void enterFullscreen();
    const off = onFullscreenChange(() => {
      const now = isFullscreen();
      if (wasFull && !now) setFsLost((n) => n + 1);
      wasFull = now;
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void enterFullscreen();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      off();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [started]);

  // Attach the live stream to the preview once the element exists. The start
  // handler cannot do this: it runs before the <video> is rendered, so the ref is
  // still null there and the preview stayed black for the whole exam.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !streamRef.current) return;
    if (el.srcObject !== streamRef.current) el.srcObject = streamRef.current;
    void el.play().catch(() => {});
  }, [camOk, started]);

  // Camera presence: a covered lens and a scene that never changes are the two
  // signals worth reporting. The verdict is shown to the student immediately so
  // it reads as a reminder, not a trap.
  useEffect(() => {
    if (!started || !camOk || !streamRef.current) return;
    const stop = monitorCamera(streamRef.current, {
      intervalMs: 5000,
      window: 2,
      onVerdict: (verdict) => setCamVerdict(verdict),
    });
    return stop;
  }, [started, camOk]);

  // GPS, kept fresh: one fix at the start proves where the student was then, not
  // where they are now. Samples accumulate so the teacher can see the spread.
  useEffect(() => {
    if (!started) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const samples: GpsSample[] = [];
    const read = () =>
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          samples.push({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? 999,
            at: Date.now(),
          });
          if (samples.length > 8) samples.shift();
          setGpsLive({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy ?? 0,
          });
          const assessment = assessGpsSamples(samples);
          if (assessment) setGpsFlags(assessment.flags.map(gpsFlagLabel));
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
      );
    read();
    const timer = setInterval(read, 45000);
    return () => clearInterval(timer);
  }, [started]);

  // Heartbeat: tells the teacher's live panel this browser is still on the page.
  useEffect(() => {
    if (!started || !submissionId) return;
    void touchSubmission(submissionId);
    const timer = setInterval(() => void touchSubmission(submissionId), 30000);
    return () => clearInterval(timer);
  }, [started, submissionId]);

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

    // GPS: chukua mahali, kisha linganisha na eneo la mwalimu. Kama mwanafunzi
    // yuko nje ya umbali, mtihani hauanzi — ndiyo kazi ya "Eneo langu".
    if (exam.require_gps || (area && area.lat != null)) {
      // Three independent fixes, not one. A single reading can be a cached or a
      // spoofed value; a real receiver jitters by a metre or two between reads,
      // so the spread and the reported accuracy tell the two apart. See
      // `assessGpsSamples`.
      const samples: GpsSample[] = [];
      const takeFix = (highAccuracy: boolean) =>
        new Promise<GpsSample | null>((resolve) => {
          if (typeof navigator === "undefined" || !navigator.geolocation) {
            resolve(null);
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (pos) =>
              resolve({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy ?? 999,
                at: Date.now(),
              }),
            () => resolve(null),
            { enableHighAccuracy: highAccuracy, timeout: 15000, maximumAge: 0 },
          );
        });

      // Three fixes at once, not one after another: the old 700 ms gap added a
      // second and a half to every start and told us nothing extra.
      samples.push(
        ...(await Promise.all([takeFix(true), takeFix(true), takeFix(true)])).filter(
          (x): x is GpsSample => !!x,
        ),
      );
      // A classroom often yields nothing from the GPS chip but a usable network
      // fix. Falling back keeps a covered room examinable; the reading is coarser
      // and its accuracy says so.
      if (samples.length === 0) {
        samples.push(
          ...(await Promise.all([takeFix(false), takeFix(false)])).filter(
            (x): x is GpsSample => !!x,
          ),
        );
      }

      const assessment = assessGpsSamples(samples);
      if (assessment) {
        setGps({ lat: assessment.best.lat, lng: assessment.best.lng });
        setGpsLive({
          lat: assessment.best.lat,
          lng: assessment.best.lng,
          accuracy: assessment.best.accuracy,
        });
        setGpsFlags(assessment.flags.map(gpsFlagLabel));
      }

      if (!assessment || !assessment.usable) {
        // The fence only stops a student when there is a centre to measure from AND
        // the teacher asked for GPS. Otherwise a missing fix is a flag, not a locked
        // door: refusing here is how "washa mtihani" became a dead button on a phone
        // whose location was switched off.
        if (examGpsRequired && area && area.lat != null) {
          setAreaVerdict({ status: "missing_fix" });
          toast.error(
            assessment?.flags.includes("too_vague")
              ? "GPS yako ni hafifu mno. Toka nje kidogo au washa GPS sahihi."
              : "Ruhusu GPS (location) ili mfumo upime eneo lako, kisha ujaribu tena.",
          );
          return;
        }
        setGpsFlags((f) =>
          f.includes("hakuna kipimo cha GPS") ? f : [...f, "hakuna kipimo cha GPS"],
        );
      } else if (area && area.lat != null && area.lng != null) {
        const verdict = checkArea(area, {
          lat: assessment.best.lat,
          lng: assessment.best.lng,
          accuracy: assessment.best.accuracy,
        });
        setAreaVerdict(verdict);
        if (verdict.status === "outside") {
          toast.error(areaMessage(verdict));
          return;
        }
        if (verdict.status === "near_edge") {
          setGpsFlags((f) => (f.includes("mpakani wa eneo") ? f : [...f, "mpakani wa eneo"]));
        }
      }
    }
    if (exam.require_camera || exam.require_audio) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: exam.require_camera,
          audio: exam.require_audio,
        });
        streamRef.current = stream;
        setCamOk(exam.require_camera);
        setAudioOk(exam.require_audio);
      } catch (err) {
        // Name the permission that failed and what to do about it. The old single
        // sentence left a student with a blocked camera and a permanently dead start
        // button, with no idea which of the two to unblock.
        const name = (err as { name?: string })?.name ?? "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          toast.error(
            exam.require_camera && exam.require_audio
              ? "Kamera na sauti zimezuiwa. Fungua lock ya kizindua (address bar) na ruhusu Kamera na Maikrofoni, kisha ujaribu tena."
              : exam.require_camera
                ? "Kamera imezuiwa. Fungua lock ya kizindua na ruhusu Kamera, kisha ujaribu tena."
                : "Maikrofoni imezuiwa. Fungua lock ya kizindua na ruhusu Maikrofoni, kisha ujaribu tena.",
          );
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          toast.error("Hakuna kamera/maikrofoni iliyopatikana kwenye kifaa hiki.");
        } else if (name === "NotReadableError") {
          toast.error("Kamera inatumiwa na app nyingine. Funga app nyingine, kisha ujaribu tena.");
        } else {
          toast.error("Imeshindwa kufungua kamera/sauti. Jaribu tena.");
        }
        return;
      }
    }
    startedAtRef.current = new Date();

    // Create the row now, not at submit. The teacher's live panel reads
    // "started but not submitted", so without this the student stays invisible
    // until the moment they finish. A failure here is ignored: losing live
    // tracking must never stop an exam.
    try {
      const { data: created } = await supabase
        .from("submissions")
        .upsert(
          {
            exam_id: examId,
            student_id: student.id,
            reg_no: student.reg_no,
            answers: {},
            started_at: startedAtRef.current.toISOString(),
            submitted_at: null,
            device_id: getDeviceId(),
          },
          { onConflict: "exam_id,student_id" },
        )
        .select("id")
        .maybeSingle();
      if (created?.id) setSubmissionId(created.id as string);
    } catch {
      /* live tracking is optional */
    }

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
        if (isAutoGraded(q.question_type)) {
          // One helper decides partial credit for every machine-marked type, so
          // the builder, the student's page and the marker cannot drift apart.
          const ratio = answerRatio(q, ans);
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
      gps_distance_m: areaVerdict && "distanceM" in areaVerdict ? areaVerdict.distanceM : null,
      gps_radius_m: area && area.lat != null ? area.radiusM : null,
      gps_lng: gps.lng,
      device_id: getDeviceId(),
      started_at: startedAtRef.current.toISOString(),
      submitted_at: new Date().toISOString(),
      // Integrity signals travel with the submission, so a teacher reviewing it
      // later sees the same picture the student saw while writing.
      proctor: {
        fullscreen_exits: fsLost,
        camera: camVerdict,
        gps_flags: gpsFlags,
      },
    }));
    // The columns the geofence writes (`gps_distance_m`, `gps_radius_m`) and the
    // proctor blob come from migrations that may not have been applied to
    // production. PostgREST refuses the whole array when one is unknown, which
    // would fail *every* submission, so the unknown column is dropped and the
    // write retried. A missing distance costs the teacher one detail; a missing
    // column must never cost the student their paper.
    const { last, dropped } = await retryRowsWithoutMissingColumns(rows, (body) =>
      supabase.from("submissions").upsert(body as never, { onConflict: "exam_id,student_id" }),
    );
    const error = last.error;
    if (dropped.length) {
      console.warn("Submission saved without columns the database does not have:", dropped.join(", "));
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setSubmitting(false);
    if (error) {
      toast.error((error as Error).message);
      return;
    }
    try {
      storageRemove(autosaveKey);
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
    const steps: ExamStep[] = [
      {
        key: "identity",
        label: "Tambua mwanafunzi",
        hint: student ? `${student.full_name} · ${student.reg_no}` : "Inatafuta taarifa zako…",
        state: student ? "done" : "busy",
      },
    ];
    if (exam.require_gps || (area && area.lat != null))
      steps.push({
        key: "gps",
        label: "Ruhusu mahali (GPS)",
        hint:
          areaVerdict && areaVerdict.status !== "no_fence"
            ? areaMessage(areaVerdict)
            : "Mfumo unahitaji kujua uko darasani wakati wa mtihani.",
        state: gps.lat ? "done" : "active",
      });
    if (exam.require_camera)
      steps.push({
        key: "camera",
        label: "Ruhusu kamera",
        hint: "Kamera inasaidia kuthibitisha uko peke yako.",
        state: camOk ? "done" : "active",
      });
    if (exam.require_audio)
      steps.push({
        key: "audio",
        label: "Ruhusu sauti",
        hint: "Sauti inasaidia kuthibitisha mazingira ya mtihani.",
        state: audioOk ? "done" : "active",
      });
    steps.push({
      key: "start",
      label: "Anza mtihani",
      hint: `${exam.duration_minutes} dakika · maswali ${questions.length}`,
      state: "todo",
    });

    const blockers = steps.filter((s) => s.state !== "done" && s.key !== "start").length;

    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/10">
        <SiteHeader />
        <main className="container mx-auto max-w-3xl space-y-5 px-4 py-8">
          <div className="relative overflow-hidden rounded-3xl border-2 border-primary/25 bg-gradient-to-br from-primary/12 via-card to-secondary/15 p-6 shadow-lg">
            <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
            <div className="relative">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
                Islamic Studies Test Online
              </span>
              <h1 className="mt-3 text-2xl font-black tracking-tight md:text-3xl">{exam.title}</h1>
              {exam.description && (
                <p className="mt-1 text-sm text-muted-foreground">{exam.description}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-background/70 px-2.5 py-1.5 font-semibold">
                  <Clock className="h-3.5 w-3.5 text-primary" /> {exam.duration_minutes} dakika
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-background/70 px-2.5 py-1.5 font-semibold">
                  Maswali {questions.length}
                </span>
                {exam.require_camera && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-background/70 px-2.5 py-1.5 font-semibold">
                    <Camera className="h-3.5 w-3.5 text-primary" /> Kamera
                  </span>
                )}
                {exam.require_gps && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-background/70 px-2.5 py-1.5 font-semibold">
                    <MapPin className="h-3.5 w-3.5 text-primary" /> GPS
                  </span>
                )}
                {exam.require_audio && (
                  <span className="inline-flex items-center gap-1.5 rounded-lg border border-primary/20 bg-background/70 px-2.5 py-1.5 font-semibold">
                    <Mic className="h-3.5 w-3.5 text-primary" /> Sauti
                  </span>
                )}
              </div>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Hatua za Kuanza</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ExamStepper steps={steps} />
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700">
                ⚠️ Copy, Paste na Right-click vimezuiwa wakati wa mtihani.
              </div>
              <Button onClick={beginExam} className="w-full" size="lg">
                {blockers > 0 ? "Anza Mtihani (Ruhusu kwanza)" : "Anza Mtihani"}
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");

  const isAnswered = (a: any) => {
    if (a === undefined || a === null || a === "") return false;
    if (typeof a === "object") return Object.keys(a).length > 0;
    return true;
  };
  const answeredCount = questions.filter((q) => isAnswered(answers[q.id])).length;
  const unansweredCount = questions.length - answeredCount;

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
        <div className="fixed bottom-4 right-4 z-50 space-y-1">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className={`h-24 w-32 rounded-lg border-2 bg-black object-cover ${
              camVerdict === "covered" ? "border-destructive" : "border-primary"
            }`}
          />
          {camVerdict === "covered" && (
            <p className="max-w-[8rem] rounded bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
              Kamera imezibwa
            </p>
          )}
        </div>
      )}

      {/* Integrity strip: what the proctoring sees, in the student's own view, so
          a warning is never a surprise at the end. */}
      {started && (
        <div className="flex flex-wrap items-center justify-center gap-2 border-b border-border/60 bg-card/70 px-3 py-1.5 text-[11px]">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ${
              isFullscreenSupported() && !isFullscreen()
                ? "bg-amber-500/15 text-amber-700"
                : "bg-emerald-500/15 text-emerald-700"
            }`}
          >
            <MonitorSmartphone className="h-3 w-3" />
            {isFullscreenSupported() && !isFullscreen()
              ? "Umetoka fullscreen"
              : "Fullscreen"}
          </span>
          {fsLost > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700">
              Umetoka mara {fsLost}
            </span>
          )}
          {gpsLive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
              <MapPin className="h-3 w-3" /> ±{Math.round(gpsLive.accuracy)} m
            </span>
          )}
          {gpsFlags.map((f) => (
            <span
              key={f}
              className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700"
            >
              {f}
            </span>
          ))}
        </div>
      )}
      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-4">
        {!isAssignment && questions.length > 0 && (
          <div className="sticky top-12 z-30 space-y-3 rounded-2xl border border-primary/20 bg-card/90 p-4 backdrop-blur">
            <ExamProgress answered={answeredCount} total={questions.length} />
            <QuestionPalette
              items={questions.map((q) => ({ id: q.id, answered: isAnswered(answers[q.id]) }))}
              onJump={(id) =>
                document.getElementById(`q-${id}`)?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                })
              }
            />
          </div>
        )}
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
          <Card key={q.id} id={`q-${q.id}`} className="scroll-mt-32">
            <CardHeader>
              <CardTitle className="text-base">
                {isAssignment ? "Swali la Assignment" : `Swali ${i + 1}`} ({q.points} alama)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={isAssignment ? "mb-4 font-semibold text-base" : "mb-3 font-medium"}>
                {q.body}
              </p>
              {q.question_type === "short_answer" && isAssignment ? (
                <RichTextEditor
                  value={answers[q.id] || ""}
                  onChange={(html) => setAns(q.id, html)}
                  placeholder="Andika kazi yako ya assignment hapa kwa undani…"
                  minHeight={400}
                />
              ) : (
                <ExamAnswerField
                  question={q}
                  value={answers[q.id]}
                  onChange={(v) => setAns(q.id, v)}
                  isAssignment={isAssignment}
                />
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

        {!isAssignment && questions.length > 0 && unansweredCount > 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
            Bado hujajibu maswali <b>{unansweredCount}</b>. Unaweza kuwasilisha, lakini maswali hayo
            yatapata alama 0.
          </div>
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
