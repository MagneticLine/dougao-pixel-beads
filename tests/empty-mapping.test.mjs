import assert from "node:assert/strict";
import test from "node:test";

await import("../app.js");

const {
  EMPTY_MAPPING_CODE,
  countFilledPatternCells,
  isEmptyPaletteColor,
  isFilledPatternCell,
} = globalThis.DougaoCore;

test("keeps an explicit sentinel for a reversible no-bead brand mapping", () => {
  assert.equal(EMPTY_MAPPING_CODE, "__DOUGAO_EMPTY__");
});

test("excludes colors mapped to no bead from the finished bead count", () => {
  const palette = [
    { rgb: { r: 10, g: 20, b: 30 } },
    { rgb: { r: 40, g: 50, b: 60 }, isEmpty: true },
  ];
  const cells = [0, 1, -1, 0, 1];

  assert.equal(isEmptyPaletteColor(palette[1]), true);
  assert.equal(isFilledPatternCell(0, palette), true);
  assert.equal(isFilledPatternCell(1, palette), false);
  assert.equal(isFilledPatternCell(-1, palette), false);
  assert.equal(countFilledPatternCells(cells, palette), 2);
});
