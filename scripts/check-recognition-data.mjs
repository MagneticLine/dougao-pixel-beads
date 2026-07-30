import { access, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import { validateRecognitionDatasetManifest } from "../recognition/recognition-dataset-core.mjs";

const root = resolve(import.meta.dirname, "..");
const manifestPath = resolve(root, "experiments", "recognition-fixtures.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const result = validateRecognitionDatasetManifest(manifest);

for (const item of manifest.cases || []) {
  const fixture = resolve(
    root,
    "tests",
    "fixtures",
    "recognition",
    basename(item.file),
  );
  try {
    await access(fixture);
  } catch {
    result.errors.push(`fixture is missing: ${fixture}`);
  }
}

if (result.errors.length) {
  for (const error of result.errors) console.error(`ERROR ${error}`);
  process.exitCode = 1;
} else {
  console.log(
    `Recognition data manifest is valid: ${result.stats.caseCount} fixtures across ${Object.keys(
      result.stats.categoryCounts,
    ).length} scene categories.`,
  );
}
for (const warning of result.warnings) console.warn(`WARN ${warning}`);
