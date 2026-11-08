import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { useProgressStore } from "@/features/progress";
import { progressKeys } from "@/features/content/schemas";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { motion, AnimatePresence } from "motion/react";
import type { DayDetail, QuestionItem } from "@/types";
import {
  HelpCircle,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Sparkles,
  BookOpen,
} from "lucide-react";

interface QuestionsTabProps {
  day: DayDetail;
  moduleSlug: string;
}

function QuestionCard({
  q,
  index,
  moduleSlug,
  dayNumber,
  isExpanded,
  onToggleExpand,
}: {
  q: QuestionItem;
  index: number;
  moduleSlug: string;
  dayNumber: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const progressKey = progressKeys.dayQuestion(moduleSlug, dayNumber, q.id);
  const isUnderstood = useProgressStore((state) => state.isCompleted(progressKey));
  const toggleUnderstood = useProgressStore((state) => state.toggleCompleted);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const location = useLocation();

  // Scroll into view if matched by hash
  useEffect(() => {
    const hash = location.hash.replace(/^#/, "");
    if (hash === `question-${q.id}`) {
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [location.hash, q.id]);

  const qNumber = index + 1;

  return (
    <div
      ref={cardRef}
      id={`question-${q.id}`}
      className="scroll-mt-24"
    >
      <Card
        className={`overflow-hidden p-0 border transition-all ${
          isUnderstood
            ? "border-teal-200 dark:border-teal-900/60 bg-(--color-surface)"
            : "border-[rgba(195,198,215,0.3)] bg-(--color-surface)"
        }`}
      >
        {/* Question Header (Always Visible) */}
        <div
          onClick={onToggleExpand}
          className="flex items-start justify-between gap-3.5 p-4 sm:p-5 cursor-pointer select-none hover:bg-(--color-container-low)/50 transition-colors"
        >
          <div className="flex items-start gap-3 min-w-0">
            {/* Q1, Q2 number tile */}
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-caption font-bold transition-colors ${
                isUnderstood
                  ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300"
                  : "bg-(--color-container) text-(--color-primary)"
              }`}
            >
              Q{qNumber}
            </div>

            <div className="min-w-0">
              <h4 className="text-body font-bold text-(--color-text) leading-snug">
                {q.question}
              </h4>

              {q.tags && q.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {q.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-(--color-container) px-1.5 py-0.2 text-[10px] font-medium text-(--color-text-subtle)"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleUnderstood(progressKey);
              }}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-caption font-medium transition-colors hover:bg-(--color-container)"
              aria-label={isUnderstood ? "Understood" : "Mark as understood"}
            >
              {isUnderstood ? (
                <>
                  <CheckCircle2 size={16} className="text-teal-600 dark:text-teal-400" />
                  <span className="hidden sm:inline text-teal-700 dark:text-teal-300 font-semibold">
                    Understood
                  </span>
                </>
              ) : (
                <>
                  <Circle size={16} className="text-(--color-text-subtle)" />
                  <span className="hidden sm:inline text-(--color-text-muted)">
                    Understood?
                  </span>
                </>
              )}
            </button>

            <div className="text-(--color-text-subtle)">
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </div>
        </div>

        {/* Expandable Answers & Explanation */}
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              key="content"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden border-t border-(--color-border-subtle) bg-(--color-container-lowest) p-4 sm:p-6 space-y-4"
            >
              {/* 1. Short Answer Block */}
              <div className="rounded-xl border border-(--color-border-subtle) bg-(--color-surface) p-4">
                <div className="flex items-center gap-1.5 text-caption font-bold uppercase tracking-wider text-(--color-text-subtle) mb-1.5">
                  <BookOpen size={13} />
                  <span>Direct Answer</span>
                </div>
                <div className="prose max-w-none text-body text-(--color-text) leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                    {q.answer}
                  </ReactMarkdown>
                </div>
              </div>

              {/* 2. Explain it Simply Block (Plain-language friendly explanation) */}
              {q.explanation && (
                <div className="rounded-xl border border-(--color-primary-fixed-dim)/60 bg-(--color-primary-fixed)/20 p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-(--color-primary) mb-2">
                    <Sparkles size={16} strokeWidth={2} />
                    <span className="text-body-sm font-bold uppercase tracking-wider text-(--color-primary)">
                      Explain It Simply (Beginner-Friendly)
                    </span>
                  </div>
                  <div className="prose max-w-none text-body text-(--color-text) leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                      {q.explanation}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}

export function QuestionsTab({ day, moduleSlug }: QuestionsTabProps) {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const location = useLocation();

  // Find all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    day.questions.forEach((q) => {
      q.tags?.forEach((t) => set.add(t));
    });
    return Array.from(set);
  }, [day.questions]);

  // Expand state management
  const [expandedIds, setExpandedIds] = useState<string[]>(() => {
    const hash = location.hash.replace(/^#question-/, "");
    if (hash) {
      const match = day.questions.find((q) => q.id === hash);
      return match ? [match.id] : [];
    }
    return [];
  });

  // Calculate understood progress
  const questionKeys = useMemo(
    () => day.questions.map((q) => progressKeys.dayQuestion(moduleSlug, day.number, q.id)),
    [day.questions, moduleSlug, day.number]
  );
  const understoodCount = useProgressStore((state) => state.getCompletedCount(questionKeys));
  const total = day.questions.length;
  const percent = total > 0 ? Math.round((understoodCount / total) * 100) : 0;

  if (day.questions.length === 0) {
    return (
      <EmptyState
        icon={<HelpCircle size={44} strokeWidth={1.5} />}
        title="No questions published yet"
        description="Key revision questions and plain-language concept breakdowns will appear here."
      />
    );
  }

  const filteredQuestions = selectedTag
    ? day.questions.filter((q) => q.tags?.includes(selectedTag))
    : day.questions;

  const handleToggle = (id: string) => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleExpandAll = () => {
    setExpandedIds(day.questions.map((q) => q.id));
  };

  const handleCollapseAll = () => {
    setExpandedIds([]);
  };

  return (
    <div className="space-y-6">
      {/* Header Row: Progress bar + Expand/Collapse + Tag Filter */}
      <div className="rounded-2xl border border-[rgba(195,198,215,0.25)] bg-(--color-surface) p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5 flex-1 max-w-xs">
            <div className="flex items-center justify-between text-body-sm font-semibold text-(--color-text)">
              <span>Concept Mastery</span>
              <span className="font-mono text-(--color-primary)">
                {understoodCount} / {total} understood ({percent}%)
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-(--color-container)">
              <div
                className="h-full bg-teal-600 dark:bg-teal-400 transition-all duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExpandAll}
              disabled={expandedIds.length === day.questions.length}
            >
              Expand all
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCollapseAll}
              disabled={expandedIds.length === 0}
            >
              Collapse all
            </Button>
          </div>
        </div>

        {/* Optional Tag Filter Chips */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-(--color-border-subtle) pt-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-(--color-text-subtle) mr-1">
              Filter:
            </span>
            <button
              type="button"
              onClick={() => setSelectedTag(null)}
              className={`rounded-full px-2.5 py-0.5 text-caption font-semibold transition-colors ${
                selectedTag === null
                  ? "bg-(--color-primary) text-white"
                  : "bg-(--color-container) text-(--color-text-muted) hover:text-(--color-text)"
              }`}
            >
              All ({total})
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                className={`rounded-full px-2.5 py-0.5 text-caption font-medium transition-colors ${
                  selectedTag === tag
                    ? "bg-(--color-primary) text-white"
                    : "bg-(--color-container) text-(--color-text-muted) hover:text-(--color-text)"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Questions list */}
      <div className="space-y-3">
        {filteredQuestions.map((q, idx) => (
          <QuestionCard
            key={q.id}
            q={q}
            index={idx}
            moduleSlug={moduleSlug}
            dayNumber={day.number}
            isExpanded={expandedIds.includes(q.id)}
            onToggleExpand={() => handleToggle(q.id)}
          />
        ))}
      </div>
    </div>
  );
}
