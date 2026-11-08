import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { useModules, prefetchDay, prefetchModule } from "@/features/content/hooks";
import type { ModuleManifest } from "@/types";
import { ArrowLeft, ArrowRight, LayoutGrid, Sparkles } from "lucide-react";

interface DayNavFooterProps {
  module: ModuleManifest;
  currentDayNumber: number;
}

export function DayNavFooter({
  module,
  currentDayNumber,
}: DayNavFooterProps) {
  const queryClient = useQueryClient();
  const { data: modulesIndex } = useModules();

  const days = module.days;
  const currentIndex = days.findIndex((d) => d.number === currentDayNumber);

  const prevDay = currentIndex > 0 ? days[currentIndex - 1] : undefined;
  const nextDay =
    currentIndex >= 0 && currentIndex < days.length - 1
      ? days[currentIndex + 1]
      : undefined;

  // Next module if on the last day of this module
  const allModules = modulesIndex?.modules ?? [];
  const currentModuleIdx = allModules.findIndex((m) => m.slug === module.slug);
  const nextModule =
    !nextDay && currentModuleIdx >= 0 && currentModuleIdx < allModules.length - 1
      ? allModules[currentModuleIdx + 1]
      : undefined;

  // Prefetch next day or next module
  useEffect(() => {
    if (nextDay) {
      prefetchDay(queryClient, module.slug, nextDay.number);
    } else if (nextModule) {
      prefetchModule(queryClient, nextModule.slug);
    }
  }, [nextDay, nextModule, module.slug, queryClient]);

  return (
    <div className="pt-8 border-t border-(--color-border-subtle) space-y-4">
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Previous Day Button */}
        {prevDay ? (
          <Link
            to={`/m/${module.slug}/day/${prevDay.number}`}
            className="flex-1 max-w-xs"
          >
            <Button variant="secondary" className="w-full justify-start gap-2 h-12">
              <ArrowLeft size={16} />
              <div className="text-left truncate">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-(--color-text-subtle)">
                  Previous Day
                </span>
                <span className="block text-body-sm font-bold truncate">
                  Day {prevDay.number}: {prevDay.title}
                </span>
              </div>
            </Button>
          </Link>
        ) : (
          <div className="flex-1 max-w-xs" />
        )}

        {/* Next Day or Overview Button */}
        {nextDay ? (
          <Link
            to={`/m/${module.slug}/day/${nextDay.number}`}
            className="flex-1 max-w-md"
          >
            <Button variant="cta">
              <div className="text-left truncate pr-2">
                <span className="block text-[11px] font-medium text-white/80 uppercase tracking-wider">
                  Next Day
                </span>
                <span className="block text-body font-bold text-white truncate">
                  Day {nextDay.number}: {nextDay.title}
                </span>
              </div>
              <ArrowRight size={20} className="shrink-0 text-white" />
            </Button>
          </Link>
        ) : (
          <Link to={`/m/${module.slug}`} className="flex-1 max-w-md">
            <Button variant="secondary" className="w-full justify-center gap-2 h-12">
              <LayoutGrid size={16} />
              <span>Back to Module Overview</span>
            </Button>
          </Link>
        )}
      </div>

      {/* Next Module card if on the last day */}
      {nextModule && (
        <div className="rounded-2xl border border-[rgba(195,198,215,0.25)] bg-(--color-surface) p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--color-primary-fixed) text-(--color-primary)">
              <Sparkles size={20} />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-(--color-primary)">
                Completed All Days • Next Module Available
              </span>
              <h4 className="text-body font-bold text-(--color-text)">
                {nextModule.title}
              </h4>
            </div>
          </div>
          <Link to={`/m/${nextModule.slug}`}>
            <Button variant="primary" size="sm" className="gap-1.5">
              <span>Go to Next Module</span>
              <ArrowRight size={14} />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

