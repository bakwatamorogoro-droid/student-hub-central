import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CalendarDays, Download, Trash2, Users, MapPin, Crosshair, CheckCircle2, XCircle, ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/lib/toast";
import { confirmAction } from "@/lib/alerts";
import { AttendanceSessionPanel } from "@/components/AttendanceSessionPanel";

export const Route = createFileRoute("/admin/attendance")({ component: Page });

function todayEat(): string {
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function Page() {
  const [date, setDate] = useState(todayEat());
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("attendance" as any)
      .select("*")
      .eq("check_in_date", date)
      .order("created_at", { ascending: true });
    setRows((data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [date]);

  const loadSettings = async () => {
    const { data } = await supabase.from("app_settings")
      .select("attendance_lat,attendance_lng,attendance_radius_m,attendance_gps_required,register_radius_m,register_gps_required")
      .eq("id", 1).maybeSingle();
    setSettings(data || { attendance_radius_m: 200, attendance_gps_required: true, register_radius_m: 800, register_gps_required: true });
  };
  useEffect(() => { loadSettings(); }, []);

  const saveSettings = async () => {
    setSavingSettings(true);
    const { error } = await supabase.from("app_settings").update({
      attendance_lat: settings?.attendance_lat ?? null,
      attendance_lng: settings?.attendance_lng ?? null,
      attendance_radius_m: Number(settings?.attendance_radius_m) || 200,
      attendance_gps_required: !!settings?.attendance_gps_required,
      register_radius_m: Number(settings?.register_radius_m) || 800,
      register_gps_required: !!settings?.register_gps_required,
    } as any).eq("id", 1);
    setSavingSettings(false);
    if (error) toast.error(error.message); else toast.success("GPS settings zimehifadhiwa");
  };

  const useMyLocation = async () => {
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 12000 })
      );
      setSettings({ ...settings, attendance_lat: pos.coords.latitude, attendance_lng: pos.coords.longitude });
      toast.success("Eneo limechukuliwa — bofya Hifadhi");
    } catch {
      toast.error("Imeshindikana kupata GPS");
    }
  };

  const del = async (id: string) => {
    if (!(await confirmAction("Futa rekodi hii?", "Haitarudishwa."))) return;
    await supabase.from("attendance" as any).delete().eq("id", id);
    load();
  };

  const setStatus = async (id: string, status: "present" | "absent") => {
    await supabase.from("attendance" as any).update({
      status,
      confirmed_by_admin: true,
      confirmed_at: new Date().toISOString(),
    }).eq("id", id);
    load();
  };

  const confirmAll = async () => {
    if (
      !(await confirmAction(
        `Thibitisha wote (${rows.filter((r) => !r.confirmed_by_admin).length}) kuwa PRESENT?`,
        "Mahudhurio yote yaliyosubiri yatawekwa PRESENT.",
        "Ndiyo, thibitisha",
      ))
    )
      return;
    const ids = rows.filter((r) => !r.confirmed_by_admin).map((r) => r.id);
    if (ids.length === 0) return;
    await supabase.from("attendance" as any).update({
      status: "present", confirmed_by_admin: true, confirmed_at: new Date().toISOString(),
    }).in("id", ids);
    toast.success(`Umethibitisha ${ids.length}`);
    load();
  };

  const delAll = async () => {
    if (!(await confirmAction(`Futa rekodi zote za ${date}?`, "Haitarudishwa.", "Ndiyo, futa zote"))) return;
    await supabase.from("attendance" as any).delete().eq("check_in_date", date);
    toast.success("Zimefutwa");
    load();
  };

  const exportCsv = () => {
    const header = ["Reg", "Jina", "Semina", "Group", "Saa"].join(",");
    const body = rows.map((r) =>
      [r.reg_no, r.full_name, r.semina || "", r.student_group || "", new Date(r.created_at).toLocaleString()]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
    ).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `attendance-${date}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Group by semina + group
  const grouped = rows.reduce<Record<string, any[]>>((acc, r) => {
    const k = `${r.semina || "—"} • ${r.student_group || "—"}`;
    (acc[k] = acc[k] || []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Rotating-QR sessions: students scan this to check in within 50 m */}
      <AttendanceSessionPanel />

      {/* GPS settings */}
      <Card className="bg-gradient-to-br from-primary/10 via-card to-emerald-500/10 border-2 border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Eneo la Mahudhurio (GPS)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2">
            <Switch checked={!!settings?.attendance_gps_required} onCheckedChange={(v) => setSettings({ ...settings, attendance_gps_required: v })} />
            <span className="text-sm">Lazima GPS iwashwe ili kuhudhuria</span>
          </label>
          <div className="grid sm:grid-cols-3 gap-2">
            <div><Label className="text-xs">Latitude</Label><Input type="number" step="any" value={settings?.attendance_lat ?? ""} onChange={(e) => setSettings({ ...settings, attendance_lat: e.target.value === "" ? null : Number(e.target.value) })} /></div>
            <div><Label className="text-xs">Longitude</Label><Input type="number" step="any" value={settings?.attendance_lng ?? ""} onChange={(e) => setSettings({ ...settings, attendance_lng: e.target.value === "" ? null : Number(e.target.value) })} /></div>
            <div><Label className="text-xs">Umbali wa mahudhurio (mita)</Label><Input type="number" value={settings?.attendance_radius_m ?? 200} onChange={(e) => setSettings({ ...settings, attendance_radius_m: e.target.value })} /></div>
          </div>
          <div className="rounded-lg border p-3 space-y-2 bg-background/50">
            <label className="flex items-center gap-2">
              <Switch checked={!!settings?.register_gps_required} onCheckedChange={(v) => setSettings({ ...settings, register_gps_required: v })} />
              <span className="text-sm font-medium">Usajili: lazima mwanafunzi awe karibu na chuo</span>
            </label>
            <div className="max-w-xs"><Label className="text-xs">Umbali wa usajili kutoka chuo (mita)</Label><Input type="number" value={settings?.register_radius_m ?? 800} onChange={(e) => setSettings({ ...settings, register_radius_m: e.target.value })} /></div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={useMyLocation}><Crosshair className="h-4 w-4 mr-1" />Tumia eneo langu sasa</Button>
            <Button size="sm" onClick={saveSettings} disabled={savingSettings}>{savingSettings ? "Inahifadhi..." : "Hifadhi"}</Button>
            {settings?.attendance_lat != null && (
              <a className="text-xs text-primary underline self-center" target="_blank" rel="noopener"
                href={`https://www.google.com/maps?q=${settings.attendance_lat},${settings.attendance_lng}`}>
                Tazama kwenye ramani
              </a>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" /> Mahudhurio</h2>
          <p className="text-sm text-muted-foreground">
            Jumla: <b>{rows.length}</b> •
            Present: <b className="text-emerald-600">{rows.filter((r) => r.status === "present").length}</b> •
            Absent: <b className="text-destructive">{rows.filter((r) => r.status === "absent").length}</b> •
            Hawajathibitishwa: <b className="text-yellow-600">{rows.filter((r) => !r.confirmed_by_admin).length}</b>
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" />
          <Button onClick={confirmAll} disabled={rows.filter((r) => !r.confirmed_by_admin).length === 0}><ShieldCheck className="h-4 w-4 mr-1" />Thibitisha Wote</Button>
          <Button variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button variant="destructive" onClick={delAll} disabled={!rows.length}><Trash2 className="h-4 w-4 mr-1" />Futa Zote</Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {Object.entries(grouped).map(([k, list]) => (
          <Card key={k} className="bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/30">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="font-bold">{k}</div>
                <div className="text-xs text-muted-foreground">{list.length} waliohudhuria</div>
              </div>
              <Users className="h-8 w-8 text-emerald-600/60" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Orodha</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Reg</TableHead>
                <TableHead>Jina</TableHead>
                <TableHead>Semina</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Saa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={8} className="text-center py-6">Inapakia...</TableCell></TableRow>}
              {!loading && rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">Hakuna rekodi za tarehe hii.</TableCell></TableRow>}
              {rows.map((r, i) => (
                <TableRow key={r.id} className={r.status === "absent" ? "opacity-60" : ""}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="font-mono">{r.reg_no}</TableCell>
                  <TableCell>{r.full_name}</TableCell>
                  <TableCell>{r.semina || "—"}</TableCell>
                  <TableCell>{r.student_group || "—"}</TableCell>
                  <TableCell className="text-xs">{new Date(r.created_at).toLocaleTimeString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant={r.status === "present" ? "default" : "outline"}
                        className="h-7 px-2"
                        onClick={() => setStatus(r.id, "present")}
                      ><CheckCircle2 className="h-3 w-3 mr-1" />Present</Button>
                      <Button
                        size="sm"
                        variant={r.status === "absent" ? "destructive" : "outline"}
                        className="h-7 px-2"
                        onClick={() => setStatus(r.id, "absent")}
                      ><XCircle className="h-3 w-3 mr-1" />Absent</Button>
                      {r.confirmed_by_admin && <ShieldCheck className="h-3 w-3 text-emerald-600 ml-1" />}
                    </div>
                  </TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => del(r.id)}><Trash2 className="h-3 w-3" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}