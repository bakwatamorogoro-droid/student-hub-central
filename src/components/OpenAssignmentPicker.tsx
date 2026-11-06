import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, FileText, Sparkles } from "lucide-react";
import { assignmentKindLabel, type AssignmentKind } from "@/lib/assignmentKind";
import type { OpenAssignment } from "@/lib/openAssignments";
import { cn } from "@/lib/utils";

/** What the student has already sent, so the row can say so. */
export type AssignmentPickState = {
  /** Assignment id -> the kind of the submission already on file. */
  submittedKindById?: Record<string, AssignmentKind | undefined>;
};

/**
 * The student's dropdown of the assignments the admin has opened.
 *
 * One list, opened by a single trigger, rather than a grid of cards: the owner
 * asked for a dropdown, and it keeps the page short however many assignments are
 * open. Each row shows its kind, and a row the student has already sent says so
 * — "Presentation Assignment (Group)" — because that is the label the student
 * needs to recognise their own work by.
 *
 * The kind shown for a submitted row is the kind that was *stored*, not the one
 * on the definition: the two can differ if the admin later changed the kind, and
 * the submission is the fact.
 */
export function OpenAssignmentPicker({
  assignments,
  value,
  onChange,
  submittedKindById,
  submittedLabel,
  emptyLabel,
  className,
  id,
}: {
  assignments: OpenAssignment[];
  value: string | null;
  onChange: (id: string) => void;
  submittedKindById?: Record<string, AssignmentKind | undefined>;
  /** Text for a submitted row, e.g. "Umeshatuma". */
  submittedLabel: string;
  /** Shown when nothing is open. */
  emptyLabel: string;
  className?: string;
  id?: string;
}) {
  const byId = useMemo(() => new Map(assignments.map((a) => [a.id, a])), [assignments]);

  if (assignments.length === 0) {
    return (
      <p
        className={cn(
          "rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        {emptyLabel}
      </p>
    );
  }

  const current = value ? byId.get(value) : undefined;
  const currentSubmittedKind = value ? submittedKindById?.[value] : undefined;

  return (
    <div className={cn("space-y-2", className)}>
      <Select value={value ?? ""} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Chagua kazi…" />
        </SelectTrigger>
        <SelectContent>
          {assignments.map((a) => {
            const sentKind = submittedKindById?.[a.id];
            return (
              <SelectItem key={a.id} value={a.id}>
                <span className="flex w-full items-center gap-2">
                  <span className="truncate">{a.title}</span>
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    {assignmentKindLabel(sentKind ?? a.kind)}
                  </Badge>
                </span>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {current && (
        <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="font-normal">
              {assignmentKindLabel(currentSubmittedKind ?? current.kind)}
            </Badge>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3" /> {current.points} alama
            </span>
            {current.dueAt && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarClock className="h-3 w-3" />
                Mwisho: {new Date(current.dueAt).toLocaleString("sw-TZ")}
              </span>
            )}
            {currentSubmittedKind && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <FileText className="h-3 w-3" /> {submittedLabel}
              </span>
            )}
          </div>
          {current.text && (
            <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{current.text}</p>
          )}
          {current.fileUrl && (
            <a
              href={current.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs text-primary underline"
            >
              📄 Pakua maswali
            </a>
          )}
        </div>
      )}
    </div>
  );
}
