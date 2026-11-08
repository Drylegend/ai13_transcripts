import { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center font-medium transition-colors select-none",
  {
    variants: {
      variant: {
        default:
          "bg-(--color-primary-fixed) text-(--color-on-primary-fixed-variant) border border-(--color-primary-fixed-dim)/40",
        pill:
          "bg-(--color-primary-fixed) text-(--color-primary) border border-transparent rounded-full px-2.5",
        success:
          "bg-(--color-tertiary-fixed)/40 text-(--color-tertiary) border border-(--color-tertiary)/20",
        warning:
          "bg-(--color-amber-container) text-(--color-amber) border border-(--color-amber)/20",
        error:
          "bg-(--color-error-container) text-(--color-error) border border-(--color-error)/20",
        neutral:
          "bg-(--color-container) text-(--color-text-muted) border border-(--color-border-subtle)",
        tile:
          "bg-(--color-primary-fixed) text-(--color-primary) font-mono font-bold rounded-(--radius-lg) justify-center",
      },
      size: {
        sm: "h-5 px-1.5 text-[0.6875rem] rounded-(--radius-sm)",
        md: "h-6 px-2 text-caption rounded-(--radius-md)",
        tile: "h-11 w-11 text-section rounded-(--radius-xl)",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
export type { BadgeProps };
