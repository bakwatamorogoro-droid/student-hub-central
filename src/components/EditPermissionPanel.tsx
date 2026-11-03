import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import { confirmAction } from "@/lib/alerts";
import { findStudentsByQuery } from "@/lib/studentSearch";
import { grantStudentEdit, revokeStudentEdit } from "@/lib/groupRoster";
import { GRANT_STATUS } from "@/lib/editPermission";
import { Loader2, Search, Unlock, Lock, PencilRuler, RefreshCw } from "lucide-react";

/**
 * The admin's per-student edit switch.
 *
 * `profile_edits_enabled` in `app_settings` is all-or-nothing, so the single student who
 * saved a wrong seminar or group after the switch was turned off had no way back short of
 * the admin editing their row by hand. This panel searches a Reg Namba, opens that one
 * student's form, and shows who is holding a grant so it can be taken back.
 *
 * The grant is a row in `profile_update_requests` (`status = "edit_granted"`) rather than a
 * column on `students`, so it needs no DDL and the student's own page sees it from the rows
 * it already fetches.
 */
type Row = {
  id: string;
  reg_no: string;
  full_name: string | null;
  semina: string | null;
  student_group: string | null;
  group_confirmed_at: string | null;
};

type GrantRow = { id: string; student_id: string; created_at: string | null };

const STUDENT_COLUMNS = "id, reg_no, full_name, semina, student_group, group_confirmed_at";

export function EditPermissionPanel() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Row[]>([]);
  const [granted, setGranted] = useState<Map<string, GrantRow>>(new Map());
  const [holders, setHolders] = useState<Row[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingHolders, setLoadingHolders] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [listError, setListError] = useState(false);

  /** Everyone currently holding a grant, resolved to names so a forgotten one is visible. */
  const loadGranted = useCallback(async () => {
    setLoadingHolders(true);
    const { data, error } = await (supabase as any)
      .from("profile_update_requests")
      .select("id, student_id, created_at, status")
      .eq("status", GRANT_STATUS)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      // The table is live, so this is a real fault rather than a missing migration. Say so
      // instead of quietly showing an empty list.
      setListError(true);
      setLoadingHolders(false);
      return;
    }
    setListError(false);
    const byStudent = new Map<string, GrantRow>();
    for (const r of (data || []) as GrantRow[]) {
      if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, r);
    }
    setGranted(byStudent);

    const ids = [...byStudent.keys()];
    if (!ids.length) {
      setHolders([]);
      setLoadingHolders(false);
      return;
    }
    const { data: students } = await (supabase as any)
      .from("students")
      .select(STUDENT_COLUMNS)
      .in("id", ids);
    setHolders((students || []) as Row[]);
    setLoadingHolders(false);
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
    const { error } = await grantStudentEdit(row);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`${row.full_name || row.reg_no} amefunguliwa marekebisho.`);
    void loadGranted();
  };

  const revoke = async (row: Row) => {
    setBusy(row.id);
    const { error } = await revokeStudentEdit(row.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Ruhusa ya ${row.full_name || row.reg_no} imefungwa.`);
    void loadGranted();
  };

  const renderRow = (row: Row, open: boolean, action: "grant" | "revoke") => (
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
      <Button
        size="sm"
        variant={action === "revoke" ? "outline" : "default"}
        onClick={() => void (action === "revoke" ? revoke(row) : grant(row))}
        disabled={busy === row.id}
        className="shrink-0 gap-1 font-bold"
      >
        {busy === row.id ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : action === "revoke" ? (
          <Lock className="h-3 w-3" />
        ) : (
          <Unlock className="h-3 w-3" />
        )}
        {action === "revoke" ? "Funga" : "Fungua marekebisho"}
      </Button>
    </li>
  );

  return (
    <div className="space-y-4">
      {listError && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
          Orodha ya waliyofunguliwa haikupatikana. Angalia muunganisho wa hifadhidata kisha ujaribu
          tena.
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

          {results.length > 0 && (
            <ul className="space-y-2">
              {results.map((row) =>
                renderRow(row, granted.has(row.id), granted.has(row.id) ? "revoke" : "grant"),
              )}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Unlock className="h-4 w-4" /> Waliyofunguliwa ({granted.size})
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void loadGranted()}
            className="font-bold"
          >
            <RefreshCw className={`h-3 w-3 ${loadingHolders ? "animate-spin" : ""}`} /> Onyesha upya
          </Button>
        </CardHeader>
        <CardContent>
          {granted.size === 0 ? (
            <p className="text-sm text-muted-foreground">
              Hakuna mwanafunzi aliyefunguliwa marekebisho kwa sasa.
            </p>
          ) : holders.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inapakia...</p>
          ) : (
            <ul className="space-y-2">{holders.map((row) => renderRow(row, true, "revoke"))}</ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
