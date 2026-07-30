import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "public");

await mkdir(output, { recursive: true });

const files = [
  ["index.html", "index.html"],
  ["index.html", "static.html"],
  ["app.js", "app-v71.js"],
  ["styles.css", "styles-v71.css"],
  ["bead-palettes.js", "bead-palettes-v71.js"],
  ["color-matching-core.js", "color-matching-core-v71.js"],
  ["image-adjustments-core.js", "image-adjustments-core-v71.js"],
  ["manifest.webmanifest", "manifest-v71.webmanifest"],
  ["sw.js", "sw-v71.js"],
  ["_headers", "_headers"],
  ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
  ["favicon.svg", "favicon.svg"],
  ["og.png", "og.png"],
];

await Promise.all(
  files.map(([source, destination]) =>
    copyFile(resolve(root, source), resolve(output, destination)),
  ),
);

await import("./sync-recognition-lab.mjs");
await import("./sync-annotation-tool.mjs");
