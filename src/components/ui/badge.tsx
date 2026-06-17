import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "./utils";

type BadgeVariant =
  | "secondary"
  | "muted"
  | "success"
  | "warning"
  | "primary"
  | "destructive"
  | "card";
type BadgeSize = "sm" | "count";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
  size?: BadgeSize;
};

const variantClasses: Record<BadgeVariant, string> = {
  secondary: "bg-[var(--secondary)] text-[var(--secondary-foreground)]",
  muted: "bg-[var(--secondary)] text-[var(--muted-foreground)]",
  success: "bg-[var(--success-soft)] text-[var(--success)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
  primary: "bg-[#eff6ff] text-[var(--primary)]",
  destructive: "bg-[var(--destructive-soft)] text-[var(--destructive)]",
  card: "bg-[var(--card)] text-[var(--secondary-foreground)]",
};

const sizeClasses: Record<BadgeSize, string> = {
  sm: "min-w-16 max-w-full justify-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-[7px] py-0.5 text-center text-[0.72rem]",
  count: "min-h-6 flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[0.72rem]",
};

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "secondary", size = "sm", ...props }, ref) => (
    <span
      className={cn(
        "inline-flex items-center border border-[var(--border)] font-bold",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);

Badge.displayName = "Badge";

export { Badge };
