import { useState, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import { PageHeaderBar } from "@/components/layout";
import { useModule, useLab } from "@/features/content/hooks";
import { useProgressStore, type LabStatus } from "@/features/progress";
import { fileUrl } from "@/features/content/client";
import { StatusBadge } from "@/components/labs/StatusBadge";
import { Lightbox, type LightboxItem } from "@/components/common/Lightbox";
import { FileViewer, DownloadButton } from "@/components/viewers";
import { MarkdownRenderer } from "@/components/viewers/MarkdownViewer";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  FileText,
  ImageIcon,
  Link2,
  ExternalLink,
  RotateCw,
  Edit3,
  Check,
  ArrowRight,
  ArrowLeft,
  Copy,
  ZoomIn,
} from "lucide-react";

export default function LabDetailPage() {
  const { moduleSlug, labId } = useParams<{
    moduleSlug: string;
    labId: string;
  }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: module } = useModule(moduleSlug);
  const { data: lab, isLoading: labLoading, isError } = useLab(moduleSlug, labId);

  const labKey = `${moduleSlug}:lab-${labId}`;
  const status = useProgressStore((state) => state.getLabStatus(labKey));
  const cycleStatus = useProgressStore((state) => state.cycleLabStatus);
  const savedNotes = useProgressStore((state) => state.getLabNotes(labKey));
  const setLabNotes = useProgressStore((state) => state.setLabNotes);

  // Tab sync with URL ?tab=
  const validTabs = ["notes", "sketch", "links"];
  const paramTab = searchParams.get("tab");
  const activeTab = validTabs.includes(paramTab ?? "") ? paramTab! : "notes";

  const handleTabChange = (newTab: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", newTab);
        return next;
      },
      { replace: true }
    );
  };

  // Study Notes Editing State
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [customNotes, setCustomNotes] = useState<string | null>(null);
  const notesInput = customNotes ?? savedNotes;
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const [showSavedIndicator, setShowSavedIndicator] = useState(false);

  // Debounced autosave
  useEffect(() => {
    if (!isEditingNotes || customNotes === null) return;
    const timer = setTimeout(() => {
      setLabNotes(labKey, notesInput);
      setShowSavedIndicator(true);
      const hideTimer = setTimeout(() => setShowSavedIndicator(false), 2000);
      return () => clearTimeout(hideTimer);
    }, 600);
    return () => clearTimeout(timer);
  }, [notesInput, isEditingNotes, customNotes, labKey, setLabNotes]);

  const handleManualSave = () => {
    setLabNotes(labKey, notesInput);
    setShowSavedIndicator(true);
    setCustomNotes(null);
    setIsEditingNotes(false);
  };

  const handleCancelEdit = () => {
    setCustomNotes(null);
    setIsEditingNotes(false);
    setIsPreviewActive(false);
  };

  // Lightbox state for sketch
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Copy link state
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedLink(url);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  if (isError || (!labLoading && !lab)) {
    return (
      <div>
        <PageHeaderBar currentPageType="labs" />
        <Card className="p-8 text-center my-6">
          <EmptyState
            icon={<FileText size={48} strokeWidth={1.5} />}
            title="Lab Not Found"
            description={`Could not find exercise "${labId}" in this module.`}
            action={
              <Link to={`/m/${moduleSlug}/labs`}>
                <Button variant="primary" size="md">
                  Back to All Labs
                </Button>
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  // Prev / Next Navigation in the same category
  const allLabs = module?.labs ?? [];
  const currentCategory = lab?.category;
  const sameCategoryLabs = allLabs.filter((l) => l.category === currentCategory);
  const currentIndex = sameCategoryLabs.findIndex((l) => l.id === labId);
  const prevLab = currentIndex > 0 ? sameCategoryLabs[currentIndex - 1] : null;
  const nextLab =
    currentIndex >= 0 && currentIndex < sameCategoryLabs.length - 1
      ? sameCategoryLabs[currentIndex + 1]
      : null;

  const numPad = lab ? String(lab.number).padStart(2, "0") : "--";

  // Lightbox item for sketch
  const sketchItems: LightboxItem[] =
    lab && lab.doodle
      ? [
          {
            id: `lab-doodle-${lab.id}`,
            image: lab.doodle,
            thumb: lab.thumb,
            caption: `Lab ${numPad}: ${lab.title} — Architectural Sketch`,
            downloadName: `lab-${numPad}-sketch.${lab.doodle.format}`,
          },
        ]
      : [];

  const extraLinks = lab?.links ?? [];
  const totalLinksCount = (lab?.sourceUrl ? 1 : 0) + extraLinks.length;

  return (
    <div className="pb-16">
      <PageHeaderBar
        currentPageType="lab-detail"
        labNumber={lab?.number}
      />

      {labLoading && (
        <div className="space-y-6">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      )}

      {!labLoading && lab && (
        <>
          {/* Header Card */}
          <Card className="mb-6 p-6 sm:p-8 border border-[rgba(195,198,215,0.3)] shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-(--color-primary-fixed) text-section font-mono font-bold text-(--color-primary)">
                  {numPad}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-(--color-text-subtle)">
                      Category: {lab.category}
                    </span>
                    <span className="text-(--color-text-subtle)">•</span>
                    <StatusBadge status={status as LabStatus} />
                  </div>
                  <h1 className="text-section sm:text-page font-bold text-(--color-text) leading-tight">
                    {lab.title}
                  </h1>
                </div>
              </div>

              {/* Action Buttons: Status Cycle & Official Guide */}
              <div className="flex flex-wrap items-center gap-2.5 sm:self-start shrink-0">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => cycleStatus(labKey)}
                  className="gap-1.5 text-body-sm font-semibold"
                  title="Cycle status: Not Started -> In Progress -> Done"
                >
                  <RotateCw size={15} />
                  <span>Cycle Status</span>
                </Button>

                {lab.sourceUrl && (
                  <a
                    href={lab.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      variant="primary"
                      size="sm"
                      className="gap-1.5 text-body-sm font-semibold"
                    >
                      <span>Official Lab Guide</span>
                      <ExternalLink size={15} />
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </Card>

          {/* Radix Tabs */}
          <Tabs.Root value={activeTab} onValueChange={handleTabChange} className="space-y-6">
            <Tabs.List className="flex items-center gap-2 border-b border-(--color-border-subtle) pb-px overflow-x-auto scrollbar-none">
              <Tabs.Trigger
                value="notes"
                className={`flex shrink-0 items-center gap-2 px-4 py-3 text-body-sm font-semibold border-b-2 transition-all ${
                  activeTab === "notes"
                    ? "border-(--color-primary) text-(--color-primary)"
                    : "border-transparent text-(--color-text-muted) hover:text-(--color-text)"
                }`}
              >
                <FileText size={16} />
                <span>Notes &amp; Summary</span>
                {lab.notes && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-(--color-primary-fixed) px-1.5 text-[10px] font-mono font-bold text-(--color-primary)">
                    1
                  </span>
                )}
              </Tabs.Trigger>

              <Tabs.Trigger
                value="sketch"
                className={`flex shrink-0 items-center gap-2 px-4 py-3 text-body-sm font-semibold border-b-2 transition-all ${
                  activeTab === "sketch"
                    ? "border-(--color-primary) text-(--color-primary)"
                    : "border-transparent text-(--color-text-muted) hover:text-(--color-text)"
                }`}
              >
                <ImageIcon size={16} />
                <span>Sketch</span>
                {lab.doodle && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-(--color-primary-fixed) px-1.5 text-[10px] font-mono font-bold text-(--color-primary)">
                    1
                  </span>
                )}
              </Tabs.Trigger>

              <Tabs.Trigger
                value="links"
                className={`flex shrink-0 items-center gap-2 px-4 py-3 text-body-sm font-semibold border-b-2 transition-all ${
                  activeTab === "links"
                    ? "border-(--color-primary) text-(--color-primary)"
                    : "border-transparent text-(--color-text-muted) hover:text-(--color-text)"
                }`}
              >
                <Link2 size={16} />
                <span>Important Links</span>
                {totalLinksCount > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-(--color-primary-fixed) px-1.5 text-[10px] font-mono font-bold text-(--color-primary)">
                    {totalLinksCount}
                  </span>
                )}
              </Tabs.Trigger>
            </Tabs.List>

            {/* TAB 1: Notes & Summary + Student Study Notes */}
            <Tabs.Content value="notes" className="space-y-8 focus:outline-none">
              {/* Ingested Lab Notes */}
              <div>
                <h3 className="text-body font-bold text-(--color-text) mb-3">
                  Instructor &amp; Architecture Notes
                </h3>
                {lab.notes ? (
                  <div className="rounded-2xl border border-[rgba(195,198,215,0.3)] bg-(--color-surface) p-6 sm:p-8 shadow-xs">
                    <div className="flex justify-end mb-4">
                      <DownloadButton
                        file={lab.notes}
                        customFilename={`lab-${numPad}-notes.${lab.notes.format}`}
                        label="Download Notes"
                        size="sm"
                      />
                    </div>
                    <FileViewer file={lab.notes} />
                  </div>
                ) : (
                  <Card className="p-8 text-center">
                    <EmptyState
                      icon={<FileText size={48} strokeWidth={1.5} />}
                      title="No official notes provided"
                      description="Instructor study notes for this lab have not been uploaded yet."
                    />
                  </Card>
                )}
              </div>

              {/* Student Study Notes Section */}
              <div className="border-t border-(--color-border-subtle) pt-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-body font-bold text-(--color-text)">
                      My Study Notes
                    </h3>
                    {showSavedIndicator && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-(--color-tertiary)">
                        <Check size={12} />
                        Saved
                      </span>
                    )}
                  </div>

                  {!isEditingNotes && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setIsEditingNotes(true)}
                      className="gap-1.5 text-caption font-semibold"
                    >
                      <Edit3 size={14} />
                      {savedNotes ? "Edit Notes" : "Write Study Notes"}
                    </Button>
                  )}
                </div>

                {isEditingNotes ? (
                  <div className="rounded-2xl border border-(--color-border) bg-(--color-surface) p-4 sm:p-6 shadow-sm space-y-4">
                    <div className="flex items-center justify-between gap-2 border-b border-(--color-border-subtle) pb-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsPreviewActive(false)}
                          className={`rounded-lg px-3 py-1.5 text-caption font-semibold transition-colors ${
                            !isPreviewActive
                              ? "bg-(--color-primary) text-white"
                              : "text-(--color-text-muted) hover:bg-(--color-container)"
                          }`}
                        >
                          Write
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsPreviewActive(true)}
                          className={`rounded-lg px-3 py-1.5 text-caption font-semibold transition-colors ${
                            isPreviewActive
                              ? "bg-(--color-primary) text-white"
                              : "text-(--color-text-muted) hover:bg-(--color-container)"
                          }`}
                        >
                          Preview
                        </button>
                      </div>

                      <span className="text-[11px] font-mono text-(--color-text-subtle)">
                        {notesInput.length} chars
                      </span>
                    </div>

                    {isPreviewActive ? (
                      <div className="min-h-[160px] rounded-xl border border-(--color-border-subtle) bg-(--color-surface-container-lowest) p-4">
                        {notesInput.trim() ? (
                          <MarkdownRenderer content={notesInput} />
                        ) : (
                          <span className="text-caption italic text-(--color-text-subtle)">
                            No content to preview.
                          </span>
                        )}
                      </div>
                    ) : (
                      <textarea
                        value={notesInput}
                        onChange={(e) => setCustomNotes(e.target.value)}
                        placeholder="Write your personal markdown observations, commands, takeaways, or troubleshooting steps here..."
                        className="w-full min-h-[180px] rounded-xl border border-(--color-border-subtle) bg-(--color-surface-container-lowest) p-4 font-mono text-body-sm text-(--color-text) placeholder-(--color-text-subtle) focus:outline-none focus:ring-2 focus:ring-(--color-primary) resize-y"
                      />
                    )}

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleCancelEdit}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleManualSave}
                        className="gap-1.5"
                      >
                        <Check size={14} />
                        Save Notes
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-[rgba(195,198,215,0.3)] bg-(--color-container-low) p-6">
                    {savedNotes ? (
                      <MarkdownRenderer content={savedNotes} />
                    ) : (
                      <p className="text-body-sm text-(--color-text-muted) italic">
                        No personal study notes written yet. Click &quot;Write Study Notes&quot; to keep your thoughts, commands, and key takeaways handy!
                      </p>
                    )}
                  </div>
                )}
              </div>
            </Tabs.Content>

            {/* TAB 2: Sketch */}
            <Tabs.Content value="sketch" className="focus:outline-none">
              {lab.doodle ? (
                <Card className="p-6 sm:p-8 border border-[rgba(195,198,215,0.3)] shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-body font-bold text-(--color-text)">
                        Architectural Doodle &amp; Sketch
                      </h3>
                      <p className="text-caption text-(--color-text-muted)">
                        Visual diagram illustrating the core mechanics of this lab
                      </p>
                    </div>
                    <DownloadButton
                      file={lab.doodle}
                      customFilename={`lab-${numPad}-sketch.${lab.doodle.format}`}
                      label="Download Sketch"
                      size="sm"
                    />
                  </div>

                  <div
                    onClick={() => setLightboxOpen(true)}
                    className="group relative cursor-zoom-in overflow-hidden rounded-2xl border border-(--color-border-subtle) bg-(--color-container-low)"
                  >
                    <img
                      src={fileUrl(lab.doodle)}
                      alt={`Lab ${numPad} Architectural Sketch`}
                      className="w-full max-h-[550px] object-contain transition-transform duration-300 group-hover:scale-102"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 group-hover:bg-black/20 group-hover:opacity-100 transition-all">
                      <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-4 py-2 text-caption font-semibold text-white backdrop-blur-md">
                        <ZoomIn size={16} />
                        Click to view full screen
                      </span>
                    </div>
                  </div>
                </Card>
              ) : (
                <Card className="p-8 text-center">
                  <EmptyState
                    icon={<ImageIcon size={48} strokeWidth={1.5} />}
                    title="No visual sketch available"
                    description="No architectural doodles or board diagrams have been attached to this lab."
                  />
                </Card>
              )}
            </Tabs.Content>

            {/* TAB 3: Important Links */}
            <Tabs.Content value="links" className="focus:outline-none space-y-4">
              {totalLinksCount === 0 ? (
                <Card className="p-8 text-center">
                  <EmptyState
                    icon={<Link2 size={48} strokeWidth={1.5} />}
                    title="No links provided"
                    description="No external documentation or lab repositories have been linked yet."
                  />
                </Card>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {lab.sourceUrl && (
                    <Card className="p-5 flex flex-col justify-between gap-3 border border-[rgba(195,198,215,0.3)] hover:border-(--color-primary-fixed-dim) transition-colors">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-(--color-primary)">
                            Primary Resource
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyLink(lab.sourceUrl!)}
                            className="rounded-lg p-1.5 text-(--color-text-subtle) hover:bg-(--color-container) hover:text-(--color-primary) transition-colors"
                            title="Copy link"
                          >
                            {copiedLink === lab.sourceUrl ? (
                              <Check size={14} className="text-(--color-tertiary)" />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                        <h4 className="text-body font-bold text-(--color-text) mt-1">
                          Official Lab Guide
                        </h4>
                        <p className="text-caption font-mono text-(--color-text-muted) truncate mt-0.5">
                          {new URL(lab.sourceUrl).hostname}
                        </p>
                      </div>

                      <a
                        href={lab.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-caption font-semibold text-(--color-primary) hover:underline"
                      >
                        <span>Open official guide</span>
                        <ExternalLink size={13} />
                      </a>
                    </Card>
                  )}

                  {extraLinks.map((link) => {
                    const hostname = (() => {
                      try {
                        return new URL(link.url).hostname;
                      } catch {
                        return link.url;
                      }
                    })();

                    return (
                      <Card
                        key={link.url}
                        className="p-5 flex flex-col justify-between gap-3 border border-[rgba(195,198,215,0.3)] hover:border-(--color-primary-fixed-dim) transition-colors"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-caption font-mono text-(--color-text-subtle) truncate">
                              {hostname}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopyLink(link.url)}
                              className="rounded-lg p-1.5 text-(--color-text-subtle) hover:bg-(--color-container) hover:text-(--color-primary) transition-colors"
                              title="Copy link"
                            >
                              {copiedLink === link.url ? (
                                <Check size={14} className="text-(--color-tertiary)" />
                              ) : (
                                <Copy size={14} />
                              )}
                            </button>
                          </div>
                          <h4 className="text-body font-bold text-(--color-text) mt-1">
                            {link.label}
                          </h4>
                          {link.description && (
                            <p className="text-caption text-(--color-text-muted) mt-1">
                              {link.description}
                            </p>
                          )}
                        </div>

                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-caption font-semibold text-(--color-primary) hover:underline"
                        >
                          <span>Open link</span>
                          <ExternalLink size={13} />
                        </a>
                      </Card>
                    );
                  })}
                </div>
              )}
            </Tabs.Content>
          </Tabs.Root>

          {/* Bottom Bar: Prev / Next / Back Navigation */}
          <div className="mt-12 pt-6 border-t border-(--color-border-subtle) flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              {prevLab ? (
                <Link to={`/m/${moduleSlug}/labs/${prevLab.id}`}>
                  <Button variant="secondary" size="md" className="gap-2">
                    <ArrowLeft size={16} />
                    <span>Lab {String(prevLab.number).padStart(2, "0")}</span>
                  </Button>
                </Link>
              ) : (
                <div />
              )}
            </div>

            <div className="w-full sm:w-auto">
              {nextLab ? (
                <Link
                  to={`/m/${moduleSlug}/labs/${nextLab.id}`}
                  className="block w-full sm:w-auto"
                >
                  <Button
                    variant="cta"
                    size="lg"
                    className="w-full sm:w-auto gap-2"
                  >
                    <span>Next: Lab {String(nextLab.number).padStart(2, "0")} — {nextLab.title}</span>
                    <ArrowRight size={18} />
                  </Button>
                </Link>
              ) : (
                <Link
                  to={`/m/${moduleSlug}/labs`}
                  className="block w-full sm:w-auto"
                >
                  <Button variant="primary" size="md" className="w-full sm:w-auto gap-2">
                    <ArrowLeft size={16} />
                    <span>Back to all labs</span>
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Shared Lightbox for Doodle */}
          {sketchItems.length > 0 && (
            <Lightbox
              items={sketchItems}
              selectedIndex={lightboxOpen ? 0 : null}
              onClose={() => setLightboxOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
