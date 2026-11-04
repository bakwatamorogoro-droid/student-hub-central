import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useRoster } from "@/lib/useRoster";
import {
  buildSeminarReports,
  findMyGroup,
  genderLabel,
  isCurrentSeminar,
  representativesFor,
  type GroupCell,
  type GroupMember,
  type SeminarReport,
} from "@/lib/groupAssignment";
import { Loader2, Mars, Users, Venus, Star, LayoutGrid, ChevronDown } from "lucide-react";

/**
 * The CR's view of who sits where.
 *
 * A CR is asked "which group is so-and-so in?" far more often than anything else,
 * and the answer has to be the whole group, not just a name — so the search
 * returns the group and its members, and the browse side shows every group in
 * every seminar. Read-only: the CR can see the seating, the admin moves it.
 *
 * The counts come from the same `buildSeminarReports` the admin's pages use, so
 * the CR and the owner are never looking at two different rosters.
 */
export function CrGroupsOverview() {
  const { roster, loading, error } = useRoster();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  // The browse list shows the fifteen current seminars only; the legacy `SEMINA 16` is
  // not a real seminar and has no group 11 to browse. A CR can still *find* a student who
  // is still sitting in it, because the search below reads the whole roster.
  const reports = useMemo(
    () => buildSeminarReports(roster).filter((r) => isCurrentSeminar(r.semina)),
    [roster],
  );

  const found = useMemo(() => {
    const q = query.trim();
    if (!q) return null;
    return findMyGroup(roster, q);
  }, [roster, query]);

  const totals = useMemo(() => {
    const seated = reports.reduce((n, r) => n + r.totalStudents, 0);
    const groups = reports.reduce((n, r) => n + r.totalGroups, 0);
    return { seated, groups, seminars: reports.length };
  }, [reports]);

  if (loading && roster.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Inapakia orodha ya wanafunzi...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/25 bg-gradient-to-br from-primary/10 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" /> Group la Mwanafunzi
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Andika Reg Namba au jina la mwanafunzi uone yuko semina gani na group namba gani.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            placeholder="MUM2025-04-14106 au jina"
            className="font-mono"
          />

          {query.trim() && !found && (
            <p className="text-sm text-muted-foreground">
              Hakuna mwanafunzi anayelingana na "{query.trim()}".
            </p>
          )}

          {found && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
                  {found.semina || "Semina —"} · {genderLabel(found.gender).toUpperCase()} ·{" "}
                  {found.group || "Group —"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {found.members.length} wanafunzi
                  {found.free > 0 ? ` · nafasi ${found.free} zimebaki` : " · group limejaa"}
                </span>
              </div>
              <GroupMembers members={found.members} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <LayoutGrid className="h-4 w-4" /> Magroup Yote
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {totals.seminars} semina · {totals.groups} group · {totals.seated} wanafunzi
            </span>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Bofya semina kuona magroup yake yote na kila mwanafunzi aliyekaa.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {error && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
              Orodha haikupatikana. Angalia muunganisho kisha ujaribu tena.
            </p>
          )}
          {reports.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">
              Hakuna mwanafunzi aliyewekwa kwenye group.
            </p>
          )}
          {reports.map((r) => (
            <SeminarAccordion
              key={r.semina}
              report={r}
              open={open === r.semina}
              onToggle={() => setOpen(open === r.semina ? null : r.semina)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function SeminarAccordion({
  report,
  open,
  onToggle,
}: {
  report: SeminarReport;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left"
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
        <span className="font-semibold">{report.semina}</span>
        <span className="text-xs text-muted-foreground">
          {report.totalStudents} wanafunzi · {report.completeGroups}/{report.totalGroups} group
          zimejaa
        </span>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Mars className="h-3 w-3" /> {report.maleCount}
          </span>
          <span className="inline-flex items-center gap-1">
            <Venus className="h-3 w-3" /> {report.femaleCount}
          </span>
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t px-3 py-3">
          {report.unknownGender.length > 0 && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px]">
              {report.unknownGender.length} hawajawekwa kwa sababu jinsia haijulikani.
            </p>
          )}
          {(["male", "female"] as const).map((gender) => {
            const cells = gender === "male" ? report.male : report.female;
            const filled = cells.filter((c) => c.count > 0);
            return (
              <div key={gender} className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase text-muted-foreground">
                  {gender === "male" ? (
                    <Mars className="h-3.5 w-3.5" />
                  ) : (
                    <Venus className="h-3.5 w-3.5" />
                  )}
                  {genderLabel(gender)}
                </p>
                {filled.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Hakuna mwanafunzi.</p>
                ) : (
                  filled.map((cell) => <GroupCellCard key={cell.group} cell={cell} />)
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function GroupCellCard({ cell }: { cell: GroupCell }) {
  const reps = useMemo(
    () => representativesFor(cell.members, cell.semina, cell.gender, cell.group),
    [cell],
  );
  const rep = reps.female ?? reps.male ?? null;

  return (
    <div className="rounded-lg bg-muted/40 p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold">{cell.group}</span>
        <span className="text-[11px] text-muted-foreground">
          {cell.count} / {cell.size}
        </span>
        {rep && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
            <Star className="h-3 w-3" /> CR: {rep.full_name}
          </span>
        )}
      </div>
      <GroupMembers members={cell.members} />
    </div>
  );
}

function GroupMembers({ members }: { members: GroupMember[] }) {
  if (members.length === 0) {
    return <p className="text-xs text-muted-foreground">Hakuna mwanafunzi kwenye group hili.</p>;
  }
  return (
    <ul className="space-y-1">
      {members.map((m) => (
        <li
          key={m.id}
          className="flex flex-wrap items-center gap-x-2 rounded-md bg-background/60 px-2 py-1 text-xs"
        >
          <span className="min-w-0 flex-1 truncate font-medium">{m.full_name || "—"}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{m.reg_no}</span>
        </li>
      ))}
    </ul>
  );
}
