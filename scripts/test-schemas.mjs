import fs from "node:fs";
import {
  ModuleIndexSchema,
  ModuleManifestSchema,
  DayDetailSchema,
  LabSchema,
  VisualIndexSchema,
  SearchIndexSchema,
} from "../src/features/content/schemas.ts";

function testFile(desc, path, schema) {
  const json = JSON.parse(fs.readFileSync(path, "utf-8"));
  const result = schema.safeParse(json);
  if (!result.success) {
    console.error(`❌ Validation failed for ${desc}:`, result.error.issues);
    process.exit(1);
  }
  console.log(`✅ Valid: ${desc}`);
}

testFile("Root index.json", "./mock-content/index.json", ModuleIndexSchema);
testFile("Search index", "./mock-content/search-index.json", SearchIndexSchema);
testFile("Module 1 Manifest", "./mock-content/modules/azure-mlops-ai-300/manifest.json", ModuleManifestSchema);
testFile("Module 2 Manifest", "./mock-content/modules/generative-ai-foundations/manifest.json", ModuleManifestSchema);
testFile("M1 Day 1 (Full)", "./mock-content/modules/azure-mlops-ai-300/days/day-01/day.json", DayDetailSchema);
testFile("M1 Day 2 (Half-filled)", "./mock-content/modules/azure-mlops-ai-300/days/day-02/day.json", DayDetailSchema);
testFile("M1 Day 3 (Empty)", "./mock-content/modules/azure-mlops-ai-300/days/day-03/day.json", DayDetailSchema);
testFile("M1 Visuals Index", "./mock-content/modules/azure-mlops-ai-300/visuals.json", VisualIndexSchema);
testFile("M2 Visuals Index", "./mock-content/modules/generative-ai-foundations/visuals.json", VisualIndexSchema);
testFile("M1 Lab 01", "./mock-content/modules/azure-mlops-ai-300/labs/lab-01/lab.json", LabSchema);
testFile("M1 Lab 02", "./public/mock-content/modules/azure-mlops-ai-300/labs/lab-02/lab.json", LabSchema);
testFile("M1 Lab 03", "./public/mock-content/modules/azure-mlops-ai-300/labs/lab-03/lab.json", LabSchema);
testFile("M1 Lab 04", "./public/mock-content/modules/azure-mlops-ai-300/labs/lab-04/lab.json", LabSchema);
testFile("M1 Lab 05", "./public/mock-content/modules/azure-mlops-ai-300/labs/lab-05/lab.json", LabSchema);
testFile("M2 Lab 01", "./public/mock-content/modules/generative-ai-foundations/labs/lab-01/lab.json", LabSchema);

console.log("\nAll mock JSON files strictly match Zod schemas!");
