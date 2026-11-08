import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { FileQuestion } from "lucide-react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-16 text-center",
        className
      )}
    >
      <div className="text-(--color-text-subtle)">
        {icon ?? <FileQuestion size={48} strokeWidth={1.5} />}
      </div>
      <h3 className="text-section font-semibold text-(--color-text)">{title}</h3>
      {description && (
        <p className="max-w-sm text-body-sm text-(--color-text-muted)">
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

