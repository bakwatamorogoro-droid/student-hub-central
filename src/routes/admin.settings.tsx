import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import { alertInfo } from "@/lib/alerts";
import { Trash2, Upload, FileText, Lock, Copy, Unlock, AlertTriangle } from "lucide-react";
import { eatLocalInputToUtcIso, utcIsoToEatLocalInput } from "@/lib/time";
import { retryWithoutMissingColumns } from "@/lib/schema-retry";
import { ACADEMIC_YEARS, SEMESTERS, isSemesterActive } from "@/lib/academicTargeting";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/settings")({ component: Page });

function Page() {
  const [s, setS] = useState<any>(null);
  const [ann, setAnn] = useState<any[]>([]);
  const [newAnn, setNewAnn] = useState<{
    message: string;
    title: string;
    expires_at: string;
    pdf_url: string;
    image_url: string;
  }>({ message: "", title: "", expires_at: "", pdf_url: "", image_url: "" });
  const [uploading, setUploading] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [lockUntilLocal, setLockUntilLocal] = useState("");

  const loadAll = async () => {
    const { data: settings } = await supabase.from("app_settings").select("*").eq("id", 1).single();
    setS(settings);
    setLockUntilLocal(utcIsoToEatLocalInput(settings?.lock_until));
    const { data: a } = await supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });
    setAnn(a || []);
  };
  useEffect(() => {
    loadAll();
  }, []);

  const saveSettings = async () => {
    const asList = (v: unknown) =>
      typeof v === "string"
        ? v
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean)
        : v;
    const payload: Record<string, unknown> = {
      semina_list: asList(s.semina_list),
      group_list: asList(s.group_list),
      course_list: asList(s.course_list),
      academic_years_list: asList(s.academic_years_list),
      program_years: Number(s.program_years) || 2,
      current_academic_year: s.current_academic_year || null,
      current_semester: s.current_semester || null,
      global_camera: s.global_camera,
      global_gps: s.global_gps,
      global_audio: s.global_audio,
      admin_username: s.admin_username,
      admin_password: s.admin_password,
    };
    // Five of these columns arrive with drizzle/migrations/0004_add_semester.sql
    // and are absent from production. PostgREST names only one unknown column per
    // response, so the retry has to drop them one at a time — dropping a fixed
    // list of one, as this used to, fails on the second name and loses the save.
    const { last, dropped } = await retryWithoutMissingColumns(payload, (body) =>
      supabase
        .from("app_settings")
        .update(body as any)
        .eq("id", 1),
    );
    if (last.error) toast.error((last.error as Error).message);
    else if (dropped.length) {
      toast.warning(
        `Mipangilio imehifadhiwa, lakini ${dropped.join(", ")} haijahifadhiwa — endesha migration 0004_add_semester.sql.`,
      );
    } else toast.success("Mipangilio imehifadhiwa");
    loadAll();
  };

  /**
   * Toggling a stat saves immediately (unlike the rest of the form, which waits
   * for "Hifadhi"). Hiding stamps `stats_hidden_at` the first time so the home
   * page can count only takers from that moment on; clearing it on re-show
   * would resurrect the total the admin wanted hidden.
   */
  const saveStatVisibility = async (patch: Record<string, unknown>) => {
    const next = { ...s, ...patch };
    setS(next);
    const payload: Record<string, unknown> = { ...patch };
    const nowHidden = next.show_submissions_stat === false || next.show_test1_stat === false;
    if (nowHidden && !s.stats_hidden_at) payload.stats_hidden_at = new Date().toISOString();
    const { error } = await supabase
      .from("app_settings")
      .update(payload as any)
      .eq("id", 1);
    if (error) {
      toast.error("Imeshindikana kuhifadhi — endesha migration ya takwimu: " + error.message);
      return;
    }
    toast.success("Takwimu zimehifadhiwa");
    loadAll();
  };

  const saveLock = async (overrides: Partial<any> = {}) => {
    const payload: any = {
      system_locked: s.system_locked,
      lock_message: s.lock_message,
      lock_until: lockUntilLocal ? eatLocalInputToUtcIso(lockUntilLocal) : null,
      results_secret_slug: (s.results_secret_slug || "siri-alama").trim().replace(/\s+/g, "-"),
      ...overrides,
    };
    const { error } = await supabase.from("app_settings").update(payload).eq("id", 1);
    if (error) return toast.error(error.message);
    toast.success("Imehifadhiwa");
    loadAll();
  };

  const secretUrl =
    typeof window !== "undefined" && s
      ? `${window.location.origin}/r/${s.results_secret_slug || "siri-alama"}`
      : "";

  const addAnn = async () => {
    if (!newAnn.message && !newAnn.pdf_url && !newAnn.image_url)
      return toast.error("Andika tangazo au pakia PDF / picha");
    const payload: Record<string, unknown> = {
      message: newAnn.message || newAnn.title || "Angalia PDF",
      title: newAnn.title || null,
      pdf_url: newAnn.pdf_url || null,
      image_url: newAnn.image_url || null,
      expires_at: newAnn.expires_at || null,
    };
    // image_url arrives with drizzle/migrations/0004_add_semester.sql; save the
    // rest of the announcement rather than losing it entirely.
    const { last, dropped } = await retryWithoutMissingColumns(payload, (body) =>
      supabase.from("announcements").insert(body as any),
    );
    if (last.error) return toast.error((last.error as Error).message);
    setNewAnn({ message: "", title: "", expires_at: "", pdf_url: "", image_url: "" });
    if (dropped.length) {
      toast.warning(
        `Tangazo limeongezwa, lakini ${dropped.join(", ")} haijahifadhiwa — endesha migration 0004_add_semester.sql.`,
      );
    } else toast.success("Tangazo limeongezwa");
    loadAll();
  };

  const uploadPdf = async (file: File) => {
    setUploading(true);
    const path = `announcements/${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, "_")}`;
    const { error } = await supabase.storage
      .from("exam-media")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) {
      toast.error(error.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("exam-media").getPublicUrl(path);
    setNewAnn((p) => ({ ...p, pdf_url: data.publicUrl }));
    setUploading(false);
    toast.success("PDF imepakiwa");
  };
  const uploadImage = async (file: File) => {
    setUploadingImg(true);
    const path = `announcements/img-${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, "_")}`;
    const { error } = await supabase.storage
      .from("exam-media")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) {
      toast.error(error.message);
      setUploadingImg(false);
      return;
    }
    const { data } = supabase.storage.from("exam-media").getPublicUrl(path);
    setNewAnn((p) => ({ ...p, image_url: data.publicUrl }));
    setUploadingImg(false);
    toast.success("Picha imepakiwa");
  };
  const delAnn = async (id: string) => {
    await supabase.from("announcements").delete().eq("id", id);
    loadAll();
  };
  const toggleAnn = async (a: any) => {
    await supabase.from("announcements").update({ active: !a.active }).eq("id", a.id);
    loadAll();
  };

  // Kept here so the admin can fix the database from this page, without
  // hunting for the file. Mirrors supabase/APPLY_PENDING.sql.
  const pendingSql = [
    "ALTER TABLE public.students ADD COLUMN IF NOT EXISTS semester text;",
    "ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS target_semester text;",
    "ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS course_list jsonb DEFAULT '[]'::jsonb;",
    "ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS image_url text;",
    "ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS program_years integer DEFAULT 2;",
    "ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS current_academic_year text;",
    "ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS current_semester text;",
    "ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS academic_years_list jsonb DEFAULT '[]'::jsonb;",
    "ALTER TABLE public.exam_pdfs ADD COLUMN IF NOT EXISTS target_semester text;",
    "ALTER TABLE public.profile_update_requests ADD COLUMN IF NOT EXISTS new_course text;",
    "ALTER TABLE public.profile_update_requests ADD COLUMN IF NOT EXISTS new_study_year integer;",
    "ALTER TABLE public.profile_update_requests ADD COLUMN IF NOT EXISTS new_semester text;",
    "ALTER TABLE public.profile_update_requests ADD COLUMN IF NOT EXISTS new_academic_year text;",
    "ALTER TABLE public.profile_update_requests ADD COLUMN IF NOT EXISTS changed_fields jsonb DEFAULT '[]'::jsonb;",
    "ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS show_submissions_stat boolean DEFAULT true;",
    "ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS show_test1_stat boolean DEFAULT true;",
    "ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS stats_hidden_at timestamptz;",
  ].join("\n");

  const copyPendingSql = async () => {
    try {
      await navigator.clipboard.writeText(pendingSql);
      toast.success("SQL imenakiliwa — ifashe kwenye Supabase SQL Editor");
    } catch {
      // Clipboard access needs a secure context and can be refused; show the SQL
      // instead of failing silently.
      await alertInfo("SQL ya kuendesha", pendingSql);
    }
  };

  if (!s) return <div>Inapakia...</div>;

  // Columns added by drizzle/migrations/0004_add_semester.sql. Surfacing which
  // ones are still absent tells the admin exactly what to run, instead of
  // leaving them with silently unsaved fields.
  const pendingColumns = (
    [
      ["course_list", s.course_list],
      ["program_years", s.program_years],
      ["academic_years_list", s.academic_years_list],
      ["current_academic_year", s.current_academic_year],
      ["current_semester", s.current_semester],
    ] as const
  )
    .filter(([, v]) => v === undefined)
    .map(([k]) => k);

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {pendingColumns.length > 0 && (
        <Card className="lg:col-span-2 border-2 border-amber-500/50 bg-amber-500/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-600" /> Migration Haijafanyika
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Safu zifuatazo hazipo kwenye hifadhidata bado: <b>{pendingColumns.join(", ")}</b>.
              Mfumo unaendelea kufanya kazi, lakini sehemu hizo hazitahifadhiwa.
            </p>
            <p className="text-muted-foreground">
              Nakili SQL hapa chini, kisha uifashe kwenye Supabase &rarr; SQL Editor na ubonyeze
              Run. Ni salama kuiendesha mara nyingi — kila mstari ni IF NOT EXISTS.
            </p>
            <Button variant="outline" size="sm" onClick={copyPendingSql} className="gap-2">
              <Copy className="h-4 w-4" />
              Nakili SQL
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="lg:col-span-2 border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {s.system_locked ? (
              <Lock className="h-5 w-5 text-primary" />
            ) : (
              <Unlock className="h-5 w-5" />
            )}
            Funga / Fungua Mfumo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-card border">
            <Switch
              checked={!!s.system_locked}
              onCheckedChange={(v) => {
                setS({ ...s, system_locked: v });
                saveLock({ system_locked: v });
              }}
            />
            <div className="flex-1">
              <div className="font-bold text-sm">
                {s.system_locked ? "Mfumo Umefungwa" : "Mfumo Umefunguliwa"}
              </div>
              <div className="text-xs text-muted-foreground">
                Ukifunga, watumiaji wataona ujumbe wenye animation. Admin na link ya siri ya alama
                vitabaki vinafanya kazi.
              </div>
            </div>
          </div>
          <div>
            <Label>Ujumbe wa Kuonyesha (utajiandika na kujifuta)</Label>
            <Textarea
              rows={2}
              value={s.lock_message || ""}
              onChange={(e) => setS({ ...s, lock_message: e.target.value })}
              placeholder="Mfano: Tutarudi hivi karibuni..."
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Muda wa Kujifungua (EAT — hiari)</Label>
              <Input
                type="datetime-local"
                value={lockUntilLocal}
                onChange={(e) => setLockUntilLocal(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Ukiacha tupu, mfumo utabaki umefungwa hadi uufungue mwenyewe.
              </p>
            </div>
            <div>
              <Label>Link ya Siri ya Alama (slug)</Label>
              <Input
                value={s.results_secret_slug || ""}
                onChange={(e) => setS({ ...s, results_secret_slug: e.target.value })}
                placeholder="siri-alama"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted text-xs break-all">
            <Lock className="h-3 w-3 shrink-0" />
            <span className="flex-1 font-mono">{secretUrl}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                navigator.clipboard.writeText(secretUrl);
                toast.success("Link imekopiwa");
              }}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          <Button onClick={() => saveLock()} className="w-full">
            Hifadhi Mipangilio ya Lock
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mipangilio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Semina (mstari mmoja kila moja)</Label>
            <Textarea
              rows={5}
              value={Array.isArray(s.semina_list) ? s.semina_list.join("\n") : s.semina_list}
              onChange={(e) => setS({ ...s, semina_list: e.target.value })}
            />
          </div>
          <div>
            <Label>Group (mstari mmoja kila moja)</Label>
            <Textarea
              rows={5}
              value={Array.isArray(s.group_list) ? s.group_list.join("\n") : s.group_list}
              onChange={(e) => setS({ ...s, group_list: e.target.value })}
            />
          </div>
          <div>
            <Label>Kozi (mstari mmoja kila moja)</Label>
            <Textarea
              rows={5}
              placeholder={"BIOGRAPHY OF PROPHET MUHAMMAD [IS234]\nISLAMIC JURISPRUDENCE [IS221]"}
              value={Array.isArray(s.course_list) ? s.course_list.join("\n") : s.course_list || ""}
              onChange={(e) => setS({ ...s, course_list: e.target.value })}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Hizi zitaonekana kama chaguo wakati wa usajili na kwenye marekebisho ya wasifu.
            </p>
          </div>
          <div className="rounded-lg border-2 border-primary/25 bg-primary/5 p-3 space-y-3">
            <div className="text-sm font-bold text-primary">Mwaka wa Kitaaluma</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Urefu wa Program (miaka)</Label>
                <Select
                  value={String(s.program_years ?? 2)}
                  onValueChange={(v) => setS({ ...s, program_years: Number(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        Miaka {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Program ya miaka 2 itatoa "Mwaka wa 1" na "Mwaka wa 2" pekee.
                </p>
              </div>
              <div>
                <Label>Semester ya Sasa</Label>
                <Select
                  value={s.current_semester || "none"}
                  onValueChange={(v) => setS({ ...s, current_semester: v === "none" ? null : v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Haujawekwa</SelectItem>
                    {SEMESTERS.map((x) => (
                      <SelectItem key={x} value={x} disabled={!isSemesterActive(x)}>
                        {x}
                        {!isSemesterActive(x) && " (bado)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Mwaka wa Kitaaluma wa Sasa</Label>
              <Select
                value={s.current_academic_year || "none"}
                onValueChange={(v) =>
                  setS({ ...s, current_academic_year: v === "none" ? null : v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Haujawekwa</SelectItem>
                  {(Array.isArray(s.academic_years_list) && s.academic_years_list.length
                    ? s.academic_years_list
                    : ACADEMIC_YEARS
                  ).map((y: string) => (
                    <SelectItem key={y} value={y}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Mfano: {s.current_semester || "Semester ya Kwanza"}{" "}
                {s.current_academic_year || "2026/2027"}
              </p>
            </div>
            <div>
              <Label>Miaka ya Kitaaluma Inayopatikana (mstari mmoja kila moja)</Label>
              <Textarea
                rows={4}
                placeholder={"2025/2026\n2026/2027\n2027/2028"}
                value={
                  Array.isArray(s.academic_years_list)
                    ? s.academic_years_list.join("\n")
                    : s.academic_years_list || ""
                }
                onChange={(e) => setS({ ...s, academic_years_list: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex items-center gap-2">
              <Switch
                checked={s.global_camera}
                onCheckedChange={(v) => setS({ ...s, global_camera: v })}
              />
              Kamera
            </label>
            <label className="flex items-center gap-2">
              <Switch
                checked={s.global_gps}
                onCheckedChange={(v) => setS({ ...s, global_gps: v })}
              />
              GPS
            </label>
            <label className="flex items-center gap-2">
              <Switch
                checked={s.global_audio}
                onCheckedChange={(v) => setS({ ...s, global_audio: v })}
              />
              Sauti
            </label>
          </div>
          <div className="rounded-lg border p-3 space-y-3">
            <div className="text-sm font-bold">Kuonekana kwa Takwimu (Home page)</div>
            <p className="text-xs text-muted-foreground">
              Zima kionyeshi ili wanafunzi wasione jumla halisi. Kikizimwa, kikawashwa tena,
              kutaonyesha tu waliofanya baada ya muda huo.
            </p>
            <label className="flex items-center gap-2">
              <Switch
                checked={s.show_submissions_stat !== false}
                onCheckedChange={(v) => saveStatVisibility({ show_submissions_stat: v })}
              />
              Onyesha idadi ya waliofanya mtihani
            </label>
            <label className="flex items-center gap-2">
              <Switch
                checked={s.show_test1_stat !== false}
                onCheckedChange={(v) => saveStatVisibility({ show_test1_stat: v })}
              />
              Onyesha idadi ya waliofanya Test 1
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Admin Username</Label>
              <Input
                value={s.admin_username}
                onChange={(e) => setS({ ...s, admin_username: e.target.value })}
              />
            </div>
            <div>
              <Label>Admin Password</Label>
              <Input
                value={s.admin_password}
                onChange={(e) => setS({ ...s, admin_password: e.target.value })}
              />
            </div>
          </div>
          <Button onClick={saveSettings} className="w-full">
            Hifadhi Mipangilio
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Matangazo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Kichwa cha Tangazo (hiari)</Label>
            <Input
              value={newAnn.title}
              onChange={(e) => setNewAnn({ ...newAnn, title: e.target.value })}
            />
          </div>
          <div>
            <Label>Maelezo</Label>
            <Textarea
              value={newAnn.message}
              onChange={(e) => setNewAnn({ ...newAnn, message: e.target.value })}
            />
          </div>
          <div>
            <Label>Pakia PDF (hiari)</Label>
            <div className="flex gap-2 items-center">
              <Input
                type="file"
                accept="application/pdf"
                onChange={(e) => e.target.files?.[0] && uploadPdf(e.target.files[0])}
                disabled={uploading}
              />
              {uploading && <span className="text-xs text-muted-foreground">Inapakia...</span>}
            </div>
            {newAnn.pdf_url && (
              <a
                href={newAnn.pdf_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary underline inline-flex items-center gap-1 mt-1"
              >
                <FileText className="h-3 w-3" />
                Tazama PDF
              </a>
            )}
          </div>
          <div>
            <Label>Pakia Picha (hiari)</Label>
            <div className="flex gap-2 items-center">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])}
                disabled={uploadingImg}
              />
              {uploadingImg && <span className="text-xs text-muted-foreground">Inapakia...</span>}
            </div>
            {newAnn.image_url && (
              <a
                href={newAnn.image_url}
                target="_blank"
                rel="noreferrer"
                className="inline-block mt-1"
              >
                <img src={newAnn.image_url} alt="preview" className="h-20 rounded border" />
              </a>
            )}
          </div>
          <div>
            <Label>Linakwisha lini (hiari)</Label>
            <Input
              type="datetime-local"
              value={newAnn.expires_at}
              onChange={(e) => setNewAnn({ ...newAnn, expires_at: e.target.value })}
            />
          </div>
          <Button onClick={addAnn} className="w-full gap-1">
            <Upload className="h-4 w-4" />
            Ongeza Tangazo
          </Button>
          <div className="space-y-2 mt-3">
            {ann.map((a) => (
              <div key={a.id} className="flex items-center gap-2 p-2 bg-muted rounded text-sm">
                <Switch checked={a.active} onCheckedChange={() => toggleAnn(a)} />
                <span className="flex-1">
                  {a.title && <strong>{a.title}: </strong>}
                  {a.message}
                  {a.pdf_url && (
                    <a
                      href={a.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary underline ml-2"
                    >
                      [PDF]
                    </a>
                  )}
                  {a.image_url && (
                    <a
                      href={a.image_url}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-2 inline-flex items-center gap-1 align-middle text-primary underline"
                    >
                      <img src={a.image_url} alt="" className="h-6 w-6 rounded object-cover" />
                      Picha
                    </a>
                  )}
                </span>
                <Button size="sm" variant="ghost" onClick={() => delAnn(a.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
