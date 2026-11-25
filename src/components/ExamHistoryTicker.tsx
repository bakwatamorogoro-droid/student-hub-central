import { useEffect, useState } from "react";
import { Odometer } from "@/components/Odometer";
import { useI18n } from "@/lib/i18n";
import { historyTotal, type ExamHistoryEntry } from "@/lib/examHistory";

const FRAME_MS = 4200;

type Frame = {
  key: string;
  count: number;
  /** The course code or test label; absent on the total frame. */
  name: string | null;
  academicYear: string | null;
  studyYear: number | null;
  isTotal: boolean;
};

/**
 * The "exams taken" card as a record rather than a tally.
 *
 * One frame per exam — count, course code, academic year, study year — with the
 * grand total first, cross-fading in place. That way the card still answers "how
 * many submissions are there" before it starts listing them.
 *
 * Rotation pauses on hover and focus, and stops under `prefers-reduced-motion`:
 * a number that moves on its own is exactly what that preference exists for.
 */
export function ExamHistoryTicker({
  entries,
  total,
}: {
  entries: ExamHistoryEntry[];
  /** The count shown when there is no frame to show — e.g. every submission belongs to a deleted exam. */
  total?: number;
}) {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  const frames: Frame[] = [];
  if (entries.length > 0) {
    frames.push({
      key: "__total",
      // The head-count from the database wins: it also includes submissions
      // whose exam row was deleted, which no per-exam frame can account for.
      count: total ?? historyTotal(entries),
      name: null,
      academicYear: null,
      studyYear: null,
      isTotal: true,
    });
    for (const entry of entries) {
      frames.push({
        key: entry.key,
        count: entry.count,
        name: entry.name,
        academicYear: entry.academicYear,
        studyYear: entry.studyYear,
        isTotal: false,
      });
    }
  } else if (total) {
    frames.push({
      key: "__total",
      count: total,
      name: null,
      academicYear: null,
      studyYear: null,
      isTotal: true,
    });
  }

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Restart on the total whenever a new set arrives, so the card never sits on
  // a frame that no longer exists.
  useEffect(() => {
    setIndex(0);
  }, [entries]);

  useEffect(() => {
    if (paused || reduced || frames.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % frames.length);
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [paused, reduced, frames.length]);

  const active = frames[index] ?? null;
  const value = active?.count ?? 0;

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="relative"
    >
      {/* Every row is a single non-wrapping line of fixed height. The card sits
          in a grid beside fixed-size siblings, so a frame one line taller than
          the last would shift the whole row of cards on each rotation. */}
      <div className="flex h-8 items-baseline gap-x-2 overflow-hidden whitespace-nowrap">
        <Odometer value={value} className="shrink-0 text-2xl font-extrabold" />
        {active && !active.isTotal && active.name && (
          <span
            key={active.key}
            className="animate-fade-in min-w-0 truncate rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary"
          >
            {active.name}
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[10px] leading-[15px] uppercase text-muted-foreground">
          {active?.isTotal ? t("history_total") : t("stat_took_exam")}
        </div>

        {frames.length > 1 && (
          <div className="flex h-1 shrink-0 items-center gap-1" aria-hidden="true">
            {frames.map((frame, i) => (
              <span
                key={frame.key}
                className={`h-1 rounded-full transition-all duration-500 ${
                  i === index ? "w-3 bg-primary" : "w-1 bg-primary/25"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reserved even on the total frame, which has no year to show. */}
      <div className="h-[15px] truncate text-[10px] leading-[15px] tabular-nums text-muted-foreground">
        {active && !active.isTotal
          ? [active.academicYear, active.studyYear && t("year_n", { n: active.studyYear })]
              .filter(Boolean)
              .join(" · ")
          : ""}
      </div>
    </div>
  );
}
