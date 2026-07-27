import {
  buildSquareLatticeHarmonics,
  measureLatticePointConsensus,
  radians,
  scoreLatticeEvidence,
} from "./dominant-lattice-core.mjs?v=63";

const HALF_PI = Math.PI / 2;
const QUARTER_PI = Math.PI / 4;

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const positiveModulo = (value, divisor) =>
  ((value % divisor) + divisor) % divisor;

function quantile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    clamp(Math.round((sorted.length - 1) * ratio), 0, sorted.length - 1)
  ];
}

function normalizeDisplayAngle(angle) {
  let normalized = positiveModulo(angle, HALF_PI);
  if (normalized > QUARTER_PI) normalized -= HALF_PI;
  return normalized;
}

function projectedPoint(x, y, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    u: x * cosine + y * sine,
    v: -x * sine + y * cosine,
  };
}

function imageProjectedBounds(width, height, angle) {
  const points = [
    projectedPoint(0, 0, angle),
    projectedPoint(width, 0, angle),
    projectedPoint(width, height, angle),
    projectedPoint(0, height, angle),
  ];
  return {
    minU: Math.min(...points.map((point) => point.u)),
    maxU: Math.max(...points.map((point) => point.u)),
    minV: Math.min(...points.map((point) => point.v)),
    maxV: Math.max(...points.map((point) => point.v)),
  };
}

function inverseProjectedPoint(u, v, angle) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: u * cosine - v * sine,
    y: u * sine + v * cosine,
  };
}

function percentileThreshold(map, ratio, stride = 3) {
  const values = [];
  for (let index = 0; index < map.length; index += stride) {
    if (map[index] > 0) values.push(map[index]);
  }
  return quantile(values, ratio);
}

function buildFeatureMaps(imageData) {
  const { width, height, data } = imageData;
  const size = width * height;
  const luminance = new Float32Array(size);
  const gradientX = new Float32Array(size);
  const gradientY = new Float32Array(size);
  const gradient = new Float32Array(size);
  const corner = new Float32Array(size);
  const center = new Float32Array(size);

  for (let index = 0; index < size; index += 1) {
    const source = index * 4;
    const alpha = data[source + 3] / 255;
    const red = data[source] * alpha + 255 * (1 - alpha);
    const green = data[source + 1] * alpha + 255 * (1 - alpha);
    const blue = data[source + 2] * alpha + 255 * (1 - alpha);
    luminance[index] = red * 0.299 + green * 0.587 + blue * 0.114;
  }

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const source = index * 4;
      const left = source - 4;
      const right = source + 4;
      const above = source - width * 4;
      const below = source + width * 4;
      const lumaX = luminance[index + 1] - luminance[index - 1];
      const lumaY = luminance[index + width] - luminance[index - width];
      const colorX = Math.hypot(
        data[right] - data[left],
        data[right + 1] - data[left + 1],
        data[right + 2] - data[left + 2],
      ) / Math.sqrt(3);
      const colorY = Math.hypot(
        data[below] - data[above],
        data[below + 1] - data[above + 1],
        data[below + 2] - data[above + 2],
      ) / Math.sqrt(3);
      const gx = Math.sign(lumaX || 1) * (Math.abs(lumaX) * 0.62 + colorX * 0.38);
      const gy = Math.sign(lumaY || 1) * (Math.abs(lumaY) * 0.62 + colorY * 0.38);
      gradientX[index] = gx;
      gradientY[index] = gy;
      gradient[index] = Math.hypot(gx, gy);
    }
  }

  for (let y = 2; y < height - 2; y += 1) {
    for (let x = 2; x < width - 2; x += 1) {
      let xx = 0;
      let xy = 0;
      let yy = 0;
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const index = (y + offsetY) * width + x + offsetX;
          const gx = gradientX[index];
          const gy = gradientY[index];
          xx += gx * gx;
          xy += gx * gy;
          yy += gy * gy;
        }
      }
      const trace = xx + yy;
      const determinantRoot = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy ** 2));
      corner[y * width + x] = Math.sqrt(Math.max(0, (trace - determinantRoot) / 2));
    }
  }

  const radius = clamp(Math.round(Math.min(width, height) / 85), 3, 6);
  const ringOffsets = [
    [-radius, 0],
    [radius, 0],
    [0, -radius],
    [0, radius],
    [-radius, -radius],
    [radius, -radius],
    [-radius, radius],
    [radius, radius],
  ];
  for (let y = radius; y < height - radius; y += 1) {
    for (let x = radius; x < width - radius; x += 1) {
      const index = y * width + x;
      let ring = 0;
      let ringVariance = 0;
      for (const [offsetX, offsetY] of ringOffsets) {
        ring += luminance[(y + offsetY) * width + x + offsetX];
      }
      ring /= ringOffsets.length;
      for (const [offsetX, offsetY] of ringOffsets) {
        const difference =
          luminance[(y + offsetY) * width + x + offsetX] - ring;
        ringVariance += difference * difference;
      }
      ringVariance = Math.sqrt(ringVariance / ringOffsets.length);
      center[index] =
        Math.abs(luminance[index] - ring) * 0.82 +
        Math.max(0, gradient[index] - ringVariance) * 0.18;
    }
  }

  return {
    width,
    height,
    data,
    luminance,
    gradientX,
    gradientY,
    gradient,
    corner,
    center,
    gradientScale: Math.max(1, percentileThreshold(gradient, 0.86)),
    centerScale: Math.max(1, percentileThreshold(center, 0.88)),
  };
}

function selectFeaturePoints(
  map,
  width,
  height,
  { maximum = 1800, quantileRatio = 0.88, border = 3 } = {},
) {
  const threshold = Math.max(1e-6, percentileThreshold(map, quantileRatio, 2));
  const candidates = [];
  for (let y = border; y < height - border; y += 1) {
    for (let x = border; x < width - border; x += 1) {
      const index = y * width + x;
      const value = map[index];
      if (value < threshold) continue;
      let localMaximum = true;
      for (let offsetY = -1; offsetY <= 1 && localMaximum; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (!offsetX && !offsetY) continue;
          if (map[(y + offsetY) * width + x + offsetX] > value) {
            localMaximum = false;
            break;
          }
        }
      }
      if (!localMaximum) continue;
      candidates.push({
        x: x + 0.5,
        y: y + 0.5,
        weight: clamp(value / threshold, 0.45, 3),
      });
    }
  }
  candidates.sort((a, b) => b.weight - a.weight);
  if (candidates.length <= maximum) return candidates;
  const spatiallyBalanced = [];
  const cellSize = Math.max(2, Math.sqrt((width * height) / maximum) * 0.72);
  const occupied = new Set();
  for (const point of candidates) {
    const key = `${Math.floor(point.x / cellSize)},${Math.floor(point.y / cellSize)}`;
    if (occupied.has(key)) continue;
    occupied.add(key);
    spatiallyBalanced.push(point);
    if (spatiallyBalanced.length >= maximum) break;
  }
  return spatiallyBalanced;
}

function sourceAngles() {
  const values = new Set();
  for (let degrees = -44; degrees <= 44; degrees += 4) values.add(degrees);
  for (let degrees = -18; degrees <= 18; degrees += 2) values.add(degrees);
  return [...values].sort((a, b) => a - b).map(radians);
}

function preliminaryCandidates(pointsBySource, maps, options) {
  const minimumPeriod = Math.max(4, Number(options.minimumPeriod) || 5);
  const maximumPeriod = Math.min(
    Number(options.maximumPeriod) || 64,
    Math.max(minimumPeriod + 1, Math.min(maps.width, maps.height) / 3.4),
  );
  const candidates = [];
  for (const [source, points] of Object.entries(pointsBySource)) {
    if (points.length < 12) continue;
    for (const angle of sourceAngles()) {
      for (let period = minimumPeriod; period <= maximumPeriod; period += 1) {
        const consensus = measureLatticePointConsensus(
          points,
          { angle, period },
          { bins: 24, tolerance: source === "center" ? 0.2 : 0.23, trim: 0.055 },
        );
        const coverageReliability = Math.sqrt(
          Math.max(0, consensus.explainedWeight * consensus.siteOccupancy),
        );
        candidates.push({
          source,
          angle,
          period,
          consensus,
          preliminary:
            consensus.score *
            (0.62 + coverageReliability * 0.38) *
            (source === "corner" ? 1.02 : 1),
        });
      }
    }
  }
  candidates.sort((a, b) => b.preliminary - a.preliminary);
  return candidates.slice(0, 32);
}

