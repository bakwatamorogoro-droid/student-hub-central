import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Archive,
  CalendarDays,
  ChevronDown,
  Crosshair,
  Download,
  History,
  Loader2,
  MapPin,
  QrCode,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { confirmAction } from "@/lib/alerts";
import { AttendanceSessionPanel } from "@/components/AttendanceSessionPanel";
import {
  deleteAttendanceSession,
  fetchSessionPresent,
  listSessionSummaries,
  type PresentRow,
  type SessionSummary,
} from "@/lib/attendance";

export const Route = createFileRoute("/admin/attendance")({ component: Page });

function Page() {
  return (
    <div className="space-y-4">
      {/* Starts and ends the live sessions students scan into. */}
      <SessionsAndArchive />

      <GpsSettings />

      <AdminAccessQr />

      <LegacyArchive />
    </div>
  );
}

/**
 * A QR of this page's own address, so the admin can open the attendance console
 * on a phone without typing a URL. Scanning it while signed in on that phone
 * lands straight on the console; the admin login still guards the page itself.
 */
function AdminAccessQr() {
  const [png, setPng] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Built from the live origin rather than a hardcoded host, so a preview
    // deployment points at itself.
    const url = `${window.location.origin}/admin/attendance`;
    QRCode.toDataURL(url, {
      width: 600,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((data) => {
        if (!cancelled) setPng(data);
      })
      .catch(() => {
        if (!cancelled) setPng(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const download = () => {
    if (!png) return;
    const a = document.createElement("a");
    a.href = png;
    a.download = "QR-admin-mahudhurio.png";
    a.click();
  };

  return (
    <Card className="border-2 border-primary/25 bg-gradient-to-br from-primary/10 via-card to-secondary/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="h-4 w-4 text-primary" /> QR ya Admin
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Skani QR hii kwa simu ili kufungua ukurasa huu wa mahudhurio bila kuandika link. Ingia kwa
          akaunti yako ya admin kwenye simu hiyo kwanza.
        </p>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-5">
        {png ? (
          <img
            src={png}
            alt="QR ya ukurasa wa mahudhurio wa admin"
            className="h-40 w-40 rounded-xl border bg-white p-2"
          />
        ) : (
          <div className="h-40 w-40 animate-pulse rounded-xl bg-muted" />
        )}
        <div className="space-y-2">
          <p className="font-mono text-xs text-muted-foreground">/admin/attendance</p>
          <Button size="sm" variant="outline" onClick={download} disabled={!png}>
            <Download className="h-4 w-4" /> Pakua PNG
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The pre-session `attendance` table, kept visible so the 251 rows already in it
 * do not disappear from the admin's view.
 *
 * It is read-only history: that table allows one row per student per calendar
 * day, so it cannot record a second lecture, and nothing writes to it for
 * display any more. New check-ins are per session and live in the archive above.
 */
function LegacyArchive() {
  const [rows, setRows] = useState<
    Array<{
      id: string;
      reg_no: string | null;
      full_name: string | null;
      semina: string | null;
      student_group: string | null;
      check_in_date: string | null;
      created_at: string;
      status: string | null;
    }>
  >([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Loaded only when the admin opens it, so the common case costs no query.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    supabase
      .from("attendance" as never)
      .select("id, reg_no, full_name, semina, student_group, check_in_date, created_at, status")
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data }) => {
        if (cancelled) return;
        setRows((data as typeof rows) || []);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, loaded, rows]);

  const exportCsv = () => {
    const header = ["Tarehe", "Reg", "Jina", "Semina", "Group", "Status"].join(",");
    const body = rows
      .map((r) =>
        [
          r.check_in_date ?? "",
          r.reg_no ?? "",
          r.full_name ?? "",
          r.semina ?? "",
          r.student_group ?? "",
          r.status ?? "",
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mahudhurio-rekodi-za-zamani.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left"
          onClick={() => setOpen((v) => !v)}
        >
          <History className="h-4 w-4" />
          <CardTitle className="text-base">Rekodi za Zamani</CardTitle>
          <Badge variant="outline" className="ml-2 text-[10px]">
            Mfumo wa awali
          </Badge>
          <ChevronDown
            className={`ml-auto h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        <p className="text-xs text-muted-foreground">
          Mahudhurio yaliyorekodiwa kabla ya mfumo wa vipindi. Yanarekodiwa mara moja kwa siku, kwa
          hiyo somo la pili la siku moja halionekani hapa — linapatikana kwenye vipindi juu.
        </p>
      </CardHeader>
      {open && (
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-4 pb-2">
            <span className="text-sm text-muted-foreground">Rekodi {rows.length}</span>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!rows.length}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>
          {!loaded ? (
            <div className="flex items-center gap-2 px-4 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Inapakia…
            </div>
          ) : rows.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted-foreground">Hakuna rekodi za zamani.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarehe</TableHead>
                  <TableHead>Reg</TableHead>
                  <TableHead>Jina</TableHead>
                  <TableHead>Semina</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.check_in_date ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.reg_no ?? "—"}</TableCell>
                    <TableCell>{r.full_name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.semina ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.student_group ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={r.status === "present" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {r.status ?? "—"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      )}
    </Card>
  );
}

/** The live session panel plus the archive of every session ever run. */
function SessionsAndArchive() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await listSessionSummaries());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (s: SessionSummary) => {
    if (
      !(await confirmAction(
        `Futa kipindi "${s.title}"?`,
        `Mahudhurio ${s.presentCount} ya wanafunzi yataondolewa pamoja na kipindi. Haitarudishwa.`,
        "Ndiyo, futa",
      ))
    )
      return;
    const ok = await deleteAttendanceSession(s.id);
    if (ok) {
      toast.success("Kipindi kimefutwa");
      if (openId === s.id) setOpenId(null);
      await load();
    } else {
      toast.error("Imeshindikana kufuta kipindi");
    }
  };

  return (
    <>
      <AttendanceSessionPanel onSessionChange={load} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Archive className="h-4 w-4" /> Vipindi Vyote
            <span className="ml-auto text-sm font-normal text-muted-foreground">
              {sessions.length} kipindi
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Kila kipindi kilichoanzishwa, pamoja na idadi ya waliohudhuria. Bofya kipindi kuona
            orodha kamili na kupakua CSV.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Inapakia…
            </div>
          ) : sessions.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              Hakuna kipindi kilichoanzishwa bado. Anzisha kipindi juu ili wanafunzi waweze
              kuhudhuria.
            </p>
          ) : (
            <div className="divide-y">
              {sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  open={openId === s.id}
                  onToggle={() => setOpenId(openId === s.id ? null : s.id)}
                  onDelete={() => remove(s)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function SessionRow({
  session,
  open,
  onToggle,
  onDelete,
}: {
  session: SessionSummary;
  open: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [present, setPresent] = useState<PresentRow[] | null>(null);

  // Loaded on first expand, not up front: a teacher opens one session at a
  // time, and the list costs a query per session.
  useEffect(() => {
    if (!open || present) return;
    let cancelled = false;
    fetchSessionPresent(session.id).then((rows) => {
      if (!cancelled) setPresent(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [open, present, session.id]);

  const exportCsv = () => {
    const rows = present ?? [];
    const header = ["Reg", "Jina", "Njia", "Umbali (m)", "Saa"].join(",");
    const body = rows
      .map((r) =>
        [
          r.regNo,
          r.fullName,
          r.method === "qr" ? "QR" : "Msimbo",
          r.distanceM != null ? Math.round(r.distanceM) : "",
          new Date(r.createdAt).toLocaleString("sw-TZ"),
        ]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mahudhurio-${session.title.replace(/[^\w-]+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-auto flex-1 justify-start py-1 text-left"
          onClick={onToggle}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-semibold">
              <span className="truncate">{session.title}</span>
              {session.active ? (
                <Badge className="text-[10px]">Inaendelea</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">
                  Imefungwa
                </Badge>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span>{session.semina || "—"}</span>
              <span>• {session.studentGroup || "Wote"}</span>
              <span>• {session.radiusM}m</span>
              {session.joinCode && <span className="font-mono">• {session.joinCode}</span>}
              <span>
                •{" "}
                {session.startedAt
                  ? new Date(session.startedAt).toLocaleString("sw-TZ", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : "—"}
              </span>
            </div>
          </div>
        </Button>
        <div className="flex shrink-0 items-center gap-1">
          <span className="flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-1 text-sm font-bold text-emerald-700 dark:text-emerald-400">
            <Users className="h-3.5 w-3.5" /> {session.presentCount}
          </span>
          <Button size="sm" variant="ghost" onClick={onDelete} title="Futa kipindi">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      {open && (
        <div className="border-t bg-muted/30 px-4 py-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold">Waliohudhuria</span>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!present?.length}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>
          {!present ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Inapakia…
            </div>
          ) : present.length === 0 ? (
            <p className="text-sm text-muted-foreground">Hakuna mwanafunzi aliyehudhuria.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Reg</TableHead>
                  <TableHead>Jina</TableHead>
                  <TableHead>Njia</TableHead>
                  <TableHead>Umbali</TableHead>
                  <TableHead>Saa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {present.map((r, i) => (
                  <TableRow key={`${r.studentId}-${r.createdAt}`}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell className="font-mono">{r.regNo}</TableCell>
                    <TableCell>{r.fullName}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {r.method === "qr" ? "QR" : "Msimbo"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.distanceM != null ? `${Math.round(r.distanceM)}m` : "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {new Date(r.createdAt).toLocaleTimeString("sw-TZ")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The attendance point and radius. Kept because the session form defaults to
 * these coordinates, and registration reuses the point as "the school".
 */
/** Every field is optional: the form patches one at a time as the admin types. */
type GpsSettingsRow = {
  attendance_lat?: number | null;
  attendance_lng?: number | null;
  attendance_radius_m?: number | string | null;
  attendance_gps_required?: boolean | null;
  register_radius_m?: number | string | null;
  register_gps_required?: boolean | null;
};

function GpsSettings() {
  const [settings, setSettings] = useState<GpsSettingsRow | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("app_settings")
      .select(
        "attendance_lat,attendance_lng,attendance_radius_m,attendance_gps_required,register_radius_m,register_gps_required",
      )
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        setSettings(
          (data as GpsSettingsRow) || {
            attendance_lat: null,
            attendance_lng: null,
            attendance_radius_m: 200,
            attendance_gps_required: true,
            register_radius_m: 800,
            register_gps_required: true,
          },
        );
      });
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .update({
        attendance_lat: settings?.attendance_lat ?? null,
        attendance_lng: settings?.attendance_lng ?? null,
        attendance_radius_m: Number(settings?.attendance_radius_m) || 200,
        attendance_gps_required: !!settings?.attendance_gps_required,
        register_radius_m: Number(settings?.register_radius_m) || 800,
        register_gps_required: !!settings?.register_gps_required,
      } as never)
      .eq("id", 1);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("GPS settings zimehifadhiwa");
  };

  const useMyLocation = async () => {
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, {
          enableHighAccuracy: true,
          timeout: 12000,
        }),
      );
      setSettings({
        ...settings,
        attendance_lat: pos.coords.latitude,
        attendance_lng: pos.coords.longitude,
      });
      toast.success("Eneo limechukuliwa — bofya Hifadhi");
    } catch {
      toast.error("Imeshindikana kupata GPS");
    }
  };

  return (
    <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-card to-emerald-500/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MapPin className="h-4 w-4 text-primary" /> Eneo la Mahudhurio (GPS)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Vipindi vipya huanza na eneo hili. Wanafunzi wanaoscan QR wanatakiwa wawe ndani ya umbali
          uliowekwa.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-2">
          <Switch
            checked={!!settings?.attendance_gps_required}
            onCheckedChange={(v) => setSettings({ ...settings, attendance_gps_required: v })}
          />
          <span className="text-sm">Lazima GPS iwashwe ili kuhudhuria</span>
        </label>
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Latitude</Label>
            <Input
              type="number"
              step="any"
              value={settings?.attendance_lat ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  attendance_lat: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </div>
          <div>
            <Label className="text-xs">Longitude</Label>
            <Input
              type="number"
              step="any"
              value={settings?.attendance_lng ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  attendance_lng: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </div>
          <div>
            <Label className="text-xs">Umbali wa mahudhurio (mita)</Label>
            <Input
              type="number"
              value={settings?.attendance_radius_m ?? 200}
              onChange={(e) => setSettings({ ...settings, attendance_radius_m: e.target.value })}
            />
          </div>
        </div>
        <div className="space-y-2 rounded-lg border bg-background/50 p-3">
          <label className="flex items-center gap-2">
            <Switch
              checked={!!settings?.register_gps_required}
              onCheckedChange={(v) => setSettings({ ...settings, register_gps_required: v })}
            />
            <span className="text-sm font-medium">
              Usajili: lazima mwanafunzi awe karibu na chuo
            </span>
          </label>
          <div className="max-w-xs">
            <Label className="text-xs">Umbali wa usajili kutoka chuo (mita)</Label>
            <Input
              type="number"
              value={settings?.register_radius_m ?? 800}
              onChange={(e) => setSettings({ ...settings, register_radius_m: e.target.value })}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={useMyLocation}>
            <Crosshair className="h-4 w-4" /> Tumia eneo langu sasa
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Inahifadhi..." : "Hifadhi"}
          </Button>
          {settings?.attendance_lat != null && (
            <a
              className="self-center text-xs text-primary underline"
              target="_blank"
              rel="noopener"
              href={`https://www.google.com/maps?q=${settings.attendance_lat},${settings.attendance_lng}`}
            >
              Tazama kwenye ramani
            </a>
          )}
        </div>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <CalendarDays className="h-3 w-3" /> Mahudhurio hurekodiwa mara moja kwa kipindi, si kwa
          siku.
        </p>
      </CardContent>
    </Card>
  );
}
