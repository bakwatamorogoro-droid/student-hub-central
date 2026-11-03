import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { confirmAction } from "@/lib/alerts";
import { mergeAll, mergeGroup, scanDuplicates, type MergeReport } from "@/lib/dedupeStudentsApi";
import {
  dedupeTotals,
  describeGroup,
  type DedupeGroup,
  type StudentRow,
} from "@/lib/dedupeStudents";
import { displayRegNo } from "@/lib/regNo";
import { AlertTriangle, CheckCircle2, Loader2, Merge, RefreshCw, Users } from "lucide-react";

export const Route = createFileRoute("/admin/duplicates")({ component: Page });

/**
 * The duplicate-registration cleanup screen.
 *
 * The roster holds the same person under more than one spelling of their Reg
 * Namba, and the UNIQUE constraint could not see it. This screen shows every
 * such group, says which row will survive and why, and merges them only after
 * the admin has read the plan and confirmed.
 *
 * Merging is deliberate rather than automatic: 135 of the 185 groups have real
 * rows on more than one spelling, so the screen shows what would move and what
 * would collide before anything is deleted.
 */
function Page() {
  const [groups, setGroups] = useState<DedupeGroup<StudentRow>[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [reports, setReports] = useState<MergeReport[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGroups(await scanDuplicates());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Imeshindikana kusoma wanafunzi.");
      setGroups([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => dedupeTotals(groups ?? []), [groups]);
  const byCanon = useMemo(() => {
    const map = new Map<string, MergeReport>();
    for (const r of reports) map.set(r.canonical, r);
    return map;
  }, [reports]);

  const mergeOne = async (group: DedupeGroup<StudentRow>) => {
    const ok = await confirmAction(
      `Unganisha usajili wa marudio wa ${displayRegNo(group.keeper.reg_no)}?`,
      `Safu ${group.removals.length} zitaondolewa. Kazi zote, mahudhurio na majibu zitahamishwa kwa usajili mmoja kwanza.`,
      "Unganisha",
    );
    if (!ok) return;
    setBusy(true);
    const report = await mergeGroup(group);
    setBusy(false);
    setReports((prev) => [...prev, report]);
    if (report.error) toast.error(`Imeshindikana: ${report.error}`);
    else toast.success(`Imeunganishwa. Zilihamishwa: ${report.moved}.`);
    await load();
  };

  const mergeEverything = async () => {
    if (!groups || groups.length === 0) return;
    const ok = await confirmAction(
      `Unganisha makundi ${totals.groups} yote?`,
      `Usajili ${totals.removals} wa marudio utaondolewa baada ya data yake kuhamishwa. Hatua hii haiwezi kutenduliwa.`,
      "Unganisha yote",
    );
    if (!ok) return;
    setBusy(true);
    setProgress({ done: 0, total: groups.length });
    const all = await mergeAll(groups, (done, total) => setProgress({ done, total }));
    setReports((prev) => [...prev, ...all]);
    setBusy(false);
    const failed = all.filter((r) => r.error);
    if (failed.length) toast.error(`Makundi ${failed.length} hayakuunganishwa.`);
    else toast.success(`Makundi ${all.length} yote yameunganishwa.`);
    await load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Merge className="h-4 w-4" /> Usajili wa marudio
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Namba moja ya usajili iliyoandikwa kwa namna tofauti. Kila kundi huachwa na usajili
              mmoja, na data ya wengine huhamishwa kabla ya kuondolewa.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1" onClick={load} disabled={busy}>
              <RefreshCw className="h-3.5 w-3.5" /> Angalia tena
            </Button>
            <Button
              size="sm"
              className="gap-1 font-bold"
              onClick={mergeEverything}
              disabled={busy || loading || totals.groups === 0}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Merge className="h-3.5 w-3.5" />
              )}
              Unganisha yote ({totals.removals})
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {busy && progress.total > 0 && (
            <p className="text-xs text-muted-foreground">
              Inaendelea: {progress.done} / {progress.total}
            </p>
          )}
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Inatafuta marudio...
            </p>
          ) : totals.groups === 0 ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> Hakuna usajili wa marudio. Roster ni safi.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="outline" className="gap-1">
                <Users className="h-3 w-3" /> Makundi: {totals.groups}
              </Badge>
              <Badge className="gap-1 bg-amber-600 text-white">
                <AlertTriangle className="h-3 w-3" /> Safu za kuondolewa: {totals.removals}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {(groups ?? []).map((group) => {
        const report = byCanon.get(group.canonical);
        return (
          <Card key={group.canonical}>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-bold">{describeGroup(group)}</CardTitle>
              <div className="flex items-center gap-2">
                {report?.removed && (
                  <Badge className="gap-1 bg-emerald-600 text-white">
                    <CheckCircle2 className="h-3 w-3" /> Imeunganishwa
                  </Badge>
                )}
                {report?.error && (
                  <Badge variant="outline" className="gap-1 border-rose-500/50 text-rose-700">
                    <AlertTriangle className="h-3 w-3" /> Imeshindikana
                  </Badge>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 font-bold"
                  disabled={busy}
                  onClick={() => mergeOne(group)}
                >
                  <Merge className="h-3.5 w-3.5" /> Unganisha
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              {group.members.map((m) => (
                <div
                  key={m.row.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                    m.keep ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-muted/20"
                  }`}
                >
                  <span className="flex flex-col">
                    <span className="font-semibold">
                      {displayRegNo(m.row.reg_no)} · {m.row.full_name || "bila jina"}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {m.row.semina || "—"} · {m.row.student_group || "—"} ·{" "}
                      {m.row.created_at || "—"}
                    </span>
                  </span>
                  <Badge variant={m.keep ? "default" : "outline"} className="shrink-0 text-[11px]">
                    {m.keep ? `HUBaki — ${m.reason}` : m.reason}
                  </Badge>
                </div>
              ))}
              {report && (
                <p className="pt-1 text-[11px] text-muted-foreground">
                  Zilihamishwa: {report.moved} · Zilizoachwa kwa sababu zilikuwepo tayari:{" "}
                  {report.collisions}
                  {report.error ? ` · Kosa: ${report.error}` : ""}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
