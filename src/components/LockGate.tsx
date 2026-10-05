import { useEffect, useState } from "react";
import { useRouterState, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Lock, Clock, ShieldAlert, CalendarClock, BellRing, KeyRound } from "lucide-react";

function useTypeEraseLoop(text: string, typeSpeed = 70, eraseSpeed = 35, pause = 1400) {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!text) { setOut(""); return; }
    let i = 0;
    let phase: "type" | "pause" | "erase" = "type";
    let cancelled = false;
    const step = () => {
      if (cancelled) return;
      let delay = typeSpeed;
      if (phase === "type") {
        i++;
        setOut(text.slice(0, i));
        if (i >= text.length) { phase = "pause"; delay = pause; }
      } else if (phase === "pause") {
        phase = "erase"; delay = eraseSpeed;
      } else {
        i--;
        setOut(text.slice(0, i));
        if (i <= 0) { phase = "type"; delay = 500; }
        else delay = eraseSpeed;
      }
      timer = setTimeout(step, delay);
    };
    let timer = setTimeout(step, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [text, typeSpeed, eraseSpeed, pause]);
  return out;
}

function useCountdown(target: string | null | undefined) {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    if (!target) { setMs(null); return; }
    const tick = () => setMs(new Date(target).getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return ms;
}

function fmt(ms: number) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d > 0 ? d + "s " : ""}${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function LockGate({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [settings, setSettings] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("app_settings").select("system_locked, lock_message, lock_until, results_secret_slug").eq("id", 1).single();
    setSettings(data);
    setLoaded(true);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("lock-gate")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "app_settings" }, () => load())
      .subscribe();
    const poll = setInterval(load, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, []);

  const lockUntilMs = settings?.lock_until ? new Date(settings.lock_until).getTime() : null;
  const isLocked = !!(settings?.system_locked && (!lockUntilMs || lockUntilMs > Date.now()));
  const remaining = useCountdown(settings?.lock_until ?? null);

  // Auto-unlock when time passes
  useEffect(() => {
    if (!loaded || !settings?.system_locked || !lockUntilMs) return;
    if (lockUntilMs <= Date.now()) {
      supabase.from("app_settings").update({ system_locked: false }).eq("id", 1).then(() => load());
    }
  }, [loaded, settings, lockUntilMs, remaining]);

  const secretSlug = settings?.results_secret_slug || "siri-alama";
  const isAdminRoute = pathname.startsWith("/admin");
  const isSecretRoute = pathname === `/r/${secretSlug}` || pathname.startsWith(`/r/${secretSlug}/`);
  const animated = useTypeEraseLoop(settings?.lock_message || "");

  if (!loaded) return <>{children}</>;
  if (!isLocked || isAdminRoute || isSecretRoute) return <>{children}</>;

  return (
    <div className="fixed inset-0 z-[100] min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/10 px-4 overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-secondary/30 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      </div>
      <div className="relative max-w-2xl w-full text-center animate-fade-in">
        <div className="mx-auto w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center mb-6 shadow-2xl shadow-primary/30">
          <Lock className="h-10 w-10 text-primary-foreground" />
        </div>
        <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-3">Mfumo Umefungwa</div>
        <h1 className="min-h-[120px] md:min-h-[160px] text-2xl md:text-4xl font-bold text-foreground leading-tight px-2">
          {animated}
          <span className="inline-block w-1 h-7 md:h-10 bg-primary ml-1 align-middle animate-pulse" />
        </h1>
        {settings?.lock_until && remaining !== null && remaining > 0 && (
          <div className="mt-8 inline-flex items-center gap-3 px-6 py-4 rounded-2xl bg-card/70 backdrop-blur border border-primary/20 shadow-xl">
            <Clock className="h-6 w-6 text-primary animate-pulse" />
            <div className="text-left">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Utafunguka baada ya</div>
              <div className="text-2xl md:text-3xl font-mono font-bold text-primary tabular-nums">{fmt(remaining)}</div>
            </div>
          </div>
        )}
        <div className="mt-10 text-xs text-muted-foreground">
          Una link ya siri ya alama? <Link to="/" className="text-primary underline">Ifungue moja kwa moja</Link>
        </div>
      </div>
    </div>
  );
}