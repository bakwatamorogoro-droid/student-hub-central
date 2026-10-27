import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UserCog, AlertTriangle, CheckCircle2, Mail, Clock } from "lucide-react";
import { GroupSwitcher } from "@/components/GroupSwitcher";
import { findStudentsByQuery } from "@/lib/studentSearch";
import { StudentMatchesPicker } from "@/components/StudentMatchesPicker";
import { updateStudentProfile } from "@/lib/studentProfile";
import { ACADEMIC_YEARS, SEMESTERS, formatAcademicSummary, studyYearsFor } from "@/lib/academicTargeting";

export const Route = createFileRoute("/student")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Huduma kwa Mwanafunzi — Islamic Studies Test" },
      { name: "description", content: "Huduma na maombi kwa wanafunzi wa Islamic Studies." },
      { property: "og:title", content: "Huduma — Islamic Studies Test" },
    ],
  }),
});

function Page() {
  const [settings, setSettings] = useState<any>(null);
  const [seminaList, setSeminaList] = useState<string[]>([]);
  const [groupList, setGroupList] = useState<string[]>([]);
  const [courseList, setCourseList] = useState<string[]>([]);
  const [studyYears, setStudyYears] = useState<number[]>(studyYearsFor(2));
  const [academicYears, setAcademicYears] = useState<string[]>([...ACADEMIC_YEARS]);
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
    reason: "",
  });
  const [wrongReg, setWrongReg] = useState(false);
  const [editStatus, setEditStatus] = useState<any[]>([]);
  // issue form
  const [issue, setIssue] = useState({ category: "test1", message: "", phone: "", email: "" });
  const [myIssues, setMyIssues] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.from("app_settings").select("*").eq("id", 1).single().then(({ data }: { data: any }) => {
      setSettings(data);
      setSeminaList((data?.semina_list as string[]) || []);
      setGroupList((data?.group_list as string[]) || []);
      setCourseList((data?.course_list as string[]) || []);
      setStudyYears(studyYearsFor(data?.program_years ?? 2));
      const years = (data?.academic_years_list as string[]) || [];
      if (years.length) setAcademicYears(years);
    });
    const saved = localStorage.getItem("student_reg");
    if (saved) { setReg(saved); lookup(saved); }
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
      new_academic_year: data.academic_year || "",
      reason: "",
    });
    localStorage.setItem("student_reg", data.reg_no);
    const { data: reqs } = await (supabase as any).from("profile_update_requests").select("*").eq("student_id", data.id).order("created_at", { ascending: false });
    setEditStatus(reqs || []);
    const { data: iss } = await (supabase as any).from("issue_reports").select("*").eq("reg_no", data.reg_no).order("created_at", { ascending: false });
    setMyIssues(iss || []);
  };

  const lookup = async (r: string) => {
    if (!r) return;
    const results = await findStudentsByQuery(r);
    if (results.length === 0) { toast.error("Hakuna mwanafunzi anayelingana. Hakikisha umeandika sahihi au jisajili."); setStudent(null); setMatches([]); return; }
    if (results.length === 1) { confirmStudent(results[0]); return; }
    setStudent(null);
    setMatches(results);
    toast.info(`Tumepata ${results.length} wanafunzi — chagua wewe ni nani.`);
  };

  const submitEdit = async () => {
    if (!student) return;
    if (!settings?.profile_edits_enabled) return toast.error("Admin hajawasha huduma ya marekebisho kwa sasa.");
    setSubmitting(true);
    const reasonPrefix = wrongReg ? "[NILIKOSEA REG KABISA] Tafadhali admin athibitishe matokeo yangu ya awali yahamishwe kwa Reg mpya. " : "";
    const newRegUp = edit.new_reg_no?.toUpperCase() || null;
    // Auto-approval: tu kwa marekebisho ya kawaida (sio "nilikosea reg kabisa")
    const autoApprove = !wrongReg;
    const { data: inserted, error } = await (supabase as any).from("profile_update_requests").insert({
      student_id: student.id,
      current_reg_no: student.reg_no,
      current_full_name: student.full_name,
      new_reg_no: newRegUp,
      new_full_name: edit.new_full_name || null,
      new_semina: edit.new_semina || null,
      new_student_group: edit.new_student_group || null,
      reason: (reasonPrefix + (edit.reason || "")).trim() || null,
      status: autoApprove ? "approved" : "pending",
    }).select().single();
    if (error) { setSubmitting(false); return toast.error(error.message); }

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
        await (supabase as any).from("profile_update_requests").update({ status: "pending" }).eq("id", (inserted as any).id);
        setSubmitting(false);
        return toast.error("Marekebisho yamehifadhiwa kama 'pending' (Admin atathibitisha): " + rpcErr.message);
      }
      // apply_profile_update only covers reg/name/semina/group, so write the
      // academic fields separately.
      const { error: acadErr, semesterUnsupported } = await updateStudentProfile(student.id, {
        course: edit.new_course,
        study_year: edit.new_study_year,
        semester: edit.new_semester,
        academic_year: edit.new_academic_year,
      });
      await (supabase as any).from("profile_update_requests").update({ reviewed_at: new Date().toISOString() }).eq("id", (inserted as any).id);
      // Refresh local student to reflect new values
      const newRef = newRegUp || student.reg_no;
      localStorage.setItem("student_reg", newRef);
      setSubmitting(false);
      setWrongReg(false);
      if (acadErr) {
        toast.warning("Taarifa za msingi zimehifadhiwa, lakini kozi/mwaka haukuhifadhiwa: " + acadErr.message);
      } else if (semesterUnsupported) {
        toast.warning("Imehifadhiwa — lakini Semester bado haijawashwa kwenye mfumo (admin aendeshe migration 0004).");
      } else {
        toast.success("✓ Marekebisho yamethibitishwa kiotomatiki na yamehifadhiwa.");
      }
      lookup(newRef);
      return;
    }

    setSubmitting(false);
    toast.success("Ombi la kurekebisha Reg lilitumwa. Admin atathibitisha matokeo yako ya awali.");
    setWrongReg(false);
    lookup(student.reg_no);
  };

  const submitIssue = async () => {
    if (!issue.message.trim()) return toast.error("Andika changamoto yako");
    if (!student && (!reg || reg.length < 3)) return toast.error("Ingiza Reg Namba yako");
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
    toast.success("Changamoto imepokelewa! Admin atajibu hivi karibuni.");
    setIssue({ category: "test1", message: "", phone: "", email: "" });
    if (student) lookup(student.reg_no);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-secondary/10">
      <SiteHeader />
      <main className="container mx-auto px-4 py-8 max-w-3xl space-y-5">
        <div className="text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">Huduma kwa Mwanafunzi</h1>
          <p className="text-sm text-muted-foreground mt-1">Omba marekebisho ya taarifa zako, au tuma changamoto yoyote.</p>
        </div>

        <Card className="border-2 border-primary/20">
          <CardContent className="p-4 space-y-2">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input value={reg} onChange={(e) => setReg(e.target.value.toUpperCase())} placeholder="Ingiza Reg Namba au jina (mfano: jina la mwisho)" className="flex-1" onKeyDown={(e) => { if (e.key === "Enter") lookup(reg); }} />
              <Button onClick={() => lookup(reg)}>Thibitisha</Button>
            </div>
            {matches.length > 0 && (
              <StudentMatchesPicker matches={matches} onConfirm={confirmStudent} onCancel={() => setMatches([])} />
            )}
          </CardContent>
        </Card>

        {student && (
          <div className="rounded-lg p-3 bg-primary/5 border border-primary/20 text-sm space-y-0.5">
            <div>
              <CheckCircle2 className="h-4 w-4 inline text-primary mr-1" />
              <b>{student.full_name}</b> — {student.reg_no} • {student.semina} • {student.student_group}
            </div>
            {(student.course || student.study_year || student.academic_year) && (
              <div className="text-xs text-muted-foreground pl-5">
                {student.course && <span>{student.course}</span>}
                {formatAcademicSummary(student) && (
                  <span>{student.course ? " • " : ""}{formatAcademicSummary(student)}</span>
                )}
              </div>
            )}
          </div>
        )}

        {student && <GroupSwitcher student={student} onChanged={() => lookup(student.reg_no)} />}


        <Tabs defaultValue="edit">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="edit" className="gap-1"><UserCog className="h-4 w-4" /> Marekebisho ya Wasifu</TabsTrigger>
            <TabsTrigger value="issue" className="gap-1"><AlertTriangle className="h-4 w-4" /> Changamoto</TabsTrigger>
          </TabsList>

          <TabsContent value="edit">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Omba Marekebisho</CardTitle>
                {!settings?.profile_edits_enabled && (
                  <p className="text-xs text-amber-600 flex items-center gap-1"><Clock className="h-3 w-3" /> Huduma hii imezimwa na admin kwa sasa.</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {!student && <p className="text-sm text-muted-foreground">Thibitisha Reg Namba kwanza.</p>}
                {student && (
                  <>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div><Label>Reg Namba Mpya</Label><Input value={edit.new_reg_no} onChange={(e) => setEdit({ ...edit, new_reg_no: e.target.value.toUpperCase() })} /></div>
                      <div><Label>Jina Kamili Jipya</Label><Input value={edit.new_full_name} onChange={(e) => setEdit({ ...edit, new_full_name: e.target.value })} /></div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <Label>Semina</Label>
                        <Select value={edit.new_semina} onValueChange={(v) => setEdit({ ...edit, new_semina: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {seminaList.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            {edit.new_semina && !seminaList.includes(edit.new_semina) && <SelectItem value={edit.new_semina}>{edit.new_semina}</SelectItem>}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Group</Label>
                        <Select value={edit.new_student_group} onValueChange={(v) => setEdit({ ...edit, new_student_group: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {groupList.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                            {edit.new_student_group && !groupList.includes(edit.new_student_group) && <SelectItem value={edit.new_student_group}>{edit.new_student_group}</SelectItem>}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <Label>Kozi</Label>
                        <Select value={edit.new_course} onValueChange={(v) => setEdit({ ...edit, new_course: v })}>
                          <SelectTrigger><SelectValue placeholder="Chagua kozi" /></SelectTrigger>
                          <SelectContent>
                            {courseList.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            {edit.new_course && !courseList.includes(edit.new_course) && <SelectItem value={edit.new_course}>{edit.new_course}</SelectItem>}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Mwaka wa Masomo</Label>
                        <Select value={edit.new_study_year} onValueChange={(v) => setEdit({ ...edit, new_study_year: v })}>
                          <SelectTrigger><SelectValue placeholder="Chagua mwaka" /></SelectTrigger>
                          <SelectContent>
                            {studyYears.map((y) => <SelectItem key={y} value={String(y)}>Mwaka wa {y}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <Label>Semester</Label>
                        <Select value={edit.new_semester} onValueChange={(v) => setEdit({ ...edit, new_semester: v })}>
                          <SelectTrigger><SelectValue placeholder="Chagua semester" /></SelectTrigger>
                          <SelectContent>
                            {SEMESTERS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Mwaka wa Kitaaluma</Label>
                        <Select value={edit.new_academic_year} onValueChange={(v) => setEdit({ ...edit, new_academic_year: v })}>
                          <SelectTrigger><SelectValue placeholder="Mfano 2026/2027" /></SelectTrigger>
                          <SelectContent>
                            {academicYears.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div><Label>Sababu (hiari)</Label><Textarea value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} placeholder="Mfano: jina lilikuwa limechapwa vibaya" /></div>
                    <label className="flex items-start gap-2 p-3 rounded-lg border-2 border-amber-500/40 bg-amber-500/5 cursor-pointer hover:bg-amber-500/10 transition-colors">
                      <input
                        type="checkbox"
                        checked={wrongReg}
                        onChange={(e) => setWrongReg(e.target.checked)}
                        className="mt-1 h-4 w-4 accent-amber-600"
                      />
                      <div className="text-sm">
                        <div className="font-semibold text-amber-700 dark:text-amber-400">⚠ Nilikosea Reg Namba kabisa</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Kagua ikiwa ulijiandikisha kwa Reg isiyo sahihi na unataka matokeo yako ya awali yahamishwe kwa Reg mpya. Admin atathibitisha kabla ya kuhamisha.
                        </div>
                      </div>
                    </label>
                    <Button onClick={submitEdit} disabled={submitting || !settings?.profile_edits_enabled} className="w-full">Tuma Ombi</Button>
                  </>
                )}
                {editStatus.length > 0 && (
                  <div className="pt-3 border-t space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground">Maombi yako:</div>
                    {editStatus.map((r) => (
                      <div key={r.id} className="text-xs p-2 rounded bg-muted flex justify-between gap-2">
                        <span>{r.new_full_name || r.current_full_name} / {r.new_reg_no || r.current_reg_no}</span>
                        <span className={r.status === "approved" ? "text-green-600 font-bold" : r.status === "rejected" ? "text-red-600" : "text-amber-600"}>{r.status}</span>
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
                <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" /> Wasilisha Changamoto</CardTitle>
                <p className="text-xs text-muted-foreground">Kwa wasiofanya Test 1 / Test 2 au wenye matatizo yoyote — andika hapa, admin atapokea.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Aina ya Changamoto</Label>
                  <Select value={issue.category} onValueChange={(v) => setIssue({ ...issue, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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
                  <div><Label>Simu</Label><Input value={issue.phone} onChange={(e) => setIssue({ ...issue, phone: e.target.value })} placeholder="07XXXXXXXX" /></div>
                  <div><Label>Barua-pepe (Email)</Label><Input type="email" value={issue.email} onChange={(e) => setIssue({ ...issue, email: e.target.value })} placeholder="jina@email.com" /></div>
                </div>
                <div><Label>Eleza Changamoto Yako *</Label><Textarea rows={4} value={issue.message} onChange={(e) => setIssue({ ...issue, message: e.target.value })} placeholder="Andika kwa kina..." /></div>
                <Button onClick={submitIssue} disabled={submitting} className="w-full">Tuma Changamoto</Button>

                {myIssues.length > 0 && (
                  <div className="pt-3 border-t space-y-2">
                    <div className="text-xs font-semibold text-muted-foreground">Changamoto zako za awali:</div>
                    {myIssues.map((r) => (
                      <div key={r.id} className="text-xs p-2 rounded bg-muted">
                        <div className="flex justify-between gap-2">
                          <b>{r.category}</b>
                          <span className={r.status === "resolved" ? "text-green-600" : "text-amber-600"}>{r.status}</span>
                        </div>
                        <div className="text-muted-foreground mt-1">{r.message}</div>
                        {r.admin_reply && <div className="mt-1 p-1 bg-primary/10 rounded"><b>Jibu la Admin:</b> {r.admin_reply}</div>}
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