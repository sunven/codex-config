import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./utils";

type ButtonVariant = "default" | "primary" | "ghost";
type ButtonSize = "sm" | "md";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  default:
    "border border-[var(--input)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]",
  primary:
    "border border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] hover:border-[#1d4ed8] hover:bg-[#1d4ed8]",
  ghost: "text-inherit",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-7 px-[9px]",
  md: "min-h-8 px-[11px]",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, type = "button", variant = "default", size = "md", ...props }, ref) => (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius)] transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-[0.55]",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      type={type}
      ref={ref}
      {...props}
    />
  ),
);

Button.displayName = "Button";

export { Button };
