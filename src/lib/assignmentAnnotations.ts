/**
 * The teacher's marks on a group's own work: a tick, a note, or an error, placed
 * on the page it belongs to.
 *
 * The admin reads a group's PDF in the browser, so the marks have to survive as
 * plain data — `{page, kind, text, x, y}` — and be re-drawn on the page for the
 * group. Everything in this file is pure and import-free so `node --test` can
 * pin the rules: where a mark is allowed to sit, what an empty one means, and
 * how a mark is described to the group.
 *
 * `x`/`y` are fractions of the page (0..1), not pixels. The admin's screen and
 * the group's phone are different sizes and the PDF is zoomed differently on
 * each, so a pixel would land in the wrong place; a fraction lands on the same
 * word.
 */

export const ANNOTATION_KINDS = ["tick", "note", "error"] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

/** The mark shown on the page, and what it is called in Swahili. */
export const ANNOTATION_META: Record<
  AnnotationKind,
  { label: string; hint: string; glyph: string; tone: "ok" | "info" | "bad" }
> = {
  tick: { label: "Sahihi", hint: "Kazi nzuri — weka tick", glyph: "✓", tone: "ok" },
  note: { label: "Maelezo", hint: "Andika maelezo ya mwalimu", glyph: "✎", tone: "info" },
  error: { label: "Kosa", hint: "Onyesha kosa lililopo", glyph: "✕", tone: "bad" },
};

export type Annotation = {
  id: string;
  /** 1-based page of the PDF. 0 means "the whole document", used for Word files. */
  page: number;
  kind: AnnotationKind;
  /** The teacher's words. A tick may have none. */
  text: string;
  /** Fractions of the page, 0..1. A mark with no spot sits at the top-left. */
  x: number;
  y: number;
};

export type NewAnnotation = {
  page: number;
  kind: AnnotationKind;
  x: number;
  y: number;
  text?: string;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));

export function isAnnotationKind(value: unknown): value is AnnotationKind {
  return typeof value === "string" && (ANNOTATION_KINDS as readonly string[]).includes(value);
}

/**
 * Makes a mark from a click.
 *
 * The page is forced to a whole number of at least 0 and the point is clamped
 * into the page, because a click that lands a hair outside the page (on the
 * border, or during a zoom) would otherwise store a mark the group can never
 * see. A note or an error with no words is refused — an empty ✕ tells the
 * student nothing.
 */
export function makeAnnotation(input: NewAnnotation): Annotation | null {
  if (!isAnnotationKind(input.kind)) return null;
  const text = String(input.text ?? "").trim();
  if (input.kind !== "tick" && !text) return null;
  return {
    id: newId(),
    page: Math.max(0, Math.floor(Number(input.page) || 0)),
    kind: input.kind,
    text,
    x: clamp01(input.x),
    y: clamp01(input.y),
  };
}

/**
 * `crypto.randomUUID` needs a secure context and throws over plain HTTP, which
 * is exactly how a phone on the campus LAN reaches the dev server. Falling back
 * to a counter keeps the annotator usable there; the id is only used to key a
 * React list, so a local counter is enough.
 */
let fallbackCounter = 0;
function newId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* insecure context — fall through to the counter */
  }
  fallbackCounter += 1;
  return `ann-${Date.now().toString(36)}-${fallbackCounter}`;
}

/** Reads marks back from stored JSON, dropping anything that is not a mark. */
export function parseAnnotations(raw: unknown): Annotation[] {
  if (!Array.isArray(raw)) return [];
  const out: Annotation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (!isAnnotationKind(r.kind)) continue;
    const text = String(r.text ?? "").trim();
    if (r.kind !== "tick" && !text) continue;
    out.push({
      id: typeof r.id === "string" && r.id ? r.id : newId(),
      page: Math.max(0, Math.floor(Number(r.page) || 0)),
      kind: r.kind,
      text,
      x: clamp01(Number(r.x)),
      y: clamp01(Number(r.y)),
    });
  }
  return out;
}

/** Only the fields worth storing, so a stored mark never carries a stray key. */
export function serializeAnnotations(list: Annotation[]): Array<Record<string, unknown>> {
  return list.map((a) => ({
    id: a.id,
    page: a.page,
    kind: a.kind,
    text: a.text,
    x: Number(a.x.toFixed(4)),
    y: Number(a.y.toFixed(4)),
  }));
}

/** Marks on one page, in the order they were placed. */
export function annotationsForPage(list: Annotation[], page: number): Annotation[] {
  return list.filter((a) => a.page === page);
}

/** Marks grouped by page, page 0 (the whole document) last. */
export function annotationsByPage(
  list: Annotation[],
): Array<{ page: number; items: Annotation[] }> {
  const pages = new Map<number, Annotation[]>();
  for (const a of list) {
    const bucket = pages.get(a.page);
    if (bucket) bucket.push(a);
    else pages.set(a.page, [a]);
  }
  return [...pages.entries()]
    .sort((a, b) => (a[0] === 0 ? 1 : b[0] === 0 ? -1 : a[0] - b[0]))
    .map(([page, items]) => ({ page, items }));
}

/** How many of each kind, for the summary the admin and the group both read. */
export function annotationCounts(list: Annotation[]) {
  return {
    tick: list.filter((a) => a.kind === "tick").length,
    note: list.filter((a) => a.kind === "note").length,
    error: list.filter((a) => a.kind === "error").length,
    total: list.length,
  };
}

/**
 * The teacher's marks as text, for the Word/PDF export and for the group's
 * screen: a tick is just "✓ page 2", a note carries the words.
 */
export function annotationSummary(list: Annotation[]): string[] {
  return annotationsByPage(list).map(({ page, items }) => {
    const where = page === 0 ? "Kazi yote" : `Ukurasa ${page}`;
    const parts = items.map((a) => {
      const meta = ANNOTATION_META[a.kind];
      return a.text ? `${meta.glyph} ${a.text}` : meta.glyph;
    });
    return `${where}: ${parts.join(" · ")}`;
  });
}

/**
 * The words the owner wanted attached to a page, ready for a prompt or a file.
 * A page with no words is left out; a page with only ticks says so.
 */
export function annotationTextForPage(list: Annotation[], page: number): string {
  const items = annotationsForPage(list, page);
  if (!items.length) return "";
  return items
    .map((a) => {
      const meta = ANNOTATION_META[a.kind];
      return a.text ? `${meta.label}: ${a.text}` : meta.label;
    })
    .join("; ");
}

/**
 * The page to open first: the earliest page that carries a mark, so the group
 * lands on the teacher's first comment instead of page 1 of a 30-page paper.
 * A document-wide mark (page 0) does not count, because there is no page to open.
 */
export function firstAnnotatedPage(list: Annotation[]): number {
  const pages = list.map((a) => a.page).filter((p) => p > 0);
  return pages.length ? Math.min(...pages) : 1;
}
