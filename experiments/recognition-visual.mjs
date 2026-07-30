import {
  analyzeHybridLattice,
  drawGridOverlay,
  formatAngle,
  makeAnalysisCanvas,
} from "../recognition/recognition-image-core.mjs?v=64";
import {
  evaluateCandidateSet,
  summarizeRecognitionBenchmark,
} from "../recognition/recognition-benchmark-core.mjs?v=1";

const elements = {
  caseList: document.querySelector("#caseList"),
  template: document.querySelector("#caseTemplate"),
  legacyRunner: document.querySelector("#legacyRunner"),
  globalStatus: document.querySelector("#globalStatus"),
  rerunAll: document.querySelector("#rerunAll"),
  copySummary: document.querySelector("#copySummary"),
  exportGroundTruth: document.querySelector("#exportGroundTruth"),
  importGroundTruth: document.querySelector("#importGroundTruth"),
  lineOpacity: document.querySelector("#lineOpacity"),
  lineOpacityValue: document.querySelector("#lineOpacityValue"),
  showFrame: document.querySelector("#showFrame"),
  zoomDialog: document.querySelector("#zoomDialog"),
  zoomCanvas: document.querySelector("#zoomCanvas"),
  zoomEyebrow: document.querySelector("#zoomEyebrow"),
  zoomTitle: document.querySelector("#zoomTitle"),
  zoomMeta: document.querySelector("#zoomMeta"),
  zoomClose: document.querySelector("#zoomClose"),
  truthDialog: document.querySelector("#truthDialog"),
  truthCanvas: document.querySelector("#truthCanvas"),
  truthStage: document.querySelector("#truthStage"),
  truthMagnifier: document.querySelector("#truthMagnifier"),
  truthEyebrow: document.querySelector("#truthEyebrow"),
  truthTitle: document.querySelector("#truthTitle"),
  truthSubtitle: document.querySelector("#truthSubtitle"),
  truthCols: document.querySelector("#truthCols"),
  truthRows: document.querySelector("#truthRows"),
  truthNote: document.querySelector("#truthNote"),
  truthStatus: document.querySelector("#truthStatus"),
  truthReset: document.querySelector("#truthReset"),
  truthClear: document.querySelector("#truthClear"),
  truthSave: document.querySelector("#truthSave"),
  truthClose: document.querySelector("#truthClose"),
};

const caseDescriptions = {
  "simple-pixel-art": {
    title: "规则像素图",
    description: "浅色背景、淡网格和水印；重点检查是否发生 2 倍行列误判。",
  },
  "pixel-art-with-background": {
    title: "杂乱背景中的像素对象",
    description: "裁剪中央狐狸，背景仍保留其它图案、白边和阴影。",
  },
  "fused-beads": {
    title: "熨烫后的拼豆成品",
    description: "格缝较弱，存在透视、反光和附件；重点看晶格是否顺着豆粒方向。",
  },
  "beads-with-holes": {
    title: "带孔的半成品拼豆",
    description: "裁剪中间对象；孔洞和木纹会产生对角子晶格与错误短周期。",
  },
  "labeled-chart": {
    title: "带文字的拼豆图纸",
    description: "格内字符会制造短周期；已知图纸主体应为 29 × 34。",
  },
};

const aliasLabels = {
  fundamental: "原始周期",
  quarter: "四分之一周期",
  half: "半周期",
  double: "双周期",
  quadruple: "四倍周期",
  "diagonal-half": "对角半晶格",
  "diagonal-double": "对角双晶格",
};

const methodLabels = {
  source: "预设裁剪",
  legacy: "当前网页算法",
  hybrid: "主导晶格候选",
};

const frameMethodLabels = {
  "combined-component": "综合连通区",
  "combined-trimmed": "综合边缘收缩",
  "center-component": "中心结构连通区",
  "center-trimmed": "中心结构收缩",
  "foreground-component": "前景连通区",
  "foreground-trimmed": "前景边缘收缩",
  "boundary-component": "边缘连通区",
  "boundary-trimmed": "边缘证据收缩",
  "axis-support": "行列投影",
  consensus: "晶格点范围",
  "line-run": "连续格线",
  "outer-band-transition": "外侧标注带",
  "axis-ensemble": "横纵证据组合",
  fallback: "全图回退",
};

const labState = {
  config: null,
  cases: [],
  running: false,
  zoom: null,
  truth: null,
};
window.__recognitionLabState = labState;

const clamp = (value, minimum, maximum) =>
  Math.min(maximum, Math.max(minimum, value));

const fileNameFromPath = (path) => path.split(/[\\/]/).pop();

const groundTruthKind = "dougao-recognition-ground-truth";
const groundTruthSchemaVersion = 1;
const groundTruthCornerOrder = [
  "top-left",
  "top-right",
  "bottom-right",
  "bottom-left",
];

function cloneGroundTruth(value) {
  return value
    ? {
        ...value,
        corners: value.corners.map((point) => ({ ...point })),
      }
    : null;
}

function currentCandidate(caseState) {
  return caseState.hybrid?.candidates[caseState.selectedCandidate] || null;
}

function benchmarkCase(caseState) {
  if (!caseState.groundTruth || !caseState.hybrid?.candidates?.length) {
    return null;
  }
  const { width, height } = caseState.analysis.canvas;
  return evaluateCandidateSet(
    caseState.hybrid.candidates,
    caseState.groundTruth,
    { width, height },
  );
}

function automaticTruthDraft(caseState) {
  const candidate = currentCandidate(caseState);
  const { width, height } = caseState.analysis.canvas;
  const insetX = width * 0.08;
  const insetY = height * 0.08;
  const candidateCorners = candidate?.frame?.corners;
  const corners =
    Array.isArray(candidateCorners) && candidateCorners.length === 4
      ? candidateCorners.map((point) => ({
          x: clamp(point.x, 0, width),
          y: clamp(point.y, 0, height),
        }))
      : [
          { x: insetX, y: insetY },
          { x: width - insetX, y: insetY },
          { x: width - insetX, y: height - insetY },
          { x: insetX, y: height - insetY },
        ];
  return {
    cols: clamp(
      Math.round(
        caseState.config.expectedGrid?.cols ||
          candidate?.frame?.cols ||
          20,
      ),
      2,
      200,
    ),
    rows: clamp(
      Math.round(
        caseState.config.expectedGrid?.rows ||
          candidate?.frame?.rows ||
          20,
      ),
      2,
      200,
    ),
    corners,
    note: "",
  };
}

