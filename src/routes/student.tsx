import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { alertSuccess, alertWarning } from "@/lib/alerts";
import { UserCog, AlertTriangle, CheckCircle2, Mail, Clock } from "lucide-react";
import { findStudentsByQuery } from "@/lib/studentSearch";
import { StudentMatchesPicker } from "@/components/StudentMatchesPicker";
import { updateStudentProfile } from "@/lib/studentProfile";
import {
  CURRENT_ACADEMIC_YEAR,
  GROUPS,
  SEMESTERS,
  formatAcademicSummary,
  isSemesterActive,
  studyYearsFor,
} from "@/lib/academicTargeting";
import { useI18n } from "@/lib/i18n";
import { loadDirectory } from "@/lib/directory";

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
  const [seminaList, setSeminaList] = useState<string[]>([]);
  const [groupList, setGroupList] = useState<string[]>([]);
  const [courseList, setCourseList] = useState<string[]>([]);
  const [studyYears, setStudyYears] = useState<number[]>(studyYearsFor(2));
  const [reg, setReg] = useState("");
  const [student, setStudent] = useState<any>(null);
  const [matches, setMatches] = useState<any[]>([]);
  // edit form
  const [edit, setEdit] = useState({
    new_reg_no: "",
    new_full_name: "",
    new_semina: "",
    new_student_group: "",
    new_course: "",
    new_study_year: "",
    new_semester: "",
    new_academic_year: "",
  });
  const [wrongReg, setWrongReg] = useState(false);
  const [editStatus, setEditStatus] = useState<any[]>([]);
  // issue form
  const [issue, setIssue] = useState({ category: "test1", message: "", phone: "", email: "" });
  const [myIssues, setMyIssues] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("*")
      .eq("id", 1)
      .single()
      .then(({ data }: { data: any }) => {
        setSettings(data);
        setSeminaList((data?.semina_list as string[]) || []);
        setGroupList((data?.group_list as string[]) || []);
        setCourseList((data?.course_list as string[]) || []);
        loadDirectory(data).then((dir) => {
          if (dir.semina.length) setSeminaList(dir.semina);
          if (dir.courses.length) setCourseList(dir.courses);
        });
        setStudyYears(studyYearsFor(data?.program_years ?? 2));
      });
    const saved = localStorage.getItem("student_reg");
    if (saved) {
      setReg(saved);
      lookup(saved);
    }
  }, []);

  const confirmStudent = async (data: any) => {
    setStudent(data);
    setMatches([]);
    setReg(data.reg_no);
    setEdit({
      new_reg_no: data.reg_no,
      new_full_name: data.full_name,
      new_semina: data.semina,
      new_student_group: data.student_group,
      new_course: data.course || "",
      new_study_year: data.study_year ? String(data.study_year) : "",
      new_semester: data.semester || "",
      new_academic_year: CURRENT_ACADEMIC_YEAR,
    });
    localStorage.setItem("student_reg", data.reg_no);
    const { data: reqs } = await (supabase as any)
      .from("profile_update_requests")
      .select("*")
      .eq("student_id", data.id)
      .order("created_at", { ascending: false });
    setEditStatus(reqs || []);
    const { data: iss } = await (supabase as any)
      .from("issue_reports")
      .select("*")
      .eq("reg_no", data.reg_no)
      .order("created_at", { ascending: false });
    setMyIssues(iss || []);
  };

  const lookup = async (r: string) => {
    if (!r) return;
    const results = await findStudentsByQuery(r);
    if (results.length === 0) {
      toast.error(t("not_found"));
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

  const submitEdit = async () => {
    if (!student) return;
    if (!settings?.profile_edits_enabled) return toast.error(t("edits_disabled"));
    if (edit.new_semester && !isSemesterActive(edit.new_semester))
      return toast.error(t("semester_inactive"));
    setSubmitting(true);
    const reasonPrefix = wrongReg
      ? "[NILIKOSEA REG KABISA] Tafadhali admin athibitishe matokeo yangu ya awali yahamishwe kwa Reg mpya. "
      : "";
    const newRegUp = edit.new_reg_no?.toUpperCase() || null;
    // Auto-approval: tu kwa marekebisho ya kawaida (sio "nilikosea reg kabisa")
    const autoApprove = !wrongReg;
    const { data: inserted, error } = await (supabase as any)
      .from("profile_update_requests")
      .insert({
        student_id: student.id,
        current_reg_no: student.reg_no,
        current_full_name: student.full_name,
        new_reg_no: newRegUp,
        new_full_name: edit.new_full_name || null,
        new_semina: edit.new_semina || null,
        new_student_group: edit.new_student_group || null,
        reason: reasonPrefix.trim() || null,
        status: autoApprove ? "approved" : "pending",
      })
      .select()
      .single();
    if (error) {
      setSubmitting(false);
      return toast.error(error.message);
    }

    if (autoApprove) {
      const { error: rpcErr } = await (supabase as any).rpc("apply_profile_update", {
        p_student_id: student.id,
        p_new_reg_no: newRegUp,
        p_new_full_name: edit.new_full_name || null,
        p_new_semina: edit.new_semina || null,
        p_new_group: edit.new_student_group || null,
      });
      if (rpcErr) {
        // rollback status to pending so admin can review
        await (supabase as any)
          .from("profile_update_requests")
          .update({ status: "pending" })
          .eq("id", (inserted as any).id);
        setSubmitting(false);
        return toast.error(
          "Marekebisho yamehifadhiwa kama 'pending' (Admin atathibitisha): " + rpcErr.message,
        );
      }
      // apply_profile_update only covers reg/name/semina/group, so write the
      // academic fields separately.
      const { error: acadErr, semesterUnsupported } = await updateStudentProfile(student.id, {
        course: edit.new_course,
        study_year: edit.new_study_year,
        semester: edit.new_semester,
        academic_year: edit.new_academic_year,
      });
      await (supabase as any)
        .from("profile_update_requests")
        .update({ reviewed_at: new Date().toISOString() })
        .eq("id", (inserted as any).id);
      // Refresh local student to reflect new values
      const newRef = newRegUp || student.reg_no;
      localStorage.setItem("student_reg", newRef);
      setSubmitting(false);
      setWrongReg(false);
      if (acadErr) {
        await alertWarning(
          "Taarifa za msingi zimehifadhiwa",
          "Kozi/mwaka haukuhifadhiwa: " + acadErr.message,
        );
      } else if (semesterUnsupported) {
        await alertWarning(
          "Imehifadhiwa",
          "Semester bado haijawashwa kwenye mfumo (admin aendeshe migration 0004).",
        );
      } else {
        await alertSuccess(t("saved_title"), t("saved_body"));
      }
      lookup(newRef);
      return;
    }

    setSubmitting(false);
    toast.success(t("request_sent"));
    setWrongReg(false);
    lookup(student.reg_no);
  };

  const submitIssue = async () => {
    if (!settings?.issues_enabled) return toast.error(t("issues_disabled"));
    if (!issue.message.trim()) return toast.error(t("write_issue"));
    if (!student && (!reg || reg.length < 3)) return toast.error(t("enter_reg"));
    setSubmitting(true);
    const { error } = await (supabase as any).from("issue_reports").insert({
      reg_no: (student?.reg_no || reg).toUpperCase(),
      full_name: student?.full_name || "—",
      phone: issue.phone || student?.phone || null,
      email: issue.email || null,
      category: issue.category,
      message: issue.message,
    });
    setSubmitting(false);
    if (error) return toast.error(error.message);
    toast.success(t("issue_received"));
    setIssue({ category: "test1", message: "", phone: "", email: "" });
    if (student) lookup(student.reg_no);
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

        <Card className="border-2 border-primary/25 shadow-lg">
          <CardContent className="space-y-2 p-4">
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
                {t("look_up")}
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

        {student && (
          <Card className="animate-fade-in border-2 border-primary/25 shadow-lg">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-primary" /> {t("your_details")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: t("reg_number"), value: student.reg_no },
                  { label: t("semina"), value: student.semina },
                  { label: t("group"), value: student.student_group },
                  { label: t("course"), value: student.course || "—" },
                ].map((f) => (
                  <div
                    key={f.label}
                    className="rounded-xl border border-primary/15 bg-primary/5 p-2.5"
                  >
                    <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      {f.label}
                    </div>
                    <div className="truncate text-sm font-semibold">{f.value || "—"}</div>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{student.full_name}</span>
                {formatAcademicSummary(student) && <span>• {formatAcademicSummary(student)}</span>}
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="w-full border-primary/30 font-bold sm:w-auto"
              >
                <a href="#edit-taasrifa">{t("edit_card_title")}</a>
              </Button>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="edit" id="edit-taasrifa" className="scroll-mt-20">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="edit" className="gap-1">
              <UserCog className="h-4 w-4" /> {t("update_title")}
            </TabsTrigger>
            <TabsTrigger value="issue" className="gap-1" disabled={!settings?.issues_enabled}>
              <AlertTriangle className="h-4 w-4" /> {t("tab_issue")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="edit">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("edit_card_title")}</CardTitle>
                {!settings?.profile_edits_enabled && (
                  <p className="flex items-center gap-1 text-xs text-amber-600">
                    <Clock className="h-3 w-3" /> {t("edits_disabled")}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {!student && (
                  <p className="text-sm text-muted-foreground">{t("confirm_reg_first")}</p>
                )}
                {student && (
                  <>
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
                        <Label>{t("semina")}</Label>
                        <Select
                          value={edit.new_semina}
                          onValueChange={(v) => setEdit({ ...edit, new_semina: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {seminaList.map((s) => (
                              <SelectItem key={s} value={s}>
                                {s}
                              </SelectItem>
                            ))}
                            {edit.new_semina && !seminaList.includes(edit.new_semina) && (
                              <SelectItem value={edit.new_semina}>{edit.new_semina}</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>{t("group")}</Label>
                        <Select
                          value={edit.new_student_group}
                          onValueChange={(v) => setEdit({ ...edit, new_student_group: v })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {groupList.map((g) => (
                              <SelectItem key={g} value={g}>
                                {g}
                              </SelectItem>
                            ))}
                            {edit.new_student_group &&
                              !groupList.includes(edit.new_student_group) && (
                                <SelectItem value={edit.new_student_group}>
                                  {edit.new_student_group}
                                </SelectItem>
                              )}
                            {edit.new_student_group &&
                              !groupList.includes(edit.new_student_group) && (
                                <SelectItem value={edit.new_student_group}>
                                  {edit.new_student_group}
                                </SelectItem>
                              )}
                          </SelectContent>
                        </Select>
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
                        <Select
                          value={edit.new_study_year}
                          onValueChange={(v) => setEdit({ ...edit, new_study_year: v })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={t("choose_year")} />
                          </SelectTrigger>
                          <SelectContent>
                            {studyYears.map((y) => (
                              <SelectItem key={y} value={String(y)}>
                                {t("year_n", { n: y })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                    <Button
                      onClick={submitEdit}
                      disabled={submitting || !settings?.profile_edits_enabled}
                      className="w-full font-bold"
                    >
                      {submitting ? t("sending") : t("submit_request")}
                    </Button>
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
            </Card>
          </TabsContent>

          <TabsContent value="issue">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-4 w-4" /> {t("issue_card_title")}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Kwa wasiofanya Test 1 / Test 2 au wenye matatizo yoyote — andika hapa, admin
                  atapokea.
                </p>
                {!settings?.issues_enabled && (
                  <p className="flex items-center gap-1 text-xs text-amber-600">
                    <Clock className="h-3 w-3" /> {t("issues_disabled")}
                  </p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>{t("issue_type")}</Label>
                  <Select
                    value={issue.category}
                    onValueChange={(v) => setIssue({ ...issue, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="test1">Sikufanya Test 1</SelectItem>
                      <SelectItem value="test2">Sikufanya Test 2</SelectItem>
                      <SelectItem value="login">Tatizo la Kuingia</SelectItem>
                      <SelectItem value="result">Tatizo la Matokeo</SelectItem>
                      <SelectItem value="general">Nyingine</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Simu</Label>
                    <Input
                      value={issue.phone}
                      onChange={(e) => setIssue({ ...issue, phone: e.target.value })}
                      placeholder="07XXXXXXXX"
                    />
                  </div>
                  <div>
                    <Label>Barua-pepe (Email)</Label>
                    <Input
                      type="email"
                      value={issue.email}
                      onChange={(e) => setIssue({ ...issue, email: e.target.value })}
                      placeholder="jina@email.com"
                    />
                  </div>
                </div>
                <div>
                  <Label>{t("issue_message")} *</Label>
                  <Textarea
                    rows={4}
                    value={issue.message}
                    onChange={(e) => setIssue({ ...issue, message: e.target.value })}
                    placeholder={t("issue_placeholder")}
                  />
                </div>
                <Button
                  onClick={submitIssue}
                  disabled={submitting || !settings?.issues_enabled}
                  className="w-full font-bold"
                >
                  {t("submit_issue")}
                </Button>

                {myIssues.length > 0 && (
                  <div className="pt-3 border-t space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground">
                      {t("my_issues")}:
                    </div>
                    {myIssues.map((r) => (
                      <div key={r.id} className="text-xs p-2 rounded bg-muted">
                        <div className="flex justify-between gap-2">
                          <b>{r.category}</b>
                          <span
                            className={
                              r.status === "resolved" ? "text-green-600" : "text-amber-600"
                            }
                          >
                            {r.status}
                          </span>
                        </div>
                        <div className="text-muted-foreground mt-1">{r.message}</div>
                        {r.admin_reply && (
                          <div className="mt-1 p-1 bg-primary/10 rounded">
                            <b>Jibu la Admin:</b> {r.admin_reply}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
