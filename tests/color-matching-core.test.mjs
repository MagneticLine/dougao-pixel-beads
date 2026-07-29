import assert from "node:assert/strict";
import test from "node:test";

await import("../color-matching-core.js");

const {
  compareCodes,
  rgbToLab,
  rgbToOklab,
  deltaE00,
  buildColorGraph,
  matchPalette,
} = globalThis.DougaoColorMatching;

function assertNear(actual, expected, tolerance = 0.0001) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected}, received ${actual}`,
  );
}

test("orders brand codes deterministically with numeric segments", () => {
  const codes = ["A10", "A2", "A01", "B1", "A1"];
  codes.sort(compareCodes);
  assert.deepEqual(codes, ["A1", "A01", "A2", "A10", "B1"]);
});

test("converts sRGB primaries to stable Lab and OKLab values", () => {
  const whiteLab = rgbToLab({ r: 255, g: 255, b: 255 });
  assertNear(whiteLab.l, 100, 0.0001);
  assertNear(whiteLab.a, 0, 0.001);
  assertNear(whiteLab.b, 0, 0.001);

  const redOklab = rgbToOklab({ r: 255, g: 0, b: 0 });
  assertNear(redOklab.l, 0.627955, 0.00001);
  assertNear(redOklab.a, 0.224863, 0.00001);
  assertNear(redOklab.b, 0.125846, 0.00001);
});

test("matches the Sharma CIEDE2000 supplemental test pairs", () => {
  // https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/dataNprograms/ciede2000testdata.txt
  const pairs = [
    [50, 2.6772, -79.7751, 50, 0, -82.7485, 2.0425],
    [50, 3.1571, -77.2803, 50, 0, -82.7485, 2.8615],
    [50, 2.8361, -74.02, 50, 0, -82.7485, 3.4412],
    [50, -1.3802, -84.2814, 50, 0, -82.7485, 1],
    [50, -1.1848, -84.8006, 50, 0, -82.7485, 1],
    [50, -0.9009, -85.5211, 50, 0, -82.7485, 1],
    [50, 0, 0, 50, -1, 2, 2.3669],
    [50, -1, 2, 50, 0, 0, 2.3669],
    [50, 2.49, -0.001, 50, -2.49, 0.0009, 7.1792],
    [50, 2.49, -0.001, 50, -2.49, 0.001, 7.1792],
    [50, 2.49, -0.001, 50, -2.49, 0.0011, 7.2195],
    [50, 2.49, -0.001, 50, -2.49, 0.0012, 7.2195],
    [50, -0.001, 2.49, 50, 0.0009, -2.49, 4.8045],
    [50, -0.001, 2.49, 50, 0.001, -2.49, 4.8045],
    [50, -0.001, 2.49, 50, 0.0011, -2.49, 4.7461],
    [50, 2.5, 0, 50, 0, -2.5, 4.3065],
    [50, 2.5, 0, 73, 25, -18, 27.1492],
    [50, 2.5, 0, 61, -5, 29, 22.8977],
    [50, 2.5, 0, 56, -27, -3, 31.903],
    [50, 2.5, 0, 58, 24, 15, 19.4535],
    [50, 2.5, 0, 50, 3.1736, 0.5854, 1],
    [50, 2.5, 0, 50, 3.2972, 0, 1],
    [50, 2.5, 0, 50, 1.8634, 0.5757, 1],
    [50, 2.5, 0, 50, 3.2592, 0.335, 1],
    [60.2574, -34.0099, 36.2677, 60.4626, -34.1751, 39.4387, 1.2644],
    [63.0109, -31.0961, -5.8663, 62.8187, -29.7946, -4.0864, 1.263],
    [61.2901, 3.7196, -5.3901, 61.4292, 2.248, -4.962, 1.8731],
    [35.0831, -44.1164, 3.7933, 35.0232, -40.0716, 1.5901, 1.8645],
    [22.7233, 20.0904, -46.694, 23.0331, 14.973, -42.5619, 2.0373],
    [36.4612, 47.858, 18.3852, 36.2715, 50.5065, 21.2231, 1.4146],
    [90.8027, -2.0831, 1.441, 91.1528, -1.6435, 0.0447, 1.4441],
    [90.9257, -0.5406, -0.9208, 88.6381, -0.8985, -0.7239, 1.5381],
    [6.7747, -0.2908, -2.4247, 5.8714, -0.0985, -2.2286, 0.6377],
    [2.0776, 0.0795, -1.135, 0.9033, -0.0636, -0.5514, 0.9082],
  ];

  for (const [l1, a1, b1, l2, a2, b2, expected] of pairs) {
    const left = { l: l1, a: a1, b: b1 };
    const right = { l: l2, a: a2, b: b2 };
    assertNear(deltaE00(left, right), expected, 0.0001);
    assertNear(deltaE00(right, left), expected, 0.0001);
  }
});

test("builds an adjacency graph from right and lower cell boundaries", () => {
  const graph = buildColorGraph(
    [
      { id: "a", r: 20, g: 20, b: 20 },
      { id: "b", r: 120, g: 120, b: 120 },
      { id: "c", r: 230, g: 230, b: 230 },
    ],
    [
      0, 0, 1,
      0, 2, 1,
    ],
    3,
    2,
  );

  assert.deepEqual(
    graph.edges.map(({ left, right, count }) => ({ left, right, count })),
    [
      { left: 0, right: 1, count: 1 },
      { left: 0, right: 2, count: 2 },
      { left: 1, right: 2, count: 1 },
    ],
  );
  assertNear(
    graph.nodeWeights.reduce((sum, weight) => sum + weight, 0),
    1,
  );
  assertNear(
    graph.edges.reduce((sum, edge) => sum + edge.weight, 0),
    1,
  );
});

test("keeps locked mappings and returns deterministic schemes", () => {
  const input = {
    sourceColors: [
      { id: "dark", r: 34, g: 57, b: 90, count: 3 },
      { id: "light", r: 137, g: 181, b: 211, count: 3 },
    ],
    sourceCells: [0, 0, 1, 0, 1, 1],
    cols: 3,
    rows: 2,
    paletteId: "test",
    paletteRevision: "one",
    palette: [
      { code: "T1", name: "Dark blue", r: 28, g: 63, b: 98 },
      { code: "T2", name: "Light blue", r: 143, g: 189, b: 217 },
      { code: "T3", name: "Grey", r: 118, g: 118, b: 118 },
    ],
    lockedMappings: { dark: "T3" },
  };
  const first = matchPalette(input);
  const second = matchPalette(input);

  assert.deepEqual(first.nearest.mappings, second.nearest.mappings);
  assert.deepEqual(first.coherent.mappings, second.coherent.mappings);
  assert.equal(first.coherent.mappings[0].targetCode, "T3");
  assert.equal(first.coherent.mappings[0].locked, true);
  assert.equal(first.coherent.mappings[0].method, "manual");
});

test("a single source color uses the same nearest and coherent mapping", () => {
  const result = matchPalette({
    sourceColors: [{ id: "only", r: 203, g: 62, b: 70, count: 4 }],
    sourceCells: [0, 0, 0, 0],
    cols: 2,
    rows: 2,
    palette: [
      { code: "R1", r: 205, g: 61, b: 73 },
      { code: "R2", r: 160, g: 30, b: 45 },
    ],
  });

  assert.equal(
    result.nearest.mappings[0].targetCode,
    result.coherent.mappings[0].targetCode,
  );
});

test("coherent matching favors a shared color cast over mixed local shifts", () => {
  const result = matchPalette({
    sourceColors: [
      { id: "dark", r: 80, g: 100, b: 100, count: 4 },
      { id: "light", r: 160, g: 180, b: 180, count: 4 },
    ],
    sourceCells: [
      0, 0, 1, 1,
      0, 0, 1, 1,
    ],
    cols: 4,
    rows: 2,
    palette: [
      { code: "D1", r: 75, g: 105, b: 105 },
      { code: "D2", r: 86, g: 97, b: 97 },
      { code: "L1", r: 165, g: 178, b: 178 },
      { code: "L2", r: 155, g: 185, b: 185 },
    ],
  });

  assert.deepEqual(
    result.nearest.mappings.map((mapping) => mapping.targetCode),
    ["D1", "L1"],
  );
  assert.deepEqual(
    result.coherent.mappings.map((mapping) => mapping.targetCode),
    ["D2", "L1"],
  );
  assert.ok(
    result.coherent.score.castVariance <
      result.nearest.score.castVariance,
  );
  assert.ok(
    result.coherent.score.relationError <
      result.nearest.score.relationError,
  );
  assert.ok(result.coherent.score.total < result.nearest.score.total);
});
