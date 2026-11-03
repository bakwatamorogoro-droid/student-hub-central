import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FilePreview } from "@/components/FilePreview";
import { SignaturePad, type SignaturePadHandle } from "@/components/SignaturePad";
import { AssignmentAnnotator, AnnotationTally } from "@/components/AssignmentAnnotator";
import { toast } from "@/lib/toast";
import { confirmAction } from "@/lib/alerts";
import { annotationSummary, type Annotation } from "@/lib/assignmentAnnotations";
import {
  DEFAULT_MARK_MAX,
  allMarksRows,
  formatMark,
  gradeLabel,
  markPercent,
  parseMark,
  type GroupMark,
  type MarkRosterPerson,
} from "@/lib/assignmentMarks";
import {
  exportMarks,
  exportMarksCsv,
  marksRowsForGroup,
  type ExportKind,
} from "@/lib/groupExports";
import { loadMarkRoster } from "@/lib/groupRoster";
import {
  deleteGroupSubmission,
  loadGroupSubmissionRows,
  saveAdminAnswer,
  saveGroupMark,
} from "@/lib/groupAssignmentApi";
import {
  groupSubmissionsInOrder,
  presentersSummary,
  submittedMessage,
  type GroupSubmission,
  type GroupSubmissionRow,
} from "@/lib/groupAssignmentSubmission";
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  Users,
  PenLine,
} from "lucide-react";

export const Route = createFileRoute("/admin/group-assignments")({ component: Page });

