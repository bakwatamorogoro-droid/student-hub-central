import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRoster } from "@/lib/useRoster";
import {
  GROUP_NAMES,
  SEMINARS,
  buildSeminarReports,
  genderLabel,
  searchMembers,
  type GroupCell,
  type GroupMember,
} from "@/lib/groupAssignment";
import { saveGroupReport, type GroupReport } from "@/lib/groupRoster";
import { toast } from "@/lib/toast";
import {
  ClipboardCheck,
  Loader2,
  Send,
  Search,
  AlertTriangle,
  CheckCircle2,
  Mars,
  Venus,
} from "lucide-react";

/**
 * The CR's report for their own group. They mark who was missing, add a note,
 * and send it; the owner sees it on the reports list below. A group that has
 * lost a member is shown as needing a replacement, which is what the "add
 * member" control on the groups tab is for.
 */
export function SeminarReportPanel({
  reports,
  onSaved,
}: {
  reports: GroupReport[];
  onSaved: () => void;
}) {
  const { roster } = useRoster();
  const seminarReports = useMemo(() => buildSeminarReports(roster), [roster]);

  const [semina, setSemina] = useState("");
  const [gender, setGender] = useState<"male" | "female">("male");
  const [group, setGroup] = useState("");
  const [missing, setMissing] = useState<GroupMember[]>([]);
  const [note, setNote] = useState("");
  const [crName, setCrName] = useState("");
  const [busy, setBusy] = useState(false);
  const [candidateQuery, setCandidateQuery] = useState("");

  const cell: GroupCell | null = useMemo(() => {
    const r = seminarReports.find((x) => x.semina === semina);
    if (!r) return null;
    const cells = gender === "male" ? r.male : r.female;
    return cells.find((c) => c.group === group) ?? null;
  }, [seminarReports, semina, gender, group]);

  const candidates = useMemo(
    () => (candidateQuery.trim() ? searchMembers(roster, candidateQuery, 20) : []),
    [roster, candidateQuery],
  );

  const toggleMissing = (m: GroupMember) => {
    setMissing((prev) =>
      prev.some((x) => x.id === m.id) ? prev.filter((x) => x.id !== m.id) : [...prev, m],
    );
  };

  const submit = async () => {
    if (!semina || !group) return toast.error("Chagua semina na group.");
    if (!cell) return toast.error("Group hilo halipo.");
    setBusy(true);
    const { error } = await saveGroupReport({
      semina,
      gender,
      student_group: group,
      missing,
      note: note.trim() || null,
      reportedBy: crName.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Ripoti imetumwa kwa admin.");
    setMissing([]);
    setNote("");
    onSaved();
  };

  const presentCount = cell ? cell.count - missing.length : 0;

  return (
    <div className="space-y-4">
      <Card className="border-primary/25">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-4 w-4 text-primary" /> Ripoti ya Kikao — CR
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            CR wa semina achague group lake, aonyeshe wanafunzi ambao hawapo au wamemaliza, na atume
            ripoti kwa admin.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Semina</Label>
              <Select value={semina} onValueChange={setSemina}>
                <SelectTrigger>
                  <SelectValue placeholder="Chagua semina" />
                </SelectTrigger>
                <SelectContent>
                  {SEMINARS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Jinsia</Label>
              <Select
                value={gender}
                onValueChange={(v) => {
                  setGender(v as "male" | "female");
                  setGroup("");
                  setMissing([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">Wanaume</SelectItem>
                  <SelectItem value="female">Wanawake</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Group</Label>
              <Select
                value={group}
                onValueChange={(v) => {
                  setGroup(v);
                  setMissing([]);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chagua group" />
                </SelectTrigger>
                <SelectContent>
                  {GROUP_NAMES.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Jina la CR (si lazima)</Label>
            <Input
              value={crName}
              onChange={(e) => setCrName(e.target.value)}
              placeholder="Jina la mwakilishi wa semina"
            />
          </div>

          {semina && group && !cell && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
              Group hili halina wanachama kwenye semina hii.
            </p>
          )}

          {cell && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-primary/15 px-3 py-1 font-bold text-primary">
                  {semina} · {genderLabel(cell.gender).toUpperCase()} · {cell.group}
                </span>
                <span className="rounded-full bg-muted px-3 py-1 font-bold">
                  Wanachama: {cell.count}/{cell.size}
                </span>
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 font-bold text-emerald-700 dark:text-emerald-300">
                  Waliopo: {presentCount}
                </span>
                {missing.length > 0 && (
                  <span className="rounded-full bg-destructive/15 px-3 py-1 font-bold text-destructive">
                    Hawapo: {missing.length}
                  </span>
                )}
              </div>

              <div>
                <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {cell.gender === "female" ? (
                    <Venus className="mr-1 inline h-3 w-3" />
                  ) : (
                    <Mars className="mr-1 inline h-3 w-3" />
                  )}
                  Gusa jina la asiyekuwepo au aliyemaliza
                </div>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  {cell.members.map((m) => {
                    const away = missing.some((x) => x.id === m.id);
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => toggleMissing(m)}
                          className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                            away ? "bg-destructive/10" : "hover:bg-muted"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">
                              {m.full_name || "—"}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {m.reg_no}
                            </span>
                          </span>
                          {away ? (
                            <span className="shrink-0 rounded-full bg-destructive/20 px-2 py-0.5 text-[10px] font-bold text-destructive">
                              HAYUPO
                            </span>
                          ) : (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {cell.count < cell.size && (
                <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  Group lina nafasi {cell.size - cell.count}. Tafuta mwanafunzi aliyeondoka au
                  aliyemaliza hapa chini, kisha admin amrudishe.
                </p>
              )}
            </>
          )}

          <div>
            <Label>Maelezo (si lazima)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Mfano: walikwenda muhadhara mwingine"
            />
          </div>

          <Button onClick={submit} disabled={busy || !cell} className="font-bold">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Tuma ripoti kwa admin
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Search className="h-4 w-4" /> Tafuta mwanafunzi aliyeondoka au aliyemaliza
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Hapa CR anaweza kuthibitisha kwamba mtu bado yupo kwenye mfumo kabla ya kuripoti.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            value={candidateQuery}
            onChange={(e) => setCandidateQuery(e.target.value)}
            placeholder="Jina au Reg Namba..."
          />
          {candidates.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"
            >
              <div className="min-w-0">
                <div className="truncate font-semibold">{c.full_name || "—"}</div>
                <div className="font-mono text-xs text-muted-foreground">{c.reg_no}</div>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold">
                {c.semina} · {c.student_group || "hana group"}
              </span>
            </div>
          ))}
          {candidateQuery.trim() && candidates.length === 0 && (
            <p className="text-sm text-muted-foreground">Hakuna mwanafunzi anayelingana.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
