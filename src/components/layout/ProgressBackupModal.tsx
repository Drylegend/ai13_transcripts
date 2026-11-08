import { useState, useRef, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useModules, contentKeys } from "@/features/content/hooks";
import {
  useProgressStore,
  getModuleProgress,
  getModuleProgressFromIndex,
  ProgressDataSchema,
  type ProgressData,
} from "@/features/progress";
import type { ModuleManifest } from "@/types";
import {
  Database,
  X,
  Download,
  Upload,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  FileAudio,
  HelpCircle,
  FlaskConical,
  HardDrive,
  Clock,
  Info,
} from "lucide-react";

interface ProgressBackupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProgressBackupModal({
  open,
  onOpenChange,
}: ProgressBackupModalProps) {
  const queryClient = useQueryClient();
  const { data: modulesIndex } = useModules();

  const store = useProgressStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Import preview state
  const [importPendingData, setImportPendingData] = useState<{
    rawText: string;
    parsed: ProgressData;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Reset confirmation state
  const [resetConfirmation, setResetConfirmation] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  // Storage and time stats
  const storageUsage = useMemo(() => store.getStorageUsage(), [store]);
  const formattedUpdated = useMemo(() => {
    try {
      return new Date(store.lastUpdated).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return "Recently";
    }
  }, [store.lastUpdated]);

  // Global counts (ignoring orphan entries from non-existent modules)
  const stats = useMemo(() => {
    let summariesRead = 0;
    let transcriptsRead = 0;
    let questionsUnderstood = 0;

    const validSlugs = new Set(modulesIndex?.modules?.map((m) => m.slug) ?? []);
    if (validSlugs.size === 0) {
      return { summariesRead: 0, transcriptsRead: 0, questionsUnderstood: 0, labsDone: 0 };
    }

    for (const [key, val] of Object.entries(store.completed)) {
      if (!val) continue;
      const slug = key.split(":")[0];
      if (!slug || !validSlugs.has(slug)) continue;

      if (key.endsWith(":summary")) summariesRead++;
      else if (key.includes(":transcript-")) transcriptsRead++;
      else if (key.includes(":question-")) questionsUnderstood++;
    }

    let labsDone = 0;
    for (const [key, item] of Object.entries(store.labs)) {
      const slug = key.split(":")[0];
      if (!slug || !validSlugs.has(slug)) continue;
      if (item.status === "done") labsDone++;
    }

    return {
      summariesRead,
      transcriptsRead,
      questionsUnderstood,
      labsDone,
    };
  }, [store.completed, store.labs, modulesIndex]);

  // Per-module progress
  const moduleProgressList = useMemo(() => {
    if (!modulesIndex?.modules) return [];

    return modulesIndex.modules.map((entry) => {
      // Check if full manifest is already cached in React Query (NO EXTRA FETCH)
      const cachedManifest = queryClient.getQueryData<ModuleManifest>(
        contentKeys.module(entry.slug)
      );

      if (cachedManifest) {
        const prog = getModuleProgress(cachedManifest, store.completed);
        return {
          slug: entry.slug,
          title: entry.title,
          courseCode: entry.tags[0] || "",
          percent: prog.percent,
          doneCount: prog.doneCount,
          totalCount: prog.totalCount,
        };
      }

      // Manifest not yet loaded: use counts from index.json directly
      const prog = getModuleProgressFromIndex(entry, store.completed);
      return {
        slug: entry.slug,
        title: entry.title,
        courseCode: entry.tags[0] || "",
        percent: prog.percent,
        doneCount: prog.doneCount,
        totalCount: prog.totalCount,
      };
    });
  }, [modulesIndex, queryClient, store.completed]);

  const overallPercent = useMemo(() => {
    if (moduleProgressList.length === 0) return 0;
    const totalDone = moduleProgressList.reduce((acc, m) => acc + m.doneCount, 0);
    const totalItems = moduleProgressList.reduce((acc, m) => acc + m.totalCount, 0);
    return totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0;
  }, [moduleProgressList]);

  // Handle File Upload for Import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    setImportSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = String(event.target?.result ?? "");
        const json = JSON.parse(text);
        const validation = ProgressDataSchema.safeParse(json);

        if (!validation.success) {
          const msg = validation.error.issues[0]?.message ?? "Invalid format";
          setImportError(`Cannot import file: ${msg}`);
          return;
        }

        setImportPendingData({
          rawText: text,
          parsed: validation.data,
        });
      } catch {
        setImportError("File contains corrupted or invalid JSON content.");
      }
    };
    reader.onerror = () => {
      setImportError("Failed to read selected file from disk.");
    };
    reader.readAsText(file);

    // Reset input
    e.target.value = "";
  };

  const handleApplyImport = (mode: "merge" | "replace") => {
    if (!importPendingData) return;
    const res = store.importProgress(importPendingData.rawText, mode);
    if (res.ok) {
      setImportSuccess(
        `Imported successfully (${mode} mode): ${res.counts.completed} completed items, ${res.counts.labs} labs.`
      );
      setImportPendingData(null);
    } else {
      setImportError(res.error);
    }
  };

  const handleResetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (resetConfirmation.trim().toUpperCase() !== "RESET") return;
    store.resetAll();
    setResetConfirmation("");
    setResetSuccess(true);
    setTimeout(() => setResetSuccess(false), 3000);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[95vw] max-w-2xl -translate-x-1/2 -translate-y-1/2 max-h-[90vh] overflow-y-auto rounded-3xl border border-[rgba(195,198,215,0.35)] bg-(--color-surface) p-6 sm:p-8 shadow-2xl transition-all focus:outline-none">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-(--color-border-subtle)">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-(--color-primary-fixed) text-(--color-primary)">
                <Database size={22} />
              </div>
              <div>
                <Dialog.Title className="text-section font-bold text-(--color-text)">
                  Progress &amp; Backup
                </Dialog.Title>
                <Dialog.Description className="text-caption text-(--color-text-muted)">
                  Local study history, metrics, and JSON backup controls
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-xl p-2 text-(--color-text-subtle) hover:bg-(--color-container) hover:text-(--color-text) transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>

          <div className="py-6 space-y-8">
            {/* 1. Overall Completion & Metrics Grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-(--color-primary)">
                  Overall Curriculum Mastery
                </span>
                <span className="font-mono text-section font-bold text-(--color-primary)">
                  {overallPercent}%
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-(--color-container) mb-6">
                <div
                  style={{ width: `${overallPercent}%` }}
                  className="h-full bg-gradient-to-r from-(--color-primary) to-(--color-primary-container) transition-all duration-300"
                />
              </div>

              {/* 4 Stat Tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-[rgba(195,198,215,0.3)] bg-(--color-container-low) p-3 text-center">
                  <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg bg-(--color-surface) text-(--color-primary)">
                    <FileCheck size={16} />
                  </div>
                  <div className="font-mono text-section font-bold text-(--color-text)">
                    {stats.summariesRead}
                  </div>
                  <div className="text-[11px] text-(--color-text-subtle)">
                    Summaries Read
                  </div>
                </div>

                <div className="rounded-2xl border border-[rgba(195,198,215,0.3)] bg-(--color-container-low) p-3 text-center">
                  <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg bg-(--color-surface) text-(--color-primary)">
                    <FileAudio size={16} />
                  </div>
                  <div className="font-mono text-section font-bold text-(--color-text)">
                    {stats.transcriptsRead}
                  </div>
                  <div className="text-[11px] text-(--color-text-subtle)">
                    Transcripts Read
                  </div>
                </div>

                <div className="rounded-2xl border border-[rgba(195,198,215,0.3)] bg-(--color-container-low) p-3 text-center">
                  <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg bg-(--color-surface) text-(--color-tertiary)">
                    <HelpCircle size={16} />
                  </div>
                  <div className="font-mono text-section font-bold text-(--color-text)">
                    {stats.questionsUnderstood}
                  </div>
                  <div className="text-[11px] text-(--color-text-subtle)">
                    Q&amp;As Mastered
                  </div>
                </div>

                <div className="rounded-2xl border border-[rgba(195,198,215,0.3)] bg-(--color-container-low) p-3 text-center">
                  <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg bg-(--color-surface) text-(--color-amber)">
                    <FlaskConical size={16} />
                  </div>
                  <div className="font-mono text-section font-bold text-(--color-text)">
                    {stats.labsDone}
                  </div>
                  <div className="text-[11px] text-(--color-text-subtle)">
                    Labs Completed
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Per-Module Breakdown */}
            <div>
              <h3 className="text-body font-bold text-(--color-text) mb-3">
                Module Breakdown
              </h3>
              <div className="space-y-3">
                {moduleProgressList.map((mod) => (
                  <div
                    key={mod.slug}
                    className="rounded-2xl border border-[rgba(195,198,215,0.3)] bg-(--color-surface) p-4"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-body-sm font-bold text-(--color-text) truncate">
                        {mod.title}
                      </span>
                      <span className="font-mono text-caption font-bold text-(--color-primary) shrink-0">
                        {mod.percent}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-(--color-container)">
                      <div
                        style={{ width: `${mod.percent}%` }}
                        className="h-full bg-(--color-primary) transition-all duration-300"
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-(--color-text-subtle)">
                      <span>
                        {mod.doneCount} / {mod.totalCount} items completed
                      </span>
                      {mod.percent === 100 && (
                        <span className="inline-flex items-center gap-1 font-semibold text-(--color-tertiary)">
                          <CheckCircle2 size={12} />
                          Complete
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. Storage & Metadata Info */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-(--color-container-low) p-4 text-caption text-(--color-text-muted)">
              <div className="flex items-center gap-2">
                <Clock size={15} />
                <span>Last Updated: {formattedUpdated}</span>
              </div>
              <div className="flex items-center gap-2">
                <HardDrive size={15} />
                <span>
                  Storage Used: ~{storageUsage.kb} KB ({storageUsage.bytes} bytes)
                </span>
              </div>
            </div>

            {/* 4. Export & Import Controls */}
            <div>
              <h3 className="text-body font-bold text-(--color-text) mb-3">
                Backup &amp; Restore
              </h3>

              <div className="grid gap-3 sm:grid-cols-2">
                {/* Export Button */}
                <Card className="p-5 flex flex-col justify-between gap-3 border border-[rgba(195,198,215,0.3)]">
                  <div>
                    <h4 className="text-body-sm font-bold text-(--color-text) flex items-center gap-2">
                      <Download size={16} className="text-(--color-primary)" />
                      Export Progress
                    </h4>
                    <p className="text-caption text-(--color-text-muted) mt-1">
                      Download a JSON file containing all marked summaries, transcripts, understood questions, and personal lab study notes.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => store.exportProgress()}
                    className="w-full gap-2 font-semibold"
                  >
                    <Download size={15} />
                    Download JSON Backup
                  </Button>
                </Card>

                {/* Import Button */}
                <Card className="p-5 flex flex-col justify-between gap-3 border border-[rgba(195,198,215,0.3)]">
                  <div>
                    <h4 className="text-body-sm font-bold text-(--color-text) flex items-center gap-2">
                      <Upload size={16} className="text-(--color-primary)" />
                      Import Progress
                    </h4>
                    <p className="text-caption text-(--color-text-muted) mt-1">
                      Restore your study progress from a previously downloaded backup JSON file.
                    </p>
                  </div>
                  <div>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileChange}
                      accept=".json"
                      className="hidden"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full gap-2 font-semibold"
                    >
                      <Upload size={15} />
                      Select Backup File
                    </Button>
                  </div>
                </Card>
              </div>

              {/* Import Messages */}
              {importError && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-500/10 p-3 text-caption font-semibold text-red-600 dark:text-red-400">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {importSuccess && (
                <div className="mt-3 flex items-center gap-2 rounded-xl bg-(--color-tertiary-fixed) p-3 text-caption font-semibold text-(--color-tertiary)">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span>{importSuccess}</span>
                </div>
              )}

              {/* Import Confirmation Preview Dialog */}
              {importPendingData && (
                <div className="mt-4 rounded-2xl border border-(--color-primary-fixed-dim) bg-(--color-surface-container-lowest) p-5 shadow-md">
                  <h4 className="text-body-sm font-bold text-(--color-text) mb-1">
                    Confirm Backup Import
                  </h4>
                  <p className="text-caption text-(--color-text-muted) mb-3">
                    Preview of selected backup:{" "}
                    <strong className="text-(--color-text)">
                      {
                        Object.keys(importPendingData.parsed.completed).filter(
                          (k) => importPendingData.parsed.completed[k]
                        ).length
                      }{" "}
                      completed reads
                    </strong>
                    ,{" "}
                    <strong className="text-(--color-text)">
                      {Object.keys(importPendingData.parsed.labs).length} lab records
                    </strong>
                    .
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleApplyImport("merge")}
                    >
                      Merge with Existing
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleApplyImport("replace")}
                    >
                      Replace All
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setImportPendingData(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* 5. Safe Progress Reset Section */}
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
              <h4 className="text-body-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                <RotateCcw size={16} />
                Reset All Progress
              </h4>
              <p className="text-caption text-(--color-text-muted) mt-1 mb-4">
                This will wipe all completed reads, questions understood, and personal study notes stored in this browser. To confirm, type{" "}
                <strong className="text-red-600 dark:text-red-400 font-mono">
                  RESET
                </strong>{" "}
                below.
              </p>

              <form
                onSubmit={handleResetSubmit}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
              >
                <input
                  type="text"
                  value={resetConfirmation}
                  onChange={(e) => setResetConfirmation(e.target.value)}
                  placeholder='Type "RESET" to confirm'
                  className="rounded-xl border border-(--color-border) bg-(--color-surface) px-3 py-2 font-mono text-body-sm text-(--color-text) placeholder-(--color-text-subtle) focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <Button
                  variant="primary"
                  size="sm"
                  type="submit"
                  disabled={resetConfirmation.trim().toUpperCase() !== "RESET"}
                  className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
                >
                  Confirm Reset
                </Button>
              </form>

              {resetSuccess && (
                <div className="mt-3 flex items-center gap-2 text-caption font-semibold text-(--color-tertiary)">
                  <CheckCircle2 size={16} />
                  <span>All local progress has been completely cleared.</span>
                </div>
              )}
            </div>

            {/* 6. Explanatory Note */}
            <div className="flex items-start gap-2.5 rounded-2xl bg-(--color-container-low) p-4 text-caption text-(--color-text-muted)">
              <Info size={16} className="shrink-0 text-(--color-primary) mt-0.5" />
              <span>
                Your study progress and personal notes live privately inside this browser&apos;s local storage. Use the <strong>Export Progress</strong> button to download a portable backup file, and <strong>Import Progress</strong> to synchronize your history with another computer.
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end pt-3 border-t border-(--color-border-subtle)">
            <Button
              variant="primary"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Done
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

