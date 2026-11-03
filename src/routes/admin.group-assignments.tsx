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
import { toast } from "@/lib/toast";
import { confirmAction } from "@/lib/alerts";
import {
  deleteGroupSubmission,
  loadGroupSubmissionRows,
  saveAdminAnswer,
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
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<GroupSubmission | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await loadGroupSubmissionRows());
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
            Kazi za kila group kwa mpangilio wa majina. Preview kazi, tumia peni ya mfumo, kisha
            tuma jibu.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <FileText className="h-3.5 w-3.5" /> {submissions.length} kazi
          </Badge>
          <Badge className="gap-1 bg-emerald-600 text-white">
            <CheckCircle2 className="h-3.5 w-3.5" /> {answered} zimejibiwa
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
              onOpen={() => setOpen(s)}
              onChanged={() => void load()}
            />
          ))}
        </div>
      )}

      {open && (
        <ReviewDialog
          sub={open}
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
  onOpen,
  onChanged,
}: {
  sub: GroupSubmission;
  onOpen: () => void;
  onChanged: () => void;
}) {
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
          {sub.answered ? (
            <Badge className="shrink-0 gap-1 bg-emerald-600 text-white">
              <CheckCircle2 className="h-3 w-3" /> Imejibiwa
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 gap-1">
              <Clock className="h-3 w-3" /> Inasubiri
            </Badge>
          )}
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
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="gap-1 font-bold" onClick={onOpen}>
            <ExternalLink className="h-3.5 w-3.5" /> Preview & Jibu
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
      </CardContent>
    </Card>
  );
}

function ReviewDialog({
  sub,
  onClose,
  onChanged,
}: {
  sub: GroupSubmission;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [answer, setAnswer] = useState(sub.answer ?? "");
  const [saving, setSaving] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);

  const save = async () => {
    if (!answer.trim()) {
      toast.error("Andika jibu kabla ya kutuma.");
      return;
    }
    setSaving(true);
    const signature = padRef.current?.toDataUrl() ?? null;
    const err = await saveAdminAnswer({ row: sub.row, answer, signature });
    setSaving(false);
    if (err) return toast.error(err.message);
    toast.success("Jibu limetumwa kwa group");
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
              <FilePreview src={sub.row.file_url} fileName={sub.row.file_name} height={460} />
            ) : (
              <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                Group hili halikuambatanisha faili.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Jibu lako kwa group
              </Label>
              <Textarea
                rows={7}
                className="mt-1.5"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Andika jibu, maelekezo au alama zenu hapa..."
              />
            </div>

            <SignaturePad ref={padRef} label="Peni ya mfumo — sahihi ya jibu" />

            <Button className="w-full font-bold" disabled={saving} onClick={save}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              {saving ? "Inatuma..." : "Tuma Jibu"}
            </Button>

            {sub.answered && (
              <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" /> Jibu la awali lilikuwa: {sub.answer}
              </p>
            )}
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <PenLine className="h-3 w-3" /> Sahihi inaonekana kwa group pamoja na jibu lako.
            </p>
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Sparkles className="h-3 w-3" /> Group litaona jibu mara moja.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
