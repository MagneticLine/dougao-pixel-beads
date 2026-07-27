import assert from "node:assert/strict";
import test from "node:test";

await import("../app.js");

const { extractDominantCellSample } = globalThis.DougaoCore;

function colors(count, rgba) {
  return Array.from({ length: count }, () => [...rgba]);
}

function assertColorNear(actual, expected, tolerance = 3) {
  for (let channel = 0; channel < 3; channel += 1) {
    assert.ok(
      Math.abs(actual[channel] - expected[channel]) <= tolerance,
      `channel ${channel}: expected ${expected[channel]}, received ${actual[channel]}`,
    );
  }
}

test("keeps a blue cell background when black label pixels are present", () => {
  const background = [48, 176, 218, 255];
  const sample = [
    ...colors(35, background),
    ...colors(10, [0, 0, 0, 255]),
    ...colors(8, [22, 86, 105, 255]),
    ...colors(8, [55, 169, 211, 255]),
  ];
  const result = extractDominantCellSample(sample);

  assertColorNear(result.color, background, 8);
  assert.ok(result.dominantCoverage > 0.65);
});

test("keeps a dark red background when a white code is anti-aliased over it", () => {
  const background = [145, 36, 48, 255];
  const sample = [
    ...colors(38, background),
    ...colors(9, [250, 250, 248, 255]),
    ...colors(7, [198, 146, 151, 255]),
    ...colors(7, [151, 40, 52, 255]),
  ];
  const result = extractDominantCellSample(sample);

  assertColorNear(result.color, background, 8);
  assert.ok(result.dominantCoverage > 0.65);
});

test("groups mild compression noise into the dominant background color", () => {
  const base = [238, 190, 43, 255];
  const variations = [
    [-10, 3, -4],
    [-6, -5, 7],
    [-2, 6, 3],
    [0, 0, 0],
    [4, -7, -3],
    [7, 5, 5],
    [11, -2, 1],
  ];
  const sample = Array.from({ length: 49 }, (_, index) => {
    const offset = variations[index % variations.length];
    return [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2], 255];
  });
  sample.push(...colors(12, [15, 15, 15, 255]));
  const result = extractDominantCellSample(sample);

  assertColorNear(result.color, base, 5);
  assert.ok(result.variability < 8);
});

test("preserves transparent cells", () => {
  const result = extractDominantCellSample(colors(61, [0, 0, 0, 0]));

  assert.deepEqual(result.color, [0, 0, 0, 0]);
  assert.equal(result.opaqueCoverage, 0);
});
