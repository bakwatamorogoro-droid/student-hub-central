import { Link } from "@tanstack/react-router";
import { ArrowRight, CameraIcon, CheckCircle2, Smartphone, UserPlus } from "lucide-react";
import { useI18n } from "@/lib/i18n";

/**
 * The dashboard opening, built from type and geometry rather than a photograph.
 *
 * The previous hero rotated user-uploaded photos behind the headline. That put
 * a 1–2.6 MB image in the critical path of the first paint, and the copy had to
 * fight whatever the photo happened to show. Here the visual is an inline SVG
 * arch framing a drawn answer sheet, which costs a few hundred bytes, cannot be
 * slow, and leaves the headline as the only thing to read.
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

/**
 * A pointed arch framing a drawn answer sheet: a countdown, three rows with two
 * ticked, and a progress bar. Every stroke is geometry, so it stays sharp at any
 * width and nothing has to be downloaded.
 */
function ArchMark() {
  const arch = "M20 280V150C20 80 70 35 120 22C170 35 220 80 220 150V280Z";

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
            <path d={arch} />
          </clipPath>
        </defs>

        <path d={arch} fill="url(#archTile)" className="text-primary" />
        <path
          d={arch}
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
          {/* Timer: a gold arc of elapsed time over a quiet track. */}
          <circle
            cx="120"
            cy="92"
            r="25"
            fill="none"
            strokeWidth="3"
            className="stroke-primary/15"
          />
          <circle
            cx="120"
            cy="92"
            r="25"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="104 158"
            transform="rotate(-90 120 92)"
            className="stroke-secondary"
          />
          <path
            d="M120 80v12l9 6"
            fill="none"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-primary/70"
          />

          {/* The sheet. */}
          <g>
            <rect
              x="62"
              y="132"
              width="116"
              height="126"
              rx="12"
              strokeWidth="1.5"
              className="fill-card stroke-primary/20"
            />

            {[0, 1, 2].map((row) => {
              const y = 150 + row * 24;
              return (
                <g key={row}>
                  <rect
                    x="74"
                    y={y}
                    width="11"
                    height="11"
                    rx="3"
                    strokeWidth="1.5"
                    className={row < 2 ? "fill-secondary/20 stroke-secondary" : "stroke-primary/25"}
                  />
                  {row < 2 && (
                    <path
                      d={`M76.5 ${y + 5.5}l2.6 2.8 4.4-5.4`}
                      fill="none"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="stroke-secondary"
                    />
                  )}
                  <rect
                    x="92"
                    y={y + 3}
                    width={row === 1 ? 58 : 66}
                    height="5"
                    rx="2.5"
                    className="fill-primary/20"
                  />
                </g>
              );
            })}

            <rect x="74" y="228" width="92" height="7" rx="3.5" className="fill-primary/10" />
            <rect x="74" y="228" width="60" height="7" rx="3.5" className="fill-secondary" />
          </g>
        </g>

        <g className="text-primary/40" fill="currentColor">
          <path d="M52 122l2.6 6 6 2.6-6 2.6-2.6 6-2.6-6-6-2.6 6-2.6Z" />
          <path d="M190 236l2 4.6 4.6 2-4.6 2-2 4.6-2-4.6-4.6-2 4.6-2Z" />
        </g>
      </svg>
    </div>
  );
}
