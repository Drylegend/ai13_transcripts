import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  ModuleIndexSchema,
  ModuleManifestSchema,
  DayDetailSchema,
  LabSchema,
  VisualIndexSchema,
  SearchIndexSchema,
} from "../src/features/content/schemas.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, "..", "ingest", "schemas");

fs.mkdirSync(outDir, { recursive: true });

const schemas = {
  "module_index.json": ModuleIndexSchema,
  "module_manifest.json": ModuleManifestSchema,
  "day_detail.json": DayDetailSchema,
  "lab.json": LabSchema,
  "visual_index.json": VisualIndexSchema,
  "search_index.json": SearchIndexSchema,
};

for (const [name, schema] of Object.entries(schemas)) {
  const jsonSchema = z.toJSONSchema(schema);
  const filePath = path.join(outDir, name);
  fs.writeFileSync(filePath, JSON.stringify(jsonSchema, null, 2), "utf-8");
  console.log(`✅ Exported: ${name}`);
}

console.log("\nAll JSON Schemas exported to ingest/schemas/");