function interpolatePoint(first, second, ratio) {
  return {
    x: first.x + (second.x - first.x) * ratio,
    y: first.y + (second.y - first.y) * ratio,
  };
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index].x * next.y - next.x * points[index].y;
  }
  return area / 2;
}

function validGroundTruthQuad(points, width, height) {
  if (!Array.isArray(points) || points.length !== 4) return false;
  if (
    points.some(
      (point) =>
        !Number.isFinite(point.x) ||
        !Number.isFinite(point.y) ||
        point.x < 0 ||
        point.y < 0 ||
        point.x > width ||
        point.y > height,
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
      (next.x - current.x) * (after.y - next.y) -
      (next.y - current.y) * (after.x - next.x);
    if (Math.abs(cross) > 1e-4) signs.push(Math.sign(cross));
  }
  return (
    signs.length === 4 &&
    signs.every((sign) => sign === signs[0]) &&
    Math.abs(polygonArea(points)) >= width * height * 0.002
  );
}

function pointInsideQuad(point, corners) {
  let sign = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % corners.length];
    const cross =
      (next.x - current.x) * (point.y - current.y) -
      (next.y - current.y) * (point.x - current.x);
    if (Math.abs(cross) < 1e-5) continue;
    const nextSign = Math.sign(cross);
    if (!sign) sign = nextSign;
    else if (nextSign !== sign) return false;
  }
  return true;
}

function truthCanvasPoint(event) {
  const rectangle = elements.truthCanvas.getBoundingClientRect();
  return {
    x:
      ((event.clientX - rectangle.left) / Math.max(1, rectangle.width)) *
      elements.truthCanvas.width,
    y:
      ((event.clientY - rectangle.top) / Math.max(1, rectangle.height)) *
      elements.truthCanvas.height,
  };
}

function drawTruthLine(context, start, end, outer = false) {
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.strokeStyle = "rgba(0, 0, 0, 0.94)";
  context.lineWidth = outer ? 3.6 : 1.8;
  context.stroke();
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.strokeStyle = "rgba(255, 255, 255, 0.96)";
  context.lineWidth = outer ? 1.75 : 0.72;
  context.stroke();
}

function drawTruthGrid(context, draft, drawHandles = true) {
  const [topLeft, topRight, bottomRight, bottomLeft] = draft.corners;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  for (let col = 1; col < draft.cols; col += 1) {
    const ratio = col / draft.cols;
    drawTruthLine(
      context,
      interpolatePoint(topLeft, topRight, ratio),
      interpolatePoint(bottomLeft, bottomRight, ratio),
    );
  }
  for (let row = 1; row < draft.rows; row += 1) {
    const ratio = row / draft.rows;
    drawTruthLine(
      context,
      interpolatePoint(topLeft, bottomLeft, ratio),
      interpolatePoint(topRight, bottomRight, ratio),
    );
  }
  for (let index = 0; index < draft.corners.length; index += 1) {
    drawTruthLine(
      context,
      draft.corners[index],
      draft.corners[(index + 1) % draft.corners.length],
      true,
    );
  }

  if (drawHandles) {
    const rectangle = elements.truthCanvas.getBoundingClientRect();
    const scale =
      elements.truthCanvas.width / Math.max(1, rectangle.width || elements.truthCanvas.width);
    const radius = clamp(9 * scale, 7, 16);
    for (const corner of draft.corners) {
      context.beginPath();
      context.arc(corner.x, corner.y, radius + 2.2, 0, Math.PI * 2);
      context.fillStyle = "rgba(0, 0, 0, 0.96)";
      context.fill();
      context.beginPath();
      context.arc(corner.x, corner.y, radius, 0, Math.PI * 2);
      context.fillStyle = "#ffcf48";
      context.fill();
      context.beginPath();
      context.arc(corner.x, corner.y, Math.max(1.5, radius * 0.24), 0, Math.PI * 2);
      context.fillStyle = "#171814";
      context.fill();
    }
  }
  context.restore();
}

function renderTruthEditor() {
  const editor = labState.truth;
  if (!editor) return;
  const source = editor.caseState.analysis.canvas;
  configureCanvas(elements.truthCanvas, source);
  const context = elements.truthCanvas.getContext("2d");
  context.clearRect(0, 0, elements.truthCanvas.width, elements.truthCanvas.height);
  context.drawImage(source, 0, 0);
  drawTruthGrid(context, editor.draft);
}

function hideTruthMagnifier() {
  elements.truthMagnifier.hidden = true;
}

