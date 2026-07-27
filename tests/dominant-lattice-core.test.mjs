import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSquareLatticeHarmonics,
  radians,
  rankPointLatticeCandidates,
  scoreLatticeEvidence,
} from "../recognition/dominant-lattice-core.mjs";

function randomGenerator(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function makeGridPoints({
  cols,
  rows,
  period,
  angle,
  originX,
  originY,
  jitter = 0,
  outlierRatio = 0,
}) {
  const random = randomGenerator(20260727);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const points = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const u = col * period;
      const v = row * period;
      points.push({
        x: originX + u * cosine - v * sine + (random() - 0.5) * jitter,
        y: originY + u * sine + v * cosine + (random() - 0.5) * jitter,
        weight: 1,
      });
    }
  }
  const outlierCount = Math.round(points.length * outlierRatio);
  const width = cols * period;
  const height = rows * period;
  for (let index = 0; index < outlierCount; index += 1) {
    points.push({
      x: originX - period + random() * (width + period * 2),
      y: originY - period + random() * (height + period * 2),
      weight: 0.7,
    });
  }
  return points;
}

test("selects the fundamental square lattice over half, double, and diagonal aliases", () => {
  const candidate = { period: 20, angle: radians(8) };
  const points = makeGridPoints({
    cols: 17,
    rows: 25,
    period: candidate.period,
    angle: candidate.angle,
    originX: 70,
    originY: 45,
    jitter: 0.8,
    outlierRatio: 0.3,
  });
  const ranked = rankPointLatticeCandidates(points, buildSquareLatticeHarmonics(candidate));

  assert.equal(ranked[0].id, "fundamental");
  assert.ok(ranked[0].consensus.siteOccupancy > 0.75);
  assert.ok(ranked[0].consensus.score > ranked[1].consensus.score * 1.15);
});

test("keeps the correct chart period after combining phase, cell, and line evidence", () => {
  const correct = scoreLatticeEvidence({
    period: 15,
    minimumPeriod: 6,
    pointConsensus: 1.18,
    explainedWeight: 0.28,
    siteOccupancy: 0.24,
    cellDominance: 0.69,
    lineContinuity: 0.62,
    centerEvidence: 0.2,
  });
  const textAlias = scoreLatticeEvidence({
    period: 6,
    minimumPeriod: 6,
    pointConsensus: 1.49,
    explainedWeight: 0.3,
    siteOccupancy: 0.07,
    cellDominance: 0.77,
    lineContinuity: 0.57,
    centerEvidence: 0.2,
  });
  const oversizedAlias = scoreLatticeEvidence({
    period: 38,
    minimumPeriod: 6,
    pointConsensus: 1.18,
    explainedWeight: 0.18,
    siteOccupancy: 0.38,
    cellDominance: 0.58,
    lineContinuity: 0.57,
    centerEvidence: 0.2,
  });

  assert.ok(correct > textAlias);
  assert.ok(correct > oversizedAlias);
});
