import { ProgressDataSchema } from "../src/features/progress/schemas.ts";

console.log("Running Progress schema & import validation test...\n");

// 1. Valid export payload test
const sampleExport = {
  version: 1,
  lastUpdated: new Date().toISOString(),
  completed: {
    "azure-mlops-ai-300:day-1:summary": true,
    "azure-mlops-ai-300:day-1:transcript-t-1": true,
    "azure-mlops-ai-300:day-1:question-q-1": true,
  },
  labs: {
    "azure-mlops-ai-300:lab-lab-01": {
      status: "done",
      studentNotes: "Remember to use Managed Identity and RBAC roles.",
      updatedAt: new Date().toISOString(),
    },
    "azure-mlops-ai-300:lab-lab-02": {
      status: "in-progress",
      studentNotes: "",
      updatedAt: new Date().toISOString(),
    },
  },
};

const validRes = ProgressDataSchema.safeParse(sampleExport);
if (!validRes.success) {
  console.error("❌ Valid progress payload failed validation:", validRes.error);
  process.exit(1);
}
console.log("✅ Valid: Progress export format passes Zod schema");

// 2. Corrupted payload test
const corruptedPayloads = [
  { version: "bad-version", completed: {} },
  { version: 1, lastUpdated: "2026-01-01", labs: { "lab-1": { status: "invalid-status" } } },
  null,
  "string instead of object",
];

for (const [idx, bad] of corruptedPayloads.entries()) {
  const badRes = ProgressDataSchema.safeParse(bad);
  if (badRes.success) {
    console.error(`❌ Corrupted payload ${idx + 1} was incorrectly accepted!`);
    process.exit(1);
  }
}
console.log("✅ Valid: All corrupted payloads correctly rejected by Zod schema");

console.log("\nAll progress unit checks passed successfully!");