function renderTruthMagnifier(event, point) {
  const editor = labState.truth;
  if (!editor) return;
  const lens = elements.truthMagnifier;
  const lensSize = lens.width;
  const source = editor.caseState.analysis.canvas;
  const sourceSize = 34;
  const context = lens.getContext("2d");
  context.clearRect(0, 0, lensSize, lensSize);
  context.save();
  context.beginPath();
  context.arc(lensSize / 2, lensSize / 2, lensSize / 2, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = "#73746d";
  context.fillRect(0, 0, lensSize, lensSize);
  context.imageSmoothingEnabled = false;
  context.drawImage(
    source,
    point.x - sourceSize / 2,
    point.y - sourceSize / 2,
    sourceSize,
    sourceSize,
    0,
    0,
    lensSize,
    lensSize,
  );
  const center = lensSize / 2;
  context.strokeStyle = "rgba(0, 0, 0, 0.95)";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(center - 18, center);
  context.lineTo(center + 18, center);
  context.moveTo(center, center - 18);
  context.lineTo(center, center + 18);
  context.stroke();
  context.strokeStyle = "#fff";
  context.lineWidth = 1;
  context.stroke();
  context.restore();

  const stageRectangle = elements.truthStage.getBoundingClientRect();
  const displaySize = lens.getBoundingClientRect().width || 156;
  const localX = event.clientX - stageRectangle.left;
  const localY = event.clientY - stageRectangle.top;
  let left = localX + 28;
  let top = localY - displaySize - 22;
  if (left + displaySize > stageRectangle.width - 8) {
    left = localX - displaySize - 28;
  }
  if (top < 8) top = localY + 28;
  lens.style.left = `${clamp(left, 8, stageRectangle.width - displaySize - 8)}px`;
  lens.style.top = `${clamp(top, 8, stageRectangle.height - displaySize - 8)}px`;
  lens.hidden = false;
}

function startTruthPointer(event) {
  const editor = labState.truth;
  if (!editor || event.button !== 0) return;
  const point = truthCanvasPoint(event);
  const rectangle = elements.truthCanvas.getBoundingClientRect();
  const screenScale = rectangle.width / Math.max(1, elements.truthCanvas.width);
  let corner = -1;
  let nearest = Infinity;
  editor.draft.corners.forEach((candidate, index) => {
    const distance =
      Math.hypot(candidate.x - point.x, candidate.y - point.y) * screenScale;
    if (distance <= 20 && distance < nearest) {
      nearest = distance;
      corner = index;
    }
  });
  const type =
    corner >= 0
      ? "corner"
      : pointInsideQuad(point, editor.draft.corners)
        ? "frame"
        : null;
  if (!type) return;
  editor.drag = {
    type,
    corner,
    pointerId: event.pointerId,
    start: point,
    initial: editor.draft.corners.map((item) => ({ ...item })),
  };
  elements.truthCanvas.setPointerCapture?.(event.pointerId);
  elements.truthCanvas.classList.add("dragging");
  if (type === "corner") renderTruthMagnifier(event, point);
  event.preventDefault();
}

function moveTruthPointer(event) {
  const editor = labState.truth;
  const drag = editor?.drag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const point = truthCanvasPoint(event);
  const width = elements.truthCanvas.width;
  const height = elements.truthCanvas.height;
  if (drag.type === "corner") {
    const nextCorners = drag.initial.map((item) => ({ ...item }));
    nextCorners[drag.corner] = {
      x: clamp(point.x, 0, width),
      y: clamp(point.y, 0, height),
    };
    if (validGroundTruthQuad(nextCorners, width, height)) {
      editor.draft.corners = nextCorners;
    }
    renderTruthMagnifier(event, editor.draft.corners[drag.corner]);
  } else {
    const requestedX = point.x - drag.start.x;
    const requestedY = point.y - drag.start.y;
    const minX = Math.min(...drag.initial.map((item) => item.x));
    const maxX = Math.max(...drag.initial.map((item) => item.x));
    const minY = Math.min(...drag.initial.map((item) => item.y));
    const maxY = Math.max(...drag.initial.map((item) => item.y));
    const deltaX = clamp(requestedX, -minX, width - maxX);
    const deltaY = clamp(requestedY, -minY, height - maxY);
    editor.draft.corners = drag.initial.map((item) => ({
      x: item.x + deltaX,
      y: item.y + deltaY,
    }));
  }
  renderTruthEditor();
  elements.truthStatus.textContent = "尚未保存：完成调整后点击“保存本例”。";
  event.preventDefault();
}

function endTruthPointer(event) {
  const editor = labState.truth;
  if (!editor?.drag || editor.drag.pointerId !== event.pointerId) return;
  elements.truthCanvas.releasePointerCapture?.(event.pointerId);
  editor.drag = null;
  elements.truthCanvas.classList.remove("dragging");
  hideTruthMagnifier();
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`无法读取实验图片：${url}`));
    image.src = url;
  });
}

