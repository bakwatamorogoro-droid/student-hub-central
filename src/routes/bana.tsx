import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { Card, CardContent } from "@/components/ui/card";
import { ExamHallGallery } from "@/components/ExamHallGallery";
import { EXAM_HALL_STILLS, HOME_ANIMATION, EXAM_HERO_VIDEO, STUDY_HALL_LOOP, POSTER_EXAM, POSTER_HOME, POSTER_STUDY } from "@/lib/mediaAssets";
import { Clapperboard, Sparkles } from "lucide-react";

export const Route = createFileRoute("/bana")({
  component: MediaPage,
  head: () => ({
    meta: [
      { title: "Bana ya Media — Uhuishaji wa Ukumbi wa Mtihani" },
      { name: "description", content: "Video za uhuishaji za wanafunzi wa Kiislamu wakifanya mtihani kwenye ukumbi, pamoja na picha za bana." },
      { property: "og:title", content: "Bana ya Media — Uhuishaji wa Ukumbi wa Mtihani" },
      { property: "og:description", content: "Uhuishaji wa kisasa wa wanafunzi wa Kiislamu wakifanya mtihani." },
    ],
  }),
});

const CLIPS = [
  { src: HOME_ANIMATION, poster: POSTER_HOME, title: "Ukumbi wa Mtihani (Mbali)", caption: "Muonekano mpana wa ukumbi wakati wanafunzi wanafanya mtihani." },
  { src: EXAM_HERO_VIDEO, poster: POSTER_EXAM, title: "Ukumbi wa Mtihani (Karibu)", caption: "Muonekano wa karibu wa madawati, karatasi na saa ya ukutani." },
  { src: STUDY_HALL_LOOP, poster: POSTER_STUDY, title: "Mzunguko wa Masomo", caption: "Kipande kinachojirudia kwa utulivu kwa ajili ya bana." },
];

function MediaPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <SiteHeader />
      <main className="container mx-auto max-w-6xl px-4 py-6">
        <div className="mb-6 rounded-3xl border-2 border-primary/25 bg-gradient-to-br from-primary/10 via-card to-secondary/15 p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
            <Sparkles className="h-3 w-3" /> Media & Uhuishaji
          </div>
          <h1 className="mt-3 flex items-center gap-2 text-2xl font-black tracking-tight md:text-4xl">
            <Clapperboard className="h-7 w-7 text-primary" /> Bana ya Media
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            Video za uhuishaji zinazoonyesha wanafunzi wa Kiislamu (wanafunzi wa Kiafrika) wakifanya mtihani kwenye ukumbi —
            wakiwa wamekaa kwa nidhamu, wakiandika majibu, huku mwanga wa jua ukiingia madirishani.
          </p>
        </div>

        <ExamHallGallery />

        <h2 className="mt-12 text-xl font-extrabold tracking-tight md:text-2xl">Video Zote</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {CLIPS.map((c) => (
            <Card key={c.src} className="overflow-hidden border-2 border-primary/20 transition-all hover:-translate-y-1 hover:border-primary hover:shadow-xl">
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
                aria-label={c.title}
              />
              <CardContent className="p-3">
                <div className="text-sm font-bold">{c.title}</div>
                <p className="mt-0.5 text-xs text-muted-foreground">{c.caption}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <h2 className="mt-12 text-xl font-extrabold tracking-tight md:text-2xl">Picha za Ukumbi wa Mtihani</h2>
        <p className="mt-1 text-sm text-muted-foreground">Picha hizi zimetolewa kwenye video hiyo hiyo ya uhuishaji.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {EXAM_HALL_STILLS.map((s, i) => (
            <Card
              key={s.src}
              className="overflow-hidden border-2 border-primary/20 transition-all hover:-translate-y-1 hover:border-primary hover:shadow-xl animate-fade-in"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <img src={s.src} alt={s.title} loading="lazy" className="h-36 w-full object-cover md:h-44" />
              <CardContent className="p-3">
                <div className="text-sm font-semibold">{s.title}</div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{s.caption}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
