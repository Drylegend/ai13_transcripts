import { z } from "zod";

export const LabStatusSchema = z.enum(["not-started", "in-progress", "done"]);
export type LabStatus = z.infer<typeof LabStatusSchema>;

export const LabProgressItemSchema = z.object({
  status: LabStatusSchema.default("not-started"),
  studentNotes: z.string().optional(),
  updatedAt: z.string(),
});
export type LabProgressItem = z.infer<typeof LabProgressItemSchema>;

export const ProgressDataSchema = z.object({
  version: z.number().int().default(1),
  lastUpdated: z.string(),
  completed: z.record(z.string(), z.boolean()).default({}),
  labs: z.record(z.string(), LabProgressItemSchema).default({}),
});
export type ProgressData = z.infer<typeof ProgressDataSchema>;

