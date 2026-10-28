import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device-id";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";
import {
  CURRENT_ACADEMIC_YEAR,
  GROUPS,
  SEMESTERS,
  isSemesterActive,
  studyYearsFor,
} from "@/lib/academicTargeting";
import { useI18n } from "@/lib/i18n";
import { loadDirectory } from "@/lib/directory";
import { isMissingColumnError } from "@/lib/studentProfile";

export const Route = createFileRoute("/register")({
  component: RegisterPage,
  head: () => ({
    meta: [
      { title: "Usajili wa Mwanafunzi — Islamic Studies Test" },
      { name: "description", content: "Jisajili kuingia kwenye mitihani ya Islamic Studies." },
      { property: "og:title", content: "Usajili wa Mwanafunzi — Islamic Studies Test" },
    ],
  }),
});

function RegisterPage() {
  const nav = useNavigate();
  const { t } = useI18n();
  const [form, setForm] = useState({
    reg_no: "",
    full_name: "",
    phone: "",
    course: "",
    age: "",
    gender: "Mwanaume",
    semina: "",
    student_group: "",
    study_year: "",
    semester: "",
    academic_year: CURRENT_ACADEMIC_YEAR,
  });
  const [seminaList, setSeminaList] = useState<string[]>([]);
  const [groupList, setGroupList] = useState<string[]>([]);
  const [courseList, setCourseList] = useState<string[]>([]);
  const [studyYears, setStudyYears] = useState<number[]>(studyYearsFor(2));
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [geo, setGeo] = useState<any>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const base =
      "semina_list, group_list, attendance_lat, attendance_lng, register_radius_m, register_gps_required";
    const optional =
      "course_list, program_years, academic_years_list, current_academic_year, current_semester";
    const apply = (data: any) => {
      if (!data) return;
      setSeminaList((data.semina_list as string[]) || []);
      setGroupList([...GROUPS]);
      setCourseList((data.course_list as string[]) || []);
      // Settings lists are a seed; merge in whatever the cohort actually uses.
      loadDirectory(data).then((dir) => {
        if (dir.semina.length) setSeminaList(dir.semina);
        if (dir.courses.length) setCourseList(dir.courses);
      });
      setStudyYears(studyYearsFor(data.program_years ?? 2));
      setForm((f) => ({
        ...f,
        semester: f.semester || data.current_semester || "",
        academic_year: CURRENT_ACADEMIC_YEAR,
      }));
      setGeo(data);
    };
    // These columns arrive with drizzle/migrations/0004_add_semester.sql; if they
    // are not there yet, still load everything else.
    supabase
      .from("app_settings")
      .select(`${base}, ${optional}`)
      .eq("id", 1)
      .single()
      .then(({ data, error }: { data: any; error: any }) => {
        if (error && isMissingColumnError(error)) {
          supabase
            .from("app_settings")
            .select(base)
            .eq("id", 1)
            .single()
            .then(({ data: d2 }: { data: any }) => apply(d2));
          return;
        }
        apply(data);
      });
  }, []);

  const distanceM = (a: number, b: number, c: number, d: number) => {
    const R = 6371000,
      toR = (x: number) => (x * Math.PI) / 180;
    const dLat = toR(c - a),
      dLng = toR(d - b);
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(toR(a)) * Math.cos(toR(c)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  const checkLocation = (): Promise<boolean> =>
    new Promise((resolve) => {
      const needed =
        geo?.register_gps_required && geo?.attendance_lat != null && geo?.attendance_lng != null;
      if (!needed) return resolve(true);
      if (!navigator.geolocation) {
        toast.error("Kifaa chako hakina GPS. Usajili unahitaji uwe chuoni.");
        return resolve(false);
      }
      navigator.geolocation.getCurrentPosition(
        (p) => {
          const lat = p.coords.latitude,
            lng = p.coords.longitude;
          setPos({ lat, lng });
          const d = distanceM(lat, lng, geo.attendance_lat, geo.attendance_lng);
          const max = geo.register_radius_m || 800;
          if (d > max) {
            toast.error(
              `Uko mita ${Math.round(d)} kutoka chuo. Usajili unaruhusiwa ndani ya mita ${max} tu.`,
            );
            return resolve(false);
          }
          resolve(true);
        },
        () => {
          toast.error("Washa GPS (location) ili ujisajili — lazima uwe karibu na chuo.");
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 15000 },
      );
    });

  const handleReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !form.reg_no ||
      !form.full_name ||
      !form.phone ||
      !form.semina ||
      !form.student_group ||
      !form.study_year ||
      !form.academic_year
    ) {
      toast.error("Jaza taarifa zote zinazohitajika");
      return;
    }
    if (form.semester && !isSemesterActive(form.semester)) {
      toast.error("Semester hiyo bado haijawashwa. Chagua SEMESTER 1.");
      return;
    }
    setLoading(true);
    const ok = await checkLocation();
    setLoading(false);
    if (!ok) return;
    setConfirmOpen(true);
  };

  const submit = async () => {
    setLoading(true);
    const device_id = getDeviceId();
    // Zuia usajili maradufu — reg_no AU jina kamili
    const regUpper = form.reg_no.toUpperCase();
    const nameTrim = form.full_name.trim();
    const { data: byReg } = await supabase
      .from("students")
      .select("id, full_name, reg_no")
      .eq("reg_no", regUpper)
      .maybeSingle();
    const { data: byName } = await supabase
      .from("students")
      .select("id, full_name, reg_no")
      .ilike("full_name", nameTrim)
      .maybeSingle();
    if (byReg || byName) {
      const existing = byReg || byName;
      // Ruhusu mwenye reg_no ile ile aendelee (kazi anaingia tu)
      if (byReg && byReg.full_name.toLowerCase() === nameTrim.toLowerCase()) {
        localStorage.setItem("student_reg", byReg.reg_no);
        setLoading(false);
        setConfirmOpen(false);
        toast.success("Tayari umesajiliwa. Karibu tena!");
        nav({ to: "/exams" });
        return;
      }
      setLoading(false);
      setConfirmOpen(false);
      toast.error(
        `Tayari kuna usajili wa ${existing?.full_name} (${existing?.reg_no}). Nenda Update Taarifa kuomba marekebisho.`,
      );
      return;
    }
    const baseRow = {
      reg_no: form.reg_no,
      full_name: form.full_name,
      phone: form.phone,
      course: form.course || null,
      age: form.age ? Number(form.age) : null,
      gender: form.gender,
      semina: form.semina,
      student_group: form.student_group,
      study_year: Number(form.study_year),
      academic_year: form.academic_year,
      device_id,
    };
    // `semester` is added by drizzle/migrations/0004_add_semester.sql; retry
    // without it so registration still works before the migration is applied.
    let { error } = await supabase.from("students").insert({
      ...baseRow,
      semester: form.semester || null,
    } as any);
    if (error && isMissingColumnError(error)) {
      ({ error } = await supabase.from("students").insert(baseRow as any));
    }
    setLoading(false);
    setConfirmOpen(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    localStorage.setItem("student_reg", form.reg_no);
    toast.success("Usajili umethibitishwa kikamilifu!");
    nav({ to: "/exams" });
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="container mx-auto px-4 py-8 max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>{t("register_title")}</CardTitle>
            <p className="text-sm text-muted-foreground">{t("register_sub")}</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleReview} className="space-y-4">
              <div>
                <Label>{t("reg_number")} *</Label>
                <Input
                  value={form.reg_no}
                  onChange={(e) => setForm({ ...form, reg_no: e.target.value.toUpperCase() })}
                  placeholder="Mfano: MUM2021-04-08787"
                  required
                />
              </div>
              <div>
                <Label>{t("full_name")} *</Label>
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("phone")} *</Label>
                  <Input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="07XXXXXXXX"
                    required
                  />
                </div>
                <div>
                  <Label>{t("course")}</Label>
                  <Select
                    value={form.course}
                    onValueChange={(v) => setForm({ ...form, course: v })}
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
                      {form.course && !courseList.includes(form.course) && (
                        <SelectItem value={form.course}>{form.course}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("age")}</Label>
                  <Input
                    type="number"
                    value={form.age}
                    onChange={(e) => setForm({ ...form, age: e.target.value })}
                  />
                </div>
                <div>
                  <Label>{t("gender")}</Label>
                  <Select
                    value={form.gender}
                    onValueChange={(v) => setForm({ ...form, gender: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mwanaume">{t("male")}</SelectItem>
                      <SelectItem value="Mwanamke">{t("female")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{t("semina")} *</Label>
                <Select value={form.semina} onValueChange={(v) => setForm({ ...form, semina: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("choose_semina")} />
                  </SelectTrigger>
                  <SelectContent>
                    {seminaList.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("group")} *</Label>
                <Select
                  value={form.student_group}
                  onValueChange={(v) => setForm({ ...form, student_group: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("choose_group")} />
                  </SelectTrigger>
                  <SelectContent>
                    {groupList.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                    {form.student_group && !groupList.includes(form.student_group) && (
                      <SelectItem value={form.student_group}>{form.student_group}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t("study_year")} *</Label>
                  <Select
                    value={form.study_year}
                    onValueChange={(v) => setForm({ ...form, study_year: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("choose_year")} />
                    </SelectTrigger>
                    <SelectContent>
                      {studyYears.map((year) => (
                        <SelectItem key={year} value={String(year)}>
                          {t("year_n", { n: year })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("semester")}</Label>
                  <Select
                    value={form.semester}
                    onValueChange={(v) => setForm({ ...form, semester: v })}
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
              <Button type="submit" className="w-full" disabled={loading}>
                {t("continue_confirm")}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" /> Thibitisha Usajili
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                Tafadhali hakiki taarifa zako kabla ya kuwasilisha:
              </p>
              <div className="rounded-lg border p-3 grid grid-cols-2 gap-2 bg-muted/30">
                <div className="text-muted-foreground">Reg Namba:</div>
                <div className="font-semibold">{form.reg_no}</div>
                <div className="text-muted-foreground">Jina:</div>
                <div className="font-semibold">{form.full_name}</div>
                <div className="text-muted-foreground">Simu:</div>
                <div>{form.phone}</div>
                <div className="text-muted-foreground">Kozi:</div>
                <div>{form.course || "-"}</div>
                <div className="text-muted-foreground">Umri:</div>
                <div>{form.age || "-"}</div>
                <div className="text-muted-foreground">Jinsia:</div>
                <div>{form.gender}</div>
                <div className="text-muted-foreground">Semina:</div>
                <div>{form.semina}</div>
                <div className="text-muted-foreground">Group:</div>
                <div>{form.student_group}</div>
                <div className="text-muted-foreground">Mwaka:</div>
                <div>Mwaka wa {form.study_year}</div>
                <div className="text-muted-foreground">Semester:</div>
                <div>{form.semester || "-"}</div>
                <div className="text-muted-foreground">Kitaaluma:</div>
                <div>{form.academic_year}</div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={loading}>
                Rudi Sahihisha
              </Button>
              <Button onClick={submit} disabled={loading}>
                {loading ? "Inathibitisha..." : "Thibitisha & Sajili"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
