import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  Users,
  CheckCircle2,
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
 * A seminar is picked from a dropdown rather than every seminar being printed at once, so
 * the card stays short and a student reads one seminar at a time. Only the fifteen current
 * seminars are offered; the legacy `SEMINA 16` is filtered out by `openSeatsForCohort`.
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
  const [semina, setSemina] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);

  const seats = useMemo(
    () => openSeatsForCohort(roster, { academicYear, studyYear }),
    [roster, academicYear, studyYear],
  );

  // Default to the first seminar that still has a seat, so the dropdown opens on something
  // useful rather than an empty placeholder.
  useEffect(() => {
    if (seats.length === 0) return;
    setSemina((prev) => (prev && seats.some((s) => s.semina === prev) ? prev : seats[0].semina));
  }, [seats]);

  const chosen = useMemo(() => seats.find((s) => s.semina === semina) ?? null, [seats, semina]);

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
                Chagua semina kuona magroup yaliyo wazi kwa mwaka wa masomo{" "}
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
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Chagua semina
                  </Label>
                  <Select value={semina} onValueChange={setSemina}>
                    <SelectTrigger className="font-semibold">
                      <SelectValue placeholder="Chagua semina" />
                    </SelectTrigger>
                    <SelectContent>
                      {seats.map((s) => {
                        const free = [...s.male, ...s.female].reduce((n, c) => n + c.free, 0);
                        const groups = s.male.length + s.female.length;
                        return (
                          <SelectItem key={s.semina} value={s.semina}>
                            <span className="flex items-center gap-2">
                              {s.semina}
                              <span className="text-[10px] font-bold uppercase text-muted-foreground">
                                {groups} magroup · nafasi {free}
                              </span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {chosen && <SeminarSeats seats={chosen} />}

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

/** One gender's side of a seminar: the open groups and the seats each still holds. */
function GenderSide({ label, cells }: { label: string; cells: OpenSeats["male"] }) {
  if (cells.length === 0) return null;
  return (
    <div className="rounded-xl border border-primary/15 bg-background/60 p-2.5">
      <div className="mb-2 flex items-center gap-1.5">
        <Users className="h-3 w-3 text-primary" />
        <span className="text-[10px] font-extrabold uppercase tracking-wide text-primary">
          {label}
        </span>
        <span className="text-[10px] font-semibold text-muted-foreground">
          {cells.length} magroup
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {cells.map((c) => (
          <div
            key={c.group}
            className="flex items-center justify-between gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1"
            title={`${c.count}/${c.size} wamejaa · nafasi ${c.free}`}
          >
            <span className="text-[11px] font-bold">{c.group.replace(/^GROUP\s*/i, "G")}</span>
            <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 px-1 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-2.5 w-2.5" />
              {c.free}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One seminar: its open groups, split by the gender each group is pure for. */
function SeminarSeats({ seats }: { seats: OpenSeats }) {
  const free = [...seats.male, ...seats.female].reduce((n, c) => n + c.free, 0);
  return (
    <div className="space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-extrabold uppercase tracking-wide text-primary">
          {seats.semina}
        </span>
        <Badge className="gap-1 bg-emerald-600 font-bold text-white hover:bg-emerald-600">
          {free} nafasi wazi
        </Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <GenderSide label="Wanaume" cells={seats.male} />
        <GenderSide label="Wanawake" cells={seats.female} />
      </div>
    </div>
  );
}
