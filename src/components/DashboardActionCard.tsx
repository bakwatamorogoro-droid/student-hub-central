import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

/**
 * A compact dashboard action tile.
 *
 * The home page used to spend a full-width card on each of these, so the things
 * a student actually opens sat below the fold. A tile is a quarter of the row on
 * a desktop and half the row on a phone, and the tinted gradient plus lifted icon
 * keep the four readable as separate destinations rather than a list.
 *
 * Tone classes are written out in full because Tailwind reads them from source;
 * `from-${tone}-500/15` would compile to nothing.
 */
const TONES = {
  primary: {
    card: "border-primary/25 from-primary/12 hover:border-primary/50",
    icon: "from-primary to-primary/70 shadow-primary/25",
    chip: "border-primary/25 text-primary",
    blob: "bg-primary/10",
    cta: "text-primary",
  },
  violet: {
    card: "border-violet-500/25 from-violet-500/12 hover:border-violet-500/50",
    icon: "from-violet-600 to-fuchsia-600 shadow-violet-500/25",
    chip: "border-violet-500/25 text-violet-600 dark:text-violet-400",
    blob: "bg-violet-500/10",
    cta: "text-violet-600 dark:text-violet-400",
  },
  emerald: {
    card: "border-emerald-500/25 from-emerald-500/12 hover:border-emerald-500/50",
    icon: "from-emerald-500 to-teal-600 shadow-emerald-500/25",
    chip: "border-emerald-500/25 text-emerald-700 dark:text-emerald-400",
    blob: "bg-emerald-500/10",
    cta: "text-emerald-700 dark:text-emerald-400",
  },
  sky: {
    card: "border-sky-500/25 from-sky-500/12 hover:border-sky-500/50",
    icon: "from-sky-500 to-blue-600 shadow-sky-500/25",
    chip: "border-sky-500/25 text-sky-700 dark:text-sky-400",
    blob: "bg-sky-500/10",
    cta: "text-sky-700 dark:text-sky-400",
  },
} as const;

export type DashboardTone = keyof typeof TONES;

export type DashboardActionCardProps = {
  to: string;
  tone: DashboardTone;
  icon: LucideIcon;
  kicker: string;
  title: string;
  sub: string;
  cta: string;
  delay?: number;
};

export function DashboardActionCard({
  to,
  tone,
  icon: Icon,
  kicker,
  title,
  sub,
  cta,
  delay = 0,
}: DashboardActionCardProps) {
  const style = TONES[tone];
  return (
    <Link to={to} className="group animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
      <div
        className={`relative flex h-full flex-col overflow-hidden rounded-2xl border-2 bg-gradient-to-br via-card to-card p-3 shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-float sm:p-4 ${style.card}`}
      >
        <div
          className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl transition-transform duration-500 group-hover:scale-150 ${style.blob}`}
        />
        <div className="relative flex items-center gap-2">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg transition-transform duration-300 group-hover:scale-105 sm:h-9 sm:w-9 ${style.icon}`}
          >
            <Icon className="h-4 w-4" />
          </span>
          <span
            className={`min-w-0 truncate rounded-full border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] sm:px-2 sm:text-[9px] sm:tracking-[0.14em] ${style.chip}`}
          >
            {kicker}
          </span>
        </div>
        {/* Two lines of title are reserved so all four tiles share one height,
            even when "Assignment Group" wraps and "Mahudhurio" does not. */}
        <h3 className="relative mt-2.5 line-clamp-2 min-h-9 font-display text-sm font-extrabold leading-tight tracking-tight sm:mt-3 sm:min-h-10 sm:text-base">
          {title}
        </h3>
        <p className="relative mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
          {sub}
        </p>
        <div
          className={`relative mt-auto flex items-center gap-1 pt-2.5 text-[11px] font-bold sm:gap-1.5 sm:pt-3 sm:text-xs ${style.cta}`}
        >
          {cta}
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
        </div>
      </div>
    </Link>
  );
}
