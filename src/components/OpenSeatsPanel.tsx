import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useRoster } from "@/lib/useRoster";
import { openSeatsAsReports, openSeatsForCohort, type OpenSeats } from "@/lib/groupAssignment";
import { exportGroups, exportGroupsCsv, type ExportKind } from "@/lib/groupExports";
import { toast } from "@/lib/toast";
import {
  Loader2,
  LayoutGrid,
  FileSpreadsheet,
  FileText,
  FileDown,
  ChevronDown,
} from "lucide-react";

/**
 * The seats a student may still take, shown *before* they enter a Reg Namba.
 *
 * The owner asked for the list of open groups and seminars to be visible up front, for the
 * cohort that is registering now — academic year 2026/2027, study year 2 — with a download,
 * and for a group that has filled up to disappear on its own. `openSeatsForCohort` measures
 * fullness against the whole roster, so a full group is simply absent: nothing has to be
 * closed by hand and the list cannot go stale.
 *
 * Read-only. The pickers on step 2 remain the place a student actually chooses a seat.
 */
export function OpenSeatsPanel({
  academicYear,
  studyYear,
}: {
  academicYear: string;
  studyYear: number;
}) {
  const { roster, loading, error, reload } = useRoster();
  const [open, setOpen] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const seats = useMemo(
    () => openSeatsForCohort(roster, { academicYear, studyYear }),
    [roster, academicYear, studyYear],
  );

  const totals = useMemo(() => {
    let groups = 0;
    let free = 0;
    for (const s of seats) {
      for (const c of [...s.male, ...s.female]) {
        groups += 1;
        free += c.free;
      }
    }
    return { seminars: seats.length, groups, free };
  }, [seats]);

  const download = async (kind: ExportKind, label: string) => {
    const reports = openSeatsAsReports(seats);
    if (!reports.length) {
      toast.info("Hakuna nafasi iliyo wazi kwa sasa.");
      return;
    }
    setExporting(kind);
    try {
      await exportGroups(reports, kind);
      toast.success(`${label} imepakuliwa.`);
    } catch (e) {
      toast.error((e as Error)?.message || "Imeshindikana kupakua faili.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <Card className="overflow-hidden border-primary/25 shadow-sm">
      <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                  <LayoutGrid className="h-4 w-4 text-primary" />
                </span>
                Nafasi Zilizo Wazi
              </CardTitle>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Magroup na semina zilizo wazi kwa mwaka wa masomo{" "}
                <span className="font-semibold text-foreground">{academicYear}</span>, mwaka wa{" "}
                <span className="font-semibold text-foreground">{studyYear}</span>. Group
                linapojazana linaondolewa hapa lenyewe.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1 font-bold"
              onClick={() => setOpen((v) => !v)}
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
              {open ? "Funga" : "Fungua"}
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1 font-bold">
              {totals.seminars} semina
            </Badge>
            <Badge variant="secondary" className="gap-1 font-bold">
              {totals.groups} magroup wazi
            </Badge>
            <Badge className="gap-1 bg-emerald-600 font-bold text-white hover:bg-emerald-600">
              {totals.free} nafasi
            </Badge>
          </div>
        </CardHeader>

        {open && (
          <CardContent className="space-y-3">
            {loading && roster.length === 0 ? (
              <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Inahesabu nafasi zilizo wazi...
              </p>
            ) : error ? (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
                <span className="flex-1">Imeshindikana kupata orodha ya nafasi.</span>
                <Button size="sm" variant="outline" className="font-bold" onClick={reload}>
                  Jaribu tena
                </Button>
              </div>
            ) : seats.length === 0 ? (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                Hakuna nafasi iliyo wazi kwa mwaka wa {studyYear} ({academicYear}) kwa sasa. Mwone
                admin au CR.
              </p>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {seats.map((s) => (
                    <SeminarSeats key={s.semina} seats={s} />
                  ))}
                </div>

                <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                  <Button
                    size="sm"
                    className="gap-1 font-bold"
                    disabled={!!exporting}
                    onClick={() => void download("pdf", "PDF")}
                  >
                    {exporting === "pdf" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                    Pakua PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 font-bold"
                    disabled={!!exporting}
                    onClick={() => void download("docx", "Word")}
                  >
                    {exporting === "docx" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileDown className="h-3.5 w-3.5" />
                    )}
                    Pakua Word
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 font-bold"
                    disabled={!!exporting}
                    onClick={() => void download("xlsx", "Excel")}
                  >
                    {exporting === "xlsx" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                    )}
                    Pakua Excel
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 font-bold"
                    disabled={!!exporting || seats.length === 0}
                    onClick={() => {
                      exportGroupsCsv(openSeatsAsReports(seats));
                      toast.success("CSV imepakuliwa.");
                    }}
                  >
                    CSV
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        )}
      </div>
    </Card>
  );
}

/** One seminar: its open groups, split by the gender each group is pure for. */
function SeminarSeats({ seats }: { seats: OpenSeats }) {
  const sides = [
    { key: "male" as const, label: "Wanaume", cells: seats.male },
    { key: "female" as const, label: "Wanawake", cells: seats.female },
  ].filter((s) => s.cells.length > 0);

  return (
    <div className="rounded-xl border border-primary/15 bg-background/60 p-2.5">
      <div className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-primary">
        {seats.semina}
      </div>
      <div className="space-y-1.5">
        {sides.map((side) => (
          <div key={side.key} className="flex flex-wrap items-center gap-1">
            <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {side.label}
            </span>
            {side.cells.map((c) => (
              <span
                key={c.group}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] font-semibold"
                title={`${c.count}/${c.size} wamejaa · nafasi ${c.free}`}
              >
                {c.group.replace(/^GROUP\s*/i, "G")}
                <span className="font-mono text-[10px] text-emerald-600">{c.free}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
