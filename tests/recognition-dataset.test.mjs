import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  RECOGNITION_CORNER_ORDER,
  RECOGNITION_DATASET_KIND,
  RECOGNITION_DATASET_SCHEMA_VERSION,
  RECOGNITION_SCENE_CATEGORIES,
  migrateRecognitionAnnotationPackage,
  validateRecognitionAnnotationPackage,
  validateRecognitionDatasetManifest,
} from "../recognition/recognition-dataset-core.mjs";

function makeAnnotationPackage(overrides = {}) {
  const cornersNormalized = [
    { x: 0.1, y: 0.1 },
    { x: 0.9, y: 0.1 },
    { x: 0.9, y: 0.9 },
    { x: 0.1, y: 0.9 },
  ];
  return {
    kind: RECOGNITION_DATASET_KIND,
    schemaVersion: RECOGNITION_DATASET_SCHEMA_VERSION,
    createdAt: "2026-07-30T00:00:00.000Z",
    imagesIncluded: false,
    coordinateSystem: {
      origin: "top-left",
      cornerOrder: [...RECOGNITION_CORNER_ORDER],
      normalizedRange: [0, 1],
      pixelReference: "browser-decoded-image",
    },
    samples: [
      {
        sampleId: "sha256:" + "a".repeat(64),
        source: {
          fileName: "sample.png",
          sha256: "a".repeat(64),
          mimeType: "image/png",
          byteSize: 1024,
          decodedWidth: 1000,
          decodedHeight: 800,
        },
        imageTransform: {
          crop: null,
          coordinateSpace: "browser-decoded-image",
          exifOrientationAppliedByDecoder: true,
        },
        scene: {
          category: "pixel-art",
          tags: [],
        },
        split: "development",
        rights: {
          status: "owned",
          distribution: "repository-public",
          creator: "tester",
          sourceUrl: "",
          license: "",
          acquiredAt: "2026-07-30",
        },
        groundTruth: {
          cols: 20,
          rows: 16,
          cornerOrder: [...RECOGNITION_CORNER_ORDER],
          cornersNormalized,
          cornersImagePixels: cornersNormalized.map((point) => ({
            x: point.x * 1000,
            y: point.y * 800,
          })),
          frameCoverageRatio: 0.64,
        },
        annotation: {
          note: "",
          annotatedAt: "2026-07-30T00:00:00.000Z",
        },
        ...overrides,
      },
    ],
  };
}

test("keeps all four recognition scenes in the tracked development manifest", async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL("../experiments/recognition-fixtures.json", import.meta.url),
      "utf8",
    ),
  );
  const result = validateRecognitionDatasetManifest(manifest);

  assert.deepEqual(result.errors, []);
  assert.equal(result.stats.caseCount, 5);
  assert.equal(result.stats.categoryCounts["pixel-art"], 2);
  assert.equal(result.stats.categoryCounts["pattern-chart"], 1);
  assert.equal(result.stats.categoryCounts["fused-bead-photo"], 1);
  assert.equal(result.stats.categoryCounts["holed-bead-photo"], 1);
  assert.equal(result.stats.tagCounts["grid-none"], 4);
  assert.equal(result.stats.tagCounts["grid-visible"], 1);
  assert.equal(result.stats.splitCounts.development, 5);
  assert.equal(result.stats.splitCounts.holdout, 0);
});

test("rejects publishing an image whose reuse rights are unresolved", () => {
  const manifest = {
    schemaVersion: RECOGNITION_DATASET_SCHEMA_VERSION,
    targetCounts: {
      realCore: [60, 100],
      synthetic: [200, 500],
      holdout: [20, 30],
    },
    cases: RECOGNITION_SCENE_CATEGORIES.map((category, index) => ({
      label: `case-${index}`,
      file: `case-${index}.jpg`,
      category,
      tags: [],
      split: "development",
      truthStatus: "unlabeled",
      crop: { left: 0, top: 0, width: 10, height: 10 },
      rights: {
        status: index ? "owned" : "unknown",
        distribution: index ? "repository-public" : "public",
      },
    })),
  };

  const result = validateRecognitionDatasetManifest(manifest);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((error) =>
      error.includes("cannot be public while its rights status is unresolved"),
    ),
  );
});

