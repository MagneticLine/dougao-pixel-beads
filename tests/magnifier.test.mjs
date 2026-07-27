import assert from "node:assert/strict";
import test from "node:test";

await import("../app.js");

const { calculateCornerMagnifierPosition } = globalThis.DougaoCore;

const width = 390;
const height = 440;
const lensSize = 116;

test("places the magnifier diagonally inward from every corner", () => {
  const topLeft = calculateCornerMagnifierPosition(30, 30, width, height, lensSize);
  const topRight = calculateCornerMagnifierPosition(360, 30, width, height, lensSize);
  const bottomLeft = calculateCornerMagnifierPosition(30, 410, width, height, lensSize);
  const bottomRight = calculateCornerMagnifierPosition(360, 410, width, height, lensSize);

  assert.ok(topLeft.x > 30 && topLeft.y > 30);
  assert.ok(topRight.x < 360 && topRight.y > 30);
  assert.ok(bottomLeft.x > 30 && bottomLeft.y < 410);
  assert.ok(bottomRight.x < 360 && bottomRight.y < 410);
});

test("keeps the entire circular magnifier inside the editor", () => {
  const margin = lensSize / 2 + 8;
  for (const [x, y] of [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
    [width / 2, height / 2],
  ]) {
    const position = calculateCornerMagnifierPosition(x, y, width, height, lensSize);
    assert.ok(position.x >= margin);
    assert.ok(position.x <= width - margin);
    assert.ok(position.y >= margin);
    assert.ok(position.y <= height - margin);
  }
});
