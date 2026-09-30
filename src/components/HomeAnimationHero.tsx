import heroAnim from "@/assets/home-animation.mp4.asset.json";

export function HomeAnimationHero() {
  return (
    <section className="group relative mb-6 min-h-[300px] overflow-hidden rounded-2xl border border-primary/25 bg-foreground shadow-float md:min-h-[430px]">
      <video
        src={(heroAnim as { url: string }).url}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Animation ya mfumo wa masomo"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] group-hover:scale-[1.025]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-foreground/20 via-transparent to-foreground/80" />
      <div className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/4 bg-primary-foreground/10 blur-xl animate-[sheen_7s_ease-in-out_infinite]" />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 md:p-8">
        <div className="glass-panel rounded-xl px-4 py-3 text-primary-foreground">
          <p className="text-[10px] font-bold uppercase text-primary-foreground/70">Islamic Studies</p>
          <p className="font-display text-lg font-bold md:text-2xl">Jifunze. Jipime. Fanikiwa.</p>
        </div>
        <div className="flex h-9 w-6 items-start justify-center rounded-full border border-primary-foreground/40 p-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-[scroll-cue_1.8s_ease-in-out_infinite]" />
        </div>
      </div>
    </section>
  );
}
