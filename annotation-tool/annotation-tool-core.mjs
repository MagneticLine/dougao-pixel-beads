import {
  RECOGNITION_CORNER_ORDER,
  recognitionPolygonArea,
} from "../recognition/recognition-dataset-core.mjs";

export const ANNOTATION_MAX_GRID_SIZE = 200;
export const ANNOTATION_MIN_GRID_SIZE = 2;
export const ANNOTATION_MAX_RENDER_SIDE = 2000;
export const ANNOTATION_MIN_RENDER_SIDE = 960;

export const DEFAULT_ANNOTATION_CORNERS = Object.freeze([
  Object.freeze({ x: 0.08, y: 0.08 }),
  Object.freeze({ x: 0.92, y: 0.08 }),
  Object.freeze({ x: 0.92, y: 0.92 }),
  Object.freeze({ x: 0.08, y: 0.92 }),
]);

export function clampAnnotationGridSize(value, fallback = 20) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(
    ANNOTATION_MAX_GRID_SIZE,
    Math.max(ANNOTATION_MIN_GRID_SIZE, Math.round(numeric)),
  );
}

export function cloneAnnotationCorners(
  corners = DEFAULT_ANNOTATION_CORNERS,
) {
  return corners.map((point) => ({
    x: Number(point.x),
    y: Number(point.y),
  }));
}

export function calculateAnnotationRenderSize(
  width,
  height,
  {
    maximumSide = ANNOTATION_MAX_RENDER_SIDE,
    minimumSide = ANNOTATION_MIN_RENDER_SIDE,
  } = {},
) {
  const sourceWidth = Math.max(1, Number(width) || 1);
  const sourceHeight = Math.max(1, Number(height) || 1);
  const longestSide = Math.max(sourceWidth, sourceHeight);
  const scale = Math.min(
    maximumSide / longestSide,
    Math.max(1, minimumSide / longestSide),
  );
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
    scale,
  };
}

export function pointInsideRecognitionQuad(point, corners) {
  if (!point || !Array.isArray(corners) || corners.length !== 4) return false;
  let sign = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % corners.length];
    const cross =
      (Number(next.x) - Number(current.x)) *
        (Number(point.y) - Number(current.y)) -
      (Number(next.y) - Number(current.y)) *
        (Number(point.x) - Number(current.x));
    if (Math.abs(cross) < 1e-9) continue;
    const nextSign = Math.sign(cross);
    if (sign && nextSign !== sign) return false;
    sign = nextSign;
  }
  return sign !== 0;
}

export function translateRecognitionQuad(corners, deltaX, deltaY) {
  const points = cloneAnnotationCorners(corners);
  const minimumX = Math.min(...points.map((point) => point.x));
  const maximumX = Math.max(...points.map((point) => point.x));
  const minimumY = Math.min(...points.map((point) => point.y));
  const maximumY = Math.max(...points.map((point) => point.y));
  const safeDeltaX = Math.min(
    1 - maximumX,
    Math.max(-minimumX, Number(deltaX) || 0),
  );
  const safeDeltaY = Math.min(
    1 - maximumY,
    Math.max(-minimumY, Number(deltaY) || 0),
  );
  return points.map((point) => ({
    x: point.x + safeDeltaX,
    y: point.y + safeDeltaY,
  }));
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

export function buildRecognitionAnnotationSample(record, draft, annotatedAt) {
  const cornersNormalized = cloneAnnotationCorners(draft.corners).map(
    (point) => ({
      x: round(point.x, 7),
      y: round(point.y, 7),
    }),
  );
  const decodedWidth = Number(record.decodedWidth);
  const decodedHeight = Number(record.decodedHeight);
  const frameCoverageRatio = Math.abs(
    recognitionPolygonArea(cornersNormalized),
  );

  return {
    sampleId: `sha256:${record.sha256}`,
    source: {
      fileName: record.fileName,
      sha256: record.sha256,
      mimeType: record.mimeType,
      byteSize: record.byteSize,
      decodedWidth,
      decodedHeight,
    },
    imageTransform: {
      crop: null,
      coordinateSpace: "browser-decoded-image",
      exifOrientationAppliedByDecoder: true,
    },
    scene: {
      category: draft.sceneCategory,
      tags: [...draft.sceneTags],
    },
    split: draft.split,
    rights: {
      status: draft.rightsStatus,
      distribution: draft.distribution,
      creator: String(draft.creator || "").trim(),
      sourceUrl: String(draft.sourceUrl || "").trim(),
      license: String(draft.license || "").trim(),
      acquiredAt: draft.acquiredAt,
    },
    groundTruth: {
      cols: clampAnnotationGridSize(draft.cols),
      rows: clampAnnotationGridSize(draft.rows),
      cornerOrder: [...RECOGNITION_CORNER_ORDER],
      cornersNormalized,
      cornersImagePixels: cornersNormalized.map((point) => ({
        x: round(point.x * decodedWidth, 4),
        y: round(point.y * decodedHeight, 4),
      })),
      frameCoverageRatio: round(frameCoverageRatio, 7),
    },
    annotation: {
      note: String(draft.note || "").trim(),
      annotatedAt,
    },
  };
}
