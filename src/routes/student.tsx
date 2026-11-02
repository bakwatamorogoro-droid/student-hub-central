import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { alertSuccess, alertWarning } from "@/lib/alerts";
import {
  UserCog,
  CheckCircle2,
  Clock,
  Wand2,
  Search,
  Users,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { findStudentsByQuery } from "@/lib/studentSearch";
import { StudentMatchesPicker } from "@/components/StudentMatchesPicker";
import { updateStudentProfile } from "@/lib/studentProfile";
import { retryWithoutMissingColumns } from "@/lib/schema-retry";
import {
  CURRENT_ACADEMIC_YEAR,
  SEMESTERS,
  formatAcademicSummary,
  isSemesterActive,
  studyYearsFor,
} from "@/lib/academicTargeting";
import { DEFAULT_PROGRAM_YEARS, studyYearFromReg } from "@/lib/studyYear";
import { useI18n } from "@/lib/i18n";
import { loadDirectory } from "@/lib/directory";
import { assignStudentGroup, confirmStudentGroup } from "@/lib/groupRoster";
import { GROUP_NAMES, SEMINARS } from "@/lib/groupAssignment";
import { invalidateRosterCache } from "@/lib/useRoster";
import { GroupRosterView } from "@/components/GroupRosterView";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/student")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Update Taarifa — Islamic Studies Test" },
      {
        name: "description",
        content: "Update taarifa zako na wasilisha changamoto kwa wanafunzi wa Islamic Studies.",
      },
      { property: "og:title", content: "Update Taarifa — Islamic Studies Test" },
    ],
  }),
});

