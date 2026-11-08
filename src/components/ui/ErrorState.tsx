import type { ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "./Button";
import { cn } from "@/lib/cn";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
  action?: ReactNode;
}

export function ErrorState({
  title = "Something went wrong",
  message = "Failed to load content. Please check your network or try again.",
  onRetry,
  className,
  action,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-(--color-error)/20 bg-(--color-error-container)/30 p-8 text-center sm:p-12",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-(--color-error-container) text-(--color-error)">
        <AlertCircle size={28} strokeWidth={2} />
      </div>

      <div className="space-y-1">
        <h3 className="text-section font-semibold text-(--color-text)">
          {title}
        </h3>
        {message && (
          <p className="max-w-md text-body-sm text-(--color-text-muted)">
            {message}
          </p>
        )}
      </div>

      {onRetry && (
        <Button
          onClick={onRetry}
          variant="secondary"
          size="sm"
          className="mt-2"
        >
          <RefreshCw size={15} />
          Try Again
        </Button>
      )}

      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

