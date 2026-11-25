import { useEffect, useState } from "react";
import { Odometer } from "@/components/Odometer";

const FRAME_MS = 4200;

export type TickerFrame = {
  key: string;
  count: number;
  /** The course code or test label; absent when the frame has nothing to name. */
  name: string | null;
  /** A second line under the caption — academic year, study year. */
  meta: string | null;
  /** The caption under the number. */
  label: string;
};

/**
 * A stat card that cycles through frames in place instead of printing one
 * number, so a fixed slot on the dashboard can carry a list.
 *
 * Rotation pauses on hover and focus, and stops under `prefers-reduced-motion`:
 * a number that moves on its own is exactly what that preference exists for.
 */
export function CountTicker({ frames }: { frames: TickerFrame[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Restart on the first frame whenever a new set arrives, so the card never
  // sits on a frame that no longer exists.
  useEffect(() => {
    setIndex(0);
  }, [frames]);

  useEffect(() => {
    if (paused || reduced || frames.length < 2) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % frames.length);
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [paused, reduced, frames.length]);

  const active = frames[index] ?? frames[0] ?? null;

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="relative"
    >
      {/* Every row is a single non-wrapping line of fixed height. The card sits
          in a grid beside fixed-size siblings, so a frame one line taller than
          the last would shift the whole row of cards on each rotation. */}
      <div className="flex h-8 items-baseline gap-x-2 overflow-hidden whitespace-nowrap">
        <Odometer value={active?.count ?? 0} className="shrink-0 text-2xl font-extrabold" />
        {active?.name && (
          <span
            key={active.key}
            className="animate-fade-in min-w-0 truncate rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold text-primary"
          >
            {active.name}
          </span>
        )}
      </div>

      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[10px] leading-[15px] uppercase text-muted-foreground">
          {active?.label ?? ""}
        </div>

        {frames.length > 1 && (
          <div className="flex h-1 shrink-0 items-center gap-1" aria-hidden="true">
            {frames.map((frame, i) => (
              <span
                key={frame.key}
                className={`h-1 rounded-full transition-all duration-500 ${
                  i === index ? "w-3 bg-primary" : "w-1 bg-primary/25"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Reserved even on frames that have no year to show, so the card never
          changes height as the rotation moves on. */}
      <div className="h-[15px] truncate text-[10px] leading-[15px] tabular-nums text-muted-foreground">
        {active?.meta ?? ""}
      </div>
    </div>
  );
}
