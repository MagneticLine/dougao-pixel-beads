import assert from "node:assert/strict";
import test from "node:test";

await import("../app.js");

const {
  MAX_PATTERN_DIMENSION,
  calculatePatternDimensions,
  patternCellIndexAt,
} = globalThis.DougaoCore;

test("limits the integer pattern scale so neither output axis exceeds the cap", () => {
  assert.equal(MAX_PATTERN_DIMENSION, 200);
  assert.deepEqual(calculatePatternDimensions(8, 8, 99), {
    sourceCols: 8,
    sourceRows: 8,
    cols: 200,
    rows: 200,
    scale: 25,
    maxScale: 25,
    maxDimension: 200,
  });
  assert.deepEqual(calculatePatternDimensions(80, 120, 2), {
    sourceCols: 80,
    sourceRows: 120,
    cols: 80,
    rows: 120,
    scale: 1,
    maxScale: 1,
    maxDimension: 200,
  });
});

test("maps every enlarged bead back to its original source cell", () => {
  const cells = [0, 1, 2, 3];
  const expanded = Array.from({ length: 4 }, (_, row) =>
    Array.from({ length: 4 }, (_, col) =>
      patternCellIndexAt(cells, 2, 2, row, col),
    ),
  );

  assert.deepEqual(expanded, [
    [0, 0, 1, 1],
    [0, 0, 1, 1],
    [2, 2, 3, 3],
    [2, 2, 3, 3],
  ]);
});
