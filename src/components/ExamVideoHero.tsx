import { Sparkles, PlayCircle, ShieldCheck, Users } from "lucide-react";
import { EXAM_HERO_VIDEO } from "@/lib/mediaAssets";

export function ExamVideoHero({ subtitle }: { subtitle?: string }) {
  return (
    <section className="group relative mb-8 overflow-hidden rounded-3xl border border-primary/25 bg-black shadow-2xl">
      <video
        src={EXAM_HERO_VIDEO}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-label="Wanafunzi wa Kiislamu wakifanya mtihani"
        className="h-[260px] w-full scale-105 object-cover opacity-90 transition-transform duration-[1600ms] ease-out group-hover:scale-110 md:h-[400px]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/15" />
      <div className="absolute inset-0 bg-gradient-to-br from-primary/30 via-transparent to-secondary/25 mix-blend-soft-light" />

      <div className="absolute inset-0 flex flex-col justify-end p-5 md:p-10">
        <div className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/90 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-primary-foreground shadow-lg">
          <Sparkles className="h-3 w-3" /> Mfumo wa Kisasa wa Mitihani
        </div>
        <h1 className="mt-3 text-3xl font-black leading-[1.05] tracking-tight text-white drop-shadow-2xl md:text-6xl">
          MFUMO WA MTIHANI
          <span className="mt-2 block text-lg font-bold tracking-[0.25em] text-primary-foreground/80 md:text-3xl">
            ISLAMIC STUDIES
          </span>
        </h1>
        {subtitle && <p className="mt-3 max-w-xl text-sm text-white/80 md:text-base">{subtitle}</p>}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <div className="glass-panel flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-white">
            <PlayCircle className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold">Video bila sauti</span>
          </div>
          <div className="glass-panel flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-white">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold">Kamera · GPS · Sahihi</span>
          </div>
          <div className="glass-panel hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-white sm:flex">
            <Users className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold">Mtu mmoja au Group</span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function BigSystemTitle({ label = "MFUMO WA MTIHANI", sub }: { label?: string; sub?: string }) {
  return (
    <div className="my-10 text-center">
      <h2 className="bg-gradient-to-b from-primary via-primary/80 to-primary/30 bg-clip-text text-4xl font-black leading-none tracking-tighter text-transparent md:text-7xl">
        {label}
      </h2>
      {sub && <p className="mt-2 text-xs uppercase tracking-[0.35em] text-muted-foreground md:text-sm">{sub}</p>}
    </div>
  );
}
