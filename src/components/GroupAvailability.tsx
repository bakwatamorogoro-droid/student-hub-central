import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Users, AlertCircle, Search, Mars, Venus } from "lucide-react";

type GroupRow = {
  semina: string;
  student_group: string;
  count: number;
  male: number;
  female: number;
};

const FULL_SIZE = 9;

const isMale = (g?: string | null) => /^m/i.test(g || "") || /me|male|kiume|mwanaume/i.test(g || "");
const isFemale = (g?: string | null) => /^f|^k/i.test(g || "") || /female|kike|mwanamke/i.test(g || "");

export function GroupAvailability() {
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [query, setQuery] = useState("");
  const [genderFilter, setGenderFilter] = useState<"all" | "male" | "female">("all");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("students")
        .select("semina, student_group, gender")
        .order("semina");
      const counts = new Map<string, GroupRow>();
      (data || []).forEach((s: any) => {
        if (!s.semina || !s.student_group) return;
        const key = `${s.semina}||${s.student_group}`;
        const cur = counts.get(key) || {
          semina: s.semina,
          student_group: s.student_group,
          count: 0,
          male: 0,
          female: 0,
        };
        cur.count++;
        if (isMale(s.gender)) cur.male++;
        else if (isFemale(s.gender)) cur.female++;
        counts.set(key, cur);
      });
      const arr = Array.from(counts.values())
        .filter((g) => g.count < FULL_SIZE)
        .sort((a, b) => b.count - a.count);
      setGroups(arr);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups.filter((g) => {
      if (genderFilter === "male" && g.male === 0) return false;
      if (genderFilter === "female" && g.female === 0) return false;
      if (!q) return true;
      return (
        g.student_group.toLowerCase().includes(q) ||
        g.semina.toLowerCase().includes(q)
      );
    });
  }, [groups, query, genderFilter]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, g) => ({
        count: acc.count + g.count,
        male: acc.male + g.male,
        female: acc.female + g.female,
      }),
      { count: 0, male: 0, female: 0 },
    );
  }, [filtered]);

  if (groups.length === 0) return null;

  return (
    <section className="max-w-6xl mx-auto mt-8 px-2 sm:px-0">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
          <Users className="h-5 w-5 text-emerald-600" /> Magroup Ambayo Hayajajaa
        </h2>
        <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> Chini ya {FULL_SIZE} wanachama
        </span>
      </div>

      {/* Search + filters + totals */}
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto] items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tafuta group au semina..."
            className="pl-9 h-10"
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onClick={() => setGenderFilter("all")}
            className={`text-xs px-2.5 py-1.5 rounded-full border ${genderFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"}`}
          >
            Zote
          </button>
          <button
            type="button"
            onClick={() => setGenderFilter("male")}
            className={`text-xs px-2.5 py-1.5 rounded-full border inline-flex items-center gap-1 ${genderFilter === "male" ? "bg-blue-600 text-white border-blue-600" : "bg-card hover:bg-muted"}`}
          >
            <Mars className="h-3 w-3" /> Wanaume
          </button>
          <button
            type="button"
            onClick={() => setGenderFilter("female")}
            className={`text-xs px-2.5 py-1.5 rounded-full border inline-flex items-center gap-1 ${genderFilter === "female" ? "bg-pink-600 text-white border-pink-600" : "bg-card hover:bg-muted"}`}
          >
            <Venus className="h-3 w-3" /> Wanawake
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
        <span className="px-2 py-1 rounded-full bg-muted font-bold">Magroup: {filtered.length}</span>
        <span className="px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold">Jumla: {totals.count}</span>
        <span className="px-2 py-1 rounded-full bg-blue-500/15 text-blue-700 dark:text-blue-300 font-bold inline-flex items-center gap-1">
          <Mars className="h-3 w-3" /> Wanaume: {totals.male}
        </span>
        <span className="px-2 py-1 rounded-full bg-pink-500/15 text-pink-700 dark:text-pink-300 font-bold inline-flex items-center gap-1">
          <Venus className="h-3 w-3" /> Wanawake: {totals.female}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Hakuna group linalolingana na utafutaji wako.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
          {filtered.map((g) => {
            const need = FULL_SIZE - g.count;
            const pct = Math.round((g.count / FULL_SIZE) * 100);
            return (
              <Card key={`${g.semina}-${g.student_group}`} className="border-2 hover:border-emerald-500/60 transition bg-gradient-to-br from-emerald-500/5 to-transparent">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{g.semina}</div>
                      <div className="font-bold text-sm truncate">{g.student_group}</div>
                    </div>
                    <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full shrink-0">
                      {g.count}/{FULL_SIZE}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap text-[10px]">
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold">
                      <Mars className="h-3 w-3" /> {g.male}
                    </span>
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-700 dark:text-pink-300 font-semibold">
                      <Venus className="h-3 w-3" /> {g.female}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Linahitaji <b className="text-emerald-700 dark:text-emerald-300">{need}</b> zaidi
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
