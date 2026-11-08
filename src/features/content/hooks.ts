import {
  useQuery,
  type QueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { fetchJson, NotFoundError } from "./client";
import {
  ModuleIndexSchema,
  ModuleManifestSchema,
  DayDetailSchema,
  LabSchema,
  VisualIndexSchema,
  SearchIndexSchema,
} from "./schemas";
import type {
  ModuleIndex,
  ModuleManifest,
  DayDetail,
  Lab,
  VisualIndex,
  SearchIndex,
} from "@/types";

/* ─── Query Key Factories ─── */
export const contentKeys = {
  all: ["content"] as const,
  modules: () => [...contentKeys.all, "modules"] as const,
  module: (slug: string) => [...contentKeys.all, "module", slug] as const,
  day: (slug: string, dayNumber: number | string) =>
    [...contentKeys.all, "day", slug, String(dayNumber)] as const,
  lab: (slug: string, labId: string) =>
    [...contentKeys.all, "lab", slug, labId] as const,
  visuals: (slug: string) => [...contentKeys.all, "visuals", slug] as const,
  searchIndex: () => [...contentKeys.all, "searchIndex"] as const,
};

function formatDayFolder(dayNumber: number | string): string {
  const num = Number(dayNumber);
  if (isNaN(num)) return `day-${dayNumber}`;
  return `day-${String(num).padStart(2, "0")}`;
}

/* ─── Query Hooks ─── */

/** Fetches list of all modules from /index.json */
export function useModules(): UseQueryResult<ModuleIndex, Error> {
  return useQuery({
    queryKey: contentKeys.modules(),
    queryFn: async ({ signal }) => {
      try {
        return await fetchJson("index.json", ModuleIndexSchema, signal);
      } catch (err) {
        if (err instanceof NotFoundError) {
          return {
            version: "1",
            updatedAt: "",
            modules: [],
          };
        }
        throw err;
      }
    },
  });
}

/** Fetches lightweight module manifest from /modules/<slug>/manifest.json */
export function useModule(
  slug: string | undefined
): UseQueryResult<ModuleManifest, Error> {
  return useQuery({
    queryKey: contentKeys.module(slug ?? ""),
    queryFn: ({ signal }) =>
      fetchJson(`modules/${slug}/manifest.json`, ModuleManifestSchema, signal),
    enabled: Boolean(slug),
  });
}

/** Fetches full day detail from /modules/<slug>/days/day-NN/day.json */
export function useDay(
  slug: string | undefined,
  dayNumber: number | string | undefined
): UseQueryResult<DayDetail, Error> {
  const folder = dayNumber !== undefined ? formatDayFolder(dayNumber) : "";
  return useQuery({
    queryKey: contentKeys.day(slug ?? "", dayNumber ?? ""),
    queryFn: ({ signal }) =>
      fetchJson(
        `modules/${slug}/days/${folder}/day.json`,
        DayDetailSchema,
        signal
      ),
    enabled: Boolean(slug && dayNumber !== undefined),
  });
}

/** Fetches lab detail from /modules/<slug>/labs/<labId>/lab.json */
export function useLab(
  slug: string | undefined,
  labId: string | undefined
): UseQueryResult<Lab, Error> {
  return useQuery({
    queryKey: contentKeys.lab(slug ?? "", labId ?? ""),
    queryFn: ({ signal }) =>
      fetchJson(`modules/${slug}/labs/${labId}/lab.json`, LabSchema, signal),
    enabled: Boolean(slug && labId),
  });
}

/** Fetches visuals index from /modules/<slug>/visuals.json */
export function useVisuals(
  slug: string | undefined
): UseQueryResult<VisualIndex, Error> {
  return useQuery({
    queryKey: contentKeys.visuals(slug ?? ""),
    queryFn: ({ signal }) =>
      fetchJson(`modules/${slug}/visuals.json`, VisualIndexSchema, signal),
    enabled: Boolean(slug),
  });
}

/** Fetches search index lazily */
export function useSearchIndex(options?: {
  enabled?: boolean;
}): UseQueryResult<SearchIndex, Error> {
  return useQuery({
    queryKey: contentKeys.searchIndex(),
    queryFn: async ({ signal }) => {
      try {
        return await fetchJson("search-index.json", SearchIndexSchema, signal);
      } catch (err) {
        if (err instanceof NotFoundError) {
          return [];
        }
        throw err;
      }
    },
    enabled: options?.enabled ?? false,
    staleTime: 10 * 60 * 1000,
  });
}

/* ─── Prefetch Helpers ─── */

export async function prefetchModule(
  queryClient: QueryClient,
  slug: string
): Promise<void> {
  await queryClient.prefetchQuery({
    queryKey: contentKeys.module(slug),
    queryFn: ({ signal }) =>
      fetchJson(`modules/${slug}/manifest.json`, ModuleManifestSchema, signal),
    staleTime: 5 * 60 * 1000,
  });
}

export async function prefetchDay(
  queryClient: QueryClient,
  slug: string,
  dayNumber: number | string
): Promise<void> {
  const folder = formatDayFolder(dayNumber);
  await queryClient.prefetchQuery({
    queryKey: contentKeys.day(slug, dayNumber),
    queryFn: ({ signal }) =>
      fetchJson(
        `modules/${slug}/days/${folder}/day.json`,
        DayDetailSchema,
        signal
      ),
    staleTime: 5 * 60 * 1000,
  });
}

export async function prefetchLab(
  queryClient: QueryClient,
  slug: string,
  labId: string
): Promise<void> {
  await queryClient.prefetchQuery({
    queryKey: contentKeys.lab(slug, labId),
    queryFn: ({ signal }) =>
      fetchJson(`modules/${slug}/labs/${labId}/lab.json`, LabSchema, signal),
    staleTime: 5 * 60 * 1000,
  });
}

export async function prefetchVisuals(
  queryClient: QueryClient,
  slug: string
): Promise<void> {
  await queryClient.prefetchQuery({
    queryKey: contentKeys.visuals(slug),
    queryFn: ({ signal }) =>
      fetchJson(`modules/${slug}/visuals.json`, VisualIndexSchema, signal),
    staleTime: 5 * 60 * 1000,
  });
}

