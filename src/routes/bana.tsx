import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent } from "@/components/ui/card";
import { StudyGallery } from "@/components/StudyGallery";
import {
  HOME_ANIMATION,
  EXAM_HERO_VIDEO,
  STUDY_HALL_LOOP,
  POSTER_EXAM,
  POSTER_HOME,
  POSTER_STUDY,
} from "@/lib/mediaAssets";
import { Clapperboard, Sparkles, Play } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/bana")({
  component: MediaPage,
  head: () => ({
    meta: [
      { title: "Bana ya Media — Picha Halisi na Uhuishaji" },
      { name: "description", content: "Picha halisi za matukio yetu pamoja na video za uhuishaji za wanafunzi wa Kiislamu wakifanya mtihani." },
      { property: "og:title", content: "Bana ya Media — Picha Halisi na Uhuishaji" },
      { property: "og:description", content: "Picha halisi na uhuishaji wa kisasa wa wanafunzi wa Kiislamu." },
    ],
  }),
});

const CLIPS = [
  { src: HOME_ANIMATION, poster: POSTER_HOME, key: "hero_welcome" },
  { src: EXAM_HERO_VIDEO, poster: POSTER_EXAM, key: "badge_security" },
  { src: STUDY_HALL_LOOP, poster: POSTER_STUDY, key: "media_title" },
] as const;

function MediaPage() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <SiteHeader />
      <main className="container mx-auto max-w-6xl px-4 py-6">
        <div className="relative mb-6 overflow-hidden rounded-3xl border-2 border-primary/25 bg-gradient-to-br from-primary/10 via-card to-secondary/15 p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <Sparkles className="h-3 w-3" /> {t("photos_kicker")}
            </div>
            <h1 className="mt-3 flex items-center gap-2 font-display text-2xl font-black tracking-tight md:text-4xl">
              <Clapperboard className="h-7 w-7 text-primary" /> {t("nav_media")}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">{t("media_desc")}</p>
          </div>
        </div>

        <StudyGallery />

        <h2 className="mt-12 flex items-center gap-2 text-xl font-extrabold tracking-tight md:text-2xl">
          <Play className="h-5 w-5 text-primary" /> {t("media_title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("live_animation")}</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {CLIPS.map((c, i) => (
            <Card
              key={c.src}
              className="animate-fade-in overflow-hidden border-2 border-primary/20 transition-all hover:-translate-y-1 hover:border-primary hover:shadow-xl"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <video
                src={c.src}
                poster={c.poster}
                muted
                loop
                playsInline
                preload="metadata"
                onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                onMouseLeave={(e) => (e.currentTarget as HTMLVideoElement).pause()}
                className="aspect-video w-full bg-black object-cover"
                aria-label={t(c.key)}
              />
              <CardContent className="p-3">
                <div className="text-sm font-bold">{t(c.key)}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
