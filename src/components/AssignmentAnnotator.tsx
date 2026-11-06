import { useCallback, useMemo, useState } from "react";
import { Check, PencilLine, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PdfPageView } from "@/components/PdfPageView";
import { FilePreview } from "@/components/FilePreview";
import {
  ANNOTATION_META,
  annotationCounts,
  annotationsForPage,
  makeAnnotation,
  type Annotation,
  type AnnotationKind,
} from "@/lib/assignmentAnnotations";

/**
 * The teacher's pen over a group's own work.
 *
 * Pick a tool, click the page, and the mark sticks to that page: a tick for good
 * work, a note for guidance, an error for a mistake. The mark is stored as a
 * fraction of the page, so the group sees it on the same word on a phone.
 *
 * A Word file has no pages to click, so it is offered as a download and its
 * marks are attached to the whole document (page 0) instead.
 */

const TOOLS: AnnotationKind[] = ["tick", "note", "error"];

const TONE: Record<AnnotationKind, { ring: string; bg: string; text: string }> = {
  tick: { ring: "border-emerald-600", bg: "bg-emerald-600", text: "text-emerald-700" },
  note: { ring: "border-sky-600", bg: "bg-sky-600", text: "text-sky-700" },
  error: { ring: "border-rose-600", bg: "bg-rose-600", text: "text-rose-700" },
};

