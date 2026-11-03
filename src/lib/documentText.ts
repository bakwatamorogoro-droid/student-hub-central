/**
 * Turning an uploaded document into words on the screen.
 *
 * `mammoth` reads a `.docx` and hands back HTML. That HTML comes from a file a
 * student uploaded, so it is not trusted: it may carry a `<script>`, an `onerror`
 * attribute, or a link to somewhere else. This module is the one place that
 * cleans it, so the admin reads the words without the document running anything.
 *
 * The sanitiser is deliberately small and allow-list based. A document needs
 * paragraphs, headings, lists, tables and basic emphasis to be readable; it does
 * not need scripts, stylesheets, forms, frames, or event handlers, so those are
 * removed rather than filtered.
 *
 * Kept import-free so `node --test` can exercise it: a sanitiser that lets a
 * `<script>` through is exactly the kind of bug a test catches and a screen does
 * not.
 */

/** Tags a document may keep, so a table and a heading still look like one. */
const ALLOWED_TAGS = new Set([
  "P",
  "BR",
  "HR",
  "DIV",
  "SPAN",
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "SUB",
  "SUP",
  "UL",
  "OL",
  "LI",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "PRE",
  "CODE",
  "TABLE",
  "THEAD",
  "TBODY",
  "TFOOT",
  "TR",
  "TD",
  "TH",
  "CAPTION",
  "IMG",
]);

/** Attributes kept on an allowed tag, everything else is dropped. */
const ALLOWED_ATTRS = new Set(["colspan", "rowspan", "align", "src", "alt", "width", "height"]);

/**
 * Strip a document's HTML down to readable text and simple structure.
 *
 * Written with a small tokenizer rather than the DOM, because the test runner
 * has no `document`. It is not a general-purpose HTML parser — it does not need
 * to be. It has to be predictable on the markup `mammoth` emits and on the
 * hostile cases a test can name.
 */
export function sanitizeDocumentHtml(html: string): string {
  const input = String(html ?? "");
  if (!input) return "";

  // Drop whole elements whose contents are never text a reader wants.
  let out = input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|form|link|meta)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(script|style|iframe|object|embed|form|link|meta)\b[^>]*\/?>/gi, "");

  // Rewrite every remaining tag: keep it only if it is allowed, and keep only
  // the attributes on the allow-list. An `on*` handler is not on the list, so it
  // goes with everything else that is not.
  out = out.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, rawTag, rawAttrs) => {
    const tag = String(rawTag).toUpperCase();
    if (!ALLOWED_TAGS.has(tag)) return "";
    const closing = match.startsWith("</");
    if (closing) return `</${tag.toLowerCase()}>`;

    const attrs = keepAttributes(String(rawAttrs));
    const selfClosing = tag === "BR" || tag === "HR" || tag === "IMG";
    return `<${tag.toLowerCase()}${attrs}${selfClosing ? " /" : ""}>`;
  });

  return out.trim();
}

/** The allow-listed attributes of one tag, rebuilt so a stray quote cannot break out. */
function keepAttributes(raw: string): string {
  let out = "";
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const name = m[1].toLowerCase();
    if (!ALLOWED_ATTRS.has(name)) continue;
    let value = m[2];
    if (value.startsWith('"') || value.startsWith("'")) value = value.slice(1, -1);
    // A `javascript:` URL is not a URL; only real image sources are kept.
    if (name === "src" && /^\s*(javascript|data:text\/html)/i.test(value)) continue;
    out += ` ${name}="${value.replace(/"/g, "&quot;")}"`;
  }
  return out;
}

/**
 * Plain text of a document's HTML, for a search or a preview snippet.
 *
 * Entities are decoded for the handful a Word file actually produces, so a
 * search for "A & B" matches the document that wrote it that way.
 */
export function documentTextOf(html: string): string {
  return String(html ?? "")
    .replace(/<\/(p|div|li|h[1-6]|tr|br)\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}
