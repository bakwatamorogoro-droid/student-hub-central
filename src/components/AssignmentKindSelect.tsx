import {
  ASSIGNMENT_KINDS,
  ASSIGNMENT_KIND_HINTS,
  ASSIGNMENT_KIND_LABELS,
  normalizeAssignmentKind,
  type AssignmentKind,
} from "@/lib/assignmentKind";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * The admin's picker for an assignment's kind.
 *
 * A dropdown rather than three radio buttons because the labels are long and the
 * panel already carries a lot: "Presentation Assignment (Group)" does not fit on
 * a phone beside a radio. The three choices are the whole set — see
 * `assignmentKind.ts` — and the hint under the trigger explains the one that is
 * currently selected, so the admin does not have to guess what "Normal" means.
 */
export function AssignmentKindSelect({
  value,
  onChange,
  className,
  id,
}: {
  value: string | null | undefined;
  onChange: (kind: AssignmentKind) => void;
  className?: string;
  id?: string;
}) {
  const current = normalizeAssignmentKind(value);
  return (
    <div className={cn("space-y-1", className)}>
      <Select value={current} onValueChange={(v) => onChange(normalizeAssignmentKind(v))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ASSIGNMENT_KINDS.map((kind) => (
            <SelectItem key={kind} value={kind}>
              {ASSIGNMENT_KIND_LABELS[kind]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">{ASSIGNMENT_KIND_HINTS[current]}</p>
    </div>
  );
}
