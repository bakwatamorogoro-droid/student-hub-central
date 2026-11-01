import { Check, Circle, Loader2 } from "lucide-react";

export type ExamStep = {
  key: string;
  label: string;
  hint?: string;
  state: "done" | "active" | "todo" | "busy" | "blocked";
};

/**
 * Hatua za kufanya mtihani, zinaonyeshwa kwa mwanafunzi kabla ya kuanza.
 *
 * Mwanafunzi anajua wazi ana hatua ngapi, yuko wapi, na kile kinachomzuia —
 * kwa hiyo haombi msaudi kwenye kila hatua.
 */
export function ExamStepper({ steps }: { steps: ExamStep[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => {
        const tone =
          s.state === "done"
            ? "border-emerald-500/40 bg-emerald-500/10"
            : s.state === "active"
              ? "border-primary bg-primary/10"
              : s.state === "busy"
                ? "border-amber-500/40 bg-amber-500/10"
                : s.state === "blocked"
                  ? "border-destructive/40 bg-destructive/10"
                  : "border-border bg-muted/30";
        return (
          <li key={s.key} className={`flex items-start gap-3 rounded-xl border p-3 ${tone}`}>
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background text-[11px] font-bold">
              {s.state === "done" ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : s.state === "busy" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
              ) : s.state === "active" ? (
                <Circle className="h-2.5 w-2.5 fill-primary text-primary" />
              ) : (
                i + 1
              )}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{s.label}</div>
              {s.hint && <div className="text-[11px] text-muted-foreground">{s.hint}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Maendeleo ya mtihani: ni maswali mangapi yamejibiwa.
 *
 * Inatoa picha moja ya jumla ili mwanafunzi asirudi kwenye orodha kukagua
 * kila swali.
 */
export function ExamProgress({ answered, total }: { answered: number; total: number }) {
  const pct = total > 0 ? Math.round((answered / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Maendeleo ya Mtihani</span>
        <span className="tabular-nums">
          {answered}/{total} · {pct}%
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Kiolezo cha kuruka kwenye swali lolote la mtihani.
 *
 * Rangi zinaonyesha yaliyojibiwa, kwa hiyo mwanafunzi anaona mapungufu yake
 * kwa mtazamo mmoja bila kusoma kila swali.
 */
export function QuestionPalette({
  items,
  currentId,
  onJump,
}: {
  items: { id: string; answered: boolean }[];
  currentId?: string;
  onJump: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => {
        const isCurrent = item.id === currentId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onJump(item.id)}
            className={`h-8 w-8 rounded-lg border text-xs font-bold transition ${
              isCurrent
                ? "border-primary bg-primary text-primary-foreground shadow"
                : item.answered
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700"
                  : "border-border bg-background text-muted-foreground hover:border-primary/50"
            }`}
            aria-label={`Swali ${i + 1}`}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}
