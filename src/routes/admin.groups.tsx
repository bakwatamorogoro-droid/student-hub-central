import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GroupManager } from "@/components/GroupManager";
import { SeminarReportPanel } from "@/components/SeminarReportPanel";
import { loadGroupReports, type GroupReport } from "@/lib/groupRoster";
import { genderLabel } from "@/lib/groupAssignment";
import { ClipboardList, Loader2, RefreshCw, Users } from "lucide-react";

export const Route = createFileRoute("/admin/groups")({ component: Page });

function Page() {
  const [reports, setReports] = useState<GroupReport[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setReports(await loadGroupReports());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="container mx-auto max-w-6xl space-y-4 p-4">
      <Tabs defaultValue="groups">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="groups" className="gap-1 font-bold">
            <Users className="h-4 w-4" /> Magroup na Semina
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1 font-bold">
            <ClipboardList className="h-4 w-4" /> Ripoti za CR
          </TabsTrigger>
        </TabsList>

        <TabsContent value="groups" className="mt-3">
          <GroupManager />
        </TabsContent>

        <TabsContent value="reports" className="mt-3 space-y-4">
          <SeminarReportPanel reports={reports} onSaved={load} />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <ClipboardList className="h-4 w-4" /> Ripoti zilizotumwa ({reports.length})
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={load} className="font-bold">
                <RefreshCw className="h-3 w-3" /> Onyesha upya
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {loading && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Inapakia ripoti...
                </p>
              )}
              {!loading && reports.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Hakuna ripoti bado. Ripoti za CR zitaonekana hapa.
                </p>
              )}
              {reports.map((r) => (
                <div key={r.id} className="rounded-xl border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
                      {r.semina} · {genderLabel(r.gender as never).toUpperCase()} ·{" "}
                      {r.student_group}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("sw-TZ")}
                      {r.reported_by ? ` · CR: ${r.reported_by}` : ""}
                    </span>
                  </div>
                  <div className="mt-2">
                    {r.missing.length === 0 ? (
                      <p className="text-emerald-700 dark:text-emerald-300">
                        Wote wapo — hakuna aliyekosekana.
                      </p>
                    ) : (
                      <>
                        <p className="font-bold text-destructive">
                          Hawapo / wamemaliza: {r.missing.length}
                        </p>
                        <ul className="mt-1 list-inside list-disc text-xs">
                          {r.missing.map((m) => (
                            <li key={m.id}>
                              {m.full_name || "—"}{" "}
                              <span className="font-mono text-muted-foreground">{m.reg_no}</span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {r.note && (
                      <p className="mt-1 text-xs text-muted-foreground">Maelezo: {r.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
