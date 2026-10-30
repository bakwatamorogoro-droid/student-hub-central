import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QrCodeDisplay } from "@/components/QrCodeDisplay";
import { encodeQrToken } from "@/lib/attendance-qr";
import { AttendanceQrPoster } from "@/components/AttendanceQrPoster";
import { Badge } from "@/components/ui/badge";
import {
  endAttendanceSession,
  fetchSessionPresent,
  type Session as AttendanceSession,
  makeJoinCode,
  rotateSessionToken,
  startAttendanceSession,
} from "@/lib/attendance";
import { GROUPS } from "@/lib/academicTargeting";
import { toast } from "@/lib/toast";
import { Crosshair, Loader2, Play, Square, Users } from "lucide-react";

const ROTATE_MS = 25_000;

type PanelSession = AttendanceSession;

export function AttendanceSessionPanel() {
  const [title, setTitle] = useState("");
  const [semina, setSemina] = useState("");
  const [group, setGroup] = useState("all");
  const [radius, setRadius] = useState(50);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [seminaList, setSeminaList] = useState<string[]>([]);
  const [useFixed, setUseFixed] = useState(true);

  const [session, setSession] = useState<PanelSession | null>(null);
  const [token, setToken] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [present, setPresent] = useState<
    {
      full_name: string;
      reg_no: string;
      created_at: string;
      distance_m: number | null;
      method: string | null;
    }[]
  >([]);
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);

  // Default coordinates come from the admin's saved attendance point.
  useEffect(() => {
    supabase
      .from("app_settings")
      .select("attendance_lat, attendance_lng, attendance_radius_m, semina_list")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        const s = data as {
          attendance_lat: number | null;
          attendance_lng: number | null;
          attendance_radius_m: number | null;
          semina_list: string[] | null;
        } | null;
        if (s?.attendance_lat != null) setLat(s.attendance_lat);
        if (s?.attendance_lng != null) setLng(s.attendance_lng);
        setSeminaList(s?.semina_list || []);
      });
  }, []);

  const captureLocation = () => {
    if (!navigator.geolocation) return toast.error("Kifaa hiki hakitumii GPS");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
        setBusy(false);
        toast.success("Eneo la darasa limechukuliwa");
      },
      () => {
        setBusy(false);
        toast.error("Imeshindikana kupata eneo. Ruhusu GPS.");
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  // Read through an RPC: HARDEN_RLS leaves `attendance` with no policy, so a
  // table select from the browser returns no rows and the list looked empty.
  const loadPresent = useCallback(async (sessionId: string) => {
    const rows = await fetchSessionPresent(sessionId);
    setPresent(
      rows.map((r) => ({
        full_name: r.fullName,
        reg_no: r.regNo,
        created_at: r.createdAt,
        distance_m: r.distanceM,
        method: r.method,
      })),
    );
  }, []);

  // Issue a new token every ROTATE_MS so a shared screenshot goes stale quickly.
  const refreshToken = useCallback(async (sessionId: string) => {
    const res = await rotateSessionToken(sessionId);
    if (!res.ok) {
      toast.error("Imeshindikana kutengeneza QR. Jaribu tena.");
      return false;
    }
    setToken(encodeQrToken(res.token));
    setExpiresAt(res.expiresAt);
    return true;
  }, []);

  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => void refreshToken(session.id), ROTATE_MS);
    const poll = setInterval(() => void loadPresent(session.id), 5000);
    return () => {
      clearInterval(id);
      clearInterval(poll);
    };
  }, [session, refreshToken, loadPresent]);

  const startSession = async () => {
    if (!title.trim()) return toast.error("Andika jina la kipindi");
    if (useFixed && (lat == null || lng == null)) {
      return toast.error("Weka eneo la darasa kwanza (GPS au kwa mkono)");
    }
    setBusy(true);
    try {
      const res = await startAttendanceSession({
        title: title.trim(),
        semina: semina || null,
        studentGroup: group === "all" ? null : group,
        lat: useFixed ? lat : null,
        lng: useFixed ? lng : null,
        radiusM: radius,
        joinCode: makeJoinCode(),
      });

      if (!res.ok) {
        toast.error("Imeshindikana kuanzisha kipindi: " + res.message);
        return;
      }

      const created = res.session;
      setSession(created);
      setJoinCode(created.joinCode || "");
      const ok = await refreshToken(created.id);
      if (ok) toast.success("Kipindi kimeanza — wanafunzi wanaweza kuscan");
    } finally {
      setBusy(false);
    }
  };

  const endSession = async () => {
    if (!session) return;
    setBusy(true);
    await endAttendanceSession(session.id);
    setSession(null);
    setToken("");
    setJoinCode("");
    setPresent([]);
    setBusy(false);
    toast.success("Kipindi kimefungwa");
  };

  if (!session) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Play className="h-4 w-4" /> Anzisha Kipindi cha Mahudhurio
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Jina la kipindi</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Mfano: Fiqh — Somo la 4"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Semina</Label>
              <Select value={semina} onValueChange={setSemina}>
                <SelectTrigger>
                  <SelectValue placeholder="Chagua semina" />
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
            <div className="space-y-1.5">
              <Label>Group</Label>
              <Select value={group} onValueChange={setGroup}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wote</SelectItem>
                  {GROUPS.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Umbali wa ruhusa (mita)</Label>
              <Input
                type="number"
                value={radius}
                min={5}
                max={5000}
                onChange={(e) => setRadius(Number(e.target.value) || 50)}
              />
            </div>
          </div>

          <div className="rounded-xl border border-border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Tumia eneo maalum la darasa</p>
                <p className="text-xs text-muted-foreground">
                  Zima kama kipindi hakina eneo maalum
                </p>
              </div>
              <Switch checked={useFixed} onCheckedChange={setUseFixed} />
            </div>
            {useFixed && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Latitude</Label>
                    <Input
                      type="number"
                      step="any"
                      value={lat ?? ""}
                      onChange={(e) =>
                        setLat(e.target.value === "" ? null : Number(e.target.value))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Longitude</Label>
                    <Input
                      type="number"
                      step="any"
                      value={lng ?? ""}
                      onChange={(e) =>
                        setLng(e.target.value === "" ? null : Number(e.target.value))
                      }
                    />
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={captureLocation} disabled={busy}>
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Crosshair className="h-4 w-4" />
                  )}
                  Chukua eneo langu la sasa
                </Button>
              </>
            )}
          </div>

          <Button onClick={startSession} disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Anzisha kipindi
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-emerald-500/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{session.title}</span>
          <Button variant="destructive" size="sm" onClick={endSession} disabled={busy}>
            <Square className="h-3.5 w-3.5" /> Funga
          </Button>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {session.semina || "Semina yoyote"} • {session.studentGroup || "Wote"} • {session.radiusM}
          m
        </p>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col items-center gap-3">
          {token ? (
            <QrCodeDisplay value={token} />
          ) : (
            <div className="aspect-square w-full animate-pulse rounded-xl bg-muted" />
          )}
          <p className="text-center text-xs text-muted-foreground">
            QR inabadilika kila sekunde 25.
            {expiresAt && <> Inaisha {new Date(expiresAt).toLocaleTimeString("sw-TZ")}.</>}
          </p>
          {joinCode && (
            <div className="w-full rounded-xl border border-primary/25 bg-primary/5 p-3 text-center">
              <p className="text-xs text-muted-foreground">Msimbo wa kujiunga bila kamera</p>
              <p className="font-mono text-2xl font-extrabold tracking-[0.3em] text-primary">
                {joinCode}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Sema kwa wanafunzi waliopo darasani. Umbali unahitajika sawa na QR.
              </p>
            </div>
          )}
          {joinCode && (
            <AttendanceQrPoster
              session={{
                title: session.title,
                semina: session.semina,
                studentGroup: session.studentGroup,
                radiusM: session.radiusM,
              }}
              joinCode={joinCode}
            />
          )}
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="font-semibold">Waliohudhuria</span>
            <span className="ml-auto text-lg font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">
              {present.length}
            </span>
          </div>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {present.length === 0 && <p className="text-sm text-muted-foreground">Bado hakuna.</p>}
            {present.map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm"
              >
                <span className="min-w-0 truncate font-medium">
                  {p.full_name}
                  {p.reg_no && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{p.reg_no}</span>
                  )}
                </span>
                <span className="ml-2 flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  {p.method && (
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {p.method === "qr" ? "QR" : "Msimbo"}
                    </Badge>
                  )}
                  {p.distance_m != null ? `${Math.round(p.distance_m)}m` : ""} ·{" "}
                  {new Date(p.created_at).toLocaleTimeString("sw-TZ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
