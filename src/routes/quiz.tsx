import { useEffect, useMemo, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { SiteHeader } from "@/components/SiteHeader";
import { GroupPicker, memberNames, useGroupMembers } from "@/components/GroupAssignmentPicker";
import { FilePreview, PreviewLoading } from "@/components/FilePreview";
import { StudentMatchesPicker, type Student } from "@/components/StudentMatchesPicker";
import { WizardNav, WizardProgress, type WizardStep } from "@/components/StepWizard";
import { findStudentsByQuery } from "@/lib/studentSearch";
import { storageGet, storageSet } from "@/lib/safe-storage";
import { toast } from "@/lib/toast";
import { useI18n } from "@/lib/i18n";
import { useRoster } from "@/lib/useRoster";
import { loadGroupSubmission, submitGroupAssignment } from "@/lib/groupAssignmentApi";
import {
  GROUP_FILE_ACCEPT,
  MAX_GROUP_FILE_BYTES,
  assignmentFileKind,
  canSubmit,
  formatBytes,
  groupLabel,
  previewKindFor,
  submittedMessage,
  toGroupSubmission,
  type GroupKey,
  type GroupSubmissionRow,
} from "@/lib/groupAssignmentSubmission";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Loader2,
  Lock,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/quiz")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Kazi za Kufanya — Islamic Studies Test Online" },
      {
        name: "description",
        content:
          "Kazi ya kufanya ya group: chagua semina na group, chagueni mliopresent, andika swali, pakieni kazi (PDF/Word), preview na kutuma.",
      },
      { property: "og:title", content: "Kazi za Kufanya — Islamic Studies Test Online" },
    ],
  }),
});

