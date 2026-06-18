import { useEffect, useState } from "react";

export function WallClock({ size = 36 }: { size?: number }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = now.getSeconds();
  const m = now.getMinutes();
  const h = now.getHours() % 12;
  const secDeg = s * 6;
  const minDeg = m * 6 + s * 0.1;
  const hourDeg = h * 30 + m * 0.5;
  const r = size / 2;
  return (
    <div className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 100 100" className="drop-shadow-md">
        <defs>
          <radialGradient id="face" cx="50%" cy="40%" r="60%">
            <stop offset="0%" stopColor="oklch(0.99 0.01 95)" />
            <stop offset="100%" stopColor="oklch(0.92 0.02 130)" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="url(#face)" stroke="oklch(0.42 0.12 155)" strokeWidth="3" />
        {[...Array(12)].map((_, i) => {
          const a = (i * 30 * Math.PI) / 180;
          const x1 = 50 + Math.sin(a) * 42;
          const y1 = 50 - Math.cos(a) * 42;
          const x2 = 50 + Math.sin(a) * 46;
          const y2 = 50 - Math.cos(a) * 46;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="oklch(0.42 0.12 155)" strokeWidth={i % 3 === 0 ? 2.5 : 1.2} />;
        })}
        <line x1="50" y1="50" x2="50" y2="28" stroke="oklch(0.22 0.04 155)" strokeWidth="3.5" strokeLinecap="round" transform={`rotate(${hourDeg} 50 50)`} />
        <line x1="50" y1="50" x2="50" y2="18" stroke="oklch(0.22 0.04 155)" strokeWidth="2.5" strokeLinecap="round" transform={`rotate(${minDeg} 50 50)`} />
        <line x1="50" y1="55" x2="50" y2="14" stroke="oklch(0.62 0.22 25)" strokeWidth="1.5" strokeLinecap="round" transform={`rotate(${secDeg} 50 50)`} style={{ transition: "transform 0.2s cubic-bezier(.4,2.4,.6,1)" }} />
        <circle cx="50" cy="50" r="3.5" fill="oklch(0.42 0.12 155)" />
        <circle cx="50" cy="50" r="1.5" fill="oklch(0.62 0.22 25)" />
      </svg>
      <span className="hidden md:inline font-mono text-xs text-muted-foreground tabular-nums">
        {String(now.getHours()).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
      </span>
      {void r}
    </div>
  );
}