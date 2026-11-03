import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2, ExternalLink, AlertCircle } from "lucide-react";
import { previewKindFor } from "@/lib/groupAssignmentSubmission";
import { sanitizeDocumentHtml } from "@/lib/documentText";

/**
 * Shows an uploaded PDF or Word file.
 *
 * A PDF renders inline in the browser's own viewer, which is the "preview" the
 * owner asked for and costs no dependency.
 *
 * A Word file used to be offered only as a download, which meant the admin had
 * to leave the page and open it elsewhere to read a single sentence. `mammoth`
 * turns the document into HTML in the browser instead, so the work is read on
 * the same screen, with every word legible. The download stays as a secondary
 * action for when the formatting itself matters.
 *
 * `src` may be a blob URL (a file the student has not uploaded yet) or a public
 * storage URL (the admin reading a submitted file).
 */
export function FilePreview({
  src,
  fileName,
  height = 420,
  onLoaded,
}: {
  src: string;
  fileName?: string | null;
  height?: number;
  /** Fires once the PDF has actually rendered, so a preview gate can trust it. */
  onLoaded?: () => void;
}) {
  const kind = previewKindFor(fileName);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (kind === "word") {
    return <WordPreview src={src} fileName={fileName} height={height} />;
  }

  if (kind === "other") {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
        Haiwezi kuonyeshwa hapa.{" "}
        <a href={src} target="_blank" rel="noreferrer" className="text-primary underline">
          Fungua faili
        </a>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <p className="text-xs text-muted-foreground">
          Browser hii haiwezi kuonyesha PDF hapa. Unaweza kuifungua kwenye tab mpya.
        </p>
        <Button asChild size="sm" variant="outline" className="gap-1">
          <a href={src} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" /> Fungua PDF
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-muted/20">
      <iframe
        src={src}
        title={fileName || "Preview"}
        className="w-full"
        style={{ height }}
        onLoad={() => onLoaded?.()}
        onError={() => setFailed(true)}
      />
      <div className="flex items-center justify-between gap-2 border-t border-border bg-card/70 px-3 py-1.5">
        <span className="inline-flex items-center gap-1 truncate text-[11px] text-muted-foreground">
          <FileText className="h-3 w-3 shrink-0" /> {fileName || "PDF"}
        </span>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 text-[11px] text-primary underline"
        >
          <ExternalLink className="h-3 w-3" /> Fungua
        </a>
      </div>
    </div>
  );
}

/**
 * A Word document read on the page, without a download.
 *
 * `mammoth` reads the `.docx` bytes and returns the words as HTML; the result is
 * sanitised and laid out in a readable column, so every word is on screen. The
 * file is fetched once per `src`, and a document that will not open falls back
 * to the download rather than an empty box.
 */
function WordPreview({
  src,
  fileName,
  height,
}: {
  src: string;
  fileName?: string | null;
  height: number;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setBusy(true);
    setHtml(null);
    setError(null);
    (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        const mammoth = await import("mammoth");
        const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
        if (!live) return;
        const clean = sanitizeDocumentHtml(result.value);
        if (!clean.trim()) throw new Error("empty");
        setHtml(clean);
      } catch {
        if (live) setError("Word hili halikuweza kusomwa hapa.");
      } finally {
        if (live) setBusy(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [src]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <span className="inline-flex items-center gap-1 truncate text-[11px] font-semibold text-muted-foreground">
          <FileText className="h-3 w-3 shrink-0" /> {fileName || "Faili la Word"}
        </span>
        <a
          href={src}
          download={fileName ?? undefined}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] text-primary underline"
        >
          <Download className="h-3 w-3" /> Pakua
        </a>
      </div>

      {busy ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Inasoma maandishi ya Word...
        </div>
      ) : error ? (
        <div className="space-y-2 p-4">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </p>
          <Button asChild size="sm" variant="outline" className="gap-1">
            <a href={src} download={fileName ?? undefined}>
              <Download className="h-3.5 w-3.5" /> Pakua faili
            </a>
          </Button>
        </div>
      ) : (
        <div
          className="word-preview overflow-auto px-4 py-3 text-sm leading-relaxed"
          style={{ maxHeight: height }}
          // The HTML comes from the uploaded document and is stripped of
          // scripts, handlers and links by `sanitizeDocumentHtml` first.
          dangerouslySetInnerHTML={{ __html: html ?? "" }}
        />
      )}
    </div>
  );
}

/** Spinner shown while a blob URL is being prepared. */
export function PreviewLoading() {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Inaandaa preview...
    </div>
  );
}
