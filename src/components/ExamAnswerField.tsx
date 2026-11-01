import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  QUESTION_TYPE_LABELS,
  readOptions,
  readOrder,
  readPairs,
  shuffleStable,
  type QuestionLike,
} from "@/lib/examQuestions";
import { toast } from "@/lib/toast";
import { ArrowDown, ArrowUp, Check, Link2, ListOrdered, X } from "lucide-react";

/**
 * One question's answer control.
 *
 * Every type the app can store renders here, so the exam page keeps a single
 * `answers[q.id]` shape and the scoring stays in one place.
 */
type Props = {
  question: QuestionLike;
  value: unknown;
  onChange: (value: unknown) => void;
  isAssignment?: boolean;
};

export function ExamAnswerField({ question: q, value, onChange, isAssignment }: Props) {
  switch (q.question_type) {
    case "true_false":
      return (
        <RadioGroup
          value={typeof value === "string" ? value : ""}
          onValueChange={onChange}
          className="gap-2"
        >
          <ChoiceRow id={`${q.id}-t`} value="true" label="Kweli" tone="emerald" />
          <ChoiceRow id={`${q.id}-f`} value="false" label="Sikweli" tone="rose" />
        </RadioGroup>
      );

    case "multiple_choice": {
      const opts = readOptions(q.options);
      return (
        <RadioGroup
          value={typeof value === "string" ? value : ""}
          onValueChange={onChange}
          className="gap-2"
        >
          {opts.map((opt, i) => (
            <ChoiceRow
              key={i}
              id={`${q.id}-${i}`}
              value={opt}
              label={opt}
              letter={String.fromCharCode(65 + i)}
            />
          ))}
        </RadioGroup>
      );
    }

    case "multi_select": {
      const opts = readOptions(q.options);
      const chosen = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (opt: string, on: boolean) =>
        onChange(on ? [...chosen, opt] : chosen.filter((c) => c !== opt));
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Chagua zote zinazofaa (inaweza kuwa zaidi ya moja).
          </p>
          {opts.map((opt, i) => (
            <label
              key={i}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/70 bg-card/60 p-3 transition hover:border-primary/50 hover:bg-primary/5"
            >
              <Checkbox checked={chosen.includes(opt)} onCheckedChange={(v) => toggle(opt, v === true)} />
              <span className="text-sm font-medium">{opt}</span>
            </label>
          ))}
        </div>
      );
    }

    case "matching": {
      const pairs = readPairs(q.correct_answer);
      const given = (value as Record<string, string>) || {};
      const rights = shuffleStable(
        pairs.map(([, r]) => r),
        q.id,
      );
      const used = new Set(Object.values(given).filter(Boolean));
      return (
        <div className="space-y-2">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Link2 className="h-3 w-3" /> Unganisha kila neno la kushoto na maelezo sahihi.
          </p>
          {pairs.map(([left]) => (
            <div
              key={left}
              className="grid grid-cols-1 items-center gap-2 rounded-xl border border-border/70 bg-card/60 p-3 sm:grid-cols-2"
            >
              <span className="text-sm font-semibold">{left}</span>
              <Select value={given[left] || ""} onValueChange={(v) => onChange({ ...given, [left]: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Chagua jibu…" />
                </SelectTrigger>
                <SelectContent>
                  {rights.map((r) => (
                    <SelectItem key={r} value={r} disabled={used.has(r) && given[left] !== r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      );
    }

    case "ordering": {
      const correctOrder = readOrder(q.correct_answer);
      const current =
        Array.isArray(value) && (value as string[]).length
          ? (value as string[])
          : shuffleStable(correctOrder, q.id);
      const move = (from: number, to: number) => {
        if (to < 0 || to >= current.length) return;
        const next = [...current];
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        onChange(next);
      };
      return (
        <div className="space-y-2">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <ListOrdered className="h-3 w-3" /> Panga kwa mpangilio sahihi, juu hadi chini.
          </p>
          {current.map((item, i) => (
            <div
              key={item}
              className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/60 p-2.5"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium">{item}</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => move(i, i - 1)}
                disabled={i === 0}
                aria-label="Pandisha"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => move(i, i + 1)}
                disabled={i === current.length - 1}
                aria-label="Shusha"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      );
    }

    case "short_answer":
      return (
        <Textarea
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          onPaste={(e) => {
            e.preventDefault();
            toast.error("Paste hairuhusiwi");
          }}
          onCopy={(e) => e.preventDefault()}
          placeholder={isAssignment ? "Andika jibu lako kwa undani…" : "Andika jibu lako…"}
          className={isAssignment ? "min-h-[200px]" : "min-h-[120px]"}
          style={{ userSelect: "text" }}
        />
      );

    default:
      return (
        <Input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Jibu…"
        />
      );
  }
}

function ChoiceRow({
  id,
  value,
  label,
  letter,
  tone,
}: {
  id: string;
  value: string;
  label: string;
  letter?: string;
  tone?: "emerald" | "rose";
}) {
  const toneClass =
    tone === "emerald"
      ? "hover:border-emerald-500/50 hover:bg-emerald-500/5"
      : tone === "rose"
        ? "hover:border-rose-500/50 hover:bg-rose-500/5"
        : "hover:border-primary/50 hover:bg-primary/5";
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-center gap-3 rounded-xl border border-border/70 bg-card/60 p-3 transition ${toneClass}`}
    >
      <RadioGroupItem value={value} id={id} />
      {letter && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">
          {letter}
        </span>
      )}
      <span className="text-sm font-medium">{label}</span>
      {tone === "emerald" && <Check className="ml-auto h-4 w-4 text-emerald-600" />}
      {tone === "rose" && <X className="ml-auto h-4 w-4 text-rose-600" />}
    </label>
  );
}

/** The type label, shown in the builder's question list. */
export function TypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className="shrink-0 text-[10px]">
      {QUESTION_TYPE_LABELS[type] ?? type}
    </Badge>
  );
}
