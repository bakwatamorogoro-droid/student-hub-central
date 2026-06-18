import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, X, UserCog, Pencil, Trash2, Save } from "lucide-react";

export const Route = createFileRoute("/admin/requests")({ component: Page });

function Page() {
  const [rows, setRows] = useState<any[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<any>({});

  const load = async () => {
    const { data: s } = await supabase.from("app_settings").select("profile_edits_enabled").eq("id", 1).single();
    setEnabled(!!s?.profile_edits_enabled);
    const { data } = await (supabase as any).from("profile_update_requests").select("*").order("created_at", { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);

  const toggleEnabled = async (v: boolean) => {
    await supabase.from("app_settings").update({ profile_edits_enabled: v }).eq("id", 1);
    setEnabled(v);
    toast.success(v ? "Huduma ya marekebisho imewashwa" : "Huduma imezimwa");
  };

  const approve = async (r: any) => {
    const { error } = await (supabase as any).rpc("apply_profile_update", {
      p_student_id: r.student_id,
      p_new_reg_no: r.new_reg_no,
      p_new_full_name: r.new_full_name,
      p_new_semina: r.new_semina,
      p_new_group: r.new_student_group,
    });
    if (error) return toast.error(error.message);
    await (supabase as any).from("profile_update_requests").update({ status: "approved", reviewed_at: new Date().toISOString() }).eq("id", r.id);
    toast.success("Marekebisho yamethibitishwa na yamesambazwa kila mahali");
    load();
  };
  const reject = async (r: any) => {
    await (supabase as any).from("profile_update_requests").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", r.id);
    toast.success("Ombi limekataliwa");
    load();
  };

  const startEdit = (r: any) => {
    setEditingId(r.id);
    setEditForm({
      new_reg_no: r.new_reg_no || "",
      new_full_name: r.new_full_name || "",
      new_semina: r.new_semina || "",
      new_student_group: r.new_student_group || "",
      reason: r.reason || "",
    });
  };

  const saveEdit = async (id: string) => {
    const { error } = await (supabase as any).from("profile_update_requests").update({
      new_reg_no: editForm.new_reg_no?.toUpperCase() || null,
      new_full_name: editForm.new_full_name || null,
      new_semina: editForm.new_semina || null,
      new_student_group: editForm.new_student_group || null,
      reason: editForm.reason || null,
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Ombi limehaririwa");
    setEditingId(null);
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Futa ombi hili kabisa?")) return;
    const { error } = await (supabase as any).from("profile_update_requests").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Ombi limefutwa");
    load();
  };

  const delAll = async () => {
    if (!confirm(`Futa MAOMBI YOTE (${rows.length})? Haitarudishwa.`)) return;
    const { error } = await (supabase as any).from("profile_update_requests").delete().not("id", "is", null);
    if (error) return toast.error(error.message);
    toast.success("Maombi yote yamefutwa");
    load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserCog className="h-5 w-5" /> Maombi ya Marekebisho</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-card border">
            <Switch checked={enabled} onCheckedChange={toggleEnabled} />
            <div className="flex-1">
              <div className="font-bold text-sm">{enabled ? "Imewashwa" : "Imezimwa"}</div>
              <div className="text-xs text-muted-foreground">Wanafunzi waweze kuwasilisha maombi ya marekebisho ya wasifu.</div>
            </div>
          </div>
          <div className="space-y-2">
            {rows.length > 0 && (
              <div className="flex justify-end">
                <Button size="sm" variant="destructive" onClick={delAll} className="gap-1">
                  <Trash2 className="h-3 w-3" /> Futa Yote
                </Button>
              </div>
            )}
            {rows.length === 0 && <p className="text-sm text-muted-foreground">Hakuna ombi bado.</p>}
            {rows.map((r) => (
              <div key={r.id} className="p-3 rounded-lg border bg-muted/30">
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Sasa:</div>
                    <div className="font-bold">{r.current_full_name} • {r.current_reg_no}</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${r.status === "approved" ? "bg-green-500/15 text-green-700" : r.status === "rejected" ? "bg-red-500/15 text-red-700" : "bg-amber-500/15 text-amber-700"}`}>{r.status}</span>
                </div>
                {editingId === r.id ? (
                  <div className="mt-2 space-y-2">
                    <div className="grid sm:grid-cols-2 gap-2">
                      <div><Label className="text-xs">Reg mpya</Label><Input value={editForm.new_reg_no} onChange={(e) => setEditForm({ ...editForm, new_reg_no: e.target.value })} /></div>
                      <div><Label className="text-xs">Jina jipya</Label><Input value={editForm.new_full_name} onChange={(e) => setEditForm({ ...editForm, new_full_name: e.target.value })} /></div>
                      <div><Label className="text-xs">Semina</Label><Input value={editForm.new_semina} onChange={(e) => setEditForm({ ...editForm, new_semina: e.target.value })} /></div>
                      <div><Label className="text-xs">Group</Label><Input value={editForm.new_student_group} onChange={(e) => setEditForm({ ...editForm, new_student_group: e.target.value })} /></div>
                    </div>
                    <div><Label className="text-xs">Sababu</Label><Input value={editForm.reason} onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })} /></div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveEdit(r.id)} className="gap-1"><Save className="h-3 w-3" /> Hifadhi</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Ghairi</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-2 grid sm:grid-cols-2 gap-1 text-sm">
                      {r.new_full_name && r.new_full_name !== r.current_full_name && <div>Jina jipya: <b>{r.new_full_name}</b></div>}
                      {r.new_reg_no && r.new_reg_no !== r.current_reg_no && <div>Reg jipya: <b>{r.new_reg_no}</b></div>}
                      {r.new_semina && <div>Semina: <b>{r.new_semina}</b></div>}
                      {r.new_student_group && <div>Group: <b>{r.new_student_group}</b></div>}
                      {r.reason && <div className="sm:col-span-2 text-xs text-muted-foreground">Sababu: {r.reason}</div>}
                    </div>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {r.status === "pending" && (
                        <>
                          <Button size="sm" onClick={() => approve(r)} className="gap-1"><Check className="h-3 w-3" /> Thibitisha</Button>
                          <Button size="sm" variant="outline" onClick={() => reject(r)} className="gap-1"><X className="h-3 w-3" /> Kataa</Button>
                        </>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => startEdit(r)} className="gap-1"><Pencil className="h-3 w-3" /> Hariri</Button>
                      <Button size="sm" variant="destructive" onClick={() => del(r.id)} className="gap-1"><Trash2 className="h-3 w-3" /> Futa</Button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}