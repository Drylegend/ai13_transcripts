import { useState, lazy, Suspense } from "react";
import { DownloadButton } from "./DownloadButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import type { FileRef } from "@/types";
import { AlertTriangle, FileQuestion } from "lucide-react";

// Lazy-loaded format viewers to keep main bundle tiny
const DocxViewer = lazy(() => import("./DocxViewer"));
const MarkdownViewer = lazy(() => import("./MarkdownViewer"));
const HtmlViewer = lazy(() => import("./HtmlViewer"));
const PdfViewer = lazy(() => import("./PdfViewer"));
const IpynbViewer = lazy(() => import("./IpynbViewer"));

interface FileViewerProps {
  file: FileRef;
}

const FIVE_MB = 5 * 1024 * 1024;

export function FileViewer({ file }: FileViewerProps) {
  const [loadLargeAnyway, setLoadLargeAnyway] = useState(false);

  // Heavy file guard
  if (file.sizeBytes > FIVE_MB && !loadLargeAnyway) {
    const sizeMb = (file.sizeBytes / (1024 * 1024)).toFixed(1);
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50/50 p-8 text-center dark:border-amber-900/60 dark:bg-amber-950/20 max-w-xl mx-auto space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200">
          <AlertTriangle size={24} />
        </div>
        <div>
          <h4 className="text-section font-semibold text-(--color-text)">
            Large File Warning ({sizeMb} MB)
          </h4>
          <p className="mt-1 text-body-sm text-(--color-text-muted)">
            This document exceeds 5 MB. Loading it may consume significant bandwidth or slow down your browser.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setLoadLargeAnyway(true)}
          >
            Load Preview Anyway
          </Button>
          <DownloadButton file={file} label="Download Directly" />
        </div>
      </div>
    );
  }

  const fallback = (
    <div className="space-y-4 p-6">
      <Skeleton className="h-7 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );

  switch (file.format) {
    case "docx":
      return (
        <Suspense fallback={fallback}>
          <DocxViewer file={file} />
        </Suspense>
      );
    case "md":
      return (
        <Suspense fallback={fallback}>
          <MarkdownViewer file={file} />
        </Suspense>
      );
    case "html":
      return (
        <Suspense fallback={fallback}>
          <HtmlViewer file={file} />
        </Suspense>
      );
    case "pdf":
      return (
        <Suspense fallback={fallback}>
          <PdfViewer file={file} />
        </Suspense>
      );
    case "ipynb":
      return (
        <Suspense fallback={fallback}>
          <IpynbViewer file={file} />
        </Suspense>
      );
    default:
      return (
        <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-8 text-center space-y-4 max-w-md mx-auto">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-(--color-container) text-(--color-text-muted)">
            <FileQuestion size={24} />
          </div>
          <div>
            <h4 className="text-section font-semibold text-(--color-text)">
              Unsupported Preview Format
            </h4>
            <p className="mt-1 text-body-sm text-(--color-text-muted)">
              Previews are not available for .{file.format} files. You can download the file to view it with native desktop applications.
            </p>
          </div>
          <DownloadButton file={file} label="Download File" variant="primary" />
        </div>
      );
  }
}

