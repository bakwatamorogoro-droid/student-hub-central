import { useEffect, useState } from "react";
import { ExternalLink, Loader2, PlayCircle, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROVIDER_LABELS, type LessonProvider } from "@/lib/elesson";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** The gradient behind a card whose provider gave us no picture. */
const PROVIDER_GRADIENTS: Record<LessonProvider, string> = {
  youtube: "from-red-600 via-rose-600 to-red-800",
  tiktok: "from-slate-900 via-neutral-800 to-cyan-900",
  facebook: "from-blue-700 via-blue-600 to-indigo-800",
};

function providerGradient(provider: LessonProvider): string {
  return PROVIDER_GRADIENTS[provider] ?? PROVIDER_GRADIENTS.youtube;
}

/**
 * The provider mark shown when there is no thumbnail to draw.
 *
 * Facebook and TikTok do not give the browser a poster frame without a token, so
 * a lesson from either would otherwise be a grey rectangle. The mark says which
 * service the video is on, which is the useful thing to know before tapping.
 */
export function LessonThumb({
  provider,
  thumbnailUrl,
  title,
  className,
}: {
  provider: LessonProvider;
  thumbnailUrl: string | null;
  title: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(thumbnailUrl) && !broken;

  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      {showImage ? (
        <img
          src={thumbnailUrl as string}
          alt={title}
          loading="lazy"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div
          className={cn(
            "flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br text-white",
            providerGradient(provider),
          )}
        >
          <PlayCircle className="h-9 w-9 opacity-90" />
          <span className="text-[11px] font-black uppercase tracking-widest opacity-90">
            {PROVIDER_LABELS[provider]}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The lesson player.
 *
 * An `<iframe>` rather than a downloaded file: the owner posts to YouTube,
 * TikTok and Facebook, and the only way to play those is their own embed. Each
 * provider's embed URL is built once, in `elesson.ts`, so this component never
 * has to know the rules.
 *
 * The spinner is replaced on the iframe's `load` event rather than a timer: a
 * timer either lies (still spinning after the video is up) or flashes (the
 * spinner gone before the player paints). The fallback link is always present,
 * because an embed can be blocked by a network or a privacy setting and the
 * student should never be stuck.
 */
export function LessonPlayer({
  embedUrl,
  url,
  provider,
  title,
}: {
  embedUrl: string;
  url: string;
  provider: LessonProvider;
  title: string;
}) {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState(false);

  // A new lesson must show the spinner again rather than the last lesson's
  // "loaded" state.
  useEffect(() => setLoaded(false), [embedUrl]);

  return (
    <div className="space-y-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black shadow-xl">
        {!loaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/85 text-white">
            <Loader2 className="h-7 w-7 animate-spin text-primary" />
            <span className="text-xs text-white/70">{t("el_loading_player")}</span>
          </div>
        )}
        <iframe
          key={embedUrl}
          src={embedUrl}
          title={title}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1 font-normal">
            <PlayCircle className="h-3 w-3" /> {PROVIDER_LABELS[provider]}
          </Badge>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <ShieldAlert className="h-3 w-3" /> {t("el_watch_help")}
          </span>
        </div>
        <Button asChild size="sm" variant="outline" className="gap-1">
          <a href={url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5" />
            {provider === "youtube"
              ? t("el_open_youtube")
              : provider === "tiktok"
                ? t("el_open_tiktok")
                : t("el_open_facebook")}
          </a>
        </Button>
      </div>
    </div>
  );
}
