import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { countdownLabel, formatDeadline, type GroupWorkStatus } from "@/lib/groupWorkStatus";
import { assignmentKindLabel, type AssignmentKind } from "@/lib/assignmentKind";
import { CalendarClock, CheckCircle2, ClipboardList, Sparkles, Star } from "lucide-react";

/**
 * The group's assignment, summarised on the group page.
 *
 * The group page is where a student already is when they want to know about
 * their group, so the assignment they owe sits here rather than only behind the
 * Assignment menu. The card states one of four things — nothing open, not sent,
 * sent, answered — and links to the page that can act on it.
 *
 * It renders only what it is given: the reads and the deadline arithmetic live
 * in the caller and in `groupWorkStatus.ts`, so this file holds no rules.
 */
export function GroupWorkCard({
  status,
  kind,
  sentAt,
  answerPreview,
}: {
  status: GroupWorkStatus;
  kind: AssignmentKind | null;
  /** When the group sent its work, as a readable date. */
  sentAt: string | null;
  /** The first of the teacher's words, so the card is useful without a click. */
  answerPreview: string | null;
}) {
  const { t, lang } = useI18n();

  if (status.state === "no_assignment") {
    return (
      <Card className="shadow-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-muted-foreground" /> {t("gh_work_title")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
            {t("gh_work_none")}
          </p>
          <Link
            to="/quiz"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/30 px-3 py-2 text-sm font-bold text-primary transition hover:bg-primary/10"
          >
            {t("gh_work_page_cta")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  const state = {
    open: {
      key: "gh_work_open",
      cls: "bg-primary/15 text-primary",
      icon: ClipboardList,
    },
    sent: {
      key: "gh_work_sent",
      cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
      icon: CheckCircle2,
    },
    answered: {
      key: "gh_work_answered",
      cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      icon: Sparkles,
    },
  }[status.state as "open" | "sent" | "answered"];

  const StateIcon = state.icon;
  const deadline = formatDeadline(status.assignment?.dueAt, lang);
  const countdown = countdownLabel(status.daysLeft);
  const cta = status.state === "open" ? t("gh_work_open_cta") : t("gh_work_view_cta");

  return (
    <Card className="shadow-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-primary" /> {t("gh_work_title")}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {status.state === "open" ? t("gh_work_help") : t("gh_work_help_sent")}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={`${state.cls} border-0 font-bold`}>
            <StateIcon className="mr-1 h-3 w-3" />
            {t(state.key)}
          </Badge>
          {status.overdue && (
            <Badge className="border-0 bg-destructive/15 font-bold text-destructive">
              {t("gh_work_overdue")}
            </Badge>
          )}
          {kind && (
            <Badge variant="outline" className="font-normal">
              {assignmentKindLabel(kind)}
            </Badge>
          )}
        </div>

        {status.assignment && (
          <div className="rounded-xl border border-primary/15 bg-primary/5 p-2.5">
            <div className="line-clamp-2 text-sm font-semibold">{status.assignment.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {deadline && (
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" />
                  {t("gh_work_due")}: {deadline}
                </span>
              )}
              {countdown && (
                <span
                  className={
                    status.overdue
                      ? "font-bold text-destructive"
                      : status.daysLeft !== null && status.daysLeft <= 2
                        ? "font-bold text-amber-700 dark:text-amber-400"
                        : ""
                  }
                >
                  {t(countdown.key, countdown.vars)}
                </span>
              )}
              <span>
                {status.assignment.points} {t("gh_work_points")}
              </span>
            </div>
          </div>
        )}

        {sentAt && (
          <p className="text-xs text-muted-foreground">
            {t("gh_work_sent")}: {sentAt}
          </p>
        )}

        {status.state === "answered" && (
          <div className="space-y-1.5 rounded-xl border border-primary/25 bg-primary/5 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-primary">
                <Star className="h-3 w-3" /> {t("gh_work_mark")}
              </span>
              {status.mark ? (
                <>
                  <span className="font-mono text-base font-bold text-primary">{status.mark}</span>
                  {status.grade && (
                    <Badge variant="secondary" className="font-normal">
                      {status.grade}
                    </Badge>
                  )}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
            {status.notes > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {t("gh_work_notes")}: {status.notes}
              </p>
            )}
            {answerPreview && (
              <p className="line-clamp-3 whitespace-pre-wrap text-xs">{answerPreview}</p>
            )}
          </div>
        )}

        <Link
          to="/quiz"
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
        >
          {cta}
        </Link>
      </CardContent>
    </Card>
  );
}
