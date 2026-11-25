import { Link } from "@tanstack/react-router";
import { ArrowRight, CameraIcon, CheckCircle2, Smartphone, UserPlus } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { HOME_HERO_IMAGE, HOME_HERO_IMAGE_WEBP, MUM_LOGO } from "@/lib/mediaAssets";

/**
 * The dashboard opening: a photograph of the classroom beside a short pitch.
 *
 * The photo is a fixed frame rather than a slideshow, so the copy always sits
 * against the same composition, and it ships as WebP with a JPEG fallback at
 * 1000px — one request, no layout shift, and nothing to decode before the
 * headline can be read.
 */
export function HomeHero() {
  const { t } = useI18n();

  const facts = [
    { Icon: CameraIcon, label: t("badge_security") },
    { Icon: CheckCircle2, label: t("badge_instant") },
    { Icon: Smartphone, label: t("home_fact_device") },
  ];

  return (
    <section className="animate-fade-in relative mb-6 overflow-hidden rounded-[1.75rem] border border-primary/15 bg-card shadow-soft md:rounded-[2rem]">
      <div className="grid items-stretch md:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
        <div className="relative flex flex-col justify-center p-6 sm:p-8 md:p-12">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-card via-card to-primary/5" />
          <div className="pointer-events-none absolute -left-24 -top-24 -z-10 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />

          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" />
            {t("home_hero_kicker")}
          </span>

          <h1 className="mt-4 font-display text-4xl font-black leading-[0.95] tracking-tighter text-foreground sm:text-5xl lg:text-6xl">
            <span className="block">
              {t("home_hero_line1")} {t("home_hero_line2")}
            </span>
            <span className="mt-1 block bg-gradient-to-r from-secondary via-emerald-500 to-primary bg-clip-text text-transparent">
              {t("home_hero_accent")}
            </span>
          </h1>

          <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t("hero_tagline")}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Link
              to="/exams"
              className="group inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:-translate-y-0.5 hover:shadow-xl"
            >
              {t("home_hero_cta_primary")}
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-xl border-2 border-primary/25 px-5 py-3 text-sm font-bold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5"
            >
              <UserPlus className="h-4 w-4" />
              {t("home_hero_cta_secondary")}
            </Link>
          </div>
        </div>

        <HeroPhoto />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-primary/10 px-6 py-3.5 sm:px-8 md:px-12">
        {facts.map(({ Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"
          >
            <Icon className="h-3.5 w-3.5 text-secondary" />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}

/**
 * The classroom photograph, framed rather than bled to the card edge: a ring
 * and a soft shadow keep it reading as a picture on the banner instead of a
 * backdrop the copy happens to sit on.
 *
 * It fills its column on `md` and becomes a short strip above the copy on a
 * phone, where there is no second column to sit beside.
 */
function HeroPhoto() {
  return (
    <div className="order-first p-3 md:order-none md:p-4 md:pl-0">
      <div className="group relative h-full overflow-hidden rounded-2xl bg-primary/5 ring-1 ring-primary/15 shadow-[0_18px_40px_-18px_rgba(15,23,42,0.35)]">
        <picture>
          <source srcSet={HOME_HERO_IMAGE_WEBP} type="image/webp" />
          <img
            src={HOME_HERO_IMAGE}
            alt=""
            width={1000}
            height={455}
            loading="eager"
            decoding="async"
            className="h-40 w-full object-cover object-center transition-transform duration-700 group-hover:scale-[1.03] sm:h-52 md:h-full md:min-h-[18rem]"
          />
        </picture>

        {/* Ties the photo to the card's palette rather than leaving a bright
            rectangle beside the tinted copy column. */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/60 via-slate-950/10 to-transparent" />

        {/* Just the crest: any caption here would repeat the kicker beside it. */}
        <span className="absolute bottom-3 left-3 flex h-8 w-8 items-center justify-center rounded-lg bg-white/95 p-1 shadow-sm ring-1 ring-black/5">
          <img
            src={MUM_LOGO}
            alt=""
            width={32}
            height={32}
            className="h-full w-full object-contain"
          />
        </span>
      </div>
    </div>
  );
}
