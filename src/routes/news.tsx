import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { hasContent, liveNews, type AnnouncementRow, type NewsItem } from "@/lib/news";
import { useI18n } from "@/lib/i18n";
import {
  AlertCircle,
  BookOpen,
  CalendarCheck,
  Download,
  ExternalLink,
  FileText,
  ImageIcon,
  Info,
  Loader2,
  Megaphone,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/news")({
  component: Page,
  head: () => ({
    meta: [
      { title: "Habari na Matangazo — Islamic Studies Test Online" },
      {
        name: "description",
        content:
          "Habari, matangazo na nyaraka (PDF) za chuo. Fungua bila kuingia kwenye akaunti yako.",
      },
      { property: "og:title", content: "Habari na Matangazo — Islamic Studies Test Online" },
      {
        property: "og:description",
        content: "Matangazo, maelekezo na nyaraka za chuo — wazi kwa kila mtu.",
      },
    ],
  }),
});

/** How long the page waits before fetching again. */
const REFRESH_MS = 60_000;

function Page() {
  const { t } = useI18n();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      // `image_url` arrives with a later migration than `pdf_url`, so the full
      // select is tried first and the narrower one is the fallback. Asking for a
      // column the database lacks makes PostgREST reject the whole read.
      const full = await supabase
        .from("announcements")
        .select("id, title, message, pdf_url, image_url, created_at, expires_at, active")
        .eq("active", true)
        .order("created_at", { ascending: false });

      let rows = full.data as AnnouncementRow[] | null;
      if (full.error) {
        const narrow = await supabase
          .from("announcements")
          .select("id, title, message, pdf_url, created_at, expires_at, active")
          .eq("active", true)
          .order("created_at", { ascending: false });
        if (narrow.error) {
          setError("Imeshindikana kupata habari. Jaribu tena baadaye.");
          setItems([]);
          return;
        }
        rows = narrow.data as AnnouncementRow[] | null;
      }

      setError(null);
      setItems(liveNews(rows).filter(hasContent));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
    const id = setInterval(() => void load(false), REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const [pinned, ...rest] = useMemo(() => items, [items]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-secondary/10">
      <SiteHeader />
      <main className="container mx-auto max-w-4xl space-y-5 px-4 py-8">
        <div className="relative overflow-hidden rounded-3xl border-2 border-primary/25 bg-gradient-to-br from-primary/12 via-card to-secondary/15 p-6 text-center shadow-lg">
          <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-20 h-56 w-56 rounded-full bg-secondary/20 blur-3xl" />
          <div className="relative">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/12 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-primary shadow-[var(--shadow-edge)]">
              <Megaphone className="h-3 w-3" /> {t("news_title")}
            </div>
            <h1 className="mt-3 bg-gradient-to-r from-primary to-secondary bg-clip-text text-display font-black text-transparent">
              {t("news_headline")}
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{t("news_sub")}</p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <Badge variant="outline" className="gap-1 border-primary/30 text-[11px]">
                <Info className="h-3 w-3" /> {t("news_public_note")}
              </Badge>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => void load(false)}
                disabled={refreshing}
              >
                {refreshing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {t("news_refresh")}
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> {t("loading")}
          </div>
        ) : error ? (
          <Card className="border-destructive/40">
            <CardContent className="flex items-center gap-2 py-6 text-sm text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" /> {error}
            </CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Megaphone className="h-10 w-10 text-muted-foreground/50" />
              <p className="font-medium">{t("news_empty")}</p>
              <p className="max-w-sm text-xs text-muted-foreground">{t("news_empty_body")}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {pinned && <Pinned item={pinned} />}

            {rest.length > 0 && (
              <div className="space-y-3">
                <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                  <BookOpen className="h-4 w-4" /> {t("news_older")}
                </h2>
                {rest.map((it) => (
                  <NewsCard key={it.id} item={it} />
                ))}
              </div>
            )}
          </>
        )}

        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Info className="h-4 w-4 text-primary" /> {t("news_help_title")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-muted-foreground">
            <p className="flex gap-2">
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{t("news_help_pdf")}</span>
            </p>
            <p className="flex gap-2">
              <CalendarCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{t("news_help_attend")}</span>
            </p>
            <p className="flex gap-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{t("news_help_notice")}</span>
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

/** The newest live notice, given the most room. */
function Pinned({ item }: { item: NewsItem }) {
  const { t } = useI18n();
  return (
    <Card className="border-2 border-primary/35 bg-gradient-to-br from-primary/10 to-transparent">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-lg leading-snug">{item.title || t("news_untitled")}</CardTitle>
          <Badge className="shrink-0 gap-1 bg-primary text-[10px] uppercase">
            <Megaphone className="h-3 w-3" /> {t("news_new")}
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">{formatDate(item.createdAt)}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Body item={item} />
        <Attachments item={item} />
      </CardContent>
    </Card>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base leading-snug">{item.title || t("news_untitled")}</CardTitle>
        <p className="text-[11px] text-muted-foreground">{formatDate(item.createdAt)}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Body item={item} />
        <Attachments item={item} />
      </CardContent>
    </Card>
  );
}

/**
 * The notice text, with blank lines kept. A long notice is shown in full rather
 * than clipped: these carry dates, room numbers and deadlines, and a "read more"
 * on a phone is a way to miss the part that mattered.
 */
function Body({ item }: { item: NewsItem }) {
  const text = (item.message || "").trim();
  if (!text) return null;
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i} className="whitespace-pre-line">
          {para}
        </p>
      ))}
    </div>
  );
}

function Attachments({ item }: { item: NewsItem }) {
  const { t } = useI18n();
  if (!item.pdfUrl && !item.imageUrl) return null;
  return (
    <div className="space-y-2">
      {item.imageUrl && (
        <a
          href={item.imageUrl}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-xl border border-primary/20"
        >
          <img
            src={item.imageUrl}
            alt={item.title || t("news_untitled")}
            className="max-h-72 w-full object-cover"
            loading="lazy"
          />
        </a>
      )}
      {item.pdfUrl && (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="gap-1">
            <a href={item.pdfUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> {t("news_open_pdf")}
            </a>
          </Button>
          <Button asChild size="sm" variant="ghost" className="gap-1">
            <a href={item.pdfUrl} download>
              <Download className="h-3.5 w-3.5" /> {t("news_download_pdf")}
            </a>
          </Button>
        </div>
      )}
      {!item.imageUrl && !item.pdfUrl && (
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <ImageIcon className="h-3 w-3" /> {t("news_no_attachment")}
        </p>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("sw-TZ", { dateStyle: "long", timeStyle: "short" });
  } catch {
    return iso;
  }
}
