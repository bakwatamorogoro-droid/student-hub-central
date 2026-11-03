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
 * The horizontal step rail across the top of a multi-step form.
 *
 * Numbered circles joined by a line, always in one row — on a phone as well as a
 * desktop — because a stepper the student cannot see is not a stepper. The
 * completed circles fill with a tick and the connector behind them turns green,
 * so "how far along am I" is readable at a glance without counting. Each label
 * sits under its circle; the one-line "Hatua 2 kati ya 3" stays for screen
 * readers only, where the visual row carries no information.
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
  const at = states.indexOf("active");

  return (
    <div className="rounded-2xl border border-primary/20 bg-card/70 p-3 shadow-soft backdrop-blur">
      <span className="sr-only">{stepCounterLabel(current, steps.length)}</span>

      <ol className="flex items-start">
        {steps.map((s, i) => {
          const state = states[i];
          const reached = state !== "todo";
          const jumpable = reached && !!onJump;
          return (
            <li key={s.key} className={`flex items-start ${i < steps.length - 1 ? "flex-1" : ""}`}>
              <button
                type="button"
                disabled={!jumpable}
                onClick={() => jumpable && onJump?.(i)}
                className={`flex min-w-0 flex-col items-center gap-1.5 ${
                  jumpable ? "cursor-pointer" : "cursor-default"
                }`}
                aria-current={state === "active" ? "step" : undefined}
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition ${
                    state === "done"
                      ? "border-emerald-500 bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                      : state === "active"
                        ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/30 ring-4 ring-primary/15"
                        : "border-border bg-background text-muted-foreground"
                  }`}
                >
                  {state === "done" ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <span
                  className={`max-w-[5.5rem] text-center text-[11px] font-bold leading-tight sm:max-w-none ${
                    state === "todo" ? "text-muted-foreground" : "text-foreground"
                  }`}
                >
                  {s.title}
                </span>
              </button>
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={`mt-4 h-1 min-w-3 flex-1 rounded-full transition-colors ${
                    states[i + 1] !== "todo"
                      ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                      : "bg-border"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>

      {at >= 0 && steps[at]?.hint && (
        <p className="mt-2.5 text-center text-[11px] text-muted-foreground">{steps[at].hint}</p>
      )}

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
