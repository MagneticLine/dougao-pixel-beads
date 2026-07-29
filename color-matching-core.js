(() => {
  "use strict";

  const DEFAULT_OPTIONS = Object.freeze({
    candidateCount: 12,
    maxIterations: 10,
    anchorColorCount: 4,
    anchorCandidateCount: 4,
    weights: Object.freeze({
      local: 1,
      cast: 2.8,
      relation: 2.2,
      order: 1.35,
      merge: 1.8,
    }),
  });

  const clamp = (value, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, value));

  function stableCodeParts(value) {
    return String(value ?? "")
      .toUpperCase()
      .match(/\d+|\D+/g) || [""];
  }

  function compareCodes(left, right) {
    const leftText = String(left ?? "").toUpperCase();
    const rightText = String(right ?? "").toUpperCase();
    const a = stableCodeParts(left);
    const b = stableCodeParts(right);
    const length = Math.max(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      if (a[index] === undefined) return -1;
      if (b[index] === undefined) return 1;
      if (a[index] === b[index]) continue;
      const aNumber = /^\d+$/.test(a[index]) ? Number(a[index]) : null;
      const bNumber = /^\d+$/.test(b[index]) ? Number(b[index]) : null;
      if (aNumber !== null && bNumber !== null) {
        if (aNumber !== bNumber) return aNumber - bNumber;
        if (a[index].length !== b[index].length) {
          return a[index].length - b[index].length;
        }
        continue;
      }
      return a[index] < b[index] ? -1 : 1;
    }
    return leftText.length - rightText.length || (leftText < rightText ? -1 : leftText > rightText ? 1 : 0);
  }

  function srgbChannelToLinear(channel) {
    const value = clamp(Number(channel) || 0, 0, 255) / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  }

  function rgbToLinear(rgb) {
    return {
      r: srgbChannelToLinear(rgb.r),
      g: srgbChannelToLinear(rgb.g),
      b: srgbChannelToLinear(rgb.b),
    };
  }

  function rgbToLab(rgb) {
    const linear = rgbToLinear(rgb);
    const x =
      (linear.r * 0.4124564 +
        linear.g * 0.3575761 +
        linear.b * 0.1804375) /
      0.95047;
    const y =
      linear.r * 0.2126729 +
      linear.g * 0.7151522 +
      linear.b * 0.072175;
    const z =
      (linear.r * 0.0193339 +
        linear.g * 0.119192 +
        linear.b * 0.9503041) /
      1.08883;
    const pivot = (value) =>
      value > 216 / 24389
        ? Math.cbrt(value)
        : (24389 / 27 / 116) * value + 16 / 116;
    const fx = pivot(x);
    const fy = pivot(y);
    const fz = pivot(z);
    return {
      l: 116 * fy - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz),
    };
  }

  function rgbToOklab(rgb) {
    const linear = rgbToLinear(rgb);
    const l =
      0.4122214708 * linear.r +
      0.5363325363 * linear.g +
      0.0514459929 * linear.b;
    const m =
      0.2119034982 * linear.r +
      0.6806995451 * linear.g +
      0.1073969566 * linear.b;
    const s =
      0.0883024619 * linear.r +
      0.2817188376 * linear.g +
      0.6299787005 * linear.b;
    const lRoot = Math.cbrt(l);
    const mRoot = Math.cbrt(m);
    const sRoot = Math.cbrt(s);
    return {
      l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
      a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
      b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot,
    };
  }

  function degreesToRadians(value) {
    return (value * Math.PI) / 180;
  }

  function radiansToDegrees(value) {
    return (value * 180) / Math.PI;
  }

  function hueDegrees(a, b) {
    if (a === 0 && b === 0) return 0;
    const degrees = radiansToDegrees(Math.atan2(b, a));
    return degrees >= 0 ? degrees : degrees + 360;
  }

  function deltaE00(first, second) {
    const lightness1 = Number(first.l);
    const a1 = Number(first.a);
    const b1 = Number(first.b);
    const lightness2 = Number(second.l);
    const a2 = Number(second.a);
    const b2 = Number(second.b);
    const chroma1 = Math.hypot(a1, b1);
    const chroma2 = Math.hypot(a2, b2);
    const meanChroma = (chroma1 + chroma2) / 2;
    const meanChroma7 = meanChroma ** 7;
    const g =
      0.5 *
      (1 -
        Math.sqrt(
          meanChroma7 / (meanChroma7 + 25 ** 7),
        ));
    const adjustedA1 = (1 + g) * a1;
    const adjustedA2 = (1 + g) * a2;
    const adjustedChroma1 = Math.hypot(adjustedA1, b1);
    const adjustedChroma2 = Math.hypot(adjustedA2, b2);
    const hue1 = hueDegrees(adjustedA1, b1);
    const hue2 = hueDegrees(adjustedA2, b2);
    const deltaLightness = lightness2 - lightness1;
    const deltaChroma = adjustedChroma2 - adjustedChroma1;
    let deltaHueDegrees = 0;
    if (adjustedChroma1 * adjustedChroma2 !== 0) {
      deltaHueDegrees = hue2 - hue1;
      if (deltaHueDegrees > 180) deltaHueDegrees -= 360;
      else if (deltaHueDegrees < -180) deltaHueDegrees += 360;
    }
    const deltaHue =
      2 *
      Math.sqrt(adjustedChroma1 * adjustedChroma2) *
      Math.sin(degreesToRadians(deltaHueDegrees / 2));
    const meanLightness = (lightness1 + lightness2) / 2;
    const meanAdjustedChroma = (adjustedChroma1 + adjustedChroma2) / 2;
    let meanHue = hue1 + hue2;
    if (adjustedChroma1 * adjustedChroma2 === 0) {
      meanHue = hue1 + hue2;
    } else if (Math.abs(hue1 - hue2) <= 180) {
      meanHue = (hue1 + hue2) / 2;
    } else if (hue1 + hue2 < 360) {
      meanHue = (hue1 + hue2 + 360) / 2;
    } else {
      meanHue = (hue1 + hue2 - 360) / 2;
    }
    const t =
      1 -
      0.17 * Math.cos(degreesToRadians(meanHue - 30)) +
      0.24 * Math.cos(degreesToRadians(2 * meanHue)) +
      0.32 * Math.cos(degreesToRadians(3 * meanHue + 6)) -
      0.2 * Math.cos(degreesToRadians(4 * meanHue - 63));
    const lightnessTerm =
      1 +
      (0.015 * (meanLightness - 50) ** 2) /
        Math.sqrt(20 + (meanLightness - 50) ** 2);
    const chromaTerm = 1 + 0.045 * meanAdjustedChroma;
    const hueTerm = 1 + 0.015 * meanAdjustedChroma * t;
    const deltaTheta =
      30 * Math.exp(-(((meanHue - 275) / 25) ** 2));
    const meanAdjustedChroma7 = meanAdjustedChroma ** 7;
    const rotation =
      -2 *
      Math.sqrt(
        meanAdjustedChroma7 /
          (meanAdjustedChroma7 + 25 ** 7),
      ) *
      Math.sin(degreesToRadians(2 * deltaTheta));
    const scaledLightness = deltaLightness / lightnessTerm;
    const scaledChroma = deltaChroma / chromaTerm;
    const scaledHue = deltaHue / hueTerm;
    return Math.sqrt(
      scaledLightness ** 2 +
        scaledChroma ** 2 +
        scaledHue ** 2 +
        rotation * scaledChroma * scaledHue,
    );
  }

  function vectorSubtract(left, right) {
    return {
      l: left.l - right.l,
      a: left.a - right.a,
      b: left.b - right.b,
    };
  }

  function vectorDistanceSquared(left, right) {
    return (
      (left.l - right.l) ** 2 +
      (left.a - right.a) ** 2 +
      (left.b - right.b) ** 2
    );
  }

  function enrichColor(color, index, prefix) {
    const rgb = {
      r: Math.round(clamp(Number(color.r), 0, 255)),
      g: Math.round(clamp(Number(color.g), 0, 255)),
      b: Math.round(clamp(Number(color.b), 0, 255)),
    };
    return {
      ...color,
      ...rgb,
      id: color.id || `${prefix}-${String(index + 1).padStart(3, "0")}`,
      code: String(color.code ?? color.id ?? index + 1),
      name: String(color.name ?? color.code ?? color.id ?? index + 1),
      lab: color.lab || rgbToLab(rgb),
      oklab: color.oklab || rgbToOklab(rgb),
      count: Math.max(0, Number(color.count) || 0),
    };
  }

  function normalizeWeights(values) {
    const total = values.reduce((sum, value) => sum + value, 0);
    if (!total) return values.map(() => 0);
    return values.map((value) => value / total);
  }

  function buildColorGraph(sourceColors, sourceCells, cols, rows) {
    const colors = sourceColors.map((color, index) =>
      enrichColor(color, index, "source"),
    );
    const counts = new Array(colors.length).fill(0);
    for (const value of sourceCells || []) {
      if (Number.isInteger(value) && value >= 0 && value < colors.length) {
        counts[value] += 1;
      }
    }
    colors.forEach((color, index) => {
      if (!counts[index]) counts[index] = color.count;
      color.count = counts[index];
    });
    const rawNodeWeights = counts.map((count) => Math.sqrt(Math.max(0, count)));
    const nodeWeights = normalizeWeights(rawNodeWeights);
    const edgeCounts = new Map();
    const width = Math.max(0, Math.floor(Number(cols) || 0));
    const height = Math.max(0, Math.floor(Number(rows) || 0));
    const cells = sourceCells || [];
    const addEdge = (left, right) => {
      if (
        left < 0 ||
        right < 0 ||
        left === right ||
        left >= colors.length ||
        right >= colors.length
      ) {
        return;
      }
      const first = Math.min(left, right);
      const second = Math.max(left, right);
      const key = `${first}:${second}`;
      edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
    };
    if (width * height === cells.length) {
      for (let row = 0; row < height; row += 1) {
        for (let col = 0; col < width; col += 1) {
          const index = row * width + col;
          if (col + 1 < width) addEdge(cells[index], cells[index + 1]);
          if (row + 1 < height) addEdge(cells[index], cells[index + width]);
        }
      }
    }
    const edges = [...edgeCounts.entries()]
      .map(([key, count]) => {
        const [left, right] = key.split(":").map(Number);
        return { left, right, count, rawWeight: Math.sqrt(count) };
      })
      .sort((a, b) => a.left - b.left || a.right - b.right);
    const edgeWeights = normalizeWeights(edges.map((edge) => edge.rawWeight));
    edges.forEach((edge, index) => {
      edge.weight = edgeWeights[index];
      delete edge.rawWeight;
    });
    return { colors, counts, nodeWeights, edges, cols: width, rows: height };
  }

  function generateCandidates(
    sourceColors,
    paletteColors,
    { candidateCount = DEFAULT_OPTIONS.candidateCount, lockedMappings = {} } = {},
  ) {
    const sources = sourceColors.map((color, index) =>
      enrichColor(color, index, "source"),
    );
    const targets = paletteColors
      .map((color, index) => enrichColor(color, index, "target"))
      .sort((a, b) => compareCodes(a.code, b.code));
    const targetByCode = new Map(targets.map((color) => [color.code, color]));
    const candidates = sources.map((source) => {
      const ranked = targets
        .map((target) => ({
          target,
          code: target.code,
          deltaE00: deltaE00(source.lab, target.lab),
        }))
        .sort(
          (a, b) =>
            a.deltaE00 - b.deltaE00 || compareCodes(a.code, b.code),
        );
      const selected = ranked.slice(
        0,
        Math.max(1, Math.floor(Number(candidateCount) || 1)),
      );
      const lockedCode = lockedMappings[source.id];
      if (
        lockedCode &&
        targetByCode.has(lockedCode) &&
        !selected.some((candidate) => candidate.code === lockedCode)
      ) {
        selected.push(
          ranked.find((candidate) => candidate.code === lockedCode),
        );
      }
      return selected;
    });
    return { sources, targets, candidates, targetByCode };
  }

  function mappingKey(assignments, targets) {
    return assignments.map((index) => targets[index]?.code || "").join("\u001F");
  }

  function vectorLengthSquared(vector) {
    return vector.l ** 2 + vector.a ** 2 + vector.b ** 2;
  }

  function calculateEdgeScore(graph, targets, assignments, edge) {
    const sourceLeft = graph.colors[edge.left];
    const sourceRight = graph.colors[edge.right];
    const targetLeft = targets[assignments[edge.left]];
    const targetRight = targets[assignments[edge.right]];
    const sourceRelation = vectorSubtract(
      sourceLeft.oklab,
      sourceRight.oklab,
    );
    const targetRelation = vectorSubtract(
      targetLeft.oklab,
      targetRight.oklab,
    );
    const relationError =
      edge.weight *
      vectorDistanceSquared(sourceRelation, targetRelation) *
      24;
    const sourceLightness = sourceRelation.l;
    const targetLightness = targetRelation.l;
    const lightnessInversion =
      Math.abs(sourceLightness) >= 0.025 &&
      sourceLightness * targetLightness < 0;
    const lightnessOrderError = lightnessInversion
      ? edge.weight *
        Math.abs(sourceLightness * targetLightness) *
        32
      : 0;
    const merged = assignments[edge.left] === assignments[edge.right];
    const sourceDistance = merged
      ? Math.sqrt(vectorLengthSquared(sourceRelation))
      : 0;
    const mergeError = merged
      ? edge.weight * clamp(sourceDistance / 0.16, 0, 1) ** 2
      : 0;
    return {
      relationError,
      lightnessOrderError,
      mergeError,
      lightnessInversions: lightnessInversion ? 1 : 0,
      mergedAdjacentPairs: merged ? 1 : 0,
    };
  }

  function combineScoreComponents(components, weights) {
    return {
      ...components,
      total:
        weights.local * components.localError +
        weights.cast * components.castVariance +
        weights.relation * components.relationError +
        weights.order * components.lightnessOrderError +
        weights.merge * components.mergeError,
    };
  }

  function calculateScore(graph, targets, assignments, weights) {
    const offsets = graph.colors.map((source, index) =>
      vectorSubtract(targets[assignments[index]].oklab, source.oklab),
    );
    const meanOffset = offsets.reduce(
      (sum, offset, index) => ({
        l: sum.l + offset.l * graph.nodeWeights[index],
        a: sum.a + offset.a * graph.nodeWeights[index],
        b: sum.b + offset.b * graph.nodeWeights[index],
      }),
      { l: 0, a: 0, b: 0 },
    );
    let localError = 0;
    let castVariance = 0;
    graph.colors.forEach((source, index) => {
      const target = targets[assignments[index]];
      localError +=
        graph.nodeWeights[index] * (deltaE00(source.lab, target.lab) / 20) ** 2;
      castVariance +=
        graph.nodeWeights[index] *
        vectorDistanceSquared(offsets[index], meanOffset) *
        24;
    });
    let relationError = 0;
    let lightnessOrderError = 0;
    let mergeError = 0;
    let lightnessInversions = 0;
    let mergedAdjacentPairs = 0;
    for (const edge of graph.edges) {
      const edgeScore = calculateEdgeScore(
        graph,
        targets,
        assignments,
        edge,
      );
      relationError += edgeScore.relationError;
      lightnessOrderError += edgeScore.lightnessOrderError;
      mergeError += edgeScore.mergeError;
      lightnessInversions += edgeScore.lightnessInversions;
      mergedAdjacentPairs += edgeScore.mergedAdjacentPairs;
    }
    return combineScoreComponents({
      localError,
      castVariance,
      relationError,
      lightnessOrderError,
      mergeError,
      lightnessInversions,
      mergedAdjacentPairs,
    }, weights);
  }

  function resolveLockedTargetIndices(
    sources,
    targetByCode,
    targetIndexByCode,
    lockedMappings,
  ) {
    return sources.map((source) => {
      const code = lockedMappings[source.id];
      return code && targetByCode.has(code)
        ? targetIndexByCode.get(code)
        : null;
    });
  }

  function makeNearestAssignments(candidates, targetIndexByCode, lockedIndices) {
    return candidates.map((list, index) =>
      lockedIndices[index] === null
        ? targetIndexByCode.get(list[0].code)
        : lockedIndices[index],
    );
  }

  function makeAnchorAssignments(
    graph,
    candidates,
    targetIndexByCode,
    lockedIndices,
    anchorSourceIndex,
    anchorCandidate,
  ) {
    const anchorSource = graph.colors[anchorSourceIndex];
    const anchorOffset = vectorSubtract(
      anchorCandidate.target.oklab,
      anchorSource.oklab,
    );
    return candidates.map((list, sourceIndex) => {
      if (lockedIndices[sourceIndex] !== null) {
        return lockedIndices[sourceIndex];
      }
      const source = graph.colors[sourceIndex];
      let best = list[0];
      let bestScore = Infinity;
      for (const candidate of list) {
        const offset = vectorSubtract(candidate.target.oklab, source.oklab);
        const score =
          (candidate.deltaE00 / 20) ** 2 +
          vectorDistanceSquared(offset, anchorOffset) * 20;
        if (
          score < bestScore - 1e-12 ||
          (Math.abs(score - bestScore) <= 1e-12 &&
            compareCodes(candidate.code, best.code) < 0)
        ) {
          best = candidate;
          bestScore = score;
        }
      }
      return targetIndexByCode.get(best.code);
    });
  }

  function optimizeAssignments(
    graph,
    targets,
    candidates,
    targetIndexByCode,
    lockedIndices,
    initialAssignments,
    weights,
    maxIterations,
  ) {
    const assignments = [...initialAssignments];
    let score = calculateScore(graph, targets, assignments, weights);
    const incidentEdges = graph.colors.map(() => []);
    graph.edges.forEach((edge) => {
      incidentEdges[edge.left].push(edge);
      incidentEdges[edge.right].push(edge);
    });
    const offsets = graph.colors.map((source, index) =>
      vectorSubtract(targets[assignments[index]].oklab, source.oklab),
    );
    let meanOffset = offsets.reduce(
      (sum, offset, index) => ({
        l: sum.l + offset.l * graph.nodeWeights[index],
        a: sum.a + offset.a * graph.nodeWeights[index],
        b: sum.b + offset.b * graph.nodeWeights[index],
      }),
      { l: 0, a: 0, b: 0 },
    );
    let offsetSecondMoment = offsets.reduce(
      (sum, offset, index) =>
        sum + vectorLengthSquared(offset) * graph.nodeWeights[index],
      0,
    );
    const order = graph.colors
      .map((_, index) => index)
      .sort(
        (a, b) =>
          graph.nodeWeights[b] - graph.nodeWeights[a] ||
          incidentEdges[b].length - incidentEdges[a].length ||
          a - b,
      );
    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      let changed = false;
      for (const sourceIndex of order) {
        if (lockedIndices[sourceIndex] !== null) continue;
        const previous = assignments[sourceIndex];
        let bestTarget = previous;
        let bestScore = score;
        let bestMeanOffset = meanOffset;
        let bestSecondMoment = offsetSecondMoment;
        let bestOffset = offsets[sourceIndex];
        const source = graph.colors[sourceIndex];
        const nodeWeight = graph.nodeWeights[sourceIndex];
        const previousTarget = targets[previous];
        const previousLocalError =
          nodeWeight *
          (deltaE00(source.lab, previousTarget.lab) / 20) ** 2;
        const previousEdgeScore = incidentEdges[sourceIndex].reduce(
          (sum, edge) => {
            const edgeScore = calculateEdgeScore(
              graph,
              targets,
              assignments,
              edge,
            );
            sum.relationError += edgeScore.relationError;
            sum.lightnessOrderError += edgeScore.lightnessOrderError;
            sum.mergeError += edgeScore.mergeError;
            sum.lightnessInversions += edgeScore.lightnessInversions;
            sum.mergedAdjacentPairs += edgeScore.mergedAdjacentPairs;
            return sum;
          },
          {
            relationError: 0,
            lightnessOrderError: 0,
            mergeError: 0,
            lightnessInversions: 0,
            mergedAdjacentPairs: 0,
          },
        );
        for (const candidate of candidates[sourceIndex]) {
          const targetIndex = targetIndexByCode.get(candidate.code);
          if (targetIndex === previous) continue;
          assignments[sourceIndex] = targetIndex;
          const nextOffset = vectorSubtract(
            targets[targetIndex].oklab,
            source.oklab,
          );
          const offsetDelta = vectorSubtract(
            nextOffset,
            offsets[sourceIndex],
          );
          const nextMeanOffset = {
            l: meanOffset.l + offsetDelta.l * nodeWeight,
            a: meanOffset.a + offsetDelta.a * nodeWeight,
            b: meanOffset.b + offsetDelta.b * nodeWeight,
          };
          const nextSecondMoment =
            offsetSecondMoment +
            nodeWeight *
              (vectorLengthSquared(nextOffset) -
                vectorLengthSquared(offsets[sourceIndex]));
          const nextEdgeScore = incidentEdges[sourceIndex].reduce(
            (sum, edge) => {
              const edgeScore = calculateEdgeScore(
                graph,
                targets,
                assignments,
                edge,
              );
              sum.relationError += edgeScore.relationError;
              sum.lightnessOrderError += edgeScore.lightnessOrderError;
              sum.mergeError += edgeScore.mergeError;
              sum.lightnessInversions += edgeScore.lightnessInversions;
              sum.mergedAdjacentPairs += edgeScore.mergedAdjacentPairs;
              return sum;
            },
            {
              relationError: 0,
              lightnessOrderError: 0,
              mergeError: 0,
              lightnessInversions: 0,
              mergedAdjacentPairs: 0,
            },
          );
          const candidateScore = combineScoreComponents(
            {
              localError:
                score.localError -
                previousLocalError +
                nodeWeight * (candidate.deltaE00 / 20) ** 2,
              castVariance:
                Math.max(
                  0,
                  nextSecondMoment -
                    vectorLengthSquared(nextMeanOffset),
                ) * 24,
              relationError:
                score.relationError -
                previousEdgeScore.relationError +
                nextEdgeScore.relationError,
              lightnessOrderError:
                score.lightnessOrderError -
                previousEdgeScore.lightnessOrderError +
                nextEdgeScore.lightnessOrderError,
              mergeError:
                score.mergeError -
                previousEdgeScore.mergeError +
                nextEdgeScore.mergeError,
              lightnessInversions:
                score.lightnessInversions -
                previousEdgeScore.lightnessInversions +
                nextEdgeScore.lightnessInversions,
              mergedAdjacentPairs:
                score.mergedAdjacentPairs -
                previousEdgeScore.mergedAdjacentPairs +
                nextEdgeScore.mergedAdjacentPairs,
            },
            weights,
          );
          if (
            candidateScore.total < bestScore.total - 1e-12 ||
            (Math.abs(candidateScore.total - bestScore.total) <= 1e-12 &&
              compareCodes(
                targets[targetIndex].code,
                targets[bestTarget].code,
              ) < 0)
          ) {
            bestTarget = targetIndex;
            bestScore = candidateScore;
            bestMeanOffset = nextMeanOffset;
            bestSecondMoment = nextSecondMoment;
            bestOffset = nextOffset;
          }
        }
        assignments[sourceIndex] = bestTarget;
        if (bestTarget !== previous) {
          changed = true;
          score = bestScore;
          meanOffset = bestMeanOffset;
          offsetSecondMoment = bestSecondMoment;
          offsets[sourceIndex] = bestOffset;
        }
      }
      if (!changed) break;
    }
    return {
      assignments,
      score: calculateScore(graph, targets, assignments, weights),
    };
  }

  function candidateConfidence(list, selectedCode) {
    if (!list.length) return 0;
    const selected = list.find((candidate) => candidate.code === selectedCode);
    if (!selected) return 0;
    const first = list[0].deltaE00;
    const second = list[1]?.deltaE00 ?? first + 12;
    const separation = clamp((second - first) / 8, 0, 1);
    const fit = 1 - clamp(selected.deltaE00 / 24, 0, 1);
    return clamp(fit * 0.72 + separation * 0.28, 0, 1);
  }

  function createScheme(
    id,
    label,
    method,
    graph,
    targets,
    assignments,
    candidates,
    score,
    paletteId,
    paletteRevision,
    lockedMappings,
  ) {
    return {
      id,
      label,
      method,
      paletteId,
      paletteRevision,
      score,
      mappings: graph.colors.map((source, index) => {
        const target = targets[assignments[index]];
        const ranked = candidates[index];
        const selected = ranked.find(
          (candidate) => candidate.code === target.code,
        );
        return {
          sourceId: source.id,
          targetCode: target.code,
          targetRgb: { r: target.r, g: target.g, b: target.b },
          targetName: target.name,
          contributor: target.contributor || "",
          method: lockedMappings[source.id] ? "manual" : method,
          locked: Boolean(lockedMappings[source.id]),
          localDeltaE00:
            selected?.deltaE00 ?? deltaE00(source.lab, target.lab),
          confidence: candidateConfidence(ranked, target.code),
          candidates: ranked.map((candidate) => ({
            code: candidate.code,
            name: candidate.target.name,
            rgb: {
              r: candidate.target.r,
              g: candidate.target.g,
              b: candidate.target.b,
            },
            deltaE00: candidate.deltaE00,
          })),
        };
      }),
    };
  }

  function matchPalette({
    sourceColors,
    sourceCells = [],
    cols = 0,
    rows = 0,
    palette,
    paletteId = "",
    paletteRevision = "",
    lockedMappings = {},
    options = {},
  }) {
    const startedAt =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    if (!Array.isArray(sourceColors) || !sourceColors.length) {
      throw new Error("sourceColors must contain at least one color");
    }
    if (!Array.isArray(palette) || !palette.length) {
      throw new Error("palette must contain at least one color");
    }
    const configuration = {
      ...DEFAULT_OPTIONS,
      ...options,
      weights: {
        ...DEFAULT_OPTIONS.weights,
        ...(options.weights || {}),
      },
    };
    const graph = buildColorGraph(
      sourceColors,
      sourceCells,
      cols,
      rows,
    );
    const generated = generateCandidates(graph.colors, palette, {
      candidateCount: configuration.candidateCount,
      lockedMappings,
    });
    const targetIndexByCode = new Map(
      generated.targets.map((target, index) => [target.code, index]),
    );
    const lockedIndices = resolveLockedTargetIndices(
      generated.sources,
      generated.targetByCode,
      targetIndexByCode,
      lockedMappings,
    );
    const nearestAssignments = makeNearestAssignments(
      generated.candidates,
      targetIndexByCode,
      lockedIndices,
    );
    const nearestScore = calculateScore(
      graph,
      generated.targets,
      nearestAssignments,
      configuration.weights,
    );
    const initialAssignments = [nearestAssignments];
    const anchorSources = graph.colors
      .map((_, index) => index)
      .sort(
        (a, b) =>
          graph.nodeWeights[b] - graph.nodeWeights[a] || a - b,
      )
      .slice(0, configuration.anchorColorCount);
    for (const sourceIndex of anchorSources) {
      for (const candidate of generated.candidates[sourceIndex].slice(
        0,
        configuration.anchorCandidateCount,
      )) {
        initialAssignments.push(
          makeAnchorAssignments(
            graph,
            generated.candidates,
            targetIndexByCode,
            lockedIndices,
            sourceIndex,
            candidate,
          ),
        );
      }
    }
    const solutions = [];
    const seen = new Set();
    for (const initial of initialAssignments) {
      const optimized = optimizeAssignments(
        graph,
        generated.targets,
        generated.candidates,
        targetIndexByCode,
        lockedIndices,
        initial,
        configuration.weights,
        configuration.maxIterations,
      );
      const key = mappingKey(optimized.assignments, generated.targets);
      if (seen.has(key)) continue;
      seen.add(key);
      solutions.push(optimized);
    }
    solutions.sort(
      (a, b) =>
        a.score.total - b.score.total ||
        (mappingKey(a.assignments, generated.targets) <
        mappingKey(b.assignments, generated.targets)
          ? -1
          : 1),
    );
    const coherent = solutions[0] || {
      assignments: nearestAssignments,
      score: nearestScore,
    };
    const nearestScheme = createScheme(
      "nearest",
      "逐色最接近",
      "nearest",
      graph,
      generated.targets,
      nearestAssignments,
      generated.candidates,
      nearestScore,
      paletteId,
      paletteRevision,
      lockedMappings,
    );
    const coherentScheme = createScheme(
      "coherent",
      "整体配色协调",
      "coherent",
      graph,
      generated.targets,
      coherent.assignments,
      generated.candidates,
      coherent.score,
      paletteId,
      paletteRevision,
      lockedMappings,
    );
    const alternatives = solutions
      .slice(1, 3)
      .map((solution, index) =>
        createScheme(
          `alternative-${index + 1}`,
          `协调候选 ${index + 2}`,
          "coherent",
          graph,
          generated.targets,
          solution.assignments,
          generated.candidates,
          solution.score,
          paletteId,
          paletteRevision,
          lockedMappings,
        ),
      );
    const endedAt =
      typeof performance !== "undefined" && performance.now
        ? performance.now()
        : Date.now();
    return {
      nearest: nearestScheme,
      coherent: coherentScheme,
      alternatives,
      diagnostics: {
        runtimeMs: Math.max(0, endedAt - startedAt),
        sourceColorCount: graph.colors.length,
        paletteColorCount: generated.targets.length,
        candidateCount: configuration.candidateCount,
        solutionCount: solutions.length,
      },
    };
  }

  const api = Object.freeze({
    DEFAULT_OPTIONS,
    compareCodes,
    rgbToLab,
    rgbToOklab,
    deltaE00,
    buildColorGraph,
    generateCandidates,
    matchPalette,
  });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  globalThis.DougaoColorMatching = api;
})();
