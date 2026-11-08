import { useState, useEffect, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
import { fileUrl } from "@/features/content/client";
import { DownloadButton } from "@/components/viewers/DownloadButton";
import type { FileRef } from "@/types";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  ExternalLink,
} from "lucide-react";

export interface LightboxItem {
  id: string;
  image: FileRef;
  thumb?: FileRef;
  caption?: string;
  downloadName?: string;
  sourceLink?: {
    label: string;
    url: string;
  };
}

export interface LightboxProps {
  items: LightboxItem[];
  selectedIndex: number | null;
  onClose: () => void;
  title?: string;
}

export function Lightbox({
  items,
  selectedIndex,
  onClose,
  title,
}: LightboxProps) {
  const [index, setIndex] = useState(selectedIndex ?? 0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const [prevSelected, setPrevSelected] = useState(selectedIndex);
  if (prevSelected !== selectedIndex) {
    setPrevSelected(selectedIndex);
    if (selectedIndex !== null) {
      setIndex(selectedIndex);
      setIsZoomed(false);
    }
  }

  const currentItem = items[index];
  const total = items.length;

  const handlePrev = useCallback(() => {
    setIsZoomed(false);
    setIndex((i) => (i > 0 ? i - 1 : total - 1));
  }, [total]);

  const handleNext = useCallback(() => {
    setIsZoomed(false);
    setIndex((i) => (i < total - 1 ? i + 1 : 0));
  }, [total]);

  // Preload adjacent images
  useEffect(() => {
    if (total <= 1) return;
    const nextIdx = (index + 1) % total;
    const prevIdx = (index - 1 + total) % total;

    const nextItem = items[nextIdx];
    const prevItem = items[prevIdx];

    if (nextItem) {
      const img1 = new Image();
      img1.src = fileUrl(nextItem.image);
    }
    if (prevItem) {
      const img2 = new Image();
      img2.src = fileUrl(prevItem.image);
    }
  }, [index, items, total]);

  // Keyboard navigation
  useEffect(() => {
    if (selectedIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handlePrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, handlePrev, handleNext]);

  // Touch swipe support
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0]?.clientX ?? null);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0]?.clientX ?? 0;
    const diff = touchStart - touchEnd;
    if (diff > 50) {
      handleNext();
    } else if (diff < -50) {
      handlePrev();
    }
    setTouchStart(null);
  };

  if (selectedIndex === null || !currentItem) return null;

  const altText = currentItem.caption || title || `Visual item ${index + 1}`;

  return (
    <Dialog.Root
      open={selectedIndex !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md transition-opacity animate-in fade-in-0" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col justify-between p-4 sm:p-6 focus:outline-none select-none"
        >
          {/* Top Bar: Counter, Title, Actions & Close */}
          <div className="flex items-center justify-between z-10 gap-2">
            <div className="flex items-center gap-3 text-white/90 min-w-0">
              <span className="shrink-0 rounded-full bg-white/10 px-3 py-1 font-mono text-body-sm font-semibold backdrop-blur-md">
                {index + 1} / {total}
              </span>
              <Dialog.Title className="text-body-sm font-medium text-white/80 hidden sm:inline truncate max-w-md">
                {currentItem.caption || title || `Photo ${index + 1}`}
              </Dialog.Title>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {currentItem.sourceLink && (
                <Link
                  to={currentItem.sourceLink.url}
                  onClick={onClose}
                  className="hidden sm:inline-flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-caption font-semibold text-white hover:bg-white/20 transition-colors"
                >
                  <span>{currentItem.sourceLink.label}</span>
                  <ExternalLink size={14} />
                </Link>
              )}

              <button
                type="button"
                onClick={() => setIsZoomed((z) => !z)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
                aria-label={isZoomed ? "Zoom out" : "Zoom in"}
              >
                {isZoomed ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
              </button>

              <DownloadButton
                file={currentItem.image}
                customFilename={currentItem.downloadName}
                label="Save"
                variant="secondary"
                size="sm"
                className="bg-white/10 text-white hover:bg-white/20 border-white/10"
              />

              <Dialog.Close asChild>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
                  aria-label="Close full-screen photo"
                >
                  <X size={20} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Center Image Canvas */}
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="relative flex-1 flex items-center justify-center overflow-auto p-2"
          >
            <img
              src={fileUrl(currentItem.image)}
              alt={altText}
              onClick={() => setIsZoomed((z) => !z)}
              className={`max-h-[80vh] max-w-full rounded-lg object-contain transition-transform duration-200 cursor-pointer shadow-2xl ${
                isZoomed ? "scale-150 cursor-zoom-out" : "cursor-zoom-in"
              }`}
            />

            {/* Navigation arrows */}
            {total > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrev();
                  }}
                  className="absolute left-2 sm:left-6 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/70 backdrop-blur-sm transition-colors"
                  aria-label="Previous photo"
                >
                  <ChevronLeft size={28} />
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNext();
                  }}
                  className="absolute right-2 sm:right-6 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/70 backdrop-blur-sm transition-colors"
                  aria-label="Next photo"
                >
                  <ChevronRight size={28} />
                </button>
              </>
            )}
          </div>

          {/* Bottom Caption & Controls */}
          <div className="flex flex-col items-center text-center py-2 z-10 gap-1.5">
            {currentItem.caption && (
              <p className="text-body-sm text-white/90 max-w-xl bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full">
                {currentItem.caption}
              </p>
            )}
            <div className="flex items-center gap-3">
              {currentItem.sourceLink && (
                <Link
                  to={currentItem.sourceLink.url}
                  onClick={onClose}
                  className="sm:hidden inline-flex items-center gap-1 text-[12px] font-semibold text-(--color-primary-fixed) underline underline-offset-2"
                >
                  {currentItem.sourceLink.label} &rarr;
                </Link>
              )}
              <span className="text-[11px] text-white/50">
                Click photo to zoom • Arrow keys or swipe to navigate • ESC to close
              </span>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
