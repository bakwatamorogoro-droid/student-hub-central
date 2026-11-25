import { Link } from "@tanstack/react-router";
import { ArrowRight, CameraIcon, CheckCircle2, Smartphone, UserPlus } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * The dashboard opening, built from type and geometry rather than a photograph.
 *
 * The previous hero rotated user-uploaded photos behind the headline. That put
 * a 1–2.6 MB image in the critical path of the first paint, and the copy had to
 * fight whatever the photo happened to show. Here the visual is an inline SVG
 * arch with a tiled octagram, which costs a few hundred bytes, cannot be slow,
 * and leaves the headline as the only thing to read.
 */
export function HomeHero() {
  const { t } = useI18n();

  const facts = [
    { Icon: CameraIcon, label: t("badge_security") },
    { Icon: CheckCircle2, label: t("badge_instant") },
    { Icon: Smartphone, label: t("home_fact_device") },
  ];

  return (
    <section className="animate-fade-in relative mb-6 overflow-hidden rounded-[1.75rem] border border-primary/15 bg-gradient-to-br from-card via-card to-primary/5 shadow-soft md:rounded-[2rem]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-secondary/20 blur-3xl" />
      </div>

      <div className="grid items-center gap-8 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:gap-4 md:p-12">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
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

        <ArchMark />
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

/** A pointed arch with a tiled octagram, drawn rather than photographed. */
function ArchMark() {
  return (
    <div className="relative mx-auto hidden w-[15rem] shrink-0 md:block lg:w-[17rem]">
      <svg
        viewBox="0 0 240 300"
        aria-hidden="true"
        className="h-auto w-full drop-shadow-[0_18px_36px_rgba(0,0,0,0.12)]"
      >
        <defs>
          <linearGradient id="archStroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="currentColor" className="text-secondary" />
            <stop offset="100%" stopColor="currentColor" className="text-primary" />
          </linearGradient>
          <pattern id="archTile" width="40" height="40" patternUnits="userSpaceOnUse">
            <g stroke="currentColor" strokeWidth="0.9" fill="none" className="text-primary/25">
              <rect x="6" y="6" width="28" height="28" />
              <rect x="6" y="6" width="28" height="28" transform="rotate(45 20 20)" />
            </g>
          </pattern>
          <clipPath id="archClip">
            <path d="M20 280V150C20 80 70 35 120 22C170 35 220 80 220 150V280Z" />
          </clipPath>
        </defs>

        <path
          d="M20 280V150C20 80 70 35 120 22C170 35 220 80 220 150V280Z"
          fill="url(#archTile)"
          className="text-primary"
        />
        <path
          d="M20 280V150C20 80 70 35 120 22C170 35 220 80 220 150V280Z"
          fill="none"
          stroke="url(#archStroke)"
          strokeWidth="3"
          strokeLinejoin="round"
          className="text-primary"
        />
        <path
          d="M40 280V158C40 100 80 62 120 50C160 62 200 100 200 158V280"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="5 6"
          className="text-primary/30"
        />

        <g clipPath="url(#archClip)">
          <g className="animate-float text-secondary" style={{ transformOrigin: "120px 150px" }}>
            <path
              d="M142 132a30 30 0 1 0 0 42 24 24 0 1 1 0-42Z"
              fill="currentColor"
              className="text-secondary"
            />
          </g>
        </g>

        <g className="text-primary/40" fill="currentColor">
          <path d="M104 262l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
          <path d="M136 258l2.2 5 5 2.2-5 2.2-2.2 5-2.2-5-5-2.2 5-2.2Z" />
        </g>
      </svg>
    </div>
  );
}
