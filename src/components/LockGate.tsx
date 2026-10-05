import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
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
    <div className="fixed inset-0 z-[100] min-h-screen overflow-y-auto bg-gradient-to-br from-background via-background to-primary/10 px-4 py-10 flex items-center justify-center">
      {/* Animated background glows */}
      <div className="absolute inset-0 opacity-40 pointer-events-none">
        <div className="absolute -top-24 -left-24 w-[28rem] h-[28rem] bg-primary/25 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-24 -right-24 w-[28rem] h-[28rem] bg-secondary/30 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[36rem] h-[36rem] bg-primary/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "2s" }} />
      </div>

      <div className="relative max-w-3xl w-full text-center animate-fade-in">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-destructive/10 border border-destructive/30 text-destructive text-xs font-bold uppercase tracking-[0.25em] mb-6">
          <ShieldAlert className="h-3.5 w-3.5" /> Mfumo Umefungwa Kwa Muda
        </div>

        {/* Lock icon */}
        <div className="relative mx-auto w-24 h-24 mb-6">
          <div className="absolute inset-0 rounded-[2rem] bg-primary/30 blur-xl animate-pulse" />
          <div className="relative w-24 h-24 rounded-[2rem] bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-2xl shadow-primary/40 rotate-3 hover:rotate-0 transition-transform duration-500">
            <Lock className="h-12 w-12 text-primary-foreground" />
          </div>
        </div>

        {/* Animated admin message */}
        <h1 className="min-h-[110px] md:min-h-[150px] text-2xl md:text-4xl font-extrabold text-foreground leading-tight px-2 tracking-tight">
          {animated}
          <span className="inline-block w-1 h-7 md:h-10 bg-primary ml-1 align-middle animate-pulse" />
        </h1>

        {/* Countdown */}
        {settings?.lock_until && remaining !== null && remaining > 0 && (
          <div className="mt-6 inline-flex items-center gap-4 px-7 py-5 rounded-3xl bg-card/80 backdrop-blur border border-primary/25 shadow-2xl shadow-primary/10">
            <div className="w-12 h-12 rounded-2xl bg-primary/15 flex items-center justify-center">
              <Clock className="h-6 w-6 text-primary animate-pulse" />
            </div>
            <div className="text-left">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Mfumo utafunguka baada ya</div>
              <div className="text-3xl md:text-4xl font-mono font-extrabold text-primary tabular-nums">{fmt(remaining)}</div>
            </div>
          </div>
        )}

        {/* Explanations */}
        <div className="mt-10 grid sm:grid-cols-3 gap-3 text-left">
          <div className="rounded-2xl border bg-card/70 backdrop-blur p-4 space-y-2 hover:border-primary/40 transition-colors">
            <CalendarClock className="h-5 w-5 text-primary" />
            <div className="font-bold text-sm">Kwa nini imefungwa?</div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Msimamizi amefunga mfumo kwa muda — huenda ni matengenezo, maandalizi ya mtihani, au kusasisha taarifa.
            </p>
          </div>
          <div className="rounded-2xl border bg-card/70 backdrop-blur p-4 space-y-2 hover:border-primary/40 transition-colors">
            <BellRing className="h-5 w-5 text-primary" />
            <div className="font-bold text-sm">Nifanye nini?</div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Subiri mfumo ufunguke — ukurasa huu utajisasisha mwenyewe mara tu ufunguzi utakapofanyika. Huhitaji kufanya chochote.
            </p>
          </div>
          <div className="rounded-2xl border bg-card/70 backdrop-blur p-4 space-y-2 hover:border-primary/40 transition-colors">
            <KeyRound className="h-5 w-5 text-primary" />
            <div className="font-bold text-sm">Una link ya siri?</div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Ikiwa umepewa link maalum ya kuona alama, tumia hiyo — haitathiriwi na ufungo huu.
            </p>
          </div>
        </div>

        <div className="mt-8 text-xs text-muted-foreground">
          Maswali? Wasiliana na msimamizi wa mfumo wako.
        </div>
      </div>
    </div>
  );
}