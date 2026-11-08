import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useModule, prefetchDay } from "@/features/content/hooks";
import { useProgressStore, getDayProgress } from "@/features/progress";
import {
  Card,
  Skeleton,
  Badge,
  ErrorState,
  EmptyState,
  Button,
} from "@/components/ui";
import { PageHeaderBar } from "@/components/layout";
import { DayContent } from "@/components/day";
import { motion, AnimatePresence } from "motion/react";
import type { DaySummaryItem } from "@/types";
import {
  FileText,
  FileAudio,
  Link as LinkIcon,
  Presentation,
  HelpCircle,
  FlaskConical,
  ChevronDown,
  BookOpen,
  CheckCircle2,
} from "lucide-react";

function DayItemSkeleton() {
  return (
    <Card className="flex items-center gap-4 p-5">
      <Skeleton className="h-12 w-12 shrink-0 rounded-xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-8 w-24 rounded-full" />
    </Card>
  );
}

function DayAccordionRow({
  day,
  moduleSlug,
  isOpen,
  onToggle,
}: {
  day: DaySummaryItem;
  moduleSlug: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const queryClient = useQueryClient();
  const completed = useProgressStore((state) => state.completed);
  const dayProg = getDayProgress(moduleSlug, day, completed);

  const dayPad = String(day.number).padStart(2, "0");
  const isEmpty =
    !day.hasSummary &&
    day.transcriptCount === 0 &&
    day.linkCount === 0 &&
    day.boardCount === 0 &&
    day.questionCount === 0;

  return (
    <Card
      className={`overflow-hidden p-0 border transition-all ${
        isOpen
          ? "border-(--color-primary)/40 shadow-sm bg-(--color-surface)"
          : "border-[rgba(195,198,215,0.3)] bg-(--color-surface) hover:border-(--color-border-strong)"
      }`}
    >
      {/* Clickable Header Row */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        onMouseEnter={() => prefetchDay(queryClient, moduleSlug, day.number)}
        onFocus={() => prefetchDay(queryClient, moduleSlug, day.number)}
        aria-expanded={isOpen}
        className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between cursor-pointer select-none"
      >
        <div className="flex items-start gap-4 min-w-0">
          {/* Prominent Day number badge tile */}
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-mono text-section font-bold transition-colors ${
              isOpen
                ? "bg-(--color-primary) text-white shadow-xs"
                : "bg-(--color-primary-fixed) text-(--color-primary)"
            }`}
          >
            {dayPad}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-(--color-text-subtle)">
                Day {day.number}
              </span>
              {dayProg.isComplete ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-(--color-tertiary-fixed) px-2 py-0.5 text-[10px] font-bold text-(--color-tertiary)">
                  <CheckCircle2 size={11} />
                  Done
                </span>
              ) : dayProg.percent > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-(--color-container) px-2 py-0.5 text-[10px] font-mono font-bold text-(--color-primary)">
                  {dayProg.percent}%
                </span>
              ) : null}
              {isEmpty && (
                <Badge variant="neutral" size="sm">
                  Pending content
                </Badge>
              )}
            </div>

            <h3 className="text-body font-bold text-(--color-text) sm:text-section truncate">
              {day.title}
            </h3>

            {day.subtitle && (
              <p className="mt-0.5 line-clamp-1 text-body-sm text-(--color-text-muted)">
                {day.subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Count chips & chevron */}
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end shrink-0">
          {/* Summary chip */}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium transition-colors ${
              day.hasSummary
                ? "bg-(--color-primary-fixed)/60 text-(--color-primary)"
                : "bg-(--color-container-low) text-(--color-text-subtle)/50"
            }`}
          >
            <FileText size={12} />
            Summary
          </span>

          {/* Transcripts */}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium transition-colors ${
              day.transcriptCount > 0
                ? "bg-(--color-container) text-(--color-text)"
                : "bg-(--color-container-low) text-(--color-text-subtle)/50"
            }`}
          >
            <FileAudio size={12} />
            {day.transcriptCount}
          </span>

          {/* Boards */}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium transition-colors ${
              day.boardCount > 0
                ? "bg-(--color-container) text-(--color-text)"
                : "bg-(--color-container-low) text-(--color-text-subtle)/50"
            }`}
          >
            <Presentation size={12} />
            {day.boardCount}
          </span>

          {/* Questions */}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium transition-colors ${
              day.questionCount > 0
                ? "bg-(--color-container) text-(--color-text)"
                : "bg-(--color-container-low) text-(--color-text-subtle)/50"
            }`}
          >
            <HelpCircle size={12} />
            {day.questionCount}
          </span>

          {/* Links */}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-medium transition-colors ${
              day.linkCount > 0
                ? "bg-(--color-container) text-(--color-text)"
                : "bg-(--color-container-low) text-(--color-text-subtle)/50"
            }`}
          >
            <LinkIcon size={12} />
            {day.linkCount}
          </span>

          <ChevronDown
            size={18}
            className={`text-(--color-text-subtle) transition-transform duration-200 ml-1 ${
              isOpen ? "rotate-180 text-(--color-primary)" : ""
            }`}
          />
        </div>
      </div>

      {/* Expanded Inline DayContent (mounted and fetched ONLY when open!) */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden border-t border-(--color-border-subtle) bg-(--color-container-lowest) p-4 sm:p-6"
          >
            <DayContent
              moduleSlug={moduleSlug}
              dayNumber={day.number}
              compactHeader={true}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export default function ModulePage() {
  const { moduleSlug } = useParams<{ moduleSlug: string }>();
  const { data: module, isLoading, error, refetch } = useModule(moduleSlug);
  const [searchParams, setSearchParams] = useSearchParams();

  // Single open day derived directly from ?day= query param
  const activeDayParam = searchParams.get("day");
  const openDayNumber = activeDayParam ? parseInt(activeDayParam, 10) : null;

  const handleToggleDay = (dayNum: number) => {
    const nextParams = new URLSearchParams(searchParams);
    if (openDayNumber === dayNum) {
      nextParams.delete("day");
    } else {
      nextParams.set("day", String(dayNum));
    }
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb + Back Bar */}
      <PageHeaderBar currentPageType="module" />

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-6">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <div className="space-y-3 pt-4">
            <DayItemSkeleton />
            <DayItemSkeleton />
            <DayItemSkeleton />
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="py-12">
          <ErrorState
            title="Module not found"
            message={`Could not load manifest for "${moduleSlug}". It may not exist or has not been uploaded yet.`}
            onRetry={() => refetch()}
            action={
              <Link to="/">
                <Button variant="secondary" size="sm">
                  Back to All Modules
                </Button>
              </Link>
            }
          />
        </div>
      )}

      {/* Content */}
      {!isLoading && !error && module && (
        <div className="space-y-8">
          {/* Module Hero Header Card */}
          <div className="rounded-2xl border border-[rgba(195,198,215,0.25)] bg-(--color-surface) p-6 sm:p-8 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-(--color-primary)">
                {module.courseCode ?? "Course Module"}
              </span>
              <span className="text-(--color-text-subtle)">•</span>
              <Badge variant="pill" size="sm">
                {module.days.length} {module.days.length === 1 ? "Day" : "Days"}
              </Badge>
              {module.labs.length > 0 && (
                <Badge variant="neutral" size="sm">
                  <FlaskConical size={12} className="mr-1" />
                  {module.labs.length} Labs
                </Badge>
              )}
            </div>

            <h1 className="mt-2 text-page font-bold text-(--color-text)">
              {module.title}
            </h1>

            {module.subtitle && (
              <p className="mt-1 text-section font-normal text-(--color-text-muted)">
                {module.subtitle}
              </p>
            )}

            {module.description && (
              <p className="mt-4 text-body text-(--color-text-muted) max-w-2xl">
                {module.description}
              </p>
            )}

            {/* Quick links to labs if available */}
            {module.labs.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2 border-t border-(--color-border-subtle) pt-4">
                <Link to={`/m/${module.slug}/labs`}>
                  <Button variant="secondary" size="sm">
                    <FlaskConical size={15} />
                    View {module.labs.length} Lab Exercises
                  </Button>
                </Link>
              </div>
            )}
          </div>

          {/* Days Accordion Section */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-section font-bold text-(--color-text)">
                Daily Lectures &amp; Notes
              </h2>
              <span className="text-caption font-medium text-(--color-text-muted)">
                {module.days.length} lectures • Click row to expand
              </span>
            </div>

            {module.days.length === 0 ? (
              <EmptyState
                icon={<BookOpen size={44} strokeWidth={1.5} />}
                title="No days published yet"
                description="Lectures and day study materials will be added soon."
              />
            ) : (
              <div className="space-y-3">
                {module.days.map((day) => (
                  <DayAccordionRow
                    key={day.number}
                    day={day}
                    moduleSlug={module.slug}
                    isOpen={openDayNumber === day.number}
                    onToggle={() => handleToggleDay(day.number)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
