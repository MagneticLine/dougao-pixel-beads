import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "public");

await mkdir(output, { recursive: true });

const files = [
  ["index.html", "index.html"],
  ["index.html", "static.html"],
  ["app.js", "app.js"],
  ["styles.css", "styles.css"],
  ["manifest.webmanifest", "manifest.webmanifest"],
  ["sw.js", "sw.js"],
  ["og.png", "og.png"],
];

await Promise.all(
  files.map(([source, destination]) =>
    copyFile(resolve(root, source), resolve(output, destination)),
  ),
);
