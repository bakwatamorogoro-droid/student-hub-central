import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Image as ImageIcon } from "lucide-react";
import { WallClock } from "@/components/WallClock";

type Item = {
  id: string;
  title: string | null;
  caption: string | null;
  image_url: string;
};

export function StudyGallery() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("study_images")
        .select("id,title,caption,image_url")
        .eq("active", true)
        .order("position", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(24);
      setItems((data as Item[]) || []);
    })();
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="max-w-6xl mx-auto mt-12">
      <div className="flex items-center gap-2 mb-4">
        <ImageIcon className="h-5 w-5 text-primary" />
        <h2 className="text-xl md:text-2xl font-bold">Bana ya Picha za Masomo</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((it, i) => (
          <Card
            key={it.id}
            className="overflow-hidden border-2 hover:border-primary transition-all hover:-translate-y-1 hover:shadow-xl animate-fade-in"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <a href={it.image_url} target="_blank" rel="noreferrer" className="block">
              <img
                src={it.image_url}
                alt={it.title || "Picha ya somo"}
                loading="lazy"
                className="w-full h-36 md:h-44 object-cover hover:scale-105 transition-transform duration-500"
              />
            </a>
            {(it.title || it.caption) && (
              <CardContent className="p-3">
                {it.title && <div className="font-semibold text-sm truncate">{it.title}</div>}
                {it.caption && <div className="text-xs text-muted-foreground line-clamp-2">{it.caption}</div>}
              </CardContent>
            )}
          </Card>
        ))}
      </div>
      <div className="mt-8 flex justify-center">
        <div className="rounded-2xl p-4 bg-gradient-to-br from-primary/10 via-background to-secondary/20 border-2 border-primary/30 shadow-xl hover:shadow-2xl transition-all hover:scale-105 animate-fade-in">
          <WallClock size={80} />
        </div>
      </div>
    </section>
  );
}