function Page() {
  const [rows, setRows] = useState<GroupSubmissionRow[]>([]);
  const [roster, setRoster] = useState<MarkRosterPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<GroupSubmission | null>(null);
  const [exporting, setExporting] = useState<ExportKind | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [subs, people] = await Promise.all([loadGroupSubmissionRows(), loadMarkRoster()]);
      setRows(subs);
      setRoster(people);
    } catch (e) {
      toast.error((e as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Sorted by group name, which is the order the admin reads the work in.
  const submissions = useMemo(() => groupSubmissionsInOrder(rows), [rows]);

  /** Every group that has been marked, keyed the way the roster is keyed. */
  const groupMarks = useMemo<GroupMark[]>(
    () =>
      submissions
        .filter((s) => s.markScore !== null)
        .map((s) => ({
          semina: s.key.semina,
          gender: s.key.gender,
          group: s.key.group,
          score: s.markScore,
          max: s.markMax,
        })),
    [submissions],
  );

  /** The "all groups" sheet: name, reg no, course and mark, and nothing else. */
  const allRows = useMemo(() => allMarksRows(roster, groupMarks), [roster, groupMarks]);

  const markedGroups = submissions.filter((s) => s.markScore !== null).length;

  const doExport = async (kind: ExportKind) => {
    setExporting(kind);
    try {
      await exportMarks(allRows, kind, "Magroup Yote");
      toast.success(`Faili la alama za magroup yote (${kind.toUpperCase()}) limetengenezwa.`);
    } catch (e) {
      toast.error(`Imeshindikana kutengeneza faili: ${(e as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return submissions;
    return submissions.filter(
      (s) =>
        s.label.includes(q) ||
        s.question.toUpperCase().includes(q) ||
        s.presenters.some((p) => p.toUpperCase().includes(q)),
    );
  }, [submissions, query]);

  const answered = submissions.filter((s) => s.answered).length;

  return (
    <div className="container mx-auto max-w-6xl space-y-5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Users className="h-5 w-5 text-primary" /> Kazi za Kufanya — za Group
          </h2>
          <p className="text-sm text-muted-foreground">
            Kazi za kila group kwa mpangilio wa majina. Preview kazi, tumia peni nyekundu ya mfumo,
            weka alama (mfano 7/24), kisha tuma jibu.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <FileText className="h-3.5 w-3.5" /> {submissions.length} kazi
          </Badge>
          <Badge className="gap-1 bg-emerald-600 text-white">
            <CheckCircle2 className="h-3.5 w-3.5" /> {answered} zimejibiwa
          </Badge>
          <Badge className="gap-1 bg-rose-600 text-white">
            <PenLine className="h-3.5 w-3.5" /> {markedGroups} zimepewa alama
          </Badge>
          <Button size="sm" variant="outline" className="gap-1" onClick={() => void load()}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Onyesha upya
          </Button>
        </div>
      </div>

      <Card className="border-2 border-primary/25">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4 text-primary" /> Pakua alama za magroup yote
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Excel, Word au PDF. Magroup yote yanapakuliwa kwa majina, Reg Namba, kozi na alama
            pekee. Wanafunzi {allRows.length} · Magroup yenye alama {markedGroups}.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="font-bold"
            disabled={exporting !== null}
            onClick={() => void doExport("xlsx")}
          >
            {exporting === "xlsx" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Excel
          </Button>
          <Button
            variant="outline"
            className="font-bold"
            disabled={exporting !== null}
            onClick={() => void doExport("docx")}
          >
            {exporting === "docx" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            Word
          </Button>
          <Button
            variant="outline"
            className="font-bold"
            disabled={exporting !== null}
            onClick={() => void doExport("pdf")}
          >
            {exporting === "pdf" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            PDF
          </Button>
          <Button
            variant="ghost"
            className="font-bold"
            disabled={exporting !== null}
            onClick={() => exportMarksCsv(allRows, "Magroup Yote")}
          >
            <Download className="h-4 w-4" /> CSV
          </Button>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tafuta kwa group, swali au jina la mliopresent..."
          className="pl-9"
        />
      </div>

      {loading && submissions.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Inapakia kazi za group...
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {submissions.length === 0
              ? "Hakuna group iliyotuma kazi bado."
              : "Hakuna kazi inayolingana na utafutaji wako."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((s) => (
            <SubmissionCard
              key={s.row.id}
              sub={s}
              roster={roster}
              onOpen={() => setOpen(s)}
              onChanged={() => void load()}
            />
          ))}
        </div>
      )}

      {open && (
        <ReviewDialog
          sub={open}
          others={submissions.filter((s) => s.row.id !== open.row.id)}
          onClose={() => setOpen(null)}
          onChanged={() => {
            setOpen(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function SubmissionCard({
  sub,
  roster,
  onOpen,
  onChanged,
}: {
  sub: GroupSubmission;
  roster: MarkRosterPerson[];
  onOpen: () => void;
  onChanged: () => void;
}) {
  const [exporting, setExporting] = useState<ExportKind | null>(null);

  const remove = async () => {
    const ok = await confirmAction(
      `Futa kazi ya ${sub.label}?`,
      "Haitarudishwa, na group linaweza kutuma tena.",
    );
    if (!ok) return;
    const err = await deleteGroupSubmission(sub.row.id);
    if (err) return toast.error(err.message);
    toast.success("Kazi imefutwa");
    onChanged();
  };

  /** Just this group's students and this group's mark. */
  const exportOne = async (kind: ExportKind) => {
    const mark: GroupMark = {
      semina: sub.key.semina,
      gender: sub.key.gender,
      group: sub.key.group,
      score: sub.markScore,
      max: sub.markMax,
    };
    const rows = marksRowsForGroup(roster, mark);
    if (!rows.length) {
      toast.error("Hakuna wanafunzi waliopatikana kwa group hili.");
      return;
    }
    setExporting(kind);
    try {
      await exportMarks(rows, kind, sub.label);
      toast.success(`Alama za ${sub.label} (${kind.toUpperCase()}) zimetengenezwa.`);
    } catch (e) {
      toast.error(`Imeshindikana kutengeneza faili: ${(e as Error).message}`);
    } finally {
      setExporting(null);
    }
  };

  const percent = markPercent(sub.markScore, sub.markMax);

  return (
    <Card
      className={`overflow-hidden border-2 transition-colors ${
        sub.answered ? "border-emerald-500/40" : "border-primary/25"
      }`}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-start justify-between gap-2 text-base">
          <span className="min-w-0">
            <span className="block truncate font-bold">{sub.label}</span>
            <span className="mt-0.5 flex items-center gap-1 text-[11px] font-normal text-muted-foreground">
              <Clock className="h-3 w-3" /> {submittedMessage(sub.submittedAt)}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end gap-1">
            {sub.answered ? (
              <Badge className="gap-1 bg-emerald-600 text-white">
                <CheckCircle2 className="h-3 w-3" /> Imejibiwa
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" /> Inasubiri
              </Badge>
            )}
            {sub.mark && (
              <Badge className="gap-1 bg-rose-600 font-mono text-white">
                <PenLine className="h-3 w-3" /> {sub.mark}
              </Badge>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Swali lao
          </div>
          <p className="line-clamp-2 text-sm">{sub.question || "—"}</p>
        </div>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Mliopresent
          </div>
          <p className="text-sm">{presentersSummary(sub.presenters)}</p>
        </div>
        {sub.answer && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Jibu lako
            </div>
            <p className="line-clamp-2 text-sm italic">{sub.answer}</p>
          </div>
        )}
        {sub.annotations.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Alama kwenye kazi
              </span>
              <AnnotationTally items={sub.annotations} />
            </div>
            <ul className="mt-1 space-y-0.5">
              {annotationSummary(sub.annotations).map((line) => (
                <li key={line} className="text-[11px] text-muted-foreground">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}
        {sub.mark && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                Alama
              </span>
              <span className="font-mono text-lg font-bold text-rose-700 dark:text-rose-300">
                {sub.mark}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground">{gradeLabel(percent)}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="gap-1 font-bold" onClick={onOpen}>
            <ExternalLink className="h-3.5 w-3.5" /> Preview, Alama & Jibu
          </Button>
          {sub.row.file_url && (
            <Button asChild size="sm" variant="outline" className="gap-1">
              <a href={sub.row.file_url} target="_blank" rel="noreferrer">
                <Download className="h-3.5 w-3.5" /> Pakua
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto gap-1 text-destructive hover:bg-destructive/10"
            onClick={remove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1 border-t border-border pt-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Pakua group hili:
          </span>
          {(["xlsx", "docx", "pdf"] as const).map((kind) => (
            <Button
              key={kind}
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs font-bold"
              disabled={exporting !== null}
              onClick={() => void exportOne(kind)}
            >
              {exporting === kind && <Loader2 className="h-3 w-3 animate-spin" />}
              {kind === "xlsx" ? "Excel" : kind === "docx" ? "Word" : "PDF"}
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ReviewDialog({
  sub,
  others,
  onClose,
  onChanged,
}: {
  sub: GroupSubmission;
  others: GroupSubmission[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [answer, setAnswer] = useState(sub.answer ?? "");
  const [mark, setMark] = useState(sub.mark ?? "");
  const [spread, setSpread] = useState(false);
  const [saving, setSaving] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>(sub.annotations);
  const padRef = useRef<SignaturePadHandle>(null);

  const parsed = useMemo(() => parseMark(mark, DEFAULT_MARK_MAX), [mark]);
  const showMarkError = mark.trim().length > 0 && !parsed.ok;

  const save = async () => {
    if (!answer.trim()) {
      toast.error("Andika jibu kabla ya kutuma.");
      return;
    }
    if (mark.trim() && !parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    setSaving(true);
    const signature = padRef.current?.toDataUrl() ?? null;
    let err: Error | null;
    try {
      err = await saveAdminAnswer({
        row: sub.row,
        answer,
        signature,
        mark: parsed.ok ? parsed.mark : null,
        annotations,
      });
    } catch (e) {
      // A thrown error used to leave the button spinning forever; the admin was
      // left guessing whether the answer had been sent. Say what happened.
      setSaving(false);
      toast.error(
        e instanceof Error && e.message
          ? `Imeshindikana kutuma: ${e.message}`
          : "Imeshindikana kutuma jibu. Angalia intaneti kisha ujaribu tena.",
      );
      return;
    }
    if (err) {
      setSaving(false);
      return toast.error(err.message);
    }

    // "Sambaza" copies only the mark, never the answer or the signature: the
    // other groups have their own work, and copying a written answer onto them
    // would put words in the teacher's mouth.
    let spreadCount = 0;
    if (spread && parsed.ok) {
      for (const other of others) {
        if (other.row.id === sub.row.id) continue;
        try {
          const e = await saveGroupMark(other.row, parsed.mark);
          if (!e) spreadCount += 1;
        } catch {
          // One group failing must not lose the mark already saved on this one.
        }
      }
    }
    setSaving(false);
    const tickNote = annotations.length ? ` · alama ${annotations.length} kwenye kazi` : "";
    toast.success(
      parsed.ok
        ? `Jibu na alama ${formatMark(parsed.mark.score, parsed.mark.max)} zimetumwa` +
            tickNote +
            (spreadCount ? ` · alama zimesambaa kwa magroup ${spreadCount}` : "")
        : `Jibu limetumwa kwa group${tickNote}`,
    );
    onChanged();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" /> {sub.label}
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
              <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Swali lao
              </div>
              <p className="mt-0.5 whitespace-pre-wrap">{sub.question || "—"}</p>
              <div className="mt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Mliopresent
              </div>
              <p className="mt-0.5">{sub.presenters.length ? sub.presenters.join(", ") : "—"}</p>
              <div className="mt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Ilitumwa
              </div>
              <p className="mt-0.5">{submittedMessage(sub.submittedAt)}</p>
            </div>

            {sub.row.file_url ? (
              <AssignmentAnnotator
                src={sub.row.file_url}
                fileName={sub.row.file_name}
                value={annotations}
                onChange={setAnnotations}
              />
            ) : (
              <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                Group hili halikuambatanisha faili.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Alama za kazi hii
              </Label>
              <div className="mt-1.5 flex items-center gap-2">
                <Input
                  value={mark}
                  onChange={(e) => setMark(e.target.value)}
                  placeholder="mfano 7/24"
                  inputMode="decimal"
                  className={`max-w-[10rem] text-lg font-bold ${
                    showMarkError ? "border-destructive text-destructive" : ""
                  }`}
                  aria-label="Alama, mfano 7/24"
                />
                {parsed.ok && (
                  <Badge variant="secondary" className="gap-1 font-mono">
                    {formatMark(parsed.mark.score, parsed.mark.max)}
                  </Badge>
                )}
                {parsed.ok && (
                  <Badge className="gap-1 bg-emerald-600 text-white">
                    {gradeLabel(markPercent(parsed.mark.score, parsed.mark.max))}
                  </Badge>
                )}
              </div>
              {showMarkError ? (
                <p className="mt-1 text-xs font-medium text-destructive">
                  {(parsed as { ok: false; error: string }).error}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Andika kama mwalimu anaandika: 7/24, au 18/20. Ukiacha wazi, hakuna alama.
                </p>
              )}
            </div>

            {others.length > 0 && (
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-rose-600"
                  checked={spread}
                  onChange={(e) => setSpread(e.target.checked)}
                />
                <span className="text-xs">
                  <span className="block font-bold text-rose-700 dark:text-rose-300">
                    Sambaza alama hii kwa magroup mengine yote
                  </span>
                  <span className="text-muted-foreground">
                    Alama pekee inasambaa, si jibu wala sahihi. Magroup {others.length} yatapokea{" "}
                    {parsed.ok ? formatMark(parsed.mark.score, parsed.mark.max) : "alama uliyoweka"}
                    .
                  </span>
                </span>
              </label>
            )}

            <div>
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Jibu lako kwa group
              </Label>
              <Textarea
                rows={6}
                className="mt-1.5"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Andika jibu, maelekezo au alama zenu hapa..."
              />
            </div>

            <SignaturePad ref={padRef} label="Peni ya mfumo — sahihi ya jibu (nyekundu)" />

            <Button className="w-full font-bold" disabled={saving} onClick={save}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {saving ? "Inatuma..." : "Tuma Jibu na Alama"}
            </Button>

            {sub.answered && (
              <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Jibu la awali lilikuwa: {sub.answer}
                {sub.mark ? ` · Alama: ${sub.mark}` : ""}
              </p>
            )}
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <PenLine className="h-3 w-3" /> Sahihi na alama zinaonekana kwa group pamoja na jibu
              lako.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
