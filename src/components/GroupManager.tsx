import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRoster } from "@/lib/useRoster";
import {
  GROUP_NAMES,
  GROUP_SIZE,
  SEMINARS,
  buildSeminarReports,
  genderLabel,
  searchMembers,
  type GroupCell,
  type RosterEntry,
} from "@/lib/groupAssignment";
import {
  assignStudentGroup,
  removeMemberFromGroup,
  reassignSeminar,
  saveGroupReport,
} from "@/lib/groupRoster";
import { exportGroups, exportGroupsCsv, type ExportKind } from "@/lib/groupExports";
import { toast } from "@/lib/toast";
import {
  Loader2,
  Users,
  Mars,
  Venus,
  Download,
  FileText,
  FileSpreadsheet,
  FileType,
  CheckCircle2,
  Search,
  UserPlus,
  UserMinus,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";

/** A seminar tab with its completion bar and the two gender columns. */
function SeminarPanel({
  semina,
  reports,
  onChanged,
}: {
  semina: string;
  reports: ReturnType<typeof buildSeminarReports>;
  onChanged: () => void;
}) {
  const report = reports.find((r) => r.semina === semina);
  const [addTo, setAddTo] = useState<GroupCell | null>(null);
  const [addQuery, setAddQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const roster = useRoster().roster;

  const candidates = useMemo(
    () => (addQuery.trim() ? searchMembers(roster, addQuery) : []),
    [roster, addQuery],
  );

  if (!report)
    return <p className="text-sm text-muted-foreground">Hakuna wanafunzi kwenye semina hii.</p>;

  const pct = report.totalGroups
    ? Math.round((report.completeGroups / report.totalGroups) * 100)
    : 0;

  const addMember = async (student: RosterEntry) => {
    setBusy(true);
    // Clearing the group makes the planner treat them as a fresh arrival and
    // seat them in the next open slot for their gender.
    const err = await removeMemberFromGroup(student.id);
    if (err) {
      setBusy(false);
      return toast.error(err.message);
    }
    const outcome = await assignStudentGroup(student.id);
    setBusy(false);
    setAddQuery("");
    setAddTo(null);
    toast.success(
      `Ameongezwa: ${student.full_name || student.reg_no} → ${
        outcome.me.student_group ?? "haijapata nafasi"
      }`,
    );
    onChanged();
  };

  const removeMember = async (student: { id: string; full_name: string; reg_no: string }) => {
    setBusy(true);
    const err = await removeMemberFromGroup(student.id);
    setBusy(false);
    if (err) return toast.error(err.message);
    toast.success(`Ametolewa kwenye group: ${student.full_name || student.reg_no}`);
    onChanged();
  };

  const rebalance = async () => {
    setBusy(true);
    const outcome = await reassignSeminar(semina);
    setBusy(false);
    toast.success(`Wanafunzi ${outcome.updated} wamepangwa upya kwenye ${semina}.`);
    onChanged();
  };

  const columns: { gender: "male" | "female"; cells: GroupCell[]; icon: typeof Mars }[] = [
    { gender: "male", cells: report.male, icon: Mars },
    { gender: "female", cells: report.female, icon: Venus },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-bold">
              Magroup yaliyokamilika: {report.completeGroups}/{report.totalGroups}
            </span>
            <span className="text-muted-foreground">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={rebalance}
          disabled={busy}
          className="font-bold"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Panga upya semina hii
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-blue-500/15 px-2.5 py-1 font-bold text-blue-700 dark:text-blue-300">
          <Mars className="mr-1 inline h-3 w-3" />
          Wanaume: {report.maleCount}
        </span>
        <span className="rounded-full bg-pink-500/15 px-2.5 py-1 font-bold text-pink-700 dark:text-pink-300">
          <Venus className="mr-1 inline h-3 w-3" />
          Wanawake: {report.femaleCount}
        </span>
        <span className="rounded-full bg-muted px-2.5 py-1 font-bold">
          Jumla: {report.totalStudents}
        </span>
      </div>

      {report.unknownGender.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <span>
            Wanafunzi {report.unknownGender.length} hawana jinsia kwenye mfumo, hivyo hawajawekwa
            kwenye group:{" "}
            <b>{report.unknownGender.map((m) => `${m.full_name} (${m.reg_no})`).join(", ")}</b>
          </span>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {columns.map(({ gender, cells, icon: Icon }) => (
          <div key={gender} className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide">
              <Icon className="h-4 w-4" /> {genderLabel(gender)}
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {cells.map((cell) => (
                <Card
                  key={`${cell.gender}-${cell.group}`}
                  className={`border-2 ${
                    cell.complete ? "border-emerald-500/40 bg-emerald-500/5" : "border-border"
                  }`}
                >
                  <CardContent className="space-y-2 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm">{cell.group}</span>
                      {cell.complete ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> COMPLETE
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">
                          {cell.count}/{cell.size}
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full transition-all ${
                          cell.complete ? "bg-emerald-500" : "bg-primary"
                        }`}
                        style={{ width: `${(cell.count / cell.size) * 100}%` }}
                      />
                    </div>
                    <ul className="space-y-1 text-xs">
                      {cell.members.map((m) => (
                        <li key={m.id} className="flex items-center justify-between gap-1">
                          <span className="truncate">{m.full_name || "—"}</span>
                          <button
                            type="button"
                            title="Toa kwenye group"
                            onClick={() => removeMember(m)}
                            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          >
                            <UserMinus className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                      {cell.members.length === 0 && (
                        <li className="text-muted-foreground">Hakuna mwanachama</li>
                      )}
                    </ul>
                    {!cell.complete && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full font-bold"
                        onClick={() => setAddTo(cell)}
                      >
                        <UserPlus className="h-3 w-3" /> Ongeza mwanachama
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>

      {addTo && (
        <Card className="border-2 border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <UserPlus className="h-4 w-4 text-primary" /> Ongeza mwanachama — {addTo.group} (
              {genderLabel(addTo.gender)})
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Tafuta jina au Reg Namba. Mwanafunzi aliyeondoka au aliyemaliza anaweza kurudishwa
              hapa.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
                placeholder="Jina au Reg Namba..."
              />
              <Button
                variant="ghost"
                onClick={() => {
                  setAddTo(null);
                  setAddQuery("");
                }}
              >
                Funga
              </Button>
            </div>
            {candidates.length > 0 && (
              <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-xl border border-border">
                {candidates.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{c.full_name || "—"}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {c.reg_no} · {c.semina} · {c.student_group || "hana group"}
                      </span>
                    </span>
                    <Button size="sm" onClick={() => addMember(c)} disabled={busy}>
                      Ongeza
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {addQuery.trim() && candidates.length === 0 && (
              <p className="text-sm text-muted-foreground">Hakuna mwanafunzi anayelingana.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function GroupManager() {
  const { roster, loading, error, reload } = useRoster();
  const [tab, setTab] = useState(SEMINARS[0]);
  const [exporting, setExporting] = useState<ExportKind | null>(null);

  const reports = useMemo(() => buildSeminarReports(roster), [roster]);
  const grand = useMemo(
    () => ({
      groups: reports.reduce((n, r) => n + r.totalGroups, 0),
      complete: reports.reduce((n, r) => n + r.completeGroups, 0),
      students: reports.reduce((n, r) => n + r.totalStudents, 0),
      male: reports.reduce((n, r) => n + r.maleCount, 0),
      female: reports.reduce((n, r) => n + r.femaleCount, 0),
    }),
    [reports],
  );

  const doExport = async (kind: ExportKind) => {
    setExporting(kind);
    try {
      await exportGroups(reports, kind);
      toast.success(`Faili la ${kind.toUpperCase()} limetengenezwa.`);
    } catch (e) {
      toast.error(`Imeshindikana kutengeneza faili: ${(e as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Inapakia wanafunzi...
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-4 text-sm">
          Imeshindikana kupakia wanafunzi: {error.message}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/25 bg-gradient-to-br from-primary/10 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-primary" /> Magroup na Semina
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Semina 15 · Group 11 kwa kila jinsia · Wanafunzi {GROUP_SIZE} kwa group. Group linakuwa
            COMPLETE likifika {GROUP_SIZE}.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 font-bold text-emerald-700 dark:text-emerald-300">
              Yaliyokamilika: {grand.complete}/{grand.groups}
            </span>
            <span className="rounded-full bg-muted px-3 py-1 font-bold">
              Wanafunzi: {grand.students}
            </span>
            <span className="rounded-full bg-blue-500/15 px-3 py-1 font-bold text-blue-700 dark:text-blue-300">
              Wanaume: {grand.male}
            </span>
            <span className="rounded-full bg-pink-500/15 px-3 py-1 font-bold text-pink-700 dark:text-pink-300">
              Wanawake: {grand.female}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => doExport("xlsx")}
              disabled={exporting !== null}
              className="font-bold"
            >
              {exporting === "xlsx" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => doExport("docx")}
              disabled={exporting !== null}
              className="font-bold"
            >
              {exporting === "docx" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileType className="h-4 w-4" />
              )}
              Word
            </Button>
            <Button
              variant="outline"
              onClick={() => doExport("pdf")}
              disabled={exporting !== null}
              className="font-bold"
            >
              {exporting === "pdf" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              PDF
            </Button>
            <Button variant="ghost" onClick={() => exportGroupsCsv(reports)} className="font-bold">
              <Download className="h-4 w-4" /> CSV
            </Button>
            <Button variant="ghost" onClick={reload} className="font-bold">
              <RefreshCw className="h-4 w-4" /> Onyesha upya
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          {SEMINARS.map((s) => {
            const r = reports.find((x) => x.semina === s);
            const done = r && r.totalGroups > 0 && r.completeGroups === r.totalGroups;
            return (
              <TabsTrigger key={s} value={s} className="gap-1 text-xs">
                {s}
                {r && r.totalStudents > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      done ? "bg-emerald-500/25 text-emerald-700 dark:text-emerald-300" : "bg-muted"
                    }`}
                  >
                    {r.completeGroups}/{r.totalGroups}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {SEMINARS.map((s) => (
          <TabsContent key={s} value={s} className="mt-3">
            <SeminarPanel semina={s} reports={reports} onChanged={reload} />
          </TabsContent>
        ))}
      </Tabs>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Search className="h-4 w-4" /> Tafuta group la mwanafunzi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StudentGroupLookup roster={roster} />
        </CardContent>
      </Card>
    </div>
  );
}

/** Admin-side version of the student's "Group lako" card. */
function StudentGroupLookup({ roster }: { roster: RosterEntry[] }) {
  const [query, setQuery] = useState("");
  const reports = useMemo(() => buildSeminarReports(roster), [roster]);
  const results = useMemo(
    () => (query.trim() ? searchMembers(roster, query, 10) : []),
    [roster, query],
  );

  const place = (student: RosterEntry) => {
    for (const r of reports) {
      for (const cell of [...r.male, ...r.female]) {
        if (cell.members.some((m) => m.id === student.id)) {
          return { semina: r.semina, cell };
        }
      }
    }
    return null;
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Reg Namba au jina..."
        />
      </div>
      {results.map((s) => {
        const found = place(s);
        return (
          <div
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"
          >
            <div className="min-w-0">
              <div className="truncate font-semibold">{s.full_name || "—"}</div>
              <div className="font-mono text-xs text-muted-foreground">{s.reg_no}</div>
            </div>
            {found ? (
              <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
                {found.semina} · {genderLabel(found.cell.gender).toUpperCase()} · {found.cell.group}
              </span>
            ) : (
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
                Hana group
              </span>
            )}
          </div>
        );
      })}
      {query.trim() && results.length === 0 && (
        <p className="text-sm text-muted-foreground">Hakuna mwanafunzi anayelingana.</p>
      )}
    </div>
  );
}

export { GROUP_NAMES, SEMINARS };