function Page() {
  const { t } = useI18n();
  const { roster, loading: loadingRoster } = useRoster();

  const [reg, setReg] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [matches, setMatches] = useState<Student[]>([]);
  const [checking, setChecking] = useState(false);

  const [semina, setSemina] = useState("");
  const [group, setGroup] = useState("");
  const [gender, setGender] = useState("");
  const [confirmedKey, setConfirmedKey] = useState<GroupKey | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [question, setQuestion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewed, setPreviewed] = useState(false);
  const [sending, setSending] = useState(false);
  const [existing, setExisting] = useState<GroupSubmissionRow | null>(null);
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [step, setStep] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const members = useGroupMembers(roster, confirmedKey);

  useEffect(() => {
    const saved = storageGet("student_reg");
    if (saved) setReg(saved);
  }, []);

  // A blob URL for the picked file, so the preview shows the student's own bytes
  // without a round trip. Revoked when the file changes or the page unmounts.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setPreviewed(false);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const confirmStudent = async (data: Student) => {
    setStudent(data);
    setMatches([]);
    setReg(data.reg_no);
    storageSet("student_reg", data.reg_no);
    toast.success(`Karibu, ${data.full_name}`);
  };

  const lookupStudent = async () => {
    if (!reg.trim()) return;
    setChecking(true);
    const results = await findStudentsByQuery(reg);
    setChecking(false);
    if (results.length === 0) {
      toast.error("Hakuna mwanafunzi anayelingana. Jisajili kwanza.");
      setStudent(null);
      setMatches([]);
      return;
    }
    if (results.length === 1) {
      await confirmStudent(results[0]);
      return;
    }
    setStudent(null);
    setMatches(results);
    toast.info(`Tumepata ${results.length} wanafunzi — chagua wewe ni nani.`);
  };

  // Prefill the picker from the student's own row, so the common case is two taps.
  useEffect(() => {
    if (!student) return;
    setSemina(
      (v) =>
        v ||
        String(student.semina ?? "")
          .trim()
          .toUpperCase(),
    );
    setGroup(
      (v) =>
        v ||
        String(student.student_group ?? "")
          .trim()
          .toUpperCase(),
    );
    const g = String(student.gender ?? "").toLowerCase();
    const guessed =
      g.includes("female") || g.includes("mwanamke")
        ? "Mwanamke"
        : g.includes("male") || g.includes("mwanaume")
          ? "Mwanaume"
          : "";
    setGender((v) => v || guessed);
  }, [student]);

  // Once the group is confirmed, look for work the group already sent.
  useEffect(() => {
    if (!confirmedKey) {
      setExisting(null);
      return;
    }
    let live = true;
    setCheckingExisting(true);
    loadGroupSubmission(confirmedKey)
      .then((row) => {
        if (live) setExisting(row);
      })
      .catch(() => {
        if (live) setExisting(null);
      })
      .finally(() => {
        if (live) setCheckingExisting(false);
      });
    return () => {
      live = false;
    };
  }, [confirmedKey]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmGroup = () => {
    if (!semina || !group || !gender) return;
    setConfirmedKey({ semina, group, gender });
    setSelected(new Set());
    // Confirming the group is what step 1 was for, so move straight to naming
    // who presented rather than making the student find the Next button.
    setStep(1);
  };

  const changeGroup = () => {
    setConfirmedKey(null);
    setExisting(null);
    setSelected(new Set());
    setQuestion("");
    setFile(null);
    setPreviewed(false);
    setStep(0);
  };

  const presenters = memberNames(members, selected);
  const check = canSubmit({ question, presenters, file, previewed });
  const canSend = check.ok && !!confirmedKey && !existing && !sending;

  const wizardSteps: WizardStep[] = useMemo(
    () => [
      {
        key: "group",
        title: t("ga_wizard_step1"),
        hint: confirmedKey ? `${semina} · ${group}` : t("ga_wizard_step1_hint"),
      },
      {
        key: "presenters",
        title: t("ga_wizard_step2"),
        hint: presenters.length
          ? `${presenters.length} ${t("ga_wizard_chosen")}`
          : t("ga_wizard_step2_hint"),
      },
      { key: "send", title: t("ga_wizard_step3"), hint: t("ga_wizard_step3_hint") },
    ],
    [t, confirmedKey, semina, group, presenters.length],
  );

  // Step 1 needs a confirmed group, step 2 needs at least one presenter. Step 3
  // is the send action itself, so it is never "blocked" by Next — the Send button
  // reports what is still missing instead.
  const stepBlocked = step === 0 ? !confirmedKey : step === 1 ? presenters.length === 0 : false;

  const goNext = () => {
    if (step === 0 && !confirmedKey) {
      toast.error(t("ga_confirm"));
      return;
    }
    if (step === 1 && presenters.length === 0) {
      toast.error(t("ga_need_presenter"));
      return;
    }
    setStep((s) => Math.min(s + 1, wizardSteps.length - 1));
  };
  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const send = async () => {
    if (!confirmedKey || !file) return;
    const verdict = canSubmit({ question, presenters, file, previewed });
    if (!verdict.ok) {
      toast.error(verdict.missing[0]);
      return;
    }
    setSending(true);
    const res = await submitGroupAssignment({
      key: confirmedKey,
      question,
      presenters,
      file,
      submittedBy: student
        ? { reg_no: String(student.reg_no ?? ""), full_name: String(student.full_name ?? "") }
        : null,
      studentId: student?.id ?? null,
    });
    setSending(false);
    if (!res.ok) {
      if (res.error === "already_submitted") {
        toast.error(t("ga_already"));
        setExisting(await loadGroupSubmission(confirmedKey));
      } else {
        toast.error(res.error);
      }
      return;
    }
    setExisting(res.row);
    setFile(null);
    setPreviewed(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    toast.success(t("ga_sent_title"));
  };

  const previewKind = previewKindFor(file?.name);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <SiteHeader />
      <main className="container mx-auto max-w-3xl space-y-5 px-4 py-6">
        <div className="relative overflow-hidden rounded-3xl border-2 border-primary/25 bg-gradient-to-br from-primary/12 via-card to-secondary/15 p-6 text-center shadow-lg">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <Users className="h-3 w-3" /> {t("nav_quiz")}
            </div>
            <h1 className="mt-3 bg-gradient-to-r from-primary to-secondary bg-clip-text text-3xl font-black tracking-tight text-transparent md:text-4xl">
              {t("ga_title")}
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">{t("ga_sub")}</p>
          </div>
        </div>

        {!student ? (
          <Card className="border-primary/25">
            <CardHeader>
              <CardTitle className="text-base">Anza — Weka Reg Namba yako</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Reg Namba au Jina</Label>
                <Input
                  value={reg}
                  onChange={(e) => setReg(e.target.value)}
                  placeholder="MUM2025-04-14106 au jina"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void lookupStudent();
                  }}
                />
              </div>
              <Button className="w-full font-bold" onClick={lookupStudent} disabled={checking}>
                {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {checking ? "Inatafuta..." : "Endelea"}
              </Button>
              {matches.length > 0 && (
                <StudentMatchesPicker
                  matches={matches}
                  onConfirm={confirmStudent}
                  onCancel={() => setMatches([])}
                />
              )}
              <p className="text-center text-xs text-muted-foreground">
                Hujajisajili?{" "}
                <Link to="/register" className="text-primary underline">
                  Jisajili hapa
                </Link>
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-primary/30">
              <CardContent className="flex flex-wrap items-center gap-2 p-4 text-sm">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <b>{student.full_name}</b>
                <span className="text-muted-foreground">• {student.reg_no}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 text-xs"
                  onClick={() => {
                    setStudent(null);
                    setConfirmedKey(null);
                    setExisting(null);
                  }}
                >
                  Badilisha
                </Button>
              </CardContent>
            </Card>

            {existing ? (
              <SentCard row={existing} onChangeGroup={changeGroup} />
            ) : (
              <>
                <WizardProgress
                  steps={wizardSteps}
                  current={step}
                  onJump={(i) => {
                    // Only a step already unlocked can be jumped to, and step 2
                    // needs a confirmed group behind it.
                    if (i <= step || (i === 1 && confirmedKey)) setStep(i);
                  }}
                />

                <GroupPicker
                  roster={roster}
                  loadingRoster={loadingRoster}
                  semina={semina}
                  group={group}
                  gender={gender}
                  onSemina={setSemina}
                  onGroup={setGroup}
                  onGender={setGender}
                  confirmed={!!confirmedKey}
                  onConfirm={confirmGroup}
                  members={members}
                  selected={selected}
                  onToggle={toggle}
                  readOnly={checkingExisting}
                  view={step === 0 ? "pick" : "members"}
                />

                {step === 2 && confirmedKey && (
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
                    <Users className="h-4 w-4 shrink-0 text-primary" />
                    <b>
                      {semina} · {group}
                    </b>
                    <span className="text-muted-foreground">
                      {t("ga_presenters_summary")}:{" "}
                      {presenters.length ? presenters.join(", ") : "—"}
                    </span>
                  </div>
                )}

                {step <= 1 && (
                  <WizardNav
                    current={step}
                    count={wizardSteps.length}
                    onBack={goBack}
                    onNext={goNext}
                    nextDisabled={stepBlocked}
                  />
                )}

                {step === 2 && confirmedKey && (
                  <>
                    <Card className="border-primary/25">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">{t("ga_step3_title")}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {t("ga_question_label")}
                        </Label>
                        <Textarea
                          rows={4}
                          className="mt-1.5"
                          value={question}
                          onChange={(e) => setQuestion(e.target.value)}
                          placeholder={t("ga_question_placeholder")}
                        />
                      </CardContent>
                    </Card>

                    <Card className="border-primary/25">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Upload className="h-4 w-4 text-primary" /> {t("ga_step4_title")}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">{t("ga_file_hint")}</p>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Input
                          ref={fileInputRef}
                          type="file"
                          accept={GROUP_FILE_ACCEPT}
                          onChange={(e) => {
                            const f = e.target.files?.[0] ?? null;
                            if (f) {
                              const kind = assignmentFileKind(f);
                              if (!kind) {
                                toast.error("Tumia PDF au Word tu (.pdf, .doc, .docx).");
                                e.target.value = "";
                                return;
                              }
                              if (f.size > MAX_GROUP_FILE_BYTES) {
                                toast.error(`Faili ni ${formatBytes(f.size)} — kikomo ni 2MB.`);
                                e.target.value = "";
                                return;
                              }
                            }
                            setFile(f);
                          }}
                        />
                        {file && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <FileText className="h-3.5 w-3.5" />
                            <span className="truncate">{file.name}</span>
                            <Badge variant="secondary">{formatBytes(file.size)}</Badge>
                          </div>
                        )}

                        {file && previewUrl ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                                <Eye className="h-3.5 w-3.5" /> {t("ga_preview")}
                              </span>
                              {previewed ? (
                                <Badge className="gap-1 bg-emerald-600 text-white">
                                  <CheckCircle2 className="h-3 w-3" /> {t("ga_previewed")}
                                </Badge>
                              ) : (
                                <Badge variant="outline">{t("ga_preview_first")}</Badge>
                              )}
                            </div>
                            {previewKind === "pdf" ? (
                              <FilePreview
                                src={previewUrl}
                                fileName={file.name}
                                onLoaded={() => setPreviewed(true)}
                              />
                            ) : (
                              <>
                                <FilePreview src={previewUrl} fileName={file.name} />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="gap-1"
                                  onClick={() => setPreviewed(true)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" /> {t("ga_previewed")}
                                </Button>
                              </>
                            )}
                          </>
                        ) : file ? (
                          <PreviewLoading />
                        ) : null}

                        {!check.ok && (question || presenters.length || file) && (
                          <div className="space-y-1 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1 font-bold text-amber-700 dark:text-amber-300">
                              <AlertCircle className="h-3.5 w-3.5" /> {t("ga_missing_title")}
                            </div>
                            <ul className="list-inside list-disc space-y-0.5">
                              {check.missing.map((m) => (
                                <li key={m}>{m}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <WizardNav
                          current={step}
                          count={wizardSteps.length}
                          onBack={goBack}
                          onNext={send}
                          nextLabel={t("ga_submit")}
                          nextDisabled={!canSend}
                          busy={sending}
                        />

                        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Lock className="h-3 w-3" /> {t("ga_already")}
                        </p>
                      </CardContent>
                    </Card>
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

/** The confirmation card a group sees after it has sent its work. */
function SentCard({ row, onChangeGroup }: { row: GroupSubmissionRow; onChangeGroup: () => void }) {
  const { t } = useI18n();
  const sub = toGroupSubmission(row);

  return (
    <Card className="border-2 border-emerald-500/40 bg-emerald-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-5 w-5" /> {t("ga_sent_title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{groupLabel(sub.key)}</Badge>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" /> {submittedMessage(sub.submittedAt)}
          </span>
        </div>
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
          {t("ga_already")}
        </p>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t("ga_presenters_summary")}
          </div>
          <p>{sub.presenters.length ? sub.presenters.join(", ") : "—"}</p>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {t("ga_question_summary")}
          </div>
          <p className="whitespace-pre-wrap">{sub.question || "—"}</p>
        </div>
        {row.file_url && (
          <a
            href={row.file_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline"
          >
            <FileText className="h-4 w-4" /> {row.file_name || "Faili"}
          </a>
        )}
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5" /> {t("ga_answer_from_admin")}
          </div>
          {sub.answered ? (
            <div className="mt-1.5 space-y-2">
              <p className="whitespace-pre-wrap">{sub.answer || "—"}</p>
              {sub.answerSignature && (
                <img
                  src={sub.answerSignature}
                  alt="Sahihi ya mfumo"
                  className="max-h-24 rounded-lg border bg-white p-1"
                />
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-muted-foreground">{t("ga_waiting_answer")}</p>
          )}
        </div>
        <Button variant="outline" className="gap-1" onClick={onChangeGroup}>
          <ArrowLeft className="h-4 w-4" /> {t("ga_back")}
        </Button>
      </CardContent>
    </Card>
  );
}
