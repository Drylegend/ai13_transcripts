import { useState } from "react";
import { LazyImage } from "@/components/ui/LazyImage";
import { EmptyState } from "@/components/ui/EmptyState";
import { BoardLightbox } from "./BoardLightbox";
import { fileUrl } from "@/features/content/client";
import type { DayDetail } from "@/types";
import { Presentation, Maximize2 } from "lucide-react";

interface BoardsTabProps {
  day: DayDetail;
}

export function BoardsTab({ day }: BoardsTabProps) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  if (day.boards.length === 0) {
    return (
      <EmptyState
        icon={<Presentation size={44} strokeWidth={1.5} />}
        title="No classroom board work photos"
        description="Photos of board diagrams and instructor illustrations will be displayed here."
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {day.boards.map((b, idx) => {
          // Use thumb if available, fallback to main image
          const displayRef = b.thumb || b.image;
          const aspectRatio = `${b.width} / ${b.height}`;

          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setSelectedIdx(idx)}
              className="group relative overflow-hidden rounded-2xl border border-[rgba(195,198,215,0.3)] bg-(--color-surface) text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-(--color-ring)"
            >
              <div className="relative overflow-hidden" style={{ aspectRatio }}>
                <LazyImage
                  src={fileUrl(displayRef)}
                  alt={b.caption || `Board photo ${idx + 1}`}
                  aspectRatio={aspectRatio}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />

                {/* Hover overlay hint */}
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                  <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-caption font-semibold backdrop-blur-sm">
                    <Maximize2 size={13} />
                    <span>View full screen</span>
                  </div>
                </div>
              </div>

              {b.caption && (
                <div className="p-3 bg-(--color-surface) border-t border-(--color-border-subtle)">
                  <p className="text-body-sm font-semibold text-(--color-text) line-clamp-1">
                    {b.caption}
                  </p>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Lightbox dialog */}
      <BoardLightbox
        boards={day.boards}
        selectedIndex={selectedIdx}
        onClose={() => setSelectedIdx(null)}
        dayNumber={day.number}
      />
    </>
  );
}

