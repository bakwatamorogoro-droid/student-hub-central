import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  GraduationCap,
  Sparkles,
  UserCog,
  Images,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";

type Photo = { id: string; image_url: string; title: string | null; caption: string | null };

/**
 * Dashboard hero built from the real photographs the admin uploaded to
 * `study_images`. Slides cross-fade with a slow Ken Burns drift, pause while the
 * tab is hidden, and collapse to the first photo entirely when the visitor asks
 * for reduced motion.
 */
export function RealPhotoHero({ fallback }: { fallback: React.ReactNode }) {
  const { t } = useI18n();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [idx, setIdx] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("study_images")
        .select("id,image_url,title,caption")
        .eq("active", true)
        .order("position", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(12);
      if (cancelled) return;
      setPhotos((data as Photo[]) || []);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (reducedMotion || photos.length < 2) return;
    const advance = () => setIdx((i) => (i + 1) % photos.length);
    const timer = setInterval(() => {
      if (!document.hidden) advance();
    }, 5200);
    return () => clearInterval(timer);
  }, [reducedMotion, photos.length]);

  // Nothing to show yet: keep the animated hero so the page never opens empty.
  if (!loaded || photos.length === 0) return <>{fallback}</>;

  const step = (delta: number) => setIdx((i) => (i + delta + photos.length) % photos.length);
  const current = photos[idx];

  return (
    <section className="group relative mb-6 min-h-[340px] overflow-hidden rounded-3xl border border-primary/25 bg-foreground shadow-float md:min-h-[480px]">
      {photos.map((p, i) => (
        <img
          key={p.id}
          src={p.image_url}
          alt={p.title || t("photos_title")}
          loading={i === 0 ? "eager" : "lazy"}
          fetchPriority={i === 0 ? "high" : "low"}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-out"
          style={{
            opacity: i === idx ? 1 : 0,
            animation:
              i === idx && !reducedMotion ? "heroKenBurns 9s ease-out forwards" : undefined,
          }}
        />
      ))}

      {/* Legibility layers — the copy must stay readable over any photo. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/92 via-black/45 to-black/15" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/35 via-transparent to-secondary/25 mix-blend-soft-light" />

      <div className="relative flex min-h-[340px] flex-col justify-between p-5 md:min-h-[480px] md:p-9">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary-foreground/25 bg-black/35 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary-foreground backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5" /> {t("photos_kicker")}
          </div>
          {photos.length > 1 && (
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/25 bg-black/35 px-3 py-1.5 text-[11px] font-bold text-primary-foreground backdrop-blur-md">
              <Images className="h-3.5 w-3.5" />
              <span className="tabular-nums">
                {idx + 1} / {photos.length}
              </span>
            </div>
          )}
        </div>

        <div>
          <h2 className="font-display text-2xl font-black leading-tight tracking-tight text-white drop-shadow-2xl md:text-5xl">
            {t("hero_welcome")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium text-white/85 md:text-lg">
            {t("hero_tagline")}
          </p>

          {(current.title || current.caption) && (
            <p className="mt-3 max-w-2xl text-xs font-semibold text-white/75 md:text-sm">
              {current.title || current.caption}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link
              to="/student"
              hash="edit-taasrifa"
              className="group/cta inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              <UserCog className="h-4 w-4" />
              {t("update_cta")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-1" />
            </Link>
            <div className="glass-panel hidden items-center gap-2 rounded-xl px-3.5 py-2 text-primary-foreground sm:flex">
              <GraduationCap className="h-4 w-4" />
              <span className="text-xs font-semibold md:text-sm">{t("badge_islamic")}</span>
            </div>
          </div>
        </div>
      </div>

      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label={t("back")}
            className="absolute left-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-primary-foreground/25 bg-black/35 p-2 text-primary-foreground opacity-0 backdrop-blur-md transition hover:bg-primary hover:text-primary-foreground group-hover:opacity-100 md:block"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label={t("forward")}
            className="absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-full border border-primary-foreground/25 bg-black/35 p-2 text-primary-foreground opacity-0 backdrop-blur-md transition hover:bg-primary hover:text-primary-foreground group-hover:opacity-100 md:block"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setIdx(i)}
                aria-label={`${t("photos_title")} ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === idx ? "w-7 bg-primary" : "w-1.5 bg-white/55 hover:bg-white/85"
                }`}
              />
            ))}
          </div>
        </>
      )}

      <style>{`@keyframes heroKenBurns{from{transform:scale(1) translate(0,0)}to{transform:scale(1.1) translate(-1.4%,-1.2%)}}`}</style>
    </section>
  );
}
