import { GraduationCap, Sparkles } from "lucide-react";
import { HOME_ANIMATION } from "@/lib/mediaAssets";

export function HomeAnimationHero() {
  return (
    <section className="group relative mb-6 min-h-[320px] overflow-hidden rounded-3xl border border-primary/25 bg-foreground shadow-float md:min-h-[460px]">
      <video
        src={HOME_ANIMATION}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-label="Wanafunzi wa Kiislamu wakifanya mtihani"
        className="absolute inset-0 h-full w-full scale-105 object-cover transition-transform duration-[1600ms] ease-out group-hover:scale-110"
      />

      {/* Layered gradients keep the text legible over any frame of the video */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/35 via-transparent to-secondary/25 mix-blend-soft-light" />

      <div className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 bg-primary-foreground/10 blur-xl animate-[sheen_8s_ease-in-out_infinite]" />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative flex min-h-[320px] flex-col justify-between p-5 md:min-h-[460px] md:p-9">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary-foreground/25 bg-black/35 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary-foreground backdrop-blur-md">
          <Sparkles className="h-3.5 w-3.5" /> Mfumo wa Kisasa wa Mitihani
        </div>

        <div>
          <h2 className="font-display text-2xl font-black leading-tight tracking-tight text-white drop-shadow-2xl md:text-5xl">
            Karibu Mfumo wa Mitihani
          </h2>
          <p className="mt-2 max-w-2xl text-sm font-medium text-white/85 md:text-lg">
            Jifunze. Jipime. Fanikiwa. — Mitihani ya Islamic Studies mtandaoni, kwa kifaa chochote.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <div className="glass-panel flex items-center gap-2 rounded-xl px-3.5 py-2 text-primary-foreground">
              <GraduationCap className="h-4 w-4" />
              <span className="text-xs font-semibold md:text-sm">Islamic Studies</span>
            </div>
            <div className="glass-panel rounded-xl px-3.5 py-2 text-primary-foreground">
              <span className="text-xs font-semibold md:text-sm">Kamera · GPS · Sahihi</span>
            </div>
            <div className="glass-panel hidden rounded-xl px-3.5 py-2 text-primary-foreground sm:block">
              <span className="text-xs font-semibold md:text-sm">Matokeo ya Papo Hapo</span>
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-3">
        <div className="flex h-9 w-6 items-start justify-center rounded-full border border-primary-foreground/40 p-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-[scroll-cue_1.8s_ease-in-out_infinite]" />
        </div>
      </div>
    </section>
  );
}
