import { useProgressStore } from "@/features/progress";
import { progressKeys } from "@/features/content/schemas";
import { FileViewer, DownloadButton } from "@/components/viewers";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { DayDetail } from "@/types";
import { CheckCircle2, Circle, FileText } from "lucide-react";

interface SummaryTabProps {
  day: DayDetail;
  moduleSlug: string;
}

export function SummaryTab({ day, moduleSlug }: SummaryTabProps) {
  const progressKey = progressKeys.daySummary(moduleSlug, day.number);
  const isRead = useProgressStore((state) => state.isCompleted(progressKey));
  const toggleRead = useProgressStore((state) => state.toggleCompleted);

  if (!day.summary) {
    return (
      <EmptyState
        icon={<FileText size={44} strokeWidth={1.5} />}
        title="No summary document published"
        description="The instructor has not uploaded a summary document for this lecture yet."
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[rgba(195,198,215,0.25)] bg-(--color-surface) p-4 shadow-xs">
        <div className="flex items-center gap-2">
          <Button
            variant={isRead ? "secondary" : "outline"}
            size="sm"
            onClick={() => toggleRead(progressKey)}
            className="gap-2 font-semibold"
          >
            {isRead ? (
              <>
                <CheckCircle2 size={16} className="text-teal-600 dark:text-teal-400" />
                <span className="text-teal-700 dark:text-teal-300">Marked as Read</span>
              </>
            ) : (
              <>
                <Circle size={16} className="text-(--color-text-subtle)" />
                <span>Mark as Read</span>
              </>
            )}
          </Button>
        </div>

        <DownloadButton file={day.summary} label="Download Summary" />
      </div>

      {/* Render Document via FileViewer */}
      <div className="rounded-2xl border border-[rgba(195,198,215,0.25)] bg-(--color-surface) p-4 sm:p-6 shadow-xs">
        <FileViewer file={day.summary} />
      </div>
    </div>
  );
}

