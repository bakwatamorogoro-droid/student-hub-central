import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clapperboard, PlayCircle, PauseCircle, Sparkles, ArrowRight, Images } from "lucide-react";
import { POSTER_STUDY, STUDY_HALL_LOOP } from "@/lib/mediaAssets";
import { useI18n } from "@/lib/i18n";

/**
 * Motion-graphics clip of Muslim students sitting an exam. The clip only plays
 * while it is on screen and while the visitor has not pressed pause, so it
 * costs nothing on the other pages.
 *
 * Real photographs are not duplicated here: the hero carries them on the
 * dashboard and /bana owns the full gallery.
 */
export function ExamHallGallery() {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || reducedMotion) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && playing) el.play().catch(() => {});
        else el.pause();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [playing, reducedMotion]);

  const toggle = () => {
    const el = videoRef.current;
    setPlaying((p) => {
      const next = !p;
      if (el) {
        if (next) el.play().catch(() => {});
        else el.pause();
      }
      return next;
    });
  };

  return (
    <section className="relative mt-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
            <Sparkles className="h-3 w-3" /> {t("media_kicker")}
          </div>
          <h2 className="mt-2 flex items-center gap-2 text-xl font-extrabold tracking-tight md:text-2xl">
            <Clapperboard className="h-5 w-5 text-primary" /> {t("media_title")}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("media_desc")}</p>
        </div>
        <Link
          to="/bana"
          className="group inline-flex shrink-0 items-center gap-2 rounded-xl border-2 border-primary/30 bg-card px-4 py-2 text-sm font-bold transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-lg"
        >
          <Images className="h-4 w-4" />
          {t("open_media")}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      <div className="group relative overflow-hidden rounded-3xl border-2 border-primary/30 bg-black shadow-2xl">
        <video
          ref={videoRef}
          src={STUDY_HALL_LOOP}
          poster={POSTER_STUDY}
          autoPlay={!reducedMotion}
          muted
          loop
          playsInline
          preload="metadata"
          aria-label={t("media_title")}
          className="aspect-video w-full object-cover transition-transform duration-[1600ms] ease-out group-hover:scale-[1.03]"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            {t("live_animation")}
          </div>
          {!reducedMotion && (
            <button
              type="button"
              onClick={toggle}
              aria-label={playing ? t("pause") : t("play")}
              className="inline-flex items-center gap-2 rounded-full bg-primary/90 px-3 py-1.5 text-[11px] font-bold text-primary-foreground shadow-lg backdrop-blur transition hover:bg-primary"
            >
              {playing ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
              {playing ? t("pause") : t("play")}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
