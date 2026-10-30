import { Sparkles, Clock } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { useI18n } from "@/lib/i18n";

/**
 * Placeholder for a section that is announced but not open yet. Keeps the route
 * reachable (so nav links never 404) while making it obvious nothing is broken.
 */
export function ComingSoonPage({ titleKey = "nav_quiz" }: { titleKey?: string }) {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <SiteHeader />
      <main className="container mx-auto flex max-w-3xl flex-col items-center px-4 py-16 text-center">
        <div className="relative mb-6">
          <div className="absolute inset-0 animate-pulse rounded-full bg-primary/25 blur-3xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl border-2 border-primary/30 bg-gradient-to-br from-primary/20 to-secondary/20 shadow-xl">
            <Clock className="h-11 w-11 text-primary" />
          </div>
        </div>

        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
          <Sparkles className="h-3 w-3" /> {t("coming_soon")}
        </div>

        <h1 className="bg-gradient-to-r from-primary via-primary to-secondary bg-clip-text text-3xl font-black tracking-tight text-transparent md:text-5xl">
          {t(titleKey)}
        </h1>

        <p className="mt-3 max-w-xl text-sm text-muted-foreground md:text-base">
          {t("coming_soon_body")}
        </p>

        <div className="mt-8 flex w-full max-w-md items-center justify-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-2 flex-1 animate-pulse rounded-full bg-primary/40"
              style={{ animationDelay: `${i * 250}ms` }}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