async function waitForLegacyBridge(timeoutMs = 20000) {
  const startedAt = performance.now();
  while (performance.now() - startedAt < timeoutMs) {
    const bridge =
      elements.legacyRunner.contentWindow?.__pixelRefineRecognitionLab;
    if (bridge) return bridge;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error("当前网页算法运行器没有按时准备完成");
}

function setCaseState(caseState, state, text) {
  caseState.card.dataset.state = state;
  caseState.card.querySelector(".state-text").textContent = text;
}

function configureCanvas(target, source) {
  if (target.width !== source.width) target.width = source.width;
  if (target.height !== source.height) target.height = source.height;
}

function renderSourceCanvas(caseState) {
  const target = caseState.canvases.source;
  configureCanvas(target, caseState.analysis.canvas);
  const context = target.getContext("2d");
  context.clearRect(0, 0, target.width, target.height);
  context.drawImage(caseState.analysis.canvas, 0, 0);
}

function overlayOptions() {
  return {
    lineColor: "#ffffff",
    edgeColor: "rgba(0, 0, 0, 0.96)",
    frameColor: "#ffcf48",
    lineWidth: 0.72,
    showFrame: elements.showFrame.checked,
  };
}

function renderResultCanvas(caseState, method) {
  const target = caseState.canvases[method];
  const source = caseState.analysis.canvas;
  configureCanvas(target, source);
  const context = target.getContext("2d");
  context.clearRect(0, 0, target.width, target.height);
  context.drawImage(source, 0, 0);
  const result =
    method === "legacy"
      ? caseState.legacy
      : caseState.hybrid?.candidates[caseState.selectedCandidate];
  if (!result) return;
  context.save();
  context.globalAlpha = Number(elements.lineOpacity.value) / 100;
  drawGridOverlay(context, result, target.width, target.height, overlayOptions());
  context.restore();
}

function renderAllCanvases(caseState) {
  renderSourceCanvas(caseState);
  renderResultCanvas(caseState, "legacy");
  renderResultCanvas(caseState, "hybrid");
}

function percentage(value) {
  return `${Math.round(clamp(Number(value) || 0, 0, 1) * 100)}%`;
}

function candidateMatchesReview(candidate, review) {
  const reference = review?.referenceLattice;
  if (!candidate || !reference) return false;
  let angle = ((candidate.angle * 180) / Math.PI) % 90;
  if (angle > 45) angle -= 90;
  if (angle < -45) angle += 90;
  const periodRatio =
    Math.max(candidate.period, reference.period) /
    Math.max(0.001, Math.min(candidate.period, reference.period));
  return periodRatio <= 1.09 && Math.abs(angle - reference.angle) <= 3.1;
}

function updateEvidence(caseState) {
  const candidate =
    caseState.hybrid?.candidates[caseState.selectedCandidate] || null;
  const title = caseState.card.querySelector(".candidate-title");
  if (!candidate) {
    title.textContent = "没有可用候选";
    return;
  }
  title.textContent = `${candidate.frame.cols} × ${candidate.frame.rows} · 周期 ${candidate.period.toFixed(
    1,
  )} px · ${formatAngle(candidate.angle)} · 边界：${
    frameMethodLabels[candidate.frame.method] || candidate.frame.method
  }`;
  for (const row of caseState.card.querySelectorAll(".evidence-item")) {
    const metric = row.dataset.metric;
    const rawValue =
      metric === "coveragePrior"
        ? candidate.metrics.coveragePrior
        : candidate.metrics[metric];
    row.querySelector("b").style.width = percentage(rawValue);
    row.querySelector("output").textContent =
      metric === "coveragePrior"
        ? `${Math.round(candidate.metrics.coverage * 100)}%`
        : percentage(rawValue);
  }
}

function expectedText(caseState) {
  const expected = caseState.config.expectedGrid;
  return expected
    ? `人工基准：${expected.cols} × ${expected.rows}`
    : "人工基准：待你观察后确认";
}

function updateLegacyMeta(caseState) {
  const result = caseState.legacy;
  const meta = caseState.card.querySelector(".legacy-meta");
  const detail = caseState.card.querySelector(".legacy-detail");
  if (!result) {
    meta.textContent = "运行失败";
    detail.textContent = "";
    return;
  }
  meta.textContent = `${result.cols} × ${result.rows} · ${Math.round(
    result.confidence * 100,
  )}%`;
  detail.textContent = `自动判为${result.mode === "photo" ? "成品/照片" : "像素图"}；${result.hint}`;
}

function updateHybridMeta(caseState) {
  const result = caseState.hybrid;
  const meta = caseState.card.querySelector(".hybrid-meta");
  if (!result?.candidates.length) {
    meta.textContent = "没有候选";
    return;
  }
  meta.textContent = `${Math.round(result.confidence * 100)}% · ${Math.round(
    result.elapsedMs,
  )} ms`;
}

function renderCandidateButtons(caseState) {
  const container = caseState.card.querySelector(".candidate-switcher");
  container.replaceChildren();
  const candidates = caseState.hybrid?.candidates || [];
  const benchmark = benchmarkCase(caseState);
  candidates.slice(0, 5).forEach((candidate, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute(
      "aria-pressed",
      index === caseState.selectedCandidate ? "true" : "false",
    );
    const reviewed = candidateMatchesReview(
      candidate,
      caseState.config.review,
    );
    const truthBest = benchmark?.bestIndex === index;
    button.textContent = `候选 ${index + 1} · ${candidate.frame.cols}×${candidate.frame.rows}${
      reviewed ? " · 人工标记" : ""
    }${truthBest ? " · 基准最优" : ""}`;
    if (reviewed) button.classList.add("reviewed");
    if (truthBest) button.classList.add("truth-best");
    button.title = `${aliasLabels[candidate.alias] || candidate.alias}，${candidate.source === "center" ? "中心结构提出" : "角点提出"}，边界由${frameMethodLabels[candidate.frame.method] || candidate.frame.method}确定，得分 ${candidate.score.toFixed(3)}`;
    button.dataset.frameDiagnostics = JSON.stringify(
      candidate.frame.support?.hypotheses || [],
    );
    button.dataset.frameProfiles = JSON.stringify({
      lineScores: candidate.frame.support?.lineScores || null,
      axisProfiles: candidate.frame.support?.axisProfiles || null,
    });
    button.addEventListener("click", () => {
      caseState.selectedCandidate = index;
      renderCandidateButtons(caseState);
      renderResultCanvas(caseState, "hybrid");
      updateEvidence(caseState);
      updateGroundTruthControls(caseState);
      if (labState.zoom?.caseState === caseState && labState.zoom.method === "hybrid") {
        renderZoom();
      }
    });
    container.append(button);
  });
}

function updateGroundTruthControls(caseState) {
  const button = caseState.card.querySelector(".truth-open");
  const saved = caseState.groundTruth;
  button.dataset.saved = saved ? "true" : "false";
  button.textContent = saved
    ? `已标注 ${saved.cols}×${saved.rows}`
    : "标注人工解";
  const expected = caseState.card.querySelector(".expected-grid");
  const benchmark = benchmarkCase(caseState);
  const evaluation = benchmark?.evaluations[caseState.selectedCandidate];
  if (saved && evaluation?.valid) {
    const gridText = evaluation.gridExact
      ? "行列正确"
      : `相差 ${evaluation.colError} 列 / ${evaluation.rowError} 行`;
    expected.textContent = `人工标注：${saved.cols} × ${saved.rows}；当前候选${gridText}，角点 ${evaluation.meanCornerErrorCells.toFixed(
      2,
    )} 格，框重合 ${Math.round(evaluation.frameIou * 100)}%；基准最优为候选 ${
      benchmark.bestIndex + 1
    }`;
  } else {
    expected.textContent = saved
      ? `人工标注：${saved.cols} × ${saved.rows}（等待候选）`
      : expectedText(caseState);
  }
  const count = labState.cases.filter((item) => item.groundTruth).length;
  elements.exportGroundTruth.disabled = count === 0;
  elements.exportGroundTruth.textContent = count
    ? `导出人工基准（${count}）`
    : "导出人工基准";
}

function syncTruthInputs() {
  const editor = labState.truth;
  if (!editor) return;
  elements.truthCols.value = String(editor.draft.cols);
  elements.truthRows.value = String(editor.draft.rows);
  elements.truthNote.value = editor.draft.note || "";
  elements.truthClear.disabled = !editor.caseState.groundTruth;
}

function openTruthEditor(caseState) {
  const description = caseDescriptions[caseState.config.label] || {
    title: caseState.config.label,
  };
  labState.truth = {
    caseState,
    draft:
      cloneGroundTruth(caseState.groundTruth) ||
      automaticTruthDraft(caseState),
    drag: null,
  };
  elements.truthEyebrow.textContent = `${description.title} · 人工验证集`;
  elements.truthTitle.textContent = "标注正确网格";
  elements.truthSubtitle.textContent = `${caseState.analysis.canvas.width} × ${caseState.analysis.canvas.height} 分析像素；四角顺序固定为左上、右上、右下、左下。`;
  elements.truthStatus.textContent = caseState.groundTruth
    ? "已载入此前保存的本例标注。"
    : "已用当前自动候选初始化；请人工校准后保存。";
  syncTruthInputs();
  if (elements.zoomDialog.open) elements.zoomDialog.close();
  elements.truthDialog.showModal();
  requestAnimationFrame(renderTruthEditor);
}

function updateTruthDimension(name, rawValue, commit = false) {
  const editor = labState.truth;
  if (!editor) return;
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) return;
  if (!commit && (numeric < 2 || numeric > 200)) return;
  const value = clamp(Math.round(numeric), 2, 200);
  editor.draft[name] = value;
  if (commit) {
    const input = name === "cols" ? elements.truthCols : elements.truthRows;
    input.value = String(value);
  }
  renderTruthEditor();
  elements.truthStatus.textContent = "尚未保存：完成调整后点击“保存本例”。";
}

