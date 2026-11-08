import { useState, useMemo, useRef, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { PageHeaderBar } from "@/components/layout";
import { useVisuals, useModule } from "@/features/content/hooks";
import { fileUrl } from "@/features/content/client";
import { LazyImage } from "@/components/ui/LazyImage";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Lightbox, type LightboxItem } from "@/components/common/Lightbox";
import type { VisualItem } from "@/types";
import {
  PenTool,
  Presentation,
  Grid,
  Maximize2,
  Calendar,
  FlaskConical,
} from "lucide-react";

const INITIAL_BATCH_SIZE = 24;
const BATCH_INCREMENT = 24;

export default function VisualNotesPage() {
  const { moduleSlug } = useParams<{ moduleSlug: string }>();
  const { data: visualsData, isLoading } = useVisuals(moduleSlug);
  const { data: module } = useModule(moduleSlug);

  const [typeFilter, setTypeFilter] = useState<"all" | "doodle" | "board">("all");
  const [dayFilter, setDayFilter] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(INITIAL_BATCH_SIZE);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const [prevFilter, setPrevFilter] = useState({ typeFilter, dayFilter });
  if (prevFilter.typeFilter !== typeFilter || prevFilter.dayFilter !== dayFilter) {
    setPrevFilter({ typeFilter, dayFilter });
    setVisibleCount(INITIAL_BATCH_SIZE);
  }

  const items = useMemo(() => visualsData?.items ?? [], [visualsData]);

  // Collect unique days for dropdown filter
  const availableDays = useMemo(() => {
    const days = new Set<number>();
    items.forEach((item) => {
      if (item.type === "board" && item.dayNumber !== undefined) {
        days.add(item.dayNumber);
      }
    });
    return Array.from(days).sort((a, b) => a - b);
  }, [items]);

  // Counts for filter chips
  const counts = useMemo(() => {
    let board = 0;
    let doodle = 0;
    items.forEach((it) => {
      if (it.type === "board") board++;
      else if (it.type === "doodle") doodle++;
    });
    return {
      all: items.length,
      board,
      doodle,
    };
  }, [items]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (typeFilter !== "all" && item.type !== typeFilter) {
        return false;
      }
      if (dayFilter !== "all" && item.type === "board") {
        if (String(item.dayNumber) !== dayFilter) return false;
      }
      return true;
    });
  }, [items, typeFilter, dayFilter]);

  // IntersectionObserver sentinel for smooth infinite scrolling
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => prev + BATCH_INCREMENT);
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [filteredItems.length]);

  const displayedItems = filteredItems.slice(0, visibleCount);
  const hasMore = visibleCount < filteredItems.length;

  // Convert filtered items to Lightbox items
  const lightboxItems: LightboxItem[] = useMemo(() => {
    return filteredItems.map((item, idx) => {
      let downloadName = `visual-${idx + 1}.${item.image.format}`;
      let sourceLink: { label: string; url: string } | undefined;

      if (item.type === "board" && item.dayNumber !== undefined) {
        downloadName = `day-${String(item.dayNumber).padStart(2, "0")}-board.${item.image.format}`;
        sourceLink = {
          label: `View Day ${item.dayNumber}`,
          url: `/m/${moduleSlug}/day/${item.dayNumber}?tab=boards`,
        };
      } else if (item.type === "doodle" && item.labId) {
        downloadName = `lab-${item.labId}-sketch.${item.image.format}`;
        sourceLink = {
          label: "View Lab",
          url: `/m/${moduleSlug}/labs/${item.labId}?tab=sketch`,
        };
      }

      return {
        id: item.id,
        image: item.image,
        thumb: item.thumb,
        caption: item.caption,
        downloadName,
        sourceLink,
      };
    });
  }, [filteredItems, moduleSlug]);

  return (
    <div className="pb-16">
      <PageHeaderBar currentPageType="visual-notes" />

      {/* Page Heading */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-page font-bold text-(--color-text)">
            Visual Notes &amp; Sketches
          </h1>
          <p className="mt-1 text-body-sm text-(--color-text-muted)">
            Complete high-resolution archive of whiteboard diagrams and architecture sketches
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-6">
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24 rounded-xl" />
            <Skeleton className="h-10 w-32 rounded-xl" />
            <Skeleton className="h-10 w-36 rounded-xl" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <Skeleton className="h-64 w-full rounded-2xl" />
            <Skeleton className="h-72 w-full rounded-2xl" />
            <Skeleton className="h-60 w-full rounded-2xl" />
          </div>
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <EmptyState
          icon={<PenTool size={48} strokeWidth={1.5} />}
          title="No visual notes found"
          description="Whiteboard photographs and architectural doodles will be gathered here automatically."
        />
      )}

      {!isLoading && items.length > 0 && (
        <>
          {/* Filters Bar */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-(--color-border-subtle) pb-4">
            {/* Type Filter Chips */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTypeFilter("all")}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-caption font-semibold transition-all ${
                  typeFilter === "all"
                    ? "bg-(--color-primary) text-white shadow-xs"
                    : "bg-(--color-container-low) text-(--color-text-muted) hover:bg-(--color-container) hover:text-(--color-text)"
                }`}
              >
                <Grid size={14} />
                <span>All Visuals</span>
                <span className="font-mono text-[11px] opacity-80">({counts.all})</span>
              </button>

              <button
                type="button"
                onClick={() => setTypeFilter("doodle")}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-caption font-semibold transition-all ${
                  typeFilter === "doodle"
                    ? "bg-(--color-primary) text-white shadow-xs"
                    : "bg-(--color-container-low) text-(--color-text-muted) hover:bg-(--color-container) hover:text-(--color-text)"
                }`}
              >
                <FlaskConical size={14} />
                <span>Lab Sketches</span>
                <span className="font-mono text-[11px] opacity-80">({counts.doodle})</span>
              </button>

              <button
                type="button"
                onClick={() => setTypeFilter("board")}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-caption font-semibold transition-all ${
                  typeFilter === "board"
                    ? "bg-(--color-primary) text-white shadow-xs"
                    : "bg-(--color-container-low) text-(--color-text-muted) hover:bg-(--color-container) hover:text-(--color-text)"
                }`}
              >
                <Presentation size={14} />
                <span>Class Board Work</span>
                <span className="font-mono text-[11px] opacity-80">({counts.board})</span>
              </button>
            </div>

            {/* By Day Dropdown (Only relevant if showing board photos) */}
            {typeFilter !== "doodle" && availableDays.length > 1 && (
              <div className="flex items-center gap-2 text-caption">
                <span className="text-(--color-text-subtle) font-semibold flex items-center gap-1">
                  <Calendar size={14} />
                  Day:
                </span>
                <select
                  value={dayFilter}
                  onChange={(e) => setDayFilter(e.target.value)}
                  className="rounded-xl border border-(--color-border) bg-(--color-surface) px-3 py-1.5 text-caption font-semibold text-(--color-text) focus:outline-none focus:ring-2 focus:ring-(--color-primary)"
                >
                  <option value="all">All Days</option>
                  {availableDays.map((d) => (
                    <option key={d} value={String(d)}>
                      Day {d}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Empty Filter State */}
          {filteredItems.length === 0 ? (
            <EmptyState
              icon={<PenTool size={48} strokeWidth={1.5} />}
              title="No visuals match filter"
              description="Try changing the type filter or selecting another day."
            />
          ) : (
            /* Responsive Masonry Grid */
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
              {displayedItems.map((item: VisualItem, idx: number) => {
                const displayRef = item.thumb || item.image;
                const aspectRatio = `${item.width} / ${item.height}`;

                return (
                  <div
                    key={item.id}
                    className="group relative break-inside-avoid overflow-hidden rounded-2xl border border-[rgba(195,198,215,0.3)] bg-(--color-surface) shadow-xs transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                    onClick={() => setLightboxIndex(idx)}
                  >
                    {/* Thumbnail Image */}
                    <div className="relative overflow-hidden" style={{ aspectRatio }}>
                      <LazyImage
                        src={fileUrl(displayRef)}
                        alt={item.caption || "Visual note"}
                        aspectRatio={aspectRatio}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-103"
                      />

                      {/* Source Chip Overlay */}
                      <div className="absolute top-3 left-3 z-10">
                        {item.type === "board" && item.dayNumber !== undefined && (
                          <Link
                            to={`/m/${moduleSlug}/day/${item.dayNumber}?tab=boards`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md hover:bg-(--color-primary) transition-colors"
                          >
                            <Calendar size={11} />
                            <span>Day {item.dayNumber}</span>
                          </Link>
                        )}

                        {item.type === "doodle" && item.labId && (
                          <Link
                            to={`/m/${moduleSlug}/labs/${item.labId}?tab=sketch`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md hover:bg-(--color-primary) transition-colors"
                          >
                            <FlaskConical size={11} />
                            <span>
                              {module?.labs.find((l) => l.id === item.labId)
                                ? `Lab ${String(module.labs.find((l) => l.id === item.labId)!.number).padStart(2, "0")}`
                                : "Lab"}
                            </span>
                          </Link>
                        )}
                      </div>

                      {/* Hover Overlay */}
                      <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                        <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-3.5 py-1.5 text-caption font-semibold backdrop-blur-sm">
                          <Maximize2 size={14} />
                          <span>View Fullscreen</span>
                        </div>
                      </div>
                    </div>

                    {/* Caption Bar */}
                    {item.caption && (
                      <div className="p-3 bg-(--color-surface) border-t border-(--color-border-subtle)">
                        <p className="text-caption font-semibold text-(--color-text) line-clamp-2">
                          {item.caption}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Sentinel element for infinite scroll */}
          <div ref={sentinelRef} className="h-4 w-full" />

          {/* Manual Load More button if user prefers clicking */}
          {hasMore && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setVisibleCount((prev) => prev + BATCH_INCREMENT)}
              >
                Load More ({filteredItems.length - visibleCount} remaining)
              </Button>
            </div>
          )}

          {/* Reusable Lightbox */}
          <Lightbox
            items={lightboxItems}
            selectedIndex={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            title="Visual Notes Archive"
          />
        </>
      )}
    </div>
  );
}
