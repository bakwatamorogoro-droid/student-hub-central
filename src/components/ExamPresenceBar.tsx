import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/lib/i18n";
import {
  buildPresence,
  EMPTY_PRESENCE,
  formatCount,
  presenceInitials,
  presenceJitter,
  presencePollDelay,
  PRESENCE_SAMPLE,
  type ExamPresence,
  type PresenceSample,
} from "@/lib/examPresence";
import { Radio, Users } from "lucide-react";

/**
 * The live strip on the exam page: who else is writing this paper right now.
 *
 * Two `head: true` counts answer "how many", and a six-row select answers "who".
 * Nothing here downloads the cohort. At ten thousand sitters a full fetch would
 * be tens of thousands of rows per poll per browser, which is what made the old
 * panel unusable at scale.
 *
 * Every query failure is swallowed: a student mid-exam must never see an error
 * because a social counter could not be refreshed.
 */
export function ExamPresenceBar({ examId, active }: { examId: string; active: boolean }) {
  const { t } = useI18n();
  const [presence, setPresence] = useState<ExamPresence>(EMPTY_PRESENCE);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!active || !examId) return;
    cancelled.current = false;

    const load = async () => {
      try {
        const [writing, finished, sample] = await Promise.all([
          supabase
            .from("submissions")
            .select("id", { count: "exact", head: true })
            .eq("exam_id", examId)
            .is("submitted_at", null)
            .not("started_at", "is", null),
          supabase
            .from("submissions")
            .select("id", { count: "exact", head: true })
            .eq("exam_id", examId)
            .not("submitted_at", "is", null),
          supabase
            .from("submissions")
            .select("reg_no, student_id")
            .eq("exam_id", examId)
            .is("submitted_at", null)
            .not("started_at", "is", null)
            .order("started_at", { ascending: true })
            .limit(PRESENCE_SAMPLE),
        ]);

        if (cancelled.current) return;

        // Names live in `students`; asking for six ids is cheaper and more
        // predictable than an embedded join, whose shape varies with how
        // PostgREST infers the relationship.
        const rows = (sample.data ?? []) as Array<{ reg_no: string; student_id: string }>;
        const ids = rows.map((r) => r.student_id).filter(Boolean);
        const nameById = new Map<string, string>();
        if (ids.length > 0) {
          const { data: people } = await supabase
            .from("students")
            .select("id, full_name")
            .in("id", ids);
          for (const p of (people ?? []) as Array<{ id: string; full_name: string }>) {
            nameById.set(p.id, p.full_name);
          }
        }
        if (cancelled.current) return;

        const names: PresenceSample[] = rows.map((row) => ({
          regNo: String(row.reg_no ?? ""),
          fullName: nameById.get(row.student_id) ?? "",
        }));

        const next = buildPresence(writing.count ?? 0, finished.count ?? 0, names);
        setPresence(next);
        setLoaded(true);

        // Back off as the hall fills: a thousand browsers polling every five
        // seconds is load the counter does not need.
        const delay = presencePollDelay(next.writingCount) + presenceJitter(examId);
        timer.current = setTimeout(() => void load(), delay);
      } catch {
        if (!cancelled.current) {
          setLoaded(true);
          timer.current = setTimeout(() => void load(), 30_000);
        }
      }
    };

    // Stagger the first request so a whole cohort loading the page at once does
    // not arrive as one burst.
    const first = setTimeout(() => void load(), presenceJitter(examId, 2000));

    return () => {
      cancelled.current = true;
      clearTimeout(first);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [active, examId]);

  const summary = useMemo(() => {
    if (presence.writingCount > 0 || presence.finishedCount > 0) {
      return t("live_writing_finished", {
        writing: formatCount(presence.writingCount),
        finished: formatCount(presence.finishedCount),
      });
    }
    return loaded ? t("live_hall_empty") : t("live_first_to_start");
  }, [presence, loaded, t]);

  return (
    <section
      aria-live="polite"
      aria-label={t("live_aria")}
      className="mb-4 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 via-card to-secondary/5 px-3 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <Radio className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wide text-primary">
          {t("live_kicker")}
        </span>
        <span className="text-xs font-medium tabular-nums text-foreground">{summary}</span>

        {presence.sample.length > 0 && (
          <span className="ml-auto flex items-center gap-1">
            {presence.sample.map((s) => (
              <span
                key={s.regNo || s.fullName}
                title={`${s.fullName || s.regNo}${s.fullName && s.regNo ? ` · ${s.regNo}` : ""}`}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary ring-1 ring-background"
              >
                {presenceInitials(s.fullName, s.regNo)}
              </span>
            ))}
            {presence.truncated && (
              <span className="ml-1 inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <Users className="h-3 w-3" />+
              </span>
            )}
          </span>
        )}
      </div>
    </section>
  );
}
