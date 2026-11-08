import { z } from "zod";

export const FileFormatSchema = z.enum([
  "docx",
  "md",
  "html",
  "pdf",
  "ipynb",
  "webp",
  "png",
  "jpg",
  "svg",
]);

export const FileRefSchema = z.object({
  path: z.string(),
  format: FileFormatSchema,
  sizeBytes: z.number().nonnegative(),
  hash: z.string(),
  updatedAt: z.string(),
});

export const ModuleIndexEntrySchema = z.object({
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().default(""),
  description: z.string().default(""),
  courseCode: z.string().optional(),
  order: z.number().int(),
  coverImage: FileRefSchema.optional(),
  dayCount: z.number().int().nonnegative(),
  labCount: z.number().int().nonnegative(),
  boardCount: z.number().int().nonnegative(),
  questionCount: z.number().int().nonnegative().default(0),
  transcriptCount: z.number().int().nonnegative().default(0),
  tags: z.array(z.string()).default([]),
});

export const ModuleIndexSchema = z.object({
  version: z.string().default("1"),
  updatedAt: z.string(),
  modules: z.array(ModuleIndexEntrySchema),
});

export const DaySummaryItemSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  subtitle: z.string().default(""),
  hasSummary: z.boolean().default(false),
  transcriptCount: z.number().int().nonnegative().default(0),
  linkCount: z.number().int().nonnegative().default(0),
  boardCount: z.number().int().nonnegative().default(0),
  questionCount: z.number().int().nonnegative().default(0),
});

export const LabSummaryItemSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  category: z.string(),
  title: z.string(),
  hasNotes: z.boolean().default(false),
  hasDoodle: z.boolean().default(false),
});

export const LabCategorySchema = z.object({
  slug: z.string(),
  label: z.string(),
});

export const ModuleManifestSchema = z.object({
  version: z.string().default("1"),
  updatedAt: z.string(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().default(""),
  description: z.string().default(""),
  courseCode: z.string().optional(),
  days: z.array(DaySummaryItemSchema).default([]),
  labs: z.array(LabSummaryItemSchema).default([]),
  labCategories: z.array(LabCategorySchema).default([]),
});

export const TranscriptItemSchema = z.object({
  id: z.string(),
  order: z.number().int(),
  title: z.string(),
  file: FileRefSchema,
});

export const LinkItemSchema = z.object({
  label: z.string(),
  url: z.string(),
  description: z.string().optional(),
});

export const BoardItemSchema = z.object({
  id: z.string(),
  caption: z.string().optional(),
  image: FileRefSchema,
  thumb: FileRefSchema.optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const QuestionItemSchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  explanation: z.string(),
  tags: z.array(z.string()).optional(),
});

export const DayDetailSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  subtitle: z.string().default(""),
  description: z.string().default(""),
  recap: z.string().optional(),
  summary: FileRefSchema.optional(),
  transcripts: z.array(TranscriptItemSchema).default([]),
  links: z.array(LinkItemSchema).default([]),
  boards: z.array(BoardItemSchema).default([]),
  questions: z.array(QuestionItemSchema).default([]),
  updatedAt: z.string(),
});

export const LabSchema = z.object({
  id: z.string(),
  number: z.number().int().positive(),
  category: z.string(),
  title: z.string(),
  sourceUrl: z.string().optional(),
  links: z.array(LinkItemSchema).optional(),
  notes: FileRefSchema.optional(),
  doodle: FileRefSchema.optional(),
  thumb: FileRefSchema.optional(),
  updatedAt: z.string(),
});

export const VisualItemSchema = z.object({
  id: z.string(),
  type: z.enum(["board", "doodle"]),
  dayNumber: z.number().int().positive().optional(),
  labId: z.string().optional(),
  caption: z.string().optional(),
  image: FileRefSchema,
  thumb: FileRefSchema.optional(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  addedAt: z.string(),
});

export const VisualIndexSchema = z.object({
  version: z.string().default("1"),
  updatedAt: z.string(),
  items: z.array(VisualItemSchema).default([]),
});

export const SearchEntrySchema = z.object({
  type: z.enum(["module", "day", "lab", "question"]),
  moduleSlug: z.string(),
  dayNumber: z.number().int().positive().optional(),
  labId: z.string().optional(),
  title: z.string(),
  snippet: z.string(),
  tags: z.array(z.string()).default([]),
});

export const SearchIndexSchema = z.array(SearchEntrySchema);

/* ─── Progress Key Helpers ─── */
export const progressKeys = {
  daySummary: (moduleSlug: string, dayNumber: number) =>
    `${moduleSlug}:day-${dayNumber}:summary`,
  dayTranscript: (
    moduleSlug: string,
    dayNumber: number,
    transcriptId: string
  ) => `${moduleSlug}:day-${dayNumber}:transcript-${transcriptId}`,
  dayQuestion: (moduleSlug: string, dayNumber: number, questionId: string) =>
    `${moduleSlug}:day-${dayNumber}:question-${questionId}`,
  lab: (moduleSlug: string, labId: string) => `${moduleSlug}:lab-${labId}`,
} as const;

