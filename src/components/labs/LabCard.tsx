import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { prefetchLab } from "@/features/content/hooks";
import { useProgressStore, type LabStatus } from "@/features/progress";
import { StatusBadge } from "./StatusBadge";
import { Card } from "@/components/ui/Card";
import type { LabSummaryItem } from "@/types";
import { FileText, Image as ImageIcon, RotateCw, ChevronRight } from "lucide-react";

interface LabCardProps {
  lab: LabSummaryItem;
  moduleSlug: string;
}

export function LabCard({ lab, moduleSlug }: LabCardProps) {
  const queryClient = useQueryClient();
  const labKey = `${moduleSlug}:lab-${lab.id}`;
  const status = useProgressStore((state) => state.getLabStatus(labKey));
  const cycleStatus = useProgressStore((state) => state.cycleLabStatus);

  const handlePrefetch = () => {
    prefetchLab(queryClient, moduleSlug, lab.id);
  };

  const handleCycle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cycleStatus(labKey);
  };

  const numPad = String(lab.number).padStart(2, "0");

  return (
    <Link
      to={`/m/${moduleSlug}/labs/${lab.id}`}
      onMouseEnter={handlePrefetch}
      onFocus={handlePrefetch}
      className="group block focus:outline-none"
    >
      <Card className="h-full p-5 flex flex-col justify-between gap-4 border border-[rgba(195,198,215,0.3)] shadow-xs transition-all duration-200 group-hover:border-(--color-primary-fixed-dim) group-hover:shadow-md group-hover:-translate-y-0.5">
        <div className="space-y-3">
          {/* Top row: Number badge, Status badge, Quick cycle button */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-(--color-primary-fixed) text-caption font-mono font-bold text-(--color-primary)">
                {numPad}
              </span>
              <StatusBadge status={status as LabStatus} size="sm" />
            </div>

            <button
              type="button"
              onClick={handleCycle}
              title="Cycle status (Not Started -> In Progress -> Done)"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-(--color-text-subtle) hover:bg-(--color-container) hover:text-(--color-primary) transition-colors"
              aria-label="Cycle lab status"
            >
              <RotateCw size={15} />
            </button>
          </div>

          {/* Title */}
          <h3 className="text-body font-bold text-(--color-text) group-hover:text-(--color-primary) transition-colors leading-snug">
            {lab.title}
          </h3>
        </div>

        {/* Bottom row: Feature chips and link arrow */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-(--color-border-subtle)">
          <div className="flex items-center gap-2 text-[11px] font-semibold">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${
                lab.hasNotes
                  ? "bg-(--color-primary-fixed)/50 text-(--color-primary)"
                  : "bg-(--color-container-low) text-(--color-text-subtle)/50"
              }`}
            >
              <FileText size={12} />
              Notes
            </span>

            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 ${
                lab.hasDoodle
                  ? "bg-(--color-primary-fixed)/50 text-(--color-primary)"
                  : "bg-(--color-container-low) text-(--color-text-subtle)/50"
              }`}
            >
              <ImageIcon size={12} />
              Sketch
            </span>
          </div>

          <span className="flex items-center text-caption font-semibold text-(--color-primary) group-hover:translate-x-0.5 transition-transform">
            View <ChevronRight size={14} />
          </span>
        </div>
      </Card>
    </Link>
  );
}

