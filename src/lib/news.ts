/**
 * The public news list.
 *
 * An announcement is "live" when it is active and has not expired. The rule is
 * kept here, out of the component, so it can be tested without a database — the
 * banner, the news page and the admin list all have to agree on it, and a
 * disagreement shows a student a notice the office already withdrew.
 */

export type NewsItem = {
  id: string;
  title: string | null;
  message: string;
  pdfUrl: string | null;
  imageUrl: string | null;
  createdAt: string;
  expiresAt: string | null;
};

/** One row as PostgREST returns it. `image_url` may be absent in production. */
export type AnnouncementRow = {
  id: string;
  title: string | null;
  message: string;
  pdf_url: string | null;
  image_url?: string | null;
  created_at: string;
  expires_at: string | null;
  active?: boolean;
};

/** Active, unexpired, newest first. */
export function liveNews(rows: AnnouncementRow[] | null | undefined, now = Date.now()): NewsItem[] {
  return (rows ?? [])
    .filter((r) => r.active !== false)
    .filter((r) => !r.expires_at || new Date(r.expires_at).getTime() > now)
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
    .map((r) => ({
      id: r.id,
      title: r.title,
      message: r.message,
      pdfUrl: r.pdf_url,
      imageUrl: r.image_url ?? null,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    }));
}

/**
 * True when an announcement is worth showing as a headline.
 *
 * A row with only a PDF and no words still matters, so it counts; a row with
 * neither is a mistake in the admin form and is dropped.
 */
export function hasContent(item: NewsItem): boolean {
  return Boolean(
    (item.message || "").trim() || (item.title || "").trim() || item.pdfUrl || item.imageUrl,
  );
}
