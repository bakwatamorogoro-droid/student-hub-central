import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // The field sits slightly *below* the surface it is on, the opposite
          // of a card: an inset shadow reads as a well to type into. The ring
          // is drawn on focus only, so a form at rest is quiet.
          "flex h-11 w-full rounded-xl border border-input bg-background/60 px-3.5 py-2 text-base shadow-[var(--shadow-inset)] backdrop-blur-md transition-[border-color,box-shadow,background-color] duration-300 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/80 hover:border-primary/35 focus-visible:border-primary/60 focus-visible:bg-background/85 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/15 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
