import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { QrAttendanceCheckIn } from "@/components/QrAttendanceCheckIn";
import {
  fetchMyCheckIns,
  listOpenSessions,
  type OpenSession,
  type SessionSummary,
} from "@/lib/attendance";
import { getStudentToken } from "@/lib/student-session";
import { useI18n } from "@/lib/i18n";
import {
  CalendarCheck,
  CheckCircle2,
  History,
  Loader2,
  ShieldAlert,
  TrendingUp,
  Radio,
} from "lucide-react";

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
  const { t } = useI18n();
  const [token, setToken] = useState<string | null>(null);
  const [history, setHistory] = useState<SessionSummary[]>([]);
  const [open, setOpen] = useState<OpenSession[]>([]);
  const [loading, setLoading] = useState(true);

  // The token is read on mount and again after each successful check-in, so the
  // history grows without a reload.
  const reload = useCallback(async () => {
    const tok = getStudentToken();
    setToken(tok);
    if (!tok) {
      setHistory([]);
      setOpen([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [hist, sessions] = await Promise.all([fetchMyCheckIns(tok), listOpenSessions(tok)]);
      setHistory(hist);
      setOpen(sessions);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const summary = useMemo(() => {
    const total = history.length;
    const todayKey = new Date().toISOString().slice(0, 10);
    const today = history.filter((h) => (h.startedAt || "").slice(0, 10) === todayKey).length;
    return { total, today };
  }, [history]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/10">
      <SiteHeader />
      <main className="container mx-auto max-w-4xl space-y-5 px-4 py-8">
        <div className="relative overflow-hidden rounded-3xl border-2 border-primary/25 bg-gradient-to-br from-primary/12 via-card to-secondary/15 p-6 text-center shadow-lg">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <CalendarCheck className="h-3 w-3" /> {t("att_title")}
            </div>
            <h1 className="mt-3 bg-gradient-to-r from-primary to-secondary bg-clip-text text-3xl font-black tracking-tight text-transparent md:text-4xl">
              {t("att_one_tap")}
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{t("att_sub")}</p>
          </div>
        </div>

        {!loading && token && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-500/15 to-transparent">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {t("att_present_today")}
                </div>
                <div className="mt-1 text-3xl font-black text-emerald-700 tabular-nums">
                  {summary.today}
                </div>
              </CardContent>
            </Card>
            <Card className="border-primary/25 bg-gradient-to-br from-primary/15 to-transparent">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" /> {t("att_total")}
                </div>
                <div className="mt-1 text-3xl font-black text-primary tabular-nums">
                  {summary.total}
                </div>
              </CardContent>
            </Card>
            <Card className="col-span-2 border-teal-500/30 bg-gradient-to-br from-teal-500/15 to-transparent sm:col-span-1">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <Radio className="h-3.5 w-3.5 text-teal-600" /> {t("att_sessions_open")}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-3xl font-black text-teal-700 tabular-nums">
                    {open.length}
                  </span>
                  {open.length > 0 && (
                    <span className="h-2.5 w-2.5 animate-ping rounded-full bg-teal-500" />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!loading && token && open.length > 0 && (
          <Card className="border-teal-500/40 bg-gradient-to-br from-teal-500/10 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Radio className="h-4 w-4 text-teal-600" /> {t("att_sessions_open")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {open.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-teal-500/25 bg-background/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{s.title}</div>
                    <div className="text-[11px] text-muted-foreground">{s.semina || "—"}</div>
                  </div>
                  <Badge className="shrink-0 bg-teal-600 text-[10px] uppercase">Live</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {!loading && token && open.length === 0 && (
          <div className="rounded-xl border border-dashed border-primary/25 bg-muted/40 p-4 text-center text-sm text-muted-foreground">
            {t("att_no_open")}
          </div>
        )}

        {!loading && !token && (
          <div className="flex gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4">
            <ShieldAlert className="h-5 w-5 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-medium">{t("att_need_account")}</p>
              <p className="mt-1 text-muted-foreground">{t("att_need_account_body")}</p>
              <Button asChild size="sm" className="mt-3">
                <Link to="/account">{t("att_go_account")}</Link>
              </Button>
            </div>
          </div>
        )}

        <QrAttendanceCheckIn onCheckedIn={reload} />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" /> {t("att_history")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("loading")}
              </div>
            ) : history.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">{t("att_no_history")}</p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => (
                  <div
                    key={`${h.id}-${h.startedAt}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-primary/10 bg-muted/50 px-3 py-2.5 transition-colors hover:border-primary/30"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{h.title}</div>
                        {h.semina && (
                          <div className="text-[11px] text-muted-foreground">{h.semina}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[11px] text-muted-foreground">
                        {h.startedAt
                          ? new Date(h.startedAt).toLocaleString("sw-TZ", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            })
                          : "—"}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {t("att_present")}
                      </Badge>
                    </div>
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