function resetTruthDraft() {
  const editor = labState.truth;
  if (!editor) return;
  editor.draft = automaticTruthDraft(editor.caseState);
  syncTruthInputs();
  renderTruthEditor();
  elements.truthStatus.textContent = "已重置为当前自动候选，尚未保存。";
}

function saveTruthDraft() {
  const editor = labState.truth;
  if (!editor) return;
  const { width, height } = editor.caseState.analysis.canvas;
  if (
    !validGroundTruthQuad(editor.draft.corners, width, height) ||
    editor.draft.cols < 2 ||
    editor.draft.rows < 2
  ) {
    elements.truthStatus.textContent =
      "四角发生交叉或区域过小，请修正后再保存。";
    return;
  }
  editor.draft.note = elements.truthNote.value.trim();
  editor.caseState.groundTruth = {
    ...cloneGroundTruth(editor.draft),
    savedAt: new Date().toISOString(),
  };
  renderCandidateButtons(editor.caseState);
  updateGroundTruthControls(editor.caseState);
  elements.truthStatus.textContent =
    "本例已保存到当前浏览器内存；请用页面顶部按钮下载 JSON 数据包。";
  syncTruthInputs();
}

function clearTruthDraft() {
  const editor = labState.truth;
  if (!editor) return;
  editor.caseState.groundTruth = null;
  editor.draft = automaticTruthDraft(editor.caseState);
  renderCandidateButtons(editor.caseState);
  updateGroundTruthControls(editor.caseState);
  syncTruthInputs();
  renderTruthEditor();
  elements.truthStatus.textContent = "本例人工标注已删除。";
}

function normalizedTruthCorners(caseState, corners) {
  const { width, height } = caseState.analysis.canvas;
  return corners.map((point) => ({
    x: Number((point.x / width).toFixed(7)),
    y: Number((point.y / height).toFixed(7)),
  }));
}

async function sourceFingerprint(caseState) {
  if (caseState.sourceSha256 !== undefined) return caseState.sourceSha256;
  try {
    const response = await fetch(caseState.imageUrl, { cache: "force-cache" });
    if (!response.ok) throw new Error("image fetch failed");
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await response.arrayBuffer(),
    );
    caseState.sourceSha256 = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    caseState.sourceSha256 = null;
  }
  return caseState.sourceSha256;
}

async function serializeGroundTruthCase(caseState) {
  const truth = caseState.groundTruth;
  if (!truth) return null;
  const { width, height } = caseState.analysis.canvas;
  const normalized = normalizedTruthCorners(caseState, truth.corners);
  const crop = caseState.config.crop;
  const candidate = currentCandidate(caseState);
  return {
    caseId: caseState.config.label,
    source: {
      fileName: fileNameFromPath(caseState.config.file),
      sha256: await sourceFingerprint(caseState),
      width: caseState.image.naturalWidth,
      height: caseState.image.naturalHeight,
    },
    crop: { ...crop },
    analysis: { width, height },
    groundTruth: {
      cols: truth.cols,
      rows: truth.rows,
      cornerOrder: [...groundTruthCornerOrder],
      cornersNormalized: normalized,
      cornersAnalysisPixels: truth.corners.map((point) => ({
        x: Number(point.x.toFixed(4)),
        y: Number(point.y.toFixed(4)),
      })),
      cornersSourcePixels: normalized.map((point) => ({
        x: Number((crop.left + point.x * crop.width).toFixed(4)),
        y: Number((crop.top + point.y * crop.height).toFixed(4)),
      })),
      note: truth.note || "",
      savedAt: truth.savedAt,
    },
    automaticCandidate: candidate
      ? {
          cols: candidate.frame.cols,
          rows: candidate.frame.rows,
          period: Number(candidate.period.toFixed(6)),
          angleRadians: Number(candidate.angle.toFixed(9)),
          score: Number(candidate.score.toFixed(6)),
          frameMethod: candidate.frame.method,
        }
      : null,
  };
}

