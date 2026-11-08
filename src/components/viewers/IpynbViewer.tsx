import { useQuery } from "@tanstack/react-query";
import { fileUrl } from "@/features/content/client";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { DownloadButton } from "./DownloadButton";
import type { FileRef } from "@/types";
import { Code, BookOpen } from "lucide-react";

interface IpynbViewerProps {
  file: FileRef;
}

interface NotebookCell {
  cell_type: "markdown" | "code" | "raw";
  source: string | string[];
  execution_count?: number | null;
  outputs?: Array<{
    output_type: string;
    text?: string | string[];
    data?: Record<string, unknown>;
  }>;
}

interface NotebookJson {
  cells: NotebookCell[];
}

export default function IpynbViewer({ file }: IpynbViewerProps) {
  const url = fileUrl(file);

  const {
    data: nb,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["ipynb-json", url],
    queryFn: async ({ signal }) => {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return (await res.json()) as NotebookJson;
    },
    staleTime: Infinity,
  });

  if (error) {
    return (
      <ErrorState
        title="Could not load notebook"
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
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  const cells = nb?.cells || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-(--color-border-subtle) pb-3">
        <div className="flex items-center gap-2">
          <Code size={16} className="text-(--color-primary)" />
          <span className="font-mono text-body-sm font-medium text-(--color-text)">
            {file.path.split("/").pop()}
          </span>
          <span className="text-caption text-(--color-text-subtle)">
            ({cells.length} cells)
          </span>
        </div>
        <DownloadButton file={file} size="sm" />
      </div>

      <div className="space-y-3 font-mono text-body-sm">
        {cells.map((cell, idx) => {
          const rawText = Array.isArray(cell.source)
            ? cell.source.join("")
            : cell.source || "";

          if (cell.cell_type === "markdown") {
            return (
              <div
                key={idx}
                className="rounded-xl border border-[rgba(195,198,215,0.2)] bg-(--color-surface) p-4 font-sans text-body text-(--color-text)"
              >
                <div className="mb-1.5 flex items-center gap-1.5 text-caption font-mono text-(--color-text-subtle)">
                  <BookOpen size={12} />
                  <span>Markdown Cell</span>
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">{rawText}</div>
              </div>
            );
          }

          return (
            <div
              key={idx}
              className="overflow-hidden rounded-xl border border-(--color-border) bg-(--color-container-lowest)"
            >
              {/* Code Input */}
              <div className="flex items-start bg-(--color-container-low)/60 px-3 py-2 text-caption text-(--color-text-subtle) border-b border-(--color-border-subtle)">
                <span className="w-12 shrink-0 select-none text-[10px] text-(--color-primary) font-bold">
                  In [{cell.execution_count ?? " "}]:
                </span>
                <pre className="flex-1 overflow-x-auto text-body-sm text-(--color-text)">
                  <code>{rawText}</code>
                </pre>
              </div>

              {/* Code Outputs if any */}
              {cell.outputs && cell.outputs.length > 0 && (
                <div className="bg-(--color-surface) p-3 border-t border-(--color-border-subtle) text-caption space-y-2">
                  {cell.outputs.map((out, outIdx) => {
                    const textOut = Array.isArray(out.text)
                      ? out.text.join("")
                      : out.text;
                    const pngImg =
                      typeof out.data?.["image/png"] === "string"
                        ? out.data["image/png"]
                        : undefined;

                    return (
                      <div key={outIdx}>
                        {textOut && (
                          <pre className="overflow-x-auto text-(--color-text-muted)">
                            {textOut}
                          </pre>
                        )}
                        {pngImg && (
                          <img
                            src={`data:image/png;base64,${pngImg}`}
                            alt="Notebook output chart"
                            className="max-w-full rounded-lg border border-(--color-border)"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

