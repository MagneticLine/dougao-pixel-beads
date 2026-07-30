import { copyFile, mkdir, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "public", "recognition-lab");
const configPath = resolve(root, "experiments", "recognition-fixtures.json");
const config = JSON.parse(await readFile(configPath, "utf8"));

const files = [
  ["experiments/recognition-visual.html", "index.html"],
  ["experiments/recognition-visual.css", "recognition-visual.css"],
  ["experiments/recognition-visual.mjs", "recognition-visual.mjs"],
  ["recognition/recognition-image-core.mjs", "../recognition/recognition-image-core.mjs"],
  ["recognition/dominant-lattice-core.mjs", "../recognition/dominant-lattice-core.mjs"],
  ["recognition/recognition-benchmark-core.mjs", "../recognition/recognition-benchmark-core.mjs"],
  ["recognition/recognition-dataset-core.mjs", "../recognition/recognition-dataset-core.mjs"],
  ["experiments/recognition-fixtures.json", "recognition-fixtures.json"],
  ...config.cases.map((item) => [
    `tests/fixtures/recognition/${basename(item.file)}`,
    `fixtures/${basename(item.file)}`,
  ]),
];

await Promise.all(
  files.map(async ([source, destination]) => {
    const target = resolve(output, destination);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(root, source), target);
  }),
);

console.log(`Recognition lab synced to ${output}`);