async function buildGroundTruthPackage() {
  const samples = (
    await Promise.all(
      labState.cases
        .filter((caseState) => caseState.groundTruth)
        .map(serializeGroundTruthCase),
    )
  ).filter(Boolean);
  return {
    kind: groundTruthKind,
    schemaVersion: groundTruthSchemaVersion,
    createdAt: new Date().toISOString(),
    coordinateSystem: {
      origin: "top-left",
      normalizedRange: [0, 1],
      cornerOrder: [...groundTruthCornerOrder],
    },
    privacy: {
      imageDataIncluded: false,
      localExportOnly: true,
      note: "Source hashes identify matching files but are not anonymous image data.",
    },
    samples,
  };
}

function downloadJson(value, fileName) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function exportGroundTruthPackage() {
  const count = labState.cases.filter((item) => item.groundTruth).length;
  if (!count) {
    elements.globalStatus.textContent = "还没有人工标注可导出。";
    return;
  }
  elements.exportGroundTruth.disabled = true;
  elements.globalStatus.textContent =
    "正在计算图片指纹并生成不含原图的标注包…";
  try {
    const payload = await buildGroundTruthPackage();
    const stamp = payload.createdAt.replace(/[:.]/g, "-");
    downloadJson(payload, `dougao-ground-truth-${stamp}.json`);
    elements.globalStatus.textContent =
      `已导出 ${payload.samples.length} 条人工基准；数据包不包含图片内容。`;
  } catch (error) {
    console.error(error);
    elements.globalStatus.textContent =
      error instanceof Error ? error.message : String(error);
  } finally {
    elements.exportGroundTruth.disabled = false;
  }
}

function parseImportedTruth(sample, caseState) {
  const groundTruth = sample?.groundTruth;
  if (!groundTruth) return null;
  const cols = clamp(Math.round(Number(groundTruth.cols)), 2, 200);
  const rows = clamp(Math.round(Number(groundTruth.rows)), 2, 200);
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) return null;
  const { width, height } = caseState.analysis.canvas;
  let corners = groundTruth.cornersNormalized?.map((point) => ({
    x: Number(point.x) * width,
    y: Number(point.y) * height,
  }));
  if (!Array.isArray(corners) || corners.length !== 4) {
    corners = groundTruth.cornersAnalysisPixels?.map((point) => ({
      x: Number(point.x),
      y: Number(point.y),
    }));
  }
  if (!validGroundTruthQuad(corners, width, height)) return null;
  return {
    cols,
    rows,
    corners,
    note: String(groundTruth.note || ""),
    savedAt: String(groundTruth.savedAt || new Date().toISOString()),
  };
}

async function importGroundTruthPackage(file) {
  let payload;
  try {
    payload = JSON.parse(await file.text());
  } catch {
    throw new Error("标注包不是有效的 JSON 文件。");
  }
  if (
    payload?.kind !== groundTruthKind ||
    Number(payload.schemaVersion) !== groundTruthSchemaVersion ||
    !Array.isArray(payload.samples)
  ) {
    throw new Error("标注包格式或版本不受支持。");
  }
  let imported = 0;
  for (const sample of payload.samples) {
    const caseState = labState.cases.find(
      (item) =>
        item.config.label === sample.caseId ||
        fileNameFromPath(item.config.file) === sample.source?.fileName,
    );
    if (!caseState) continue;
    const truth = parseImportedTruth(sample, caseState);
    if (!truth) continue;
    caseState.groundTruth = truth;
    renderCandidateButtons(caseState);
    updateGroundTruthControls(caseState);
    imported += 1;
  }
  if (!imported) {
    throw new Error("数据包中没有与当前五张实验图匹配的有效标注。");
  }
  elements.globalStatus.textContent =
    `已导入 ${imported} 条人工基准，可以继续编辑或重新导出。`;
}

function prepareCard(config, index) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".case-card");
  const description = caseDescriptions[config.label] || {
    title: config.label,
    description: "",
  };
  card.querySelector(".case-number").textContent = `CASE ${String(index + 1).padStart(
    2,
    "0",
  )}`;
  card.querySelector(".case-title").textContent = description.title;
  card.querySelector(".case-description").textContent = description.description;
  card.querySelector(".expected-grid").textContent = config.expectedGrid
    ? `人工基准：${config.expectedGrid.cols} × ${config.expectedGrid.rows}`
    : "人工基准：待你观察后确认";
  const reviewNote = card.querySelector(".review-note");
  if (config.review) {
    reviewNote.hidden = false;
    reviewNote.textContent = `人工复核：${config.review.verdict}。${config.review.note}`;
  }
  elements.caseList.append(fragment);
  return card;
}

async function prepareCase(config, index) {
  const card = prepareCard(config, index);
  const imageUrl = `./fixtures/${fileNameFromPath(config.file)}`;
  const image = await loadImage(imageUrl);
  const analysis = makeAnalysisCanvas(
    image,
    config.crop,
    labState.config.analysisMaxSide,
  );
  const caseState = {
    config,
    card,
    image,
    imageUrl,
    analysis,
    legacy: null,
    hybrid: null,
    selectedCandidate: 0,
    verdict: "",
    groundTruth: null,
    sourceSha256: undefined,
    canvases: {
      source: card.querySelector(".source-canvas"),
      legacy: card.querySelector(".legacy-canvas"),
      hybrid: card.querySelector(".hybrid-canvas"),
    },
  };
  card.querySelector(".source-meta").textContent = `${analysis.canvas.width} × ${analysis.canvas.height} 分析像素`;
  for (const button of card.querySelectorAll("[data-zoom]")) {
    button.addEventListener("click", () => openZoom(caseState, button.dataset.zoom));
  }
  for (const button of card.querySelectorAll("[data-verdict]")) {
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => {
      caseState.verdict =
        caseState.verdict === button.dataset.verdict ? "" : button.dataset.verdict;
      for (const sibling of card.querySelectorAll("[data-verdict]")) {
        sibling.setAttribute(
          "aria-pressed",
          sibling.dataset.verdict === caseState.verdict ? "true" : "false",
        );
      }
    });
  }
  card
    .querySelector(".truth-open")
    .addEventListener("click", () => openTruthEditor(caseState));
  renderAllCanvases(caseState);
  return caseState;
}

