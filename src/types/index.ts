import { z } from "zod";
import {
  FileFormatSchema,
  FileRefSchema,
  ModuleIndexEntrySchema,
  ModuleIndexSchema,
  DaySummaryItemSchema,
  LabSummaryItemSchema,
  LabCategorySchema,
  ModuleManifestSchema,
  TranscriptItemSchema,
  LinkItemSchema,
  BoardItemSchema,
  QuestionItemSchema,
  DayDetailSchema,
  LabSchema,
  VisualItemSchema,
  VisualIndexSchema,
  SearchEntrySchema,
  SearchIndexSchema,
} from "@/features/content/schemas";

export type FileFormat = z.infer<typeof FileFormatSchema>;
export type FileRef = z.infer<typeof FileRefSchema>;
export type ModuleIndexEntry = z.infer<typeof ModuleIndexEntrySchema>;
export type ModuleIndex = z.infer<typeof ModuleIndexSchema>;
export type DaySummaryItem = z.infer<typeof DaySummaryItemSchema>;
export type LabSummaryItem = z.infer<typeof LabSummaryItemSchema>;
export type LabCategory = z.infer<typeof LabCategorySchema>;
export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;
export type TranscriptItem = z.infer<typeof TranscriptItemSchema>;
export type LinkItem = z.infer<typeof LinkItemSchema>;
export type BoardItem = z.infer<typeof BoardItemSchema>;
export type QuestionItem = z.infer<typeof QuestionItemSchema>;
export type DayDetail = z.infer<typeof DayDetailSchema>;
export type Lab = z.infer<typeof LabSchema>;
export type VisualItem = z.infer<typeof VisualItemSchema>;
export type VisualIndex = z.infer<typeof VisualIndexSchema>;
export type SearchEntry = z.infer<typeof SearchEntrySchema>;
export type SearchIndex = z.infer<typeof SearchIndexSchema>;
