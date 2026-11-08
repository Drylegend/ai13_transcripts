import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { SITE_CONFIG } from "@/config/site";
import {
  ProgressDataSchema,
  type LabStatus,
  type LabProgressItem,
  type ProgressData,
} from "./schemas";
import type { DaySummaryItem, ModuleManifest, ModuleIndexEntry, LabSummaryItem } from "@/types";

export * from "./schemas";

export interface ProgressState {
  version: number;
  lastUpdated: string;
  completed: Record<string, boolean>;
  labs: Record<string, LabProgressItem>;

  // Basic completed items (summaries, transcripts, questions)
  isCompleted: (key: string) => boolean;
  setCompleted: (key: string, value: boolean) => void;
  toggleCompleted: (key: string) => void;
  getCompletedCount: (keys: string[]) => number;

  // Lab progress
  getLabProgress: (key: string) => LabProgressItem | undefined;
  getLabStatus: (key: string) => LabStatus;
  setLabStatus: (key: string, status: LabStatus) => void;
  cycleLabStatus: (key: string) => LabStatus;
  getLabNotes: (key: string) => string;
  setLabNotes: (key: string, notes: string) => void;

  // Bulk and persistence actions
  exportProgress: () => void;
  importProgress: (
    jsonText: string,
    mode: "merge" | "replace"
  ) =>
    | { ok: true; counts: { completed: number; labs: number } }
    | { ok: false; error: string };
  resetAll: () => void;
  getStorageUsage: () => { bytes: number; kb: number };
}

const STORAGE_KEY = `${SITE_CONFIG.storageKeyPrefix}:progress:v1`;

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      version: 1,
      lastUpdated: new Date().toISOString(),
      completed: {},
      labs: {},

      isCompleted: (key: string) => Boolean(get().completed[key]),

      setCompleted: (key: string, value: boolean) =>
        set((state) => ({
          lastUpdated: new Date().toISOString(),
          completed: { ...state.completed, [key]: value },
        })),

      toggleCompleted: (key: string) =>
        set((state) => ({
          lastUpdated: new Date().toISOString(),
          completed: {
            ...state.completed,
            [key]: !state.completed[key],
          },
        })),

      getCompletedCount: (keys: string[]) => {
        const state = get().completed;
        return keys.reduce((acc, k) => (state[k] ? acc + 1 : acc), 0);
      },

      getLabProgress: (key: string) => get().labs[key],

      getLabStatus: (key: string): LabStatus =>
        get().labs[key]?.status ?? "not-started",

      setLabStatus: (key: string, status: LabStatus) =>
        set((state) => {
          const prev = state.labs[key];
          const now = new Date().toISOString();
          return {
            lastUpdated: now,
            labs: {
              ...state.labs,
              [key]: {
                status,
                studentNotes: prev?.studentNotes ?? "",
                updatedAt: now,
              },
            },
          };
        }),

      cycleLabStatus: (key: string): LabStatus => {
        const current = get().labs[key]?.status ?? "not-started";
        let next: LabStatus = "in-progress";
        if (current === "not-started") next = "in-progress";
        else if (current === "in-progress") next = "done";
        else if (current === "done") next = "not-started";

        const now = new Date().toISOString();
        set((state) => {
          const prev = state.labs[key];
          return {
            lastUpdated: now,
            labs: {
              ...state.labs,
              [key]: {
                status: next,
                studentNotes: prev?.studentNotes ?? "",
                updatedAt: now,
              },
            },
          };
        });
        return next;
      },

      getLabNotes: (key: string): string =>
        get().labs[key]?.studentNotes ?? "",

      setLabNotes: (key: string, notes: string) =>
        set((state) => {
          const prev = state.labs[key];
          const now = new Date().toISOString();
          return {
            lastUpdated: now,
            labs: {
              ...state.labs,
              [key]: {
                status: prev?.status ?? "not-started",
                studentNotes: notes,
                updatedAt: now,
              },
            },
          };
        }),

      exportProgress: () => {
        const state = get();
        const exportData: ProgressData = {
          version: state.version,
          lastUpdated: state.lastUpdated,
          completed: state.completed,
          labs: state.labs,
        };

        const jsonStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const dateStr = new Date().toISOString().split("T")[0];
        const filename = `${SITE_CONFIG.storageKeyPrefix}-progress-${dateStr}.json`;

        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
      },

      importProgress: (jsonText: string, mode: "merge" | "replace") => {
        try {
          const parsed = JSON.parse(jsonText);
          const validation = ProgressDataSchema.safeParse(parsed);
          if (!validation.success) {
            const firstError =
              validation.error.issues[0]?.message ?? "Invalid format";
            return {
              ok: false,
              error: `Validation failed: ${firstError}`,
            };
          }

          const data = validation.data;
          const now = new Date().toISOString();

          if (mode === "replace") {
            set({
              version: data.version,
              lastUpdated: now,
              completed: data.completed,
              labs: data.labs,
            });
            return {
              ok: true,
              counts: {
                completed: Object.keys(data.completed).filter(
                  (k) => data.completed[k]
                ).length,
                labs: Object.keys(data.labs).length,
              },
            };
          }

          // Merge mode: combine keys, preserving newest updatedAt for labs
          const currentState = get();
          const mergedCompleted = {
            ...currentState.completed,
            ...data.completed,
          };
          const mergedLabs = { ...currentState.labs };

          for (const [key, item] of Object.entries(data.labs)) {
            if (!mergedLabs[key]) {
              mergedLabs[key] = item;
            } else {
              // Preserve studentNotes if incoming is empty or merge if newer
              const incomingDate = new Date(item.updatedAt).getTime();
              const existingDate = new Date(
                mergedLabs[key].updatedAt
              ).getTime();
              if (incomingDate >= existingDate) {
                mergedLabs[key] = item;
              }
            }
          }

          set({
            lastUpdated: now,
            completed: mergedCompleted,
            labs: mergedLabs,
          });

          return {
            ok: true,
            counts: {
              completed: Object.keys(mergedCompleted).filter(
                (k) => mergedCompleted[k]
              ).length,
              labs: Object.keys(mergedLabs).length,
            },
          };
        } catch (err) {
          return {
            ok: false,
            error:
              err instanceof Error ? err.message : "Malformed JSON content",
          };
        }
      },

      resetAll: () => {
        set({
          version: 1,
          lastUpdated: new Date().toISOString(),
          completed: {},
          labs: {},
        });
      },

      getStorageUsage: () => {
        try {
          const state = get();
          const json = JSON.stringify({
            version: state.version,
            lastUpdated: state.lastUpdated,
            completed: state.completed,
            labs: state.labs,
          });
          const bytes = new TextEncoder().encode(json).length;
          return {
            bytes,
            kb: Math.round((bytes / 1024) * 10) / 10,
          };
        } catch {
          return { bytes: 0, kb: 0 };
        }
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      version: 1,
      migrate: (persistedState: unknown) => {
        // Migration scaffold for future versions
        const typed = persistedState as {
          version?: number;
          completed?: Record<string, boolean>;
          labs?: Record<string, LabProgressItem>;
        };
        return {
          version: 1,
          lastUpdated: new Date().toISOString(),
          completed: typed?.completed ?? {},
          labs: typed?.labs ?? {},
        };
      },
    }
  )
);

