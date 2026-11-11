/**
 * Strip cascade layers out of a built stylesheet.
 *
 * Tailwind 4 wraps its entire output in `@layer theme, base, components,
 * utilities`. `@layer` is Chrome 99 / Safari 15.4 / Firefox 97, which is *above*
 * the CSS floor this project builds for (`chrome80` / `safari13` / `firefox78`
 * in `vite.config.ts`). On an engine in that window the at-rule is unknown, so
 * every rule inside it is discarded: the palette in `:root` still lands (it is
 * unlayered), but nothing that *uses* it does. The page arrives with no colour,
 * no layout and no spacing — "the whole system has no colour on some devices".
 *
 * `@layer` carries no information this sheet needs. The layers are emitted in
 * the order they are declared (theme, base, components, utilities), and the only
 * thing a layer does beyond that is beat an unlayered rule of equal specificity
 * regardless of position. Nothing here depends on that: the unlayered rules in
 * `styles.css` are the ones meant to win (`.word-preview`, `.dialog-fit-viewport`
 * and the gradient fallback), and they already come last. So flattening the
 * blocks in place — dropping the `@layer <name> {` prefix and its matching `}` —
 * preserves the cascade exactly while making the sheet readable by every engine
 * the build claims to support.
 *
 * This runs as a `generateBundle` step, so it only touches the shipped CSS; the
 * dev server keeps its layers. `cssLayers.test.ts` holds the parser to the
 * awkward cases (strings, comments, nested at-rules) and `AGENTS.md` records why
 * the flattening exists.
 */

const LAYER_AT_RULE = "@layer";

/** The index just past `/* ... *``/`, assuming `start` is at the opening slash. */
function endOfComment(css: string, start: number): number {
  const close = css.indexOf("*/", start + 2);
  return close === -1 ? css.length : close + 2;
}

/** The index just past a quoted string, assuming `start` is at the quote. */
function endOfString(css: string, start: number): number {
  const quote = css[start];
  for (let i = start + 1; i < css.length; i++) {
    if (css[i] === "\\") {
      i++;
      continue;
    }
    if (css[i] === quote) return i + 1;
  }
  return css.length;
}

/**
 * The end of an at-rule's prelude, plus which character ended it.
 * `{` and `;` inside `url(...)` or a string do not end it, so the scan keeps a
 * paren depth and steps over both.
 */
function endOfPrelude(css: string, start: number): { end: number; terminator: "{" | ";" | "" } {
  let depth = 0;
  for (let i = start; i < css.length; i++) {
    const ch = css[i];
    if (ch === "/" && css[i + 1] === "*") {
      i = endOfComment(css, i) - 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = endOfString(css, i) - 1;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (ch === "{" || ch === ";")) return { end: i, terminator: ch };
  }
  return { end: css.length, terminator: "" };
}

function atRuleName(prelude: string): string {
  const match = /^@[a-zA-Z-]+/.exec(prelude.trim());
  return match ? match[0].toLowerCase() : "";
}

export function unwrapCascadeLayers(css: string): string {
  const out: string[] = [];
  // One entry per open block: whether its closing `}` belongs to a layer we
  // already dropped the opening of.
  const layerBlocks: boolean[] = [];
  let i = 0;

  while (i < css.length) {
    const ch = css[i];

    if (ch === "/" && css[i + 1] === "*") {
      const end = endOfComment(css, i);
      out.push(css.slice(i, end));
      i = end;
      continue;
    }

    if (ch === '"' || ch === "'") {
      // A `{` or `}` inside a string is content, not structure.
      const end = endOfString(css, i);
      out.push(css.slice(i, end));
      i = end;
      continue;
    }

    if (ch === "@") {
      const { end, terminator } = endOfPrelude(css, i);
      const prelude = css.slice(i, end);
      const isLayer = atRuleName(prelude) === LAYER_AT_RULE;

      if (terminator === ";") {
        // `@layer a, b;` only fixes an order. With no layers left it is dead.
        if (!isLayer) out.push(css.slice(i, end + 1));
        i = end + 1;
        continue;
      }

      if (terminator === "{") {
        if (isLayer) {
          layerBlocks.push(true);
        } else {
          out.push(prelude, "{");
          layerBlocks.push(false);
        }
        i = end + 1;
        continue;
      }

      // Unterminated at-rule at the end of the file: keep it verbatim.
      out.push(css.slice(i));
      break;
    }

    if (ch === "{") {
      out.push(ch);
      layerBlocks.push(false);
      i++;
      continue;
    }

    if (ch === "}") {
      const wasLayer = layerBlocks.pop() ?? false;
      if (!wasLayer) out.push(ch);
      i++;
      continue;
    }

    out.push(ch);
    i++;
  }

  return out.join("");
}
