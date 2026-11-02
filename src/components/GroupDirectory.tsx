import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoster } from "@/lib/useRoster";
import { unlockStudentGroup } from "@/lib/groupRoster";
import { toast } from "@/lib/toast";
import {
  buildSeminarReports,
  representativesFor,
  type GroupCell,
  type GroupMember,
} from "@/lib/groupAssignment";
import {
  Loader2,
  Users,
  Mars,
  Venus,
  Phone,
  Lock,
  Unlock,
  CheckCircle2,
  Search,
  Star,
  RefreshCw,
} from "lucide-react";

/**
 * Every group, as a card: who sits in it, the number each member registered, and
 * whether they have confirmed. This is the list the admin reads after the students
 * work through step 3, so it is built around the two questions the admin actually
 * has — "who is in this group?" and "who has confirmed?".
 *
 * A confirmed seat cannot be moved by the student, so the admin is the only one who
 * can release it; that is what the unlock action is for.
 */
function GroupCard({ cell, onChanged }: { cell: GroupCell; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);

  const reps = useMemo(
    () => representativesFor(cell.members, cell.semina, cell.gender, cell.group),
    [cell],
  );
  const rep = reps.female ?? reps.male ?? null;

  const unlock = async (member: GroupMember) => {
    setBusy(member.id);
    const err = await unlockStudentGroup(member.id);
    setBusy(null);
    if (err) return toast.error(err.message);
    toast.success(`Group limefunguliwa kwa ${member.full_name || member.reg_no}.`);
    onChanged();
  };

  const empty = cell.members.length === 0;

  return (
    <Card
      className={`overflow-hidden border-2 transition-colors ${
        cell.allConfirmed
          ? "border-emerald-500/50 bg-emerald-500/5"
          : cell.complete
            ? "border-primary/30"
            : "border-border"
      }`}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          {cell.gender === "female" ? (
            <Venus className="h-4 w-4 text-pink-600" />
          ) : (
            <Mars className="h-4 w-4 text-blue-600" />
          )}
          {cell.group}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-1.5">
          {cell.allConfirmed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
              <Lock className="h-3 w-3" /> WOTE WAMEHAKIKI
            </span>
          )}
          {cell.complete && !cell.allConfirmed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
              <CheckCircle2 className="h-3 w-3" /> 8/8
            </span>
          )}
          {!cell.complete && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold">
              {cell.count}/{cell.size}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-2 text-[11px] font-bold text-muted-foreground">
          <span>
            Wamehakiki: {cell.confirmed}/{cell.count}
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${cell.count ? (cell.confirmed / cell.count) * 100 : 0}%` }}
            />
          </div>
        </div>

        {rep && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px]">
            <Star className="h-3 w-3 shrink-0 text-amber-600" />
            <span className="truncate font-bold">{rep.full_name || "—"}</span>
            <span className="ml-auto shrink-0 font-mono text-muted-foreground">{rep.reg_no}</span>
          </div>
        )}

        {empty ? (
          <p className="py-2 text-center text-xs text-muted-foreground">Hakuna mwanachama.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {cell.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 px-2.5 py-2 text-xs">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{m.full_name || "—"}</span>
                  <span className="block font-mono text-[10px] text-muted-foreground">
                    {m.reg_no}
                  </span>
                </span>
                {m.phone ? (
                  <a
                    href={`tel:${m.phone}`}
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
                  >
                    <Phone className="h-3 w-3" />
                    {m.phone}
                  </a>
                ) : (
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    hana namba
                  </span>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  title="Fungua ili mwanafunzi aweze kuchagua tena"
                  onClick={() => void unlock(m)}
                  disabled={busy === m.id}
                  className="h-6 shrink-0 px-1.5"
                >
                  {busy === m.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Unlock className="h-3 w-3" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function GroupDirectory() {
  const { roster, loading, error, reload } = useRoster();
  const [query, setQuery] = useState("");
  const [onlyConfirmed, setOnlyConfirmed] = useState(false);

  const reports = useMemo(() => buildSeminarReports(roster), [roster]);

  const q = query.trim().toUpperCase();
  const cells = useMemo(() => {
    const all = reports.flatMap((r) => [...r.male, ...r.female]);
    return all.filter((c) => {
      if (onlyConfirmed && !c.allConfirmed) return false;
      if (!q) return true;
      if (`${c.semina} ${c.group}`.toUpperCase().includes(q)) return true;
      return c.members.some(
        (m) =>
          m.reg_no.toUpperCase().includes(q) ||
          (m.full_name || "").toUpperCase().includes(q) ||
          (m.phone || "").includes(q),
      );
    });
  }, [reports, q, onlyConfirmed]);

  const totals = useMemo(() => {
    const all = reports.flatMap((r) => [...r.male, ...r.female]);
    const seated = all.reduce((n, c) => n + c.count, 0);
    const confirmed = all.reduce((n, c) => n + c.confirmed, 0);
    return { seated, confirmed, groups: all.filter((c) => c.count > 0).length };
  }, [reports]);

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
            <Users className="h-5 w-5 text-primary" /> Orodha ya Magroup
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Kila group, wanachama wake, namba zao za simu, na kama wamehakiki. Mwanafunzi
            aliyeshahakiki hawezi kubadilisha — fungua hapa kama kuna kosa.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-muted px-3 py-1 font-bold">
              Magroup yenye wanafunzi: {totals.groups}
            </span>
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 font-bold text-emerald-700 dark:text-emerald-300">
              Wamehakiki: {totals.confirmed}/{totals.seated}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tafuta group, jina, Reg Namba au namba ya simu..."
                className="pl-8"
              />
            </div>
            <Button
              variant={onlyConfirmed ? "default" : "outline"}
              onClick={() => setOnlyConfirmed((v) => !v)}
              className="font-bold"
            >
              <Lock className="h-4 w-4" /> Waliohakiki tu
            </Button>
            <Button variant="ghost" onClick={reload} className="font-bold">
              <RefreshCw className="h-4 w-4" /> Onyesha upya
            </Button>
          </div>
        </CardContent>
      </Card>

      {cells.length === 0 ? (
        <p className="rounded-xl border border-border p-4 text-center text-sm text-muted-foreground">
          Hakuna group linalolingana na utafutaji wako.
        </p>
      ) : (
        reports.map((r) => {
          const mine = cells.filter((c) => c.semina === r.semina);
          if (mine.length === 0) return null;
          return (
            <div key={r.semina} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-black uppercase tracking-wide">{r.semina}</h3>
                <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[10px] font-bold text-primary">
                  {r.confirmedGroups}/{r.totalGroups} yamehakikiwa
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Wanaume {r.maleCount} · Wanawake {r.femaleCount}
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {mine.map((c) => (
                  <GroupCard key={`${c.gender}-${c.group}`} cell={c} onChanged={reload} />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
