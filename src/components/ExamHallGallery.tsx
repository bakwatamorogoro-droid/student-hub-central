import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clapperboard, PlayCircle, PauseCircle, Sparkles, ArrowRight } from "lucide-react";
import { EXAM_HALL_STILLS, POSTER_STUDY, STUDY_HALL_LOOP } from "@/lib/mediaAssets";

/**
 * Media gallery for the exam hall: a looping motion-graphics clip of African
 * Muslim students sitting an exam, plus stills cut from the same animation.
 *
 * The clip only plays while it is on screen and while the visitor has not
 * pressed pause, so it costs nothing on the other pages.
 */
export function ExamHallGallery() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [active, setActive] = useState(0);

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

  useEffect(() => {
    if (reducedMotion || !playing) return;
    const t = setInterval(() => setActive((i) => (i + 1) % EXAM_HALL_STILLS.length), 4200);
    return () => clearInterval(t);
  }, [reducedMotion, playing]);

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
            <Sparkles className="h-3 w-3" /> Uhuishaji wa Kisasa
          </div>
          <h2 className="mt-2 flex items-center gap-2 text-xl font-extrabold tracking-tight md:text-2xl">
            <Clapperboard className="h-5 w-5 text-primary" /> Ukumbi wa Mtihani — Wanafunzi wa Kiislamu
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Video ya uhuishaji inayoonyesha wanafunzi wa Kiislamu wakifanya mtihani kwa nidhamu, adabu na utulivu.
          </p>
        </div>
        <Link
          to="/bana"
          className="group inline-flex shrink-0 items-center gap-2 rounded-xl border-2 border-primary/30 bg-card px-4 py-2 text-sm font-bold transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-lg"
        >
          Fungua Bana ya Media
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
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
            aria-label="Uhuishaji: wanafunzi wa Kiislamu wakifanya mtihani kwenye ukumbi"
            className="aspect-video w-full object-cover transition-transform duration-[1600ms] ease-out group-hover:scale-[1.04]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />

          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Uhuishaji hai · bila sauti
            </div>
            {!reducedMotion && (
              <button
                type="button"
                onClick={toggle}
                aria-label={playing ? "Simamisha uhuishaji" : "Endesha uhuishaji"}
                className="inline-flex items-center gap-2 rounded-full bg-primary/90 px-3 py-1.5 text-[11px] font-bold text-primary-foreground shadow-lg backdrop-blur transition hover:bg-primary"
              >
                {playing ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
                {playing ? "Simamisha" : "Endesha"}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          {EXAM_HALL_STILLS.slice(0, 3).map((s, i) => (
            <button
              key={s.src}
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className={`group relative overflow-hidden rounded-2xl border-2 text-left transition-all ${
                active === i ? "border-primary shadow-xl" : "border-primary/20 hover:border-primary/60"
              }`}
            >
              <img
                src={s.src}
                alt={s.title}
                loading="lazy"
                className="h-24 w-full object-cover transition-transform duration-700 group-hover:scale-110 lg:h-28"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-2.5">
                <div className="text-xs font-bold text-white drop-shadow">{s.title}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4">
        <div className="text-sm font-bold text-primary">{EXAM_HALL_STILLS[active]?.title}</div>
        <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">{EXAM_HALL_STILLS[active]?.caption}</p>
      </div>
    </section>
  );
}