test("accepts a complete full-image annotation package", () => {
  const result = validateRecognitionAnnotationPackage(
    makeAnnotationPackage(),
  );

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.stats.sampleCount, 1);
  assert.equal(result.stats.categoryCounts["pixel-art"], 1);
});

test("migrates legacy five-scene packages to scene plus tags", () => {
  const payload = makeAnnotationPackage();
  payload.schemaVersion = 1;
  payload.samples[0].scene = {
    category: "complex-background-pixel-art",
    difficultyFlags: ["blur"],
  };

  const migrated = migrateRecognitionAnnotationPackage(payload);
  assert.equal(migrated.schemaVersion, RECOGNITION_DATASET_SCHEMA_VERSION);
  assert.equal(migrated.samples[0].scene.category, "pixel-art");
  assert.deepEqual(
    migrated.samples[0].scene.tags.sort(),
    ["blur", "complex-background"].sort(),
  );
  assert.equal(validateRecognitionAnnotationPackage(migrated).valid, true);
});

test("rejects mutually exclusive scene tags", () => {
  const payload = makeAnnotationPackage();
  payload.samples[0].scene.tags = ["grid-none", "grid-visible"];
  const result = validateRecognitionAnnotationPackage(payload);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((error) =>
      error.includes("mutually exclusive tags"),
    ),
  );
});

test("accepts the browser import fixture paired to a real source image", async () => {
  const payload = JSON.parse(
    await readFile(
      new URL(
        "./fixtures/annotation/valid-full-image-package.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const result = validateRecognitionAnnotationPackage(payload);

  assert.equal(result.valid, true);
  assert.equal(result.stats.sampleCount, 1);
});

test("rejects cropped coordinates and inconsistent pixel corners", () => {
  const payload = makeAnnotationPackage();
  payload.samples[0].imageTransform.crop = {
    left: 0,
    top: 0,
    width: 100,
    height: 100,
  };
  payload.samples[0].groundTruth.cornersImagePixels[0].x = 999;
  const result = validateRecognitionAnnotationPackage(payload);

  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((error) =>
      error.includes("imageTransform.crop must be null"),
    ),
  );
  assert.ok(
    result.errors.some((error) =>
      error.includes("inconsistent with normalized coordinates"),
    ),
  );
});

test("rejects a package whose identity and coordinate contract drift", () => {
  const payload = makeAnnotationPackage();
  payload.coordinateSystem.origin = "bottom-left";
  payload.samples[0].sampleId = `sha256:${"b".repeat(64)}`;
  const result = validateRecognitionAnnotationPackage(payload);

  assert.equal(result.valid, false);
  assert.ok(result.errors.includes("coordinateSystem is invalid"));
  assert.ok(
    result.errors.some((error) =>
      error.includes("sampleId must match source.sha256"),
    ),
  );
});

test("warns instead of rejecting a valid frame below the 50% soft prior", () => {
  const payload = makeAnnotationPackage();
  const corners = [
    { x: 0.2, y: 0.2 },
    { x: 0.7, y: 0.2 },
    { x: 0.7, y: 0.7 },
    { x: 0.2, y: 0.7 },
  ];
  payload.samples[0].groundTruth.cornersNormalized = corners;
  payload.samples[0].groundTruth.cornersImagePixels = corners.map((point) => ({
    x: point.x * 1000,
    y: point.y * 800,
  }));
  payload.samples[0].groundTruth.frameCoverageRatio = 0.25;
  const result = validateRecognitionAnnotationPackage(payload);

  assert.equal(result.valid, true);
  assert.ok(
    result.warnings.some((warning) =>
      warning.includes("covers less than 50%"),
    ),
  );
});
