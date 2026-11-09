import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[96px] w-full rounded-xl border border-input bg-background/60 px-3.5 py-3 text-base shadow-[var(--shadow-inset)] backdrop-blur-md placeholder:text-muted-foreground/80 transition-[border-color,box-shadow,background-color] duration-300 hover:border-primary/35 focus-visible:border-primary/60 focus-visible:bg-background/85 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
