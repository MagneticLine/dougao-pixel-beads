export const RECOGNITION_SCENE_CATEGORIES = Object.freeze([
  "pixel-art",
  "pattern-chart",
  "fused-bead-photo",
  "holed-bead-photo",
]);

export const RECOGNITION_DATASET_KIND = "dougao-recognition-dataset";
export const RECOGNITION_DATASET_SCHEMA_VERSION = 2;
export const RECOGNITION_CORNER_ORDER = Object.freeze([
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
]);
export const RECOGNITION_DATA_SPLITS = Object.freeze([
  "development",
  "validation",
  "holdout",
]);
export const RECOGNITION_RIGHTS_STATUSES = Object.freeze([
  "owned",
  "authorized",
  "cc0",
  "cc-by",
  "review-required",
  "unknown",
]);
export const RECOGNITION_DISTRIBUTIONS = Object.freeze([
  "private",
  "repository-public",
  "existing-project-fixture",
]);
export const RECOGNITION_SCENE_TAGS = Object.freeze([
  "grid-none",
  "grid-visible",
  "grid-faint",
  "transparent-background",
  "plain-background",
  "complex-background",
  "text-labels",
  "color-codes",
  "watermark",
  "text-or-watermark",
  "blur",
  "jpeg-compression",
  "noninteger-scaling",
  "rotation",
  "perspective",
  "uneven-lighting",
  "reflection",
  "shadow",
  "occlusion",
  "multiple-subjects",
  "missing-beads",
]);

const ALLOWED_SPLITS = new Set(RECOGNITION_DATA_SPLITS);
const ALLOWED_TRUTH_STATES = new Set(["unlabeled", "grid-only", "complete"]);
const ALLOWED_RIGHTS_STATUSES = new Set(RECOGNITION_RIGHTS_STATUSES);
const ALLOWED_DISTRIBUTIONS = new Set(RECOGNITION_DISTRIBUTIONS);
const ALLOWED_SCENE_TAGS = new Set(RECOGNITION_SCENE_TAGS);
const PUBLIC_DISTRIBUTIONS = new Set(["public", "repository-public"]);
const EXCLUSIVE_SCENE_TAG_GROUPS = Object.freeze([
  Object.freeze(["grid-none", "grid-visible", "grid-faint"]),
  Object.freeze([
    "transparent-background",
    "plain-background",
    "complex-background",
  ]),
]);

function migrateLegacyScene(scene = {}) {
  const legacyCategory = scene.category;
  const tags = new Set(Array.isArray(scene.difficultyFlags) ? scene.difficultyFlags : []);
  let category = legacyCategory;
  if (legacyCategory === "pure-pixel-art") category = "pixel-art";
  if (legacyCategory === "complex-background-pixel-art") {
    category = "pixel-art";
    tags.add("complex-background");
  }
  if (legacyCategory === "labeled-pattern") category = "pattern-chart";
  return {
    category,
    tags: [...tags],
  };
}

export function migrateRecognitionAnnotationPackage(payload) {
  if (Number(payload?.schemaVersion) !== 1) return payload;
  const migrated = structuredClone(payload);
  migrated.schemaVersion = RECOGNITION_DATASET_SCHEMA_VERSION;
  migrated.samples = (migrated.samples || []).map((sample) => ({
    ...sample,
    scene: migrateLegacyScene(sample.scene),
  }));
  return migrated;
}

function positiveInteger(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function finitePoint(point) {
  return (
    point &&
    Number.isFinite(Number(point.x)) &&
    Number.isFinite(Number(point.y))
  );
}

export function recognitionPolygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += Number(current.x) * Number(next.y) -
      Number(next.x) * Number(current.y);
  }
  return area / 2;
}

export function isValidRecognitionQuad(points, {
  minimumArea = 0.002,
  maximumCoordinate = 1,
} = {}) {
  if (
    !Array.isArray(points) ||
    points.length !== 4 ||
    !points.every(finitePoint)
  ) {
    return false;
  }
  if (
    points.some(
      (point) =>
        Number(point.x) < 0 ||
        Number(point.y) < 0 ||
        Number(point.x) > maximumCoordinate ||
        Number(point.y) > maximumCoordinate,
    )
  ) {
    return false;
  }
  const signs = [];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const after = points[(index + 2) % points.length];
    const cross =
      (Number(next.x) - Number(current.x)) *
        (Number(after.y) - Number(next.y)) -
      (Number(next.y) - Number(current.y)) *
        (Number(after.x) - Number(next.x));
    if (Math.abs(cross) > 1e-8) signs.push(Math.sign(cross));
  }
  return (
    signs.length === 4 &&
    signs.every((sign) => sign === signs[0]) &&
    Math.abs(recognitionPolygonArea(points)) >= minimumArea
  );
}

