import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fileUrl, fetchBlob } from "@/features/content/client";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { DownloadButton } from "./DownloadButton";
import type { FileRef } from "@/types";
import { FileText, ZoomIn, ZoomOut } from "lucide-react";

interface DocxViewerProps {
  file: FileRef;
}

export default function DocxViewer({ file }: DocxViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [renderError, setRenderError] = useState<string | null>(null);

  const url = fileUrl(file);

  // Fetch DOCX as blob using TanStack Query (in-memory cached, staleTime: Infinity)
  const {
    data: blob,
    isLoading,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey: ["docx-blob", url],
    queryFn: async ({ signal }) => {
      return await fetchBlob(file, signal);
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!blob || !containerRef.current) return;

    let isMounted = true;
    setRenderError(null);

    const render = async () => {
      try {
        const { renderAsync } = await import("docx-preview");
        if (!isMounted || !containerRef.current) return;

        // Clear previous content
        containerRef.current.innerHTML = "";

        await renderAsync(blob, containerRef.current, undefined, {
          className: "docx-preview-doc",
          inWrapper: false,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          experimental: true,
        });
      } catch (err) {
        if (isMounted) {
          setRenderError(
            err instanceof Error ? err.message : "Failed to parse document"
          );
        }
      }
    };

    render();

    return () => {
      isMounted = false;
    };
  }, [blob]);

  if (fetchError || renderError) {
    return (
      <div className="p-6">
        <ErrorState
          title="Could not render Word document"
          message={renderError || fetchError?.message}
          onRetry={() => {
            setRenderError(null);
            refetch();
          }}
          action={<DownloadButton file={file} label="Download .docx instead" />}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-8 bg-(--color-surface) rounded-2xl border border-(--color-border-subtle) max-w-4xl mx-auto">
        <div className="flex items-center gap-3 text-body-sm text-(--color-text-muted)">
          <FileText size={18} className="animate-pulse text-(--color-primary)" />
          <span>Loading document preview...</span>
        </div>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Viewer controls bar */}
      <div className="flex items-center justify-between border-b border-(--color-border-subtle) pb-2.5 text-body-sm text-(--color-text-muted)">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-(--color-primary)" />
          <span className="font-medium text-(--color-text) truncate max-w-xs sm:max-w-md">
            {file.path.split("/").pop()}
          </span>
          <span className="text-caption text-(--color-text-subtle)">
            ({(file.sizeBytes / 1024).toFixed(1)} KB)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.7, s - 0.1))}
            disabled={scale <= 0.7}
            className="p-1 rounded hover:bg-(--color-container) disabled:opacity-40"
            aria-label="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <span className="text-caption font-mono w-10 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(1.5, s + 0.1))}
            disabled={scale >= 1.5}
            className="p-1 rounded hover:bg-(--color-container) disabled:opacity-40"
            aria-label="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <DownloadButton file={file} size="sm" variant="ghost" />
        </div>
      </div>

      {/* Document "Paper" canvas (stays white in dark mode like a physical sheet of paper) */}
      <div className="overflow-x-auto p-2 sm:p-6 bg-(--color-container-lowest) rounded-2xl border border-[rgba(195,198,215,0.35)] flex justify-center">
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top center",
            transition: "transform 0.15s ease-out",
          }}
          className="w-full max-w-[850px] min-h-[500px] bg-white text-slate-900 rounded-xl p-6 sm:p-12 shadow-sm border border-slate-200"
        >
          <div
            ref={containerRef}
            className="docx-content prose prose-slate max-w-none text-slate-900 [&_table]:border-collapse [&_table]:w-full [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:p-2 [&_h1]:text-slate-900 [&_h2]:text-slate-900 [&_h3]:text-slate-900 [&_p]:text-slate-800"
          />
        </div>
      </div>
    </div>
  );
}

