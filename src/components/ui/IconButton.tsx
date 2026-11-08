import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const iconButtonVariants = cva(
  "inline-flex items-center justify-center rounded-(--radius-lg) transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-ring) disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        ghost:
          "text-(--color-text-muted) hover:bg-(--color-container) hover:text-(--color-text)",
        outline:
          "text-(--color-text-muted) bg-(--color-surface) border border-(--color-border) hover:bg-(--color-container) hover:text-(--color-text)",
        filled:
          "bg-(--color-container) text-(--color-text) hover:bg-(--color-container-high)",
      },
      size: {
        sm: "h-8 w-8",
        md: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "md",
    },
  }
);

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof iconButtonVariants> & {
    "aria-label": string;
  };

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
IconButton.displayName = "IconButton";

export { IconButton, iconButtonVariants };
export type { IconButtonProps };
