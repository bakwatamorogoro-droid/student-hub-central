import { CountTicker, type TickerFrame } from "@/components/CountTicker";
import { useI18n } from "@/lib/i18n";
import { historyTotal, type ExamHistoryEntry } from "@/lib/examHistory";

/**
 * The "exams taken" card as a record rather than a tally.
 *
 * One frame per exam — count, course code, academic year, study year — with the
 * grand total first, cross-fading in place. That way the card still answers "how
 * many submissions are there" before it starts listing them.
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

  const totalFrame = (count: number): TickerFrame => ({
    key: "__total",
    count,
    name: null,
    meta: null,
    label: t("history_total"),
  });

  const frames: TickerFrame[] = [];
  if (entries.length > 0) {
    // The head-count from the database wins: it also includes submissions
    // whose exam row was deleted, which no per-exam frame can account for.
    frames.push(totalFrame(total ?? historyTotal(entries)));
    for (const entry of entries) {
      frames.push({
        key: entry.key,
        count: entry.count,
        name: entry.name,
        meta:
          [entry.academicYear, entry.studyYear && t("year_n", { n: entry.studyYear })]
            .filter(Boolean)
            .join(" · ") || null,
        label: t("stat_took_exam"),
      });
    }
  } else if (total) {
    frames.push(totalFrame(total));
  }

  return <CountTicker frames={frames} />;
}
