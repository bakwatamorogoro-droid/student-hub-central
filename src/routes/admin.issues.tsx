import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertTriangle, Check, Trash2 } from "lucide-react";

export const Route = createFileRoute("/admin/issues")({ component: Page });

function Page() {
  const [rows, setRows] = useState<any[]>([]);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>("all");

  const load = async () => {
    const { data } = await (supabase as any).from("issue_reports").select("*").order("created_at", { ascending: false });
    setRows(data || []);
  };
  useEffect(() => { load(); }, []);

  const resolve = async (r: any) => {
    const reply = replies[r.id] || "Tumepokea. Asante.";
    const { error } = await (supabase as any).from("issue_reports").update({ status: "resolved", admin_reply: reply, replied_at: new Date().toISOString() }).eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Imejibiwa & kumalizwa");
    load();
  };
  const del = async (r: any) => {
    if (!confirm("Futa changamoto hii?")) return;
    await (supabase as any).from("issue_reports").delete().eq("id", r.id);
    load();
  };

  const filtered = filter === "all" ? rows : rows.filter((r) => r.category === filter || r.status === filter);
  const cats = ["all", "test1", "test2", "login", "result", "general", "open", "resolved"];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Changamoto za Wanafunzi ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-1 flex-wrap mb-3">
            {cats.map((c) => (
              <Button key={c} size="sm" variant={filter === c ? "default" : "outline"} onClick={() => setFilter(c)}>{c}</Button>
            ))}
          </div>
          <div className="space-y-2">
            {filtered.length === 0 && <p className="text-sm text-muted-foreground">Hakuna changamoto.</p>}
            {filtered.map((r) => (
              <div key={r.id} className="p-3 rounded-lg border bg-muted/30">
                <div className="flex justify-between gap-2 flex-wrap">
                  <div>
                    <div className="font-bold">{r.full_name} <span className="text-xs text-muted-foreground">({r.reg_no})</span></div>
                    <div className="text-xs text-muted-foreground">{r.phone || "-"} • {r.email || "-"} • {new Date(r.created_at).toLocaleString()}</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded h-fit ${r.status === "resolved" ? "bg-green-500/15 text-green-700" : "bg-amber-500/15 text-amber-700"}`}>{r.category} • {r.status}</span>
                </div>
                <div className="mt-2 text-sm">{r.message}</div>
                {r.admin_reply && <div className="mt-2 p-2 bg-primary/10 rounded text-sm"><b>Jibu:</b> {r.admin_reply}</div>}
                {r.status !== "resolved" && (
                  <div className="mt-2 space-y-2">
                    <Textarea rows={2} placeholder="Andika jibu kwa mwanafunzi..." value={replies[r.id] || ""} onChange={(e) => setReplies({ ...replies, [r.id]: e.target.value })} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => resolve(r)} className="gap-1"><Check className="h-3 w-3" /> Jibu & Maliza</Button>
                      <Button size="sm" variant="destructive" onClick={() => del(r)} className="gap-1"><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}