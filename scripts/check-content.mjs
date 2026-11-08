import fs from "node:fs";
import path from "node:path";
import {
  ModuleIndexSchema,
  ModuleManifestSchema,
  DayDetailSchema,
  LabSchema,
  VisualIndexSchema,
  SearchIndexSchema,
} from "../src/features/content/schemas.ts";

const defaultDir = fs.existsSync(path.resolve(process.cwd(), "dev-content")) ? "./dev-content" : "./.sample-content";
const targetDirArg = process.argv[2] || defaultDir;
const contentDir = path.resolve(process.cwd(), targetDirArg);

console.log(`Checking content directory: ${contentDir}\n`);

if (!fs.existsSync(contentDir)) {
  console.error(`❌ Content directory does not exist: ${contentDir}`);
  process.exit(1);
}

let passCount = 0;
let failCount = 0;

function validateFile(relPath, schema, desc) {
  const fullPath = path.join(contentDir, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Missing file: ${relPath} (${desc})`);
    failCount++;
    return null;
  }

  try {
    const raw = fs.readFileSync(fullPath, "utf-8");
    const parsed = JSON.parse(raw);
    const result = schema.safeParse(parsed);
    if (!result.success) {
      console.error(`❌ Validation failed for ${relPath}:`, result.error.issues);
      failCount++;
      return null;
    }
    console.log(`✅ [PASS] ${relPath} (${desc})`);
    passCount++;
    return result.data;
  } catch (err) {
    console.error(`❌ JSON parse error in ${relPath}:`, err.message);
    failCount++;
    return null;
  }
}

function checkFileExists(relPath, desc) {
  const fullPath = path.join(contentDir, relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Referenced file missing: ${relPath} (${desc})`);
    failCount++;
    return false;
  }
  return true;
}

// 1. Root index.json
const moduleIndex = validateFile("index.json", ModuleIndexSchema, "Root Index");

// 2. Search index
validateFile("search-index.json", SearchIndexSchema, "Search Index");

// 3. For each module
if (moduleIndex && Array.isArray(moduleIndex.modules)) {
  for (const mod of moduleIndex.modules) {
    const manifestPath = `modules/${mod.slug}/manifest.json`;
    const manifest = validateFile(manifestPath, ModuleManifestSchema, `Manifest: ${mod.slug}`);

    // Visuals index
    const visualsPath = `modules/${mod.slug}/visuals.json`;
    if (fs.existsSync(path.join(contentDir, visualsPath))) {
      validateFile(visualsPath, VisualIndexSchema, `Visuals: ${mod.slug}`);
    }

    if (manifest) {
      // Days
      for (const day of manifest.days) {
        const folder = `day-${String(day.number).padStart(2, "0")}`;
        const dayJsonPath = `modules/${mod.slug}/days/${folder}/day.json`;
        const dayDetail = validateFile(dayJsonPath, DayDetailSchema, `Day ${day.number}`);

        if (dayDetail) {
          if (dayDetail.summary) {
            checkFileExists(dayDetail.summary.path, `Day ${day.number} Summary`);
          }
          for (const t of dayDetail.transcripts) {
            checkFileExists(t.file.path, `Day ${day.number} Transcript ${t.order}`);
          }
          for (const b of dayDetail.boards) {
            checkFileExists(b.image.path, `Day ${day.number} Board`);
            if (b.thumb) checkFileExists(b.thumb.path, `Day ${day.number} Board Thumb`);
          }
        }
      }

      // Labs
      for (const lab of manifest.labs) {
        const labJsonPath = `modules/${mod.slug}/labs/${lab.id}/lab.json`;
        const labDetail = validateFile(labJsonPath, LabSchema, `Lab ${lab.id}`);

        if (labDetail) {
          if (labDetail.notes) checkFileExists(labDetail.notes.path, `Lab ${lab.id} Notes`);
          if (labDetail.doodle) checkFileExists(labDetail.doodle.path, `Lab ${lab.id} Doodle`);
          if (labDetail.thumb) checkFileExists(labDetail.thumb.path, `Lab ${lab.id} Thumb`);
        }
      }
    }
  }
}

console.log(`\nResults: ${passCount} passed, ${failCount} failed.`);
if (failCount > 0) {
  process.exit(1);
} else {
  console.log("All content files strictly match frontend contracts! ✨");
}