// Cross-tab synchronization via window 'storage' event
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed?.state) {
          useProgressStore.setState({
            completed: parsed.state.completed ?? {},
            labs: parsed.state.labs ?? {},
            lastUpdated: parsed.state.lastUpdated ?? new Date().toISOString(),
          });
        }
      } catch {
        // Parse error ignored
      }
    }
  });
}

/* ─── Derived Progress Calculation Helpers (No Network Requests) ─── */

export interface DayProgressResult {
  doneCount: number;
  totalCount: number;
  ratio: number;
  percent: number;
  isComplete: boolean;
}

/** Calculates day progress from manifest summary item + completed state */
export function getDayProgress(
  moduleSlug: string,
  day: DaySummaryItem,
  completed: Record<string, boolean>
): DayProgressResult {
  const prefix = `${moduleSlug}:day-${day.number}:`;
  const totalCount =
    (day.hasSummary ? 1 : 0) + day.transcriptCount + day.questionCount;

  if (totalCount === 0) {
    return {
      doneCount: 0,
      totalCount: 0,
      ratio: 0,
      percent: 0,
      isComplete: false,
    };
  }

  // Count matching completed keys for this day
  let doneCount = 0;
  for (const [key, value] of Object.entries(completed)) {
    if (value && key.startsWith(prefix)) {
      doneCount++;
    }
  }

  const clampedDone = Math.min(doneCount, totalCount);
  const ratio = clampedDone / totalCount;
  const percent = Math.round(ratio * 100);

  return {
    doneCount: clampedDone,
    totalCount,
    ratio,
    percent,
    isComplete: clampedDone === totalCount,
  };
}

/** Calculates total module completion % across days from a loaded ModuleManifest */
export function getModuleProgress(
  manifest: ModuleManifest,
  completed: Record<string, boolean>
): {
  doneCount: number;
  totalCount: number;
  percent: number;
  completedDays: number;
} {
  let doneCount = 0;
  let totalCount = 0;
  let completedDays = 0;

  for (const day of manifest.days) {
    const prog = getDayProgress(manifest.slug, day, completed);
    doneCount += prog.doneCount;
    totalCount += prog.totalCount;
    if (prog.isComplete) completedDays++;
  }

  const percent =
    totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return {
    doneCount,
    totalCount,
    percent,
    completedDays,
  };
}

/** Calculates module completion % from an index entry without fetching manifest */
export function getModuleProgressFromIndex(
  entry: ModuleIndexEntry,
  completed: Record<string, boolean>
): {
  doneCount: number;
  totalCount: number;
  percent: number;
} {
  const prefix = `${entry.slug}:day-`;
  const totalCount =
    entry.dayCount + entry.transcriptCount + entry.questionCount;

  if (totalCount === 0) {
    return { doneCount: 0, totalCount: 0, percent: 0 };
  }

  let doneCount = 0;
  for (const [key, value] of Object.entries(completed)) {
    if (value && key.startsWith(prefix)) {
      doneCount++;
    }
  }

  const clampedDone = Math.min(doneCount, totalCount);
  const percent = Math.round((clampedDone / totalCount) * 100);

  return {
    doneCount: clampedDone,
    totalCount,
    percent,
  };
}

/** Calculates counts of done, in-progress, not-started labs in a category */
export function getCategoryLabCounts(
  moduleSlug: string,
  labs: LabSummaryItem[],
  storeLabs: Record<string, LabProgressItem>,
  categorySlug?: string
): {
  notStarted: number;
  inProgress: number;
  done: number;
  total: number;
  percent: number;
} {
  const filtered =
    categorySlug && categorySlug !== "all"
      ? labs.filter((l) => l.category === categorySlug)
      : labs;

  let notStarted = 0;
  let inProgress = 0;
  let done = 0;

  for (const lab of filtered) {
    const key = `${moduleSlug}:lab-${lab.id}`;
    const status = storeLabs[key]?.status ?? "not-started";
    if (status === "done") done++;
    else if (status === "in-progress") inProgress++;
    else notStarted++;
  }

  const total = filtered.length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return {
    notStarted,
    inProgress,
    done,
    total,
    percent,
  };
}