function validateRights(rights, prefix, errors, warnings) {
  if (!rights || typeof rights !== "object") {
    errors.push(`${prefix}.rights metadata is required`);
    return;
  }
  const status = String(rights.status || "");
  const distribution = String(rights.distribution || "");
  if (!ALLOWED_RIGHTS_STATUSES.has(status)) {
    errors.push(`${prefix}.rights.status is invalid`);
  }
  if (!ALLOWED_DISTRIBUTIONS.has(distribution)) {
    errors.push(`${prefix}.rights.distribution is invalid`);
  }
  if (
    (status === "unknown" || status === "review-required") &&
    PUBLIC_DISTRIBUTIONS.has(distribution)
  ) {
    errors.push(
      `${prefix} cannot be public while its rights status is unresolved`,
    );
  }
  if (status === "unknown" || status === "review-required") {
    warnings.push(`${prefix} still needs a distribution-rights audit`);
  }
  if (
    distribution === "repository-public" &&
    !["owned", "authorized", "cc0", "cc-by"].includes(status)
  ) {
    errors.push(`${prefix} is not cleared for repository-public distribution`);
  }
}

export function validateRecognitionAnnotationPackage(payload) {
  const errors = [];
  const warnings = [];
  const samples = Array.isArray(payload?.samples) ? payload.samples : [];
  const ids = new Set();
  const hashes = new Set();
  const categoryCounts = Object.fromEntries(
    RECOGNITION_SCENE_CATEGORIES.map((category) => [category, 0]),
  );
  const tagCounts = Object.fromEntries(
    RECOGNITION_SCENE_TAGS.map((tag) => [tag, 0]),
  );
  const splitCounts = Object.fromEntries(
    RECOGNITION_DATA_SPLITS.map((split) => [split, 0]),
  );

  if (payload?.kind !== RECOGNITION_DATASET_KIND) {
    errors.push(`kind must be ${RECOGNITION_DATASET_KIND}`);
  }
  if (Number(payload?.schemaVersion) !== RECOGNITION_DATASET_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${RECOGNITION_DATASET_SCHEMA_VERSION}`,
    );
  }
  if (payload?.imagesIncluded !== false) {
    errors.push("imagesIncluded must be false");
  }
  if (
    !payload?.createdAt ||
    !Number.isFinite(Date.parse(String(payload.createdAt)))
  ) {
    errors.push("createdAt must be an ISO date-time");
  }
  if (
    payload?.coordinateSystem?.origin !== "top-left" ||
    payload?.coordinateSystem?.pixelReference !== "browser-decoded-image" ||
    JSON.stringify(payload?.coordinateSystem?.cornerOrder) !==
      JSON.stringify(RECOGNITION_CORNER_ORDER) ||
    JSON.stringify(payload?.coordinateSystem?.normalizedRange) !==
      JSON.stringify([0, 1])
  ) {
    errors.push("coordinateSystem is invalid");
  }
  if (!samples.length) errors.push("samples must contain at least one annotation");

  samples.forEach((sample, index) => {
    const prefix = `samples[${index}]`;
    const sampleId = String(sample?.sampleId || "");
    if (!sampleId) {
      errors.push(`${prefix}.sampleId is required`);
    } else if (ids.has(sampleId)) {
      errors.push(`${prefix}.sampleId must be unique`);
    } else {
      ids.add(sampleId);
    }

    const source = sample?.source;
    if (!source || typeof source !== "object") {
      errors.push(`${prefix}.source is required`);
    } else {
      if (!String(source.fileName || "")) {
        errors.push(`${prefix}.source.fileName is required`);
      }
      const hash = String(source.sha256 || "").toLowerCase();
      if (!/^[a-f0-9]{64}$/.test(hash)) {
        errors.push(`${prefix}.source.sha256 must be a 64-character hex digest`);
      } else if (hashes.has(hash)) {
        errors.push(`${prefix}.source.sha256 must be unique`);
      } else {
        hashes.add(hash);
      }
      if (hash && sampleId !== `sha256:${hash}`) {
        errors.push(`${prefix}.sampleId must match source.sha256`);
      }
      if (!positiveInteger(source.byteSize)) {
        errors.push(`${prefix}.source.byteSize must be a positive integer`);
      }
      if (!positiveInteger(source.decodedWidth)) {
        errors.push(`${prefix}.source.decodedWidth must be a positive integer`);
      }
      if (!positiveInteger(source.decodedHeight)) {
        errors.push(`${prefix}.source.decodedHeight must be a positive integer`);
      }
      if (!String(source.mimeType || "").startsWith("image/")) {
        errors.push(`${prefix}.source.mimeType must be an image MIME type`);
      }
    }

    if (sample?.imageTransform?.crop !== null) {
      errors.push(`${prefix}.imageTransform.crop must be null`);
    }
    if (sample?.imageTransform?.coordinateSpace !== "browser-decoded-image") {
      errors.push(
        `${prefix}.imageTransform.coordinateSpace must be browser-decoded-image`,
      );
    }
    if (!RECOGNITION_SCENE_CATEGORIES.includes(sample?.scene?.category)) {
      errors.push(`${prefix}.scene.category is invalid`);
    } else {
      categoryCounts[sample.scene.category] += 1;
    }
    const tags = sample?.scene?.tags;
    if (!Array.isArray(tags)) {
      errors.push(`${prefix}.scene.tags must be an array`);
    } else {
      const uniqueTags = new Set(tags);
      if (uniqueTags.size !== tags.length) {
        errors.push(`${prefix}.scene.tags must not contain duplicates`);
      }
      for (const tag of tags) {
        if (!ALLOWED_SCENE_TAGS.has(tag)) {
          errors.push(`${prefix}.scene.tags contains ${tag}`);
        } else {
          tagCounts[tag] += 1;
        }
      }
      for (const group of EXCLUSIVE_SCENE_TAG_GROUPS) {
        const selected = group.filter((tag) => uniqueTags.has(tag));
        if (selected.length > 1) {
          errors.push(
            `${prefix}.scene.tags contains mutually exclusive tags: ${selected.join(", ")}`,
          );
        }
      }
    }
    if (!ALLOWED_SPLITS.has(sample?.split)) {
      errors.push(`${prefix}.split is invalid`);
    } else {
      splitCounts[sample.split] += 1;
    }
    validateRights(sample?.rights, prefix, errors, warnings);
    if (
      !sample?.rights?.acquiredAt ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(sample.rights.acquiredAt))
    ) {
      errors.push(`${prefix}.rights.acquiredAt must be YYYY-MM-DD`);
    }

    const truth = sample?.groundTruth;
    if (!truth || typeof truth !== "object") {
      errors.push(`${prefix}.groundTruth is required`);
      return;
    }
    if (
      !positiveInteger(truth.cols) ||
      Number(truth.cols) < 2 ||
      Number(truth.cols) > 200
    ) {
      errors.push(`${prefix}.groundTruth.cols must be between 2 and 200`);
    }
    if (
      !positiveInteger(truth.rows) ||
      Number(truth.rows) < 2 ||
      Number(truth.rows) > 200
    ) {
      errors.push(`${prefix}.groundTruth.rows must be between 2 and 200`);
    }
    if (
      JSON.stringify(truth.cornerOrder) !==
      JSON.stringify(RECOGNITION_CORNER_ORDER)
    ) {
      errors.push(`${prefix}.groundTruth.cornerOrder is invalid`);
    }
    if (!isValidRecognitionQuad(truth.cornersNormalized)) {
      errors.push(`${prefix}.groundTruth.cornersNormalized is not a valid quad`);
    } else {
      const coverage = Math.abs(
        recognitionPolygonArea(truth.cornersNormalized),
      );
      if (!Number.isFinite(Number(truth.frameCoverageRatio))) {
        errors.push(`${prefix}.groundTruth.frameCoverageRatio is required`);
      } else if (
        Math.abs(Number(truth.frameCoverageRatio) - coverage) > 0.002
      ) {
        errors.push(
          `${prefix}.groundTruth.frameCoverageRatio does not match the corners`,
        );
      }
      if (coverage < 0.5) {
        warnings.push(`${prefix} frame covers less than 50% of the full image`);
      }
    }
    if (
      !Array.isArray(truth.cornersImagePixels) ||
      truth.cornersImagePixels.length !== 4 ||
      !truth.cornersImagePixels.every(finitePoint)
    ) {
      errors.push(`${prefix}.groundTruth.cornersImagePixels is invalid`);
    } else if (
      source &&
      positiveInteger(source.decodedWidth) &&
      positiveInteger(source.decodedHeight) &&
      Array.isArray(truth.cornersNormalized) &&
      truth.cornersNormalized.length === 4
    ) {
      for (let cornerIndex = 0; cornerIndex < 4; cornerIndex += 1) {
        const normalized = truth.cornersNormalized[cornerIndex];
        const pixels = truth.cornersImagePixels[cornerIndex];
        const expectedX = Number(normalized.x) * Number(source.decodedWidth);
        const expectedY = Number(normalized.y) * Number(source.decodedHeight);
        if (
          Math.abs(Number(pixels.x) - expectedX) > 0.51 ||
          Math.abs(Number(pixels.y) - expectedY) > 0.51
        ) {
          errors.push(
            `${prefix}.groundTruth.cornersImagePixels is inconsistent with normalized coordinates`,
          );
          break;
        }
      }
    }
    if (
      !sample?.annotation?.annotatedAt ||
      !Number.isFinite(Date.parse(String(sample.annotation.annotatedAt)))
    ) {
      errors.push(`${prefix}.annotation.annotatedAt must be an ISO date-time`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      sampleCount: samples.length,
      categoryCounts,
      tagCounts,
      splitCounts,
    },
  };
}

export function validateRecognitionDatasetManifest(manifest) {
  const errors = [];
  const warnings = [];
  const cases = Array.isArray(manifest?.cases) ? manifest.cases : [];
  const categoryCounts = Object.fromEntries(
    RECOGNITION_SCENE_CATEGORIES.map((category) => [category, 0]),
  );
  const tagCounts = Object.fromEntries(
    RECOGNITION_SCENE_TAGS.map((tag) => [tag, 0]),
  );
  const splitCounts = {
    development: 0,
    validation: 0,
    holdout: 0,
  };
  const labels = new Set();

  if (Number(manifest?.schemaVersion) !== RECOGNITION_DATASET_SCHEMA_VERSION) {
    errors.push(
      `schemaVersion must be ${RECOGNITION_DATASET_SCHEMA_VERSION}`,
    );
  }
  if (!cases.length) errors.push("cases must contain at least one fixture");
  for (const field of ["realCore", "synthetic", "holdout"]) {
    const range = manifest?.targetCounts?.[field];
    if (
      !Array.isArray(range) ||
      range.length !== 2 ||
      !positiveInteger(range[0]) ||
      !positiveInteger(range[1]) ||
      Number(range[0]) > Number(range[1])
    ) {
      errors.push(`targetCounts.${field} must be a positive [min, max] range`);
    }
  }

  cases.forEach((item, index) => {
    const prefix = `cases[${index}]`;
    if (!item?.label || typeof item.label !== "string") {
      errors.push(`${prefix}.label is required`);
    } else if (labels.has(item.label)) {
      errors.push(`${prefix}.label must be unique`);
    } else {
      labels.add(item.label);
    }
    if (!item?.file || typeof item.file !== "string") {
      errors.push(`${prefix}.file is required`);
    }
    if (!RECOGNITION_SCENE_CATEGORIES.includes(item?.category)) {
      errors.push(`${prefix}.category is not a supported scene category`);
    } else {
      categoryCounts[item.category] += 1;
    }
    if (!Array.isArray(item?.tags)) {
      errors.push(`${prefix}.tags must be an array`);
    } else {
      const uniqueTags = new Set(item.tags);
      if (uniqueTags.size !== item.tags.length) {
        errors.push(`${prefix}.tags must not contain duplicates`);
      }
      for (const tag of item.tags) {
        if (!ALLOWED_SCENE_TAGS.has(tag)) {
          errors.push(`${prefix}.tags contains ${tag}`);
        } else {
          tagCounts[tag] += 1;
        }
      }
      for (const group of EXCLUSIVE_SCENE_TAG_GROUPS) {
        const selected = group.filter((tag) => uniqueTags.has(tag));
        if (selected.length > 1) {
          errors.push(
            `${prefix}.tags contains mutually exclusive tags: ${selected.join(", ")}`,
          );
        }
      }
    }
    if (!ALLOWED_SPLITS.has(item?.split)) {
      errors.push(`${prefix}.split must be development, validation, or holdout`);
    } else {
      splitCounts[item.split] += 1;
    }
    if (!ALLOWED_TRUTH_STATES.has(item?.truthStatus)) {
      errors.push(`${prefix}.truthStatus is invalid`);
    }
    if (
      !item?.crop ||
      !["left", "top", "width", "height"].every((field) =>
        Number.isFinite(Number(item.crop[field])),
      ) ||
      Number(item.crop.width) <= 0 ||
      Number(item.crop.height) <= 0
    ) {
      errors.push(`${prefix}.crop must describe a positive rectangle`);
    }
    validateRights(item?.rights, prefix, errors, warnings);
    if (item?.split === "holdout" && item?.truthStatus !== "complete") {
      errors.push(`${prefix} holdout samples require complete ground truth`);
    }
  });

  for (const [category, count] of Object.entries(categoryCounts)) {
    if (!count) errors.push(`missing required scene category: ${category}`);
  }
  if (!splitCounts.holdout) {
    warnings.push("no locked holdout fixtures have been collected yet");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      caseCount: cases.length,
      categoryCounts,
      tagCounts,
      splitCounts,
    },
  };
}
