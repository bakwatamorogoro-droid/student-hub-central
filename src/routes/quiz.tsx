import { useEffect, useMemo, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { SiteHeader } from "@/components/SiteHeader";
import {
  GroupPicker,
  memberNames,
  ownGroupOf,
  useGroupMembers,
} from "@/components/GroupAssignmentPicker";
import { FilePreview, PreviewLoading } from "@/components/FilePreview";
import { StudentMatchesPicker, type Student } from "@/components/StudentMatchesPicker";
import { WizardNav, WizardProgress, type WizardStep } from "@/components/StepWizard";
import { findStudentsByQuery } from "@/lib/studentSearch";
import { storageGet, storageSet } from "@/lib/safe-storage";
import { toast } from "@/lib/toast";
import { useI18n } from "@/lib/i18n";
import { useRoster } from "@/lib/useRoster";
import {
  loadGroupSubmission,
  loadGroupSubmissionRows,
  submitGroupAssignment,
} from "@/lib/groupAssignmentApi";
import { canonicalRegNo } from "@/lib/regNo";
import { PdfPageView } from "@/components/PdfPageView";
import { AnnotationList, AnnotationTally } from "@/components/AssignmentAnnotator";
import { ANNOTATION_META, firstAnnotatedPage } from "@/lib/assignmentAnnotations";
import {
  GROUP_FILE_ACCEPT,
  MAX_GROUP_FILE_BYTES,
  assignmentFileKind,
  canSubmit,
  checkPresenterTurns,
  formatBytes,
  groupLabel,
  indexSubmissionsByRegNo,
  previewKindFor,
  submittedMessage,
  toGroupSubmission,
  type GroupKey,
  type GroupSubmissionRow,
} from "@/lib/groupAssignmentSubmission";
import { gradeLabel, markPercent } from "@/lib/assignmentMarks";
import { OpenAssignmentPicker } from "@/components/OpenAssignmentPicker";
import { forGroupPage, loadOpenAssignments, type OpenAssignment } from "@/lib/openAssignments";
import {
  DEFAULT_ASSIGNMENT_KIND,
  assignmentKindLabel,
  type AssignmentKind,
} from "@/lib/assignmentKind";
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
  /** Every group submission, so a person's one turn can be checked. */
  const [turnRows, setTurnRows] = useState<GroupSubmissionRow[]>([]);
  /** The assignments the admin has opened, and which one is chosen. */
  const [openAssignments, setOpenAssignments] = useState<OpenAssignment[]>([]);
  const [assignmentId, setAssignmentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const members = useGroupMembers(roster, confirmedKey);

  /**
   * The group assignments the admin has opened, for the student to choose from.
   *
   * Only the group kinds are offered here; an individual assignment belongs on
   * `/pdf-quiz`, and showing it here would invite a group to submit for one
   * person's work.
   */
  useEffect(() => {
    let live = true;
    loadOpenAssignments()
      .then((rows) => {
        if (live) setOpenAssignments(forGroupPage(rows));
      })
      .catch(() => {
        if (live) setOpenAssignments([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const chosenAssignment = useMemo(
    () => openAssignments.find((a) => a.id === assignmentId) ?? null,
    [openAssignments, assignmentId],
  );

  /**
   * The kind that will be recorded.
   *
   * Read from the chosen assignment, and the default when none is chosen (or the
   * admin has not opened any yet) so a submission is never written without a
   * kind.
   */
  const assignmentKind: AssignmentKind = chosenAssignment?.kind ?? DEFAULT_ASSIGNMENT_KIND;

  /**
   * The student's own group, read from their registration.
   *
   * When it is known, the picker is locked to it: the seminar, group and gender
   * controls are filled in and disabled, so a member of GROUP 1 cannot submit
   * for GROUP 2. When the registration is incomplete the picker stays open, and
   * the turn check below still refuses a second submission.
   */
  const ownGroup = useMemo(() => ownGroupOf(student), [student]);

  useEffect(() => {
    if (!ownGroup) return;
    setSemina(ownGroup.semina);
    setGroup(ownGroup.group);
    setGender(ownGroup.gender);
    setConfirmedKey((prev) => prev ?? ownGroup);
  }, [ownGroup]);

  // The rows behind the turn check. Loaded once, and refreshed after a send, so
  // "has this person already presented?" is answered from the same list the
  // admin sees.
  useEffect(() => {
    let live = true;
    loadGroupSubmissionRows()
      .then((rows) => {
        if (live) setTurnRows(rows);
      })
      .catch(() => {
        if (live) setTurnRows([]);
      });
    return () => {
      live = false;
    };
  }, [existing]);

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

  /**
   * Whether everyone ticked still has their one turn.
   *
   * A person presents once, for their own group. This is the screen's half of
   * the rule; `submitGroupAssignment` repeats it against a fresh read, so two
   * phones acting at the same moment cannot both win.
   */
  const turnIndex = useMemo(() => indexSubmissionsByRegNo(turnRows, canonicalRegNo), [turnRows]);
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const turnCheck = useMemo(
    () =>
      checkPresenterTurns({
        selectedIds: [...selected],
        key: confirmedKey ?? { semina: "", gender: "", group: "" },
        regOfId: (id) => memberById.get(id)?.reg_no,
        nameOfId: (id) => memberById.get(id)?.full_name,
        index: turnIndex,
        canonical: canonicalRegNo,
      }),
    [selected, confirmedKey, memberById, turnIndex],
  );

  const canSend = check.ok && !!confirmedKey && !existing && !sending && turnCheck.ok;

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
    if (!turnCheck.ok) {
      toast.error(turnMessage(turnCheck));
      return;
    }
    setSending(true);
    let res: Awaited<ReturnType<typeof submitGroupAssignment>>;
    try {
      res = await submitGroupAssignment({
        key: confirmedKey,
        question,
        kind: assignmentKind,
        presenters,
        presenterRegs: members
          .filter((m) => selected.has(m.id))
          .map((m) => String(m.reg_no ?? ""))
          .filter(Boolean),
        file,
        submittedBy: student
          ? { reg_no: String(student.reg_no ?? ""), full_name: String(student.full_name ?? "") }
          : null,
        studentId: student?.id ?? null,
      });
    } catch (e) {
      // Without this the upload spinner never stops: a network drop, a storage
      // rejection or a quota error throws, and the button spins forever with no
      // word to the student about what went wrong.
      setSending(false);
      toast.error(
        e instanceof Error && e.message
          ? `Imeshindikana kutuma: ${e.message}`
          : "Imeshindikana kutuma kazi. Angalia intaneti yako kisha ujaribu tena.",
      );
      return;
    }
    setSending(false);
    if (!res.ok) {
      if (res.error === "already_submitted") {
        toast.error(t("ga_already"));
        setExisting(await loadGroupSubmission(confirmedKey));
      } else if (res.error.startsWith("already_presented::")) {
        const [, name, label] = res.error.split("::");
        toast.error(
          `${name || "Mwanachama mmoja"} ameshapresent kwenye ${label || "group nyingine"}. Kila mwanachama anapresent mara moja tu, kwenye group lake.`,
        );
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
          <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 rounded-full bg-secondary/20 blur-3xl" />
          <div className="relative">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary shadow-[var(--shadow-edge)]">
              <Users className="h-3 w-3" /> {t("nav_quiz")}
            </div>
            <h1 className="mt-3 bg-gradient-to-r from-primary to-secondary bg-clip-text text-display font-black text-transparent">
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
                <Card className="border-primary/25">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      <FileText className="h-4 w-4 text-primary" /> Aina ya Kazi
                      <Badge variant="secondary" className="font-normal">
                        {assignmentKindLabel(assignmentKind)}
                      </Badge>
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Chagua kazi iliyofunguliwa na mwalimu. Aina ya kazi inaonekana kwa mwalimu
                      pamoja na kazi yenu.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <OpenAssignmentPicker
                      assignments={openAssignments}
                      value={assignmentId}
                      onChange={setAssignmentId}
                      submittedLabel="Umeshatuma"
                      emptyLabel="Mwalimu hajafungua kazi ya group bado — unaweza kutuma, na itahesabiwa kama Presentation Assignment (Group)."
                    />
                  </CardContent>
                </Card>

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
                  lockedNote={
                    ownGroup
                      ? `Hii ni group yako kutoka usajili wako: ${ownGroup.semina} · ${ownGroup.group} · ${
                          ownGroup.gender === "Mwanamke" ? "Wanawake" : "Wanaume"
                        }. Kazi hutumwa kwa group lako pekee.`
                      : null
                  }
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

                        {!turnCheck.ok && (
                          <div className="space-y-1 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs">
                            <div className="flex items-center gap-1 font-bold text-rose-700 dark:text-rose-300">
                              <AlertCircle className="h-3.5 w-3.5" /> Mwanachama hawezi kutuma tena
                            </div>
                            <p className="text-muted-foreground">{turnMessage(turnCheck)}</p>
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

/** A sentence for the two ways a presenter's turn can be refused. */
function turnMessage(
  check: { kind: "already_used"; label: string } | { kind: "duplicate_pick"; names: string[] },
): string {
  if (check.kind === "duplicate_pick") {
    return `${check.names.join(", ")} ameorodheshwa mara mbili kwenye orodha. Mwone msimamizi — kuna usajili wa marudio.`;
  }
  return `Mwanachama mmoja ameshapresent kwenye ${check.label}. Kila mwanachama anapresent mara moja tu, kwenye group lake.`;
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
          <Badge variant="secondary" className="font-normal">
            {assignmentKindLabel(sub.kind)}
          </Badge>
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
              {sub.mark && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-background px-3 py-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {t("ga_mark_label")}
                  </span>
                  <span className="font-mono text-lg font-bold text-primary">{sub.mark}</span>
                  <Badge variant="secondary">
                    {gradeLabel(markPercent(sub.markScore, sub.markMax))}
                  </Badge>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-muted-foreground">{t("ga_waiting_answer")}</p>
          )}
        </div>

        {sub.annotations.length > 0 && (
          <div className="space-y-2 rounded-xl border-2 border-rose-500/30 bg-rose-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                {t("ga_marks_on_work")}
              </span>
              <AnnotationTally items={sub.annotations} />
            </div>
            <AnnotationList items={sub.annotations} />
            {row.file_url && /\.pdf$/i.test(String(row.file_name ?? "")) && (
              <div className="rounded-lg bg-background p-1.5">
                <p className="mb-1 text-[11px] text-muted-foreground">{t("ga_see_marks_hint")}</p>
                <PdfPageView
                  src={row.file_url}
                  page={firstAnnotatedPage(sub.annotations)}
                  overlay={(p) => (
                    <div className="pointer-events-none absolute inset-0">
                      {sub.annotations
                        .filter((a) => a.page === p)
                        .map((a) => (
                          <div
                            key={a.id}
                            className="absolute -translate-x-1/2 -translate-y-1/2"
                            style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
                          >
                            <span
                              className={`flex max-w-[14rem] items-start gap-1 rounded-lg border-2 bg-white/95 px-1.5 py-1 text-[11px] leading-tight shadow-md ${
                                a.kind === "tick"
                                  ? "border-emerald-600 text-emerald-700"
                                  : a.kind === "note"
                                    ? "border-sky-600 text-sky-700"
                                    : "border-rose-600 text-rose-700"
                              }`}
                            >
                              <span className="font-black">{ANNOTATION_META[a.kind].glyph}</span>
                              {a.text && <span className="text-slate-900">{a.text}</span>}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                />
              </div>
            )}
          </div>
        )}
        <Button variant="outline" className="gap-1" onClick={onChangeGroup}>
          <ArrowLeft className="h-4 w-4" /> {t("ga_back")}
        </Button>
      </CardContent>
    </Card>
  );
}
