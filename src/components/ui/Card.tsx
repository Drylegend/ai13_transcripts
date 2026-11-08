import { type HTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const cardVariants = cva("rounded-2xl transition-all duration-200", {
  variants: {
    variant: {
      default:
        "bg-(--color-surface) border border-[rgba(195,198,215,0.25)] dark:border-[rgba(67,70,85,0.35)] shadow-xs hover:shadow-sm",
      interactive:
        "bg-(--color-surface) border border-[rgba(195,198,215,0.25)] dark:border-[rgba(67,70,85,0.35)] shadow-xs hover:shadow-md hover:border-(--color-primary)/30 cursor-pointer",
      raised:
        "bg-(--color-surface) border border-[rgba(195,198,215,0.35)] dark:border-[rgba(67,70,85,0.45)] shadow-sm hover:shadow-md",
      sunken:
        "bg-(--color-container-low) border border-[rgba(195,198,215,0.15)]",
      ghost: "bg-transparent",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

type CardProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants>;

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  )
);
Card.displayName = "Card";

export { Card, cardVariants };
export type { CardProps };
