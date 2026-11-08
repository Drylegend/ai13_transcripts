import { Link, useParams } from "react-router-dom";
import { useDay, useModule } from "@/features/content/hooks";
import { Skeleton, ErrorState, Button } from "@/components/ui";
import { PageHeaderBar } from "@/components/layout";
import { DayHeaderCard, DayContent, DayNavFooter } from "@/components/day";

export default function DayPage() {
  const { moduleSlug, dayNumber } = useParams<{
    moduleSlug: string;
    dayNumber: string;
  }>();

  const num = dayNumber ? parseInt(dayNumber, 10) : undefined;
  const { data: day, isLoading, error, refetch } = useDay(moduleSlug, num);
  const { data: module } = useModule(moduleSlug);

  return (
    <div className="space-y-6">
      {/* Breadcrumb + Back Bar */}
      <PageHeaderBar currentPageType="day" />

      {/* Loading Skeleton */}
      {isLoading && (
        <div className="space-y-6">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      )}

      {/* Error / Not Found */}
      {error && (
        <div className="py-12">
          <ErrorState
            title="Day content not found"
            message={`Could not load materials for Day ${dayNumber} of "${moduleSlug}".`}
            onRetry={() => refetch()}
            action={
              <Link to={moduleSlug ? `/m/${moduleSlug}` : "/"}>
                <Button variant="secondary" size="sm">
                  Back to Module
                </Button>
              </Link>
            }
          />
        </div>
      )}

      {/* Main Content */}
      {!isLoading && !error && day && moduleSlug && num && (
        <div className="space-y-8">
          {/* Day Header Card */}
          <DayHeaderCard
            day={day}
            moduleSlug={moduleSlug}
            moduleTitle={module?.title}
          />

          {/* Shared DayContent (Recap + Fixed-Order Tabs) */}
          <DayContent moduleSlug={moduleSlug} dayNumber={num} />

          {/* Prev / Next Navigation Bar */}
          {module && (
            <DayNavFooter module={module} currentDayNumber={num} />
          )}
        </div>
      )}
    </div>
  );
}
