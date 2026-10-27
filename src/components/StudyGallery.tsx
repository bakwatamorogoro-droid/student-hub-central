import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Image as ImageIcon, Sparkles } from "lucide-react";
import { WallClock } from "@/components/WallClock";
import { CARTOONS } from "@/lib/mediaAssets";
import { useI18n } from "@/lib/i18n";

type Item = {
  id: string;
  title: string | null;
  caption: string | null;
  image_url: string;
};

/** Real photos the admin uploaded to the study_images table. */
function RealPhotos() {
  const { t } = useI18n();
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

  return (
    <section className="mt-12">
      <div className="mb-4 flex items-center gap-2">
        <ImageIcon className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-xl font-extrabold tracking-tight md:text-2xl">{t("photos_title")}</h2>
          <p className="text-sm text-muted-foreground">{t("photos_sub")}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="p-6 text-center text-sm text-muted-foreground">{t("no_photos")}</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {items.map((it, i) => (
            <Card
              key={it.id}
              className="animate-fade-in overflow-hidden border-2 transition-all hover:-translate-y-1 hover:border-primary hover:shadow-xl"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <a href={it.image_url} target="_blank" rel="noreferrer" className="block">
                <img
                  src={it.image_url}
                  alt={it.title || t("photos_title")}
                  loading="lazy"
                  className="h-36 w-full object-cover transition-transform duration-500 hover:scale-105 md:h-44"
                />
              </a>
              {(it.title || it.caption) && (
                <CardContent className="p-3">
                  {it.title && <div className="truncate text-sm font-semibold">{it.title}</div>}
                  {it.caption && <div className="line-clamp-2 text-xs text-muted-foreground">{it.caption}</div>}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

/** Illustrations shipped with the app, so the gallery is never empty. */
function Cartoons() {
  const { t } = useI18n();
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <div>
          <h2 className="text-xl font-extrabold tracking-tight md:text-2xl">{t("cartoon_title")}</h2>
          <p className="text-sm text-muted-foreground">{t("cartoon_sub")}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CARTOONS.map((c, i) => (
          <figure
            key={c.src}
            className="animate-fade-in group overflow-hidden rounded-2xl border-2 border-primary/20 bg-card transition-all hover:-translate-y-1 hover:border-primary hover:shadow-xl"
            style={{ animationDelay: `${i * 70}ms` }}
          >
            <img
              src={c.src}
              alt={t(c.titleKey)}
              loading="lazy"
              className="h-36 w-full object-cover transition-transform duration-700 group-hover:scale-110 md:h-44"
            />
            <figcaption className="p-3">
              <div className="text-sm font-bold">{t(c.titleKey)}</div>
              <div className="line-clamp-2 text-xs text-muted-foreground">{t(c.captionKey)}</div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export function StudyGallery() {
  return (
    <>
      <Cartoons />
      <RealPhotos />
      <div className="mt-8 flex justify-center">
        <div className="animate-fade-in rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-background to-secondary/20 p-4 shadow-xl transition-all hover:scale-105 hover:shadow-2xl">
          <WallClock size={80} />
        </div>
      </div>
    </>
  );
}
