import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "public");

await mkdir(output, { recursive: true });

const files = [
  ["index.html", "index.html"],
  ["index.html", "static.html"],
  ["app.js", "app-v70.js"],
  ["styles.css", "styles-v70.css"],
  ["bead-palettes.js", "bead-palettes-v70.js"],
  ["color-matching-core.js", "color-matching-core-v70.js"],
  ["manifest.webmanifest", "manifest-v70.webmanifest"],
  ["sw.js", "sw-v70.js"],
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
