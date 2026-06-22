import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./utils";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    className={cn(
      "min-h-8 w-[220px] max-w-60 min-w-0 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-[9px] text-[var(--foreground)] focus:border-[var(--ring)] focus:shadow-[0_0_0_3px_rgba(163,163,163,0.24)] focus:outline-none disabled:opacity-[0.65] max-[940px]:w-full max-[940px]:max-w-none",
      className,
    )}
    ref={ref}
    {...props}
  />
));

Input.displayName = "Input";

export { Input };
