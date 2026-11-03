import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { confirmAction } from "@/lib/alerts";
import { findStudentsByQuery } from "@/lib/studentSearch";
import { grantStudentEdit } from "@/lib/groupRoster";
import { crUnlockStudentPin, studentPinState } from "@/lib/studentAccount";
import { pinLockLabel } from "@/lib/pinLock";
import { Loader2, Search, Unlock, UserCog } from "lucide-react";

/**
 * The CR's whole job on one card: find a classmate who is stuck, and open their account.
 *
 * "Stuck" is two different things and both stop a correction:
 *
 *  - the form is closed, so they cannot save anything (`grantStudentEdit`), and
 *  - the sign-in is closed by a PIN lockout or a pile of failed attempts, so they
 *    cannot even reach the form (`crUnlockStudentPin`).
 *
 * The button does both in one press, because a student who can sign in but not save,
 * or save but not sign in, is still stuck. Opening is idempotent: a student with
 * nothing to clear reports "nothing to open" rather than being written again.
 */
type Row = {
  id: string;
  reg_no: string;
  full_name: string | null;
  semina: string | null;
  student_group: string | null;
};

export function CrUnlockPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Row[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const rows = (await findStudentsByQuery(query)) as Row[];
      setResults(rows.slice(0, 30));
      if (rows.length === 0) toast.info("Hakuna mwanafunzi aliyepatikana.");
    } finally {
      setSearching(false);
    }
  };

  const openAccount = async (row: Row) => {
    const ok = await confirmAction(
      `Fungua akaunti ya ${row.full_name || row.reg_no}?`,
      `Mwanafunzi ${row.reg_no} ataruhusiwa kurekebisha taarifa zake, na PIN yake itafunguliwa kama ilifungwa kwa makosa. Atabadilisha PIN yake mwenyewe baada ya kuingia.`,
      "Ndiyo, fungua",
    );
    if (!ok) return;

    setBusy(row.id);
    try {
      // Read the PIN state first so the toast can say what actually happened: a
      // student whose PIN was fine should not be told their PIN was reopened.
      const state = await studentPinState(row.reg_no);
      const { error } = await grantStudentEdit(row);
      if (error) {
        toast.error(error.message);
        return;
      }
      const unlocked = await crUnlockStudentPin(row.reg_no);
      if (!unlocked.ok) {
        // The edit grant landed, so the correction is still possible; only the PIN
        // half failed. Say so plainly instead of claiming a clean success.
        toast.warning(`Marekebisho yamefunguliwa, lakini PIN: ${unlocked.message}`);
        return;
      }
      const was = state.ok ? pinLockLabel(state.state) : null;
      toast.success(
        unlocked.changed
          ? `Akaunti ya ${unlocked.fullName} imefunguliwa. PIN: ${was} → sasa iko sawa.`
          : `Marekebisho ya ${unlocked.fullName} yamefunguliwa. PIN ilikuwa sawa tayari.`,
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-primary/25 bg-gradient-to-br from-primary/10 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCog className="h-4 w-4 text-primary" /> Fungua Akaunti ya Mwanafunzi
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Tafuta Reg Namba au jina la mwanafunzi aliyekosea, kisha mfungulie. Ataweza kuingia na
          kurekebisha taarifa zake, na atabadilisha PIN yake mwenyewe.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            placeholder="MUM2025-04-14106 au jina"
            className="flex-1 font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") void search();
            }}
          />
          <Button onClick={() => void search()} disabled={searching} className="gap-1 font-bold">
            {searching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            Tafuta
          </Button>
        </div>

        {results.length > 0 && (
          <ul className="space-y-2">
            {results.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{row.full_name || "—"}</span>
                  <span className="block font-mono text-[11px] text-muted-foreground">
                    {row.reg_no}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {row.semina || "—"} · {row.student_group || "—"}
                </span>
                <Button
                  size="sm"
                  onClick={() => void openAccount(row)}
                  disabled={busy === row.id}
                  className="shrink-0 gap-1 font-bold"
                >
                  {busy === row.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Unlock className="h-3 w-3" />
                  )}
                  Fungua akaunti
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