function Page() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<any>(null);
  const [courseList, setCourseList] = useState<string[]>([]);
  const [studyYears, setStudyYears] = useState<number[]>(studyYearsFor(2));
  // The programme length, so a derived study year is clamped to it rather than reading
  // as year 12 for a student admitted years ago.
  const [programYears, setProgramYears] = useState<number>(DEFAULT_PROGRAM_YEARS);
  const [reg, setReg] = useState("");
  const [student, setStudent] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  // edit form. Semina, group and study year are deliberately absent: the group system
  // owns the first two, and the study year is derived from the Reg Namba, so there is
  // nothing for the student to choose. Carrying seeded copies here is what let the form
  // submit the student's own values as though they were corrections.
  const [edit, setEdit] = useState({
    new_reg_no: "",
    new_full_name: "",
    new_course: "",
    new_semester: "",
    new_academic_year: "",
    new_phone: "",
  });
  const [wrongReg, setWrongReg] = useState(false);
  // 1 = Reg Namba, 2 = correct your details, 3 = your seminar and group.
  const [step, setStep] = useState(1);
  const [editStatus, setEditStatus] = useState<any[]>([]);
  // The student picks their own seminar and group. Seeded from their row on lookup.
  const [editSemina, setEditSemina] = useState("");
  const [editGroup, setEditGroup] = useState("");
  // Bumped after a save to remount the group card against the fresh roster.
  const [rosterEpoch, setRosterEpoch] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [askConfirm, setAskConfirm] = useState(false);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data }: { data: any }) => {
        setSettings(data);
        setCourseList((data?.course_list as string[]) || []);
        loadDirectory(data).then((dir) => {
          if (dir.courses.length) setCourseList(dir.courses);
        });
        setStudyYears(studyYearsFor(data?.program_years ?? DEFAULT_PROGRAM_YEARS));
        setProgramYears(Number(data?.program_years) || DEFAULT_PROGRAM_YEARS);
      });
    const saved = localStorage.getItem("student_reg");
    if (saved) {
      setReg(saved);
      lookup(saved);
    }
  }, []);

  // The header links to /student#group-yangu. Land on the group step rather than
  // making the student walk the wizard again.
  useEffect(() => {
    const openGroup = () => {
      if (window.location.hash === "#group-yangu") setStep(3);
    };
    openGroup();
    window.addEventListener("hashchange", openGroup);
    return () => window.removeEventListener("hashchange", openGroup);
  }, []);

  /** Loads one student row into the form. Leaves the current step alone. */
  const fillForm = async (data: any) => {
    setStudent(data);
    setMatches([]);
    setReg(data.reg_no);
    setEdit({
      new_reg_no: data.reg_no,
      new_full_name: data.full_name,
      new_course: data.course || "",
      new_semester: data.semester || "",
      new_academic_year: CURRENT_ACADEMIC_YEAR,
      new_phone: data.phone || "",
    });
    localStorage.setItem("student_reg", data.reg_no);
    setEditSemina(data.semina || "");
    setEditGroup(data.student_group || "");
    const { data: reqs } = await (supabase as any)
      .from("profile_update_requests")
      .select("*")
      .eq("student_id", data.id)
      .order("created_at", { ascending: false });
    setEditStatus(reqs || []);
  };

  const confirmStudent = async (data: any) => {
    await fillForm(data);
    setStep(2);
    // A student with no placement yet is filed in as soon as they confirm, so they are
    // never left looking at an empty group. Someone already seated is left alone: the
    // planner would re-run across the whole cohort, and a lookup should not reshuffle
    // anyone's seat.
    if (!data.semina || !data.student_group) void placeStudent(data.id);
  };

  /** Files one student into their seminar and gender-pure group. */
  const placeStudent = async (studentId: string) => {
    try {
      const outcome = await assignStudentGroup(studentId);
      if (outcome.me.semina || outcome.me.student_group) {
        invalidateRosterCache();
        setStudent((prev: any) =>
          prev && prev.id === studentId
            ? {
                ...prev,
                semina: outcome.me.semina ?? prev.semina,
                student_group: outcome.me.student_group ?? prev.student_group,
              }
            : prev,
        );
        setEditSemina((prev) => outcome.me.semina ?? prev);
        setEditGroup((prev) => outcome.me.student_group ?? prev);
      }
    } catch {
      // A placement failure must not block the student from correcting their details.
    }
  };

  /**
   * Confirms the seat. This is the save that locks step 3: the database stamps
   * `group_confirmed_at` and refuses to move the seat afterwards, so the form's
   * disabled dropdowns are a convenience rather than the guard.
   */
  const confirmGroup = async () => {
    if (!student) return;
    if (!editSemina || !editGroup) {
      toast.error(t("group_edit_help"));
      return;
    }
    setAskConfirm(false);
    setConfirming(true);
    const outcome = await confirmStudentGroup(student.id, editSemina, editGroup);
    setConfirming(false);

    if (outcome.needsMigration) {
      toast.error(
        "Uthibitisho haujawashwa kwenye mfumo bado. Admin aendeshe migrations zilizo kwenye supabase/migrations/.",
      );
      return;
    }
    if (outcome.error && !outcome.alreadyConfirmed) {
      toast.error(outcome.error.message || "Imeshindikana kuhakiki. Jaribu tena.");
      return;
    }

    const stamp = new Date().toISOString();
    setStudent((prev: any) =>
      prev
        ? { ...prev, semina: editSemina, student_group: editGroup, group_confirmed_at: stamp }
        : prev,
    );
    invalidateRosterCache();
    setRosterEpoch((n) => n + 1);
    await alertSuccess(t("group_confirmed_title"), t("group_confirmed_body"));
  };

  const lookup = async (r: string) => {
    if (!r) return;
    const results = await findStudentsByQuery(r);
    if (results.length === 0) {
      toast.error(t("not_found"));
      setStep(1);
      setStudent(null);
      setMatches([]);
      return;
    }
    if (results.length === 1) {
      confirmStudent(results[0]);
      return;
    }
    setStudent(null);
    setMatches(results);
    toast.info(t("your_details"));
  };

  // What the Reg Namba says the study year is. Shown read-only and used as the value the
  // request carries, so the student and the request agree without the student choosing.
  const autoYear = studyYearFromReg(
    edit.new_reg_no || student?.reg_no,
    CURRENT_ACADEMIC_YEAR,
    programYears,
  );

  /**
   * Writes the student's own corrections straight to their row. There is no approval
   * step: the student is the only one who knows their own name and phone number, and an
   * admin queue in front of every typo fix was pure friction. The request row is still
   * written, as `approved`, so there is a record of who changed what and when.
   */
  const saveProfile = async (goToStep?: number): Promise<boolean> => {
    if (!student) return false;
    if (!settings?.profile_edits_enabled) {
      toast.error(t("edits_disabled"));
      return false;
    }
    if (edit.new_semester && !isSemesterActive(edit.new_semester)) {
      toast.error(t("semester_inactive"));
      return false;
    }

    const newRegUp = edit.new_reg_no?.toUpperCase() || null;
    const newSemina = editSemina || null;
    const newGroup = editGroup || null;
    const courseNow = student.course || "";
    const semesterNow = student.semester || "";
    const phoneNow = student.phone || "";
    const seminaNow = student.semina || "";
    const groupNow = student.student_group || "";
    // The study year is read from the Reg Namba rather than asked for, so a Reg Namba
    // correction moves the year with it. `null` means the Reg Namba carries no year, so
    // the stored value stands.
    const regForYear = newRegUp || student.reg_no;
    const derivedYear = studyYearFromReg(regForYear, CURRENT_ACADEMIC_YEAR, programYears);
    const yearNow = student.study_year == null ? "" : String(student.study_year);

    const changed: string[] = [];
    if (newRegUp && newRegUp !== student.reg_no) changed.push("reg_no");
    if ((edit.new_full_name || "") !== (student.full_name || "")) changed.push("full_name");
    if ((edit.new_course || "") !== courseNow) changed.push("course");
    if ((edit.new_semester || "") !== semesterNow) changed.push("semester");
    if ((edit.new_phone || "") !== phoneNow) changed.push("phone");
    if (newSemina !== seminaNow) changed.push("semina");
    if (newGroup !== groupNow) changed.push("group");
    if (derivedYear != null && String(derivedYear) !== yearNow) changed.push("study_year");
    const has = (k: string) => changed.includes(k);

    if (changed.length === 0) {
      toast.info(t("nothing_changed"));
      if (goToStep) setStep(goToStep);
      return true;
    }

    setSubmitting(true);
    const reasonPrefix = wrongReg
      ? "[NILIKOSEA REG KABISA] Matokeo yangu ya awali yahamishwe kwa Reg mpya. "
      : "";

    // The request row is the audit trail. `approved` from the start, because nothing is
    // waiting on an admin — the write below is the same act.
    const payload: Record<string, unknown> = {
      student_id: student.id,
      current_reg_no: student.reg_no,
      current_full_name: student.full_name,
      current_semina: seminaNow || null,
      current_student_group: groupNow || null,
      current_course: courseNow || null,
      current_study_year: student.study_year == null ? null : Number(student.study_year),
      current_semester: semesterNow || null,
      new_reg_no: has("reg_no") ? newRegUp : null,
      new_full_name: has("full_name") ? edit.new_full_name : null,
      new_semina: has("semina") ? newSemina : null,
      new_student_group: has("group") ? newGroup : null,
      new_course: has("course") ? edit.new_course : null,
      new_study_year: has("study_year") ? derivedYear : null,
      new_semester: has("semester") ? edit.new_semester : null,
      new_phone: has("phone") ? edit.new_phone : null,
      new_academic_year: CURRENT_ACADEMIC_YEAR,
      changed_fields: changed,
      reason: reasonPrefix.trim() || null,
      status: "approved",
      reviewed_at: new Date().toISOString(),
      placed_semina: has("semina") ? newSemina : null,
      placed_student_group: has("group") ? newGroup : null,
      placed_at: new Date().toISOString(),
    };

    // Columns added by later migrations. Until those run, drop them and still save.
    type InsertResult = { error: { message?: string } | null; data: unknown };
    const { last } = await retryWithoutMissingColumns(payload, async (body) => {
      const r = await (supabase as any)
        .from("profile_update_requests")
        .insert(body)
        .select()
        .single();
      return r as InsertResult;
    });
    if (last.error) {
      setSubmitting(false);
      toast.error(last.error.message || "Imeshindikana kuhifadhi. Jaribu tena.");
      return false;
    }

    // One RPC for reg/name/semina/group. It moves the student's earlier submissions to
    // the new Reg Namba in the same transaction, which is why a Reg change needs no admin.
    const { error: rpcErr } = await (supabase as any).rpc("apply_profile_update", {
      p_student_id: student.id,
      p_new_reg_no: has("reg_no") ? newRegUp : null,
      p_new_full_name: has("full_name") ? edit.new_full_name : null,
      p_new_semina: has("semina") ? newSemina : null,
      p_new_group: has("group") ? newGroup : null,
    });
    if (rpcErr) {
      setSubmitting(false);
      toast.error(rpcErr.message || "Imeshindikana kuhifadhi. Jaribu tena.");
      return false;
    }

    // The RPC covers reg/name/semina/group only, so the academic fields are written
    // separately, and only the ones the student actually changed.
    const acad: Record<string, unknown> = {};
    if (has("course")) acad.course = edit.new_course;
    if (has("study_year")) acad.study_year = derivedYear;
    if (has("semester")) acad.semester = edit.new_semester;
    if (has("phone")) acad.phone = edit.new_phone;
    const { error: acadErr, dropped: acadDropped } = await updateStudentProfile(
      student.id,
      acad as Parameters<typeof updateStudentProfile>[1],
    );

    const newRef = newRegUp || student.reg_no;
    localStorage.setItem("student_reg", newRef);
    // The roster cache still holds the old seat, so drop it and remount the group card.
    invalidateRosterCache();
    setRosterEpoch((n) => n + 1);
    setSubmitting(false);
    setWrongReg(false);

    if (acadErr) {
      await alertWarning(
        "Taarifa za msingi zimehifadhiwa",
        "Baadhi ya sehemu hazikuhifadhiwa: " + acadErr.message,
      );
    } else if (acadDropped.length) {
      await alertWarning(
        "Imehifadhiwa",
        `${acadDropped.join(", ")} bado haijawashwa kwenye mfumo (admin aendeshe migrations zilizo kwenye supabase/migrations/).`,
      );
    } else {
      await alertSuccess(t("saved_title"), t("saved_body"));
    }

    // Re-read the row so the form shows what was actually stored, but do not go through
    // `confirmStudent`: that resets the wizard to step 2 and would undo "Save & Continue".
    const { data: refreshed } = await (supabase as any)
      .from("students")
      .select("*")
      .eq("reg_no", newRef)
      .limit(1)
      .maybeSingle();
    if (refreshed) await fillForm(refreshed);
    if (goToStep) setStep(goToStep);
    return true;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-secondary/10">
      <SiteHeader />
      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-5">
        <div className="relative overflow-hidden rounded-3xl border-2 border-primary/25 bg-gradient-to-br from-primary/12 via-card to-secondary/15 p-6 text-center shadow-lg">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <UserCog className="h-3 w-3" /> {t("update_cta")}
            </div>
            <h1 className="mt-3 bg-gradient-to-r from-primary to-secondary bg-clip-text text-3xl font-black tracking-tight text-transparent md:text-4xl">
              {t("update_title")}
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
              {t("update_sub")}
            </p>
          </div>
        </div>

        {/* Three steps, Back and Next. The student always knows where they are and
              what comes next, and the group only appears once the Reg Namba has
              resolved to a real student. */}
        <div className="flex items-center justify-center gap-2">
          {[
            { n: 1, label: t("step_reg") },
            { n: 2, label: t("step_details") },
            { n: 3, label: t("step_group") },
          ].map((s, i, all) => (
            <div key={s.n} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => (s.n <= step || student ? setStep(s.n) : undefined)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                  step === s.n
                    ? "border-primary bg-primary text-primary-foreground"
                    : step > s.n
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground"
                }`}
              >
                <span
                  className={`grid h-4 w-4 place-items-center rounded-full text-[10px] ${
                    step >= s.n ? "bg-primary-foreground/25" : "bg-muted"
                  }`}
                >
                  {s.n}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
              {i < all.length - 1 && <span className="h-px w-4 bg-border sm:w-6" />}
            </div>
          ))}
        </div>

        {step === 1 && (
          <Card className="border-2 border-primary/25 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-4 w-4 text-primary" /> {t("step_reg")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t("step_reg_help")}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("reg_number")}
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={reg}
                  onChange={(e) => setReg(e.target.value.toUpperCase())}
                  placeholder={t("reg_placeholder")}
                  className="flex-1 font-mono"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") lookup(reg);
                  }}
                />
                <Button onClick={() => lookup(reg)} className="font-bold">
                  <Search className="h-4 w-4" /> {t("look_up")}
                </Button>
              </div>
              {matches.length > 0 && (
                <StudentMatchesPicker
                  matches={matches}
                  onConfirm={confirmStudent}
                  onCancel={() => setMatches([])}
                />
              )}
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card className="border-2 border-primary/25 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <UserCog className="h-4 w-4 text-primary" /> {t("edit_card_title")}
              </CardTitle>
              {!settings?.profile_edits_enabled && (
                <p className="flex items-center gap-1 text-xs text-amber-600">
                  <Clock className="h-3 w-3" /> {t("edits_disabled")}
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {student && (
                <>
                  <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
                    <div className="flex items-center gap-2 text-sm font-bold">
                      <Wand2 className="h-4 w-4 text-primary" /> Semina na Group
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Unabadilisha semina na group lako kwenye hatua inayofuata. Ukibadilisha mwaka
                      wa masomo au kozi, mfumo unakuweka kwenye semina na group lako la jinsia yako,
                      wanafunzi 8 kwa group.
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div className="rounded-lg border border-border bg-card p-2">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          {t("semina")}
                        </div>
                        <div className="truncate text-sm font-semibold">
                          {student.semina || "—"}
                        </div>
                      </div>
                      <div className="rounded-lg border border-border bg-card p-2">
                        <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                          {t("group")}
                        </div>
                        <div className="truncate text-sm font-semibold">
                          {student.student_group || "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label>{t("new_reg")}</Label>
                      <Input
                        value={edit.new_reg_no}
                        onChange={(e) =>
                          setEdit({ ...edit, new_reg_no: e.target.value.toUpperCase() })
                        }
                      />
                    </div>
                    <div>
                      <Label>{t("new_name")}</Label>
                      <Input
                        value={edit.new_full_name}
                        onChange={(e) => setEdit({ ...edit, new_full_name: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label>{t("course")}</Label>
                      <Select
                        value={edit.new_course}
                        onValueChange={(v) => setEdit({ ...edit, new_course: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("choose_course")} />
                        </SelectTrigger>
                        <SelectContent>
                          {courseList.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                          {edit.new_course && !courseList.includes(edit.new_course) && (
                            <SelectItem value={edit.new_course}>{edit.new_course}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t("study_year")}</Label>
                      <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 font-mono text-sm">
                        {autoYear != null ? t("year_n", { n: autoYear }) : "—"}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {autoYear != null ? t("year_auto") : t("year_auto_unknown")}
                      </p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <Label>{t("semester")}</Label>
                      <Select
                        value={edit.new_semester}
                        onValueChange={(v) => setEdit({ ...edit, new_semester: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("choose_semester")} />
                        </SelectTrigger>
                        <SelectContent>
                          {SEMESTERS.map((s) => (
                            <SelectItem key={s} value={s} disabled={!isSemesterActive(s)}>
                              {s}
                              {!isSemesterActive(s) && " (bado)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t("academic_year")}</Label>
                      <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 font-mono text-sm">
                        {CURRENT_ACADEMIC_YEAR}
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Umewekwa kiotomatiki — hauwezi kubadilishwa.
                      </p>
                    </div>
                  </div>
                  <div>
                    <Label>{t("phone")}</Label>
                    <Input
                      value={edit.new_phone}
                      onChange={(e) => setEdit({ ...edit, new_phone: e.target.value })}
                      placeholder={t("phone_placeholder")}
                      inputMode="tel"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">{t("phone_help")}</p>
                  </div>
                  <label className="flex items-start gap-2 p-3 rounded-lg border-2 border-amber-500/40 bg-amber-500/5 cursor-pointer hover:bg-amber-500/10 transition-colors">
                    <input
                      type="checkbox"
                      checked={wrongReg}
                      onChange={(e) => setWrongReg(e.target.checked)}
                      className="mt-1 h-4 w-4 accent-amber-600"
                    />
                    <div className="text-sm">
                      <div className="font-semibold text-amber-700 dark:text-amber-400">
                        {t("wrong_reg")}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {t("wrong_reg_help")}
                      </div>
                    </div>
                  </label>
                </>
              )}
              {editStatus.length > 0 && (
                <div className="pt-3 border-t space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground">
                    {t("my_requests")}:
                  </div>
                  {editStatus.map((r) => (
                    <div
                      key={r.id}
                      className="text-xs p-2 rounded bg-muted flex justify-between gap-2"
                    >
                      <span>
                        {r.new_full_name || r.current_full_name} /{" "}
                        {r.new_reg_no || r.current_reg_no}
                      </span>
                      <span
                        className={
                          r.status === "approved"
                            ? "text-green-600 font-bold"
                            : r.status === "rejected"
                              ? "text-red-600"
                              : "text-amber-600"
                        }
                      >
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between gap-2">
              <Button variant="outline" onClick={() => setStep(1)} disabled={submitting}>
                <ArrowLeft className="h-4 w-4" /> {t("back")}
              </Button>
              <Button
                onClick={() => void saveProfile(3)}
                disabled={submitting || !settings?.profile_edits_enabled}
                className="font-bold"
              >
                {submitting ? t("saving") : t("save_continue")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === 3 && (
          <Card id="group-yangu" className="scroll-mt-20 border-2 border-primary/25 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" /> {t("step_group")}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{t("step_group_help")}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {student?.group_confirmed_at ? (
                /* Confirmed: the seat is frozen, so the pickers are replaced by a
                   locked summary rather than left visible but disabled. */
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-xl border-2 border-emerald-500/40 bg-emerald-500/10 p-3">
                    <Lock className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div className="text-sm">
                      <div className="font-bold text-emerald-700 dark:text-emerald-300">
                        {t("group_confirmed_title")}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("group_confirmed_body")}
                      </p>
                      <p className="mt-1 text-[11px] font-mono text-muted-foreground">
                        {t("group_confirmed_at")}:{" "}
                        {new Date(student.group_confirmed_at).toLocaleString("sw-TZ")}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-primary/15 bg-primary/5 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        {t("semina")}
                      </div>
                      <div className="truncate text-sm font-semibold">
                        {student.semina || editSemina || "—"}
                      </div>
                    </div>
                    <div className="rounded-xl border border-primary/15 bg-primary/5 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        {t("group")}
                      </div>
                      <div className="truncate text-sm font-semibold">
                        {student.student_group || editGroup || "—"}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* The student chooses their own seminar and group, then confirms.
                      Confirming is what freezes the seat. */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label>{t("semina")}</Label>
                      <Select value={editSemina} onValueChange={setEditSemina}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("choose_semina")} />
                        </SelectTrigger>
                        <SelectContent>
                          {SEMINARS.map((sm) => (
                            <SelectItem key={sm} value={sm}>
                              {sm}
                            </SelectItem>
                          ))}
                          {editSemina && !SEMINARS.includes(editSemina) && (
                            <SelectItem value={editSemina}>{editSemina}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t("group")}</Label>
                      <Select value={editGroup} onValueChange={setEditGroup}>
                        <SelectTrigger>
                          <SelectValue placeholder={t("choose_group")} />
                        </SelectTrigger>
                        <SelectContent>
                          {GROUP_NAMES.map((g) => (
                            <SelectItem key={g} value={g}>
                              {g}
                            </SelectItem>
                          ))}
                          {editGroup && !GROUP_NAMES.includes(editGroup) && (
                            <SelectItem value={editGroup}>{editGroup}</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                    {t("group_edit_help")}
                  </p>
                </>
              )}

              <GroupRosterView key={rosterEpoch} reg={student?.reg_no || reg} />
            </CardContent>
            <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                disabled={submitting || confirming}
              >
                <ArrowLeft className="h-4 w-4" /> {t("back")}
              </Button>
              {!student?.group_confirmed_at && (
                <Button
                  onClick={() => setAskConfirm(true)}
                  disabled={submitting || confirming || !editSemina || !editGroup}
                  className="w-full font-bold sm:w-auto"
                >
                  {confirming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  {confirming ? t("confirming") : t("confirm_group")}
                </Button>
              )}
            </CardFooter>
          </Card>
        )}

        <AlertDialog open={askConfirm} onOpenChange={setAskConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("confirm_group_title")}</AlertDialogTitle>
              <AlertDialogDescription>{t("confirm_group_warning")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("confirm_cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => void confirmGroup()}>
                {t("confirm_yes")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
