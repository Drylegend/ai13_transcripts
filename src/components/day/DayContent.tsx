import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import * as Tabs from "@radix-ui/react-tabs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { useDay } from "@/features/content/hooks";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { Card } from "@/components/ui/Card";
import { SummaryTab } from "./SummaryTab";
import { TranscriptsTab } from "./TranscriptsTab";
import { LinksTab } from "./LinksTab";
import { BoardsTab } from "./BoardsTab";
import { QuestionsTab } from "./QuestionsTab";
import {
  FileText,
  FileAudio,
  Link as LinkIcon,
  Presentation,
  HelpCircle,
  Sparkles,
  ExternalLink,
} from "lucide-react";

interface DayContentProps {
  moduleSlug: string;
  dayNumber: number;
  compactHeader?: boolean;
}

const TAB_KEYS = [
  "summary",
  "transcripts",
  "links",
  "boards",
  "questions",
] as const;
type TabKey = (typeof TAB_KEYS)[number];

export function DayContent({
  moduleSlug,
  dayNumber,
  compactHeader = false,
}: DayContentProps) {
  const { data: day, isLoading, error, refetch } = useDay(moduleSlug, dayNumber);
  const [searchParams, setSearchParams] = useSearchParams();

  // Derive active tab from URL query param or default to 'summary'
  const tabParam = searchParams.get("tab") as TabKey;
  const activeTab: TabKey =
    tabParam && TAB_KEYS.includes(tabParam) ? tabParam : "summary";

  // Lazy tab panel mounting: only mount tab when visited
  const [visitedTabs, setVisitedTabs] = useState<Set<TabKey>>(
    () => new Set([activeTab])
  );
  if (!visitedTabs.has(activeTab)) {
    setVisitedTabs((prev) => new Set([...prev, activeTab]));
  }

  // Update URL search query ?tab= with replace: true
  const handleTabChange = (tab: string) => {
    const validTab = tab as TabKey;
    const nextParams = new URLSearchParams(searchParams);
    if (validTab === "summary") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", validTab);
    }
    setSearchParams(nextParams, { replace: true });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 py-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !day) {
    return (
      <div className="py-6">
        <ErrorState
          title="Could not load day details"
          message={error?.message || "Day content not found."}
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const dayPad = String(day.number).padStart(2, "0");

  return (
    <div className="space-y-6">
      {/* 1. Compact Header (used when rendered inside ModulePage accordion row) */}
      {compactHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-(--color-border-subtle) bg-(--color-surface) p-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-(--color-primary-fixed) font-mono text-body font-bold text-(--color-primary)">
              {dayPad}
            </div>
            <div>
              <h3 className="text-body font-bold text-(--color-text)">
                Day {day.number} — {day.title}
              </h3>
              {day.subtitle && (
                <p className="text-caption text-(--color-text-muted)">
                  {day.subtitle}
                </p>
              )}
            </div>
          </div>

          <Link
            to={`/m/${moduleSlug}/day/${day.number}`}
            className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-lg bg-(--color-container) px-3 py-1.5 text-caption font-semibold text-(--color-primary) hover:bg-(--color-container-high) transition-colors"
          >
            <span>Open full page</span>
            <ExternalLink size={12} />
          </Link>
        </div>
      )}

      {/* 2. "In a nutshell: what happened in class" Recap Callout */}
      {day.recap && (
        <Card className="rounded-2xl border-(--color-primary-fixed-dim)/70 bg-(--color-primary-fixed)/25 p-5 sm:p-6 shadow-xs">
          <div className="flex items-center gap-2 text-(--color-primary) mb-2">
            <Sparkles size={18} strokeWidth={2.2} />
            <span className="text-body-sm font-bold uppercase tracking-wider text-(--color-primary)">
              In a Nutshell: What Happened in Class Today
            </span>
          </div>
          <div className="prose max-w-none text-body text-(--color-text) leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {day.recap}
            </ReactMarkdown>
          </div>
        </Card>
      )}

      {/* 3. TABS: Order FIXED (Summary | Transcripts | Important Links | Class Board Work | Questions) */}
      <Tabs.Root value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        {/* Sticky horizontal-scrollable Tab Bar */}
        <div className="sticky top-16 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 bg-(--color-bg)/95 backdrop-blur-md pt-2 pb-1 border-b border-(--color-border)">
          <Tabs.List
            aria-label="Day content tabs"
            className="flex items-center gap-1 sm:gap-2 overflow-x-auto no-scrollbar scroll-smooth snap-x pb-1"
          >
            {/* Tab 1: Summary */}
            <Tabs.Trigger
              value="summary"
              className="group relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-body-sm font-semibold transition-colors shrink-0 snap-start select-none data-[state=active]:text-(--color-primary) data-[state=active]:bg-(--color-primary-fixed)/40 text-(--color-text-muted) hover:bg-(--color-container-low) hover:text-(--color-text)"
            >
              <FileText size={16} />
              <span>Summary</span>
              {day.summary && (
                <span className="h-2 w-2 rounded-full bg-(--color-primary)" />
              )}
            </Tabs.Trigger>

            {/* Tab 2: Transcripts */}
            <Tabs.Trigger
              value="transcripts"
              className="group relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-body-sm font-semibold transition-colors shrink-0 snap-start select-none data-[state=active]:text-(--color-primary) data-[state=active]:bg-(--color-primary-fixed)/40 text-(--color-text-muted) hover:bg-(--color-container-low) hover:text-(--color-text)"
            >
              <FileAudio size={16} />
              <span>Transcripts</span>
              {day.transcripts.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-(--color-container) px-1.5 font-mono text-[10px] font-bold text-(--color-text)">
                  {day.transcripts.length}
                </span>
              )}
            </Tabs.Trigger>

            {/* Tab 3: Important Links */}
            <Tabs.Trigger
              value="links"
              className="group relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-body-sm font-semibold transition-colors shrink-0 snap-start select-none data-[state=active]:text-(--color-primary) data-[state=active]:bg-(--color-primary-fixed)/40 text-(--color-text-muted) hover:bg-(--color-container-low) hover:text-(--color-text)"
            >
              <LinkIcon size={16} />
              <span>Important Links</span>
              {day.links.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-(--color-container) px-1.5 font-mono text-[10px] font-bold text-(--color-text)">
                  {day.links.length}
                </span>
              )}
            </Tabs.Trigger>

            {/* Tab 4: Class Board Work */}
            <Tabs.Trigger
              value="boards"
              className="group relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-body-sm font-semibold transition-colors shrink-0 snap-start select-none data-[state=active]:text-(--color-primary) data-[state=active]:bg-(--color-primary-fixed)/40 text-(--color-text-muted) hover:bg-(--color-container-low) hover:text-(--color-text)"
            >
              <Presentation size={16} />
              <span>Class Board Work</span>
              {day.boards.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-(--color-container) px-1.5 font-mono text-[10px] font-bold text-(--color-text)">
                  {day.boards.length}
                </span>
              )}
            </Tabs.Trigger>

            {/* Tab 5: Questions */}
            <Tabs.Trigger
              value="questions"
              className="group relative inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-body-sm font-semibold transition-colors shrink-0 snap-start select-none data-[state=active]:text-(--color-primary) data-[state=active]:bg-(--color-primary-fixed)/40 text-(--color-text-muted) hover:bg-(--color-container-low) hover:text-(--color-text)"
            >
              <HelpCircle size={16} />
              <span>Questions</span>
              {day.questions.length > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-(--color-container) px-1.5 font-mono text-[10px] font-bold text-(--color-text)">
                  {day.questions.length}
                </span>
              )}
            </Tabs.Trigger>
          </Tabs.List>
        </div>

        {/* Tab Panels: Mounted lazily on first visit */}
        <Tabs.Content value="summary" className="focus:outline-none">
          {visitedTabs.has("summary") && (
            <SummaryTab day={day} moduleSlug={moduleSlug} />
          )}
        </Tabs.Content>

        <Tabs.Content value="transcripts" className="focus:outline-none">
          {visitedTabs.has("transcripts") && (
            <TranscriptsTab day={day} moduleSlug={moduleSlug} />
          )}
        </Tabs.Content>

        <Tabs.Content value="links" className="focus:outline-none">
          {visitedTabs.has("links") && <LinksTab day={day} />}
        </Tabs.Content>

        <Tabs.Content value="boards" className="focus:outline-none">
          {visitedTabs.has("boards") && <BoardsTab day={day} />}
        </Tabs.Content>

        <Tabs.Content value="questions" className="focus:outline-none">
          {visitedTabs.has("questions") && (
            <QuestionsTab day={day} moduleSlug={moduleSlug} />
          )}
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
