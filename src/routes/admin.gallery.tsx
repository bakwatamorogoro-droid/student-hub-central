import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Trash2, Upload, Image as ImageIcon } from "lucide-react";

export const Route = createFileRoute("/admin/gallery")({ component: Page });

type Item = {
  id: string;
  title: string | null;
  caption: string | null;
  image_url: string;
  position: number;
  active: boolean;
  created_at: string;
  category: string;
};

function Page() {
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState({ title: "", caption: "", image_url: "", position: 0, category: "gallery" });
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("study_images")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: false });
    setItems((data as Item[]) || []);
  };
  useEffect(() => { load(); }, []);

  const uploadImage = async (file: File) => {
    setUploading(true);
    const path = `gallery/${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, "_")}`;
    const { error } = await supabase.storage
      .from("exam-media")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("exam-media").getPublicUrl(path);
    setForm((f) => ({ ...f, image_url: data.publicUrl }));
    setUploading(false);
    toast.success("Picha imepakiwa");
  };

  const add = async () => {
    if (!form.image_url) return toast.error("Pakia picha kwanza");
    const { error } = await supabase.from("study_images").insert({
      title: form.title || null,
      caption: form.caption || null,
      image_url: form.image_url,
      position: Number(form.position) || 0,
      category: form.category || "gallery",
    });
    if (error) return toast.error(error.message);
    setForm({ title: "", caption: "", image_url: "", position: 0, category: form.category });
    toast.success("Picha imeongezwa kwenye bana");
    load();
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from("study_images").update({ active }).eq("id", id);
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Futa picha hii?")) return;
    await supabase.from("study_images").delete().eq("id", id);
    toast.success("Imefutwa");
    load();
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" /> Bana ya Picha za Masomo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Kichwa (hiari)</Label>
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="K.m. Tafsiri Surat Al-Fatiha" />
            </div>
            <div>
              <Label>Mpangilio (namba ndogo = mwanzo)</Label>
              <Input type="number" value={form.position} onChange={(e) => setForm({ ...form, position: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <Label>Aina ya Picha</Label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full mt-1 border rounded-md h-10 px-3 bg-background"
            >
              <option value="gallery">Bana ya Masomo (Home)</option>
              <option value="exam_hero">Sehemu ya Mtihani (Take Exam slideshow)</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">Chagua "Sehemu ya Mtihani" kwa picha za wanafunzi waliovaa Kiislamu wakifanya mtihani — zitatembea kwenye ukurasa wa mitihani.</p>
          </div>
          <div>
            <Label>Maelezo mafupi (hiari)</Label>
            <Input value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} placeholder="Maelezo kuhusu picha" />
          </div>
          <div>
            <Label>Picha</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); }}
                disabled={uploading}
              />
              <Upload className="h-4 w-4 text-muted-foreground" />
            </div>
            {form.image_url && (
              <img src={form.image_url} alt="preview" className="mt-3 max-h-48 rounded-md border" />
            )}
          </div>
          <Button onClick={add} disabled={uploading || !form.image_url}>Ongeza Picha</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Picha zilizopo ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bado hakuna picha.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.map((it) => (
                <div key={it.id} className="border rounded-lg overflow-hidden bg-card">
                  <img src={it.image_url} alt={it.title || "picha"} className="w-full h-40 object-cover" />
                  <div className="p-3 space-y-2">
                    <div className="font-semibold text-sm">{it.title || "(bila kichwa)"}</div>
                    {it.caption && <div className="text-xs text-muted-foreground">{it.caption}</div>}
                    <div className="text-xs text-muted-foreground">Mpangilio: {it.position} • <span className="font-semibold">{it.category === "exam_hero" ? "Mtihani" : "Bana"}</span></div>
                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2">
                        <Switch checked={it.active} onCheckedChange={(v) => toggle(it.id, v)} />
                        <span className="text-xs">{it.active ? "Inaonekana" : "Imefichwa"}</span>
                      </div>
                      <Button size="sm" variant="destructive" onClick={() => del(it.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}