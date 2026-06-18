import { useI18n } from "@/lib/i18n";

export function Loader({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-6 animate-fade-in">
      <div className="relative w-24 h-24">
        {/* Glow halo */}
        <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-primary via-secondary to-accent opacity-30 blur-2xl animate-pulse" />
        {/* Orbit rings */}
        <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary/60 animate-spin [animation-duration:1.2s]" />
        <div className="absolute inset-2 rounded-full border-2 border-transparent border-b-secondary border-l-secondary/60 animate-spin [animation-duration:1.8s] [animation-direction:reverse]" />
        <div className="absolute inset-4 rounded-full border-2 border-transparent border-t-accent animate-spin [animation-duration:2.4s]" />
        {/* Core dot */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-gradient-to-br from-primary to-secondary shadow-[0_0_20px_var(--primary)] animate-pulse" />
        </div>
      </div>
      <div className="flex flex-col items-center gap-2">
        <p className="text-sm font-semibold tracking-widest uppercase bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
          {label ?? t("loading")}
        </p>
        <div className="flex gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

export function FullPageLoader({ label }: { label?: string }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-background via-primary/5 to-secondary/10">
      {/* Animated mesh background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/20 blur-3xl animate-pulse [animation-duration:4s]" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-secondary/20 blur-3xl animate-pulse [animation-duration:5s] [animation-delay:1s]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[28rem] h-[28rem] rounded-full bg-accent/10 blur-3xl animate-pulse [animation-duration:6s]" />
      </div>
      <div className="relative z-10">
        <Loader label={label} />
      </div>
    </div>
  );
}