import { copyFile, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "public", "annotation-tool");

const files = [
  ["annotation-tool/index.html", "index.html"],
  ["annotation-tool/annotation-tool-core.mjs", "annotation-tool-core.mjs"],
  ["annotation-tool/redirect.mjs", "redirect.mjs"],
  [
    "recognition/recognition-dataset-core.mjs",
    "../recognition/recognition-dataset-core.mjs",
  ],
];

await rm(output, { recursive: true, force: true });

await Promise.all(
  files.map(async ([source, destination]) => {
    const target = resolve(output, destination);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(root, source), target);
  }),
);

console.log(`Annotation tool synced to ${output}`);
