import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2, ExternalLink } from "lucide-react";
import { previewKindFor } from "@/lib/groupAssignmentSubmission";

/**
 * Shows an uploaded PDF or Word file.
 *
 * A PDF renders inline in the browser's own viewer, which is the "preview" the
 * owner asked for and costs no dependency. A Word file cannot be rendered by a
 * browser, so it is offered as a download with a note saying so, rather than an
 * iframe that shows nothing.
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
    return (
      <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4 text-sm">
        <div className="flex items-center gap-2 font-bold">
          <FileText className="h-4 w-4 text-primary" /> {fileName || "Faili la Word"}
        </div>
        <p className="text-xs text-muted-foreground">
          Faili la Word haliwezi kuonyeshwa moja kwa moja hapa. Lipakue kuona maudhui yake.
        </p>
        <Button asChild size="sm" variant="outline" className="gap-1">
          <a href={src} download={fileName ?? undefined} target="_blank" rel="noreferrer">
            <Download className="h-3.5 w-3.5" /> Pakua faili
          </a>
        </Button>
      </div>
    );
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

/** Spinner shown while a blob URL is being prepared. */
export function PreviewLoading() {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Inaandaa preview...
    </div>
  );
}
