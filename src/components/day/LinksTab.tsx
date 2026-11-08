import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import type { DayDetail } from "@/types";
import { ExternalLink, Copy, Check, Link as LinkIcon } from "lucide-react";

interface LinksTabProps {
  day: DayDetail;
}

function getSafeHostname(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.hostname;
    }
  } catch {
    // invalid URL
  }
  return "link";
}

function isValidHttpUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function LinkCard({
  item,
}: {
  item: { label: string; url: string; description?: string };
}) {
  const [copied, setCopied] = useState(false);
  const isValid = isValidHttpUrl(item.url);
  const hostname = getSafeHostname(item.url);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(item.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 border-[rgba(195,198,215,0.3)] hover:border-(--color-primary)/40 transition-colors">
      <div className="flex items-start gap-3.5 min-w-0">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--color-container) text-(--color-primary)">
          <LinkIcon size={18} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-body font-bold text-(--color-text) truncate">
              {item.label}
            </h4>
            <span className="font-mono text-[11px] text-(--color-text-subtle) truncate">
              {hostname}
            </span>
          </div>
          {item.description && (
            <p className="mt-1 text-body-sm text-(--color-text-muted) line-clamp-2">
              {item.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
        <IconButton
          variant="outline"
          size="sm"
          onClick={handleCopy}
          aria-label={`Copy link for ${item.label}`}
          title="Copy URL"
        >
          {copied ? (
            <Check size={14} className="text-teal-600" />
          ) : (
            <Copy size={14} />
          )}
        </IconButton>

        {isValid ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-(--color-primary) px-3 py-1.5 text-body-sm font-semibold text-white hover:bg-(--color-primary-hover) shadow-xs transition-colors"
          >
            <span>Visit</span>
            <ExternalLink size={14} />
          </a>
        ) : (
          <span className="text-caption text-(--color-error)">Invalid Link</span>
        )}
      </div>
    </Card>
  );
}

export function LinksTab({ day }: LinksTabProps) {
  if (day.links.length === 0) {
    return (
      <EmptyState
        icon={<LinkIcon size={44} strokeWidth={1.5} />}
        title="No external links added"
        description="Reference documentation and recommended reading links will appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {day.links.map((link, idx) => (
        <LinkCard key={idx} item={link} />
      ))}
    </div>
  );
}

