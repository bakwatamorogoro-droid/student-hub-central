import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QrCodeDisplay } from "@/components/QrCodeDisplay";
import { rotateSessionToken } from "@/lib/attendance.functions";
import { getAdminToken } from "@/lib/admin-session";
import { GROUPS } from "@/lib/academicTargeting";
import { toast } from "@/lib/toast";
import { Crosshair, Loader2, Play, Square, Users } from "lucide-react";

const ROTATE_MS = 25_000;

/** QR payload. Versioned so the reader can reject anything it does not understand. */
export function encodeQrToken(token: string): string {
  return JSON.stringify({ v: 1, t: token });
}

export function decodeQrToken(text: string): string | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.v === 1 && typeof parsed.t === "string") return parsed.t;
  } catch {
    /* not our payload */
  }
  return null;
}

type Session = {
  id: string;
  title: string;
  semina: string | null;
  student_group: string | null;
  radius_m: number;
};

export function AttendanceSessionPanel() {
  const [title, setTitle] = useState("");
  const [semina, setSemina] = useState("");
  const [group, setGroup] = useState("all");
  const [radius, setRadius] = useState(50);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [seminaList, setSeminaList] = useState<string[]>([]);
  const [useFixed, setUseFixed] = useState(true);

  const [session, setSession] = useState<Session | null>(null);
  const [token, setToken] = useState("");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [present, setPresent] = useState<{ full_name: string; created_at: string; distance_m: number | null }[]>([]);
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

  const loadPresent = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from("attendance" as never)
      .select("full_name, created_at, distance_m")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });
    setPresent((data as typeof present) || []);
  }, []);

  // Issue a new token every ROTATE_MS so a shared screenshot goes stale quickly.
  const refreshToken = useCallback(
    async (sessionId: string) => {
      const adminToken = getAdminToken();
      if (!adminToken) return { token: null, expiresAt: null };
      const res = await rotateSessionToken({ data: { sessionId, adminToken } });
      if (!res.ok) {
        toast.error("Imeshindikana kutengeneza QR. Endesha supabase/APPLY_STUDENT_PIN_AUTH.sql kwenye SQL Editor.");
        return false;
      }
      setToken(encodeQrToken(res.token));
      setExpiresAt(res.expiresAt);
      return true;
    },
    [],
  );

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
      const { data, error } = await supabase
        .from("attendance_sessions" as never)
        .insert({
          title: title.trim(),
          semina: semina || null,
          student_group: group === "all" ? null : group,
          lat: useFixed ? lat : null,
          lng: useFixed ? lng : null,
          radius_m: radius,
          active: true,
        } as never)
        .select("id, title, semina, student_group, radius_m")
        .single();

      if (error) {
        toast.error(
          error.message.includes("does not exist")
            ? "Jedwali la vipindi halipo — endesha supabase/APPLY_STUDENT_PIN_AUTH.sql"
            : "Imeshindikana kuanzisha kipindi: " + error.message,
        );
        return;
      }

      const created = data as unknown as Session;
      setSession(created);
      const ok = await refreshToken(created.id);
      if (ok) toast.success("Kipindi kimeanza — wanafunzi wanaweza kuscan");
    } finally {
      setBusy(false);
    }
  };

  const endSession = async () => {
    if (!session) return;
    setBusy(true);
    await supabase
      .from("attendance_sessions" as never)
      .update({ active: false, closes_at: new Date().toISOString() } as never)
      .eq("id", session.id);
    setSession(null);
    setToken("");
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
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mfano: Fiqh — Somo la 4" />
            </div>
            <div className="space-y-1.5">
              <Label>Semina</Label>
              <Select value={semina} onValueChange={setSemina}>
                <SelectTrigger><SelectValue placeholder="Chagua semina" /></SelectTrigger>
                <SelectContent>
                  {seminaList.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Group</Label>
              <Select value={group} onValueChange={setGroup}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wote</SelectItem>
                  {GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Umbali wa ruhusa (mita)</Label>
              <Input type="number" value={radius} min={5} max={5000}
                onChange={(e) => setRadius(Number(e.target.value) || 50)} />
            </div>
          </div>

          <div className="rounded-xl border border-border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Tumia eneo maalum la darasa</p>
                <p className="text-xs text-muted-foreground">Zima kama kipindi hakina eneo maalum</p>
              </div>
              <Switch checked={useFixed} onCheckedChange={setUseFixed} />
            </div>
            {useFixed && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Latitude</Label>
                    <Input type="number" step="any" value={lat ?? ""} onChange={(e) => setLat(e.target.value === "" ? null : Number(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Longitude</Label>
                    <Input type="number" step="any" value={lng ?? ""} onChange={(e) => setLng(e.target.value === "" ? null : Number(e.target.value))} />
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={captureLocation} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />}
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
          {session.semina || "Semina yoyote"} • {session.student_group || "Wote"} • {session.radius_m}m
        </p>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col items-center gap-3">
          {token ? <QrCodeDisplay value={token} /> : <div className="aspect-square w-full animate-pulse rounded-xl bg-muted" />}
          <p className="text-center text-xs text-muted-foreground">
            QR inabadilika kila sekunde 25.
            {expiresAt && <> Inaisha {new Date(expiresAt).toLocaleTimeString("sw-TZ")}.</>}
          </p>
        </div>
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="font-semibold">Waliohudhuria</span>
            <span className="ml-auto text-lg font-extrabold tabular-nums text-emerald-600 dark:text-emerald-400">{present.length}</span>
          </div>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {present.length === 0 && <p className="text-sm text-muted-foreground">Bado hakuna.</p>}
            {present.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
                <span className="truncate font-medium">{p.full_name}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                  {p.distance_m != null ? `${Math.round(p.distance_m)}m` : ""} · {new Date(p.created_at).toLocaleTimeString("sw-TZ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
