import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Search, User, X } from "lucide-react";

type Student = {
  id: string;
  reg_no: string;
  full_name: string;
  semina?: string;
  student_group?: string;
  phone?: string | null;
};

/**
 * Shows a list of matching students with a "Hii ni mimi" confirm button per row.
 * Used after a flexible search returns multiple results (e.g. user typed only
 * last name) so the student can confirm exactly which record is theirs.
 */
export function StudentMatchesPicker({
  matches,
  onConfirm,
  onCancel,
}: {
  matches: Student[];
  onConfirm: (s: Student) => void;
  onCancel?: () => void;
}) {
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const t = filter.trim().toLowerCase();
    if (!t) return matches;
    return matches.filter((m) =>
      [m.full_name, m.reg_no, m.semina, m.student_group]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t)),
    );
  }, [filter, matches]);

  if (!matches.length) return null;

  return (
    <div className="mt-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="text-xs font-bold flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5 text-primary" />
          Tumepata <b>{matches.length}</b> matokeo — thibitisha ni nani wewe
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-[11px] px-2 py-0.5 rounded-full bg-muted hover:bg-muted/70 text-foreground inline-flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Funga
          </button>
        )}
      </div>
      {matches.length > 6 && (
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Punguza orodha (jina, reg, semina, group)..."
          className="h-9 text-xs mb-2"
        />
      )}
      <div className="max-h-72 overflow-auto flex flex-col gap-1.5">
        {filtered.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-2 p-2 rounded-lg border bg-background hover:border-primary/50"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                {s.full_name}
              </div>
              <div className="text-[11px] text-muted-foreground font-mono truncate">
                {s.reg_no}
                {s.semina ? ` • ${s.semina}` : ""}
                {s.student_group ? ` • ${s.student_group}` : ""}
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => onConfirm(s)}
              className="shrink-0 h-8 text-xs gap-1"
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Ni mimi
            </Button>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-[11px] text-muted-foreground text-center py-3">
            Hakuna anayelingana.
          </div>
        )}
      </div>
    </div>
  );
}
