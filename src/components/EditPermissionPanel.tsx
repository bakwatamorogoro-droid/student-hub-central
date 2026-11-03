import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { confirmAction } from "@/lib/alerts";
import { findStudentsByQuery } from "@/lib/studentSearch";
import { grantStudentEdit, revokeStudentEdit } from "@/lib/groupRoster";
import { Loader2, Search, Unlock, Lock, PencilRuler, RefreshCw } from "lucide-react";

/**
 * The admin's per-student edit switch.
 *
 * `profile_edits_enabled` in `app_settings` is all-or-nothing, so the single student who
 * saved a wrong seminar or group after the switch was turned off had no way back short of
 * the admin editing their row by hand. This panel searches a Reg Namba, opens that one
 * student's form with `grant_student_edit`, and shows who is holding a grant so it can be
 * taken back.
 *
 * The grant is stored on the student's row (`edit_unlocked_at`) rather than in local
 * state, so the student's own page can see it without being told, and it survives the
 * admin closing the tab.
 */
type Row = {
  id: string;
  reg_no: string;
  full_name: string | null;
  semina: string | null;
  student_group: string | null;
  group_confirmed_at: string | null;
  edit_unlocked_at: string | null;
};

export function EditPermissionPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Row[]>([]);
  const [granted, setGranted] = useState<Row[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [needsMigration, setNeedsMigration] = useState(false);

  /** Everyone currently holding a grant, so a forgotten one is visible. */
  const loadGranted = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from("students")
      .select("id, reg_no, full_name, semina, student_group, group_confirmed_at, edit_unlocked_at")
      .not("edit_unlocked_at", "is", null)
      .order("edit_unlocked_at", { ascending: false })
      .limit(200);
    if (error) {
      // A database that has not run the migration rejects the whole select. Say so once
      // rather than showing the raw PostgREST error on every load.
      if ((error as { code?: string }).code === "PGRST204") setNeedsMigration(true);
      return;
    }
    setGranted((data || []) as Row[]);
  }, []);

  useEffect(() => {
    void loadGranted();
  }, [loadGranted]);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const rows = await findStudentsByQuery(query);
      setResults((rows as Row[]).slice(0, 30));
      if (rows.length === 0) toast.info("Hakuna mwanafunzi aliyepatikana.");
    } finally {
      setSearching(false);
    }
  };

  const grant = async (row: Row) => {
    const ok = await confirmAction(
      `Fungua marekebisho kwa ${row.full_name || row.reg_no}?`,
      `Mwanafunzi ${row.reg_no} ataweza kurekebisha taarifa, semina na group lake, hata kama Update Taarifa imezimwa kwa wote. Ruhusa inaisha mara tu anapohifadhi.`,
      "Ndiyo, mfungulie",
    );
    if (!ok) return;
    setBusy(row.id);
    const { error, needsMigration: missing } = await grantStudentEdit(row.id);
    setBusy(null);
    if (missing) {
      setNeedsMigration(true);
      return toast.error(
        "Ufunguzi haujawashwa kwenye mfumo bado. Admin aendeshe migrations zilizo kwenye supabase/migrations/.",
      );
    }
    if (error) return toast.error(error.message);
    toast.success(`${row.full_name || row.reg_no} amefunguliwa marekebisho.`);
    void loadGranted();
  };

  const revoke = async (row: Row) => {
    setBusy(row.id);
    const { error, needsMigration: missing } = await revokeStudentEdit(row.id);
    setBusy(null);
    if (missing) return toast.error("Ufunguzi haujawashwa kwenye mfumo bado.");
    if (error) return toast.error(error.message);
    toast.success(`Ruhusa ya ${row.full_name || row.reg_no} imefungwa.`);
    void loadGranted();
  };

  const renderRow = (row: Row) => {
    const open = !!row.edit_unlocked_at;
    return (
      <li
        key={row.id}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5 text-sm"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{row.full_name || "—"}</span>
          <span className="block font-mono text-[11px] text-muted-foreground">{row.reg_no}</span>
        </span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          {row.semina || "—"} · {row.student_group || "—"}
        </span>
        {open && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
            <Unlock className="h-3 w-3" /> Amefunguliwa
          </span>
        )}
        {open ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void revoke(row)}
            disabled={busy === row.id}
            className="shrink-0 gap-1 font-bold"
          >
            {busy === row.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Lock className="h-3 w-3" />
            )}
            Funga
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => void grant(row)}
            disabled={busy === row.id}
            className="shrink-0 gap-1 font-bold"
          >
            {busy === row.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Unlock className="h-3 w-3" />
            )}
            Fungua marekebisho
          </Button>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      {needsMigration && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          Ufunguzi wa marekebisho haujawashwa kwenye hifadhidata. Msimamizi wa mfumo aendeshe{" "}
          <span className="font-mono">
            supabase/migrations/20261103140000_student_edit_permission.sql
          </span>
          .
        </p>
      )}

      <Card className="border-primary/25 bg-gradient-to-br from-primary/10 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PencilRuler className="h-4 w-4 text-primary" /> Ruhusa ya Marekebisho
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Tafuta Reg Namba ya mwanafunzi aliyekosea, kisha mfungulie ili arekebishe. Ruhusa
            inaisha mara tu anapohifadhi.
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

          {results.length > 0 && <ul className="space-y-2">{results.map(renderRow)}</ul>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Unlock className="h-4 w-4" /> Waliyofunguliwa ({granted.length})
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadGranted()}
            className="font-bold"
          >
            <RefreshCw className="h-3 w-3" /> Onyesha upya
          </Button>
        </CardHeader>
        <CardContent>
          {granted.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Hakuna mwanafunzi aliyefunguliwa marekebisho kwa sasa.
            </p>
          ) : (
            <ul className="space-y-2">{granted.map(renderRow)}</ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
