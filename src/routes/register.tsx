import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getDeviceId } from "@/lib/device-id";
import { toast } from "sonner";
import { CheckCircle2 } from "lucide-react";

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
  const [form, setForm] = useState({ reg_no: "", full_name: "", phone: "", course: "", age: "", gender: "Mwanaume", semina: "", student_group: "" });
  const [seminaList, setSeminaList] = useState<string[]>([]);
  const [groupList, setGroupList] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    supabase.from("app_settings").select("semina_list, group_list").eq("id", 1).single().then(({ data }: { data: any }) => {
      if (data) {
        setSeminaList((data.semina_list as string[]) || []);
        setGroupList((data.group_list as string[]) || []);
      }
    });
  }, []);

  const handleReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.reg_no || !form.full_name || !form.phone || !form.semina || !form.student_group) {
      toast.error("Jaza taarifa zote zinazohitajika");
      return;
    }
    setConfirmOpen(true);
  };

  const submit = async () => {
    setLoading(true);
    const device_id = getDeviceId();
    // Zuia usajili maradufu — reg_no AU jina kamili
    const regUpper = form.reg_no.toUpperCase();
    const nameTrim = form.full_name.trim();
    const { data: byReg } = await supabase.from("students").select("id, full_name, reg_no").eq("reg_no", regUpper).maybeSingle();
    const { data: byName } = await supabase.from("students").select("id, full_name, reg_no").ilike("full_name", nameTrim).maybeSingle();
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
      toast.error(`Tayari kuna usajili wa ${existing?.full_name} (${existing?.reg_no}). Nenda Huduma kuomba marekebisho.`);
      return;
    }
    const { error } = await supabase.from("students").insert({
      reg_no: form.reg_no,
      full_name: form.full_name,
      phone: form.phone,
      course: form.course || null,
      age: form.age ? Number(form.age) : null,
      gender: form.gender,
      semina: form.semina,
      student_group: form.student_group,
      device_id,
    });
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
          <CardHeader><CardTitle>Usajili wa Mwanafunzi</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleReview} className="space-y-4">
              <div>
                <Label>Reg Namba *</Label>
                <Input value={form.reg_no} onChange={(e) => setForm({ ...form, reg_no: e.target.value.toUpperCase() })} placeholder="Mfano: MUM2021-04-08787" required />
              </div>
              <div>
                <Label>Jina Kamili *</Label>
                <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Namba ya Simu *</Label>
                  <Input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="07XXXXXXXX" required />
                </div>
                <div>
                  <Label>Kozi</Label>
                  <Input value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} placeholder="Mfano: Islamic Studies" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Umri</Label>
                  <Input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
                </div>
                <div>
                  <Label>Jinsia</Label>
                  <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mwanaume">Mwanaume</SelectItem>
                      <SelectItem value="Mwanamke">Mwanamke</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Semina *</Label>
                <Select value={form.semina} onValueChange={(v) => setForm({ ...form, semina: v })}>
                  <SelectTrigger><SelectValue placeholder="Chagua semina" /></SelectTrigger>
                  <SelectContent>
                    {seminaList.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Group *</Label>
                <Select value={form.student_group} onValueChange={(v) => setForm({ ...form, student_group: v })}>
                  <SelectTrigger><SelectValue placeholder="Chagua group" /></SelectTrigger>
                  <SelectContent>
                    {groupList.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>Endelea — Thibitisha Taarifa</Button>
            </form>
          </CardContent>
        </Card>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-primary" /> Thibitisha Usajili</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">Tafadhali hakiki taarifa zako kabla ya kuwasilisha:</p>
              <div className="rounded-lg border p-3 grid grid-cols-2 gap-2 bg-muted/30">
                <div className="text-muted-foreground">Reg Namba:</div><div className="font-semibold">{form.reg_no}</div>
                <div className="text-muted-foreground">Jina:</div><div className="font-semibold">{form.full_name}</div>
                <div className="text-muted-foreground">Simu:</div><div>{form.phone}</div>
                <div className="text-muted-foreground">Kozi:</div><div>{form.course || "-"}</div>
                <div className="text-muted-foreground">Umri:</div><div>{form.age || "-"}</div>
                <div className="text-muted-foreground">Jinsia:</div><div>{form.gender}</div>
                <div className="text-muted-foreground">Semina:</div><div>{form.semina}</div>
                <div className="text-muted-foreground">Group:</div><div>{form.student_group}</div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={loading}>Rudi Sahihisha</Button>
              <Button onClick={submit} disabled={loading}>{loading ? "Inathibitisha..." : "Thibitisha & Sajili"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}