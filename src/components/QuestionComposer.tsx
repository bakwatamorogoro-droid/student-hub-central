import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  CircleCheck,
  Link2,
  ListChecks,
  ListOrdered,
  PenLine,
  Plus,
  ToggleLeft,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ExamAnswerField } from "@/components/ExamAnswerField";
import { QUESTION_TYPE_HINTS, QUESTION_TYPE_LABELS } from "@/lib/examQuestions";
import { useI18n } from "@/lib/i18n";
import {
  draftToRow,
  rowToDraft,
  validateDraft,
  type DraftErrors,
  type QuestionDraft,
} from "@/lib/questionDraft";
import { cn } from "@/lib/utils";

/** The type picker's cards. Icons make the six types scannable at a glance. */
const TYPE_ICONS: Record<string, typeof Check> = {
  true_false: ToggleLeft,
  multiple_choice: CircleCheck,
  multi_select: ListChecks,
  matching: Link2,
  ordering: ListOrdered,
  short_answer: PenLine,
};

type Pair = { left: string; right: string };

type State = {
  question_type: string;
  body: string;
  points: string;
  options: string[];
  choice: string;
  picks: string[];
  answer: string;
  pairs: Pair[];
  order: string[];
  concepts: string;
};

function stateFromRow(row: Parameters<typeof rowToDraft>[0] | null): State {
  if (!row) {
    return {
      question_type: "true_false",
      body: "",
      points: "1",
      // Two blank rows, because a choice question with one choice cannot be
      // answered and the teacher would have to add them one at a time.
      options: ["", ""],
      choice: "",
      picks: [],
      answer: "",
      pairs: [
        { left: "", right: "" },
        { left: "", right: "" },
      ],
      order: ["", ""],
      concepts: "",
    };
  }

  const draft = rowToDraft(row);
  const type = draft.question_type;

  const options =
    type === "multiple_choice" || type === "multi_select"
      ? String(draft.options ?? "")
          .split("\n")
          .filter((s) => s !== "")
      : ["", ""];

  const pairs: Pair[] =
    type === "matching"
      ? String(draft.correct_answer ?? "")
          .split("\n")
          .map((line) => {
            const at = line.indexOf("=");
            return at < 1
              ? { left: line, right: "" }
              : { left: line.slice(0, at), right: line.slice(at + 1) };
          })
      : [
          { left: "", right: "" },
          { left: "", right: "" },
        ];

  const order =
    type === "ordering"
      ? String(draft.correct_answer ?? "")
          .split("\n")
          .filter((s) => s !== "")
      : ["", ""];

  return {
    question_type: type,
    body: String(draft.body ?? ""),
    points: String(draft.points ?? 1),
    options: options.length >= 2 ? options : [...options, ...Array(2 - options.length).fill("")],
    choice: type === "multiple_choice" ? String(draft.correct_answer ?? "") : "",
    picks:
      type === "multi_select"
        ? String(draft.correct_answer ?? "")
            .split("\n")
            .filter(Boolean)
        : [],
    answer:
      type === "true_false" || type === "short_answer" ? String(draft.correct_answer ?? "") : "",
    pairs:
      pairs.length >= 2
        ? pairs
        : [...pairs, ...Array(2 - pairs.length).fill({ left: "", right: "" })],
    order: order.length >= 2 ? order : [...order, ...Array(2 - order.length).fill("")],
    concepts: String(draft.concepts ?? ""),
  };
}

/** The draft the pure validator and the database both understand. */
function draftFromState(s: State): QuestionDraft {
  const base = { question_type: s.question_type, body: s.body, points: s.points };

  switch (s.question_type) {
    case "multiple_choice":
      return { ...base, options: s.options, correct_answer: s.choice };
    case "multi_select":
      return { ...base, options: s.options, correct_answer: s.picks };
    case "matching":
      return {
        ...base,
        correct_answer: Object.fromEntries(
          s.pairs
            .filter((p) => p.left.trim() && p.right.trim())
            .map((p) => [p.left.trim(), p.right.trim()]),
        ),
      };
    case "ordering":
      return { ...base, correct_answer: s.order };
    case "short_answer":
      return { ...base, correct_answer: s.answer, concepts: s.concepts };
    default:
      return { ...base, correct_answer: s.answer };
  }
}

