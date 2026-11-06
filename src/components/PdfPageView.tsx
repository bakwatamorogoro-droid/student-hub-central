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
  /** Grow to the page's full height instead of scrolling inside a fixed box. */
  expand?: boolean;
};

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>;
    cancel: () => void;
  };
};

/**
 * Opens a PDF once per `src` and reports its page count.
 *
 * Both viewers below need the same three things — the worker, the document and
 * the failure message — so they share this instead of each importing pdfjs. The
 * `onLoaded` callback is held in a ref so a parent's inline arrow does not
 * reopen the document on every render.
 */
function usePdfDocument(src: string, onLoaded?: (pages: number) => void) {
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [pages, setPages] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    setPages(0);
    setDoc(null);

    (async () => {
      try {
        // The legacy build, not the default one, because the default targets
        // modern engines: it calls `Promise.withResolvers` (Chrome 119 /
        // Safari 17.4) and dies with "Promise.withResolvers is not a function"
        // on the older phones this app is used on. The legacy build carries its
        // own polyfills and draws the same PDF.
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        // The worker is what keeps a 40-page document from freezing the tab. It
        // needs the legacy build too — it is a separate module and would
        // otherwise hit the same missing method.
        const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const opened = (await pdfjs.getDocument({ url: src }).promise) as unknown as PdfDoc;
        if (cancelled) return;
        setDoc(opened);
        setPages(opened.numPages);
        loadedRef.current?.(opened.numPages);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || "Imeshindikana kufungua PDF.");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src]);

  return { doc, pages, busy, error };
}

/** The zoom control both viewers show. */
export function ZoomControls({
  scale,
  setScale,
  min = 0.6,
  max = 3,
  step = 0.2,
}: {
  scale: number;
  setScale: (s: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2"
        onClick={() => setScale(Math.max(min, Number((scale - step).toFixed(2))))}
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
        onClick={() => setScale(Math.min(max, Number((scale + step).toFixed(2))))}
        aria-label="Kuza"
      >
        <ZoomIn className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** The shared "could not open" panel. */
function PdfError({ error, src }: { error: string; src: string }) {
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

/**
 * Every page of a PDF, stacked and scrollable.
 *
 * This is the reading view: an admin opening a student's work wants to read it
 * top to bottom, not press "Mbele" through it. Each page is drawn to its own
 * canvas by `pdfjs-dist`, so the words are the app's own render rather than
 * whatever the browser's built-in viewer decides to do — which is the whole
 * point, since a browser without one shows an empty frame and no error.
 */
export function PdfDocumentView({
  src,
  onLoaded,
  height = 460,
  expand = false,
}: {
  src: string;
  onLoaded?: (pages: number) => void;
  height?: number;
  /**
   * Grow to the full document instead of scrolling inside a fixed box.
   *
   * Inside a dialog that already scrolls, a second scroller here is a trap: the
   * wheel is captured by the inner box, which hits its own end while the reader
   * is still only halfway down the page. `expand` removes the box so the
   * dialog's body is the one and only scroll region.
   */
  expand?: boolean;
}) {
  const { doc, pages, busy, error } = usePdfDocument(src, onLoaded);
  const [scale, setScale] = useState(1.1);

  if (error) return <PdfError error={error} src={src} />;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-muted-foreground">
          {pages ? `Kurasa ${pages}` : "Inafungua..."}
        </span>
        <ZoomControls scale={scale} setScale={setScale} />
      </div>
      <div
        className={`relative rounded-xl border border-border bg-muted/30 p-2 ${
          expand ? "" : "overflow-auto"
        }`}
        style={expand ? undefined : { maxHeight: height }}
      >
        <div className="mx-auto w-fit space-y-2">
          {doc &&
            Array.from({ length: pages }, (_, i) => (
              <PdfCanvas key={i + 1} doc={doc} page={i + 1} scale={scale} />
            ))}
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

/** One page drawn to its own canvas, and only once it is near the viewport. */
function PdfCanvas({ doc, page, scale }: { doc: PdfDoc; page: number; scale: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [near, setNear] = useState(false);

  // Ask the page for its box without drawing it. This is metadata only, so it
  // is cheap, and it lets the stack reserve the right space before the pixels
  // exist — otherwise every page below the fold would collapse to zero height
  // and the scrollbar would jump as each one rendered.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await doc.getPage(page);
        if (cancelled) return;
        const viewport = p.getViewport({ scale });
        setSize({ width: viewport.width, height: viewport.height });
      } catch {
        // The render effect below reports the failure; sizing is best-effort.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, page, scale]);

  // A 40-page document drawn eagerly is ~390 MB of canvas on a phone, so a page
  // is only painted once it comes near the visible area. The margin means it is
  // already drawn by the time it scrolls into view.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size || !near) return;
    let cancelled = false;
    let task: { promise: Promise<void>; cancel: () => void } | null = null;

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
        task = p.render({ canvasContext: ctx, viewport });
        await task.promise;
      } catch {
        // A cancelled render is the normal path when zoom changes quickly.
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, scale, size, near]);

  return (
    <div
      ref={wrapRef}
      className="relative rounded bg-white shadow"
      style={size ? { width: size.width, height: size.height } : undefined}
    >
      <canvas ref={canvasRef} className="block rounded" />
      {!size && (
        <div className="flex h-40 w-[min(70vw,34rem)] items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

export function PdfPageView({
  src,
  page,
  onPageChange,
  onPageClick,
  onLoaded,
  overlay,
  height = 460,
  expand = false,
}: PdfPageViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const taskRef = useRef<{ cancel: () => void } | null>(null);
  const { doc, pages, busy: opening, error } = usePdfDocument(src, onLoaded);
  const [scale, setScale] = useState(1.2);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  // Draw the current page whenever the page or the zoom changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!doc || !canvas || page < 1 || page > doc.numPages) return;

    let cancelled = false;
    setRendering(true);
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
        setRenderError(null);
      } catch (e) {
        // A cancelled render is the normal path when the page changes quickly.
        if (!cancelled && (e as { name?: string })?.name !== "RenderingCancelledException") {
          setRenderError((e as Error).message || "Imeshindikana kuonyesha ukurasa.");
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [doc, page, scale]);

  const click = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onPageClick) return;
      const box = e.currentTarget.getBoundingClientRect();
      if (!box.width || !box.height) return;
      onPageClick((e.clientX - box.left) / box.width, (e.clientY - box.top) / box.height);
    },
    [onPageClick],
  );

  const failure = error ?? renderError;
  if (failure) return <PdfError error={failure} src={src} />;

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
        <ZoomControls scale={scale} setScale={setScale} />
      </div>

      <div
        className={`relative rounded-xl border border-border bg-muted/30 p-2 ${
          expand ? "" : "overflow-auto"
        }`}
        style={expand ? undefined : { maxHeight: height }}
      >
        <div
          className={`relative mx-auto w-fit ${onPageClick ? "cursor-crosshair" : ""}`}
          onClick={click}
        >
          <canvas ref={canvasRef} className="block rounded bg-white shadow" />
          {overlay?.(page)}
        </div>
        {(opening || rendering) && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/40">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        )}
      </div>
    </div>
  );
}
