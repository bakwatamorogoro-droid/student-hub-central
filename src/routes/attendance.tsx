import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QrAttendanceCheckIn } from "@/components/QrAttendanceCheckIn";
import { fetchMyCheckIns, type SessionSummary } from "@/lib/attendance";
import { getStudentToken } from "@/lib/student-session";
import { CalendarCheck, History, Loader2, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/attendance")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Mahudhurio — Islamic Studies Test Online" },
      {
        name: "description",
        content: "Hudhuria kipindi kwa kuscan QR, na uone historia ya mahudhurio yako.",
      },
      { property: "og:title", content: "Mahudhurio — Islamic Studies Test Online" },
    ],
  }),
});

function Page() {
  const [token, setToken] = useState<string | null>(null);
  const [history, setHistory] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // The token is read on mount and again after each successful check-in, so the
  // history grows without a reload.
  const reload = useCallback(async () => {
    const t = getStudentToken();
    setToken(t);
    if (!t) {
      setHistory([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setHistory(await fetchMyCheckIns(t));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/10">
      <SiteHeader />
      <main className="container mx-auto max-w-3xl space-y-4 px-4 py-8">
        <div className="relative overflow-hidden rounded-3xl border-2 border-primary/25 bg-gradient-to-br from-primary/12 via-card to-secondary/15 p-6 text-center shadow-lg">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <CalendarCheck className="h-3 w-3" /> Mahudhurio
            </div>
            <h1 className="mt-3 bg-gradient-to-r from-primary to-secondary bg-clip-text text-3xl font-black tracking-tight text-transparent md:text-4xl">
              Hudhuria Kipindi
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              Skani QR ya mwalimu ukiwa darasani, au andika msimbo wa kipindi. Umbali wako
              unathibitishwa kwa GPS.
            </p>
          </div>
        </div>

        {!loading && !token && (
          <div className="flex gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <ShieldAlert className="h-5 w-5 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-medium">Ingia kwenye akaunti yako kwanza.</p>
              <p className="mt-1 text-muted-foreground">
                Nenda kwenye Akaunti uweke Reg Namba na PIN yako, kisha urudi hapa kuhudhuria.
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link to="/account">Nenda kwenye Akaunti</Link>
              </Button>
            </div>
          </div>
        )}

        <QrAttendanceCheckIn onCheckedIn={reload} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" /> Historia ya Mahudhurio
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Inapakia…
              </div>
            ) : history.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">
                Bado hujahudhuria kipindi chochote.
              </p>
            ) : (
              <div className="space-y-1.5">
                {history.map((h) => (
                  <div
                    key={`${h.id}-${h.startedAt}`}
                    className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium">
                      {h.title}
                      {h.semina && (
                        <span className="ml-2 text-xs text-muted-foreground">{h.semina}</span>
                      )}
                    </span>
                    <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                      {h.startedAt
                        ? new Date(h.startedAt).toLocaleString("sw-TZ", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "—"}
                      <Badge variant="secondary" className="ml-2 text-[10px]">
                        Alikuwepo
                      </Badge>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
