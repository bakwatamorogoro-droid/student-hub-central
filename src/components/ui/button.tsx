import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // The base carries the motion vocabulary: a short spring on press, a lift on
  // hover, and a ring that is drawn outside the control so it never clips the
  // label. `will-change` is deliberately absent — it promotes every button on
  // the page to its own layer, which is worse than the transition it saves.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold cursor-pointer transition-[transform,box-shadow,background-color,border-color,color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Two shadows, not one: a tight seat plus a coloured ambient glow. The
        // glow is the primary hue, so the button looks lit rather than dusty.
        default:
          "bg-primary text-primary-foreground shadow-[0_1px_2px_-1px_rgb(var(--shadow-brand)/0.45),0_10px_28px_-12px_rgb(var(--shadow-brand)/0.55)] hover:bg-primary/92 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_-2px_rgb(var(--shadow-brand)/0.5),0_18px_38px_-14px_rgb(var(--shadow-brand)/0.62)]",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_1px_2px_-1px_rgb(185_28_28/0.45),0_10px_26px_-14px_rgb(185_28_28/0.55)] hover:bg-destructive/90 hover:-translate-y-0.5",
        outline:
          "border border-input bg-background/70 shadow-sm backdrop-blur-md hover:border-primary/45 hover:bg-accent/70 hover:text-accent-foreground hover:-translate-y-0.5",
        secondary:
          "bg-secondary text-secondary-foreground shadow-[0_1px_2px_-1px_rgb(0_182_121/0.45),0_10px_26px_-14px_rgb(0_182_121/0.55)] hover:bg-secondary/88 hover:-translate-y-0.5",
        ghost: "hover:bg-accent/75 hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-2xl px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
