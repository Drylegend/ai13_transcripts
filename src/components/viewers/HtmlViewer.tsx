import { useQuery } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { fileUrl, fetchText } from "@/features/content/client";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { DownloadButton } from "./DownloadButton";
import type { FileRef } from "@/types";

interface HtmlViewerProps {
  file: FileRef;
}

export default function HtmlViewer({ file }: HtmlViewerProps) {
  const url = fileUrl(file);

  const {
    data: htmlText,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["html-text", url],
    queryFn: async ({ signal }) => {
      return await fetchText(file, signal);
    },
    staleTime: Infinity,
  });

  if (error) {
    return (
      <ErrorState
        title="Could not load HTML document"
        message={error.message}
        onRetry={() => refetch()}
        action={<DownloadButton file={file} />}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const cleanHtml = DOMPurify.sanitize(htmlText || "");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between border-b border-(--color-border-subtle) pb-2">
        <span className="font-mono text-caption text-(--color-text-subtle)">
          {file.path.split("/").pop()}
        </span>
        <DownloadButton file={file} size="sm" variant="ghost" />
      </div>

      <div
        className="prose max-w-none text-body text-(--color-text)"
        dangerouslySetInnerHTML={{ __html: cleanHtml }}
      />
    </div>
  );
}

