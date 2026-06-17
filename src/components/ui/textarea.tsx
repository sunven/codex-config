import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "./utils";

type TextareaVariant = "default" | "code";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  variant?: TextareaVariant;
};

const variantClasses: Record<TextareaVariant, string> = {
  default:
    "border border-[var(--input)] bg-[var(--background)] text-[var(--foreground)] focus-visible:border-[var(--ring)] focus-visible:shadow-[0_0_0_3px_rgba(163,163,163,0.24)]",
  code:
    "border border-[#3f3f46] bg-[var(--code-background)] text-[var(--code-foreground)] [tab-size:2] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)]",
};

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <textarea
      className={cn(
        "min-h-32 w-full resize-y rounded-[var(--radius)] p-2.5 text-[0.78rem] leading-[1.4] outline-none",
        variantClasses[variant],
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);

Textarea.displayName = "Textarea";

export { Textarea };