export function AssignmentAnnotator({
  src,
  fileName,
  value,
  onChange,
  expand = false,
}: {
  src: string;
  fileName?: string | null;
  value: Annotation[];
  onChange: (next: Annotation[]) => void;
  /**
   * Let the work take its full height instead of scrolling in its own box.
   *
   * The admin's review dialog is already a scroll region. Without this, the
   * document's own scroller swallows the wheel and stops at its end while the
   * reader is still partway down the page.
   */
  expand?: boolean;
}) {
  const [kind, setKind] = useState<AnnotationKind>("tick");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState("");
  const [pages, setPages] = useState(0);

  const isWord = !/\.pdf$/i.test(String(fileName ?? ""));
  const counts = useMemo(() => annotationCounts(value), [value]);
  const onPage = useMemo(() => annotationsForPage(value, isWord ? 0 : page), [value, page, isWord]);

  const onLoaded = useCallback((n: number) => setPages(n), []);

  const place = useCallback(
    (x: number, y: number) => {
      const made = makeAnnotation({ page: isWord ? 0 : page, kind, x, y, text: draft });
      if (!made) return;
      onChange([...value, made]);
      setDraft("");
    },
    [kind, page, draft, value, onChange, isWord],
  );

  /** A Word file cannot be clicked, so the words are attached to the document. */
  const attachToDocument = () => {
    const made = makeAnnotation({ page: 0, kind, x: 0.05, y: 0.05, text: draft });
    if (!made) return;
    onChange([...value, made]);
    setDraft("");
  };

  const remove = (id: string) => onChange(value.filter((a) => a.id !== id));

  const needsWords = kind !== "tick";
  const canPlace = !needsWords || draft.trim().length > 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-muted/30 p-2">
        {TOOLS.map((k) => {
          const meta = ANNOTATION_META[k];
          const active = kind === k;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
                active
                  ? `${TONE[k].bg} border-transparent text-white`
                  : "border-border bg-card text-foreground hover:bg-muted"
              }`}
            >
              <span className="text-sm leading-none">{meta.glyph}</span>
              {meta.label}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {counts.tick} ✓ · {counts.note} ✎ · {counts.error} ✕
        </span>
      </div>

      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={
          needsWords
            ? kind === "note"
              ? "Maelezo ya mwalimu, kisha bofya ukurasa..."
              : "Kosa lililopo, kisha bofya ukurasa..."
            : "Maelezo ya ziada (si lazima) — bofya ukurasa kuweka tick"
        }
        aria-label="Maelezo ya alama"
      />
      {!canPlace && (
        <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
          {ANNOTATION_META[kind].hint}: andika maneno kwanza kwa sababu alama hii inahitaji maelezo.
        </p>
      )}

      {isWord ? (
        <>
          <FilePreview src={src} fileName={fileName} expand={expand} />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full gap-1.5"
            disabled={!canPlace}
            onClick={attachToDocument}
          >
            <PencilLine className="h-3.5 w-3.5" /> Weka alama kwenye kazi yote
          </Button>
        </>
      ) : (
        <PdfPageView
          src={src}
          page={page}
          onPageChange={setPage}
          onPageClick={canPlace ? place : undefined}
          onLoaded={onLoaded}
          expand={expand}
          overlay={(p) => (
            <AnnotationLayer
              items={annotationsForPage(value, p)}
              onRemove={remove}
              interactive={onPage.length > 0}
            />
          )}
        />
      )}

      {value.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-border bg-card p-2">
          {value.map((a) => {
            const meta = ANNOTATION_META[a.kind];
            return (
              <li key={a.id} className="flex items-start gap-2 text-xs">
                <span className={`font-bold ${TONE[a.kind].text}`}>{meta.glyph}</span>
                <span className="font-semibold">
                  {a.page === 0 ? "Kazi yote" : `Ukurasa ${a.page}`}
                </span>
                <span className="flex-1 text-muted-foreground">{a.text || meta.label}</span>
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Ondoa alama"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {!isWord && pages === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Bofya ukurasa kuweka alama. Tumia Nyuma/Mbele kubadilisha ukurasa.
        </p>
      )}
    </div>
  );
}

/** Draws the marks on top of the rendered page, at their page fractions. */
function AnnotationLayer({
  items,
  onRemove,
  interactive,
}: {
  items: Annotation[];
  onRemove: (id: string) => void;
  interactive: boolean;
}) {
  if (!items.length) return null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {items.map((a) => {
        const meta = ANNOTATION_META[a.kind];
        const tone = TONE[a.kind];
        return (
          <div
            key={a.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
          >
            <div
              className={`flex max-w-[14rem] items-start gap-1 rounded-lg border-2 bg-white/95 px-1.5 py-1 shadow-md ${tone.ring}`}
            >
              <span className={`text-sm font-black leading-none ${tone.text}`}>{meta.glyph}</span>
              {a.text && <span className="text-[11px] leading-tight text-slate-900">{a.text}</span>}
              {interactive && (
                <button
                  type="button"
                  onClick={() => onRemove(a.id)}
                  className="pointer-events-auto text-slate-400 hover:text-destructive"
                  aria-label="Ondoa alama"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A read-only list of the teacher's marks, for the group's own screen. */
export function AnnotationList({ items }: { items: Annotation[] }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1">
      {items.map((a) => {
        const meta = ANNOTATION_META[a.kind];
        return (
          <li key={a.id} className="flex items-start gap-2 text-xs">
            <span className={`font-black ${TONE[a.kind].text}`}>{meta.glyph}</span>
            <span className="font-semibold text-muted-foreground">
              {a.page === 0 ? "Kazi yote" : `Ukurasa ${a.page}`}
            </span>
            <span>{a.text || meta.label}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Small badge row: "2 ✓ · 1 ✎ · 0 ✕", separated so the counts never run together. */
export function AnnotationTally({ items }: { items: Annotation[] }) {
  const c = annotationCounts(items);
  if (!c.total) return null;
  const parts = [
    { key: "tick", n: c.tick, Icon: Check, tone: "text-emerald-700 dark:text-emerald-300" },
    { key: "note", n: c.note, Icon: PencilLine, tone: "text-sky-700 dark:text-sky-300" },
    { key: "error", n: c.error, Icon: X, tone: "text-rose-700 dark:text-rose-300" },
  ];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
      {parts.map(({ key, n, Icon, tone }, i) => (
        <span key={key} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-muted-foreground/50">·</span>}
          <span className={`inline-flex items-center gap-0.5 ${tone}`}>
            <Icon className="h-3 w-3" />
            {n}
          </span>
        </span>
      ))}
    </span>
  );
}
