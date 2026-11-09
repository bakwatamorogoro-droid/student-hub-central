import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  // Pills, not rectangles: the full radius is what makes a small label read as
  // a tag rather than a tiny button. `tabular-nums` keeps counts from shifting
  // as they tick up. The fills are the same solid brand colours as before —
  // only the geometry and the icon sizing changed.
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground shadow-[0_1px_2px_-1px_rgb(var(--shadow-brand)/0.45)] hover:bg-primary/90",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/90",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground shadow-[0_1px_2px_-1px_rgb(185_28_28/0.45)] hover:bg-destructive/90",
        outline: "border-border/70 text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
