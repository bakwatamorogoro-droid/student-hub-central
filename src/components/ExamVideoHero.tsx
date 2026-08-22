import { Sparkles, PlayCircle } from "lucide-react";
import heroVideo from "@/assets/exam-hero.mp4.asset.json";

export function ExamVideoHero({ subtitle }: { subtitle?: string }) {
  return (
    <section className="relative mb-8 rounded-3xl overflow-hidden border border-primary/25 shadow-2xl bg-black">
      <video
        src={(heroVideo as { url: string }).url}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label="Wanafunzi wa Kiislamu wakifanya mtihani"
        className="w-full h-[240px] md:h-[380px] object-cover opacity-90"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/20" />
      <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-10">
        <div className="inline-flex w-fit items-center gap-2 px-3 py-1.5 rounded-full bg-primary/90 text-primary-foreground text-[11px] font-bold tracking-wide uppercase shadow-lg">
          <Sparkles className="h-3 w-3" /> Mfumo wa Kisasa wa Mitihani
        </div>
        <h1 className="mt-3 text-3xl md:text-6xl font-black tracking-tight text-white leading-[1.05] drop-shadow-2xl">
          MFUMO WA MTIHANI
          <span className="block text-primary-foreground/80 text-lg md:text-3xl font-bold tracking-[0.25em] mt-2">
            ISLAMIC STUDIES
          </span>
        </h1>
        {subtitle && <p className="mt-3 max-w-xl text-sm md:text-base text-white/80">{subtitle}</p>}
        <div className="mt-4 flex items-center gap-2 text-white/70 text-xs">
          <PlayCircle className="h-4 w-4" /> Video bila sauti · Wanafunzi wakifanya mtihani
        </div>
      </div>
    </section>
  );
}

export function BigSystemTitle({ label = "MFUMO WA MTIHANI", sub }: { label?: string; sub?: string }) {
  return (
    <div className="my-10 text-center">
      <h2 className="text-4xl md:text-7xl font-black tracking-tighter bg-gradient-to-b from-primary via-primary/80 to-primary/30 bg-clip-text text-transparent leading-none">
        {label}
      </h2>
      {sub && <p className="mt-2 text-xs md:text-sm uppercase tracking-[0.35em] text-muted-foreground">{sub}</p>}
    </div>
  );
}