async function runCase(caseState, legacyBridge, index, total) {
  setCaseState(caseState, "running", "正在运行旧算法");
  elements.globalStatus.textContent = `正在分析 ${index + 1}/${total}：${
    caseDescriptions[caseState.config.label]?.title || caseState.config.label
  }`;
  try {
    caseState.legacy = await legacyBridge.analyzeFixture({
      url: new URL(caseState.imageUrl, location.href).href,
      crop: caseState.config.crop,
      label: caseState.config.label,
      engine: "legacy",
    });
    updateLegacyMeta(caseState);
    renderResultCanvas(caseState, "legacy");

    setCaseState(caseState, "running", "正在生成新候选");
    caseState.hybrid = await analyzeHybridLattice(caseState.analysis.imageData, {
      maximumResults: 5,
      maximumPoints: 1650,
    });
    const reviewedCandidate = caseState.hybrid.candidates.findIndex((candidate) =>
      candidateMatchesReview(candidate, caseState.config.review),
    );
    caseState.selectedCandidate = reviewedCandidate >= 0 ? reviewedCandidate : 0;
    updateHybridMeta(caseState);
    renderCandidateButtons(caseState);
    updateEvidence(caseState);
    updateGroundTruthControls(caseState);
    renderResultCanvas(caseState, "hybrid");
    setCaseState(caseState, "done", "对照已完成");
  } catch (error) {
    console.error(error);
    setCaseState(caseState, "error", "运行失败");
    caseState.card.querySelector(".legacy-detail").textContent =
      error instanceof Error ? error.message : String(error);
  }
}

async function runAll() {
  if (labState.running) return;
  labState.running = true;
  elements.rerunAll.disabled = true;
  elements.globalStatus.textContent = "正在连接当前网页算法…";
  try {
    const legacyBridge = await waitForLegacyBridge();
    for (let index = 0; index < labState.cases.length; index += 1) {
      await runCase(
        labState.cases[index],
        legacyBridge,
        index,
        labState.cases.length,
      );
    }
    const completed = labState.cases.filter(
      (caseState) => caseState.hybrid?.candidates.length,
    ).length;
    elements.globalStatus.textContent = `已完成 ${completed}/${labState.cases.length} 个对照；点击图片可放大检查。`;
  } catch (error) {
    console.error(error);
    elements.globalStatus.textContent =
      error instanceof Error ? error.message : String(error);
  } finally {
    labState.running = false;
    elements.rerunAll.disabled = false;
  }
}

function resultMeta(caseState, method) {
  if (method === "source") {
    return `${caseState.analysis.canvas.width} × ${caseState.analysis.canvas.height} 分析像素；${expectedText(
      caseState,
    )}`;
  }
  if (method === "legacy") {
    const result = caseState.legacy;
    return result
      ? `${result.cols} × ${result.rows}，置信度 ${Math.round(
          result.confidence * 100,
        )}%，自动判为${result.mode === "photo" ? "成品/照片" : "像素图"}`
      : "旧算法尚未完成";
  }
  const candidate =
    caseState.hybrid?.candidates[caseState.selectedCandidate];
  return candidate
    ? `${candidate.frame.cols} × ${candidate.frame.rows}，周期 ${candidate.period.toFixed(
        1,
      )} px，角度 ${formatAngle(candidate.angle)}，候选得分 ${candidate.score.toFixed(
        3,
      )}`
    : "新算法尚未完成";
}

function renderZoom() {
  if (!labState.zoom) return;
  const { caseState, method } = labState.zoom;
  const source = caseState.analysis.canvas;
  configureCanvas(elements.zoomCanvas, source);
  const context = elements.zoomCanvas.getContext("2d");
  context.clearRect(0, 0, elements.zoomCanvas.width, elements.zoomCanvas.height);
  context.drawImage(source, 0, 0);
  const result =
    method === "legacy"
      ? caseState.legacy
      : method === "hybrid"
        ? caseState.hybrid?.candidates[caseState.selectedCandidate]
        : null;
  if (result) {
    context.save();
    context.globalAlpha = Number(elements.lineOpacity.value) / 100;
    drawGridOverlay(
      context,
      result,
      elements.zoomCanvas.width,
      elements.zoomCanvas.height,
      {
        ...overlayOptions(),
        lineWidth: 0.64,
      },
    );
    context.restore();
  }
  elements.zoomMeta.textContent = resultMeta(caseState, method);
}

function openZoom(caseState, method) {
  labState.zoom = { caseState, method };
  elements.zoomEyebrow.textContent =
    caseDescriptions[caseState.config.label]?.title || caseState.config.label;
  elements.zoomTitle.textContent = methodLabels[method];
  renderZoom();
  elements.zoomDialog.showModal();
}

