import { readFile } from "node:fs/promises";

const sourcePath = new URL("../bead-palettes.js", import.meta.url);
const source = await readFile(sourcePath, "utf8");
const pinnedMatch = source.match(
  /commit:\s*"([0-9a-f]{40})"/i,
);

if (!pinnedMatch) {
  throw new Error("Cannot find the pinned BeadColors commit in bead-palettes.js.");
}

const pinnedCommit = pinnedMatch[1].toLowerCase();
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": "dougao-pixel-beads-dependency-check",
  "X-GitHub-Api-Version": "2022-11-28",
};

if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

const response = await fetch(
  "https://api.github.com/repos/maxcleme/beadcolors/commits/master",
  { headers },
);

if (!response.ok) {
  throw new Error(
    `GitHub returned ${response.status} while checking BeadColors: ${await response.text()}`,
  );
}

const latest = await response.json();
const latestCommit = String(latest.sha || "").toLowerCase();

if (!/^[0-9a-f]{40}$/.test(latestCommit)) {
  throw new Error("GitHub did not return a valid BeadColors commit SHA.");
}

console.log(`Pinned BeadColors commit: ${pinnedCommit}`);
console.log(`Latest BeadColors commit: ${latestCommit}`);

if (latestCommit !== pinnedCommit) {
  console.error(
    "A newer BeadColors commit is available. Review and validate the data before updating the pinned snapshot.",
  );
  process.exitCode = 1;
} else {
  console.log("The local BeadColors snapshot is current.");
}
