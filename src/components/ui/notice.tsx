import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "./utils";

type NoticeVariant = "success" | "warning" | "destructive";

type NoticeProps = HTMLAttributes<HTMLElement> & {
  variant?: NoticeVariant;
};

const variantClasses: Record<NoticeVariant, string> = {
  success: "border-[#bbf7d0] bg-[var(--success-soft)] text-[var(--success)]",
  warning: "border-[#fde68a] bg-[var(--warning-soft)] text-[#713f12]",
  destructive: "border-[#fecaca] bg-[var(--destructive-soft)] text-[#991b1b]",
};

const Notice = forwardRef<HTMLElement, NoticeProps>(
  ({ className, variant = "success", ...props }, ref) => (
    <section
      className={cn(
        "mx-auto mb-3 flex max-w-[1440px] min-w-0 items-start gap-2 rounded-[var(--radius)] border px-3 py-2.5 [&>div]:min-w-0 [&>span]:min-w-0 [&>span]:break-words",
        variantClasses[variant],
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);

Notice.displayName = "Notice";

export { Notice };