function expandCandidatePool(seeds, pointsBySource, minimumPeriod, maximumPeriod) {
  const expanded = [];
  const seen = new Set();
  for (const seed of seeds.slice(0, 20)) {
    for (const harmonic of buildSquareLatticeHarmonics(seed)) {
      if (harmonic.period < minimumPeriod || harmonic.period > maximumPeriod) continue;
      const angle = positiveModulo(harmonic.angle, HALF_PI);
      const key = `${seed.source}:${Math.round(harmonic.period * 4)}:${Math.round(
        (angle * 1800) / Math.PI,
      )}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const consensus = measureLatticePointConsensus(
        pointsBySource[seed.source],
        harmonic,
        {
          bins: 28,
          tolerance: seed.source === "center" ? 0.2 : 0.23,
          trim: 0.055,
        },
      );
      expanded.push({
        source: seed.source,
        alias: harmonic.id,
        angle,
        period: harmonic.period,
        consensus,
        preliminary:
          consensus.score *
          (0.7 + Math.sqrt(consensus.explainedWeight * consensus.siteOccupancy) * 0.3),
      });
    }
  }
  expanded.sort((a, b) => b.preliminary - a.preliminary);
  return expanded.slice(0, 54);
}

function gridPhases(candidate) {
  if (Array.isArray(candidate.refinedPhases)) {
    return [...candidate.refinedPhases];
  }
  if (candidate.source === "center") {
    return [
      candidate.consensus.phase[0] - candidate.period / 2,
      candidate.consensus.phase[1] - candidate.period / 2,
    ];
  }
  return [...candidate.consensus.phase];
}

function orientedGradientAt(maps, x, y, normalX, normalY, radius = 1) {
  const { width, height, gradientX, gradientY } = maps;
  let maximum = 0;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const sampleX = Math.round(x + normalX * offset);
    const sampleY = Math.round(y + normalY * offset);
    if (
      sampleX < 1 ||
      sampleY < 1 ||
      sampleX >= width - 1 ||
      sampleY >= height - 1
    ) {
      continue;
    }
    const index = sampleY * width + sampleX;
    maximum = Math.max(
      maximum,
      Math.abs(
        gradientX[index] * normalX + gradientY[index] * normalY,
      ),
    );
  }
  return maximum;
}

function evaluateAxisPhase(maps, candidate, axis, phase) {
  const { width, height, gradientScale, centerScale, center } = maps;
  const angle = candidate.angle;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const bounds = imageProjectedBounds(width, height, angle);
  const fixedMinimum = axis === "u" ? bounds.minU : bounds.minV;
  const fixedMaximum = axis === "u" ? bounds.maxU : bounds.maxV;
  const movingMinimum = axis === "u" ? bounds.minV : bounds.minU;
  const movingMaximum = axis === "u" ? bounds.maxV : bounds.maxU;
  const fixedValues = enumerateGridValues(
    fixedMinimum,
    fixedMaximum,
    phase,
    candidate.period,
  );
  const movingStep = Math.max(2, candidate.period * 0.3);
  const normalX = axis === "u" ? cosine : -sine;
  const normalY = axis === "u" ? sine : cosine;
  let lineResponse = 0;
  let lineHits = 0;
  let lineSamples = 0;
  let centerResponse = 0;
  let centerHits = 0;
  let centerSamples = 0;

  for (const fixed of fixedValues) {
    for (
      let moving = movingMinimum + movingStep;
      moving <= movingMaximum - movingStep;
      moving += movingStep
    ) {
      const point =
        axis === "u"
          ? inverseProjectedPoint(fixed, moving, angle)
          : inverseProjectedPoint(moving, fixed, angle);
      if (
        point.x < 2 ||
        point.y < 2 ||
        point.x >= width - 2 ||
        point.y >= height - 2
      ) {
        continue;
      }
      const normalized =
        orientedGradientAt(
          maps,
          point.x,
          point.y,
          normalX,
          normalY,
          1,
        ) / gradientScale;
      lineResponse += Math.min(1, normalized);
      if (normalized > 0.44) lineHits += 1;
      lineSamples += 1;
    }
  }

  const centerValues = enumerateGridValues(
    fixedMinimum,
    fixedMaximum,
    phase + candidate.period / 2,
    candidate.period,
  );
  const otherPhase = gridPhases(candidate)[axis === "u" ? 1 : 0];
  const centerMovingValues = enumerateGridValues(
    movingMinimum,
    movingMaximum,
    otherPhase + candidate.period / 2,
    candidate.period,
  );
  const centerRadius = clamp(Math.round(candidate.period * 0.12), 1, 4);
  for (const fixed of centerValues) {
    for (const moving of centerMovingValues) {
      const point =
        axis === "u"
          ? inverseProjectedPoint(fixed, moving, angle)
          : inverseProjectedPoint(moving, fixed, angle);
      if (
        point.x < centerRadius ||
        point.y < centerRadius ||
        point.x >= width - centerRadius ||
        point.y >= height - centerRadius
      ) {
        continue;
      }
      const normalized =
        sampleMap(
          center,
          width,
          height,
          point.x,
          point.y,
          centerRadius,
        ) / centerScale;
      centerResponse += Math.min(1, normalized);
      if (normalized > 0.58) centerHits += 1;
      centerSamples += 1;
    }
  }

  const lineScore = lineSamples
    ? (lineResponse / lineSamples) * 0.58 +
      (lineHits / lineSamples) * 0.42
    : 0;
  const centerScore = centerSamples
    ? (centerResponse / centerSamples) * 0.48 +
      (centerHits / centerSamples) * 0.52
    : 0;
  const centerWeight = candidate.source === "center" ? 0.58 : 0.22;
  return lineScore * (1 - centerWeight) + centerScore * centerWeight;
}

function refineCandidatePhases(maps, candidate) {
  const initial = gridPhases(candidate);
  const step = clamp(candidate.period / 32, 0.18, 0.72);
  const refined = [];
  let workingCandidate = candidate;
  for (let axisIndex = 0; axisIndex < 2; axisIndex += 1) {
    const axis = axisIndex === 0 ? "u" : "v";
    let best = { phase: initial[axisIndex], score: -Infinity };
    for (
      let offset = -candidate.period / 2;
      offset <= candidate.period / 2 + step * 0.25;
      offset += step
    ) {
      const phase = initial[axisIndex] + offset;
      const score = evaluateAxisPhase(maps, workingCandidate, axis, phase);
      if (score > best.score) best = { phase, score };
    }
    const fineStep = Math.max(0.08, step / 4);
    const coarsePhase = best.phase;
    for (
      let offset = -step;
      offset <= step + fineStep * 0.25;
      offset += fineStep
    ) {
      const phase = coarsePhase + offset;
      const score = evaluateAxisPhase(maps, workingCandidate, axis, phase);
      if (score > best.score) best = { phase, score };
    }
    refined.push(best.phase);
    if (axisIndex === 0) {
      workingCandidate = {
        ...candidate,
        refinedPhases: [best.phase, initial[1]],
      };
    }
  }
  return {
    ...candidate,
    refinedPhases: refined,
  };
}

function sampleMap(map, width, height, x, y, radius = 0) {
  const centerX = Math.round(x);
  const centerY = Math.round(y);
  let maximum = 0;
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      const sampleX = centerX + offsetX;
      const sampleY = centerY + offsetY;
      if (sampleX < 0 || sampleY < 0 || sampleX >= width || sampleY >= height) continue;
      maximum = Math.max(maximum, map[sampleY * width + sampleX]);
    }
  }
  return maximum;
}

function enumerateGridValues(minimum, maximum, phase, period) {
  const values = [];
  const first = Math.ceil((minimum - phase) / period);
  const last = Math.floor((maximum - phase) / period);
  for (let index = first; index <= last; index += 1) {
    values.push(phase + index * period);
  }
  return values;
}

function evaluateLineContinuity(maps, candidate) {
  const { width, height, gradientX, gradientY, gradientScale } = maps;
  const angle = candidate.angle;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const bounds = imageProjectedBounds(width, height, angle);
  const [phaseU, phaseV] = gridPhases(candidate);
  const uLines = enumerateGridValues(bounds.minU, bounds.maxU, phaseU, candidate.period);
  const vLines = enumerateGridValues(bounds.minV, bounds.maxV, phaseV, candidate.period);
  const lineScores = [];

  const evaluateLine = (fixed, minimum, maximum, isU) => {
    const step = Math.max(1.8, candidate.period * 0.24);
    let response = 0;
    let hits = 0;
    let samples = 0;
    for (let moving = minimum + step; moving <= maximum - step; moving += step) {
      const point = isU
        ? inverseProjectedPoint(fixed, moving, angle)
        : inverseProjectedPoint(moving, fixed, angle);
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
      const index = y * width + x;
      const oriented = isU
        ? Math.abs(gradientX[index] * cosine + gradientY[index] * sine)
        : Math.abs(-gradientX[index] * sine + gradientY[index] * cosine);
      const normalized = clamp(oriented / gradientScale, 0, 1.6);
      response += Math.min(1, normalized);
      if (normalized > 0.44) hits += 1;
      samples += 1;
    }
    if (samples >= 4) {
      lineScores.push((response / samples) * 0.58 + (hits / samples) * 0.42);
    }
  };

  for (const line of uLines) evaluateLine(line, bounds.minV, bounds.maxV, true);
  for (const line of vLines) evaluateLine(line, bounds.minU, bounds.maxU, false);
  if (!lineScores.length) return 0;
  lineScores.sort((a, b) => a - b);
  const trim = Math.floor(lineScores.length * 0.08);
  const kept = lineScores.slice(trim, Math.max(trim + 1, lineScores.length - trim));
  return kept.reduce((sum, value) => sum + value, 0) / kept.length;
}

function evaluateSubdivisionEvidence(maps, candidate, lineContinuity) {
  if (candidate.period < 8 || lineContinuity < 0.05) return 0;
  const [phaseU, phaseV] = gridPhases(candidate);
  const evidence = [];
  for (const divisor of [2, 3, 4]) {
    if (candidate.period / divisor < 4) continue;
    const shifted = {
      ...candidate,
      refinedPhases: [
        phaseU + candidate.period / divisor,
        phaseV + candidate.period / divisor,
      ],
    };
    const internalContinuity = evaluateLineContinuity(maps, shifted);
    const ratio = internalContinuity / Math.max(0.05, lineContinuity);
    evidence.push(clamp((ratio - 0.56) / 0.5, 0, 1));
  }
  if (!evidence.length) return 0;
  const maximum = Math.max(...evidence);
  const mean = evidence.reduce((sum, value) => sum + value, 0) / evidence.length;
  return maximum * 0.82 + mean * 0.18;
}

function quantizedColor(data, index) {
  const alpha = data[index + 3] / 255;
  const red = data[index] * alpha + 255 * (1 - alpha);
  const green = data[index + 1] * alpha + 255 * (1 - alpha);
  const blue = data[index + 2] * alpha + 255 * (1 - alpha);
  return `${Math.round(red / 28)},${Math.round(green / 28)},${Math.round(blue / 28)}`;
}

function evaluateCellDominance(maps, candidate) {
  const { width, height, data } = maps;
  const angle = candidate.angle;
  const bounds = imageProjectedBounds(width, height, angle);
  const [phaseU, phaseV] = gridPhases(candidate);
  const uLines = enumerateGridValues(
    bounds.minU - candidate.period,
    bounds.maxU + candidate.period,
    phaseU,
    candidate.period,
  );
  const vLines = enumerateGridValues(
    bounds.minV - candidate.period,
    bounds.maxV + candidate.period,
    phaseV,
    candidate.period,
  );
  const cellCount = Math.max(1, (uLines.length - 1) * (vLines.length - 1));
  const stride = Math.max(1, Math.ceil(Math.sqrt(cellCount / 420)));
  const values = [];
  const offsets = [-0.27, 0, 0.27];
  for (let uIndex = 0; uIndex < uLines.length - 1; uIndex += stride) {
    for (let vIndex = 0; vIndex < vLines.length - 1; vIndex += stride) {
      const counts = new Map();
      let samples = 0;
      for (const offsetU of offsets) {
        for (const offsetV of offsets) {
          const u = (uLines[uIndex] + uLines[uIndex + 1]) / 2 + offsetU * candidate.period;
          const v = (vLines[vIndex] + vLines[vIndex + 1]) / 2 + offsetV * candidate.period;
          const point = inverseProjectedPoint(u, v, angle);
          const x = Math.round(point.x);
          const y = Math.round(point.y);
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const key = quantizedColor(data, (y * width + x) * 4);
          counts.set(key, (counts.get(key) || 0) + 1);
          samples += 1;
        }
      }
      if (samples < 6) continue;
      values.push(Math.max(...counts.values()) / samples);
    }
  }
  if (!values.length) return 0;
  values.sort((a, b) => a - b);
  const kept = values.slice(
    Math.floor(values.length * 0.08),
    Math.max(1, Math.ceil(values.length * 0.92)),
  );
  return kept.reduce((sum, value) => sum + value, 0) / kept.length;
}

function evaluateCenterEvidence(maps, candidate) {
  const { width, height, center, centerScale } = maps;
  const angle = candidate.angle;
  const bounds = imageProjectedBounds(width, height, angle);
  const [linePhaseU, linePhaseV] = gridPhases(candidate);
  const centerPhaseU = linePhaseU + candidate.period / 2;
  const centerPhaseV = linePhaseV + candidate.period / 2;
  const uCenters = enumerateGridValues(
    bounds.minU,
    bounds.maxU,
    centerPhaseU,
    candidate.period,
  );
  const vCenters = enumerateGridValues(
    bounds.minV,
    bounds.maxV,
    centerPhaseV,
    candidate.period,
  );
  const totalSites = Math.max(1, uCenters.length * vCenters.length);
  const stride = Math.max(1, Math.ceil(Math.sqrt(totalSites / 520)));
  const radius = clamp(Math.round(candidate.period * 0.13), 1, 4);
  let response = 0;
  let occupied = 0;
  let samples = 0;
  for (let uIndex = 0; uIndex < uCenters.length; uIndex += stride) {
    for (let vIndex = 0; vIndex < vCenters.length; vIndex += stride) {
      const point = inverseProjectedPoint(
        uCenters[uIndex],
        vCenters[vIndex],
        angle,
      );
      if (
        point.x < radius ||
        point.y < radius ||
        point.x >= width - radius ||
        point.y >= height - radius
      ) {
        continue;
      }
      const normalized =
        sampleMap(center, width, height, point.x, point.y, radius) / centerScale;
      response += Math.min(1, normalized);
      if (normalized > 0.58) occupied += 1;
      samples += 1;
    }
  }
  if (!samples) return 0;
  return (response / samples) * 0.48 + (occupied / samples) * 0.52;
}

function estimateBackgroundColor(maps) {
  const { width, height, data } = maps;
  const samples = [[], [], []];
  const bandX = Math.max(2, Math.round(width * 0.055));
  const bandY = Math.max(2, Math.round(height * 0.055));
  const step = Math.max(1, Math.round(Math.min(width, height) / 90));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (
        x >= bandX &&
        x < width - bandX &&
        y >= bandY &&
        y < height - bandY
      ) {
        continue;
      }
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] / 255;
      samples[0].push(data[index] * alpha + 255 * (1 - alpha));
      samples[1].push(data[index + 1] * alpha + 255 * (1 - alpha));
      samples[2].push(data[index + 2] * alpha + 255 * (1 - alpha));
    }
  }
  return samples.map((channel) => quantile(channel, 0.5));
}

function sampleCellAppearance(maps, candidate, centerU, centerV, background) {
  const { width, height, data, center, centerScale } = maps;
  const colors = [];
  const counts = new Map();
  const offsets = [-0.27, 0, 0.27];
  let centerX = 0;
  let centerY = 0;
  for (const offsetU of offsets) {
    for (const offsetV of offsets) {
      const point = inverseProjectedPoint(
        centerU + offsetU * candidate.period,
        centerV + offsetV * candidate.period,
        candidate.angle,
      );
      const x = Math.round(point.x);
      const y = Math.round(point.y);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] / 255;
      const color = [
        data[index] * alpha + 255 * (1 - alpha),
        data[index + 1] * alpha + 255 * (1 - alpha),
        data[index + 2] * alpha + 255 * (1 - alpha),
      ];
      colors.push(color);
      const key = `${Math.round(color[0] / 28)},${Math.round(
        color[1] / 28,
      )},${Math.round(color[2] / 28)}`;
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!offsetU && !offsetV) {
        centerX = point.x;
        centerY = point.y;
      }
    }
  }
  if (colors.length < 6) {
    return { valid: false, dominance: 0, foreground: 0, center: 0 };
  }
  const mean = [0, 1, 2].map(
    (channel) =>
      colors.reduce((sum, color) => sum + color[channel], 0) / colors.length,
  );
  const foreground = clamp(
    Math.hypot(
      mean[0] - background[0],
      mean[1] - background[1],
      mean[2] - background[2],
    ) / 155,
    0,
    1,
  );
  const dominance = Math.max(...counts.values()) / colors.length;
  const radius = clamp(Math.round(candidate.period * 0.13), 1, 4);
  const centerEvidence = clamp(
    sampleMap(center, width, height, centerX, centerY, radius) / centerScale,
    0,
    1,
  );
  return {
    valid: true,
    dominance,
    foreground,
    center: centerEvidence,
  };
}

function sampleCellBoundary(maps, candidate, minU, maxU, minV, maxV) {
  const { gradientScale } = maps;
  const cosine = Math.cos(candidate.angle);
  const sine = Math.sin(candidate.angle);
  const responses = [];
  for (const ratio of [0.22, 0.5, 0.78]) {
    const v = minV + (maxV - minV) * ratio;
    for (const u of [minU, maxU]) {
      const point = inverseProjectedPoint(u, v, candidate.angle);
      responses.push(
        orientedGradientAt(maps, point.x, point.y, cosine, sine, 1) /
          gradientScale,
      );
    }
    const u = minU + (maxU - minU) * ratio;
    for (const vEdge of [minV, maxV]) {
      const point = inverseProjectedPoint(u, vEdge, candidate.angle);
      responses.push(
        orientedGradientAt(maps, point.x, point.y, -sine, cosine, 1) /
          gradientScale,
      );
    }
  }
  if (!responses.length) return 0;
  responses.sort((a, b) => b - a);
  const useful = responses.slice(0, Math.max(4, Math.ceil(responses.length * 0.7)));
  return clamp(
    useful.reduce((sum, value) => sum + Math.min(1, value), 0) /
      useful.length,
    0,
    1,
  );
}

function sampleGridLineScores(maps, candidate, uLines, vLines) {
  const { width, height, gradientScale } = maps;
  const angle = candidate.angle;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const projectedBounds = imageProjectedBounds(width, height, angle);
  const step = Math.max(1.6, candidate.period * 0.2);

  const sampleLine = (fixed, minimum, maximum, isU) => {
    const normalX = isU ? cosine : -sine;
    const normalY = isU ? sine : cosine;
    let response = 0;
    let hits = 0;
    let samples = 0;
    for (
      let moving = minimum + step * 0.5;
      moving <= maximum - step * 0.5;
      moving += step
    ) {
      const point = isU
        ? inverseProjectedPoint(fixed, moving, angle)
        : inverseProjectedPoint(moving, fixed, angle);
      if (
        point.x < 1 ||
        point.y < 1 ||
        point.x >= width - 1 ||
        point.y >= height - 1
      ) {
        continue;
      }
      const normalized = clamp(
        orientedGradientAt(
          maps,
          point.x,
          point.y,
          normalX,
          normalY,
          1,
        ) / gradientScale,
        0,
        1.5,
      );
      response += Math.min(1, normalized);
      if (normalized >= 0.38) hits += 1;
      samples += 1;
    }
    if (samples < 4) return 0;
    return (response / samples) * 0.56 + (hits / samples) * 0.44;
  };

  return {
    u: uLines.map((line) =>
      sampleLine(
        line,
        projectedBounds.minV,
        projectedBounds.maxV,
        true,
      ),
    ),
    v: vLines.map((line) =>
      sampleLine(
        line,
        projectedBounds.minU,
        projectedBounds.maxU,
        false,
      ),
    ),
  };
}

function chooseLineRun(rawScores) {
  if (rawScores.length < 3) return null;
  const scores = smoothAxisScores(rawScores);
  const baseline = quantile(scores, 0.16);
  const high = quantile(scores, 0.82);
  const contrast = high - baseline;
  if (contrast < 0.035) return null;
  const threshold = baseline + contrast * 0.34;
  const strong = scores.map((score) => score >= threshold);

  for (let index = 1; index < strong.length - 1; index += 1) {
    if (
      !strong[index] &&
      strong[index - 1] &&
      strong[index + 1] &&
      scores[index] >= baseline + contrast * 0.12
    ) {
      strong[index] = true;
    }
  }

  const runs = [];
  let start = null;
  for (let index = 0; index <= strong.length; index += 1) {
    if (index < strong.length && strong[index]) {
      if (start === null) start = index;
      continue;
    }
    if (start === null) continue;
    const end = index - 1;
    if (end - start + 1 >= 3) {
      const slice = scores.slice(start, end + 1);
      const mean =
        slice.reduce((sum, value) => sum + value, 0) / slice.length;
      const excess = slice.reduce(
        (sum, value) => sum + Math.max(0, value - baseline),
        0,
      );
      runs.push({
        start,
        end,
        mean,
        contrast,
        score:
          excess *
          (0.72 + Math.sqrt(end - start + 1) * 0.28),
      });
    }
    start = null;
  }
  runs.sort((a, b) => b.score - a.score);
  return runs[0] || null;
}

function robustAxisSupport(values) {
  const useful = values.filter(Number.isFinite);
  if (!useful.length) return 0;
  useful.sort((a, b) => b - a);
  const topCount = Math.max(2, Math.ceil(useful.length * 0.46));
  const top =
    useful.slice(0, topCount).reduce((sum, value) => sum + value, 0) /
    topCount;
  const mean =
    useful.reduce((sum, value) => sum + value, 0) / useful.length;
  return top * 0.72 + mean * 0.28;
}

function smoothAxisScores(scores) {
  return scores.map((score, index) => {
    const before = scores[Math.max(0, index - 1)];
    const after = scores[Math.min(scores.length - 1, index + 1)];
    return before * 0.22 + score * 0.56 + after * 0.22;
  });
}

function chooseSupportInterval(rawScores) {
  if (!rawScores.length) return { start: 0, end: 0 };
  const scores = smoothAxisScores(rawScores);
  const edgeCount = Math.max(2, Math.ceil(scores.length * 0.14));
  const edgeScores = [
    ...scores.slice(0, edgeCount),
    ...scores.slice(-edgeCount),
  ];
  const baseline = quantile(edgeScores, 0.5);
  const high = quantile(scores, 0.84);
  const threshold = baseline + Math.max(0.025, high - baseline) * 0.28;
  let weights = scores.map((score) => Math.max(0, score - threshold));
  let total = weights.reduce((sum, value) => sum + value, 0);
  if (total < 0.02) {
    weights = scores.map((score) => Math.max(0, score - baseline * 0.92));
    total = weights.reduce((sum, value) => sum + value, 0);
  }
  if (total < 0.02) return { start: 0, end: scores.length - 1 };

  let cumulative = 0;
  let start = 0;
  let end = scores.length - 1;
  for (let index = 0; index < weights.length; index += 1) {
    cumulative += weights[index];
    if (cumulative >= total * 0.018) {
      start = index;
      break;
    }
  }
  cumulative = 0;
  for (let index = weights.length - 1; index >= 0; index -= 1) {
    cumulative += weights[index];
    if (cumulative >= total * 0.018) {
      end = index;
      break;
    }
  }
  while (start > 0 && scores[start - 1] >= threshold * 0.72) start -= 1;
  while (end < scores.length - 1 && scores[end + 1] >= threshold * 0.72) {
    end += 1;
  }
  return {
    start,
    end: Math.max(start, end),
    scores,
    baseline,
    threshold,
  };
}

function chooseSupportComponent(cells, period, imageArea) {
  const rows = cells.length;
  const cols = cells[0]?.length || 0;
  if (!rows || !cols) return null;
  const values = cells
    .flat()
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (values.length < 8) return null;
  const baseline = quantile(values, 0.3);
  const high = quantile(values, 0.82);
  const threshold = baseline + Math.max(0.035, high - baseline) * 0.5;
  let mask = cells.map((row) =>
    row.map((value) => Number.isFinite(value) && value >= threshold),
  );

  for (let pass = 0; pass < 1; pass += 1) {
    const next = mask.map((row) => [...row]);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (mask[row][col] || !Number.isFinite(cells[row][col])) continue;
        let neighbors = 0;
        for (let offsetRow = -1; offsetRow <= 1; offsetRow += 1) {
          for (let offsetCol = -1; offsetCol <= 1; offsetCol += 1) {
            if (!offsetRow && !offsetCol) continue;
            const nextRow = row + offsetRow;
            const nextCol = col + offsetCol;
            if (
              nextRow >= 0 &&
              nextCol >= 0 &&
              nextRow < rows &&
              nextCol < cols &&
              mask[nextRow][nextCol]
            ) {
              neighbors += 1;
            }
          }
        }
        if (
          neighbors >= 5 &&
          cells[row][col] >= baseline * 0.94
        ) {
          next[row][col] = true;
        }
      }
    }
    mask = next;
  }

  const visited = Array.from({ length: rows }, () => new Uint8Array(cols));
  const components = [];
  for (let startRow = 0; startRow < rows; startRow += 1) {
    for (let startCol = 0; startCol < cols; startCol += 1) {
      if (!mask[startRow][startCol] || visited[startRow][startCol]) continue;
      const queue = [[startRow, startCol]];
      visited[startRow][startCol] = 1;
      let head = 0;
      let count = 0;
      let weight = 0;
      let minRow = startRow;
      let maxRow = startRow;
      let minCol = startCol;
      let maxCol = startCol;
      while (head < queue.length) {
        const [row, col] = queue[head];
        head += 1;
        count += 1;
        weight += Math.max(0.01, cells[row][col] - baseline);
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
        minCol = Math.min(minCol, col);
        maxCol = Math.max(maxCol, col);
        for (let offsetRow = -1; offsetRow <= 1; offsetRow += 1) {
          for (let offsetCol = -1; offsetCol <= 1; offsetCol += 1) {
            if (!offsetRow && !offsetCol) continue;
            const nextRow = row + offsetRow;
            const nextCol = col + offsetCol;
            if (
              nextRow < 0 ||
              nextCol < 0 ||
              nextRow >= rows ||
              nextCol >= cols ||
              !mask[nextRow][nextCol] ||
              visited[nextRow][nextCol]
            ) {
              continue;
            }
            visited[nextRow][nextCol] = 1;
            queue.push([nextRow, nextCol]);
          }
        }
      }
      const boxCells = (maxCol - minCol + 1) * (maxRow - minRow + 1);
      const coverage = (boxCells * period * period) / Math.max(1, imageArea);
      const density = count / Math.max(1, boxCells);
      const coveragePrior =
        coverage >= 0.5
          ? 1
          : 0.58 + clamp(coverage / 0.5, 0, 1) * 0.42;
      components.push({
        startCol: minCol,
        endCol: maxCol,
        startRow: minRow,
        endRow: maxRow,
        coverage,
        density,
        score: weight * (0.22 + density ** 1.7 * 0.78) * coveragePrior,
      });
    }
  }
  components.sort((a, b) => b.score - a.score);
  return components[0] || null;
}

function frameCoverage(range, period, imageArea) {
  return (
    ((range.endCol - range.startCol + 1) *
      period *
      (range.endRow - range.startRow + 1) *
      period) /
    Math.max(1, imageArea)
  );
}

function normalizedFrameRange(range, cols, rows) {
  if (!range) return null;
  const startCol = clamp(Math.round(range.startCol), 0, Math.max(0, cols - 1));
  const endCol = clamp(Math.round(range.endCol), startCol, Math.max(0, cols - 1));
  const startRow = clamp(Math.round(range.startRow), 0, Math.max(0, rows - 1));
  const endRow = clamp(Math.round(range.endRow), startRow, Math.max(0, rows - 1));
  if (endCol - startCol + 1 < 2 || endRow - startRow + 1 < 2) return null;
  return { startCol, endCol, startRow, endRow };
}

function axisScoresForCells(cells) {
  const rows = cells.length;
  const cols = cells[0]?.length || 0;
  const columnScores = [];
  for (let col = 0; col < cols; col += 1) {
    columnScores.push(
      robustAxisSupport(cells.map((row) => row[col]).filter(Number.isFinite)),
    );
  }
  const rowScores = cells.map((row) =>
    robustAxisSupport(row.filter(Number.isFinite)),
  );
  return { columnScores, rowScores };
}

function expandRangeToCoverage(
  initialRange,
  columnScores,
  rowScores,
  period,
  imageArea,
  targetCoverage = 0.5,
) {
  const range = { ...initialRange };
  let coverage = frameCoverage(range, period, imageArea);
  let guard = 0;
  while (coverage < targetCoverage && guard < columnScores.length + rowScores.length) {
    const choices = [
      range.startCol > 0
        ? {
            axis: "col",
            side: "start",
            score: columnScores[range.startCol - 1],
          }
        : null,
      range.endCol < columnScores.length - 1
        ? {
            axis: "col",
            side: "end",
            score: columnScores[range.endCol + 1],
          }
        : null,
      range.startRow > 0
        ? {
            axis: "row",
            side: "start",
            score: rowScores[range.startRow - 1],
          }
        : null,
      range.endRow < rowScores.length - 1
        ? {
            axis: "row",
            side: "end",
            score: rowScores[range.endRow + 1],
          }
        : null,
    ]
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    const choice = choices[0];
    if (!choice) break;
    if (choice.axis === "col" && choice.side === "start") range.startCol -= 1;
    else if (choice.axis === "col") range.endCol += 1;
    else if (choice.side === "start") range.startRow -= 1;
    else range.endRow += 1;
    coverage = frameCoverage(range, period, imageArea);
    guard += 1;
  }
  return range;
}

function trimRangeByMarginalEvidence(
  cells,
  initialRange,
  period,
  imageArea,
  targetCoverage = 0.5,
) {
  const range = { ...initialRange };
  const finiteValues = cells.flat().filter(Number.isFinite);
  if (finiteValues.length < 8) return range;
  const baseline = quantile(finiteValues, 0.3);
  const weightAt = (row, col) =>
    Math.max(0, (cells[row]?.[col] ?? baseline) - baseline);
  const edgeWeight = (side) => {
    const weights = [];
    if (side === "left" || side === "right") {
      const col = side === "left" ? range.startCol : range.endCol;
      for (let row = range.startRow; row <= range.endRow; row += 1) {
        weights.push(weightAt(row, col));
      }
    } else {
      const row = side === "top" ? range.startRow : range.endRow;
      for (let col = range.startCol; col <= range.endCol; col += 1) {
        weights.push(weightAt(row, col));
      }
    }
    return weights.length
      ? weights.reduce((sum, value) => sum + value, 0) / weights.length
      : 0;
  };
  const interiorWeight = () => {
    const weights = [];
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      for (let col = range.startCol; col <= range.endCol; col += 1) {
        weights.push(weightAt(row, col));
      }
    }
    return weights.length
      ? weights.reduce((sum, value) => sum + value, 0) / weights.length
      : 0;
  };

  let guard = 0;
  while (guard < cells.length + (cells[0]?.length || 0)) {
    const insideMean = Math.max(0.01, interiorWeight());
    const choices = [
      range.endCol - range.startCol + 1 > 2
        ? { side: "left", loss: edgeWeight("left") / insideMean }
        : null,
      range.endCol - range.startCol + 1 > 2
        ? { side: "right", loss: edgeWeight("right") / insideMean }
        : null,
      range.endRow - range.startRow + 1 > 2
        ? { side: "top", loss: edgeWeight("top") / insideMean }
        : null,
      range.endRow - range.startRow + 1 > 2
        ? { side: "bottom", loss: edgeWeight("bottom") / insideMean }
        : null,
    ]
      .filter(Boolean)
      .map((choice) => {
        const next = { ...range };
        if (choice.side === "left") next.startCol += 1;
        else if (choice.side === "right") next.endCol -= 1;
        else if (choice.side === "top") next.startRow += 1;
        else next.endRow -= 1;
        return {
          ...choice,
          next,
          coverage: frameCoverage(next, period, imageArea),
        };
      })
      .filter((choice) => choice.coverage >= targetCoverage)
      .sort((a, b) => a.loss - b.loss);
    const choice = choices[0];
    if (!choice || choice.loss >= 0.68) break;
    Object.assign(range, choice.next);
    guard += 1;
  }
  return range;
}

function nearestLineIndex(lines, value) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let index = 0; index < lines.length; index += 1) {
    const distance = Math.abs(lines[index] - value);
    if (distance < bestDistance) {
      bestIndex = index;
      bestDistance = distance;
    }
  }
  return bestIndex;
}

function consensusFrameRange(candidate, uLines, vLines) {
  const bounds = candidate.consensus?.bounds;
  const phase = candidate.consensus?.phase;
  if (!bounds || !phase) return null;
  const centerOffset = candidate.source === "center" ? candidate.period / 2 : 0;
  const minU =
    phase[0] + bounds.minI * candidate.period - centerOffset;
  const maxU =
    phase[0] + bounds.maxI * candidate.period + centerOffset;
  const minV =
    phase[1] + bounds.minJ * candidate.period - centerOffset;
  const maxV =
    phase[1] + bounds.maxJ * candidate.period + centerOffset;
  const startLineU = nearestLineIndex(uLines, minU);
  const endLineU = nearestLineIndex(uLines, maxU);
  const startLineV = nearestLineIndex(vLines, minV);
  const endLineV = nearestLineIndex(vLines, maxV);
  return normalizedFrameRange(
    {
      startCol: Math.min(startLineU, endLineU),
      endCol: Math.max(startLineU, endLineU) - 1,
      startRow: Math.min(startLineV, endLineV),
      endRow: Math.max(startLineV, endLineV) - 1,
    },
    uLines.length - 1,
    vLines.length - 1,
  );
}

function matrixFrameStats(matrix, range) {
  const inside = [];
  const ring = [];
  const rows = matrix.length;
  const cols = matrix[0]?.length || 0;
  for (
    let row = Math.max(0, range.startRow - 1);
    row <= Math.min(rows - 1, range.endRow + 1);
    row += 1
  ) {
    for (
      let col = Math.max(0, range.startCol - 1);
      col <= Math.min(cols - 1, range.endCol + 1);
      col += 1
    ) {
      const value = matrix[row]?.[col];
      if (!Number.isFinite(value)) continue;
      if (
        row >= range.startRow &&
        row <= range.endRow &&
        col >= range.startCol &&
        col <= range.endCol
      ) {
        inside.push(value);
      } else {
        ring.push(value);
      }
    }
  }
  const mean = (values) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  return {
    inside: mean(inside),
    ring: mean(ring),
    contrast: mean(inside) - mean(ring),
  };
}

function supportRetention(matrix, range) {
  const values = matrix.flat().filter(Number.isFinite);
  if (!values.length) return 0;
  const baseline = quantile(values, 0.3);
  let total = 0;
  let retained = 0;
  for (let row = 0; row < matrix.length; row += 1) {
    for (let col = 0; col < (matrix[row]?.length || 0); col += 1) {
      if (!Number.isFinite(matrix[row][col])) continue;
      const weight = Math.max(0, matrix[row][col] - baseline);
      total += weight;
      if (
        row >= range.startRow &&
        row <= range.endRow &&
        col >= range.startCol &&
        col <= range.endCol
      ) {
        retained += weight;
      }
    }
  }
  return total > 0 ? retained / total : 0;
}

function axisRangeStats(scores, start, end) {
  const values = scores.filter(Number.isFinite);
  if (!values.length) {
    return { inside: 0, ring: 0, contrast: 0, retention: 0 };
  }
  const baseline = quantile(values, 0.3);
  const inside = scores
    .slice(start, end + 1)
    .filter(Number.isFinite);
  const ring = [
    start > 0 ? scores[start - 1] : null,
    end < scores.length - 1 ? scores[end + 1] : null,
  ].filter(Number.isFinite);
  const mean = (items, fallback = 0) =>
    items.length
      ? items.reduce((sum, value) => sum + value, 0) / items.length
      : fallback;
  const totalWeight = values.reduce(
    (sum, value) => sum + Math.max(0, value - baseline),
    0,
  );
  const retainedWeight = inside.reduce(
    (sum, value) => sum + Math.max(0, value - baseline),
    0,
  );
  const insideMean = mean(inside);
  const ringMean = mean(ring, baseline);
  return {
    inside: insideMean,
    ring: ringMean,
    contrast: insideMean - ringMean,
    retention: totalWeight > 0 ? retainedWeight / totalWeight : 0,
  };
}

function evaluateAxisHypothesis(
  hypothesis,
  axis,
  axisProfiles,
  lineScores,
) {
  const isColumn = axis === "col";
  const start = isColumn
    ? hypothesis.range.startCol
    : hypothesis.range.startRow;
  const end = isColumn ? hypothesis.range.endCol : hypothesis.range.endRow;
  const profileKey = isColumn ? "columnScores" : "rowScores";
  const combined = axisRangeStats(
    axisProfiles.combined[profileKey],
    start,
    end,
  );
  const center = axisRangeStats(
    axisProfiles.center[profileKey],
    start,
    end,
  );
  const foreground = axisRangeStats(
    axisProfiles.foreground[profileKey],
    start,
    end,
  );
  const boundary = axisRangeStats(
    axisProfiles.boundary[profileKey],
    start,
    end,
  );
  const axisLineScores = isColumn ? lineScores.u : lineScores.v;
  const endpoints = [
    axisLineScores[start],
    axisLineScores[end + 1],
  ].filter(Number.isFinite);
  const endpointMean = endpoints.length
    ? endpoints.reduce((sum, value) => sum + value, 0) / endpoints.length
    : 0;
  const methodPrior =
    hypothesis.method === "combined-component"
      ? 0.055
      : hypothesis.method === "consensus"
        ? 0.065
        : hypothesis.method === "boundary-component"
          ? 0.025
          : 0;
  return {
    hypothesis,
    score:
      combined.inside * 0.32 +
      Math.max(0, combined.contrast) * 0.68 +
      Math.max(0, center.contrast) * 0.3 +
      Math.max(0, foreground.contrast) * 0.22 +
      Math.max(0, boundary.contrast) * 0.2 +
      combined.retention * 0.2 +
      endpointMean * 0.34 +
      methodPrior,
    diagnostics: {
      combined,
      center,
      foreground,
      boundary,
      endpointMean,
    },
  };
}

function detectOuterBandFrame(axisProfiles, period, imageArea) {
  const findTransitions = (scores) => {
    if (scores.length < 8) return null;
    const startLimit = Math.max(1, Math.floor(scores.length * 0.28));
    const endLimit = Math.min(
      scores.length - 2,
      Math.ceil(scores.length * 0.72),
    );
    let start = null;
    for (let index = 0; index <= startLimit; index += 1) {
      const drop = scores[index] - scores[index + 1];
      if (!start || drop > start.drop) start = { index, drop };
    }
    let end = null;
    for (let index = endLimit; index < scores.length; index += 1) {
      const drop = scores[index] - scores[index - 1];
      if (!end || drop > end.drop) end = { index, drop };
    }
    if (!start || !end || start.drop < 0.18 || end.drop < 0.18) return null;
    if (end.index - start.index < scores.length * 0.58) return null;
    const symmetry =
      Math.min(start.drop, end.drop) /
      Math.max(0.001, Math.max(start.drop, end.drop));
    if (symmetry < 0.42) return null;
    return {
      start: start.index + 1,
      end: end.index - 1,
      confidence:
        clamp((Math.min(start.drop, end.drop) - 0.18) / 0.34, 0, 1) *
        symmetry,
    };
  };

  const columns = findTransitions(
    axisProfiles.foreground.columnScores,
  );
  const rows = findTransitions(axisProfiles.foreground.rowScores);
  if (!columns || !rows) return null;
  const range = {
    startCol: columns.start,
    endCol: columns.end,
    startRow: rows.start,
    endRow: rows.end,
  };
  if (frameCoverage(range, period, imageArea) < 0.5) return null;
  return {
    range,
    transitionConfidence: Math.sqrt(
      columns.confidence * rows.confidence,
    ),
  };
}

function evaluateFrameHypothesis(
  hypothesis,
  cellMaps,
  lineScores,
  period,
  imageArea,
) {
  const range = hypothesis.range;
  const coverage = frameCoverage(range, period, imageArea);
  const combined = matrixFrameStats(cellMaps.combined, range);
  const center = matrixFrameStats(cellMaps.center, range);
  const foreground = matrixFrameStats(cellMaps.foreground, range);
  const boundary = matrixFrameStats(cellMaps.boundary, range);
  const retention = supportRetention(cellMaps.combined, range);
  const uSlice = lineScores.u.slice(range.startCol, range.endCol + 2);
  const vSlice = lineScores.v.slice(range.startRow, range.endRow + 2);
  const lineMean = [...uSlice, ...vSlice].length
    ? [...uSlice, ...vSlice].reduce((sum, value) => sum + value, 0) /
      [...uSlice, ...vSlice].length
    : 0;
  const lineEdges = [
    lineScores.u[range.startCol],
    lineScores.u[range.endCol + 1],
    lineScores.v[range.startRow],
    lineScores.v[range.endRow + 1],
  ].filter(Number.isFinite);
  const edgeMean = lineEdges.length
    ? lineEdges.reduce((sum, value) => sum + value, 0) / lineEdges.length
    : 0;
  const coveragePrior =
    coverage < 0.5
      ? clamp(coverage / 0.5, 0, 1)
      : coverage > 1.03
        ? clamp(1.03 / coverage, 0, 1)
        : 1;
  const compactness = clamp((1.08 - coverage) / 0.58, 0, 1);
  const contrast =
    Math.max(0, combined.contrast) * 0.92 +
    Math.max(0, center.contrast) * 0.54 +
    Math.max(0, foreground.contrast) * 0.34 +
    Math.max(0, boundary.contrast) * 0.28;
  const methodPrior =
    hypothesis.method === "combined-component"
      ? 0.055
      : hypothesis.method === "consensus"
        ? 0.105
        : hypothesis.method === "outer-band-transition"
          ? 0.78 + (hypothesis.transitionConfidence || 0) * 0.2
        : hypothesis.method === "axis-ensemble"
          ? 0.03
          : 0;
  return {
    ...hypothesis,
    coverage,
    score:
      coveragePrior * 0.72 +
      combined.inside * 0.44 +
      contrast * 0.82 +
      retention * 0.18 +
      lineMean * 0.22 +
      edgeMean * 0.38 +
      compactness * 0.08 +
      methodPrior,
    diagnostics: {
      coveragePrior,
      combined,
      center,
      foreground,
      boundary,
      retention,
      lineMean,
      edgeMean,
    },
  };
}

function deriveCandidateFrame(maps, candidate) {
  const { width, height } = maps;
  const period = candidate.period;
  const [linePhaseU, linePhaseV] = gridPhases(candidate);
  const imageBounds = imageProjectedBounds(width, height, candidate.angle);
  const uLines = enumerateGridValues(
    imageBounds.minU - period,
    imageBounds.maxU + period,
    linePhaseU,
    period,
  );
  const vLines = enumerateGridValues(
    imageBounds.minV - period,
    imageBounds.maxV + period,
    linePhaseV,
    period,
  );
  const background = estimateBackgroundColor(maps);
  const cells = Array.from({ length: Math.max(0, vLines.length - 1) }, () =>
    Array(Math.max(0, uLines.length - 1)).fill(null),
  );
  const centerCells = cells.map((row) => row.map(() => null));
  const foregroundCells = cells.map((row) => row.map(() => null));
  const boundaryCells = cells.map((row) => row.map(() => null));

  for (let row = 0; row < vLines.length - 1; row += 1) {
    for (let col = 0; col < uLines.length - 1; col += 1) {
      const minU = uLines[col];
      const maxU = uLines[col + 1];
      const minV = vLines[row];
      const maxV = vLines[row + 1];
      const centerPoint = inverseProjectedPoint(
        (minU + maxU) / 2,
        (minV + maxV) / 2,
        candidate.angle,
      );
      if (
        centerPoint.x < 0 ||
        centerPoint.y < 0 ||
        centerPoint.x >= width ||
        centerPoint.y >= height
      ) {
        continue;
      }
      const appearance = sampleCellAppearance(
        maps,
        candidate,
        (minU + maxU) / 2,
        (minV + maxV) / 2,
        background,
      );
      if (!appearance.valid) continue;
      const boundary = sampleCellBoundary(
        maps,
        candidate,
        minU,
        maxU,
        minV,
        maxV,
      );
      const structure = Math.max(boundary * 0.92, appearance.center);
      const foreground =
        appearance.foreground * (0.56 + appearance.dominance * 0.44);
      centerCells[row][col] = appearance.center;
      foregroundCells[row][col] = foreground;
      boundaryCells[row][col] = boundary;
      cells[row][col] = clamp(
        structure * 0.72 +
          foreground * 0.38 +
          Math.min(structure, foreground) * 0.24 +
          appearance.dominance * 0.04,
        0,
        1,
      );
    }
  }

  const imageArea = width * height;
  const cellMaps = {
    combined: cells,
    center: centerCells,
    foreground: foregroundCells,
    boundary: boundaryCells,
  };
  const axisProfiles = {
    combined: axisScoresForCells(cells),
    center: axisScoresForCells(centerCells),
    foreground: axisScoresForCells(foregroundCells),
    boundary: axisScoresForCells(boundaryCells),
  };
  const combinedAxes = axisProfiles.combined;
  const columnRange = chooseSupportInterval(combinedAxes.columnScores);
  const rowRange = chooseSupportInterval(combinedAxes.rowScores);
  const lineScores = sampleGridLineScores(maps, candidate, uLines, vLines);
  const hypotheses = [];
  const addHypothesis = (
    method,
    range,
    sourceMap = cells,
    metadata = {},
  ) => {
    const normalized = normalizedFrameRange(
      range,
      uLines.length - 1,
      vLines.length - 1,
    );
    if (!normalized) return;
    const key = `${normalized.startCol}:${normalized.endCol}:${normalized.startRow}:${normalized.endRow}`;
    if (hypotheses.some((item) => item.key === key)) return;
    hypotheses.push({
      method,
      range: normalized,
      key,
      sourceMap,
      ...metadata,
    });
  };

  const addComponentHypotheses = (method, matrix) => {
    const axes = axisScoresForCells(matrix);
    const component = chooseSupportComponent(matrix, period, imageArea);
    if (!component) return;
    const expanded = expandRangeToCoverage(
      component,
      axes.columnScores,
      axes.rowScores,
      period,
      imageArea,
    );
    addHypothesis(`${method}-component`, expanded, matrix);
    addHypothesis(
      `${method}-trimmed`,
      trimRangeByMarginalEvidence(
        matrix,
        expanded,
        period,
        imageArea,
      ),
      matrix,
    );
  };

  addComponentHypotheses("combined", cells);
  addComponentHypotheses("center", centerCells);
  addComponentHypotheses("foreground", foregroundCells);
  addComponentHypotheses("boundary", boundaryCells);
  addHypothesis(
    "axis-support",
    expandRangeToCoverage(
      {
        startCol: columnRange.start,
        endCol: columnRange.end,
        startRow: rowRange.start,
        endRow: rowRange.end,
      },
      combinedAxes.columnScores,
      combinedAxes.rowScores,
      period,
      imageArea,
    ),
  );

  const consensusRange = consensusFrameRange(candidate, uLines, vLines);
  if (consensusRange) {
    addHypothesis(
      "consensus",
      expandRangeToCoverage(
        consensusRange,
        combinedAxes.columnScores,
        combinedAxes.rowScores,
        period,
        imageArea,
      ),
    );
  }

  const uRun = chooseLineRun(lineScores.u);
  const vRun = chooseLineRun(lineScores.v);
  if (uRun && vRun) {
    addHypothesis("line-run", {
      startCol: uRun.start,
      endCol: uRun.end - 1,
      startRow: vRun.start,
      endRow: vRun.end - 1,
    });
  }

  const outerBandFrame = detectOuterBandFrame(
    axisProfiles,
    period,
    imageArea,
  );
  if (outerBandFrame) {
    addHypothesis(
      "outer-band-transition",
      outerBandFrame.range,
      cells,
      {
        transitionConfidence: outerBandFrame.transitionConfidence,
      },
    );
  }

  const baseHypotheses = [...hypotheses];
  const columnChoice = baseHypotheses
    .map((hypothesis) =>
      evaluateAxisHypothesis(
        hypothesis,
        "col",
        axisProfiles,
        lineScores,
      ),
    )
    .sort((a, b) => b.score - a.score)[0];
  const rowChoice = baseHypotheses
    .map((hypothesis) =>
      evaluateAxisHypothesis(
        hypothesis,
        "row",
        axisProfiles,
        lineScores,
      ),
    )
    .sort((a, b) => b.score - a.score)[0];
  if (columnChoice && rowChoice) {
    addHypothesis("axis-ensemble", {
      startCol: columnChoice.hypothesis.range.startCol,
      endCol: columnChoice.hypothesis.range.endCol,
      startRow: rowChoice.hypothesis.range.startRow,
      endRow: rowChoice.hypothesis.range.endRow,
    });
  }

  const evaluated = hypotheses
    .map((hypothesis) =>
      evaluateFrameHypothesis(
        hypothesis,
        cellMaps,
        lineScores,
        period,
        imageArea,
      ),
    )
    .sort((a, b) => b.score - a.score);
  const selected =
    evaluated[0] || {
      method: "fallback",
      coverage: 1,
      score: 0,
      range: {
        startCol: 0,
        endCol: Math.max(1, uLines.length - 2),
        startRow: 0,
        endRow: Math.max(1, vLines.length - 2),
      },
    };
  const { startCol, endCol, startRow, endRow } = selected.range;
  const coverage = selected.coverage;

  const minU = uLines[startCol];
  const maxU = uLines[endCol + 1];
  const minV = vLines[startRow];
  const maxV = vLines[endRow + 1];
  const corners = [
    inverseProjectedPoint(minU, minV, candidate.angle),
    inverseProjectedPoint(maxU, minV, candidate.angle),
    inverseProjectedPoint(maxU, maxV, candidate.angle),
    inverseProjectedPoint(minU, maxV, candidate.angle),
  ];
  return {
    corners,
    coverage,
    cols: Math.max(2, endCol - startCol + 1),
    rows: Math.max(2, endRow - startRow + 1),
    minU,
    maxU,
    minV,
    maxV,
    method: selected.method,
    frameScore: selected.score,
    support: {
      columnScores: combinedAxes.columnScores,
      rowScores: combinedAxes.rowScores,
      columnRange: { start: startCol, end: endCol },
      rowRange: { start: startRow, end: endRow },
      hypotheses: evaluated.map((hypothesis) => ({
        method: hypothesis.method,
        range: hypothesis.range,
        coverage: hypothesis.coverage,
        score: hypothesis.score,
        diagnostics: hypothesis.diagnostics,
      })),
      lineScores,
      axisProfiles,
    },
  };
}

function evaluateCandidate(maps, candidate, minimumPeriod) {
  const refinedCandidate = refineCandidatePhases(maps, candidate);
  const lineContinuity = evaluateLineContinuity(maps, refinedCandidate);
  const subdivisionEvidence = evaluateSubdivisionEvidence(
    maps,
    refinedCandidate,
    lineContinuity,
  );
  const cellDominance = evaluateCellDominance(maps, refinedCandidate);
  const centerEvidence = evaluateCenterEvidence(maps, refinedCandidate);
  const scoredCenterEvidence =
    centerEvidence * (refinedCandidate.source === "center" ? 1 : 0.64);
  const frame = deriveCandidateFrame(maps, refinedCandidate);
  const coverage = frame.coverage;
  const coveragePrior =
    coverage < 0.5
      ? clamp(coverage / 0.5, 0, 1)
      : coverage > 1.35
        ? clamp(1.35 / coverage, 0, 1)
        : 1;
  const score =
    scoreLatticeEvidence({
      period: refinedCandidate.period,
      minimumPeriod,
      pointConsensus: refinedCandidate.consensus.concentration,
      explainedWeight: refinedCandidate.consensus.explainedWeight,
      siteOccupancy: refinedCandidate.consensus.siteOccupancy,
      cellDominance,
      lineContinuity,
      centerEvidence: scoredCenterEvidence,
    }) +
    refinedCandidate.consensus.score * 0.3 +
    coveragePrior * 0.28 -
    subdivisionEvidence * 0.62;
  return {
    ...refinedCandidate,
    angle: refinedCandidate.angle,
    phases: gridPhases(refinedCandidate),
    frame,
    metrics: {
      pointConsensus: refinedCandidate.consensus.concentration,
      explainedWeight: refinedCandidate.consensus.explainedWeight,
      siteOccupancy: refinedCandidate.consensus.siteOccupancy,
      cellDominance,
      lineContinuity,
      centerEvidence,
      subdivisionEvidence,
      coverage,
      coveragePrior,
    },
    score,
  };
}

function distinctResults(candidates, maximum = 5) {
  const results = [];
  for (const candidate of candidates) {
    const duplicate = results.some((existing) => {
      const periodRatio =
        Math.max(existing.period, candidate.period) /
        Math.max(1e-6, Math.min(existing.period, candidate.period));
      const angleDifference = Math.abs(
        normalizeDisplayAngle(existing.angle - candidate.angle),
      );
      return (
        periodRatio < 1.09 &&
        angleDifference < radians(3) &&
        Math.abs(existing.frame.cols - candidate.frame.cols) <= 1 &&
        Math.abs(existing.frame.rows - candidate.frame.rows) <= 1
      );
    });
    if (duplicate) continue;
    results.push(candidate);
    if (results.length >= maximum) break;
  }
  return results;
}

export async function analyzeHybridLattice(imageData, options = {}) {
  const startedAt = performance.now();
  const maps = buildFeatureMaps(imageData);
  const pointsBySource = {
    corner: selectFeaturePoints(maps.corner, maps.width, maps.height, {
      maximum: options.maximumPoints || 1650,
      quantileRatio: 0.86,
      border: 3,
    }),
    center: selectFeaturePoints(maps.center, maps.width, maps.height, {
      maximum: options.maximumPoints || 1650,
      quantileRatio: 0.9,
      border: 6,
    }),
  };
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const minimumPeriod = Math.max(4, Number(options.minimumPeriod) || 5);
  const maximumPeriod = Math.min(
    Number(options.maximumPeriod) || 64,
    Math.max(minimumPeriod + 1, Math.min(maps.width, maps.height) / 3.4),
  );
  const seeds = preliminaryCandidates(pointsBySource, maps, {
    minimumPeriod,
    maximumPeriod,
  });
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const pool = expandCandidatePool(
    seeds,
    pointsBySource,
    minimumPeriod,
    maximumPeriod,
  );
  const evaluated = [];
  for (let index = 0; index < pool.length; index += 1) {
    evaluated.push(evaluateCandidate(maps, pool[index], minimumPeriod));
    if (index % 8 === 7) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  }
  evaluated.sort((a, b) => b.score - a.score);
  const candidates = distinctResults(evaluated, options.maximumResults || 5);
  const best = candidates[0] || null;
  const second = candidates[1] || best;
  const scoreGap =
    best && second
      ? clamp((best.score - second.score) / Math.max(0.01, Math.abs(best.score)), 0, 1)
      : 0;
  return {
    candidates,
    confidence: best
      ? clamp(
          0.24 +
            scoreGap * 1.7 +
            best.metrics.coveragePrior * 0.16 +
            best.metrics.siteOccupancy * 0.18,
          0.18,
          0.96,
        )
      : 0,
    featureCounts: {
      corner: pointsBySource.corner.length,
      center: pointsBySource.center.length,
    },
    elapsedMs: performance.now() - startedAt,
  };
}

export function makeAnalysisCanvas(image, crop, maximumSide = 560) {
  const sourceWidth = Math.max(
    2,
    Math.min(image.naturalWidth - crop.left, crop.width),
  );
  const sourceHeight = Math.max(
    2,
    Math.min(image.naturalHeight - crop.top, crop.height),
  );
  const scale = Math.min(1, maximumSide / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(sourceWidth * scale));
  canvas.height = Math.max(2, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.left,
    crop.top,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return {
    canvas,
    imageData: context.getImageData(0, 0, canvas.width, canvas.height),
    scale,
  };
}

export function drawGridOverlay(
  context,
  result,
  width,
  height,
  {
    lineColor = "#ffffff",
    edgeColor = "rgba(0, 0, 0, 0.92)",
    frameColor = "#ffcf48",
    lineWidth = 0.8,
    showFrame = true,
  } = {},
) {
  if (!result) return;
  const drawPath = (color, widthValue) => {
    context.save();
    context.strokeStyle = color;
    context.lineWidth = widthValue;
    context.lineCap = "butt";
    context.beginPath();
    if (result.phases && Number.isFinite(result.period)) {
      const angle = result.angle || 0;
      const bounds = imageProjectedBounds(width, height, angle);
      const [phaseU, phaseV] = result.phases;
      for (const u of enumerateGridValues(bounds.minU, bounds.maxU, phaseU, result.period)) {
        const start = inverseProjectedPoint(u, bounds.minV - result.period, angle);
        const end = inverseProjectedPoint(u, bounds.maxV + result.period, angle);
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
      }
      for (const v of enumerateGridValues(bounds.minV, bounds.maxV, phaseV, result.period)) {
        const start = inverseProjectedPoint(bounds.minU - result.period, v, angle);
        const end = inverseProjectedPoint(bounds.maxU + result.period, v, angle);
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
      }
    } else if (result.frame && result.cols && result.rows) {
      const points = result.frame;
      const interpolate = (left, right, ratio) => ({
        x: left.x + (right.x - left.x) * ratio,
        y: left.y + (right.y - left.y) * ratio,
      });
      for (let col = 0; col <= result.cols; col += 1) {
        const ratio = col / result.cols;
        const top = interpolate(points[0], points[1], ratio);
        const bottom = interpolate(points[3], points[2], ratio);
        context.moveTo(top.x * width, top.y * height);
        context.lineTo(bottom.x * width, bottom.y * height);
      }
      for (let row = 0; row <= result.rows; row += 1) {
        const ratio = row / result.rows;
        const left = interpolate(points[0], points[3], ratio);
        const right = interpolate(points[1], points[2], ratio);
        context.moveTo(left.x * width, left.y * height);
        context.lineTo(right.x * width, right.y * height);
      }
    }
    context.stroke();
    context.restore();
  };

  drawPath(edgeColor, lineWidth + 1.7);
  drawPath(lineColor, lineWidth);

  const corners = result.frame?.corners || result.frame;
  if (showFrame && Array.isArray(corners) && corners.length === 4) {
    context.save();
    context.strokeStyle = frameColor;
    context.lineWidth = 2.2;
    context.setLineDash([7, 4]);
    context.beginPath();
    corners.forEach((point, index) => {
      const x = result.frame?.corners ? point.x : point.x * width;
      const y = result.frame?.corners ? point.y : point.y * height;
      if (!index) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    const first = corners[0];
    context.lineTo(
      result.frame?.corners ? first.x : first.x * width,
      result.frame?.corners ? first.y : first.y * height,
    );
    context.stroke();
    context.restore();
  }
}

export const formatAngle = (angle) =>
  `${((normalizeDisplayAngle(angle) * 180) / Math.PI).toFixed(1)}°`;
