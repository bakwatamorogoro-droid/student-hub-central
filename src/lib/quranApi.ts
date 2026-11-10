/**
 * Qur'an verses for OpenTutor, fetched at read time.
 *
 * The verse text is never stored in this repository. `openTutor.ts` holds only
 * `sura:aya` keys, and this file turns each key into the Arabic text plus a
 * Swahili and an English translation from api.quran.com. Two reasons:
 *
 *   - Accuracy. A verse that is typed into a source file can be misquoted, and
 *     a misquoted verse is the worst thing this app could show. Fetching it
 *     means the page can only ever display what the source actually says.
 *   - A failed fetch is visible. `resolveVerses` returns `null` for a verse it
 *     could not read, and the page then shows a link to the verse instead of
 *     pretending to quote it.
 *
 * The API is public, needs no key, and sends `access-control-allow-origin: *`,
 * so this runs straight from the browser — verified before writing this file.
 * The two translation ids are Al-Barwani (Swahili) and Saheeh International
 * (English); both were fetched and checked.
 */

const API = "https://api.quran.com/api/v4";

/** Ali Muhsin Al-Barwani — the standard Swahili translation. */
export const TRANSLATION_SW = 49;
/** Saheeh International — plain modern English. */
export const TRANSLATION_EN = 20;

export type ResolvedVerse = {
  /** `sura:aya`, e.g. `2:183`. */
  ref: string;
  /** The Arabic text. */
  arabic: string;
  /** Swahili translation, when the API supplied one. */
  sw: string | null;
  /** English translation, when the API supplied one. */
  en: string | null;
  /** Where a reader can go for the full passage and its context. */
  url: string;
};

/** A link a student can follow to read a verse at its source. */
export function quranUrl(ref: string): string {
  const [sura, aya] = ref.split(":");
  return `https://quran.com/${sura}/${aya}`;
}

type ApiTranslation = { resource_id?: number; text?: string };
type ApiVerse = {
  verse_key?: string;
  text_uthmani?: string | null;
  translations?: ApiTranslation[];
};

function pick(list: ApiTranslation[] | undefined, id: number): string | null {
  const hit = list?.find((t) => t.resource_id === id);
  const text = hit?.text?.replace(/<[^>]+>/g, "").trim();
  return text ? text : null;
}

/**
 * Fetch one verse. Returns `null` rather than throwing, because every caller
 * has a sensible fallback (show the link) and a rejected promise here would
 * only become an unhandled rejection.
 */
export async function fetchVerse(ref: string, signal?: AbortSignal): Promise<ResolvedVerse | null> {
  const params = new URLSearchParams({
    fields: "text_uthmani",
    translations: `${TRANSLATION_SW},${TRANSLATION_EN}`,
    language: "en",
  });
  try {
    const r = await fetch(`${API}/verses/by_key/${encodeURIComponent(ref)}?${params}`, { signal });
    if (!r.ok) return null;
    const data = (await r.json()) as { verse?: ApiVerse };
    const v = data.verse;
    const arabic = v?.text_uthmani?.trim();
    if (!v || !arabic) return null;
    return {
      ref: v.verse_key || ref,
      arabic,
      sw: pick(v.translations, TRANSLATION_SW),
      en: pick(v.translations, TRANSLATION_EN),
      url: quranUrl(ref),
    };
  } catch {
    // A network failure, an abort, or bad JSON — all the same to the caller.
    return null;
  }
}

/**
 * Fetch several verses at once. Keeps the input order, and keeps a `null` in
 * place of any verse that failed, so the page can render the ones it has and a
 * link for the ones it does not.
 */
export async function resolveVerses(
  refs: string[],
  signal?: AbortSignal,
): Promise<(ResolvedVerse | null)[]> {
  return Promise.all(refs.map((ref) => fetchVerse(ref, signal)));
}
