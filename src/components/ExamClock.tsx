import { useI18n } from "@/lib/i18n";
import { countdownSeconds } from "@/lib/countdown";
import { Clock } from "lucide-react";

/**
 * The exam clock in the header.
 *
 * Shows hours, minutes and seconds as three labelled groups rather than a bare
 * `MM:SS`, because a 60-minute paper reads as `01:00:00` — the student can see
 * the hour they have, not just a number that wraps. The seconds group is
 * tabular so the digits do not jitter as they change, and the whole clock turns
 * amber inside the last five minutes.
 */
export function ExamClock({ seconds }: { seconds: number }) {
  const { t } = useI18n();
  const c = countdownSeconds(seconds);

  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-2.5 py-1 ring-1 transition-colors ${
        c.urgent
          ? "bg-amber-400/20 ring-amber-300/60"
          : "bg-primary-foreground/10 ring-primary-foreground/20"
      }`}
      role="timer"
      aria-live={c.urgent ? "assertive" : "off"}
      aria-label={t("clock_aria", { hours: c.hours, minutes: c.minutes, seconds: c.seconds })}
    >
      <Clock className={`h-4 w-4 shrink-0 ${c.urgent ? "animate-pulse" : ""}`} />
      <div className="flex items-baseline gap-1 font-mono tabular-nums leading-none">
        <TimePart value={c.hours} label={t("clock_hours")} />
        <Sep />
        <TimePart value={c.minutes} label={t("clock_minutes")} />
        <Sep />
        <TimePart value={c.seconds} label={t("clock_seconds")} />
      </div>
      {c.expired && (
        <span className="text-[10px] font-bold uppercase tracking-wide">{t("clock_time_up")}</span>
      )}
    </div>
  );
}

function TimePart({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex items-baseline gap-0.5">
      <span className="min-w-[2ch] text-base font-bold">{String(value).padStart(2, "0")}</span>
      <span className="text-[9px] font-semibold uppercase opacity-70">{label}</span>
    </span>
  );
}

function Sep() {
  return <span className="pb-1 text-base font-bold opacity-50">:</span>;
}
