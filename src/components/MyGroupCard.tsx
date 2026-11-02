import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRoster } from "@/lib/useRoster";
import { findMyGroup } from "@/lib/groupAssignment";
import { formatGroupLabel } from "@/lib/groupAssignment";
import { Loader2, Search, Users, Mars, Venus, CheckCircle2, AlertTriangle } from "lucide-react";

/**
 * "Group lako na Semina yako" — the student types a Reg Namba and sees the
 * group the system put them in, plus the classmates sitting with them.
 */
export function MyGroupCard({ initialReg = "" }: { initialReg?: string }) {
  const { roster, loading } = useRoster();
  const [reg, setReg] = useState(initialReg);
  const [query, setQuery] = useState(initialReg);

  const mine = useMemo(() => (query ? findMyGroup(roster, query) : null), [roster, query]);
  const searched = query.trim().length > 0 && !loading;

  return (
    <Card className="border-2 border-primary/25 shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" /> Group Lako na Semina Yako
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Andika Reg Namba yako uone semina, group, na wanafunzi ulio nao.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={reg}
            onChange={(e) => setReg(e.target.value.toUpperCase())}
            placeholder="MUM2025-04-14106"
            className="flex-1 font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") setQuery(reg);
            }}
          />
          <Button onClick={() => setQuery(reg)} className="font-bold">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Tafuta
          </Button>
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground">Inapakia orodha ya wanafunzi...</p>
        )}

        {searched && !mine && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            Reg Namba hii haipo kwenye mfumo. Hakikisha umeandika vizuri, au wasilisha ombi la
            marekebisho hapo juu.
          </p>
        )}

        {mine && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Reg Namba", value: mine.student.reg_no },
                { label: "Semina", value: mine.semina || "—" },
                {
                  label: "Group",
                  value: mine.group || "—",
                },
                {
                  label: "Jinsia",
                  value:
                    mine.gender === "female"
                      ? "Mwanamke"
                      : mine.gender === "male"
                        ? "Mwanaume"
                        : "—",
                },
              ].map((f) => (
                <div
                  key={f.label}
                  className="rounded-xl border border-primary/15 bg-primary/5 p-2.5"
                >
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
                <div className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {mine.gender === "female" ? (
                    <Venus className="h-3 w-3" />
                  ) : (
                    <Mars className="h-3 w-3" />
                  )}
                  Wanafunzi wenzako ({mine.members.length}/{mine.members.length + mine.free})
                </div>
                <ul className="divide-y divide-border rounded-xl border border-border">
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
        )}
      </CardContent>
    </Card>
  );
}
