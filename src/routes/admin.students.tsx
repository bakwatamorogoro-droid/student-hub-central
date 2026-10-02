import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Pencil, Trash2, Download, CheckCircle2, XCircle } from "lucide-react";
import { ACADEMIC_YEARS, STUDY_YEARS } from "@/lib/academicTargeting";

export const Route = createFileRoute("/admin/students")({ component: Page });

type Student = {
  id: string;
  reg_no: string;
  full_name: string;
  phone: string | null;
  course: string | null;
  age: number | null;
  gender: string | null;
  semina: string;
  student_group: string;
  device_id: string;
  created_at: string;
  study_year: number | null;
  academic_year: string | null;
};

function Page() {
  const [rows, setRows] = useState<Student[]>([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Student | null>(null);
  const [seminaList, setSeminaList] = useState<string[]>([]);
  const [groupList, setGroupList] = useState<string[]>([]);
  const [submittedSet, setSubmittedSet] = useState<Set<string>>(new Set());

  const load = async () => {
    const pageSize = 1000;
    let from = 0;
    const all: Student[] = [];
    while (true) {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) { toast.error(error.message); break; }
      if (!data || data.length === 0) break;
      all.push(...(data as Student[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    setRows(all);
  };

  useEffect(() => {
    load();
    supabase.from("app_settings").select("semina_list, group_list").eq("id", 1).single().then(({ data }: { data: any }) => {
      if (data) {
        setSeminaList((data.semina_list as string[]) || []);
        setGroupList((data.group_list as string[]) || []);
      }
    });
    // Load IDs of students who have at least one submission
    (async () => {
      const ids = new Set<string>();
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data } = await supabase.from("submissions").select("student_id").not("submitted_at", "is", null).range(from, from + pageSize - 1);
        if (!data || data.length === 0) break;
        data.forEach((r: any) => r.student_id && ids.add(r.student_id));
        if (data.length < pageSize) break;
        from += pageSize;
      }
      setSubmittedSet(ids);
    })();
  }, []);

  const filtered = rows.filter((r) =>
    !q ||
    r.reg_no?.toLowerCase().includes(q.toLowerCase()) ||
    r.full_name?.toLowerCase().includes(q.toLowerCase()) ||
    r.phone?.toLowerCase().includes(q.toLowerCase()),
  );

  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(filtered);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Wanafunzi");
    XLSX.writeFile(wb, "wanafunzi.xlsx");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase
      .from("students")
      .update({
        full_name: editing.full_name,
        phone: editing.phone,
        course: editing.course,
        age: editing.age,
        gender: editing.gender,
        semina: editing.semina,
        student_group: editing.student_group,
        study_year: editing.study_year,
        academic_year: editing.academic_year,
      } as any)
      .eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Imehifadhiwa");
    setEditing(null);
    load();
  };

  const del = async (s: Student) => {
    if (!confirm(`Una uhakika kufuta usajili wa "${s.full_name}" (${s.reg_no})?\n\nMajibu yote ya mtihani yake pia yatafutwa.`)) return;
    const { error } = await supabase.from("students").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    toast.success("Mwanafunzi amefutwa");
    load();
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="Tafuta jina, reg namba, au simu..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-md"
          />
          <Button onClick={exportXlsx} variant="outline" className="gap-1">
            <Download className="h-4 w-4" /> Export Excel
          </Button>
          <div className="ml-auto text-sm text-muted-foreground self-center">
            Jumla: <b>{filtered.length}</b> {q && `/ ${rows.length}`}
          </div>
        </div>
        <div className="overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-2">#</th>
                <th className="text-left p-2">Reg No</th>
                <th className="text-left p-2">Jina</th>
                <th className="text-center p-2" title="Amewasilisha jibu?">Tuma</th>
                <th className="text-left p-2">Simu</th>
                <th className="text-left p-2">Kozi</th>
                <th className="text-left p-2">Semina</th>
                <th className="text-left p-2">Group</th>
                <th className="text-left p-2">Mwaka</th>
                <th className="text-left p-2">Kitaaluma</th>
                <th className="text-left p-2">Tarehe</th>
                <th className="text-left p-2">Vitendo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={12} className="text-center p-6 text-muted-foreground">Hakuna mwanafunzi bado.</td></tr>
              )}
              {filtered.map((r, i) => {
                const submitted = submittedSet.has(r.id);
                return (
                <tr key={r.id} className="border-b hover:bg-muted/50">
                  <td className="p-2 text-muted-foreground">{i + 1}</td>
                  <td className="p-2 font-mono text-xs">{r.reg_no}</td>
                  <td className="p-2 font-medium">{r.full_name}</td>
                  <td className="p-2 text-center">
                    {submitted ? (
                      <span title="Amewasilisha" className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-4 w-4" />
                      </span>
                    ) : (
                      <span title="Hajawasilisha" className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-destructive/10 text-destructive">
                        <XCircle className="h-4 w-4" />
                      </span>
                    )}
                  </td>
                  <td className="p-2">{r.phone || "-"}</td>
                  <td className="p-2">{r.course || "-"}</td>
                  <td className="p-2">{r.semina}</td>
                  <td className="p-2">{r.student_group}</td>
                  <td className="p-2">{r.study_year ? `Mwaka ${r.study_year}` : "-"}</td>
                  <td className="p-2">{r.academic_year || "-"}</td>
                  <td className="p-2 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(r)} title="Hariri"><Pencil className="h-3 w-3" /></Button>
                      <Button size="sm" variant="destructive" onClick={() => del(r)} title="Futa"><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Hariri Usajili — {editing?.reg_no}</DialogTitle>
            </DialogHeader>
            {editing && (
              <div className="space-y-3">
                <div><Label>Reg Namba</Label><Input value={editing.reg_no} disabled /></div>
                <div><Label>Jina Kamili</Label><Input value={editing.full_name} onChange={(e) => setEditing({ ...editing, full_name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Simu</Label><Input value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
                  <div><Label>Kozi</Label><Input value={editing.course || ""} onChange={(e) => setEditing({ ...editing, course: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Umri</Label><Input type="number" value={editing.age ?? ""} onChange={(e) => setEditing({ ...editing, age: e.target.value ? Number(e.target.value) : null })} /></div>
                  <div>
                    <Label>Jinsia</Label>
                    <Select value={editing.gender || "Mwanaume"} onValueChange={(v) => setEditing({ ...editing, gender: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Mwanaume">Mwanaume</SelectItem>
                        <SelectItem value="Mwanamke">Mwanamke</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Semina</Label>
                  <Select value={editing.semina} onValueChange={(v) => setEditing({ ...editing, semina: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {seminaList.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      {!seminaList.includes(editing.semina) && <SelectItem value={editing.semina}>{editing.semina}</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Group</Label>
                  <Select value={editing.student_group} onValueChange={(v) => setEditing({ ...editing, student_group: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {groupList.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      {!groupList.includes(editing.student_group) && <SelectItem value={editing.student_group}>{editing.student_group}</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Mwaka wa Masomo</Label>
                    <Select value={editing.study_year ? String(editing.study_year) : "none"} onValueChange={(v) => setEditing({ ...editing, study_year: v === "none" ? null : Number(v) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Haujawekwa</SelectItem>
                        {STUDY_YEARS.map((year) => <SelectItem key={year} value={String(year)}>Mwaka wa {year}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Mwaka wa Kitaaluma</Label>
                    <Select value={editing.academic_year || "none"} onValueChange={(v) => setEditing({ ...editing, academic_year: v === "none" ? null : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Haujawekwa</SelectItem>
                        {ACADEMIC_YEARS.map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Ghairi</Button>
              <Button onClick={saveEdit}>Hifadhi</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
