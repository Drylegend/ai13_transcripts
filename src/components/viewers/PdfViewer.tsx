import { fileUrl } from "@/features/content/client";
import { DownloadButton } from "./DownloadButton";
import type { FileRef } from "@/types";
import { FileText } from "lucide-react";

interface PdfViewerProps {
  file: FileRef;
}

export default function PdfViewer({ file }: PdfViewerProps) {
  const url = fileUrl(file);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-(--color-border-subtle) pb-3">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-(--color-primary)" />
          <span className="font-mono text-body-sm font-medium text-(--color-text)">
            {file.path.split("/").pop()}
          </span>
        </div>
        <DownloadButton file={file} size="sm" />
      </div>

      <div className="relative w-full h-[700px] rounded-2xl overflow-hidden border border-(--color-border) bg-(--color-container-lowest)">
        <object
          data={url}
          type="application/pdf"
          className="w-full h-full"
        >
          {/* Fallback when PDF cannot be embedded (mobile devices) */}
          <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-(--color-primary-fixed) text-(--color-primary)">
              <FileText size={28} />
            </div>
            <h4 className="text-section font-semibold text-(--color-text)">
              PDF Preview
            </h4>
            <p className="max-w-sm text-body-sm text-(--color-text-muted)">
              Your browser does not support inline PDF viewing. You can download the file directly to view it on your device.
            </p>
            <DownloadButton file={file} label="Download PDF Document" variant="primary" />
          </div>
        </object>
      </div>
    </div>
  );
}

