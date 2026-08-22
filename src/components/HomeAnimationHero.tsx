import heroAnim from "@/assets/home-animation.mp4.asset.json";

export function HomeAnimationHero() {
  return (
    <section className="relative mb-8 rounded-3xl overflow-hidden border border-primary/25 shadow-2xl bg-black">
      <video
        src={(heroAnim as { url: string }).url}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Animation ya mfumo wa masomo"
        className="w-full h-[220px] md:h-[420px] object-cover"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
    </section>
  );
}
