import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-ring) disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-(--color-primary) text-(--color-on-primary) hover:bg-(--color-primary-hover) shadow-xs active:opacity-90",
        secondary:
          "bg-(--color-container) text-(--color-text) border border-(--color-border-subtle) hover:bg-(--color-container-high) active:bg-(--color-container-highest)",
        outline:
          "bg-(--color-surface) text-(--color-text) border border-(--color-border) hover:bg-(--color-container-low)",
        ghost:
          "text-(--color-text-muted) hover:bg-(--color-container) hover:text-(--color-text)",
        danger:
          "bg-(--color-error) text-white hover:opacity-90",
        cta:
          "w-full bg-(--color-primary) text-(--color-on-primary) hover:bg-(--color-primary-hover) shadow-sm py-3 px-6 text-body font-semibold rounded-(--radius-xl) justify-between",
      },
      size: {
        sm: "h-8 rounded-(--radius-md) px-3 text-body-sm",
        md: "h-10 rounded-(--radius-lg) px-4 text-body-sm",
        lg: "h-12 rounded-(--radius-lg) px-6 text-body",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };
export type { ButtonProps };
