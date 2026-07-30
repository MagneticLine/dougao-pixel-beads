import assert from "node:assert/strict";
import test from "node:test";

await import("../app.js");

const { calculateSourceSampleTargetRect } = globalThis.DougaoCore;

test("places the sample reticle around the exact logical source cell", () => {
  const target = calculateSourceSampleTargetRect({
    viewport: {
      left: 3 / 8,
      top: 2 / 8,
      right: 6 / 8,
      bottom: 5 / 8,
    },
    cols: 8,
    rows: 8,
    col: 4,
    row: 3,
    imageRect: { x: 10, y: 20, width: 180, height: 180 },
  });

  assert.deepEqual(target, {
    x: 70,
    y: 80,
    width: 60,
    height: 60,
    centerX: 100,
    centerY: 110,
  });
});

test("keeps the reticle geometry stable for a clipped edge viewport", () => {
  const target = calculateSourceSampleTargetRect({
    viewport: { left: 0, top: 0, right: 0.25, bottom: 0.25 },
    cols: 20,
    rows: 20,
    col: 0,
    row: 0,
    imageRect: { x: 5, y: 7, width: 200, height: 200 },
  });

  assert.equal(target.x, 5);
  assert.equal(target.y, 7);
  assert.equal(target.width, 40);
  assert.equal(target.height, 40);
  assert.equal(target.centerX, 25);
  assert.equal(target.centerY, 27);
});
