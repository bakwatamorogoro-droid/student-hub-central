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
import { checkRegistrationConflicts } from "@/lib/registration";
import { displayRegNo } from "@/lib/regNo";
import { getDeviceId } from "@/lib/device-id";
import { findStudentsByQuery } from "@/lib/studentSearch";
import {
  bindDevice,
  biometricAvailable,
  buildRegistrationReceipt,
  deviceId as regDeviceId,
  enrollBiometric,
  hasBiometricFor,
  receiptPayload,
  regNoForDevice,
  storedBiometricKind,
  verifyBiometric,
  type BiometricKind,
  type RegistrationReceipt,
} from "@/lib/biometric";
import { QrCodeDisplay } from "@/components/QrCodeDisplay";
import { toast } from "@/lib/toast";
import { CheckCircle2, Fingerprint, ScanFace, ShieldCheck, Users, Loader2 } from "lucide-react";
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
import { storageSet } from "@/lib/safe-storage";

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
  // Set once the student has accepted that the shared name is a coincidence, so
  // the second submit skips the question.
  const [nameConfirmed, setNameConfirmed] = useState(false);
  const [nameConfirmOpen, setNameConfirmOpen] = useState(false);

  // The Reg Namba lookup: the student types their number and the name comes back
  // by itself, so the two fields can never disagree about who is registering.
  const [lookupState, setLookupState] = useState<"idle" | "looking" | "found" | "none">("idle");
  const [lookedUpName, setLookedUpName] = useState("");
  // A returning student is already on file, so their name is shown and locked
  // rather than typed: retyping it is how a duplicate gets created.
  const [returningName, setReturningName] = useState<string | null>(null);
  const [returningReg, setReturningReg] = useState<string | null>(null);

  // What this phone can prove, and what it is already holding. `regNoForDevice`
  // non-null means the phone belongs to someone: another number is refused.
  const [bio, setBio] = useState<{ available: boolean; kind: BiometricKind }>({
    available: false,
    kind: "none",
  });
  const [bioDone, setBioDone] = useState<BiometricKind | "none">("none");
  const [bioBusy, setBioBusy] = useState(false);
  const [boundReg, setBoundReg] = useState<string | null>(() => regNoForDevice());
  // Set once the row is written and the QR receipt is ready.
  const [receipt, setReceipt] = useState<RegistrationReceipt | null>(null);

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
    // are not there yet, still load everything else. A select names only one
    // unknown column, so trim them one at a time rather than assuming a single
    // retry is enough.
    const loadSettings = async (columns: string[]): Promise<void> => {
      for (let i = 0; i <= columns.length; i++) {
        const wanted = [base, ...columns.slice(i)].join(", ");
        const { data, error } = await supabase
          .from("app_settings")
          .select(wanted)
          .eq("id", 1)
          .single();
        if (!error) return apply(data);
        if (!isMissingColumnError(error)) return;
      }
    };
    const optionalColumns = optional.split(", ");
    void loadSettings(optionalColumns);
  }, []);

  // Asked once on mount: whether this phone can prompt for a fingerprint or a
  // face at all. A phone with no sensor simply skips the step, which is why the
  // device binding below is the part that carries the guarantee.
  useEffect(() => {
    let alive = true;
    biometricAvailable().then((a) => {
      if (alive) setBio(a);
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Reg Namba → the name on file.
   *
   * Fires once the number is long enough to be one, and writes the name into the
   * form so the student sees who they are registering as. A number already on
   * file comes back as `returning`, and the name is locked rather than typed.
   */
  const runLookup = async (raw: string) => {
    const value = displayRegNo(raw);
    if (!value || value.length < 5) {
      setLookupState("idle");
      setLookedUpName("");
      setReturningName(null);
      setReturningReg(null);
      return;
    }
    setLookupState("looking");
    const rows = await findStudentsByQuery(value);
    // Only an exact number counts: a name search that happens to match must not
    // be mistaken for "this student exists".
    const exact = rows.filter((r) => displayRegNo(r.reg_no) === value);
    if (exact.length > 0) {
      const row = exact[0];
      setLookedUpName(row.full_name || "");
      setReturningName(row.full_name || "");
      setReturningReg(displayRegNo(row.reg_no));
      setLookupState("found");
      setForm((f) => ({
        ...f,
        full_name: row.full_name || f.full_name,
        phone: row.phone || f.phone,
        course: row.course || f.course,
        semina: row.semina || f.semina,
        student_group: row.student_group || f.student_group,
        study_year: row.study_year ? String(row.study_year) : f.study_year,
        gender: row.gender || f.gender,
        age: row.age ? String(row.age) : f.age,
      }));
      return;
    }
    setReturningName(null);
    setReturningReg(null);
    setLookedUpName("");
    setLookupState("none");
  };

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

  const editField = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setNameConfirmed(false);
  };

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
    // The device binding is checked before anything else: this phone may only
    // ever carry one Reg Namba, and that holds even where there is no sensor.
    const owner = regNoForDevice();
    const mine = displayRegNo(form.reg_no);
    if (owner && owner !== mine) {
      toast.error(
        `Simu hii imesajiliwa kwa ${owner}. Reg Namba nyingine haikubaliwi kwenye simu hii. Omba msimamizi akuwezeshe.`,
      );
      return;
    }
    setLoading(true);
    const ok = await checkLocation();
    setLoading(false);
    if (!ok) return;
    setConfirmOpen(true);
  };

  /**
   * The biometric step, run when the student submits the review dialog.
   *
   * A phone with a sensor prompts for a fingerprint or a face, so the student
   * physically confirms the registration. A phone without one is passed through
   * on the device binding alone — refusing it would lock out a whole class of
   * device, and the binding is the guarantee that actually holds everywhere.
   */
  const runBiometricGate = async (): Promise<boolean> => {
    const reg = displayRegNo(form.reg_no);
    if (!bio.available) {
      setBioDone("none");
      return true;
    }
    setBioBusy(true);
    try {
      // First time on this phone: enrol the credential. Afterwards, only a
      // confirmation is needed, and a cleared credential is re-enrolled.
      const res = hasBiometricFor(reg)
        ? await verifyBiometric(reg)
        : await enrollBiometric(reg, form.full_name);
      if (res.ok) {
        setBioDone(res.kind);
        return true;
      }
      if (res.reason === "cancelled") {
        toast.error("Umesitisha uthibitisho wa kidole. Jaribu tena kusajili.");
      } else if (res.reason === "unsupported") {
        setBioDone("none");
        return true;
      } else {
        toast.error(res.message || "Uthibitisho wa kidole haukufanikiwa. Jaribu tena.");
      }
      return false;
    } finally {
      setBioBusy(false);
    }
  };

  const submit = async () => {
    // The biometric gate comes first: nothing is written until the student has
    // confirmed it is them on this phone.
    const passed = await runBiometricGate();
    if (!passed) return;
    setLoading(true);
    const device_id = getDeviceId();
    // The number is stored in one tidy shape, so the roster does not collect the
    // spacing variants that produced the duplicates in the first place.
    const regUpper = displayRegNo(form.reg_no);
    const nameTrim = form.full_name.trim();

    const conflict = await checkRegistrationConflicts(regUpper, nameTrim);
    if (conflict.kind === "error") {
      setLoading(false);
      setConfirmOpen(false);
      toast.error(conflict.message);
      return;
    }
    if (conflict.kind === "returning") {
      storageSet("student_reg", conflict.regNo);
      // A returning student is already on file; tie the phone to them so the
      // device rule applies from this visit onward, and show the same receipt.
      bindDevice(conflict.regNo);
      setBoundReg(conflict.regNo);
      setReceipt(
        buildRegistrationReceipt({
          regNo: conflict.regNo,
          fullName: conflict.fullName,
          semina: form.semina || null,
          group: form.student_group || null,
          verified: bioDone,
        }),
      );
      setLoading(false);
      setConfirmOpen(false);
      toast.success("Tayari umesajiliwa. Karibu tena!");
      return;
    }
    if (conflict.kind === "taken_by_other") {
      setLoading(false);
      setConfirmOpen(false);
      toast.error(
        `Reg Namba ${conflict.regNo} imesajiliwa kwa jina ${conflict.fullName}. Kama wewe ni huyu, nenda Update Taarifa. Kama sivyo, mwone msimamizi.`,
      );
      return;
    }
    // A shared name is a question for the student, not a refusal: both students
    // are real, and only they know whether the other entry is theirs.
    if (conflict.kind === "shared_name" && !nameConfirmed) {
      setLoading(false);
      setConfirmOpen(false);
      setNameConfirmOpen(true);
      return;
    }

    const baseRow = {
      reg_no: regUpper,
      full_name: form.full_name.trim(),
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
    storageSet("student_reg", regUpper);
    // The phone now belongs to this student: a different Reg Namba from here on
    // is refused before anything is written.
    bindDevice(regUpper);
    setBoundReg(regUpper);
    setReceipt(
      buildRegistrationReceipt({
        regNo: regUpper,
        fullName: nameTrim,
        semina: form.semina || null,
        group: form.student_group || null,
        verified: bioDone,
      }),
    );
    toast.success("Usajili umethibitishwa kikamilifu!");
  };

  // Once the row is written, the page becomes a receipt: who was registered, how
  // they proved it, and a QR the office can scan. There is no way back into the
  // form from here, because the registration is already done.
  if (receipt) {
    const proof =
      receipt.verified === "fingerprint"
        ? { icon: <Fingerprint className="h-4 w-4" />, label: "Kidole cha mkono" }
        : receipt.verified === "face"
          ? { icon: <ScanFace className="h-4 w-4" />, label: "Uso (Face ID)" }
          : { icon: <ShieldCheck className="h-4 w-4" />, label: "Kifaa kilichothibitishwa" };
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <main className="container mx-auto px-4 py-8 max-w-xl">
          <Card className="border-2 border-emerald-500/40">
            <CardHeader className="items-center text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15">
                <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <CardTitle className="mt-2 text-xl">Umejisajili kikamilifu</CardTitle>
              <p className="text-sm text-muted-foreground">
                Taarifa zako zimehifadhiwa na kifaa hiki kimefungwa kwa namba yako.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
                <div className="text-muted-foreground">Jina:</div>
                <div className="font-semibold">{receipt.fullName}</div>
                <div className="text-muted-foreground">Reg Namba:</div>
                <div className="font-mono font-semibold">{receipt.regNo}</div>
                <div className="text-muted-foreground">Semina:</div>
                <div>{receipt.semina || "—"}</div>
                <div className="text-muted-foreground">Group:</div>
                <div>{receipt.group || "—"}</div>
                <div className="text-muted-foreground">Uthibitisho:</div>
                <div className="flex items-center gap-1.5">
                  {proof.icon}
                  {proof.label}
                </div>
              </div>

              <div className="flex flex-col items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 p-4">
                <p className="text-sm font-medium">QR yako ya usajili</p>
                <QrCodeDisplay value={receiptPayload(receipt)} size={240} />
                <p className="text-center text-xs text-muted-foreground">
                  Onyesha QR hii kwa msimamizi au CR ili kuthibitisha usajili wako. Unaweza pia
                  kuipiga picha kwa kumbukumbu.
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => window.print()}>
                  Chapisha
                </Button>
                <Button className="flex-1" onClick={() => nav({ to: "/account" })}>
                  Endelea kwa PIN
                </Button>
              </div>
              <p className="text-center text-[11px] text-muted-foreground">
                Hatua inayofuata: weka PIN yako ili uweze kuingia na kuhudhuria mitihani.
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

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
                  onChange={(e) => {
                    const v = e.target.value.toUpperCase();
                    editField({ reg_no: v });
                    void runLookup(v);
                  }}
                  placeholder="Mfano: MUM2021-04-08787"
                  required
                />
                {lookupState === "looking" && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Inatafuta jina lako…
                  </p>
                )}
                {lookupState === "none" && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Namba hii haipo kwenye orodha. Jaza jina lako chini.
                  </p>
                )}
                {lookupState === "found" && returningName && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Umepatikana: {returningName}
                  </p>
                )}
                {boundReg && boundReg !== displayRegNo(form.reg_no) && (
                  <p className="mt-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs">
                    Simu hii imefungwa kwa <b>{boundReg}</b>. Reg Namba nyingine haitakubaliwa
                    kwenye simu hii.
                  </p>
                )}
              </div>
              <div>
                <Label>{t("full_name")} *</Label>
                <Input
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  readOnly={!!returningName}
                  required
                />
                {returningName && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Jina limetolewa kutoka Reg Namba yako — hauhitaji kuliandika.
                  </p>
                )}
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
              {/* What the phone can prove. The sensor prompt itself runs on the
                  final submit, so this panel only tells the student what to
                  expect — a fingerprint/face on a phone that has one, and the
                  device rule on every phone. */}
              <div className="flex gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
                {bio.available ? (
                  bio.kind === "face" ? (
                    <ScanFace className="h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <Fingerprint className="h-5 w-5 shrink-0 text-primary" />
                  )
                ) : (
                  <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
                )}
                <div className="text-xs">
                  <p className="font-semibold text-foreground">
                    {bio.available
                      ? bio.kind === "face"
                        ? "Utathibitishwa kwa uso (Face ID)"
                        : "Utathibitishwa kwa kidole cha mkono"
                      : "Uthibitisho wa kifaa"}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    {bio.available
                      ? "Unapogusa Thibitisha, simu yako itaomba uthibitisho. Kifaa hiki kitafungwa kwa Reg Namba yako pekee."
                      : "Simu hii haina kihisi cha kidole. Kifaa hiki kitafungwa kwa Reg Namba yako pekee — Reg Namba nyingine haitakubaliwa hapa."}
                  </p>
                  {hasBiometricFor(displayRegNo(form.reg_no)) && (
                    <p className="mt-1 flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Kifaa hiki kimekwisha hifadhi uthibitisho
                      wako
                      {storedBiometricKind(displayRegNo(form.reg_no)) === "face"
                        ? " (uso)"
                        : " (kidole)"}
                      .
                    </p>
                  )}
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={loading || bioBusy}>
                {bioBusy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Inathibitisha…
                  </>
                ) : (
                  t("continue_confirm")
                )}
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
              <p className="flex items-start gap-2 rounded-lg border border-primary/25 bg-primary/5 p-2 text-xs text-muted-foreground">
                {bio.available ? (
                  <Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                )}
                {bio.available
                  ? "Ukibonyeza Thibitisha, simu yako itaomba kidole au uso wako kuthibitisha ni wewe."
                  : "Kifaa hiki kitafungwa kwa Reg Namba yako pekee. Reg Namba nyingine haitakubaliwa kwenye simu hii."}
              </p>
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
        <Dialog open={nameConfirmOpen} onOpenChange={setNameConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" /> Jina lako linapatikana
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Kuna mwanafunzi mwingine aliye na jina linalofanana na{" "}
                <b>{form.full_name.trim()}</b>, lakini Reg Namba ni tofauti.
              </p>
              <p>
                Kama wewe ni mwanafunzi mpya, endelea. Kama Reg Namba yako tayari ilisajiliwa, tumia{" "}
                <b>Update Taarifa</b> badala yake ili usijiandikishe mara mbili.
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setNameConfirmOpen(false)}>
                Rudi
              </Button>
              <Button
                onClick={() => {
                  setNameConfirmed(true);
                  setNameConfirmOpen(false);
                  setConfirmOpen(true);
                }}
              >
                Ni jina langu — endelea
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
