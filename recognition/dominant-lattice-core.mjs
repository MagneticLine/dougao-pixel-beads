// Shared square-lattice scoring primitives for the app and recognition lab.
const HALF_TURN = Math.PI;
const QUARTER_TURN = Math.PI / 2;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

export function normalizeGridAngle(angle) {
  return positiveModulo(angle, QUARTER_TURN);
}

function smoothCircularHistogram(histogram) {
  const smoothed = new Float64Array(histogram.length);
  for (let index = 0; index < histogram.length; index += 1) {
    smoothed[index] =
      (histogram[(index + histogram.length - 1) % histogram.length] +
        histogram[index] * 2 +
        histogram[(index + 1) % histogram.length]) /
      4;
  }
  return smoothed;
}

function summarizePhaseHistogram(histogram, totalWeight, period) {
  const smoothed = smoothCircularHistogram(histogram);
  let squaredWeight = 0;
  let peakWeight = -Infinity;
  let peakIndex = 0;
  for (let index = 0; index < smoothed.length; index += 1) {
    squaredWeight += smoothed[index] ** 2;
    if (smoothed[index] > peakWeight) {
      peakWeight = smoothed[index];
      peakIndex = index;
    }
  }
  return {
    concentration:
      totalWeight > 0 ? (squaredWeight / totalWeight ** 2) * smoothed.length : 0,
    phase: ((peakIndex + 0.5) / smoothed.length) * period,
  };
}

export function buildLatticePhaseProfile(points, candidate, { bins = 32 } = {}) {
  const period = Number(candidate.period);
  if (!Number.isFinite(period) || period <= 0) {
    throw new RangeError("candidate.period must be a positive number");
  }
  const angle = normalizeGridAngle(Number(candidate.angle) || 0);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const uHistogram = new Float64Array(bins);
  const vHistogram = new Float64Array(bins);
  let totalWeight = 0;

  for (const point of points) {
    const weight = Number.isFinite(point.weight) ? Math.max(0, point.weight) : 1;
    if (!weight) continue;
    const u = point.x * cosine + point.y * sine;
    const v = -point.x * sine + point.y * cosine;
    const uPhase = positiveModulo(u, period) / period;
    const vPhase = positiveModulo(v, period) / period;
    uHistogram[Math.min(bins - 1, Math.floor(uPhase * bins))] += weight;
    vHistogram[Math.min(bins - 1, Math.floor(vPhase * bins))] += weight;
    totalWeight += weight;
  }

  const u = summarizePhaseHistogram(uHistogram, totalWeight, period);
  const v = summarizePhaseHistogram(vHistogram, totalWeight, period);
  return {
    angle,
    period,
    totalWeight,
    phase: [u.phase, v.phase],
    concentration: Math.sqrt(u.concentration * v.concentration),
    uConcentration: u.concentration,
    vConcentration: v.concentration,
  };
}

function periodicDistance(value, phase, period) {
  const turns = (value - phase) / period;
  return Math.abs(turns - Math.round(turns)) * period;
}

function quantile(values, ratio) {
  if (!values.length) return 0;
  const index = clamp(Math.round((values.length - 1) * ratio), 0, values.length - 1);
  return values[index];
}

