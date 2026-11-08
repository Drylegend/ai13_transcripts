import { Card } from "@/components/ui/Card";
import { CheckCircle2, Clock, CircleDashed } from "lucide-react";

interface LabProgressPanelProps {
  categoryLabel: string;
  done: number;
  inProgress: number;
  notStarted: number;
  total: number;
  percent: number;
}

export function LabProgressPanel({
  categoryLabel,
  done,
  inProgress,
  notStarted,
  total,
  percent,
}: LabProgressPanelProps) {
  return (
    <Card className="mb-6 p-5 sm:p-6 bg-gradient-to-br from-(--color-surface-container-lowest) to-(--color-container-low) border border-[rgba(195,198,215,0.3)] shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-(--color-primary)">
            Category Progress
          </span>
          <h2 className="text-section font-bold text-(--color-text) mt-0.5">
            {categoryLabel}
          </h2>
        </div>

        <div className="flex items-center gap-4 sm:gap-6 text-body-sm">
          <div className="flex items-center gap-1.5 text-(--color-tertiary)">
            <CheckCircle2 size={16} />
            <span className="font-bold">{done}</span>
            <span className="text-(--color-text-subtle) text-caption hidden sm:inline">Done</span>
          </div>

          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
            <Clock size={16} />
            <span className="font-bold">{inProgress}</span>
            <span className="text-(--color-text-subtle) text-caption hidden sm:inline">In Progress</span>
          </div>

          <div className="flex items-center gap-1.5 text-(--color-text-subtle)">
            <CircleDashed size={16} />
            <span className="font-bold">{notStarted}</span>
            <span className="text-(--color-text-subtle) text-caption hidden sm:inline">Not Started</span>
          </div>

          <div className="pl-2 border-l border-(--color-border-subtle) font-mono font-bold text-(--color-text)">
            {percent}%
          </div>
        </div>
      </div>

      {/* Multi-segmented Progress Bar */}
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-(--color-container) flex">
        {total > 0 && done > 0 && (
          <div
            style={{ width: `${(done / total) * 100}%` }}
            className="bg-(--color-tertiary) transition-all duration-300"
            title={`${done} done`}
          />
        )}
        {total > 0 && inProgress > 0 && (
          <div
            style={{ width: `${(inProgress / total) * 100}%` }}
            className="bg-amber-500 transition-all duration-300"
            title={`${inProgress} in progress`}
          />
        )}
      </div>
    </Card>
  );
}

