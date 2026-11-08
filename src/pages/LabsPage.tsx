import { useSearchParams, useParams } from "react-router-dom";
import { Skeleton, EmptyState } from "@/components/ui";
import { PageHeaderBar } from "@/components/layout";
import { useModule } from "@/features/content/hooks";
import {
  useProgressStore,
  getCategoryLabCounts,
} from "@/features/progress";
import { LabProgressPanel } from "@/components/labs/LabProgressPanel";
import { LabCard } from "@/components/labs/LabCard";
import { FlaskConical } from "lucide-react";

export default function LabsPage() {
  const { moduleSlug } = useParams<{ moduleSlug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: module, isLoading } = useModule(moduleSlug);

  const storeLabs = useProgressStore((state) => state.labs);

  const categories = module?.labCategories ?? [];
  const showCategorySwitcher = categories.length > 1;

  // Active category from URL ?category=, default to first category or "all"
  const paramCategory = searchParams.get("category");
  const activeCategory =
    paramCategory && categories.some((c) => c.slug === paramCategory)
      ? paramCategory
      : categories[0]?.slug ?? "all";

  const handleSelectCategory = (catSlug: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("category", catSlug);
        return next;
      },
      { replace: true }
    );
  };

  const activeCategoryObj = categories.find((c) => c.slug === activeCategory);
  const activeCategoryLabel = activeCategoryObj
    ? activeCategoryObj.label
    : "All Labs";

  const allLabs = module?.labs ?? [];
  const filteredLabs = showCategorySwitcher
    ? allLabs.filter((lab) => lab.category === activeCategory)
    : allLabs;

  // Real-time counts from Zustand store
  const counts = moduleSlug
    ? getCategoryLabCounts(
        moduleSlug,
        allLabs,
        storeLabs,
        showCategorySwitcher ? activeCategory : undefined
      )
    : { notStarted: 0, inProgress: 0, done: 0, total: 0, percent: 0 };

  return (
    <div>
      <PageHeaderBar currentPageType="labs" />

      {/* Page Heading */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-page font-bold text-(--color-text)">
            Lab Exercises
          </h1>
          <p className="mt-1 text-body-sm text-(--color-text-muted)">
            Hands-on assignments, architectural sketches, and personal study notes
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-6">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-44 w-full rounded-2xl" />
          </div>
        </div>
      )}

      {!isLoading && module && allLabs.length === 0 && (
        <EmptyState
          icon={<FlaskConical size={48} strokeWidth={1.5} />}
          title="No labs available yet"
          description="Lab assignments and architecture blueprints will appear here once ingested."
        />
      )}

      {!isLoading && module && allLabs.length > 0 && (
        <>
          {/* Category Switcher Tabs (Only shown if > 1 category) */}
          {showCategorySwitcher && (
            <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {categories.map((cat) => {
                const isActive = cat.slug === activeCategory;
                const catCounts = moduleSlug
                  ? getCategoryLabCounts(moduleSlug, allLabs, storeLabs, cat.slug)
                  : { total: 0, done: 0 };

                return (
                  <button
                    key={cat.slug}
                    type="button"
                    onClick={() => handleSelectCategory(cat.slug)}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-body-sm font-semibold transition-all ${
                      isActive
                        ? "bg-(--color-primary) text-white shadow-sm"
                        : "bg-(--color-container-low) text-(--color-text-muted) hover:bg-(--color-container) hover:text-(--color-text)"
                    }`}
                  >
                    <span>{cat.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-mono font-bold ${
                        isActive
                          ? "bg-white/20 text-white"
                          : "bg-(--color-surface) text-(--color-text-subtle)"
                      }`}
                    >
                      {catCounts.done}/{catCounts.total}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Progress Panel for Active Category */}
          <LabProgressPanel
            categoryLabel={activeCategoryLabel}
            done={counts.done}
            inProgress={counts.inProgress}
            notStarted={counts.notStarted}
            total={counts.total}
            percent={counts.percent}
          />

          {/* Lab Cards Grid */}
          {filteredLabs.length === 0 ? (
            <EmptyState
              icon={<FlaskConical size={48} strokeWidth={1.5} />}
              title={`No labs in ${activeCategoryLabel}`}
              description="No exercises have been scheduled for this category yet."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredLabs.map((lab) => (
                <LabCard
                  key={lab.id}
                  lab={lab}
                  moduleSlug={moduleSlug!}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
