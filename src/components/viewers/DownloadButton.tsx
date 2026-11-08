import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { Download, Check } from "lucide-react";
import { fileUrl } from "@/features/content/client";
import type { FileRef } from "@/types";

interface DownloadButtonProps extends Omit<ButtonProps, "onClick"> {
  file: FileRef;
  customFilename?: string;
  label?: string;
}

export function DownloadButton({
  file,
  customFilename,
  label = "Download",
  variant = "secondary",
  size = "sm",
  className,
  ...props
}: DownloadButtonProps) {
  const [downloading, setDownloading] = useState(false);

  const url = fileUrl(file);
  const filename =
    customFilename || file.path.split("/").pop() || `download.${file.format}`;

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const res = await fetch(url);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      setTimeout(() => setDownloading(false), 1500);
    } catch {
      // Fallback direct link
      window.open(url, "_blank");
      setDownloading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleDownload}
      className={className}
      aria-label={`Download ${filename}`}
      {...props}
    >
      {downloading ? (
        <>
          <Check size={14} className="text-teal-600 dark:text-teal-400" />
          <span>Downloaded</span>
        </>
      ) : (
        <>
          <Download size={14} />
          <span>{label}</span>
        </>
      )}
    </Button>
  );
}

