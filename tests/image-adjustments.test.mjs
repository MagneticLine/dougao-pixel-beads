import assert from "node:assert/strict";
import test from "node:test";

await import("../image-adjustments-core.js");

const adjustments = globalThis.DougaoImageAdjustments;

test("keeps neutral image adjustments pixel-exact", () => {
  const imageData = {
    data: new Uint8ClampedArray([12, 96, 230, 177]),
  };
  adjustments.applyToImageData(imageData, adjustments.DEFAULTS);
  assert.deepEqual([...imageData.data], [12, 96, 230, 177]);
});

test("exposure and contrast affect luminance without changing alpha", () => {
  const imageData = {
    data: new Uint8ClampedArray([80, 100, 120, 91]),
  };
  adjustments.applyToImageData(imageData, {
    exposure: 0.5,
    contrast: 30,
  });
  assert.ok(imageData.data[0] > 80);
  assert.ok(imageData.data[2] > imageData.data[0]);
  assert.equal(imageData.data[3], 91);
});

test("temperature and tint move channels in the expected directions", () => {
  const warm = adjustments.adjustRgb(128, 128, 128, { temperature: 100 });
  const cool = adjustments.adjustRgb(128, 128, 128, { temperature: -100 });
  const magenta = adjustments.adjustRgb(128, 128, 128, { tint: 100 });

  assert.ok(warm[0] > warm[2]);
  assert.ok(cool[2] > cool[0]);
  assert.ok(magenta[0] > magenta[1]);
  assert.ok(magenta[2] > magenta[1]);
});
