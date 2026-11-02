import { useMemo } from "react";
import { useRoster } from "@/lib/useRoster";
import { findMyGroup, formatGroupLabel, representativesFor } from "@/lib/groupAssignment";
import { Loader2, Mars, Venus, CheckCircle2, AlertTriangle, Star } from "lucide-react";

/**
 * The group a Reg Namba belongs to: its badges, its representative, and every
 * classmate. Renders from the roster alone, so the Update Taarifa wizard and the
 * "Group Yangu" card show the same thing without either owning the markup.
 */
export function GroupRosterView({ reg, className = "" }: { reg: string; className?: string }) {
  const { roster, loading } = useRoster();
  const mine = useMemo(() => (reg ? findMyGroup(roster, reg) : null), [roster, reg]);

  // A group is gender-pure, so exactly one side of the pair is filled.
  const reps = useMemo(
    () =>
      mine?.group ? representativesFor(mine.members, mine.semina, mine.gender, mine.group) : null,
    [mine],
  );
  const myRep = reps?.female ?? reps?.male ?? null;

  if (loading && !mine) {
    return (
      <p className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin" /> Inapakia orodha ya wanafunzi...
      </p>
    );
  }

  if (!mine) {
    return (
      <p
        className={`rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm ${className}`}
      >
        Reg Namba hii haipo kwenye mfumo. Hakikisha umeandika vizuri.
      </p>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Reg Namba", value: mine.student.reg_no },
          { label: "Semina", value: mine.semina || "—" },
          { label: "Group", value: mine.group || "—" },
          {
            label: "Jinsia",
            value:
              mine.gender === "female" ? "Mwanamke" : mine.gender === "male" ? "Mwanaume" : "—",
          },
        ].map((f) => (
          <div key={f.label} className="rounded-xl border border-primary/15 bg-primary/5 p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {f.label}
            </div>
            <div className="truncate text-sm font-semibold">{f.value || "—"}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {mine.group && (
          <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-bold text-primary">
            {formatGroupLabel(mine.semina, mine.gender, mine.group)}
          </span>
        )}
        {mine.complete ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> Group limekamilika (8/8)
          </span>
        ) : (
          mine.group && (
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
              Lina nafasi {mine.free} — bado halijakamilika
            </span>
          )
        )}
      </div>

      {mine.note && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          {mine.note}
        </p>
      )}

      {mine.group && (
        <div>
          {myRep && (
            <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              <Star className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div>
                <div className="font-bold">Mwakilishi wa group: {myRep.full_name || "—"}</div>
                <div className="font-mono text-xs text-muted-foreground">
                  {myRep.reg_no}
                  {myRep.id === mine.student.id && (
                    <span className="ml-1 font-sans font-bold text-amber-700 dark:text-amber-400">
                      (wewe)
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {mine.gender === "female" ? (
              <Venus className="h-3 w-3" />
            ) : (
              <Mars className="h-3 w-3" />
            )}
            Wanafunzi wenzako ({mine.members.length}/{mine.members.length + mine.free})
          </div>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {mine.members.map((m) => {
              const isMe = m.id === mine.student.id;
              return (
                <li
                  key={m.id}
                  className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${
                    isMe ? "bg-primary/10 font-bold" : ""
                  }`}
                >
                  <span className="truncate">{m.full_name || "—"}</span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {m.reg_no}
                    {isMe && <span className="ml-1 text-primary">(wewe)</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
