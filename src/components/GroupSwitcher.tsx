import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllStudents } from "@/lib/fetchAllStudents";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Mars, Venus, Users, ArrowRightLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Row = {
  semina: string;
  student_group: string;
  count: number;
  male: number;
  female: number;
};

const FULL_SIZE = 10;
const isMale = (g?: string | null) => /^m/i.test(g || "") || /me|male|kiume|mwanaume/i.test(g || "");
const isFemale = (g?: string | null) => /^f|^k/i.test(g || "") || /female|kike|mwanamke/i.test(g || "");

type Props = {
  student: any;
  onChanged?: () => void;
};

export function GroupSwitcher({ student, onChanged }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"auto" | "male" | "female" | "all">("auto");
  const [switching, setSwitching] = useState<string | null>(null);

  const myGender: "male" | "female" | "other" = isMale(student?.gender)
    ? "male"
    : isFemale(student?.gender)
    ? "female"
    : "other";

  useEffect(() => {
    (async () => {
      const data = await fetchAllStudents<any>("semina, student_group, gender").catch(() => []);
      const m = new Map<string, Row>();
      (data || []).forEach((s: any) => {
        if (!s.semina || !s.student_group) return;
        const k = `${s.semina}||${s.student_group}`;
        const cur = m.get(k) || { semina: s.semina, student_group: s.student_group, count: 0, male: 0, female: 0 };
        cur.count++;
        if (isMale(s.gender)) cur.male++;
        else if (isFemale(s.gender)) cur.female++;
        m.set(k, cur);
      });
      setRows(Array.from(m.values()).sort((a, b) => a.student_group.localeCompare(b.student_group)));
    })();
  }, [student?.id]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (r.semina !== student?.semina) return false; // only same semina
      if (r.student_group === student?.student_group) return false; // exclude current
      if (r.count >= FULL_SIZE) return false;
      const f = filter === "auto" ? (myGender === "other" ? "all" : myGender) : filter;
      if (f === "male" && r.male === 0 && r.female > 0) return false;
      if (f === "female" && r.female === 0 && r.male > 0) return false;
      if (!term) return true;
      return r.student_group.toLowerCase().includes(term);
    });
  }, [rows, q, filter, student, myGender]);

  const switchTo = async (g: Row) => {
    if (!student) return;
    if (!confirm(`Hamia kwenye ${g.student_group}? Kazi zako zilizotumwa zitabaki sawa.`)) return;
    setSwitching(g.student_group);
    try {
      const { error } = await (supabase as any).rpc("apply_profile_update", {
        p_student_id: student.id,
        p_new_reg_no: null,
        p_new_full_name: null,
        p_new_semina: null,
        p_new_group: g.student_group,
      });
      if (error) {
        // fallback direct update
        const { error: e2 } = await supabase
          .from("students")
          .update({ student_group: g.student_group })
          .eq("id", student.id);
        if (e2) throw e2;
      }
      toast.success(`Umehamia ${g.student_group} ✓`);
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "Imeshindikana");
    } finally {
      setSwitching(null);
    }
  };

  if (!student) return null;

  return (
    <Card className="border-2 border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ArrowRightLeft className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-sm">Tafuta & Hamia Group Jingine</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Group lako la sasa: <b>{student.student_group}</b> ({student.semina}). Chagua group jingine kwenye semina hiyo hiyo.
        </p>

        <div className="grid sm:grid-cols-[1fr_auto] gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tafuta jina la group..." className="pl-9 h-10" />
          </div>
          <div className="flex flex-wrap gap-1">
            {([
              ["auto", myGender === "female" ? "Wanawake (yangu)" : myGender === "male" ? "Wanaume (yangu)" : "Pendekezwa", null],
              ["male", "Wanaume", <Mars className="h-3 w-3" key="m" />],
              ["female", "Wanawake", <Venus className="h-3 w-3" key="f" />],
              ["all", "Zote", null],
            ] as const).map(([k, label, icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k as any)}
                className={`text-xs px-2.5 py-1.5 rounded-full border inline-flex items-center gap-1 ${
                  filter === k
                    ? k === "female"
                      ? "bg-pink-600 text-white border-pink-600"
                      : k === "male"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-primary text-primary-foreground border-primary"
                    : "bg-card hover:bg-muted"
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Hakuna group lingine linalokufaa kwa sasa.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-80 overflow-auto pr-1">
            {filtered.map((g) => {
              const need = FULL_SIZE - g.count;
              return (
                <div
                  key={g.student_group}
                  className="border-2 rounded-lg p-3 hover:border-primary/60 bg-gradient-to-br from-primary/5 to-transparent"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-bold text-sm truncate">{g.student_group}</div>
                    <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full shrink-0">
                      {g.count}/{FULL_SIZE}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] mb-2">
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 font-semibold">
                      <Mars className="h-3 w-3" /> {g.male}
                    </span>
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-pink-500/15 text-pink-700 dark:text-pink-300 font-semibold">
                      <Venus className="h-3 w-3" /> {g.female}
                    </span>
                    <span className="ml-auto text-muted-foreground">
                      <Users className="h-3 w-3 inline" /> nafasi {need}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    className="w-full h-8"
                    disabled={switching === g.student_group}
                    onClick={() => switchTo(g)}
                  >
                    {switching === g.student_group ? <Loader2 className="h-3 w-3 animate-spin" /> : "Hamia hapa"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
