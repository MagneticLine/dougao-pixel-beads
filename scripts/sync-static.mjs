import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "public");

await mkdir(output, { recursive: true });

const files = [
  ["index.html", "index.html"],
  ["index.html", "static.html"],
  ["app.js", "app-v53.js"],
  ["styles.css", "styles-v53.css"],
  ["manifest.webmanifest", "manifest-v53.webmanifest"],
  ["sw.js", "sw-v53.js"],
  ["_headers", "_headers"],
  ["favicon.svg", "favicon.svg"],
  ["og.png", "og.png"],
];

await Promise.all(
  files.map(([source, destination]) =>
    copyFile(resolve(root, source), resolve(output, destination)),
  ),
);
