import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Trash2, Upload, FileText, Lock, Copy, Unlock, Image as ImageIcon } from "lucide-react";
import { eatLocalInputToUtcIso, utcIsoToEatLocalInput } from "@/lib/time";

export const Route = createFileRoute("/admin/settings")({ component: Page });

function Page() {
  const [s, setS] = useState<any>(null);
  const [ann, setAnn] = useState<any[]>([]);
  const [newAnn, setNewAnn] = useState<{ message: string; title: string; expires_at: string; pdf_url: string; image_url: string }>({ message: "", title: "", expires_at: "", pdf_url: "", image_url: "" });
  const [uploading, setUploading] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [lockUntilLocal, setLockUntilLocal] = useState("");

  const loadAll = async () => {
    const { data: settings } = await supabase.from("app_settings").select("*").eq("id", 1).single();
    setS(settings);
    setLockUntilLocal(utcIsoToEatLocalInput(settings?.lock_until));
    const { data: a } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
    setAnn(a || []);
  };
  useEffect(() => { loadAll(); }, []);

  const saveSettings = async () => {
    const { error } = await supabase.from("app_settings").update({
      semina_list: typeof s.semina_list === "string" ? s.semina_list.split("\n").map((x: string) => x.trim()).filter(Boolean) : s.semina_list,
      group_list: typeof s.group_list === "string" ? s.group_list.split("\n").map((x: string) => x.trim()).filter(Boolean) : s.group_list,
      global_camera: s.global_camera, global_gps: s.global_gps, global_audio: s.global_audio,
      admin_username: s.admin_username, admin_password: s.admin_password,
    }).eq("id", 1);
    if (error) toast.error(error.message); else toast.success("Mipangilio imehifadhiwa");
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

  const secretUrl = typeof window !== "undefined" && s ? `${window.location.origin}/r/${s.results_secret_slug || "siri-alama"}` : "";

  const addAnn = async () => {
    if (!newAnn.message && !newAnn.pdf_url && !newAnn.image_url) return toast.error("Andika tangazo au pakia PDF / picha");
    const { error } = await supabase.from("announcements").insert({
      message: newAnn.message || (newAnn.title || "Angalia PDF"),
      title: newAnn.title || null,
      pdf_url: newAnn.pdf_url || null,
      expires_at: newAnn.expires_at || null,
    });
    if (error) return toast.error(error.message);
    setNewAnn({ message: "", title: "", expires_at: "", pdf_url: "", image_url: "" });
    toast.success("Tangazo limeongezwa");
    loadAll();
  };

  const uploadPdf = async (file: File) => {
    setUploading(true);
    const path = `announcements/${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, "_")}`;
    const { error } = await supabase.storage.from("exam-media").upload(path, file, { upsert: false, contentType: file.type });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("exam-media").getPublicUrl(path);
    setNewAnn((p) => ({ ...p, pdf_url: data.publicUrl }));
    setUploading(false);
    toast.success("PDF imepakiwa");
  };
  const uploadImage = async (file: File) => {
    setUploadingImg(true);
    const path = `announcements/img-${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, "_")}`;
    const { error } = await supabase.storage.from("exam-media").upload(path, file, { upsert: false, contentType: file.type });
    if (error) { toast.error(error.message); setUploadingImg(false); return; }
    const { data } = supabase.storage.from("exam-media").getPublicUrl(path);
    setNewAnn((p) => ({ ...p, image_url: data.publicUrl }));
    setUploadingImg(false);
    toast.success("Picha imepakiwa");
  };
  const delAnn = async (id: string) => { await supabase.from("announcements").delete().eq("id", id); loadAll(); };
  const toggleAnn = async (a: any) => { await supabase.from("announcements").update({ active: !a.active }).eq("id", a.id); loadAll(); };

  if (!s) return <div>Inapakia...</div>;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card className="lg:col-span-2 border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {s.system_locked ? <Lock className="h-5 w-5 text-primary" /> : <Unlock className="h-5 w-5" />}
            Funga / Fungua Mfumo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-card border">
            <Switch checked={!!s.system_locked} onCheckedChange={(v) => { setS({ ...s, system_locked: v }); saveLock({ system_locked: v }); }} />
            <div className="flex-1">
              <div className="font-bold text-sm">{s.system_locked ? "Mfumo Umefungwa" : "Mfumo Umefunguliwa"}</div>
              <div className="text-xs text-muted-foreground">Ukifunga, watumiaji wataona ujumbe wenye animation. Admin na link ya siri ya alama vitabaki vinafanya kazi.</div>
            </div>
          </div>
          <div>
            <Label>Ujumbe wa Kuonyesha (utajiandika na kujifuta)</Label>
            <Textarea rows={2} value={s.lock_message || ""} onChange={(e) => setS({ ...s, lock_message: e.target.value })} placeholder="Mfano: Tutarudi hivi karibuni..." />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Muda wa Kujifungua (EAT — hiari)</Label>
              <Input type="datetime-local" value={lockUntilLocal} onChange={(e) => setLockUntilLocal(e.target.value)} />
              <p className="text-xs text-muted-foreground mt-1">Ukiacha tupu, mfumo utabaki umefungwa hadi uufungue mwenyewe.</p>
            </div>
            <div>
              <Label>Link ya Siri ya Alama (slug)</Label>
              <Input value={s.results_secret_slug || ""} onChange={(e) => setS({ ...s, results_secret_slug: e.target.value })} placeholder="siri-alama" />
            </div>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-muted text-xs break-all">
            <Lock className="h-3 w-3 shrink-0" />
            <span className="flex-1 font-mono">{secretUrl}</span>
            <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(secretUrl); toast.success("Link imekopiwa"); }}><Copy className="h-3 w-3" /></Button>
          </div>
          <Button onClick={() => saveLock()} className="w-full">Hifadhi Mipangilio ya Lock</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Mipangilio</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Semina (mstari mmoja kila moja)</Label>
            <Textarea rows={5} value={Array.isArray(s.semina_list) ? s.semina_list.join("\n") : s.semina_list} onChange={(e) => setS({...s, semina_list: e.target.value})} />
          </div>
          <div><Label>Group (mstari mmoja kila moja)</Label>
            <Textarea rows={5} value={Array.isArray(s.group_list) ? s.group_list.join("\n") : s.group_list} onChange={(e) => setS({...s, group_list: e.target.value})} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex items-center gap-2"><Switch checked={s.global_camera} onCheckedChange={(v) => setS({...s, global_camera: v})} />Kamera</label>
            <label className="flex items-center gap-2"><Switch checked={s.global_gps} onCheckedChange={(v) => setS({...s, global_gps: v})} />GPS</label>
            <label className="flex items-center gap-2"><Switch checked={s.global_audio} onCheckedChange={(v) => setS({...s, global_audio: v})} />Sauti</label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Admin Username</Label><Input value={s.admin_username} onChange={(e) => setS({...s, admin_username: e.target.value})} /></div>
            <div><Label>Admin Password</Label><Input value={s.admin_password} onChange={(e) => setS({...s, admin_password: e.target.value})} /></div>
          </div>
          <Button onClick={saveSettings} className="w-full">Hifadhi Mipangilio</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Matangazo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>Kichwa cha Tangazo (hiari)</Label><Input value={newAnn.title} onChange={(e) => setNewAnn({...newAnn, title: e.target.value})} /></div>
          <div><Label>Maelezo</Label><Textarea value={newAnn.message} onChange={(e) => setNewAnn({...newAnn, message: e.target.value})} /></div>
          <div>
            <Label>Pakia PDF (hiari)</Label>
            <div className="flex gap-2 items-center">
              <Input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && uploadPdf(e.target.files[0])} disabled={uploading} />
              {uploading && <span className="text-xs text-muted-foreground">Inapakia...</span>}
            </div>
            {newAnn.pdf_url && <a href={newAnn.pdf_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline inline-flex items-center gap-1 mt-1"><FileText className="h-3 w-3" />Tazama PDF</a>}
          </div>
          <div>
            <Label>Pakia Picha (hiari)</Label>
            <div className="flex gap-2 items-center">
              <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} disabled={uploadingImg} />
              {uploadingImg && <span className="text-xs text-muted-foreground">Inapakia...</span>}
            </div>
            {newAnn.image_url && (
              <a href={newAnn.image_url} target="_blank" rel="noreferrer" className="inline-block mt-1">
                <img src={newAnn.image_url} alt="preview" className="h-20 rounded border" />
              </a>
            )}
          </div>
          <div><Label>Linakwisha lini (hiari)</Label><Input type="datetime-local" value={newAnn.expires_at} onChange={(e) => setNewAnn({...newAnn, expires_at: e.target.value})} /></div>
          <Button onClick={addAnn} className="w-full gap-1"><Upload className="h-4 w-4" />Ongeza Tangazo</Button>
          <div className="space-y-2 mt-3">
            {ann.map((a) => (
              <div key={a.id} className="flex items-center gap-2 p-2 bg-muted rounded text-sm">
                <Switch checked={a.active} onCheckedChange={() => toggleAnn(a)} />
                <span className="flex-1">
                  {a.title && <strong>{a.title}: </strong>}{a.message}
                  {a.pdf_url && <a href={a.pdf_url} target="_blank" rel="noreferrer" className="text-primary underline ml-2">[PDF]</a>}
                  {a.image_url && <a href={a.image_url} target="_blank" rel="noreferrer" className="text-primary underline ml-2 inline-flex items-center gap-1"><ImageIcon className="h-3 w-3" />Picha</a>}
                </span>
                <Button size="sm" variant="ghost" onClick={() => delAnn(a.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}