type Props = {
  /** The question being edited, or null for a new one. */
  row?: Parameters<typeof rowToDraft>[0] | null;
  onSave: (draft: QuestionDraft) => Promise<string | null>;
  onCancel: () => void;
  /** Fills a reference answer and its concepts from the knowledge bank or AI. */
  onGenerateReference?: (body: string) => Promise<{ answer: string; concepts: string[] } | null>;
};

/**
 * The question editor.
 *
 * Replaces a form that asked teachers to type the correct answer as free text
 * "exactly as written" in the choices — which is how a correct question came
 * back marked wrong. Answers are now picked from the choices the teacher just
 * entered, so the two cannot disagree.
 *
 * The preview renders the real student control, so what the teacher sees here is
 * what a student gets, down to the lettered choices.
 */
export function QuestionComposer({ row, onSave, onCancel, onGenerateReference }: Props) {
  const { t } = useI18n();
  const [s, setS] = useState<State>(() => stateFromRow(row ?? null));
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [preview, setPreview] = useState<unknown>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const draft = useMemo(() => draftFromState(s), [s]);
  const errors: DraftErrors = useMemo(() => validateDraft(draft), [draft]);
  const errorList = Object.values(errors);

  /** Every draft edit clears a failure, which described the previous draft. */
  const update = (fn: (prev: State) => State) => {
    setSaveError(null);
    setS(fn);
  };

  const set = <K extends keyof State>(key: K, value: State[K]) =>
    update((prev) => ({ ...prev, [key]: value }));

  /**
   * Changing type must not leave a stale answer from the previous type — nor
   * the errors that described it.
   */
  const changeType = (type: string) => {
    setTouched(false);
    update((prev) => ({
      ...prev,
      question_type: type,
      choice: "",
      picks: [],
      answer: "",
      concepts: "",
      pairs:
        prev.pairs.length >= 2
          ? prev.pairs
          : [
              { left: "", right: "" },
              { left: "", right: "" },
            ],
      order: prev.order.length >= 2 ? prev.order : ["", ""],
      options: prev.options.length >= 2 ? prev.options : ["", ""],
    }));
  };

  const save = async () => {
    setTouched(true);
    if (errorList.length > 0) return;

    const built = draftToRow(draft);
    if ("error" in built) return;

    setBusy(true);
    const failure = await onSave({ ...draft, id: row?.id });
    setBusy(false);
    setSaveError(failure);
    if (failure) setTouched(true);
  };

  const move = (list: string[], from: number, to: number) => {
    if (to < 0 || to >= list.length) return list;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  };

  const previewQuestion = {
    id: row?.id ?? "preview",
    question_type: s.question_type,
    body: s.body,
    points: Number(s.points) || 1,
    options: s.options.filter(Boolean),
    correct_answer:
      s.question_type === "matching"
        ? Object.fromEntries(s.pairs.filter((p) => p.left && p.right).map((p) => [p.left, p.right]))
        : s.question_type === "multi_select"
          ? s.picks
          : s.question_type === "ordering"
            ? s.order.filter(Boolean)
            : s.answer,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} className="-ml-2">
          <ChevronLeft className="h-4 w-4" />
          {t("qc_back")}
        </Button>
        <Badge variant="outline">{row ? t("qc_edit") : t("qc_new")}</Badge>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
        <div className="space-y-5">
          <section className="space-y-2">
            <Label>{t("qc_type")}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.keys(QUESTION_TYPE_LABELS).map((type) => {
                const Icon = TYPE_ICONS[type] ?? Check;
                const active = s.question_type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => changeType(type)}
                    aria-pressed={active}
                    className={cn(
                      "flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition",
                      active
                        ? "border-primary bg-primary/10 shadow-[0_0_0_1px_rgb(var(--primary))]"
                        : "border-border/70 bg-card/60 hover:border-primary/45 hover:bg-primary/5",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold leading-tight">
                        {QUESTION_TYPE_LABELS[type]}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                        {QUESTION_TYPE_HINTS[type]}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <Label htmlFor="qc-body">
              {t("qc_body")} <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="qc-body"
              value={s.body}
              onChange={(e) => set("body", e.target.value)}
              placeholder={t("qc_body_ph")}
              rows={3}
              aria-invalid={touched && !!errors.body}
            />
            {touched && errors.body && <ErrorText>{t(errors.body)}</ErrorText>}
          </section>

          {(s.question_type === "multiple_choice" || s.question_type === "multi_select") && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  {t("qc_options")} <span className="text-destructive">*</span>
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => set("options", [...s.options, ""])}
                >
                  <Plus className="h-3 w-3" /> {t("qc_add_option")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {s.question_type === "multiple_choice" ? t("qc_pick_one") : t("qc_pick_many")}
              </p>
              <div className="space-y-2">
                {s.options.map((opt, i) => {
                  const marked =
                    s.question_type === "multiple_choice"
                      ? s.choice === opt && opt !== ""
                      : s.picks.includes(opt) && opt !== "";
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (opt === "") return;
                          if (s.question_type === "multiple_choice") {
                            set("choice", opt);
                          } else {
                            set(
                              "picks",
                              s.picks.includes(opt)
                                ? s.picks.filter((p) => p !== opt)
                                : [...s.picks, opt],
                            );
                          }
                        }}
                        aria-pressed={marked}
                        aria-label={t("qc_mark_correct")}
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center border transition",
                          s.question_type === "multiple_choice" ? "rounded-full" : "rounded-lg",
                          marked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:border-primary/50",
                        )}
                      >
                        {marked ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <span className="text-xs font-bold">{String.fromCharCode(65 + i)}</span>
                        )}
                      </button>
                      <Input
                        value={opt}
                        onChange={(e) => {
                          const next = [...s.options];
                          const before = next[i];
                          next[i] = e.target.value;
                          update((prev) => ({
                            ...prev,
                            options: next,
                            // Renaming a choice must carry the answer with it, or
                            // the saved answer no longer matches any choice.
                            choice: prev.choice === before ? e.target.value : prev.choice,
                            picks: prev.picks.map((p) => (p === before ? e.target.value : p)),
                          }));
                        }}
                        placeholder={`${t("qc_option")} ${i + 1}`}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        disabled={s.options.length <= 2}
                        onClick={() => {
                          const next = s.options.filter((_, j) => j !== i);
                          update((prev) => ({
                            ...prev,
                            options: next,
                            choice: prev.choice === opt ? "" : prev.choice,
                            picks: prev.picks.filter((p) => p !== opt),
                          }));
                        }}
                        aria-label={t("qc_remove_option")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
              {touched && errors.options && <ErrorText>{t(errors.options)}</ErrorText>}
              {touched && errors.correct_answer && (
                <ErrorText>{t(errors.correct_answer)}</ErrorText>
              )}
            </section>
          )}

          {s.question_type === "true_false" && (
            <section className="space-y-2">
              <Label>
                {t("qc_answer")} <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "true", label: t("qc_true"), tone: "emerald" },
                  { value: "false", label: t("qc_false"), tone: "rose" },
                ].map((o) => {
                  const active = s.answer === o.value;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => set("answer", o.value)}
                      aria-pressed={active}
                      className={cn(
                        "rounded-xl border p-3 text-sm font-semibold transition",
                        active
                          ? o.tone === "emerald"
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : "border-rose-500 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                          : "border-border/70 bg-card/60 hover:border-primary/45",
                      )}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              {touched && errors.correct_answer && (
                <ErrorText>{t(errors.correct_answer)}</ErrorText>
              )}
            </section>
          )}

          {s.question_type === "matching" && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  {t("qc_pairs")} <span className="text-destructive">*</span>
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => set("pairs", [...s.pairs, { left: "", right: "" }])}
                >
                  <Plus className="h-3 w-3" /> {t("qc_add_pair")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("qc_pairs_hint")}</p>
              <div className="space-y-2">
                {s.pairs.map((pair, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={pair.left}
                      onChange={(e) => {
                        const next = [...s.pairs];
                        next[i] = { ...next[i], left: e.target.value };
                        set("pairs", next);
                      }}
                      placeholder={t("qc_left")}
                    />
                    <span className="shrink-0 text-muted-foreground">=</span>
                    <Input
                      value={pair.right}
                      onChange={(e) => {
                        const next = [...s.pairs];
                        next[i] = { ...next[i], right: e.target.value };
                        set("pairs", next);
                      }}
                      placeholder={t("qc_right")}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      disabled={s.pairs.length <= 2}
                      onClick={() =>
                        set(
                          "pairs",
                          s.pairs.filter((_, j) => j !== i),
                        )
                      }
                      aria-label={t("qc_remove_pair")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              {touched && errors.correct_answer && (
                <ErrorText>{t(errors.correct_answer)}</ErrorText>
              )}
            </section>
          )}

          {s.question_type === "ordering" && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  {t("qc_order")} <span className="text-destructive">*</span>
                </Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => set("order", [...s.order, ""])}
                >
                  <Plus className="h-3 w-3" /> {t("qc_add_step")}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("qc_order_hint")}</p>
              <div className="space-y-2">
                {s.order.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                      {i + 1}
                    </span>
                    <Input
                      value={item}
                      onChange={(e) => {
                        const next = [...s.order];
                        next[i] = e.target.value;
                        set("order", next);
                      }}
                      placeholder={`${t("qc_step")} ${i + 1}`}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      onClick={() => set("order", move(s.order, i, i - 1))}
                      disabled={i === 0}
                      aria-label={t("qc_move_up")}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      onClick={() => set("order", move(s.order, i, i + 1))}
                      disabled={i === s.order.length - 1}
                      aria-label={t("qc_move_down")}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      disabled={s.order.length <= 2}
                      onClick={() =>
                        set(
                          "order",
                          s.order.filter((_, j) => j !== i),
                        )
                      }
                      aria-label={t("qc_remove_step")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              {touched && errors.correct_answer && (
                <ErrorText>{t(errors.correct_answer)}</ErrorText>
              )}
            </section>
          )}

          {s.question_type === "short_answer" && (
            <section className="space-y-3">
              {onGenerateReference && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <p className="mb-2 text-xs text-muted-foreground">{t("qc_ai_hint")}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    disabled={aiBusy || !s.body.trim()}
                    onClick={async () => {
                      setAiBusy(true);
                      try {
                        const r = await onGenerateReference(s.body);
                        if (!r) return;
                        update((prev) => ({
                          ...prev,
                          answer: r.answer,
                          concepts: r.concepts.length ? r.concepts.join("\n") : prev.concepts,
                        }));
                      } finally {
                        setAiBusy(false);
                      }
                    }}
                  >
                    {aiBusy ? t("qc_ai_busy") : t("qc_ai_generate")}
                  </Button>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="qc-reference">
                  {t("qc_reference")} <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="qc-reference"
                  value={s.answer}
                  onChange={(e) => set("answer", e.target.value)}
                  placeholder={t("qc_reference_ph")}
                  rows={4}
                />
                {touched && errors.correct_answer && (
                  <ErrorText>{t(errors.correct_answer)}</ErrorText>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="qc-concepts">{t("qc_concepts")}</Label>
                <Textarea
                  id="qc-concepts"
                  value={s.concepts}
                  onChange={(e) => set("concepts", e.target.value)}
                  placeholder={t("qc_concepts_ph")}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">{t("qc_concepts_hint")}</p>
              </div>
            </section>
          )}

          <section className="w-32 space-y-2">
            <Label htmlFor="qc-points">{t("qc_points")}</Label>
            <Input
              id="qc-points"
              type="number"
              min={0.5}
              step={0.5}
              value={s.points}
              onChange={(e) => set("points", e.target.value)}
              aria-invalid={touched && !!errors.points}
            />
            {touched && errors.points && <ErrorText>{t(errors.points)}</ErrorText>}
          </section>
        </div>

        <aside className="space-y-2">
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-3 lg:sticky lg:top-2">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {t("qc_preview")}
            </p>
            {s.body.trim() ? (
              <div className="space-y-3 rounded-xl bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap text-sm font-semibold">{s.body}</p>
                  <Badge variant="secondary" className="shrink-0">
                    {s.points || 1}
                  </Badge>
                </div>
                <ExamAnswerField question={previewQuestion} value={preview} onChange={setPreview} />
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
                {t("qc_preview_empty")}
              </p>
            )}
          </div>
        </aside>
      </div>

      {saveError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-xs font-bold text-destructive">{t(saveError)}</p>
        </div>
      )}

      {touched && errorList.length > 0 && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-xs font-bold text-destructive">{t("qc_fix_before_save")}</p>
          <ul className="mt-1 list-inside list-disc text-xs text-destructive/90">
            {errorList.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 border-t pt-3">
        <Button type="button" className="flex-1" onClick={save} disabled={busy}>
          {busy ? t("qc_saving") : t("qc_save")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          {t("qc_cancel")}
        </Button>
      </div>
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-destructive">{children}</p>;
}
