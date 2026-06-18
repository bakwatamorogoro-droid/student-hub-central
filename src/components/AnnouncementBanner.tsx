import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Megaphone, FileText } from "lucide-react";

type Item = { message: string; pdf_url: string | null; image_url: string | null; title: string | null };

export function AnnouncementBanner() {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("announcements")
        .select("message, expires_at, active, pdf_url, image_url, title")
        .eq("active", true)
        .order("created_at", { ascending: false });
      const now = Date.now();
      const valid = (data || []).filter((a: any) => !a.expires_at || new Date(a.expires_at).getTime() > now);
      setItems(valid.map((a: any) => ({ message: a.message, pdf_url: a.pdf_url, image_url: a.image_url, title: a.title })));
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  if (!items.length) return null;
  // Duplicate the row so the translate animation loops seamlessly.
  const row = (
    <div className="inline-flex items-center shrink-0">
      {items.map((it, i) => (
        <span key={i} className="mx-10 font-medium inline-flex items-center gap-3 align-middle">
          <span className="text-primary">★</span>
          {it.title ? <strong className="text-primary">{it.title}:</strong> : null}
          <span>{it.message}</span>
          {it.image_url && (
            <img
              src={it.image_url}
              alt={it.title || "picha"}
              className="inline-block h-10 w-auto rounded-md border border-primary/30 shadow-sm align-middle"
            />
          )}
          {it.pdf_url && (
            <a href={it.pdf_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline hover:text-primary">
              <FileText className="h-3 w-3" /> PDF
            </a>
          )}
        </span>
      ))}
    </div>
  );
  return (
    <div className="bg-gradient-to-r from-primary/10 via-secondary to-primary/10 text-secondary-foreground border-b-2 border-primary overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2 group">
        <Megaphone className="h-4 w-4 shrink-0 animate-pulse text-primary" />
        <div className="flex-1 overflow-hidden whitespace-nowrap [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
          <div className="inline-flex animate-[marquee_40s_linear_infinite] group-hover:[animation-play-state:paused] will-change-transform">
            {row}
            {row}
          </div>
        </div>
      </div>
      <style>{`@keyframes marquee{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}`}</style>
    </div>
  );
}