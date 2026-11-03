import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2, ExternalLink, AlertCircle } from "lucide-react";
import { previewKindFor } from "@/lib/groupAssignmentSubmission";
import { sanitizeDocumentHtml } from "@/lib/documentText";
import { PdfDocumentView, ZoomControls } from "@/components/PdfPageView";

/**
 * Shows an uploaded PDF or Word file.
 *
 * Both kinds are drawn by this app rather than handed to the browser, because
 * the browser's own handling is what the owner could not rely on. A PDF in an
 * `<iframe>` is only "previewed" if the browser happens to have a built-in
 * viewer, and a phone's WebView usually does not: the frame stays blank, no
 * error fires, and the admin sees nothing with no way to tell why. `PdfPageView`
 * renders the pages to a canvas with `pdfjs-dist` instead, so the document
 * appears on every device the app itself supports.
 *
 * A Word file cannot be rendered by a browser at all, so `mammoth` turns it into
 * HTML in the browser and `sanitizeDocumentHtml` strips anything executable
 * before it is shown. The download stays as a secondary action for when the
 * original formatting matters.
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
  const kind = previewKindFor(fileName, src);

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

  return <PdfPreview src={src} fileName={fileName} height={height} onLoaded={onLoaded} />;
}

/**
 * A PDF drawn by this app, with the file name and an open-in-new-tab link.
 *
 * The scrollable all-pages view is the reading view an admin grading work
 * wants. `onLoaded` is routed through a ref so the callback identity stays
 * stable — the viewer reopens the document when that prop changes, and an
 * inline arrow from a parent would reopen it on every render.
 */
function PdfPreview({
  src,
  fileName,
  height,
  onLoaded,
}: {
  src: string;
  fileName?: string | null;
  height: number;
  onLoaded?: () => void;
}) {
  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;
  const handleLoaded = useCallback(() => loadedRef.current?.(), []);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <span className="inline-flex items-center gap-1 truncate text-[11px] font-semibold text-muted-foreground">
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
      <div className="p-2">
        <PdfDocumentView src={src} onLoaded={handleLoaded} height={height} />
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
  // Word text is laid out by the browser, so zoom is a font-size multiplier
  // rather than a canvas scale. The range is wider than the PDF's because text
  // stays sharp at any size.
  const [scale, setScale] = useState(1);

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
        <>
          <div className="flex items-center justify-end border-b border-border bg-muted/20 px-2 py-1">
            <ZoomControls scale={scale} setScale={setScale} min={0.7} max={2.5} step={0.1} />
          </div>
          <div
            className="word-preview overflow-auto px-4 py-3 leading-relaxed"
            style={{ maxHeight: height, fontSize: `${scale}rem` }}
            // The HTML comes from the uploaded document and is stripped of
            // scripts, handlers and links by `sanitizeDocumentHtml` first.
            dangerouslySetInnerHTML={{ __html: html ?? "" }}
          />
        </>
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
