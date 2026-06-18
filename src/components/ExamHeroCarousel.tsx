import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, Sparkles } from "lucide-react";

type Img = { id: string; image_url: string; title: string | null; caption: string | null };

const FALLBACK: Img[] = [];

export function ExamHeroCarousel() {
  const [imgs, setImgs] = useState<Img[]>(FALLBACK);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("study_images")
        .select("id,image_url,title,caption")
        .eq("active", true)
        .eq("category", "exam_hero")
        .order("position", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(20);
      if (data && data.length) setImgs(data as Img[]);
    })();
  }, []);

  useEffect(() => {
    if (imgs.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % imgs.length), 3800);
    return () => clearInterval(t);
  }, [imgs.length]);

  if (imgs.length === 0) {
    return (
      <div className="mb-6 rounded-2xl overflow-hidden border-2 border-primary/30 bg-gradient-to-br from-primary/15 via-secondary/20 to-primary/10 p-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 text-primary text-xs font-bold mb-3">
          <Sparkles className="h-3 w-3" /> Karibu Mtihani
        </div>
        <h3 className="text-lg font-bold flex items-center justify-center gap-2"><BookOpen className="h-5 w-5 text-primary" /> Fanya Mtihani Kwa Adabu ya Kiislamu</h3>
        <p className="text-sm text-muted-foreground mt-1">Admin anaweza kuongeza picha za wanafunzi waliovaa Kiislamu wakifanya mtihani kwenye "Bana" — zitatembea hapa.</p>
      </div>
    );
  }

  return (
    <div className="mb-6 relative rounded-2xl overflow-hidden border-2 border-primary/40 shadow-2xl bg-black aspect-[16/7]">
      {imgs.map((it, i) => (
        <div
          key={it.id}
          className="absolute inset-0 transition-all duration-1000 ease-in-out"
          style={{
            opacity: i === idx ? 1 : 0,
            transform: i === idx ? "scale(1.04)" : "scale(1)",
          }}
        >
          <img
            src={it.image_url}
            alt={it.title || "Mwanafunzi akifanya mtihani"}
            className="w-full h-full object-cover"
            style={{ animation: i === idx ? "examKenBurns 5s ease-out forwards" : undefined }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          {(it.title || it.caption) && (
            <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
              {it.title && <div className="text-lg md:text-2xl font-extrabold drop-shadow-lg animate-fade-in">{it.title}</div>}
              {it.caption && <div className="text-xs md:text-sm opacity-90 mt-1 animate-fade-in">{it.caption}</div>}
            </div>
          )}
        </div>
      ))}

      <div className="absolute top-3 left-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/90 backdrop-blur text-primary-foreground text-xs font-bold shadow-lg animate-pulse">
        <Sparkles className="h-3 w-3" /> Karibu Fanya Mtihani
      </div>

      <div className="absolute bottom-3 right-3 flex gap-1.5">
        {imgs.map((_, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            aria-label={`Picha ${i + 1}`}
            className={`h-2 rounded-full transition-all ${i === idx ? "w-6 bg-primary" : "w-2 bg-white/60 hover:bg-white"}`}
          />
        ))}
      </div>

      <style>{`@keyframes examKenBurns{from{transform:scale(1) translate(0,0)}to{transform:scale(1.12) translate(-1.5%,-1%)}}`}</style>
    </div>
  );
}