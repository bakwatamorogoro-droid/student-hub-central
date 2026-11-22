import { Link } from "@tanstack/react-router";
import { UserCog, ArrowRight, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Dashboard entry point for the self-service Update Taarifa flow. Deep-links to
 * the tab on /student so a student lands directly on the correction form.
 */
export function UpdateTaarifaCard() {
  const { t } = useI18n();
  return (
    <Link to="/student" hash="edit-taasrifa" className="group block">
      <div className="relative h-full overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-primary/15 via-card to-secondary/20 p-4 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:border-primary hover:shadow-float">
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/15 blur-2xl transition-transform duration-500 group-hover:scale-125" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/25 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-105">
            <UserCog className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-primary">
              <Sparkles className="h-2.5 w-2.5" /> {t("taarifa_kicker")}
            </div>
            <h3 className="mt-1 font-display text-lg font-extrabold leading-tight tracking-tight">
              {t("taarifa_card_title")}
            </h3>
            <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">
              {t("taarifa_card_sub")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-primary">
            <span className="hidden sm:inline">{t("update_cta")}</span>
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </div>
        </div>
      </div>
    </Link>
  );
}
