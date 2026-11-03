import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileWarning, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A PDF shown page by page, so a tick can be placed on the page it belongs to.
 *
 * The browser's own `<iframe>` viewer cannot report which page is on screen or
 * where a click landed inside the document, so marks could only ever be
 * document-wide. `pdfjs-dist` draws each page to a canvas instead, which gives
 * the page number and a point we can turn into a fraction of the page.
 *
 * `onPageClick` receives fractions of the page (0..1), not pixels, so a mark
 * lands on the same word on the admin's screen and the student's phone.
 */

export type PdfPageViewProps = {
  src: string;
  /** 1-based page to show. */
  page: number;
  onPageChange?: (page: number) => void;
  /** Fired with fractions of the page when the admin clicks the page. */
  onPageClick?: (x: number, y: number) => void;
  /** Called once the document is open, with its real page count. */
  onLoaded?: (pages: number) => void;
  /** Drawn over the page, positioned with the same fractions. */
  overlay?: (page: number) => React.ReactNode;
  height?: number;
};

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>;
    cancel: () => void;
  };
};

export function PdfPageView({
  src,
  page,
  onPageChange,
  onPageClick,
  onLoaded,
  overlay,
  height = 460,
}: PdfPageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PdfDoc | null>(null);
  const taskRef = useRef<{ cancel: () => void } | null>(null);
  const [pages, setPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Open the document once per src.
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    setPages(0);
    docRef.current = null;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        // The worker is what keeps a 40-page document from freezing the tab.
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const doc = (await pdfjs.getDocument({ url: src }).promise) as unknown as PdfDoc;
        if (cancelled) return;
        docRef.current = doc;
        setPages(doc.numPages);
        onLoaded?.(doc.numPages);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || "Imeshindikana kufungua PDF.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
      taskRef.current?.cancel();
    };
  }, [src, onLoaded]);

  // Draw the current page whenever the page or the zoom changes.
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || page < 1 || page > doc.numPages) return;

    let cancelled = false;
    setBusy(true);
    (async () => {
      try {
        const p = await doc.getPage(page);
        if (cancelled) return;
        const viewport = p.getViewport({ scale });
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        // A device-pixel-ratio-aware backing store keeps the text sharp on a
        // retina phone; the CSS size stays the layout size.
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        taskRef.current?.cancel();
        const task = p.render({ canvasContext: ctx, viewport });
        taskRef.current = task;
        await task.promise;
      } catch (e) {
        // A cancelled render is the normal path when the page changes quickly.
        if (!cancelled && (e as { name?: string })?.name !== "RenderingCancelledException") {
          setError((e as Error).message || "Imeshindikana kuonyesha ukurasa.");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [page, scale, pages]);

  const click = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onPageClick) return;
      const box = e.currentTarget.getBoundingClientRect();
      if (!box.width || !box.height) return;
      onPageClick((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
    },
    [onPageClick],
  );

  if (error) {
    return (
      <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <div className="flex items-center gap-2 font-bold text-amber-700 dark:text-amber-300">
          <FileWarning className="h-4 w-4" /> PDF haikufunguka hapa
        </div>
        <p className="text-xs text-muted-foreground">{error}</p>
        <Button asChild size="sm" variant="outline">
          <a href={src} target="_blank" rel="noreferrer">
            Fungua PDF kwenye tab mpya
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            disabled={page <= 1}
            onClick={() => onPageChange?.(page - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Nyuma
          </Button>
          <span className="min-w-[7rem] text-center text-xs font-bold">
            Ukurasa {page}
            {pages ? ` / ${pages}` : ""}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-xs"
            disabled={!pages || page >= pages}
            onClick={() => onPageChange?.(page + 1)}
          >
            Mbele <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => setScale((s) => Math.max(0.6, Number((s - 0.2).toFixed(1))))}
            aria-label="Punguza"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[11px] text-muted-foreground">{Math.round(scale * 100)}%</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => setScale((s) => Math.min(3, Number((s + 0.2).toFixed(1))))}
            aria-label="Kuza"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div
        className="relative overflow-auto rounded-xl border border-border bg-muted/30 p-2"
        style={{ maxHeight: height }}
      >
        <div
          className={`relative mx-auto w-fit ${onPageClick ? "cursor-crosshair" : ""}`}
          onClick={click}
        >
          <canvas ref={canvasRef} className="block rounded bg-white shadow" />
          {overlay?.(page)}
        </div>
        {busy && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}
