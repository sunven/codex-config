import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "./utils";

type CompactEmptyProps = HTMLAttributes<HTMLDivElement>;

const CompactEmpty = forwardRef<HTMLDivElement, CompactEmptyProps>(
  ({ className, ...props }, ref) => (
    <div
      className={cn(
        "flex min-h-[92px] items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-5 text-center text-[var(--muted-foreground)]",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);

CompactEmpty.displayName = "CompactEmpty";

export { CompactEmpty };
