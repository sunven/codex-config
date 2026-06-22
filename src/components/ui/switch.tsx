import * as SwitchPrimitive from "@radix-ui/react-switch";
import { ComponentPropsWithoutRef, ElementRef, forwardRef } from "react";
import { cn } from "./utils";

type SwitchSize = "sm" | "md";

type SwitchProps = ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & {
  size?: SwitchSize;
};

const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, size = "md", ...props }, ref) => (
  <SwitchPrimitive.Root
    className={cn(
      "relative inline-flex flex-none items-center rounded-full border border-[var(--input)] bg-[var(--input)] p-0 transition-[background-color,border-color,opacity] duration-[120ms] data-[state=checked]:border-[var(--primary)] data-[state=checked]:bg-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-[0.55]",
      size === "sm" ? "h-5 w-9" : "h-6 w-[42px]",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "block translate-x-0.5 rounded-full bg-[var(--card)] shadow-[0_1px_2px_rgba(0,0,0,0.16)] transition-transform duration-[120ms] data-[state=checked]:translate-x-[18px]",
        size === "sm" ? "size-3.5" : "size-[18px]",
      )}
    />
  </SwitchPrimitive.Root>
));

Switch.displayName = SwitchPrimitive.Root.displayName;

export { Switch };
