import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { SITE_CONFIG } from "@/config/site";
import { Card, Skeleton, Badge, ErrorState, EmptyState, Button } from "@/components/ui";
import { useModules, prefetchModule } from "@/features/content/hooks";
import { useProgressStore, getModuleProgressFromIndex } from "@/features/progress";
import { getLastVisited, LAST_VISITED_KEY, type LastVisitedData } from "@/components/layout/Shell";
import type { ModuleIndexEntry } from "@/types";
import {
  Calendar,
  FlaskConical,
  Presentation,
  ArrowRight,
  Clock,
  Sparkles,
} from "lucide-react";

function ModuleCardSkeleton() {
  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <Skeleton className="h-36 w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-3 p-6">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-14 w-full" />
        <div className="mt-auto flex items-center justify-between pt-4">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>
    </Card>
  );
}

function ModuleCard({ module }: { module: ModuleIndexEntry }) {
  const queryClient = useQueryClient();
  const completed = useProgressStore((state) => state.completed);
  const progress = getModuleProgressFromIndex(module, completed);

  return (
    <Link
      to={`/m/${module.slug}`}
      onMouseEnter={() => prefetchModule(queryClient, module.slug)}
      onFocus={() => prefetchModule(queryClient, module.slug)}
      className="group block h-full"
    >
      <Card
        variant="interactive"
        className="flex h-full flex-col overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5"
      >
        {/* Blue Module Tile (No image element) */}
        <div className="relative h-36 w-full shrink-0 overflow-hidden bg-gradient-to-br from-(--color-primary-fixed) to-(--color-container) p-2.5">
          <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-(--color-primary)/40 px-4 py-2 text-center">
            <span className="line-clamp-2 text-base font-bold text-(--color-primary) sm:text-lg">
              {module.title}
            </span>
            {module.courseCode && (
              <span className="mt-1 text-caption font-mono text-(--color-text-muted)">
                {module.courseCode}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-6">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-(--color-primary)">
              Module {module.order.toString().padStart(2, "0")}
            </span>
            <div className="flex items-center gap-1.5 text-caption font-medium text-(--color-primary) group-hover:translate-x-0.5 transition-transform">
              <span>Explore</span>
              <ArrowRight size={14} />
            </div>
          </div>

          <h3 className="text-section font-bold tracking-tight text-(--color-text) group-hover:text-(--color-primary) transition-colors">
            {module.title}
          </h3>

          {module.subtitle && (
            <p className="mt-1 text-body-sm font-medium text-(--color-text-muted)">
              {module.subtitle}
            </p>
          )}

          <p className="mt-3 line-clamp-2 text-body-sm text-(--color-text-muted)">
            {module.description}
          </p>

          {/* Module Progress Bar */}
          <div className="mt-4 pt-3 border-t border-(--color-border-subtle)">
            <div className="flex items-center justify-between text-caption font-semibold mb-1.5">
              <span className="text-(--color-text-subtle)">Progress</span>
              <span className="font-mono text-(--color-primary)">{progress.percent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-(--color-container)">
              <div
                style={{ width: `${progress.percent}%` }}
                className="h-full bg-(--color-primary) transition-all duration-300"
              />
            </div>
          </div>

          {/* Counts & Tags */}
          <div className="mt-auto pt-4">
            <div className="flex flex-wrap items-center gap-2 border-t border-(--color-border-subtle) pt-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-(--color-primary-fixed) px-2.5 py-1 text-[11px] font-semibold text-(--color-primary)">
                <Calendar size={13} />
                {module.dayCount} {module.dayCount === 1 ? "Day" : "Days"}
              </span>

              {module.labCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-(--color-container) px-2.5 py-1 text-[11px] font-medium text-(--color-text)">
                  <FlaskConical size={13} />
                  {module.labCount} Labs
                </span>
              )}

              {module.boardCount > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-(--color-container) px-2.5 py-1 text-[11px] font-medium text-(--color-text)">
                  <Presentation size={13} />
                  {module.boardCount} Boards
                </span>
              )}
            </div>

            {module.tags.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {module.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="neutral"
                    size="sm"
                    className="text-[10px] uppercase tracking-wider text-(--color-text-subtle)"
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function HomePage() {
  const { data, isLoading, error, refetch } = useModules();
  const modules = useMemo(() => data?.modules ?? [], [data?.modules]);

  const [rawLastVisited] = useState<LastVisitedData | null>(() => getLastVisited());
  const lastVisited = useMemo(() => {
    if (!rawLastVisited || modules.length === 0) return null;
    const exists = modules.some((m) => m.slug === rawLastVisited.moduleSlug);
    if (!exists) {
      try {
        localStorage.removeItem(LAST_VISITED_KEY);
      } catch {
        // ignore
      }
      return null;
    }
    return rawLastVisited;
  }, [rawLastVisited, modules]);

  return (
    <div className="space-y-8">
      {/* "Continue where you left off" Card (only when content exists) */}
      {modules.length > 0 && lastVisited && (
        <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-(--color-primary-fixed) bg-(--color-primary-fixed)/20 p-5 sm:p-6 shadow-xs">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--color-primary) text-white shadow-xs">
              <Clock size={20} />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-(--color-primary)">
                Continue where you left off
              </span>
              <h3 className="text-body font-bold text-(--color-text) sm:text-section line-clamp-1">
                {lastVisited.title}
              </h3>
            </div>
          </div>

          <Link to={lastVisited.path} className="shrink-0">
            <Button variant="primary" size="sm" className="gap-1.5">
              <span>Resume</span>
              <ArrowRight size={15} />
            </Button>
          </Link>
        </Card>
      )}

      {/* Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-(--color-border-subtle) bg-gradient-to-br from-(--color-container-low) via-(--color-surface) to-(--color-container) p-8 sm:p-12">
        <div className="relative z-10 max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-(--color-primary-fixed) px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-(--color-primary)">
            <Sparkles size={13} />
            Course Portal
          </div>
          <h1 className="text-hero font-extrabold tracking-tight text-(--color-text)">
            {SITE_CONFIG.name}
          </h1>
          <p className="mt-3 text-body text-(--color-text-muted) sm:text-section font-normal">
            {SITE_CONFIG.tagline}
          </p>
        </div>
      </section>

      {/* Modules List Header */}
      <div>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-section font-bold text-(--color-text)">
              Available Course Modules
            </h2>
            <p className="text-body-sm text-(--color-text-muted)">
              Select a module to view lectures, transcripts, labs, and board notes
            </p>
          </div>
          {modules.length > 0 && (
            <Badge variant="pill" size="md">
              {modules.length} {modules.length === 1 ? "Module" : "Modules"}
            </Badge>
          )}
        </div>

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="grid gap-6 sm:grid-cols-2">
            <ModuleCardSkeleton />
            <ModuleCardSkeleton />
          </div>
        )}

        {/* Error State */}
        {error && (
          <ErrorState
            title="Unable to load modules"
            message={error.message}
            onRetry={() => refetch()}
          />
        )}

        {/* Empty State */}
        {!isLoading && !error && modules.length === 0 && (
          <EmptyState
            title="No course content published yet"
            description="Check back soon."
          />
        )}

        {/* Modules Grid */}
        {!isLoading && !error && modules.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2">
            {modules.map((m) => (
              <ModuleCard key={m.slug} module={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
