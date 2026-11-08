import { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { motion, AnimatePresence } from "motion/react";
import { useModules, useModule, prefetchModule } from "@/features/content/hooks";
import { useProgressStore, getDayProgress } from "@/features/progress";
import { SITE_CONFIG } from "@/config/site";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import type { ModuleIndexEntry } from "@/types";
import {
  BookOpen,
  Calendar,
  FlaskConical,
  PenTool,
  ChevronRight,
  Database,
  Search,
  LayoutGrid,
  CheckCircle2,
} from "lucide-react";

interface SidebarProps {
  onSettingsClick: () => void;
  onLinkClick?: () => void;
  className?: string;
}

const STORAGE_KEY = `${SITE_CONFIG.storageKeyPrefix}:sidebar`;

function getSavedExpanded(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveExpanded(list: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // localStorage unavailable
  }
}

/**
 * Child component that fetches the manifest ONLY when expanded.
 */
function ModuleExpandedContent({
  moduleSlug,
  onLinkClick,
}: {
  moduleSlug: string;
  onLinkClick?: () => void;
}) {
  const { data: manifest, isLoading } = useModule(moduleSlug);
  const location = useLocation();
  const activeDayRef = useRef<HTMLAnchorElement | null>(null);
  const completed = useProgressStore((state) => state.completed);

  // Scroll active day into view if long list
  useEffect(() => {
    if (activeDayRef.current) {
      activeDayRef.current.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [location.pathname]);

  if (isLoading) {
    return (
      <div className="space-y-1.5 py-2 pl-7 pr-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-7 w-full rounded-lg" />
        <Skeleton className="h-7 w-full rounded-lg" />
        <Skeleton className="h-7 w-full rounded-lg" />
      </div>
    );
  }

  if (!manifest) return null;

  const currentPath = location.pathname;
  const isDaysLong = manifest.days.length > 12;

  return (
    <div className="pb-2 pt-1">
      {/* 1. Group label: COURSE DAYS */}
      <div className="px-7 py-1 text-[10px] font-bold uppercase tracking-wider text-(--color-text-subtle)">
        Course Days
      </div>

      <div
        className={cn(
          "space-y-0.5 px-3",
          isDaysLong && "max-h-64 overflow-y-auto pr-1"
        )}
      >
        {manifest.days.map((d) => {
          const path = `/m/${moduleSlug}/day/${d.number}`;
          const isActive = currentPath === path;
          const isComplete = getDayProgress(moduleSlug, d, completed).isComplete;

          const dayLink = (
            <Link
              key={d.number}
              to={path}
              ref={isActive ? activeDayRef : undefined}
              onClick={onLinkClick}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-body-sm transition-colors",
                isActive
                  ? "bg-(--color-primary-fixed)/50 text-(--color-primary) font-semibold"
                  : "text-(--color-text-muted) hover:bg-(--color-container) hover:text-(--color-text)"
              )}
            >
              <Calendar
                size={14}
                className={cn(
                  "shrink-0",
                  isActive
                    ? "text-(--color-primary)"
                    : "text-(--color-text-subtle) group-hover:text-(--color-text)"
                )}
              />
              <span className="w-[58px] shrink-0 tabular-nums font-medium text-left">
                Day {d.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-(--color-text-subtle) opacity-80 text-left">
                {d.subtitle}
              </span>
              {isComplete && (
                <CheckCircle2
                  size={13}
                  className="shrink-0 text-(--color-tertiary)"
                />
              )}
            </Link>
          );

          if (d.subtitle) {
            return (
              <Tooltip key={d.number}>
                <TooltipTrigger asChild>{dayLink}</TooltipTrigger>
                <TooltipContent side="top" align="center" className="max-w-xs">
                  <span className="font-semibold">Day {d.number}:</span> {d.subtitle}
                </TooltipContent>
              </Tooltip>
            );
          }

          return dayLink;
        })}
      </div>

      {/* 2. Labs Link */}
      <div className="mt-2 border-t border-(--color-border-subtle) pt-1.5 px-3 space-y-0.5">
        <Link
          to={`/m/${moduleSlug}/labs`}
          onClick={onLinkClick}
          aria-current={currentPath === `/m/${moduleSlug}/labs` ? "page" : undefined}
          className={cn(
            "group flex w-full min-w-0 items-center gap-2.5 rounded-lg px-3 py-1.5 text-body-sm transition-colors",
            currentPath === `/m/${moduleSlug}/labs`
              ? "bg-(--color-primary-fixed)/50 text-(--color-primary) font-semibold"
              : "text-(--color-text-muted) hover:bg-(--color-container) hover:text-(--color-text)"
          )}
        >
          <FlaskConical
            size={14}
            className={cn(
              "shrink-0",
              currentPath === `/m/${moduleSlug}/labs`
                ? "text-(--color-primary)"
                : "text-(--color-text-subtle) group-hover:text-(--color-text)"
            )}
          />
          <span className="min-w-0 truncate">Labs</span>
          {manifest.labs.length > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-(--color-container) px-1.5 py-0.2 text-[10px] font-semibold text-(--color-text-muted)">
              {manifest.labs.length}
            </span>
          )}
        </Link>

        {/* 3. Visual Notes Link */}
        <Link
          to={`/m/${moduleSlug}/visual-notes`}
          onClick={onLinkClick}
          aria-current={currentPath === `/m/${moduleSlug}/visual-notes` ? "page" : undefined}
          className={cn(
            "group flex w-full min-w-0 items-center gap-2.5 rounded-lg px-3 py-1.5 text-body-sm transition-colors",
            currentPath === `/m/${moduleSlug}/visual-notes`
              ? "bg-(--color-primary-fixed)/50 text-(--color-primary) font-semibold"
              : "text-(--color-text-muted) hover:bg-(--color-container) hover:text-(--color-text)"
          )}
        >
          <PenTool
            size={14}
            className={cn(
              "shrink-0",
              currentPath === `/m/${moduleSlug}/visual-notes`
                ? "text-(--color-primary)"
                : "text-(--color-text-subtle) group-hover:text-(--color-text)"
            )}
          />
          <span className="min-w-0 truncate">Visual Notes</span>
        </Link>

        {/* 4. All days overview Link */}
        <Link
          to={`/m/${moduleSlug}`}
          onClick={onLinkClick}
          aria-current={currentPath === `/m/${moduleSlug}` ? "page" : undefined}
          className={cn(
            "group flex w-full min-w-0 items-center gap-2.5 rounded-lg px-3 py-1.5 text-body-sm transition-colors",
            currentPath === `/m/${moduleSlug}`
              ? "bg-(--color-primary-fixed)/50 text-(--color-primary) font-semibold"
              : "text-(--color-text-muted) hover:bg-(--color-container) hover:text-(--color-text)"
          )}
        >
          <LayoutGrid
            size={14}
            className={cn(
              "shrink-0",
              currentPath === `/m/${moduleSlug}`
                ? "text-(--color-primary)"
                : "text-(--color-text-subtle) group-hover:text-(--color-text)"
            )}
          />
          <span className="min-w-0 truncate">All days overview</span>
        </Link>
      </div>
    </div>
  );
}

function ModuleAccordionItem({
  module,
  isExpanded,
  onToggle,
  onLinkClick,
}: {
  module: ModuleIndexEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onLinkClick?: () => void;
}) {
  const queryClient = useQueryClient();

  return (
    <div className="border-b border-(--color-border-subtle)/70 last:border-b-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggle}
            onMouseEnter={() => prefetchModule(queryClient, module.slug)}
            onFocus={() => prefetchModule(queryClient, module.slug)}
            aria-expanded={isExpanded}
            className={cn(
              "flex w-full min-w-0 items-center gap-2.5 px-3 py-2.5 text-left text-body-sm transition-colors rounded-xl select-none",
              isExpanded
                ? "bg-(--color-container-low) text-(--color-text)"
                : "text-(--color-text-muted) hover:bg-(--color-container-low)/60 hover:text-(--color-text)"
            )}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--color-primary-fixed)/60 text-(--color-primary)">
              <BookOpen size={14} />
            </div>

            <span className="min-w-0 flex-1 truncate font-semibold" title={module.title}>
              {module.title}
            </span>

            {module.dayCount > 0 && (
              <span className="shrink-0 text-[11px] text-(--color-text-subtle) font-medium">
                {module.dayCount}d
              </span>
            )}

            <ChevronRight
              size={16}
              className={cn(
                "text-(--color-text-subtle) transition-transform duration-200 shrink-0",
                isExpanded && "rotate-90 text-(--color-primary)"
              )}
            />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-xs">
          {module.title}
        </TooltipContent>
      </Tooltip>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <ModuleExpandedContent
              moduleSlug={module.slug}
              onLinkClick={onLinkClick}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Sidebar({
  onSettingsClick,
  onLinkClick,
  className,
}: SidebarProps) {
  const { data: modulesData, isLoading } = useModules();
  const modules = useMemo(() => modulesData?.modules ?? [], [modulesData?.modules]);
  const { moduleSlug } = useParams<{ moduleSlug?: string }>();

  const [userExpanded, setUserExpanded] = useState<string[]>(getSavedExpanded);

  // Prune any stored expanded module slugs that no longer exist
  const validExpanded = useMemo(() => {
    if (modules.length === 0) return [];
    const valid = new Set(modules.map((m) => m.slug));
    const filtered = userExpanded.filter((s) => valid.has(s));
    if (filtered.length !== userExpanded.length) {
      saveExpanded(filtered);
    }
    return filtered;
  }, [modules, userExpanded]);

  // Active module from URL is always expanded along with user-toggled modules
  const expanded = useMemo(() => {
    if (moduleSlug && !validExpanded.includes(moduleSlug)) {
      return [...validExpanded, moduleSlug];
    }
    return validExpanded;
  }, [validExpanded, moduleSlug]);

  const [filterText, setFilterText] = useState("");

  const toggleModule = (slug: string) => {
    setUserExpanded((prev) => {
      const next = prev.includes(slug)
        ? prev.filter((s) => s !== slug)
        : [...prev, slug];
      saveExpanded(next);
      return next;
    });
  };

  const filteredModules = useMemo(() => {
    if (!filterText.trim()) return modules;
    return modules.filter((m) =>
      m.title.toLowerCase().includes(filterText.toLowerCase())
    );
  }, [modules, filterText]);

  return (
    <aside
      className={cn(
        "flex h-full w-[300px] flex-col border-r border-(--color-border) bg-(--color-surface)",
        className
      )}
    >
      {/* Sidebar Header / Module Section Micro-Label */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-(--color-text-subtle)">
          Modules
        </span>
        <span className="text-caption text-(--color-text-subtle)">
          {modules.length} total
        </span>
      </div>

      {/* Filter input if > 6 modules */}
      {modules.length > 6 && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-2 rounded-lg border border-(--color-border) bg-(--color-container-low) px-2.5 py-1 text-body-sm">
            <Search size={14} className="text-(--color-text-subtle)" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter modules..."
              className="w-full bg-transparent text-body-sm text-(--color-text) placeholder:text-(--color-text-subtle) focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Scrollable Modules List via Radix ScrollArea */}
      <ScrollArea.Root className="flex-1 overflow-hidden">
        <ScrollArea.Viewport className="h-full w-full px-2 py-1">
          {isLoading && (
            <div className="space-y-3 p-2">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          )}

          {!isLoading && filteredModules.length === 0 && (
            <div className="py-8 text-center text-body-sm text-(--color-text-muted)">
              No modules match filter
            </div>
          )}

          {!isLoading && (
            <div className="space-y-1">
              {filteredModules.map((m) => (
                <ModuleAccordionItem
                  key={m.slug}
                  module={m}
                  isExpanded={expanded.includes(m.slug)}
                  onToggle={() => toggleModule(m.slug)}
                  onLinkClick={onLinkClick}
                />
              ))}
            </div>
          )}
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar
          className="flex touch-none select-none p-0.5 transition-colors duration-150 ease-out hover:bg-black/5"
          orientation="vertical"
        >
          <ScrollArea.Thumb className="relative flex-1 rounded-full bg-(--color-outline-variant)/50" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>

      {/* Pinned Bottom Footer: Progress & Backup */}
      <div className="border-t border-(--color-border) p-3 bg-(--color-surface)">
        <button
          type="button"
          onClick={onSettingsClick}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-(--color-border) bg-(--color-container-low) px-3 py-2.5 text-body-sm font-semibold text-(--color-text) transition-colors hover:bg-(--color-container) focus-visible:outline-2 focus-visible:outline-(--color-ring)"
        >
          <Database size={16} className="text-(--color-primary)" />
          Progress &amp; Backup
        </button>
      </div>
    </aside>
  );
}
