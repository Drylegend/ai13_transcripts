import { useState } from "react";
import { useProgressStore } from "@/features/progress";
import { progressKeys } from "@/features/content/schemas";
import { FileViewer, DownloadButton } from "@/components/viewers";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { motion, AnimatePresence } from "motion/react";
import type { DayDetail, TranscriptItem } from "@/types";
import {
  FileAudio,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface TranscriptsTabProps {
  day: DayDetail;
  moduleSlug: string;
}

function TranscriptRow({
  item,
  dayNumber,
  moduleSlug,
  isExpanded,
  onToggleExpand,
}: {
  item: TranscriptItem;
  dayNumber: number;
  moduleSlug: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const progressKey = progressKeys.dayTranscript(moduleSlug, dayNumber, item.id);
  const isRead = useProgressStore((state) => state.isCompleted(progressKey));
  const toggleRead = useProgressStore((state) => state.toggleCompleted);

  const orderPad = String(item.order).padStart(2, "0");
  const filename = item.file.path.split("/").pop() || "transcript";

  return (
    <Card className="overflow-hidden p-0 border border-[rgba(195,198,215,0.3)] shadow-xs transition-shadow hover:shadow-sm">
      {/* Header bar of transcript card */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--color-primary-fixed) text-body font-mono font-bold text-(--color-primary)">
            {orderPad}
          </div>
          <div className="min-w-0">
            <h4 className="text-body font-bold text-(--color-text) truncate">
              {item.title}
            </h4>
            <p className="font-mono text-caption text-(--color-text-subtle) truncate">
              {filename} • {(item.file.sizeBytes / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-(--color-border-subtle)">
          <Button
            variant={isRead ? "secondary" : "outline"}
            size="sm"
            onClick={() => toggleRead(progressKey)}
            className="gap-1.5"
          >
            {isRead ? (
              <>
                <CheckCircle2 size={15} className="text-teal-600 dark:text-teal-400" />
                <span className="text-teal-700 dark:text-teal-300">Read</span>
              </>
            ) : (
              <>
                <Circle size={15} className="text-(--color-text-subtle)" />
                <span>Mark Read</span>
              </>
            )}
          </Button>

          <DownloadButton file={item.file} size="sm" variant="outline" label="Download" />

          <Button
            variant={isExpanded ? "secondary" : "primary"}
            size="sm"
            onClick={onToggleExpand}
            className="gap-1.5"
          >
            <span>{isExpanded ? "Hide Reader" : "Click to Read"}</span>
            {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </Button>
        </div>
      </div>

      {/* Expandable Document Viewer (Fetches only when expanded!) */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="reader"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden border-t border-(--color-border) bg-(--color-container-lowest) p-4 sm:p-6"
          >
            <FileViewer file={item.file} />
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export function TranscriptsTab({ day, moduleSlug }: TranscriptsTabProps) {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  if (day.transcripts.length === 0) {
    return (
      <EmptyState
        icon={<FileAudio size={44} strokeWidth={1.5} />}
        title="No lecture transcripts available"
        description="Recorded audio transcripts for this lecture day have not been transcribed yet."
      />
    );
  }

  const handleToggle = (id: string) => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    setExpandedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      // On mobile, only one expanded at a time
      if (isMobile) {
        return [id];
      }
      return [...prev, id];
    });
  };

  return (
    <div className="space-y-4">
      {day.transcripts.map((t) => (
        <TranscriptRow
          key={t.id}
          item={t}
          dayNumber={day.number}
          moduleSlug={moduleSlug}
          isExpanded={expandedIds.includes(t.id)}
          onToggleExpand={() => handleToggle(t.id)}
        />
      ))}
    </div>
  );
}

