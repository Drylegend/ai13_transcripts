import type { LabStatus } from "@/features/progress";
import { CheckCircle2, Clock, CircleDashed } from "lucide-react";

interface StatusBadgeProps {
  status: LabStatus;
  size?: "sm" | "md";
  className?: string;
}

export function StatusBadge({ status, size = "md", className = "" }: StatusBadgeProps) {
  if (status === "done") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-(--color-tertiary-fixed) text-(--color-tertiary) font-semibold ${
          size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-caption"
        } ${className}`}
      >
        <CheckCircle2 size={size === "sm" ? 12 : 14} />
        Done
      </span>
    );
  }

  if (status === "in-progress") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-semibold ${
          size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-caption"
        } ${className}`}
      >
        <Clock size={size === "sm" ? 12 : 14} />
        In Progress
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full bg-(--color-container) text-(--color-text-subtle) font-semibold ${
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-caption"
      } ${className}`}
    >
      <CircleDashed size={size === "sm" ? 12 : 14} />
      Not Started
    </span>
  );
}

