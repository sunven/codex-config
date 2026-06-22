import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./utils";

type SwitchSize = "sm" | "md";

type SwitchProps = Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "size" | "type"> & {
  size?: SwitchSize;
  onCheckedChange?: (checked: boolean) => void;
};

const Switch = forwardRef<HTMLInputElement, SwitchProps>(({
  className,
  size = "md",
  onCheckedChange,
  ...props
}, ref) => (
  <input
    className={cn(
      "relative inline-flex flex-none appearance-none items-center rounded-full border border-[var(--input)] bg-[var(--input)] p-0 transition-[background-color,border-color,opacity] duration-[120ms] before:block before:translate-x-0.5 before:rounded-full before:bg-[var(--card)] before:shadow-[0_1px_2px_rgba(0,0,0,0.16)] before:transition-transform before:duration-[120ms] checked:border-[var(--primary)] checked:bg-[var(--primary)] checked:before:translate-x-[18px] disabled:cursor-not-allowed disabled:opacity-[0.55]",
      size === "sm" ? "h-5 w-9 before:size-3.5" : "h-6 w-[42px] before:size-[18px]",
      className,
    )}
    role="switch"
    type="checkbox"
    onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
    {...props}
    ref={ref}
  />
));

Switch.displayName = "Switch";

export { Switch };
