import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ClipboardCheck, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";

function todayEat(): string {
  // Africa/Dar_es_Salaam = UTC+3, no DST
  const d = new Date(Date.now() + 3 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function AttendanceCheckIn() {
  const { t } = useI18n();
  const [reg, setReg] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ name: string; date: string } | null>(null);
  const [count, setCount] = useState(0);
  const [settings, setSettings] = useState<any>(null);

  useEffect(() => {
    supabase.from("app_settings").select("attendance_lat,attendance_lng,attendance_radius_m,attendance_gps_required").eq("id", 1).maybeSingle()
      .then(({ data }: { data: any }) => setSettings(data));
  }, []);

  const loadCount = async () => {
    const { count: c } = await supabase
      .from("attendance" as any)
      .select("id", { count: "exact", head: true })
      .eq("check_in_date", todayEat());
    setCount(c || 0);
  };
  useEffect(() => { loadCount(); }, []);

  useEffect(() => {
    const saved = localStorage.getItem("student_reg");
    if (saved) setReg(saved);
  }, []);

  const checkIn = async () => {
    const r = reg.trim().toUpperCase();
    if (!r) { toast.error("Andika Reg Namba"); return; }
    setLoading(true);
    try {
      const { data: s } = await supabase
        .from("students").select("id, full_name, reg_no, semina, student_group")
        .eq("reg_no", r).maybeSingle();
      if (!s) { toast.error("Reg Namba haijasajiliwa"); return; }

      // GPS — kama imewashwa na admin
      let coords: { lat?: number; lng?: number; dist?: number } = {};
      if (settings?.attendance_gps_required !== false) {
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 12000 })
          );
          coords.lat = pos.coords.latitude;
          coords.lng = pos.coords.longitude;
          if (settings?.attendance_lat != null && settings?.attendance_lng != null) {
            const dist = haversine(coords.lat, coords.lng, settings.attendance_lat, settings.attendance_lng);
            coords.dist = dist;
            const radius = settings.attendance_radius_m || 200;
            if (dist > radius) {
              toast.error(`Uko mbali sana na eneo la mahudhurio (${Math.round(dist)}m, ruhusa ${radius}m).`);
              return;
            }
          }
        } catch {
          toast.error("Lazima uruhusu GPS kuendelea na mahudhurio");
          return;
        }
      }

      const { error } = await supabase.from("attendance" as any).insert({
        student_id: s.id, reg_no: s.reg_no, full_name: s.full_name,
        semina: s.semina, student_group: s.student_group,
        gps_lat: coords.lat ?? null, gps_lng: coords.lng ?? null, distance_m: coords.dist ?? null,
      } as any);
      if (error && !String(error.message).toLowerCase().includes("duplicate")) {
        toast.error("Imeshindikana: " + error.message); return;
      }
      setDone({ name: s.full_name, date: todayEat() });
      toast.success("Umesajiliwa kuhudhuria leo ✓");

      // Angalia kama ni peke yake kwenye group lake leo — mhamasishe wenzake
      try {
        const { count: groupCount } = await supabase
          .from("attendance" as any)
          .select("id", { count: "exact", head: true })
          .eq("check_in_date", todayEat())
          .eq("semina", s.semina)
          .eq("student_group", s.student_group);
        if ((groupCount || 0) <= 1) {
          toast.warning(
            `Tafadhali waambie wenzako wa ${s.student_group} pia waweke tick — usitie tick peke yako!`,
            { duration: 7000 }
          );
        }
      } catch {}

      loadCount();
    } finally { setLoading(false); }
  };

  return (
    <Card className="h-full bg-gradient-to-br from-emerald-500/15 via-card to-primary/10 border-2 border-emerald-500/30 hover:shadow-2xl transition-all hover:-translate-y-1">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-primary flex items-center justify-center shadow-lg">
            <ClipboardCheck className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-bold leading-tight">{t("attendance_today")}</h3>
            <p className="text-[11px] text-muted-foreground">{t("attendance_sub")}</p>
          </div>
          <div className="ml-auto text-right">
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{count}</div>
            <div className="text-[10px] text-muted-foreground uppercase">{t("attendance_count")}</div>
          </div>
        </div>
        {done ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 animate-fade-in">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div className="font-bold truncate">{done.name}</div>
              <div className="text-xs text-muted-foreground">Umesajiliwa • {done.date}</div>
            </div>
          </div>
        ) : (
          <>
          <div className="flex gap-2">
            <Input
              value={reg}
              onChange={(e) => setReg(e.target.value.toUpperCase())}
              placeholder="REG-001"
              onKeyDown={(e) => { if (e.key === "Enter") checkIn(); }}
              className="font-mono"
            />
            <Button onClick={checkIn} disabled={loading} className="bg-gradient-to-r from-emerald-500 to-primary">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("here")}
            </Button>
          </div>
          {settings?.attendance_gps_required !== false && (
            <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {settings?.attendance_lat != null
                ? <>GPS lazima — umbali wa ruhusa: <b>{settings.attendance_radius_m || 200}m</b></>
                : <>{t("gps_recorded")}</>}
            </p>
          )}
          </>
        )}
      </CardContent>
    </Card>
  );
}