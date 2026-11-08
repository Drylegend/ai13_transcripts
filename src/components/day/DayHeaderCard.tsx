import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import type { DayDetail } from "@/types";
import {
  FileText,
  FileAudio,
  Presentation,
  HelpCircle,
  Link as LinkIcon,
} from "lucide-react";

interface DayHeaderCardProps {
  day: DayDetail;
  moduleSlug: string;
  moduleTitle?: string;
}

export function DayHeaderCard({
  day,
  moduleSlug,
  moduleTitle,
}: DayHeaderCardProps) {
  const dayPad = String(day.number).padStart(2, "0");

  return (
    <div className="rounded-2xl border border-[rgba(195,198,215,0.3)] bg-(--color-surface) p-6 sm:p-8 shadow-xs space-y-4">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4 min-w-0">
          {/* Big number tile "01" */}
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-(--color-primary-fixed) font-mono text-page font-bold text-(--color-primary) shadow-xs">
            {dayPad}
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/m/${moduleSlug}`}
                className="text-[11px] font-semibold uppercase tracking-wider text-(--color-primary) hover:underline truncate max-w-xs"
              >
                {moduleTitle || moduleSlug}
              </Link>
              <span className="text-(--color-text-subtle)">•</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-(--color-text-subtle)">
                Day {day.number}
              </span>
            </div>

            <h1 className="mt-1 text-page font-bold text-(--color-text)">
              {day.title}
            </h1>

            {day.subtitle && (
              <p className="mt-1 text-section font-normal text-(--color-text-muted)">
                {day.subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Content Pills Bar */}
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end shrink-0">
          {day.summary && (
            <Badge variant="pill" size="sm">
              <FileText size={12} className="mr-1" />
              Summary
            </Badge>
          )}

          {day.transcripts.length > 0 && (
            <Badge variant="neutral" size="sm">
              <FileAudio size={12} className="mr-1" />
              {day.transcripts.length} Transcripts
            </Badge>
          )}

          {day.boards.length > 0 && (
            <Badge variant="neutral" size="sm">
              <Presentation size={12} className="mr-1" />
              {day.boards.length} Boards
            </Badge>
          )}

          {day.questions.length > 0 && (
            <Badge variant="neutral" size="sm">
              <HelpCircle size={12} className="mr-1" />
              {day.questions.length} Questions
            </Badge>
          )}

          {day.links.length > 0 && (
            <Badge variant="neutral" size="sm">
              <LinkIcon size={12} className="mr-1" />
              {day.links.length} Links
            </Badge>
          )}
        </div>
      </div>

      {day.description && (
        <p className="border-t border-(--color-border-subtle) pt-4 text-body text-(--color-text-muted) leading-relaxed">
          {day.description}
        </p>
      )}
    </div>
  );
}

