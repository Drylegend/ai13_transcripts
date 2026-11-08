import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import MiniSearch from "minisearch";
import { useSearchIndex, useModules } from "@/features/content/hooks";
import { SITE_CONFIG } from "@/config/site";
import type { SearchEntry } from "@/types";
import {
  Search,
  BookOpen,
  Calendar,
  FlaskConical,
  HelpCircle,
  Clock,
  ArrowRight,
  Sparkles,
} from "lucide-react";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface IndexedItem extends SearchEntry {
  id: string;
  tagsStr: string;
}

const RECENT_KEY = `${SITE_CONFIG.storageKeyPrefix}:recent-searches`;

export function saveRecentItem(item: SearchEntry) {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: SearchEntry[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter(
      (x) =>
        !(
          x.type === item.type &&
          x.moduleSlug === item.moduleSlug &&
          x.dayNumber === item.dayNumber &&
          x.labId === item.labId &&
          x.title === item.title
        )
    );
    const updated = [item, ...filtered].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch {
    // localStorage unavailable
  }
}

function getRecentItems(): SearchEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  // Lazily load search index ONLY when palette is opened
  const { data: searchIndex, isLoading } = useSearchIndex({ enabled: open });
  const { data: modulesIndex } = useModules();

  const recents = useMemo(() => {
    return open ? getRecentItems() : [];
  }, [open]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        setQuery("");
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  // Global shortcuts: Cmd/Ctrl+K or "/" when not focused on an input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleOpenChange(!open);
        return;
      }

      if (e.key === "/" && !open) {
        const active = document.activeElement;
        const isInput =
          active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          active?.getAttribute("contenteditable") === "true";
        if (!isInput) {
          e.preventDefault();
          handleOpenChange(true);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, handleOpenChange]);

  // Build and cache MiniSearch index
  const miniSearch = useMemo(() => {
    if (!searchIndex && !modulesIndex) return null;

    const entries: SearchEntry[] =
      searchIndex && searchIndex.length > 0
        ? searchIndex
        : (modulesIndex?.modules.map((m) => ({
            type: "module" as const,
            moduleSlug: m.slug,
            title: m.title,
            snippet: m.subtitle || m.description,
            tags: m.tags,
          })) ?? []);

    const indexed: IndexedItem[] = entries.map((entry, idx) => ({
      ...entry,
      id: `${entry.type}-${entry.moduleSlug}-${entry.dayNumber ?? entry.labId ?? idx}`,
      tagsStr: entry.tags.join(" "),
    }));

    const ms = new MiniSearch<IndexedItem>({
      fields: ["title", "snippet", "tagsStr", "moduleSlug"],
      storeFields: [
        "id",
        "type",
        "moduleSlug",
        "dayNumber",
        "labId",
        "title",
        "snippet",
        "tags",
      ],
      searchOptions: {
        boost: { title: 2.5, tagsStr: 1.5 },
        fuzzy: 0.2,
        prefix: true,
      },
    });

    ms.addAll(indexed);
    return ms;
  }, [searchIndex, modulesIndex]);

  // Execute Search query
  const results = useMemo(() => {
    const q = query.trim();
    if (!q || !miniSearch) return null;

    try {
      const hits = miniSearch.search(q);
      const items = hits.map((h) => ({
        type: h.type as SearchEntry["type"],
        moduleSlug: h.moduleSlug as string,
        dayNumber: h.dayNumber as number | undefined,
        labId: h.labId as string | undefined,
        title: h.title as string,
        snippet: h.snippet as string,
        tags: (h.tags as string[]) || [],
      }));

      // Group by type (up to 8 per group)
      const modules = items.filter((x) => x.type === "module").slice(0, 8);
      const days = items.filter((x) => x.type === "day").slice(0, 8);
      const labs = items.filter((x) => x.type === "lab").slice(0, 8);
      const questions = items.filter((x) => x.type === "question").slice(0, 8);

      return {
        modules,
        days,
        labs,
        questions,
        total: modules.length + days.length + labs.length + questions.length,
      };
    } catch {
      return { modules: [], days: [], labs: [], questions: [], total: 0 };
    }
  }, [query, miniSearch]);

  const handleSelect = (item: SearchEntry) => {
    saveRecentItem(item);
    handleOpenChange(false);

    if (item.type === "module") {
      navigate(`/m/${item.moduleSlug}`);
    } else if (item.type === "day") {
      navigate(`/m/${item.moduleSlug}/day/${item.dayNumber ?? 1}`);
    } else if (item.type === "question") {
      navigate(`/m/${item.moduleSlug}/day/${item.dayNumber ?? 1}#question-${item.labId || item.title}`);
    } else if (item.type === "lab") {
      if (item.labId) {
        navigate(`/m/${item.moduleSlug}/labs/${item.labId}`);
      } else {
        navigate(`/m/${item.moduleSlug}/labs`);
      }
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "module":
        return <BookOpen size={15} className="text-(--color-primary)" />;
      case "day":
        return <Calendar size={15} className="text-(--color-tertiary)" />;
      case "lab":
        return <FlaskConical size={15} className="text-(--color-amber)" />;
      case "question":
        return <HelpCircle size={15} className="text-(--color-primary)" />;
      default:
        return <Search size={15} className="text-(--color-text-subtle)" />;
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity animate-in fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-[12%] z-50 w-[94vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-[rgba(195,198,215,0.35)] bg-(--color-surface) shadow-2xl transition-all focus:outline-none">
          <Command
            className="flex flex-col overflow-hidden"
            shouldFilter={false} // Handled by MiniSearch
          >
            {/* Input Row */}
            <div className="flex items-center gap-3 border-b border-(--color-border) px-4 py-3.5">
              <Search size={18} className="text-(--color-text-subtle) shrink-0" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search modules, days, labs, questions..."
                className="flex-1 bg-transparent text-body font-normal text-(--color-text) placeholder:text-(--color-text-subtle) focus:outline-none"
                autoFocus
              />
              <kbd className="hidden rounded-md bg-(--color-container) px-2 py-0.5 text-[11px] font-mono font-medium text-(--color-text-muted) sm:inline-block">
                ESC
              </kbd>
            </div>

            {/* Content List */}
            <Command.List className="max-h-[380px] overflow-y-auto p-2 scroll-py-2">
              {isLoading && (
                <div className="py-12 text-center text-body-sm text-(--color-text-muted)">
                  <div className="mx-auto mb-2 flex h-8 w-8 animate-spin items-center justify-center text-(--color-primary)">
                    <Sparkles size={20} />
                  </div>
                  Loading search index...
                </div>
              )}

              {/* No results */}
              {!isLoading && results && results.total === 0 && (
                <div className="py-12 text-center text-body-sm text-(--color-text-muted)">
                  No results found for &ldquo;<span className="font-semibold text-(--color-text)">{query}</span>&rdquo;
                  <p className="mt-1 text-caption text-(--color-text-subtle)">
                    Try searching for general keywords, day numbers, or topics.
                  </p>
                </div>
              )}

              {/* Empty query: Show Recents & Modules */}
              {!isLoading && !results && (
                <>
                  {recents.length > 0 && (
                    <Command.Group
                      heading="Recent Visits"
                      className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-(--color-text-subtle)"
                    >
                      {recents.map((item, idx) => (
                        <Command.Item
                          key={`recent-${idx}`}
                          onSelect={() => handleSelect(item)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2 text-body-sm text-(--color-text) hover:bg-(--color-container-low) aria-selected:bg-(--color-container-low) cursor-pointer select-none"
                        >
                          <Clock size={14} className="text-(--color-text-subtle)" />
                          <span className="flex-1 truncate font-medium">{item.title}</span>
                          <span className="rounded bg-(--color-container) px-1.5 py-0.5 text-[10px] uppercase font-semibold text-(--color-text-muted)">
                            {item.type}
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}

                  {modulesIndex?.modules && (
                    <Command.Group
                      heading="Quick Links to Modules"
                      className="mt-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-(--color-text-subtle)"
                    >
                      {modulesIndex.modules.map((m) => (
                        <Command.Item
                          key={m.slug}
                          onSelect={() =>
                            handleSelect({
                              type: "module",
                              moduleSlug: m.slug,
                              title: m.title,
                              snippet: m.subtitle,
                              tags: m.tags,
                            })
                          }
                          className="flex items-center gap-3 rounded-xl px-3 py-2 text-body-sm text-(--color-text) hover:bg-(--color-container-low) aria-selected:bg-(--color-container-low) cursor-pointer select-none"
                        >
                          <BookOpen size={15} className="text-(--color-primary)" />
                          <div className="flex-1 truncate">
                            <span className="font-semibold">{m.title}</span>
                            {m.subtitle && (
                              <span className="ml-2 text-caption text-(--color-text-muted)">
                                {m.subtitle}
                              </span>
                            )}
                          </div>
                          <ArrowRight size={14} className="text-(--color-text-subtle)" />
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                </>
              )}

              {/* Active Results */}
              {results && results.total > 0 && (
                <>
                  {results.modules.length > 0 && (
                    <Command.Group
                      heading="Modules"
                      className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-(--color-text-subtle)"
                    >
                      {results.modules.map((item, idx) => (
                        <Command.Item
                          key={`mod-${idx}`}
                          onSelect={() => handleSelect(item)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm text-(--color-text) hover:bg-(--color-container-low) aria-selected:bg-(--color-container-low) cursor-pointer select-none"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--color-container)">
                            {getTypeIcon("module")}
                          </div>
                          <div className="flex-1 truncate">
                            <div className="font-semibold">{item.title}</div>
                            <div className="text-caption text-(--color-text-muted) truncate">
                              {item.snippet}
                            </div>
                          </div>
                          <ArrowRight size={14} className="text-(--color-text-subtle)" />
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}

                  {results.days.length > 0 && (
                    <Command.Group
                      heading="Days & Lectures"
                      className="mt-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-(--color-text-subtle)"
                    >
                      {results.days.map((item, idx) => (
                        <Command.Item
                          key={`day-${idx}`}
                          onSelect={() => handleSelect(item)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm text-(--color-text) hover:bg-(--color-container-low) aria-selected:bg-(--color-container-low) cursor-pointer select-none"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--color-container)">
                            {getTypeIcon("day")}
                          </div>
                          <div className="flex-1 truncate">
                            <div className="font-semibold">{item.title}</div>
                            <div className="text-caption text-(--color-text-muted) truncate">
                              {item.snippet}
                            </div>
                          </div>
                          <span className="rounded bg-(--color-primary-fixed) px-2 py-0.5 text-[10px] font-bold text-(--color-primary)">
                            Day {item.dayNumber}
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}

                  {results.labs.length > 0 && (
                    <Command.Group
                      heading="Lab Exercises"
                      className="mt-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-(--color-text-subtle)"
                    >
                      {results.labs.map((item, idx) => (
                        <Command.Item
                          key={`lab-${idx}`}
                          onSelect={() => handleSelect(item)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm text-(--color-text) hover:bg-(--color-container-low) aria-selected:bg-(--color-container-low) cursor-pointer select-none"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--color-container)">
                            {getTypeIcon("lab")}
                          </div>
                          <div className="flex-1 truncate">
                            <div className="font-semibold">{item.title}</div>
                            <div className="text-caption text-(--color-text-muted) truncate">
                              {item.snippet}
                            </div>
                          </div>
                          <span className="rounded bg-(--color-container) px-2 py-0.5 text-[10px] font-bold text-(--color-text)">
                            Lab
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}

                  {results.questions.length > 0 && (
                    <Command.Group
                      heading="Questions & Answers"
                      className="mt-2 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-(--color-text-subtle)"
                    >
                      {results.questions.map((item, idx) => (
                        <Command.Item
                          key={`q-${idx}`}
                          onSelect={() => handleSelect(item)}
                          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm text-(--color-text) hover:bg-(--color-container-low) aria-selected:bg-(--color-container-low) cursor-pointer select-none"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--color-container)">
                            {getTypeIcon("question")}
                          </div>
                          <div className="flex-1 truncate">
                            <div className="font-semibold">{item.title}</div>
                            <div className="text-caption text-(--color-text-muted) truncate">
                              {item.snippet}
                            </div>
                          </div>
                          <span className="rounded bg-(--color-primary-fixed)/60 px-2 py-0.5 text-[10px] font-bold text-(--color-primary)">
                            Q&amp;A
                          </span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}
                </>
              )}
            </Command.List>

            {/* Bottom Keyboard Guide */}
            <div className="flex items-center justify-between border-t border-(--color-border-subtle) bg-(--color-container-lowest) px-4 py-2 text-[11px] text-(--color-text-subtle)">
              <div className="flex items-center gap-3">
                <span><kbd className="font-mono">↑↓</kbd> Navigate</span>
                <span><kbd className="font-mono">↵</kbd> Select</span>
                <span><kbd className="font-mono">ESC</kbd> Close</span>
              </div>
              <span className="font-medium text-(--color-primary)">Fast Search</span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
