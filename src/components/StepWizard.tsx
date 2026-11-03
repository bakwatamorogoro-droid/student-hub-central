import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canGoBack, canGoNext, progressPct, stepCounterLabel, stepStates } from "@/lib/stepWizard";

export type WizardStep = {
  key: string;
  /** Short word for the chip: "Group", "Mliopresent", "Tuma". */
  title: string;
  /** One line under the chip title, or the heading when it is the current step. */
  hint?: string;
  /** Blocks Next while it is true, so a step cannot be skipped half-done. */
  blocked?: boolean;
};

/**
 * The bar across the top of a multi-step form.
 *
 * The numbered chips are the desktop view; a small screen gets the same
 * information as "Hatua 2 kati ya 3" plus the bar, because five chips do not fit
 * on a phone and a wrapped row reads as noise. Completed steps show a tick so
 * the student can see how far they have come without counting.
 */
export function WizardProgress({
  steps,
  current,
  onJump,
}: {
  steps: WizardStep[];
  current: number;
  /** Only called for a step already reached; forward steps stay locked. */
  onJump?: (index: number) => void;
}) {
  const states = stepStates(steps.length, current);
  const pct = progressPct(current, steps.length);

  return (
    <div className="rounded-2xl border border-primary/20 bg-card/70 p-3 shadow-soft backdrop-blur">
      <div className="flex items-center justify-between gap-3 sm:hidden">
        <span className="text-xs font-bold uppercase tracking-wide text-primary">
          {stepCounterLabel(current, steps.length)}
        </span>
        <span className="text-xs font-semibold tabular-nums text-muted-foreground">{pct}%</span>
      </div>

      <ol className="hidden items-center gap-1.5 sm:flex">
        {steps.map((s, i) => {
          const state = states[i];
          const reached = state !== "todo";
          return (
            <li key={s.key} className="flex min-w-0 flex-1 items-center gap-1.5">
              <button
                type="button"
                disabled={!reached || !onJump}
                onClick={() => reached && onJump?.(i)}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition ${
                  state === "active"
                    ? "border-primary bg-primary/10 shadow-sm"
                    : state === "done"
                      ? "border-emerald-500/40 bg-emerald-500/10 hover:border-emerald-500/70"
                      : "border-border bg-muted/30 opacity-70"
                } ${reached && onJump ? "cursor-pointer" : "cursor-default"}`}
                aria-current={state === "active" ? "step" : undefined}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                    state === "done"
                      ? "border-emerald-500/50 bg-emerald-500 text-white"
                      : state === "active"
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  {state === "done" ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold">{s.title}</span>
                  {s.hint && (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {s.hint}
                    </span>
                  )}
                </span>
              </button>
              {i < steps.length - 1 && (
                <span
                  className={`h-0.5 w-3 shrink-0 rounded-full ${
                    states[i + 1] !== "todo" ? "bg-emerald-500/50" : "bg-border"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The Back / Next footer.
 *
 * `nextLabel` is what the last step shows instead of Next — "Tuma Kazi" for the
 * assignment, "Hudhuria" for attendance — so the final action is named rather
 * than left as a generic "Next". Next is disabled while `nextDisabled` is set,
 * which is how a step refuses to be skipped half-done, and `busy` swaps the
 * label for a spinner.
 */
export function WizardNav({
  current,
  count,
  onBack,
  onNext,
  nextLabel,
  nextDisabled = false,
  busy = false,
  backLabel = "Nyuma",
}: {
  current: number;
  count: number;
  onBack: () => void;
  onNext: () => void;
  nextLabel?: ReactNode;
  nextDisabled?: boolean;
  busy?: boolean;
  backLabel?: string;
}) {
  const isLast = !canGoNext(current, count);
  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="outline"
        onClick={onBack}
        disabled={!canGoBack(current, count) || busy}
        className="gap-1.5 rounded-xl font-bold"
      >
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </Button>
      <Button
        type="button"
        onClick={onNext}
        disabled={busy || nextDisabled}
        className="flex-1 gap-1.5 rounded-xl font-bold"
      >
        {busy ? (
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : null}
        {nextLabel ?? (isLast ? "Maliza" : "Endelea")}
        {!busy && !isLast ? <ArrowRight className="h-4 w-4" /> : null}
      </Button>
    </div>
  );
}
