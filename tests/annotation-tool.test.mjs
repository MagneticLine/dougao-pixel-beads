import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecognitionAnnotationSample,
  calculateAnnotationRenderSize,
  pointInsideRecognitionQuad,
  translateRecognitionQuad,
} from "../annotation-tool/annotation-tool-core.mjs";

const corners = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
];

test("keeps annotation canvases bounded while enlarging tiny pixel art", () => {
  assert.deepEqual(calculateAnnotationRenderSize(4000, 2000), {
    width: 2000,
    height: 1000,
    scale: 0.5,
  });
  assert.deepEqual(calculateAnnotationRenderSize(16, 8), {
    width: 960,
    height: 480,
    scale: 60,
  });
});

test("hit-tests and translates the entire quadrilateral inside the image", () => {
  assert.equal(pointInsideRecognitionQuad({ x: 0.5, y: 0.5 }, corners), true);
  assert.equal(pointInsideRecognitionQuad({ x: 0.02, y: 0.5 }, corners), false);

  const moved = translateRecognitionQuad(corners, 0.4, -0.4);
  assert.equal(Math.max(...moved.map((point) => point.x)), 1);
  assert.equal(Math.min(...moved.map((point) => point.y)), 0);
});

test("builds full-image normalized and pixel coordinates without cropping", () => {
  const sample = buildRecognitionAnnotationSample(
    {
      fileName: "fixture.png",
      sha256: "a".repeat(64),
      mimeType: "image/png",
      byteSize: 1234,
      decodedWidth: 1000,
      decodedHeight: 800,
    },
    {
      corners,
      cols: 20,
      rows: 16,
      sceneCategory: "pixel-art",
      sceneTags: ["grid-none", "blur"],
      split: "development",
      rightsStatus: "owned",
      distribution: "repository-public",
      creator: "tester",
      sourceUrl: "",
      license: "",
      acquiredAt: "2026-07-30",
      note: "",
    },
    "2026-07-30T00:00:00.000Z",
  );

  assert.equal(sample.imageTransform.crop, null);
  assert.deepEqual(sample.scene, {
    category: "pixel-art",
    tags: ["grid-none", "blur"],
  });
  assert.equal(sample.groundTruth.frameCoverageRatio, 0.64);
  assert.deepEqual(sample.groundTruth.cornersImagePixels[2], {
    x: 900,
    y: 720,
  });
});
