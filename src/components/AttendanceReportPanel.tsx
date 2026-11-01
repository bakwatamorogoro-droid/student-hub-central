import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadAttendanceReport } from "@/lib/attendance";
import {
  reportToSheet,
  slugify,
  type AttendanceReport,
  type MatrixRow,
} from "@/lib/attendanceReport";
import { toast } from "@/lib/toast";
import {
  BarChart3,
  Check,
  Download,
  FileSpreadsheet,
  Loader2,
  Minus,
  RefreshCw,
  Users,
} from "lucide-react";

/**
 * The term at a glance: every session down the side, every student across the
 * top, and an Excel of the same grid.
 *
 * A wide table is the right shape here — a teacher checking a claim about one
 * student reads along a row, and one checking turnout for a lecture reads down a
 * column. The filter narrows both axes at once so the two readings stay aligned.
 */
export function AttendanceReportPanel() {
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [kind, setKind] = useState<"all" | "darasa" | "semina">("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await loadAttendanceReport());
    } catch {
      toast.error("Imeshindikana kupakia ripoti");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const r of report?.rows ?? []) if (r.studentGroup) set.add(r.studentGroup);
    return [...set].sort();
  }, [report]);

  const filtered = useMemo(() => {
    if (!report) return null;
    const q = query.trim().toLowerCase();
    const rows = report.rows.filter((r) => {
      if (group !== "all" && r.studentGroup !== group) return false;
      if (!q) return true;
      return r.fullName.toLowerCase().includes(q) || r.regNo.toLowerCase().includes(q);
    });
    const keep = report.sessions
      .map((s, i) => ({ s, i }))
      .filter(({ s }) => kind === "all" || s.kind === kind);

    return {
      rows: rows.map((r) => ({ ...r, cells: keep.map(({ i }) => r.cells[i]) })),
      sessions: keep.map(({ s }) => s),
      sessionTotals: report.sessionTotals.filter((t) => kind === "all" || t.kind === kind),
    };
  }, [report, query, group, kind]);

  const exportExcel = () => {
    if (!report) return;
    const visible: AttendanceReport = {
      ...report,
      sessions: filtered?.sessions ?? report.sessions,
      rows: filtered?.rows ?? report.rows,
    };
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reportToSheet(visible)), "Mahudhurio");

    // A second sheet with one row per session, which is what a department asks
    // for when it wants turnout rather than names.
    const perSession = visible.sessionTotals.map((t) => ({
      Kipindi: t.title,
      Aina: t.kind === "semina" ? "Semina" : "Darasa",
      Waliohudhuria: t.present,
      "Jumla ya Wanafunzi": visible.rows.length,
      Asilimia: `${t.percent}%`,
      "Wastani wa Umbali (m)": t.avgDistanceM ?? "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(perSession), "Kwa Kipindi");

    const name = `mahudhurio_${slugify(new Date().toISOString().slice(0, 10))}.xlsx`;
    XLSX.writeFile(wb, name);
    toast.success(`Imehifadhiwa: ${name}`);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" />
          Takwimu za Mahudhurio — Vipindi Vyote
          {report && (
            <span className="ml-auto text-sm font-normal text-muted-foreground tabular-nums">
              {report.summary.students} wanafunzi • {report.summary.sessions} vipindi
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Kila mwanafunzi kwenye safu yake, kila kipindi kwenye kolamu yake — darasa na semina pamoja.
          Pakua Excel kupata laha hili lenyewe.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Inakusanya ripoti…
          </div>
        ) : !report || report.sessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Hakuna kipindi kilichorekodiwa bado. Anzisha kipindi juu ili takwimu zianze.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Wanafunzi" value={report.summary.students} Icon={Users} />
              <Stat label="Vipindi" value={report.summary.sessions} Icon={BarChart3} />
              <Stat label="Mahudhurio Yote" value={report.summary.checkIns} Icon={Check} />
              <Stat label="Wastani wa Mahudhurio" value={`${report.summary.avgRate}%`} Icon={BarChart3} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Tafuta jina au reg…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-9 w-full sm:w-56"
              />
              <Select value={group} onValueChange={setGroup}>
                <SelectTrigger className="h-9 w-full sm:w-40">
                  <SelectValue placeholder="Darasa lote" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Madarasa yote</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                <SelectTrigger className="h-9 w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Darasa na Semina</SelectItem>
                  <SelectItem value="darasa">Darasa tu</SelectItem>
                  <SelectItem value="semina">Semina tu</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-9" onClick={() => void load()}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Sasisha
              </Button>
              <Button size="sm" className="h-9" onClick={exportExcel}>
                <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Pakua Excel
              </Button>
            </div>

            <SessionTotals totals={filtered?.sessionTotals ?? report.sessionTotals} roster={filtered?.rows.length ?? report.rows.length} />

            <div className="overflow-x-auto rounded-xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 z-10 min-w-[200px] bg-card">Mwanafunzi</TableHead>
                    {(filtered?.sessions ?? report.sessions).map((s) => (
                      <TableHead key={s.id} className="min-w-[110px] text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="max-w-[110px] truncate text-[11px] font-semibold">{s.title}</span>
                          <Badge variant="outline" className="text-[9px]">
                            {s.kind === "semina" ? "Semina" : "Darasa"}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {s.startedAt ? new Date(s.startedAt).toLocaleDateString("sw-TZ") : "—"}
                          </span>
                        </div>
                      </TableHead>
                    ))}
                    <TableHead className="min-w-[90px] text-center">Jumla</TableHead>
                    <TableHead className="min-w-[80px] text-center">Asilimia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(filtered?.rows ?? report.rows).map((r) => (
                    <TableRow key={r.studentId}>
                      <TableCell className="sticky left-0 z-10 bg-card">
                        <div className="font-medium">{r.fullName || "—"}</div>
                        <div className="font-mono text-[11px] text-muted-foreground">{r.regNo}</div>
                      </TableCell>
                      {r.cells.map((c, i) => (
                        <TableCell key={i} className="text-center">
                          {c.present ? (
                            <span
                              className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600"
                              title={[
                                c.at ? new Date(c.at).toLocaleString("sw-TZ") : "",
                                c.method === "qr" ? "QR" : "Msimbo",
                                c.distanceM != null ? `${Math.round(c.distanceM)} m` : "",
                              ]
                                .filter(Boolean)
                                .join(" • ")}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
                              <Minus className="h-3 w-3" />
                            </span>
                          )}
                        </TableCell>
                      ))}
                      <TableCell className="text-center font-semibold tabular-nums">
                        {r.attended}/{r.total}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">
                        <span
                          className={
                            r.percent >= 75
                              ? "font-semibold text-emerald-600"
                              : r.percent >= 50
                                ? "font-semibold text-amber-600"
                                : "font-semibold text-destructive"
                          }
                        >
                          {r.percent}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(filtered?.rows ?? report.rows).length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={(filtered?.sessions ?? report.sessions).length + 3}
                        className="py-8 text-center text-sm text-muted-foreground"
                      >
                        Hakuna mwanafunzi anayelingana na kichujio hiki.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Download className="h-3 w-3" /> Excel ina laha mbili: moja kwa kila mwanafunzi, moja kwa
              kila kipindi. Vichujio unavyoweka vinafuata kwenye faili.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  Icon,
}: {
  label: string;
  value: string | number;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/8 to-transparent p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums text-primary">{value}</div>
    </div>
  );
}

function SessionTotals({
  totals,
  roster,
}: {
  totals: AttendanceReport["sessionTotals"];
  roster: number;
}) {
  if (totals.length === 0) return null;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {totals.map((t) => (
        <div
          key={t.sessionId}
          className="flex items-center justify-between rounded-xl border border-border/70 bg-card/60 px-3 py-2"
        >
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{t.title}</div>
            <div className="text-[11px] text-muted-foreground">
              {t.kind === "semina" ? "Semina" : "Darasa"}
              {t.avgDistanceM != null ? ` • wastani ${t.avgDistanceM} m` : ""}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-bold tabular-nums">
              {t.present}/{roster}
            </div>
            <div
              className={
                t.percent >= 75
                  ? "text-[11px] font-semibold text-emerald-600"
                  : t.percent >= 50
                    ? "text-[11px] font-semibold text-amber-600"
                    : "text-[11px] font-semibold text-destructive"
              }
            >
              {t.percent}%
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export type { MatrixRow };
