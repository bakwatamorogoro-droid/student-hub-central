import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AttendanceQrPoster } from "@/components/AttendanceQrPoster";
import { listOpenSessions, type OpenSession } from "@/lib/attendance";
import { crPosterDecision } from "@/lib/crPoster";
import { toast } from "@/lib/toast";
import { Loader2, Printer, QrCode, RefreshCw, Lock } from "lucide-react";

type AllowedSession = OpenSession & { joinCode: string };

/**
 * The CR's print station for the attendance poster.
 *
 * The owner opens a session to the CR from the live panel; this reads the same
 * flag and offers the poster for exactly those sessions. It never decides for
 * itself that a session is printable — `crPosterDecision` is the one rule, so the
 * switch and this screen cannot disagree.
 *
 * The rotating on-screen token is deliberately absent. A CR is not in the room
 * running the session; the only thing they can usefully do with attendance is
 * carry a printed poster to the wall before students arrive, which is what a
 * stable join code — not a 25-second token — is for.
 */
export function CrAttendanceQr() {
  const [sessions, setSessions] = useState<AllowedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [chosen, setChosen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const open = await listOpenSessions();
      // Only sessions the owner has opened to the CR, and only ones with a code.
      const allowed = open.filter(
        (s): s is AllowedSession => crPosterDecision(s).ok && !!s.joinCode,
      );
      setSessions(allowed);
      setChosen((prev) => (prev && allowed.some((s) => s.id === prev) ? prev : null));
    } catch {
      toast.error("Imeshindikana kupata vipindi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = sessions.find((s) => s.id === chosen) ?? null;

  return (
    <Card className="border-primary/25 bg-gradient-to-br from-primary/10 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <QrCode className="h-4 w-4 text-primary" /> QR ya Mahudhurio (Kuchapisha)
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            className="ml-auto font-bold"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Onyesha upya
          </Button>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Vipindi ambavyo mwalimu ameruhusu CR kuchapisha QR yake. Pakua PNG au chapisha, kisha
          ipachike ukutani kabla wanafunzi wafike.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading && sessions.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Inapakia vipindi...
          </p>
        )}

        {!loading && sessions.length === 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-border p-3">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Hakuna kipindi ambacho mwalimu amekuruhusu kuchapisha QR yake kwa sasa. Mwone mwalimu
              aruhusu kwenye kipindi kinachoendelea.
            </p>
          </div>
        )}

        {sessions.length > 0 && (
          <div className="space-y-2">
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setChosen(chosen === s.id ? null : s.id)}
                className={`flex w-full flex-wrap items-center gap-2 rounded-xl border p-3 text-left transition-colors ${
                  chosen === s.id ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{s.title}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {s.semina || "Semina yoyote"} · {s.studentGroup || "Wote"} · umbali {s.radiusM}m
                  </span>
                </span>
                <Badge variant="secondary" className="font-mono text-[11px]">
                  {s.joinCode}
                </Badge>
              </button>
            ))}
          </div>
        )}

        {active && (
          <div className="space-y-2">
            <AttendanceQrPoster
              session={{
                title: active.title,
                semina: active.semina,
                studentGroup: active.studentGroup,
                radiusM: active.radiusM,
              }}
              joinCode={active.joinCode}
            />
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Printer className="h-3 w-3" /> Chapisha ukurasa mmoja wa A4 na ubandike mlangoni au
              ukutani wa darasa.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