function resultSummary() {
  const benchmark = summarizeRecognitionBenchmark(
    labState.cases.map(benchmarkCase).filter(Boolean),
  );
  const rows = [
    "豆稿网格识别人工对照",
    `前提：主体外接区域占裁剪图 > ${Math.round(
      labState.config.targetCoverageMinimum * 100,
    )}%`,
    "",
  ];
  if (benchmark.caseCount) {
    rows.push(
      `量化基准：${benchmark.caseCount} 例；Top-1 ${benchmark.top1Count}/${benchmark.caseCount}，Top-3 ${benchmark.top3Count}/${benchmark.caseCount}，正确行列候选召回 ${benchmark.exactGridRecallCount}/${benchmark.caseCount}`,
      "",
    );
  }
  labState.cases.forEach((caseState, index) => {
    const legacy = caseState.legacy;
    const candidate =
      caseState.hybrid?.candidates[caseState.selectedCandidate];
    const caseBenchmark = benchmarkCase(caseState);
    const evaluation =
      caseBenchmark?.evaluations[caseState.selectedCandidate] || null;
    rows.push(
      `${index + 1}. ${
        caseDescriptions[caseState.config.label]?.title || caseState.config.label
      }`,
      `   旧：${legacy ? `${legacy.cols}×${legacy.rows}，${legacy.mode}，${Math.round(legacy.confidence * 100)}%` : "失败"}`,
      `   新：${
        candidate
          ? `${candidate.frame.cols}×${candidate.frame.rows}，p=${candidate.period.toFixed(
              1,
            )}，${formatAngle(candidate.angle)}，score=${candidate.score.toFixed(3)}`
          : "失败"
      }`,
      `   基准：${
        caseState.groundTruth
          ? `${caseState.groundTruth.cols}×${caseState.groundTruth.rows}（本次人工标注）`
          : caseState.config.expectedGrid
          ? `${caseState.config.expectedGrid.cols}×${caseState.config.expectedGrid.rows}`
          : "待人工确认"
      }；判断：${caseState.verdict || "未选择"}`,
      evaluation?.valid
        ? `   量化：角点 ${evaluation.meanCornerErrorCells.toFixed(2)} 格，框重合 ${Math.round(
            evaluation.frameIou * 100,
          )}%，基准最优候选 ${caseBenchmark.bestIndex + 1}`
        : "",
      "",
    );
  });
  return rows.join("\n");
}

async function copySummary() {
  const summary = resultSummary();
  try {
    await navigator.clipboard.writeText(summary);
    elements.globalStatus.textContent = "结果摘要已复制，可以直接粘贴给 Codex。";
  } catch {
    const area = document.createElement("textarea");
    area.value = summary;
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.append(area);
    area.select();
    document.execCommand("copy");
    area.remove();
    elements.globalStatus.textContent = "结果摘要已复制。";
  }
}

async function initialize() {
  const response = await fetch("./recognition-fixtures.json?lab=17", {
    cache: "no-store",
  });
  if (!response.ok) throw new Error("无法读取实验配置");
  labState.config = await response.json();
  elements.globalStatus.textContent = "正在载入五张实验图片…";
  for (let index = 0; index < labState.config.cases.length; index += 1) {
    const caseState = await prepareCase(
      labState.config.cases[index],
      index,
    );
    labState.cases.push(caseState);
    updateGroundTruthControls(caseState);
  }
  await runAll();
}

elements.lineOpacity.addEventListener("input", () => {
  elements.lineOpacityValue.value = `${elements.lineOpacity.value}%`;
  for (const caseState of labState.cases) {
    renderResultCanvas(caseState, "legacy");
    renderResultCanvas(caseState, "hybrid");
  }
  renderZoom();
});

elements.showFrame.addEventListener("change", () => {
  for (const caseState of labState.cases) {
    renderResultCanvas(caseState, "legacy");
    renderResultCanvas(caseState, "hybrid");
  }
  renderZoom();
});

elements.rerunAll.addEventListener("click", runAll);
elements.copySummary.addEventListener("click", copySummary);
elements.exportGroundTruth.addEventListener(
  "click",
  exportGroundTruthPackage,
);
elements.importGroundTruth.addEventListener("change", async () => {
  const [file] = elements.importGroundTruth.files || [];
  if (!file) return;
  try {
    await importGroundTruthPackage(file);
  } catch (error) {
    console.error(error);
    elements.globalStatus.textContent =
      error instanceof Error ? error.message : String(error);
  } finally {
    elements.importGroundTruth.value = "";
  }
});
elements.zoomClose.addEventListener("click", () => elements.zoomDialog.close());
elements.zoomDialog.addEventListener("click", (event) => {
  if (event.target === elements.zoomDialog) elements.zoomDialog.close();
});
elements.truthClose.addEventListener("click", () => elements.truthDialog.close());
elements.truthDialog.addEventListener("click", (event) => {
  if (event.target === elements.truthDialog) elements.truthDialog.close();
});
elements.truthDialog.addEventListener("close", () => {
  hideTruthMagnifier();
  elements.truthCanvas.classList.remove("dragging");
  labState.truth = null;
});
elements.truthCols.addEventListener("input", () =>
  updateTruthDimension("cols", elements.truthCols.value),
);
elements.truthCols.addEventListener("change", () =>
  updateTruthDimension("cols", elements.truthCols.value, true),
);
elements.truthRows.addEventListener("input", () =>
  updateTruthDimension("rows", elements.truthRows.value),
);
elements.truthRows.addEventListener("change", () =>
  updateTruthDimension("rows", elements.truthRows.value, true),
);
elements.truthNote.addEventListener("input", () => {
  if (!labState.truth) return;
  labState.truth.draft.note = elements.truthNote.value;
  elements.truthStatus.textContent =
    "尚未保存：完成调整后点击“保存本例”。";
});
for (const button of document.querySelectorAll("[data-truth-step]")) {
  button.addEventListener("click", () => {
    const name = button.dataset.truthStep;
    const input = name === "cols" ? elements.truthCols : elements.truthRows;
    const value =
      clamp(
        Math.round(Number(input.value) || labState.truth?.draft[name] || 2) +
          Number(button.dataset.delta || 0),
        2,
        200,
      );
    input.value = String(value);
    updateTruthDimension(name, value, true);
  });
}
elements.truthReset.addEventListener("click", resetTruthDraft);
elements.truthClear.addEventListener("click", clearTruthDraft);
elements.truthSave.addEventListener("click", saveTruthDraft);
elements.truthCanvas.addEventListener("pointerdown", startTruthPointer);
elements.truthCanvas.addEventListener("pointermove", moveTruthPointer);
elements.truthCanvas.addEventListener("pointerup", endTruthPointer);
elements.truthCanvas.addEventListener("pointercancel", endTruthPointer);

initialize().catch((error) => {
  console.error(error);
  elements.globalStatus.textContent =
    error instanceof Error ? error.message : String(error);
});
