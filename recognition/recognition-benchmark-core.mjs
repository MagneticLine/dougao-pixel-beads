const EPSILON = 1e-9;

function finitePoint(point) {
  return (
    point &&
    Number.isFinite(Number(point.x)) &&
    Number.isFinite(Number(point.y))
  );
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

export function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

function lineIntersection(start, end, clipStart, clipEnd) {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const clipX = clipEnd.x - clipStart.x;
  const clipY = clipEnd.y - clipStart.y;
  const denominator = segmentX * clipY - segmentY * clipX;
  if (Math.abs(denominator) < EPSILON) return { ...end };
  const offsetX = clipStart.x - start.x;
  const offsetY = clipStart.y - start.y;
  const ratio = (offsetX * clipY - offsetY * clipX) / denominator;
  return {
    x: start.x + ratio * segmentX,
    y: start.y + ratio * segmentY,
  };
}

export function intersectConvexPolygons(subject, clip) {
  if (
    !Array.isArray(subject) ||
    !Array.isArray(clip) ||
    subject.length < 3 ||
    clip.length < 3 ||
    !subject.every(finitePoint) ||
    !clip.every(finitePoint)
  ) {
    return [];
  }
  const orientation = polygonArea(clip) >= 0 ? 1 : -1;
  let output = subject.map((point) => ({ ...point }));
  for (let edgeIndex = 0; edgeIndex < clip.length; edgeIndex += 1) {
    const clipStart = clip[edgeIndex];
    const clipEnd = clip[(edgeIndex + 1) % clip.length];
    const input = output;
    output = [];
    if (!input.length) break;
    const inside = (point) =>
      orientation *
        ((clipEnd.x - clipStart.x) * (point.y - clipStart.y) -
          (clipEnd.y - clipStart.y) * (point.x - clipStart.x)) >=
      -EPSILON;
    let start = input[input.length - 1];
    for (const end of input) {
      const endInside = inside(end);
      const startInside = inside(start);
      if (endInside) {
        if (!startInside) {
          output.push(lineIntersection(start, end, clipStart, clipEnd));
        }
        output.push(end);
      } else if (startInside) {
        output.push(lineIntersection(start, end, clipStart, clipEnd));
      }
      start = end;
    }
  }
  return output;
}

export function frameIntersectionOverUnion(first, second) {
  if (
    !Array.isArray(first) ||
    !Array.isArray(second) ||
    first.length !== 4 ||
    second.length !== 4
  ) {
    return 0;
  }
  const firstArea = Math.abs(polygonArea(first));
  const secondArea = Math.abs(polygonArea(second));
  if (firstArea < EPSILON || secondArea < EPSILON) return 0;
  const intersectionArea = Math.abs(
    polygonArea(intersectConvexPolygons(first, second)),
  );
  return intersectionArea / Math.max(EPSILON, firstArea + secondArea - intersectionArea);
}

function resolveTruthCorners(truth, size) {
  if (Array.isArray(truth?.corners) && truth.corners.every(finitePoint)) {
    return truth.corners.map((point) => ({
      x: Number(point.x),
      y: Number(point.y),
    }));
  }
  if (
    Array.isArray(truth?.cornersNormalized) &&
    truth.cornersNormalized.every(finitePoint) &&
    Number.isFinite(Number(size?.width)) &&
    Number.isFinite(Number(size?.height))
  ) {
    return truth.cornersNormalized.map((point) => ({
      x: Number(point.x) * Number(size.width),
      y: Number(point.y) * Number(size.height),
    }));
  }
  return null;
}

function truthCellPitch(corners, cols, rows) {
  const horizontal =
    (distance(corners[0], corners[1]) + distance(corners[3], corners[2])) /
    (2 * Math.max(1, cols));
  const vertical =
    (distance(corners[0], corners[3]) + distance(corners[1], corners[2])) /
    (2 * Math.max(1, rows));
  return Math.max(EPSILON, (horizontal + vertical) / 2);
}

export function evaluateCandidateAgainstTruth(candidate, truth, size = {}) {
  const candidateCorners = candidate?.frame?.corners;
  const truthCorners = resolveTruthCorners(truth, size);
  if (
    !Array.isArray(candidateCorners) ||
    candidateCorners.length !== 4 ||
    !candidateCorners.every(finitePoint) ||
    !truthCorners ||
    truthCorners.length !== 4
  ) {
    return {
      valid: false,
      gridExact: false,
      quality: 0,
    };
  }

  const cols = Math.max(1, Math.round(Number(truth.cols) || 1));
  const rows = Math.max(1, Math.round(Number(truth.rows) || 1));
  const candidateCols = Math.max(
    1,
    Math.round(Number(candidate.frame.cols) || 1),
  );
  const candidateRows = Math.max(
    1,
    Math.round(Number(candidate.frame.rows) || 1),
  );
  const cornerErrors = truthCorners.map((point, index) =>
    distance(point, candidateCorners[index]),
  );
  const meanCornerErrorPixels =
    cornerErrors.reduce((sum, value) => sum + value, 0) / cornerErrors.length;
  const rmsCornerErrorPixels = Math.sqrt(
    cornerErrors.reduce((sum, value) => sum + value * value, 0) /
      cornerErrors.length,
  );
  const cellPitch = truthCellPitch(truthCorners, cols, rows);
  const meanCornerErrorCells = meanCornerErrorPixels / cellPitch;
  const rmsCornerErrorCells = rmsCornerErrorPixels / cellPitch;
  const frameIou = frameIntersectionOverUnion(candidateCorners, truthCorners);
  const colError = Math.abs(candidateCols - cols);
  const rowError = Math.abs(candidateRows - rows);
  const gridExact = colError === 0 && rowError === 0;
  const gridScore = Math.exp(-0.55 * (colError + rowError));
  const geometryScore =
    frameIou * Math.exp(-0.18 * Math.min(20, meanCornerErrorCells));
  const quality = 0.58 * gridScore + 0.42 * geometryScore;

  return {
    valid: true,
    gridExact,
    candidateCols,
    candidateRows,
    truthCols: cols,
    truthRows: rows,
    colError,
    rowError,
    meanCornerErrorPixels,
    rmsCornerErrorPixels,
    meanCornerErrorCells,
    rmsCornerErrorCells,
    frameIou,
    gridScore,
    geometryScore,
    quality,
  };
}

export function evaluateCandidateSet(candidates, truth, size = {}) {
  const evaluations = (Array.isArray(candidates) ? candidates : []).map(
    (candidate, index) => ({
      index,
      ...evaluateCandidateAgainstTruth(candidate, truth, size),
    }),
  );
  const ranking = evaluations
    .filter((evaluation) => evaluation.valid)
    .sort(
      (first, second) =>
        second.quality - first.quality ||
        Number(second.gridExact) - Number(first.gridExact) ||
        first.meanCornerErrorCells - second.meanCornerErrorCells ||
        first.index - second.index,
    );
  const bestIndex = ranking[0]?.index ?? -1;
  return {
    evaluations,
    ranking,
    bestIndex,
    top1IsBest: bestIndex === 0,
    top3ContainsBest: bestIndex >= 0 && bestIndex < 3,
    exactGridCandidateCount: evaluations.filter(
      (evaluation) => evaluation.valid && evaluation.gridExact,
    ).length,
  };
}

export function summarizeRecognitionBenchmark(results) {
  const usable = (Array.isArray(results) ? results : []).filter(
    (result) => Number.isInteger(result?.bestIndex) && result.bestIndex >= 0,
  );
  const top1Count = usable.filter((result) => result.top1IsBest).length;
  const top3Count = usable.filter((result) => result.top3ContainsBest).length;
  const exactGridRecallCount = usable.filter(
    (result) => result.exactGridCandidateCount > 0,
  ).length;
  const ratio = (value) => (usable.length ? value / usable.length : 0);
  return {
    caseCount: usable.length,
    top1Count,
    top3Count,
    exactGridRecallCount,
    top1Rate: ratio(top1Count),
    top3Rate: ratio(top3Count),
    exactGridRecallRate: ratio(exactGridRecallCount),
  };
}
