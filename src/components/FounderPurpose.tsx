import { GraduationCap, Heart, Quote, Sparkles, Users, Zap } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * Utambulisho wa mfumo: nani ameuanzisha, na kwa nini upo.
 *
 * Hii ndiyo sehemu inayompa mwanafunzi au mwalimu anayetembelea mara ya
 * kwanza picha ya haraka ya kile mfumo unachofanya, kabla ya kuingia kwenye
 * mitihani.
 */
export function FounderPurpose() {
  const { t } = useI18n();

  const pillars = [
    { Icon: Users, title: t("purpose_p1_title"), body: t("purpose_p1_body") },
    { Icon: Sparkles, title: t("purpose_p2_title"), body: t("purpose_p2_body") },
    { Icon: Zap, title: t("purpose_p3_title"), body: t("purpose_p3_body") },
    { Icon: GraduationCap, title: t("purpose_p4_title"), body: t("purpose_p4_body") },
  ];

  return (
    <section className="mt-12 space-y-6">
      <div className="relative overflow-hidden rounded-3xl border-2 border-primary/25 bg-gradient-to-br from-primary/10 via-card to-secondary/15 p-6 shadow-xl md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-secondary/20 blur-3xl" />
        <div className="relative flex flex-col items-center gap-6 md:flex-row md:items-start">
          <div className="relative shrink-0">
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-primary to-secondary text-4xl font-black text-primary-foreground shadow-2xl ring-4 ring-background">
              DJ
            </div>
            <span className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full border-2 border-background bg-emerald-500 shadow-lg">
              <GraduationCap className="h-4 w-4 text-white" />
            </span>
          </div>
          <div className="min-w-0 flex-1 text-center md:text-left">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <Heart className="h-3 w-3" /> {t("founder_role")}
            </div>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-foreground md:text-4xl">
              {t("founder_name")}
            </h2>
            <p className="mt-1 text-sm font-semibold text-primary">{t("founder_title")}</p>
            <div className="relative mt-4 rounded-2xl border border-primary/15 bg-background/60 p-4 backdrop-blur">
              <Quote className="absolute -left-1 -top-2 h-5 w-5 text-primary/40" />
              <p className="text-sm italic leading-relaxed text-muted-foreground">
                {t("founder_message")}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-primary/20 bg-card/60 p-6 backdrop-blur md:p-8">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-secondary/40 bg-secondary/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-foreground">
            {t("purpose_kicker")}
          </span>
          <h2 className="mt-3 text-2xl font-black tracking-tight text-foreground md:text-3xl">
            {t("purpose_title")}
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">{t("purpose_sub")}</p>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pillars.map((p) => (
            <div
              key={p.title}
              className="rounded-2xl border border-primary/15 bg-background/50 p-4 transition-transform hover:-translate-y-1"
            >
              <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20">
                <p.Icon className="h-5 w-5 text-primary" />
              </span>
              <h3 className="font-bold text-foreground">{p.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
