import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        // A moving highlight reads as work in progress; a flat pulse reads as a
        // broken control. The sweep is the background image, the tint stays the
        // background colour, so the two do not fight.
        "rounded-md bg-primary/10 skeleton-shimmer",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
