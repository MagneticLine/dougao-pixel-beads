import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateCandidateAgainstTruth,
  evaluateCandidateSet,
  frameIntersectionOverUnion,
  summarizeRecognitionBenchmark,
} from "../recognition/recognition-benchmark-core.mjs";

const truth = {
  cols: 10,
  rows: 8,
  corners: [
    { x: 10, y: 20 },
    { x: 210, y: 20 },
    { x: 210, y: 180 },
    { x: 10, y: 180 },
  ],
};

function candidate(cols, rows, corners) {
  return {
    frame: {
      cols,
      rows,
      corners,
    },
  };
}

test("reports perfect geometry and grid dimensions for an exact candidate", () => {
  const result = evaluateCandidateAgainstTruth(
    candidate(10, 8, truth.corners),
    truth,
  );

  assert.equal(result.valid, true);
  assert.equal(result.gridExact, true);
  assert.equal(result.meanCornerErrorCells, 0);
  assert.equal(result.frameIou, 1);
  assert.equal(result.quality, 1);
});

test("computes symmetric frame IoU for overlapping quadrilaterals", () => {
  const shifted = truth.corners.map((point) => ({
    x: point.x + 20,
    y: point.y,
  }));
  const forward = frameIntersectionOverUnion(truth.corners, shifted);
  const reverse = frameIntersectionOverUnion(shifted, truth.corners);

  assert.ok(Math.abs(forward - 180 / 220) < 1e-9);
  assert.ok(Math.abs(forward - reverse) < 1e-12);
});

test("ranks candidates against truth and exposes top-k recall", () => {
  const candidates = [
    candidate(20, 16, truth.corners),
    candidate(
      10,
      8,
      truth.corners.map((point) => ({ x: point.x + 7, y: point.y + 3 })),
    ),
    candidate(9, 8, truth.corners),
  ];
  const result = evaluateCandidateSet(candidates, truth);

  assert.equal(result.bestIndex, 1);
  assert.equal(result.top1IsBest, false);
  assert.equal(result.top3ContainsBest, true);
  assert.equal(result.exactGridCandidateCount, 1);
});

test("summarizes candidate recall across a benchmark set", () => {
  const summary = summarizeRecognitionBenchmark([
    {
      bestIndex: 0,
      top1IsBest: true,
      top3ContainsBest: true,
      exactGridCandidateCount: 1,
    },
    {
      bestIndex: 2,
      top1IsBest: false,
      top3ContainsBest: true,
      exactGridCandidateCount: 0,
    },
  ]);

  assert.deepEqual(summary, {
    caseCount: 2,
    top1Count: 1,
    top3Count: 2,
    exactGridRecallCount: 1,
    top1Rate: 0.5,
    top3Rate: 1,
    exactGridRecallRate: 0.5,
  });
});
