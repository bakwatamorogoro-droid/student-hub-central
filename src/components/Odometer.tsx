import { useEffect, useRef, useState } from "react";

const DIGITS = "0123456789";

/**
 * A digit-roll counter in the spirit of Odometer.js: each column is a vertical
 * strip of 0-9 that slides to the target digit, and the columns stagger so the
 * number rolls left-to-right. Values only ever grow in this app, so a digit that
 * stays the same does not move and an unchanged prefix does not flicker.
 *
 * Honours `prefers-reduced-motion` by rendering the final value immediately.
 */
export function Odometer({
  value,
  duration = 1200,
  className = "",
  digitClassName = "",
}: {
  value: number;
  duration?: number;
  className?: string;
  digitClassName?: string;
}) {
  const [reduced, setReduced] = useState(false);
  const target = Math.max(0, Math.floor(Number(value) || 0));
  const digits = target.toLocaleString("en-US").split("");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <span
      className={`inline-flex items-baseline tabular-nums ${className}`}
      aria-label={target.toLocaleString("en-US")}
    >
      <span aria-hidden="true" className="inline-flex items-baseline">
        {digits.map((d, i) => (
          <Digit
            key={`${digits.length - i}`}
            char={d}
            delay={reduced ? 0 : i * 90}
            duration={reduced ? 0 : duration}
            className={digitClassName}
          />
        ))}
      </span>
    </span>
  );
}

function Digit({
  char,
  delay,
  duration,
  className,
}: {
  char: string;
  delay: number;
  duration: number;
  className: string;
}) {
  // Separators ("," / ".") have no rolling column.
  if (!DIGITS.includes(char)) {
    return <span className={className}>{char}</span>;
  }
  return (
    <span
      className={`relative inline-block overflow-hidden ${className}`}
      style={{ height: "1em", width: "0.62em" }}
    >
      <span
        className="absolute left-0 top-0 flex w-full flex-col items-center"
        style={{
          transform: `translateY(-${Number(char) * 10}%)`,
          transition: duration
            ? `transform ${duration}ms cubic-bezier(.22,1,.36,1) ${delay}ms`
            : undefined,
        }}
      >
        {DIGITS.split("").map((d) => (
          <span key={d} className="flex h-[1em] items-center justify-center leading-none">
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}
