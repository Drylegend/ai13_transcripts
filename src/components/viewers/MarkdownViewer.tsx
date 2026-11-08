import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { fileUrl, fetchText } from "@/features/content/client";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { DownloadButton } from "./DownloadButton";
import type { FileRef } from "@/types";
import { Copy, Check } from "lucide-react";

interface MarkdownViewerProps {
  file: FileRef;
}

function CodeBlock({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/\n$/, "");

  const match = /language-(\w+)/.exec(className || "");
  const isInline = !match && !text.includes("\n");

  if (isInline) {
    return (
      <code
        className="rounded bg-(--color-container) px-1.5 py-0.5 font-mono text-[0.85em] text-(--color-primary) font-semibold"
        {...props}
      >
        {children}
      </code>
    );
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="relative my-4 overflow-hidden rounded-xl border border-(--color-border) bg-(--color-container-lowest)">
      <div className="flex items-center justify-between border-b border-(--color-border-subtle) bg-(--color-container-low)/60 px-4 py-1.5 text-caption font-mono text-(--color-text-subtle)">
        <span>{match ? match[1] : "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-(--color-container) text-caption font-sans text-(--color-text-muted)"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check size={12} className="text-teal-600" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-body-sm leading-relaxed text-(--color-text)">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose max-w-none text-body text-(--color-text) space-y-4 [&_h1]:text-page [&_h1]:font-bold [&_h2]:text-section [&_h2]:font-bold [&_h3]:text-body [&_h3]:font-semibold [&_p]:leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-(--color-border) [&_th]:p-2 [&_th]:bg-(--color-container-low) [&_td]:border [&_td]:border-(--color-border) [&_td]:p-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          code: CodeBlock,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default function MarkdownViewer({ file }: MarkdownViewerProps) {
  const url = fileUrl(file);

  const {
    data: markdownText,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["markdown-text", url],
    queryFn: async ({ signal }) => {
      return await fetchText(file, signal);
    },
    staleTime: Infinity,
  });

  if (error) {
    return (
      <ErrorState
        title="Could not load markdown notes"
        message={error.message}
        onRetry={() => refetch()}
        action={<DownloadButton file={file} />}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-7 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-(--color-border-subtle) pb-3">
        <span className="font-mono text-caption text-(--color-text-subtle)">
          {file.path.split("/").pop()}
        </span>
        <DownloadButton file={file} size="sm" variant="ghost" />
      </div>

      <MarkdownRenderer content={markdownText || ""} />
    </div>
  );
}