export function measureLatticePointConsensus(
  points,
  candidate,
  { bins = 32, tolerance = 0.22, trim = 0.04 } = {},
) {
  const profile = buildLatticePhaseProfile(points, candidate, { bins });
  const cosine = Math.cos(profile.angle);
  const sine = Math.sin(profile.angle);
  const accepted = [];
  let acceptedWeight = 0;

  for (const point of points) {
    const weight = Number.isFinite(point.weight) ? Math.max(0, point.weight) : 1;
    if (!weight) continue;
    const u = point.x * cosine + point.y * sine;
    const v = -point.x * sine + point.y * cosine;
    const uDistance = periodicDistance(u, profile.phase[0], profile.period);
    const vDistance = periodicDistance(v, profile.phase[1], profile.period);
    if (Math.hypot(uDistance, vDistance) > profile.period * tolerance) continue;
    accepted.push({
      i: Math.round((u - profile.phase[0]) / profile.period),
      j: Math.round((v - profile.phase[1]) / profile.period),
    });
    acceptedWeight += weight;
  }

  if (!accepted.length) {
    return {
      ...profile,
      explainedWeight: 0,
      siteOccupancy: 0,
      acceptedSites: 0,
      candidateSites: 0,
      score: 0,
    };
  }

  const iValues = accepted.map((point) => point.i).sort((a, b) => a - b);
  const jValues = accepted.map((point) => point.j).sort((a, b) => a - b);
  const minI = quantile(iValues, trim);
  const maxI = quantile(iValues, 1 - trim);
  const minJ = quantile(jValues, trim);
  const maxJ = quantile(jValues, 1 - trim);
  const sites = new Set();
  for (const point of accepted) {
    if (point.i < minI || point.i > maxI || point.j < minJ || point.j > maxJ) continue;
    sites.add(`${point.i},${point.j}`);
  }
  const candidateSites = Math.max(1, (maxI - minI + 1) * (maxJ - minJ + 1));
  const explainedWeight = acceptedWeight / Math.max(1e-9, profile.totalWeight);
  const siteOccupancy = sites.size / candidateSites;
  const score =
    profile.concentration *
    (0.25 + explainedWeight * 0.75) *
    (0.25 + Math.sqrt(siteOccupancy) * 0.75);

  return {
    ...profile,
    explainedWeight,
    siteOccupancy,
    acceptedSites: sites.size,
    candidateSites,
    bounds: { minI, maxI, minJ, maxJ },
    score,
  };
}

export function buildSquareLatticeHarmonics(candidate) {
  const period = Number(candidate.period);
  const angle = normalizeGridAngle(Number(candidate.angle) || 0);
  const raw = [
    { id: "fundamental", period, angle },
    { id: "quarter", period: period / 4, angle },
    { id: "half", period: period / 2, angle },
    { id: "double", period: period * 2, angle },
    { id: "quadruple", period: period * 4, angle },
    {
      id: "diagonal-half",
      period: period / Math.SQRT2,
      angle: normalizeGridAngle(angle + Math.PI / 4),
    },
    {
      id: "diagonal-double",
      period: period * Math.SQRT2,
      angle: normalizeGridAngle(angle + Math.PI / 4),
    },
  ];
  const seen = new Set();
  return raw.filter((item) => {
    const key = `${item.period.toFixed(6)}:${item.angle.toFixed(6)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function scoreLatticeEvidence(metrics) {
  const cellDominance = clamp(Number(metrics.cellDominance) || 0, 0, 1);
  const lineContinuity = clamp(Number(metrics.lineContinuity) || 0, 0, 1);
  const centerEvidence = clamp(Number(metrics.centerEvidence) || 0, 0, 1);
  const explainedWeight = clamp(Number(metrics.explainedWeight) || 0, 0, 1);
  const siteOccupancy = clamp(Number(metrics.siteOccupancy) || 0, 0, 1);
  const pointConsensus = Math.max(0, Number(metrics.pointConsensus) || 0);
  const period = Math.max(1, Number(metrics.period) || 1);
  const minimumPeriod = Math.max(1, Number(metrics.minimumPeriod) || 1);

  const structuralEvidence =
    Math.max(lineContinuity, centerEvidence) +
    Math.min(lineContinuity, centerEvidence) * 0.35;
  const pointReliability = clamp((pointConsensus - 1) / 1.5, 0, 1);
  const geometryConsensus = Math.sqrt(explainedWeight * siteOccupancy);
  const scalePrior = 1 - Math.exp(-Math.max(0, period - minimumPeriod) / minimumPeriod);

  return (
    cellDominance * 1.25 +
    structuralEvidence * 0.9 +
    pointReliability * 0.5 +
    geometryConsensus * 0.45 +
    scalePrior * 0.18
  );
}

export function rankPointLatticeCandidates(points, candidates, options) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      consensus: measureLatticePointConsensus(points, candidate, options),
    }))
    .sort((a, b) => b.consensus.score - a.consensus.score);
}

export const radians = (degrees) => (degrees / 180) * HALF_TURN;
