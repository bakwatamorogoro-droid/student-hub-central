import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

const PHRASES = [
  "Inapakia...",
  "Karibu Islamic Studies",
  "Tunaandaa kwa ajili yako...",
  "Subiri kidogo...",
];

export function PageLoader() {
  const isLoading = useRouterState({ select: (s) => s.isLoading || (s as { isTransitioning?: boolean }).isTransitioning });
  const [show, setShow] = useState(false);
  const [phrase, setPhrase] = useState(PHRASES[0]);

  useEffect(() => {
    let t: any;
    if (isLoading) {
      setPhrase(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
      setShow(true);
    } else if (show) {
      t = setTimeout(() => setShow(false), 350);
    }
    return () => clearTimeout(t);
  }, [isLoading]);

  // Show briefly on initial mount too
  useEffect(() => {
    setShow(true);
    const t = setTimeout(() => setShow(false), 700);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center overflow-hidden transition-opacity duration-300 ${
        isLoading ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
      style={{
        background:
          "radial-gradient(ellipse at top, color-mix(in oklab, var(--primary) 25%, transparent), transparent 60%), radial-gradient(ellipse at bottom, color-mix(in oklab, var(--secondary) 30%, transparent), transparent 60%), color-mix(in oklab, var(--background) 92%, transparent)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      {/* Floating orbs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/5 w-72 h-72 rounded-full bg-primary/20 blur-3xl animate-pulse [animation-duration:3s]" />
        <div className="absolute bottom-1/4 right-1/5 w-72 h-72 rounded-full bg-secondary/30 blur-3xl animate-pulse [animation-duration:4s] [animation-delay:0.6s]" />
      </div>

      <div className="relative flex flex-col items-center gap-7 animate-fade-in" style={{ perspective: "800px" }}>
        {/* 3D rotating cube */}
        <div
          className="relative"
          style={{
            width: "88px",
            height: "88px",
            transformStyle: "preserve-3d",
            animation: "pl-spin3d 3.2s linear infinite",
          }}
        >
          {[
            { t: "rotateY(0deg) translateZ(44px)", g: "from-primary to-primary/40" },
            { t: "rotateY(90deg) translateZ(44px)", g: "from-secondary to-secondary/40" },
            { t: "rotateY(180deg) translateZ(44px)", g: "from-accent to-accent/40" },
            { t: "rotateY(-90deg) translateZ(44px)", g: "from-primary/70 to-secondary/40" },
            { t: "rotateX(90deg) translateZ(44px)", g: "from-secondary/70 to-accent/40" },
            { t: "rotateX(-90deg) translateZ(44px)", g: "from-accent/70 to-primary/40" },
          ].map((f, i) => (
            <div
              key={i}
              className={`absolute inset-0 rounded-xl bg-gradient-to-br ${f.g} border border-white/20 shadow-[0_0_40px_color-mix(in_oklab,var(--primary)_40%,transparent)]`}
              style={{ transform: f.t, opacity: 0.85 }}
            />
          ))}
        </div>

        {/* Animated 3D-styled text */}
        <div className="flex flex-col items-center gap-2">
          <h2
            className="text-2xl md:text-3xl font-extrabold tracking-wide bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent"
            style={{
              textShadow:
                "0 1px 0 color-mix(in oklab, var(--primary) 30%, transparent), 0 2px 0 color-mix(in oklab, var(--primary) 22%, transparent), 0 4px 12px color-mix(in oklab, var(--secondary) 40%, transparent)",
              animation: "pl-float 2.4s ease-in-out infinite",
            }}
          >
            {phrase}
          </h2>
          <div className="flex gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
            <span className="w-2 h-2 rounded-full bg-secondary animate-bounce [animation-delay:150ms]" />
            <span className="w-2 h-2 rounded-full bg-accent animate-bounce [animation-delay:300ms]" />
          </div>
          <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground mt-1">
            Islamic Studies Test
          </p>
        </div>
      </div>

      <style>{`
        @keyframes pl-spin3d {
          0%   { transform: rotateX(0deg) rotateY(0deg); }
          100% { transform: rotateX(360deg) rotateY(360deg); }
        }
        @keyframes pl-float {
          0%, 100% { transform: translateY(0) translateZ(0); }
          50%      { transform: translateY(-6px) translateZ(20px); }
        }
      `}</style>
    </div>
  );
}