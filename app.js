(() => {
  "use strict";

  const hasDocument = typeof document !== "undefined";
  const $ = (selector) => (hasDocument ? document.querySelector(selector) : null);
  const $$ = (selector) => (hasDocument ? [...document.querySelectorAll(selector)] : []);

  const elements = {
    hero: $("#hero"),
    workspace: $("#workspace"),
    dropZone: $("#dropZone"),
    fileInput: $("#fileInput"),
    selectButton: $("#selectButton"),
    clipboardCard: $("#clipboardCard"),
    clipboardPreview: $("#clipboardPreview"),
    clipboardPlaceholder: $("#clipboardPlaceholder"),
    clipboardTitle: $("#clipboardTitle"),
    clipboardMeta: $("#clipboardMeta"),
    clipboardButton: $("#clipboardButton"),
    replaceButton: $("#replaceButton"),
    fileName: $("#fileName"),
    sourceCanvas: $("#sourceCanvas"),
    sourceEditor: $("#sourceEditor"),
    patternCanvas: $("#patternCanvas"),
    originalCanvas: $("#originalCanvas"),
    canvasStage: $("#canvasStage"),
    previewPanel: $(".preview-panel"),
    calibrationBar: $("#calibrationBar"),
    rectModeButton: $("#rectModeButton"),
    freeModeButton: $("#freeModeButton"),
    rotationInput: $("#rotationInput"),
    rotationValue: $("#rotationValue"),
    rotationResetButton: $("#rotationResetButton"),
    processing: $("#processing"),
    gridCols: $("#gridCols"),
    gridRows: $("#gridRows"),
    cropLeft: $("#cropLeft"),
    cropRight: $("#cropRight"),
    cropTop: $("#cropTop"),
    cropBottom: $("#cropBottom"),
    sourceMode: $("#sourceMode"),
    resetFrameButton: $("#resetFrameButton"),
    detectButton: $("#detectButton"),
    detectHint: $("#detectHint"),
    denoise: $("#denoise"),
    denoiseValue: $("#denoiseValue"),
    colorMerge: $("#colorMerge"),
    mergeValue: $("#mergeValue"),
    keepTransparent: $("#keepTransparent"),
    paletteSummary: $("#paletteSummary"),
    paletteList: $("#paletteList"),
    addPaletteButton: $("#addPaletteButton"),
    resetPaletteButton: $("#resetPaletteButton"),
    livePatternPreview: $(".live-pattern-preview"),
    livePatternCanvas: $("#livePatternCanvas"),
    livePreviewMeta: $("#livePreviewMeta"),
    livePreviewToggle: $("#livePreviewToggle"),
    colorPickBanner: $("#colorPickBanner"),
    colorPickLabel: $("#colorPickLabel"),
    cancelColorPickButton: $("#cancelColorPickButton"),
    colorEditorDialog: $("#colorEditorDialog"),
    colorEditorTitle: $("#colorEditorTitle"),
    colorEditorClose: $("#colorEditorClose"),
    colorSvField: $("#colorSvField"),
    colorSvCursor: $("#colorSvCursor"),
    colorHueInput: $("#colorHueInput"),
    colorEditorPreview: $("#colorEditorPreview"),
    colorHexInput: $("#colorHexInput"),
    colorEditorCancel: $("#colorEditorCancel"),
    colorEditorApply: $("#colorEditorApply"),
    resultTab: $("#resultTab"),
    originalTab: $("#originalTab"),
    undoButton: $("#undoButton"),
    redoButton: $("#redoButton"),
    zoomOut: $("#zoomOut"),
    zoomIn: $("#zoomIn"),
    zoomValue: $("#zoomValue"),
    gridStatus: $("#gridStatus"),
    colorStatus: $("#colorStatus"),
    confidenceStatus: $("#confidenceStatus"),
    helpButton: $("#helpButton"),
    helpDialog: $("#helpDialog"),
    exportButton: $("#exportButton"),
    exportDialog: $("#exportDialog"),
    toast: $("#toast"),
  };

  const state = {
    image: null,
    imageUrl: "",
    fileName: "",
    cols: 32,
    rows: 32,
    crop: { left: 0, right: 0, top: 0, bottom: 0 },
    frame: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    frameDrag: null,
    frameMode: "rect",
    rotation: 0,
    sourceView: null,
    sourcePan: { x: 0, y: 0 },
    sourcePixelCache: null,
    clipboardFile: null,
    clipboardUrl: "",
    detectedMode: "pixel",
    palette: [],
    detectedPaletteCount: 0,
    detectedPaletteSnapshot: [],
    paletteEdited: false,
    cells: [],
    samples: [],
    confidences: [],
    selectedColor: 0,
    colorPickTarget: -1,
    matchDrag: null,
    previewDrag: null,
    previewPosition: null,
    livePreviewCollapsed: false,
    colorEditorIndex: -1,
    colorEditorPointer: null,
    colorEditorDraft: { h: 0, s: 1, v: 1 },
    zoom: 1,
    sourceZoom: 1,
    view: "result",
    renderCellSize: 20,
    renderScale: 1,
    patternLogicalWidth: 1,
    patternLogicalHeight: 1,
    margin: 25,
    history: [],
    future: [],
    processingToken: 0,
    detectionConfidence: 0,
  };

  const labels = {
    denoise: ["关闭", "轻微", "标准", "强力"],
    merge: ["关闭", "轻微", "适中", "明显", "强力"],
  };

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const sleepFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const defaultFrame = () => [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ];

  function viewPointToSource(point) {
    if (!state.image) return point;
    const radians = (state.rotation * Math.PI) / 180;
    const cosine = Math.cos(radians);
    const sine = Math.sin(radians);
    const width = state.image.naturalWidth;
    const height = state.image.naturalHeight;
    const zoom = Math.max(0.01, state.sourceZoom);
    const dx = (point.x - 0.5 - state.sourcePan.x) * width;
    const dy = (point.y - 0.5 - state.sourcePan.y) * height;
    return {
      x: (cosine * dx + sine * dy) / (width * zoom) + 0.5,
      y: (-sine * dx + cosine * dy) / (height * zoom) + 0.5,
    };
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => elements.toast.classList.remove("show"), 2400);
  }

  function safeShowModal(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function safeCloseModal(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function setClipboardCandidate(file) {
    if (!file || !file.type.startsWith("image/")) return false;
    if (state.clipboardUrl) URL.revokeObjectURL(state.clipboardUrl);
    state.clipboardFile = file;
    state.clipboardUrl = URL.createObjectURL(file);
    elements.clipboardPreview.src = state.clipboardUrl;
    elements.clipboardPreview.hidden = false;
    elements.clipboardPlaceholder.hidden = true;
    elements.clipboardTitle.textContent = "检测到剪贴板图片";
    elements.clipboardMeta.textContent = `${file.type.replace("image/", "").toUpperCase()} · ${Math.max(1, Math.round(file.size / 1024))} KB`;
    elements.clipboardButton.textContent = "使用这张图片";
    elements.clipboardCard.classList.add("ready");
    return true;
  }

  async function readClipboardImage({ quiet = false } = {}) {
    if (!navigator.clipboard?.read) {
      if (!quiet) showToast("当前浏览器不允许主动读取；请直接按 Ctrl/⌘ + V");
      return false;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((candidate) => candidate.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        const extension = type.split("/")[1]?.replace("jpeg", "jpg") || "png";
        return setClipboardCandidate(new File([blob], `剪贴板图片.${extension}`, { type }));
      }
      if (!quiet) showToast("剪贴板里暂时没有图片");
    } catch {
      if (!quiet) showToast("无法读取剪贴板；请按 Ctrl/⌘ + V 粘贴");
    }
    return false;
  }

  async function detectGrantedClipboardImage() {
    if (elements.hero.hidden || state.clipboardFile || !navigator.clipboard?.read) return;
    if (!navigator.permissions?.query) return;
    try {
      const permission = await navigator.permissions.query({ name: "clipboard-read" });
      if (permission.state === "granted") {
        await readClipboardImage({ quiet: true });
      } else if (permission.state === "prompt") {
        elements.clipboardMeta.textContent = "首次点击会由浏览器询问读取权限；也可直接按 Ctrl/⌘ + V";
      }
    } catch {
      // Permission querying is not implemented consistently; direct paste still works.
    }
  }

  function getSettings() {
    try {
      return JSON.parse(localStorage.getItem("dougao-settings") || "{}");
    } catch {
      return {};
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(
        "dougao-settings",
        JSON.stringify({
          denoise: elements.denoise.value,
          merge: elements.colorMerge.value,
          keepTransparent: elements.keepTransparent.checked,
        }),
      );
    } catch {
      // Private browsing can disable local storage. The app still works without it.
    }
  }

  function restoreSettings() {
    const saved = getSettings();
    if (saved.denoise != null) elements.denoise.value = saved.denoise;
    if (saved.merge != null) elements.colorMerge.value = saved.merge;
    if (saved.keepTransparent != null) elements.keepTransparent.checked = saved.keepTransparent;
    updateRangeLabels();
  }

  function updateRangeLabels() {
    elements.denoiseValue.value = labels.denoise[Number(elements.denoise.value)];
    elements.mergeValue.value = labels.merge[Number(elements.colorMerge.value)];
  }

  function readCrop(syncFrame = false) {
    const crop = {
      left: clamp(Number(elements.cropLeft.value) || 0, 0, 45),
      right: clamp(Number(elements.cropRight.value) || 0, 0, 45),
      top: clamp(Number(elements.cropTop.value) || 0, 0, 45),
      bottom: clamp(Number(elements.cropBottom.value) || 0, 0, 45),
    };
    if (crop.left + crop.right > 90) crop.right = 90 - crop.left;
    if (crop.top + crop.bottom > 90) crop.bottom = 90 - crop.top;
    state.crop = crop;
    for (const side of ["Left", "Right", "Top", "Bottom"]) {
      elements[`crop${side}`].value = crop[side.toLowerCase()];
    }
    if (syncFrame) {
      const left = crop.left / 100;
      const right = 1 - crop.right / 100;
      const top = crop.top / 100;
      const bottom = 1 - crop.bottom / 100;
      state.frame = [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
      ];
    }
    return crop;
  }

  function syncCropFromFrame() {
    const xs = state.frame.map((point) => point.x);
    const ys = state.frame.map((point) => point.y);
    state.crop = {
      left: clamp(Math.round(Math.min(...xs) * 1000) / 10, 0, 45),
      right: clamp(Math.round((1 - Math.max(...xs)) * 1000) / 10, 0, 45),
      top: clamp(Math.round(Math.min(...ys) * 1000) / 10, 0, 45),
      bottom: clamp(Math.round((1 - Math.max(...ys)) * 1000) / 10, 0, 45),
    };
    for (const side of ["Left", "Right", "Top", "Bottom"]) {
      elements[`crop${side}`].value = state.crop[side.toLowerCase()];
    }
  }

  function getFramePixels() {
    const width = state.image?.naturalWidth || 1;
    const height = state.image?.naturalHeight || 1;
    return state.frame.map(viewPointToSource).map((point) => ({
      x: point.x * width,
      y: point.y * height,
    }));
  }

  function getCropRect() {
    const { naturalWidth: width, naturalHeight: height } = state.image;
    const sourceFrame = state.frame.map(viewPointToSource);
    const xs = sourceFrame.map((point) => point.x * width);
    const ys = sourceFrame.map((point) => point.y * height);
    const x = Math.round(Math.min(...xs));
    const y = Math.round(Math.min(...ys));
    const right = Math.round(width - Math.max(...xs));
    const bottom = Math.round(height - Math.max(...ys));
    return {
      x,
      y,
      width: Math.max(2, width - x - right),
      height: Math.max(2, height - y - bottom),
    };
  }

  function getSourcePixelData(maxSide = 1600) {
    if (state.sourcePixelCache?.maxSide === maxSide) return state.sourcePixelCache;
    const scale = Math.min(1, maxSide / Math.max(state.image.naturalWidth, state.image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(state.image.naturalWidth * scale));
    canvas.height = Math.max(2, Math.round(state.image.naturalHeight * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(state.image, 0, 0, canvas.width, canvas.height);
    state.sourcePixelCache = {
      maxSide,
      width: canvas.width,
      height: canvas.height,
      scaleX: canvas.width / state.image.naturalWidth,
      scaleY: canvas.height / state.image.naturalHeight,
      data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    };
    return state.sourcePixelCache;
  }

  function detectImageKind() {
    const source = getSourcePixelData(240);
    const buckets = new Set();
    let softTransitions = 0;
    let comparisons = 0;
    const stepX = Math.max(1, Math.floor(source.width / 40));
    const stepY = Math.max(1, Math.floor(source.height / 40));
    for (let y = 0; y < source.height; y += stepY) {
      for (let x = 0; x < source.width; x += stepX) {
        const index = (y * source.width + x) * 4;
        const color = [source.data[index], source.data[index + 1], source.data[index + 2]];
        buckets.add(`${color[0] >> 3},${color[1] >> 3},${color[2] >> 3}`);
        if (x >= stepX) {
          const left = index - stepX * 4;
          const difference =
            Math.abs(color[0] - source.data[left]) +
            Math.abs(color[1] - source.data[left + 1]) +
            Math.abs(color[2] - source.data[left + 2]);
          if (difference >= 3 && difference <= 42) softTransitions += 1;
          comparisons += 1;
        }
        if (y >= stepY) {
          const above = index - stepY * source.width * 4;
          const difference =
            Math.abs(color[0] - source.data[above]) +
            Math.abs(color[1] - source.data[above + 1]) +
            Math.abs(color[2] - source.data[above + 2]);
          if (difference >= 3 && difference <= 42) softTransitions += 1;
          comparisons += 1;
        }
      }
    }
    const softRatio = softTransitions / Math.max(1, comparisons);
    return buckets.size > 230 || softRatio > 0.36 ? "photo" : "pixel";
  }

  function activeSourceMode() {
    return elements.sourceMode.value === "auto" ? state.detectedMode : elements.sourceMode.value;
  }

  function suggestPhotoFrame() {
    const source = getSourcePixelData(320);
    const { width, height, data } = source;
    const cornerSize = Math.max(3, Math.round(Math.min(width, height) * 0.035));
    let background = { r: 0, g: 0, b: 0, count: 0 };
    for (const [startX, startY] of [
      [0, 0],
      [width - cornerSize, 0],
      [0, height - cornerSize],
      [width - cornerSize, height - cornerSize],
    ]) {
      for (let y = startY; y < startY + cornerSize; y += 1) {
        for (let x = startX; x < startX + cornerSize; x += 1) {
          const index = (y * width + x) * 4;
          background.r += data[index];
          background.g += data[index + 1];
          background.b += data[index + 2];
          background.count += 1;
        }
      }
    }
    background.r /= background.count;
    background.g /= background.count;
    background.b /= background.count;

    const mask = new Uint8Array(width * height);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = (y * width + x) * 4;
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const saturation = Math.max(r, g, b) - Math.min(r, g, b);
        const backgroundDistance =
          Math.abs(r - background.r) + Math.abs(g - background.g) + Math.abs(b - background.b);
        const luminance = (r * 299 + g * 587 + b * 114) / 1000;
        if (backgroundDistance > 64 && (saturation > 19 || luminance < 178)) mask[y * width + x] = 1;
      }
    }

    const visited = new Uint8Array(mask.length);
    let best = null;
    const queueX = new Int32Array(mask.length);
    const queueY = new Int32Array(mask.length);
    for (let startY = 1; startY < height - 1; startY += 1) {
      for (let startX = 1; startX < width - 1; startX += 1) {
        const start = startY * width + startX;
        if (!mask[start] || visited[start]) continue;
        let head = 0;
        let tail = 1;
        let count = 0;
        let minX = startX;
        let maxX = startX;
        let minY = startY;
        let maxY = startY;
        queueX[0] = startX;
        queueY[0] = startY;
        visited[start] = 1;
        while (head < tail) {
          const x = queueX[head];
          const y = queueY[head];
          head += 1;
          count += 1;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nextX = x + dx;
            const nextY = y + dy;
            const next = nextY * width + nextX;
            if (
              nextX > 0 &&
              nextY > 0 &&
              nextX < width - 1 &&
              nextY < height - 1 &&
              mask[next] &&
              !visited[next]
            ) {
              visited[next] = 1;
              queueX[tail] = nextX;
              queueY[tail] = nextY;
              tail += 1;
            }
          }
        }
        const boxWidth = maxX - minX + 1;
        const boxHeight = maxY - minY + 1;
        const boxArea = boxWidth * boxHeight;
        if (boxWidth < width * 0.12 || boxHeight < height * 0.12 || boxArea < width * height * 0.025) {
          continue;
        }
        const density = count / boxArea;
        const score = count * (0.65 + Math.min(0.7, density));
        if (!best || score > best.score) best = { minX, maxX, minY, maxY, score };
      }
    }

    if (!best) return false;
    // A key ring or loose accessory can be connected to the bead rectangle.
    // Trim sparse tails from the chosen component before adding a small
    // allowance for the pale outer bead row.
    const componentWidth = best.maxX - best.minX + 1;
    const componentHeight = best.maxY - best.minY + 1;
    const columnCounts = new Int32Array(componentWidth);
    const rowCounts = new Int32Array(componentHeight);
    for (let y = best.minY; y <= best.maxY; y += 1) {
      for (let x = best.minX; x <= best.maxX; x += 1) {
        if (!mask[y * width + x]) continue;
        columnCounts[x - best.minX] += 1;
        rowCounts[y - best.minY] += 1;
      }
    }
    const usefulColumns = [];
    const usefulRows = [];
    for (let index = 0; index < columnCounts.length; index += 1) {
      if (columnCounts[index] >= componentHeight * 0.28) usefulColumns.push(index);
    }
    for (let index = 0; index < rowCounts.length; index += 1) {
      if (rowCounts[index] >= componentWidth * 0.28) usefulRows.push(index);
    }
    if (usefulColumns.length >= componentWidth * 0.45) {
      best.minX += usefulColumns[0];
      best.maxX = best.minX + usefulColumns[usefulColumns.length - 1] - usefulColumns[0];
    }
    if (usefulRows.length >= componentHeight * 0.45) {
      best.minY += usefulRows[0];
      best.maxY = best.minY + usefulRows[usefulRows.length - 1] - usefulRows[0];
    }

    const photoMode = activeSourceMode() === "photo";
    const marginX = (best.maxX - best.minX + 1) * 0.055;
    const marginY = (best.maxY - best.minY + 1) * (photoMode ? 0.055 : 0.02);
    const left = clamp((best.minX - marginX) / width, 0, 1);
    const right = clamp((best.maxX + marginX) / width, 0, 1);
    const top = clamp((best.minY - marginY) / height, 0, 1);
    const bottom = clamp((best.maxY + marginY) / height, 0, 1);
    state.frame = [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ];
    syncCropFromFrame();
    return true;
  }

  async function loadFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      showToast("请选择 PNG、JPG、WebP、GIF 或 BMP 图片");
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      showToast("图片超过 40 MB，建议先缩小后再试");
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.decoding = "async";
    image.onload = async () => {
      if (image.naturalWidth < 2 || image.naturalHeight < 2) {
        URL.revokeObjectURL(url);
        showToast("图片尺寸太小，无法识别网格");
        return;
      }
      if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
      state.image = image;
      state.imageUrl = url;
      state.fileName = file.name.replace(/\.[^.]+$/, "") || "未命名图稿";
      state.crop = { left: 0, right: 0, top: 0, bottom: 0 };
      state.frame = defaultFrame();
      state.frameDrag = null;
      state.frameMode = "rect";
      state.rotation = 0;
      state.sourceZoom = 1;
      state.sourcePan = { x: 0, y: 0 };
      state.view = "source";
      state.sourcePixelCache = null;
      state.detectedMode = detectImageKind();
      suggestPhotoFrame();
      state.palette = [];
      state.detectedPaletteCount = 0;
      state.detectedPaletteSnapshot = [];
      state.paletteEdited = false;
      state.cells = [];
      state.samples = [];
      state.confidences = [];
      state.selectedColor = 0;
      state.colorPickTarget = -1;
      state.matchDrag = null;
      state.previewDrag = null;
      state.previewPosition = null;
      setLivePreviewCollapsed(window.matchMedia("(max-width: 680px)").matches);
      elements.livePatternPreview.style.removeProperty("left");
      elements.livePatternPreview.style.removeProperty("top");
      elements.livePatternPreview.style.removeProperty("right");
      state.history = [];
      state.future = [];
      elements.fileName.textContent = state.fileName;
      syncCropFromFrame();
      elements.hero.hidden = true;
      elements.workspace.hidden = false;
      document.body.classList.add("editing");
      elements.rotationInput.value = "0";
      elements.rotationValue.value = "0.0°";
      updateFrameMode();
      updateView();
      drawSourceThumb();
      window.scrollTo({ top: 0, behavior: "smooth" });
      await autoDetect(true);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      showToast("无法读取这张图片，文件可能已损坏");
    };
    image.src = url;
  }

  function solveLinearSystem(matrix, values) {
    const size = values.length;
    const rows = matrix.map((row, index) => [...row, values[index]]);
    for (let pivot = 0; pivot < size; pivot += 1) {
      let largest = pivot;
      for (let row = pivot + 1; row < size; row += 1) {
        if (Math.abs(rows[row][pivot]) > Math.abs(rows[largest][pivot])) largest = row;
      }
      if (Math.abs(rows[largest][pivot]) < 1e-9) return null;
      [rows[pivot], rows[largest]] = [rows[largest], rows[pivot]];
      const divisor = rows[pivot][pivot];
      for (let col = pivot; col <= size; col += 1) rows[pivot][col] /= divisor;
      for (let row = 0; row < size; row += 1) {
        if (row === pivot) continue;
        const factor = rows[row][pivot];
        for (let col = pivot; col <= size; col += 1) rows[row][col] -= factor * rows[pivot][col];
      }
    }
    return rows.map((row) => row[size]);
  }

  function createFrameProjector(frame = state.frame) {
    const source = [
      { u: 0, v: 0, point: frame[0] },
      { u: 1, v: 0, point: frame[1] },
      { u: 1, v: 1, point: frame[2] },
      { u: 0, v: 1, point: frame[3] },
    ];
    const matrix = [];
    const values = [];
    for (const { u, v, point } of source) {
      matrix.push([u, v, 1, 0, 0, 0, -u * point.x, -v * point.x]);
      values.push(point.x);
      matrix.push([0, 0, 0, u, v, 1, -u * point.y, -v * point.y]);
      values.push(point.y);
    }
    const solution = solveLinearSystem(matrix, values);
    if (!solution) {
      return (u, v) => ({
        x:
          frame[0].x * (1 - u) * (1 - v) +
          frame[1].x * u * (1 - v) +
          frame[2].x * u * v +
          frame[3].x * (1 - u) * v,
        y:
          frame[0].y * (1 - u) * (1 - v) +
          frame[1].y * u * (1 - v) +
          frame[2].y * u * v +
          frame[3].y * (1 - u) * v,
      });
    }
    const [a, b, c, d, e, f, g, h] = solution;
    return (u, v) => {
      const denominator = g * u + h * v + 1;
      return {
        x: (a * u + b * v + c) / denominator,
        y: (d * u + e * v + f) / denominator,
      };
    };
  }

  function canvasFramePoint(point) {
    const view = state.sourceView;
    return {
      x: view.x + point.x * view.width,
      y: view.y + point.y * view.height,
    };
  }

  function sizeSourceEditor() {
    if (!state.image || state.view === "result") {
      elements.canvasStage.style.removeProperty("height");
      return;
    }
    const width = Math.max(1, elements.canvasStage.clientWidth);
    const aspect = state.image.naturalHeight / Math.max(1, state.image.naturalWidth);
    const height = `${Math.max(240, Math.round(width * aspect))}px`;
    if (elements.canvasStage.style.height !== height) elements.canvasStage.style.height = height;
  }

  function drawSourceThumb() {
    if (!state.image) return;
    sizeSourceEditor();
    const canvas = elements.sourceCanvas;
    const box = elements.sourceEditor.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2, 3200 / Math.max(box.width, box.height));
    const pixelWidth = Math.max(260, Math.round(box.width * dpr));
    const pixelHeight = Math.max(180, Math.round(box.height * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const width = canvas.width * state.sourceZoom;
    const height = canvas.height * state.sourceZoom;
    const x = (canvas.width - width) / 2 + state.sourcePan.x * canvas.width;
    const y = (canvas.height - height) / 2 + state.sourcePan.y * canvas.height;
    state.sourceView = { x: 0, y: 0, width: canvas.width, height: canvas.height, dpr };
    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.rotate((state.rotation * Math.PI) / 180);
    ctx.drawImage(state.image, -width / 2, -height / 2, width, height);
    ctx.restore();

    const frame = state.frame.map(canvasFramePoint);
    const projector = createFrameProjector();
    ctx.save();
    ctx.fillStyle = "rgba(18, 20, 19, 0.58)";
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.moveTo(frame[0].x, frame[0].y);
    for (let index = 1; index < frame.length; index += 1) ctx.lineTo(frame[index].x, frame[index].y);
    ctx.closePath();
    ctx.fill("evenodd");

    const strokeCalibrationGridLine = (start, end, major) => {
      ctx.shadowColor = "transparent";
      ctx.globalCompositeOperation = "difference";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
      ctx.lineWidth = (major ? 1.65 : 1.05) * dpr;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = major ? "rgba(232, 22, 31, 0.98)" : "rgba(236, 28, 36, 0.9)";
      ctx.lineWidth = (major ? 0.82 : 0.48) * dpr;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    };
    for (let col = 0; col <= state.cols; col += 1) {
      const u = col / state.cols;
      const start = canvasFramePoint(projector(u, 0));
      const end = canvasFramePoint(projector(u, 1));
      strokeCalibrationGridLine(start, end, col % 5 === 0);
    }
    for (let row = 0; row <= state.rows; row += 1) {
      const v = row / state.rows;
      const start = canvasFramePoint(projector(0, v));
      const end = canvasFramePoint(projector(1, v));
      strokeCalibrationGridLine(start, end, row % 5 === 0);
    }

    const traceFrame = () => {
      ctx.beginPath();
      ctx.moveTo(frame[0].x, frame[0].y);
      for (let index = 1; index < frame.length; index += 1) ctx.lineTo(frame[index].x, frame[index].y);
      ctx.closePath();
    };
    ctx.shadowColor = "transparent";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.98)";
    ctx.lineWidth = 1.8 * dpr;
    ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
    ctx.shadowBlur = 1.1 * dpr;
    traceFrame();
    ctx.stroke();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    frame.forEach((point, index) => {
      ctx.fillStyle = state.frameMode === "free" && index === 0 ? "#ff735f" : "#ffe34f";
      ctx.strokeStyle = "rgba(4, 12, 16, 0.96)";
      ctx.lineWidth = 3 * dpr;
      ctx.beginPath();
      if (state.frameMode === "rect") {
        const size = 14 * dpr;
        ctx.rect(point.x - size / 2, point.y - size / 2, size, size);
      } else {
        ctx.arc(point.x, point.y, 8 * dpr, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
    const picking = state.colorPickTarget >= 0 && state.palette[state.colorPickTarget];
    canvas.style.cursor = picking ? "crosshair" : "grab";
    canvas.setAttribute(
      "aria-label",
      picking
        ? `正在为图纸颜色 ${state.palette[state.colorPickTarget].name} 吸取匹配色；点击原图中的目标颜色`
        : `${activeSourceMode() === "photo" ? "实物照片" : "像素图"}大图校准，当前 ${state.cols} 列 × ${state.rows} 行，旋转 ${state.rotation.toFixed(1)} 度；框内拖动整个框，框外拖动图片，角点调整边界`,
    );
    canvas.dataset.panX = state.sourcePan.x.toFixed(4);
    canvas.dataset.panY = state.sourcePan.y.toFixed(4);
    canvas.dataset.sourceZoom = state.sourceZoom.toFixed(2);
    if (state.view !== "result") {
      elements.zoomValue.value = `${Math.round(state.sourceZoom * 100)}%`;
    }
  }

  function readSourcePixel(source, normalizedX, normalizedY) {
    if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) {
      return [0, 0, 0, 0];
    }
    const x = clamp(normalizedX * (source.width - 1), 0, source.width - 1);
    const y = clamp(normalizedY * (source.height - 1), 0, source.height - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(source.width - 1, x0 + 1);
    const y1 = Math.min(source.height - 1, y0 + 1);
    const fx = x - x0;
    const fy = y - y0;
    const result = [0, 0, 0, 0];
    for (const [sampleX, sampleY, weight] of [
      [x0, y0, (1 - fx) * (1 - fy)],
      [x1, y0, fx * (1 - fy)],
      [x0, y1, (1 - fx) * fy],
      [x1, y1, fx * fy],
    ]) {
      const index = (sampleY * source.width + sampleX) * 4;
      for (let channel = 0; channel < 4; channel += 1) result[channel] += source.data[index + channel] * weight;
    }
    return result;
  }

  function makeRectifiedCanvas(maxSide = 520) {
    const points = getFramePixels();
    const top = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    const bottom = Math.hypot(points[2].x - points[3].x, points[2].y - points[3].y);
    const left = Math.hypot(points[3].x - points[0].x, points[3].y - points[0].y);
    const right = Math.hypot(points[2].x - points[1].x, points[2].y - points[1].y);
    const naturalWidth = Math.max(2, (top + bottom) / 2);
    const naturalHeight = Math.max(2, (left + right) / 2);
    const scale = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(naturalWidth * scale));
    canvas.height = Math.max(2, Math.round(naturalHeight * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const output = ctx.createImageData(canvas.width, canvas.height);
    const source = getSourcePixelData(Math.max(900, Math.min(1800, maxSide * 3)));
    const projector = createFrameProjector();
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const point = viewPointToSource(
          projector((x + 0.5) / canvas.width, (y + 0.5) / canvas.height),
        );
        const color = readSourcePixel(source, point.x, point.y);
        const index = (y * canvas.width + x) * 4;
        const alpha = color[3] / 255;
        if (!elements.keepTransparent.checked && alpha < 1) {
          output.data[index] = color[0] * alpha + 255 * (1 - alpha);
          output.data[index + 1] = color[1] * alpha + 255 * (1 - alpha);
          output.data[index + 2] = color[2] * alpha + 255 * (1 - alpha);
          output.data[index + 3] = 255;
        } else {
          output.data[index] = color[0];
          output.data[index + 1] = color[1];
          output.data[index + 2] = color[2];
          output.data[index + 3] = color[3];
        }
      }
    }
    ctx.putImageData(output, 0, 0);
    return canvas;
  }

  function makeAnalysisCanvas(maxSide = 520) {
    return makeRectifiedCanvas(maxSide);
  }

  function framePolygonArea(frame) {
    let area = 0;
    for (let index = 0; index < frame.length; index += 1) {
      const current = frame[index];
      const next = frame[(index + 1) % frame.length];
      area += current.x * next.y - next.x * current.y;
    }
    return area / 2;
  }

  function frameIsConvex(frame) {
    if (Math.abs(framePolygonArea(frame)) < 0.0025) return false;
    let sign = 0;
    for (let index = 0; index < frame.length; index += 1) {
      const a = frame[index];
      const b = frame[(index + 1) % frame.length];
      const c = frame[(index + 2) % frame.length];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) < 1e-6) continue;
      const currentSign = Math.sign(cross);
      if (sign && currentSign !== sign) return false;
      sign = currentSign;
    }
    return true;
  }

  function pointerImagePoint(event) {
    const rect = elements.sourceCanvas.getBoundingClientRect();
    const canvasX = ((event.clientX - rect.left) / rect.width) * elements.sourceCanvas.width;
    const canvasY = ((event.clientY - rect.top) / rect.height) * elements.sourceCanvas.height;
    const view = state.sourceView;
    return {
      x: clamp((canvasX - view.x) / view.width, 0, 1),
      y: clamp((canvasY - view.y) / view.height, 0, 1),
      canvasX,
      canvasY,
    };
  }

  function pointInsideFrame(point) {
    let sign = 0;
    for (let index = 0; index < state.frame.length; index += 1) {
      const a = state.frame[index];
      const b = state.frame[(index + 1) % state.frame.length];
      const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
      if (Math.abs(cross) < 1e-6) continue;
      if (!sign) sign = Math.sign(cross);
      else if (Math.sign(cross) !== sign) return false;
    }
    return true;
  }

  function startFramePointer(event) {
    if (!state.image || event.button > 0) return;
    if (pickColorFromSourceEvent(event)) {
      event.preventDefault();
      return;
    }
    const point = pointerImagePoint(event);
    const handleRadius = 18 * state.sourceView.dpr;
    let corner = -1;
    let nearest = Infinity;
    state.frame.forEach((framePoint, index) => {
      const canvasPoint = canvasFramePoint(framePoint);
      const distance = Math.hypot(canvasPoint.x - point.canvasX, canvasPoint.y - point.canvasY);
      if (distance < handleRadius && distance < nearest) {
        corner = index;
        nearest = distance;
      }
    });
    const inside = pointInsideFrame(point);
    state.frameDrag = {
      type: corner >= 0 ? "corner" : inside ? "frame" : "pan",
      corner,
      start: { x: point.x, y: point.y },
      initial: state.frame.map((framePoint) => ({ ...framePoint })),
      initialPan: { ...state.sourcePan },
    };
    elements.sourceCanvas.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function moveFramePointer(event) {
    const point = pointerImagePoint(event);
    if (!state.frameDrag) {
      if (state.colorPickTarget >= 0) {
        elements.sourceCanvas.style.cursor = "crosshair";
        return;
      }
      const handleRadius = 18 * state.sourceView.dpr;
      let corner = -1;
      let nearest = Infinity;
      state.frame.forEach((framePoint, index) => {
        const canvasPoint = canvasFramePoint(framePoint);
        const distance = Math.hypot(canvasPoint.x - point.canvasX, canvasPoint.y - point.canvasY);
        if (distance < handleRadius && distance < nearest) {
          corner = index;
          nearest = distance;
        }
      });
      elements.sourceCanvas.style.cursor =
        corner >= 0
          ? corner % 2 === 0
            ? "nwse-resize"
            : "nesw-resize"
          : pointInsideFrame(point)
            ? "move"
            : "grab";
      return;
    }
    const drag = state.frameDrag;
    if (drag.type === "corner") {
      if (state.frameMode === "rect") {
        const opposite = drag.initial[(drag.corner + 2) % 4];
        const left = Math.min(point.x, opposite.x);
        const right = Math.max(point.x, opposite.x);
        const top = Math.min(point.y, opposite.y);
        const bottom = Math.max(point.y, opposite.y);
        if (right - left >= 0.03 && bottom - top >= 0.03) {
          state.frame = [
            { x: left, y: top },
            { x: right, y: top },
            { x: right, y: bottom },
            { x: left, y: bottom },
          ];
        }
      } else {
        const next = drag.initial.map((framePoint) => ({ ...framePoint }));
        next[drag.corner] = { x: point.x, y: point.y };
        if (frameIsConvex(next)) state.frame = next;
      }
      syncCropFromFrame();
    } else if (drag.type === "frame") {
      const desiredX = point.x - drag.start.x;
      const desiredY = point.y - drag.start.y;
      const minX = Math.min(...drag.initial.map((framePoint) => framePoint.x));
      const maxX = Math.max(...drag.initial.map((framePoint) => framePoint.x));
      const minY = Math.min(...drag.initial.map((framePoint) => framePoint.y));
      const maxY = Math.max(...drag.initial.map((framePoint) => framePoint.y));
      const deltaX = clamp(desiredX, -minX, 1 - maxX);
      const deltaY = clamp(desiredY, -minY, 1 - maxY);
      state.frame = drag.initial.map((framePoint) => ({
        x: framePoint.x + deltaX,
        y: framePoint.y + deltaY,
      }));
      syncCropFromFrame();
    } else {
      const deltaX = point.x - drag.start.x;
      const deltaY = point.y - drag.start.y;
      const limit = Math.max(1, (state.sourceZoom + 1) / 2);
      state.sourcePan = {
        x: clamp(drag.initialPan.x + deltaX, -limit, limit),
        y: clamp(drag.initialPan.y + deltaY, -limit, limit),
      };
    }
    drawSourceThumb();
    event.preventDefault();
  }

  function finishFramePointer(event) {
    if (!state.frameDrag) return;
    state.frameDrag = null;
    elements.sourceCanvas.releasePointerCapture?.(event.pointerId);
    elements.sourceCanvas.style.cursor = "grab";
    syncCropFromFrame();
    drawSourceThumb();
    processImage({ resetHistory: true, preservePalette: true });
    event.preventDefault();
  }

  function buildAxisEdges(imageData, axis, emphasizeSparse = false) {
    const { data, width, height } = imageData;
    const length = axis === "x" ? width : height;
    const cross = axis === "x" ? height : width;
    const step = Math.max(1, Math.floor(cross / 90));
    const edges = new Float32Array(length);

    for (let position = 1; position < length; position += 1) {
      let total = 0;
      let count = 0;
      const sparseEdges = emphasizeSparse ? [] : null;
      for (let other = 0; other < cross; other += step) {
        if (emphasizeSparse) {
          const crossRatio = other / Math.max(1, cross - 1);
          if (crossRatio > 0.16 && crossRatio < 0.84) continue;
        }
        const x1 = axis === "x" ? position - 1 : other;
        const y1 = axis === "x" ? other : position - 1;
        const x2 = axis === "x" ? position : other;
        const y2 = axis === "x" ? other : position;
        const a = (y1 * width + x1) * 4;
        const b = (y2 * width + x2) * 4;
        const alpha = Math.min(data[a + 3], data[b + 3]) / 255;
        const difference =
          alpha *
          (Math.abs(data[a] - data[b]) * 0.3 +
            Math.abs(data[a + 1] - data[b + 1]) * 0.55 +
            Math.abs(data[a + 2] - data[b + 2]) * 0.15);
        total += difference;
        if (sparseEdges) sparseEdges.push(difference);
        count += 1;
      }
      if (sparseEdges?.length) {
        sparseEdges.sort((a, b) => b - a);
        const topCount = Math.max(2, Math.ceil(sparseEdges.length * 0.12));
        let topTotal = 0;
        for (let index = 0; index < topCount; index += 1) topTotal += sparseEdges[index];
        edges[position] = (topTotal / topCount) * 0.78 + (total / count) * 0.22;
      } else {
        edges[position] = count ? total / count : 0;
      }
    }
    return edges;
  }

  function scoreGridCount(edges, count, nativeCount) {
    const length = edges.length;
    const cell = length / count;
    if (cell < 1) return -Infinity;

    // A one-source-pixel cell has no measurable interior. Keep it as a
    // possible native pixel-art resolution, but prefer a larger repeating
    // block whenever the edge profile provides real periodic evidence.
    if (cell < 1.6) {
      let total = 0;
      for (let index = 1; index < length; index += 1) total += edges[index];
      const nativeWeight = count === nativeCount && nativeCount === length ? 0.12 : 0.04;
      return (total / Math.max(1, length - 1)) * nativeWeight;
    }

    let boundary = 0;
    let inside = 0;
    let boundaryCount = 0;
    let insideCount = 0;
    const radius = cell >= 7 ? Math.min(3, Math.floor(cell * 0.14)) : 0;

    for (let i = 1; i < count; i += 1) {
      const at = i * cell;
      for (let delta = -radius; delta <= radius; delta += 1) {
        const index = clamp(Math.round(at + delta), 1, length - 1);
        boundary += edges[index];
        boundaryCount += 1;
      }
      for (const phase of [0.32, 0.5, 0.68]) {
        const index = clamp(Math.round((i - 1 + phase) * cell), 1, length - 1);
        inside += edges[index];
        insideCount += 1;
      }
    }

    const contrast = boundary / Math.max(1, boundaryCount) - inside / Math.max(1, insideCount);
    const strength = boundary / Math.max(1, boundaryCount);
    const usefulRange = count >= 8 && count <= 120 ? 1 : 0.78;
    return (contrast * 0.92 + strength * 0.08) * usefulRange;
  }

  function inferAxisCount(edges, originalLength) {
    const maxCount = Math.min(160, originalLength, Math.floor(edges.length));
    const candidates = [];
    for (let count = 2; count <= maxCount; count += 1) {
      candidates.push({ count, score: scoreGridCount(edges, count, originalLength) });
    }
    candidates.sort((a, b) => b.score - a.score);
    let best = candidates[0] || { count: Math.min(32, originalLength), score: 0 };

    // Compression can make a harmonic (for example 40 instead of 20) score
    // fractionally higher. Prefer the simpler divisor when it explains nearly
    // the same edge pattern; genuine one-pixel detail still keeps the denser
    // candidate ahead.
    for (const divisor of [2, 3, 4]) {
      const simplerCount = Math.round(best.count / divisor);
      if (simplerCount < 2 || Math.abs(best.count / divisor - simplerCount) > 0.08) continue;
      const simpler = candidates.find((candidate) => candidate.count === simplerCount);
      if (simpler && simpler.score > 0 && simpler.score >= best.score * 0.92) {
        best = simpler;
        break;
      }
    }

    const distinct = candidates.find((candidate) => Math.abs(candidate.count - best.count) > 2) || candidates[1] || best;
    const separation = best.score <= 0 ? 0 : (best.score - distinct.score) / Math.max(1, Math.abs(best.score));
    const confidence = clamp(0.36 + separation * 1.35 + best.score / 80, 0.25, 0.94);
    return { ...best, confidence };
  }

  function inferPhotoAxisCount(imageData, axis) {
    const { data, width, height } = imageData;
    const length = axis === "x" ? width : height;
    const cross = axis === "x" ? height : width;
    const luminance = new Float32Array(width * height);
    for (let index = 0; index < width * height; index += 1) {
      const source = index * 4;
      luminance[index] =
        data[source] * 0.299 + data[source + 1] * 0.587 + data[source + 2] * 0.114;
    }

    const gradient = (position, other) => {
      if (axis === "x") {
        const left = other * width + position - 1;
        const right = other * width + position + 1;
        return Math.abs(luminance[right] - luminance[left]);
      }
      const above = (position - 1) * width + other;
      const below = (position + 1) * width + other;
      return Math.abs(luminance[below] - luminance[above]);
    };

    const maxLag = Math.min(56, Math.floor(length / 5));
    const scores = [];
    for (let lag = 6; lag <= maxLag; lag += 1) {
      let correlation = 0;
      let count = 0;
      for (let position = 2; position < length - lag - 2; position += 2) {
        for (let other = 1; other < cross - 1; other += 2) {
          const first = Math.max(0, gradient(position, other) - 6);
          const second = Math.max(0, gradient(position + lag, other) - 6);
          correlation += first * second;
          count += 1;
        }
      }
      scores.push({ lag, score: correlation / Math.max(1, count) });
    }
    scores.sort((a, b) => b.score - a.score);
    const best = scores[0] || { lag: Math.max(6, length / 24), score: 0 };
    const plateau = scores
      .filter((candidate) => Math.abs(candidate.lag - best.lag) <= 3)
      .filter((candidate) => candidate.score >= best.score * 0.72);
    const totalWeight = plateau.reduce((sum, candidate) => sum + candidate.score, 0);
    const period =
      totalWeight > 0
        ? plateau.reduce((sum, candidate) => sum + candidate.lag * candidate.score, 0) / totalWeight
        : best.lag;
    const backgroundScore =
      scores.slice(Math.floor(scores.length / 2)).reduce((sum, candidate) => sum + candidate.score, 0) /
      Math.max(1, Math.ceil(scores.length / 2));
    const confidence = clamp(0.42 + (best.score / Math.max(0.01, backgroundScore) - 1) * 0.16, 0.35, 0.9);
    return {
      count: clamp(Math.round(length / Math.max(1, period)), 6, 120),
      score: best.score,
      confidence,
    };
  }

  function edgePeak(edges, position, radius) {
    let peak = 0;
    const center = Math.round(position);
    for (let offset = -radius; offset <= radius; offset += 1) {
      const index = clamp(center + offset, 1, edges.length - 1);
      peak = Math.max(peak, edges[index] || 0);
    }
    return peak;
  }

  function scoreGridBounds(edges, count, start, end) {
    const span = end - start;
    const cell = span / count;
    if (cell < 1.6) return -Infinity;
    const radius = cell >= 8 ? 2 : 1;
    let boundary = 0;
    let boundaryWeight = 0;
    for (let line = 0; line <= count; line += 1) {
      const endpoint = line === 0 || line === count;
      const weight = endpoint ? 0.72 : 1;
      boundary += edgePeak(edges, start + line * cell, radius) * weight;
      boundaryWeight += weight;
    }
    let interior = 0;
    let interiorCount = 0;
    for (let cellIndex = 0; cellIndex < count; cellIndex += 1) {
      for (const phase of [0.28, 0.5, 0.72]) {
        interior += edgePeak(edges, start + (cellIndex + phase) * cell, 0);
        interiorCount += 1;
      }
    }
    const boundaryMean = boundary / Math.max(1, boundaryWeight);
    const interiorMean = interior / Math.max(1, interiorCount);
    return boundaryMean - interiorMean * 0.72;
  }

  function fitAxisGridBounds(edges, count, photoMode) {
    const length = edges.length;
    const nominalCell = length / Math.max(1, count);
    if (count < 3 || nominalCell < 2.2) {
      return { start: 0, end: length, changed: false, gain: 0 };
    }
    const averageEdge =
      edges.reduce((sum, value, index) => sum + (index ? value : 0), 0) /
      Math.max(1, length - 1);
    const maxTrim = Math.min(
      length * (photoMode ? 0.065 : 0.105),
      nominalCell * (photoMode ? 0.72 : 1.18),
    );
    const step = Math.max(0.7, nominalCell / 12);
    const baseline = scoreGridBounds(edges, count, 0, length);
    let best = { start: 0, end: length, score: baseline };
    for (let leftTrim = 0; leftTrim <= maxTrim + 0.01; leftTrim += step) {
      for (let rightTrim = 0; rightTrim <= maxTrim + 0.01; rightTrim += step) {
        const end = length - rightTrim;
        if (end - leftTrim < nominalCell * count * 0.78) continue;
        const rawScore = scoreGridBounds(edges, count, leftTrim, end);
        const trimCells = (leftTrim + rightTrim) / Math.max(1, nominalCell);
        const score = rawScore - trimCells * averageEdge * (photoMode ? 0.08 : 0.045);
        if (score > best.score) best = { start: leftTrim, end, score };
      }
    }
    const gain = best.score - baseline;
    const threshold = Math.max(photoMode ? 0.8 : 0.42, averageEdge * (photoMode ? 0.12 : 0.065));
    const changed =
      gain > threshold &&
      (best.start > nominalCell * 0.08 || length - best.end > nominalCell * 0.08);
    return changed
      ? { ...best, changed, gain }
      : { start: 0, end: length, changed: false, gain };
  }

  function alignFrameToDetectedGrid(analysis, cols, rows) {
    const xFit = fitAxisGridBounds(analysis.xEdges, cols, analysis.photoMode);
    const yFit = fitAxisGridBounds(analysis.yEdges, rows, analysis.photoMode);
    if (!xFit.changed && !yFit.changed) return false;
    const left = xFit.changed ? xFit.start / analysis.width : 0;
    const right = xFit.changed ? xFit.end / analysis.width : 1;
    const top = yFit.changed ? yFit.start / analysis.height : 0;
    const bottom = yFit.changed ? yFit.end / analysis.height : 1;
    const projector = createFrameProjector(state.frame);
    const nextFrame = [
      projector(left, top),
      projector(right, top),
      projector(right, bottom),
      projector(left, bottom),
    ];
    if (!frameIsConvex(nextFrame)) return false;
    state.frame = nextFrame.map((point) => ({
      x: clamp(point.x, 0, 1),
      y: clamp(point.y, 0, 1),
    }));
    syncCropFromFrame();
    return true;
  }

  function analyzeGridCanvas(canvas, photoMode) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const xEdges = buildAxisEdges(imageData, "x", photoMode);
    const yEdges = buildAxisEdges(imageData, "y", photoMode);
    return {
      canvas,
      imageData,
      width: canvas.width,
      height: canvas.height,
      photoMode,
      xEdges,
      yEdges,
      xResult: photoMode
        ? inferPhotoAxisCount(imageData, "x")
        : inferAxisCount(xEdges, canvas.width),
      yResult: photoMode
        ? inferPhotoAxisCount(imageData, "y")
        : inferAxisCount(yEdges, canvas.height),
    };
  }

  function applyDetectedGrid(analysis) {
    state.cols = clamp(analysis.xResult.count, 2, 200);
    state.rows = clamp(analysis.yResult.count, 2, 200);
    const cellX = analysis.width / state.cols;
    const cellY = analysis.height / state.rows;
    if (Math.max(cellX, cellY) / Math.max(0.01, Math.min(cellX, cellY)) > 1.45) {
      if (state.rows < 8 && state.cols >= 8) {
        state.rows = clamp(Math.round(analysis.height / cellX), 2, 200);
      } else if (state.cols < 8 && state.rows >= 8) {
        state.cols = clamp(Math.round(analysis.width / cellY), 2, 200);
      } else if (analysis.xResult.confidence > analysis.yResult.confidence + 0.12) {
        state.rows = clamp(Math.round(analysis.height / cellX), 2, 200);
      } else if (analysis.yResult.confidence > analysis.xResult.confidence + 0.12) {
        state.cols = clamp(Math.round(analysis.width / cellY), 2, 200);
      }
    }
  }

  async function autoDetect(isInitial = false) {
    if (!state.image) return;
    readCrop();
    const token = ++state.processingToken;
    elements.processing.hidden = false;
    elements.detectButton.disabled = true;
    await sleepFrame();

    try {
      const photoMode = activeSourceMode() === "photo";
      const analysis = analyzeGridCanvas(makeAnalysisCanvas(), photoMode);
      if (token !== state.processingToken) return;
      applyDetectedGrid(analysis);
      const frameAligned = alignFrameToDetectedGrid(analysis, state.cols, state.rows);
      if (frameAligned) {
        drawSourceThumb();
        await sleepFrame();
        if (token !== state.processingToken) return;
      }

      state.detectionConfidence =
        (analysis.xResult.confidence + analysis.yResult.confidence) / 2;
      elements.gridCols.value = state.cols;
      elements.gridRows.value = state.rows;
      elements.detectHint.textContent =
        state.detectionConfidence > 0.7
          ? frameAligned
            ? "已根据格线同时校正框选与行列数；手动修改会立即更新图纸。"
            : "行列数与框选已检查；手动修改会立即更新图纸。"
          : `暂定 ${state.cols} × ${state.rows}；请检查行列数。手动修改后会立即更新图纸。`;
      await processImage({ resetHistory: true });
      if (isInitial) {
        chooseInitialZoom();
      }
      if (isInitial && state.detectionConfidence < 0.5) {
        showToast("已生成初稿；建议检查行列数是否正确");
      }
    } catch (error) {
      console.error(error);
      showToast("自动识别遇到问题，请手动填写行列数");
    } finally {
      if (token === state.processingToken) elements.processing.hidden = true;
      elements.detectButton.disabled = false;
    }
  }

  function median(values) {
    if (!values.length) return 0;
    values.sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : Math.round((values[middle - 1] + values[middle]) / 2);
  }

  function srgbToLinear(channel) {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }

  function rgbToLab(rgb) {
    const r = srgbToLinear(rgb.r);
    const g = srgbToLinear(rgb.g);
    const b = srgbToLinear(rgb.b);
    let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    let y = r * 0.2126 + g * 0.7152 + b * 0.0722;
    let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
    const pivot = (value) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);
    x = pivot(x);
    y = pivot(y);
    z = pivot(z);
    return { l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
  }

  function labDistance(a, b) {
    const lightnessWeight = activeSourceMode() === "photo" ? 0.42 : 1;
    return Math.hypot((a.l - b.l) * lightnessWeight, a.a - b.a, a.b - b.b);
  }

  function sampleCells() {
    const cols = state.cols;
    const rows = state.rows;
    const source = getSourcePixelData(1800);
    const projector = createFrameProjector();
    const photoMode = activeSourceMode() === "photo";
    const samples = [];
    const confidences = [];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const colors = [];
        if (photoMode) {
          // Hollow beads and glossy highlights make the center unreliable.
          // Sample two rings around each center and discard luminance extremes.
          for (const radius of [0.25, 0.36]) {
            for (let angleIndex = 0; angleIndex < 16; angleIndex += 1) {
              const angle = (Math.PI * 2 * angleIndex) / 16;
              const u = (col + 0.5 + Math.cos(angle) * radius) / cols;
              const v = (row + 0.5 + Math.sin(angle) * radius) / rows;
              const point = viewPointToSource(projector(u, v));
              colors.push(readSourcePixel(source, point.x, point.y));
            }
          }
        } else {
          // A slightly inaccurate frame should not push the sample onto a grid line.
          // Test several nearby inner patches and keep the most color-stable one.
          const candidateShifts = [
            [0, 0],
            [-0.17, 0],
            [0.17, 0],
            [0, -0.17],
            [0, 0.17],
          ];
          let bestScore = Infinity;
          let bestColors = [];
          for (const [shiftX, shiftY] of candidateShifts) {
            const candidateColors = [];
            for (const offsetY of [-0.14, 0, 0.14]) {
              for (const offsetX of [-0.14, 0, 0.14]) {
                const point = viewPointToSource(
                  projector(
                    (col + 0.5 + shiftX + offsetX) / cols,
                    (row + 0.5 + shiftY + offsetY) / rows,
                  ),
                );
                candidateColors.push(readSourcePixel(source, point.x, point.y));
              }
            }
            const opaque = candidateColors.filter((color) => color[3] >= 20);
            let variability = 0;
            if (opaque.length) {
              const center = [
                median(opaque.map((color) => color[0])),
                median(opaque.map((color) => color[1])),
                median(opaque.map((color) => color[2])),
              ];
              variability =
                median(
                  opaque.map(
                    (color) =>
                      Math.abs(color[0] - center[0]) +
                      Math.abs(color[1] - center[1]) +
                      Math.abs(color[2] - center[2]),
                  ),
                ) / 3;
            }
            const distancePenalty = Math.hypot(shiftX, shiftY) * 14;
            const coveragePenalty = (1 - opaque.length / candidateColors.length) * 4;
            const score = variability + distancePenalty + coveragePenalty;
            if (score < bestScore) {
              bestScore = score;
              bestColors = candidateColors;
            }
          }
          colors.push(...bestColors);
        }

        colors.sort(
          (a, b) =>
            (a[0] * 299 + a[1] * 587 + a[2] * 114) / 1000 -
            (b[0] * 299 + b[1] * 587 + b[2] * 114) / 1000,
        );
        const trim = photoMode ? Math.floor(colors.length * 0.2) : 0;
        const stableColors = colors.slice(trim, colors.length - trim || colors.length);
        const rs = stableColors.filter((color) => color[3] >= 20).map((color) => color[0]);
        const gs = stableColors.filter((color) => color[3] >= 20).map((color) => color[1]);
        const bs = stableColors.filter((color) => color[3] >= 20).map((color) => color[2]);
        const alphas = stableColors.map((color) => color[3]);
        const alpha = median(alphas);
        if (!rs.length || (elements.keepTransparent.checked && alpha < 100)) {
          samples.push({ r: 0, g: 0, b: 0, a: 0, lab: null });
          confidences.push(1);
          continue;
        }
        const color = { r: median(rs), g: median(gs), b: median(bs), a: alpha };
        color.lab = rgbToLab(color);
        const deviations = rs.map(
          (red, index) =>
            Math.abs(red - color.r) + Math.abs(gs[index] - color.g) + Math.abs(bs[index] - color.b),
        );
        const variability = median(deviations) / 3;
        samples.push(color);
        confidences.push(clamp(1 - variability / (photoMode ? 72 : 50), 0, 1));
      }
    }
    return { samples, confidences };
  }

  function bucketSamples(samples) {
    const buckets = new Map();
    for (const color of samples) {
      if (!color.a) continue;
      const key = `${color.r >> 3},${color.g >> 3},${color.b >> 3}`;
      const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
      bucket.r += color.r;
      bucket.g += color.g;
      bucket.b += color.b;
      bucket.count += 1;
      buckets.set(key, bucket);
    }
    return [...buckets.values()]
      .map((bucket) => {
        const rgb = {
          r: Math.round(bucket.r / bucket.count),
          g: Math.round(bucket.g / bucket.count),
          b: Math.round(bucket.b / bucket.count),
        };
        return { ...rgb, lab: rgbToLab(rgb), count: bucket.count };
      })
      .sort((a, b) => b.count - a.count);
  }

  function clusterPalette(samples) {
    const buckets = bucketSamples(samples);
    if (!buckets.length) return [];
    const mergeThresholds = [1.5, 4.5, 8, 12, 17];
    const threshold = mergeThresholds[Number(elements.colorMerge.value)];
    const merged = [];

    for (const bucket of buckets) {
      let nearest = null;
      let nearestDistance = Infinity;
      for (const cluster of merged) {
        const distance = labDistance(bucket.lab, cluster.lab);
        if (distance < nearestDistance) {
          nearest = cluster;
          nearestDistance = distance;
        }
      }
      if (nearest && nearestDistance <= threshold) {
        const count = nearest.count + bucket.count;
        nearest.r = (nearest.r * nearest.count + bucket.r * bucket.count) / count;
        nearest.g = (nearest.g * nearest.count + bucket.g * bucket.count) / count;
        nearest.b = (nearest.b * nearest.count + bucket.b * bucket.count) / count;
        nearest.count = count;
        nearest.lab = rgbToLab(nearest);
      } else {
        merged.push({ ...bucket });
      }
    }

    const denoiseStrength = Number(elements.denoise.value);
    const rareCountLimit = [0, 1, 2, 4][denoiseStrength];
    const rareMergeDistance = threshold + [0, 5, 10, 14][denoiseStrength];
    if (rareCountLimit) {
      for (let index = merged.length - 1; index >= 0; index -= 1) {
        const rare = merged[index];
        if (rare.count > rareCountLimit || merged.length <= 1) continue;
        let targetIndex = -1;
        let targetDistance = Infinity;
        merged.forEach((candidate, candidateIndex) => {
          if (candidateIndex === index) return;
          const distance = labDistance(rare.lab, candidate.lab);
          if (distance < targetDistance) {
            targetIndex = candidateIndex;
            targetDistance = distance;
          }
        });
        if (targetIndex < 0 || targetDistance > rareMergeDistance) continue;
        const target = merged[targetIndex];
        const count = target.count + rare.count;
        target.r = (target.r * target.count + rare.r * rare.count) / count;
        target.g = (target.g * target.count + rare.g * rare.count) / count;
        target.b = (target.b * target.count + rare.b * rare.count) / count;
        target.count = count;
        target.lab = rgbToLab(target);
        merged.splice(index, 1);
      }
    }

    // The palette size is discovered from the merged color clusters.
    // 256 is only a pathological-input safety ceiling, not a target color count.
    const maxColors = 256;
    if (merged.length <= maxColors) return finalizePalette(merged);

    const centers = [merged[0]];
    while (centers.length < maxColors) {
      let candidate = null;
      let best = -1;
      for (const color of merged) {
        const distance = Math.min(...centers.map((center) => labDistance(color.lab, center.lab)));
        const score = distance * Math.sqrt(color.count);
        if (score > best) {
          best = score;
          candidate = color;
        }
      }
      centers.push({ ...candidate });
    }

    for (let iteration = 0; iteration < 8; iteration += 1) {
      const groups = centers.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
      for (const color of merged) {
        const index = nearestColorIndex(color, centers);
        const group = groups[index];
        group.r += color.r * color.count;
        group.g += color.g * color.count;
        group.b += color.b * color.count;
        group.count += color.count;
      }
      groups.forEach((group, index) => {
        if (!group.count) return;
        centers[index] = {
          r: group.r / group.count,
          g: group.g / group.count,
          b: group.b / group.count,
          count: group.count,
        };
        centers[index].lab = rgbToLab(centers[index]);
      });
    }
    return finalizePalette(centers);
  }

  function finalizePalette(colors) {
    return colors
      .map((color) => {
        const output = {
          r: Math.round(color.r),
          g: Math.round(color.g),
          b: Math.round(color.b),
        };
        output.lab = rgbToLab(output);
        return {
          ...output,
          count: 0,
          matches: [{ ...output, lab: output.lab }],
        };
      })
      .sort((a, b) => {
        const hueA = Math.atan2(a.lab.b, a.lab.a);
        const hueB = Math.atan2(b.lab.b, b.lab.a);
        return hueA - hueB || b.lab.l - a.lab.l;
      })
      .map((color, index) => ({
        ...color,
        name: makeCode(index),
        code: rgbToHex(color),
        codeCustomized: false,
      }));
  }

  function makeCode(index) {
    const letter = String.fromCharCode(65 + (index % 26));
    return `${letter}${Math.floor(index / 26) + 1}`;
  }

  function makeAvailableName(ignoreIndex = -1) {
    const used = new Set(
      state.palette
        .filter((_, index) => index !== ignoreIndex)
        .map((color) => String(color.name || "").trim().toUpperCase()),
    );
    let index = 0;
    while (used.has(makeCode(index))) index += 1;
    return makeCode(index);
  }

  function clonePalette(palette) {
    return palette.map((color) => ({
      ...color,
      lab: { ...color.lab },
      matches: (color.matches || []).map((match) => ({
        ...match,
        lab: { ...match.lab },
      })),
    }));
  }

  function nearestColorIndex(color, palette) {
    let nearest = 0;
    let distance = Infinity;
    for (let index = 0; index < palette.length; index += 1) {
      const value = labDistance(color.lab, palette[index].lab);
      if (value < distance) {
        distance = value;
        nearest = index;
      }
    }
    return nearest;
  }

  function nearestPaletteMatchIndex(color, palette = state.palette) {
    let nearest = -1;
    let distance = Infinity;
    palette.forEach((entry, paletteIndex) => {
      for (const match of entry.matches || []) {
        const value = labDistance(color.lab, match.lab);
        if (value < distance) {
          distance = value;
          nearest = paletteIndex;
        }
      }
    });
    return nearest;
  }

  function cleanCells(cells, confidences, palette, strength, rows = state.rows, cols = state.cols) {
    if (!strength) return cells;
    let current = [...cells];
    const frequency = new Array(palette.length).fill(0);
    current.forEach((cell) => {
      if (cell >= 0) frequency[cell] += 1;
    });

    for (let pass = 0; pass < strength; pass += 1) {
      const next = [...current];
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const index = row * cols + col;
          const own = current[index];
          if (own < 0) continue;
          const counts = new Map();
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (!dx && !dy) continue;
              const y = row + dy;
              const x = col + dx;
              if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
              const neighbor = current[y * cols + x];
              if (neighbor >= 0) counts.set(neighbor, (counts.get(neighbor) || 0) + 1);
            }
          }
          let majority = own;
          let majorityCount = 0;
          for (const [color, count] of counts) {
            if (count > majorityCount) {
              majority = color;
              majorityCount = count;
            }
          }
          const lowConfidence = confidences[index] < 0.72 + pass * 0.06;
          const rare = frequency[own] <= 2 + pass * 2;
          const required = pass === 0 ? 6 : 5;
          if (majority !== own && majorityCount >= required && (lowConfidence || rare || strength === 3)) {
            next[index] = majority;
          }
        }
      }
      current = next;
    }
    return current;
  }

  function recalculateCounts() {
    state.palette.forEach((color) => {
      color.count = 0;
    });
    state.cells.forEach((cell) => {
      if (cell >= 0 && state.palette[cell]) state.palette[cell].count += 1;
    });
  }

  function remapCellsFromPaletteMatches({ render = true } = {}) {
    state.cells = state.samples.map((color) =>
      color.a ? nearestPaletteMatchIndex(color) : -1,
    );
    if (state.palette.length) {
      state.cells = cleanCells(
        state.cells,
        state.confidences,
        state.palette,
        Number(elements.denoise.value),
      );
    }
    state.selectedColor = clamp(
      state.selectedColor,
      0,
      Math.max(0, state.palette.length - 1),
    );
    state.history = [];
    state.future = [];
    recalculateCounts();
    if (render) renderAll();
  }

  async function processImage({ resetHistory = false, preservePalette = false } = {}) {
    if (!state.image) return;
    if (!preservePalette) cancelColorPick({ redraw: false });
    state.cols = clamp(Math.round(Number(elements.gridCols.value) || 32), 2, 200);
    state.rows = clamp(Math.round(Number(elements.gridRows.value) || 32), 2, 200);
    elements.gridCols.value = state.cols;
    elements.gridRows.value = state.rows;
    readCrop();
    saveSettings();

    const token = ++state.processingToken;
    elements.processing.hidden = false;
    await sleepFrame();

    try {
      const { samples, confidences } = sampleCells();
      const keepingEdits = preservePalette && state.paletteEdited;
      const detectedPalette = clusterPalette(samples);
      const palette = keepingEdits ? state.palette : detectedPalette;
      if (!palette.length && !keepingEdits) {
        showToast("裁切区域几乎完全透明，请调整裁切或关闭透明留空");
        return;
      }
      let cells = samples.map((color) => (color.a ? nearestPaletteMatchIndex(color, palette) : -1));
      cells = cleanCells(cells, confidences, palette, Number(elements.denoise.value));
      if (token !== state.processingToken) return;

      state.palette = palette;
      state.detectedPaletteCount = detectedPalette.length;
      state.detectedPaletteSnapshot = clonePalette(detectedPalette);
      if (!keepingEdits) {
        state.paletteEdited = false;
      }
      state.cells = cells;
      state.samples = samples;
      state.confidences = confidences;
      state.selectedColor = clamp(state.selectedColor, 0, Math.max(0, palette.length - 1));
      if (resetHistory) {
        state.history = [];
        state.future = [];
      }
      recalculateCounts();
      renderAll();
    } catch (error) {
      console.error(error);
      showToast("处理失败，图片可能过大或浏览器内存不足");
    } finally {
      if (token === state.processingToken) elements.processing.hidden = true;
    }
  }

  function colorCss(color) {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  }

  function textColor(color) {
    const luminance = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
    return luminance > 150 ? "#242620" : "#ffffff";
  }

  function renderPattern() {
    const canvas = elements.patternCanvas;
    const cols = state.cols;
    const rows = state.rows;
    const cell = clamp(Math.floor(1500 / Math.max(cols, rows)), 7, 24);
    const margin = cell >= 12 ? 26 : 18;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const logicalWidth = cols * cell + margin * 2;
    const logicalHeight = rows * cell + margin * 2;
    state.renderCellSize = cell;
    state.renderScale = scale;
    state.margin = margin;
    state.patternLogicalWidth = logicalWidth;
    state.patternLogicalHeight = logicalHeight;
    canvas.width = Math.round(logicalWidth * scale);
    canvas.height = Math.round(logicalHeight * scale);
    canvas.style.width = `${Math.round(logicalWidth * state.zoom)}px`;
    canvas.style.height = `${Math.round(logicalHeight * state.zoom)}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#fffefb";
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const index = row * cols + col;
        const paletteIndex = state.cells[index];
        const x = margin + col * cell;
        const y = margin + row * cell;
        if (paletteIndex < 0) {
          ctx.fillStyle = (row + col) % 2 ? "#f2f0eb" : "#e6e3dc";
          ctx.fillRect(x, y, cell, cell);
          continue;
        }
        const color = state.palette[paletteIndex];
        ctx.fillStyle = colorCss(color);
        ctx.fillRect(x, y, cell, cell);
        if (cell >= 17) {
          ctx.fillStyle = textColor(color);
          ctx.font = `700 ${Math.max(8, Math.floor(cell * 0.36))}px Arial, "Microsoft YaHei", sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(color.name, Math.round(x + cell / 2), Math.round(y + cell / 2));
        } else if (cell >= 10) {
          ctx.fillStyle = textColor(color);
          ctx.globalAlpha = 0.52;
          ctx.beginPath();
          ctx.arc(x + cell / 2, y + cell / 2, Math.max(1, cell * 0.11), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    }

    ctx.lineWidth = 1;
    for (let col = 0; col <= cols; col += 1) {
      const x = margin + col * cell + 0.5;
      ctx.strokeStyle = col % 5 === 0 ? "rgba(25,25,22,.58)" : "rgba(25,25,22,.2)";
      ctx.beginPath();
      ctx.moveTo(x, margin);
      ctx.lineTo(x, margin + rows * cell);
      ctx.stroke();
    }
    for (let row = 0; row <= rows; row += 1) {
      const y = margin + row * cell + 0.5;
      ctx.strokeStyle = row % 5 === 0 ? "rgba(25,25,22,.58)" : "rgba(25,25,22,.2)";
      ctx.beginPath();
      ctx.moveTo(margin, y);
      ctx.lineTo(margin + cols * cell, y);
      ctx.stroke();
    }

    if (cell >= 10) {
      ctx.fillStyle = "#6f746c";
      ctx.font = `600 ${Math.max(8, Math.min(10, Math.floor(cell * 0.45)))}px Arial, "Microsoft YaHei", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (let col = 4; col < cols; col += 5) {
        ctx.fillText(String(col + 1), margin + col * cell + cell / 2, margin / 2);
      }
      for (let row = 4; row < rows; row += 5) {
        ctx.fillText(String(row + 1), margin / 2, margin + row * cell + cell / 2);
      }
    }
  }

  function renderOriginal() {
    if (!state.image) return;
    const canvas = elements.originalCanvas;
    const rectified = makeRectifiedCanvas(900);
    canvas.width = rectified.width;
    canvas.height = rectified.height;
    canvas.style.width = `${Math.round(canvas.width * state.zoom)}px`;
    canvas.style.height = `${Math.round(canvas.height * state.zoom)}px`;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(rectified, 0, 0);
  }

  function renderPalette() {
    elements.paletteList.replaceChildren();
    elements.paletteSummary.textContent = state.detectedPaletteCount
      ? `算法先分出了 ${state.detectedPaletteCount} 种颜色；可改图纸用色和色号，也可把原图颜色标签拖到其他颜色。`
      : "当前没有可用颜色；可先添加图纸颜色，再从原图吸取匹配色。";
    const fragment = document.createDocumentFragment();
    state.palette.forEach((color, index) => {
      const card = document.createElement("article");
      card.className = `palette-mapping${index === state.selectedColor ? " active" : ""}`;
      card.dataset.index = String(index);

      const target = document.createElement("div");
      target.className = "palette-target";
      const targetHeading = document.createElement("span");
      targetHeading.className = "mapping-label";
      targetHeading.textContent = `图纸颜色 #${index + 1}`;

      const targetColorRow = document.createElement("div");
      targetColorRow.className = "target-color-row";
      const colorButton = document.createElement("button");
      colorButton.type = "button";
      colorButton.className = "target-color-button";
      colorButton.dataset.action = "open-color-editor";
      colorButton.setAttribute("aria-label", `修改 ${color.name} 的图纸颜色`);
      const colorSwatch = document.createElement("i");
      colorSwatch.style.background = colorCss(color);
      colorButton.append(colorSwatch);
      const targetMeta = document.createElement("span");
      const targetName = document.createElement("b");
      targetName.className = "target-name";
      targetName.textContent = color.name;
      const targetDetails = document.createElement("small");
      targetDetails.className = "target-details";
      targetDetails.textContent = `${color.count} 颗`;
      targetMeta.append(targetName, targetDetails);
      targetColorRow.append(colorButton, targetMeta);

      const codeLabel = document.createElement("label");
      codeLabel.className = "palette-code-field";
      const codeCaption = document.createElement("span");
      codeCaption.textContent = "色号";
      const codeInput = document.createElement("input");
      codeInput.type = "text";
      codeInput.value = color.code;
      codeInput.maxLength = 12;
      codeInput.dataset.action = "color-code";
      codeInput.setAttribute("aria-label", `修改图纸颜色 ${color.name} 的色号`);
      codeLabel.append(codeCaption, codeInput);
      target.append(targetHeading, targetColorRow, codeLabel);

      const sourceMatches = document.createElement("div");
      sourceMatches.className = "palette-matches";
      const matchesHeader = document.createElement("div");
      matchesHeader.className = "matches-header";
      const matchesHeading = document.createElement("span");
      matchesHeading.className = "mapping-label";
      matchesHeading.textContent = "匹配原图颜色";
      const pickButton = document.createElement("button");
      pickButton.type = "button";
      pickButton.dataset.action = "pick-match";
      pickButton.textContent = "吸取";
      pickButton.setAttribute("aria-label", `从原图为 ${color.name} 吸取匹配颜色`);
      matchesHeader.append(matchesHeading, pickButton);

      const matchList = document.createElement("div");
      matchList.className = "match-color-list";
      const matches = color.matches || [];
      if (!matches.length) {
        const empty = document.createElement("small");
        empty.className = "empty-matches";
        empty.textContent = "尚未匹配";
        matchList.append(empty);
      } else {
        matches.forEach((match, matchIndex) => {
          const chip = document.createElement("span");
          chip.className = "match-color-chip";
          chip.dataset.paletteIndex = String(index);
          chip.dataset.matchIndex = String(matchIndex);
          chip.title = `原图颜色 ${rgbToHex(match)}`;
          const dot = document.createElement("i");
          dot.style.background = colorCss(match);
          const value = document.createElement("b");
          value.textContent = rgbToHex(match);
          const remove = document.createElement("button");
          remove.type = "button";
          remove.dataset.action = "remove-match";
          remove.dataset.matchIndex = String(matchIndex);
          remove.textContent = "×";
          remove.setAttribute("aria-label", `移除原图匹配色 ${rgbToHex(match)}`);
          chip.append(dot, value, remove);
          matchList.append(chip);
        });
      }
      sourceMatches.append(matchesHeader, matchList);

      const removeEntry = document.createElement("button");
      removeEntry.type = "button";
      removeEntry.className = "palette-remove";
      removeEntry.dataset.action = "remove-entry";
      removeEntry.textContent = "删除";
      removeEntry.setAttribute("aria-label", `删除图纸颜色 ${color.name}`);

      card.append(target, sourceMatches, removeEntry);
      fragment.append(card);
    });
    elements.paletteList.append(fragment);
    elements.addPaletteButton.textContent = "＋ 添加图纸颜色";
    elements.resetPaletteButton.disabled =
      !state.paletteEdited || !state.detectedPaletteSnapshot.length;
  }

  function renderLivePatternPreview() {
    const canvas = elements.livePatternCanvas;
    if (!canvas) return;
    if (!state.cells.length || !state.palette.length) {
      canvas.width = 1;
      canvas.height = 1;
      canvas.style.width = "1px";
      canvas.style.height = "auto";
      elements.livePreviewMeta.textContent = "等待识别";
      return;
    }

    const maxWidth = 190;
    const maxHeight = 220;
    const cell = Math.max(1.2, Math.min(maxWidth / state.cols, maxHeight / state.rows));
    const logicalWidth = state.cols * cell;
    const logicalHeight = state.rows * cell;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(logicalWidth * scale));
    canvas.height = Math.max(1, Math.round(logicalHeight * scale));
    canvas.style.width = `${Math.round(logicalWidth)}px`;
    canvas.style.height = "auto";
    const ctx = canvas.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#fffefb";
    ctx.fillRect(0, 0, logicalWidth, logicalHeight);

    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const paletteIndex = state.cells[row * state.cols + col];
        const x = col * cell;
        const y = row * cell;
        if (paletteIndex < 0 || !state.palette[paletteIndex]) {
          ctx.fillStyle = (row + col) % 2 ? "#f2f0eb" : "#e3e0d9";
        } else {
          ctx.fillStyle = colorCss(state.palette[paletteIndex]);
        }
        ctx.fillRect(x, y, cell + 0.25, cell + 0.25);
      }
    }

    if (cell >= 3) {
      ctx.lineWidth = Math.max(0.45, 0.75 / scale);
      for (let col = 0; col <= state.cols; col += 1) {
        const x = col * cell;
        ctx.strokeStyle = col % 5 === 0 ? "rgba(22,25,22,.52)" : "rgba(22,25,22,.16)";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, logicalHeight);
        ctx.stroke();
      }
      for (let row = 0; row <= state.rows; row += 1) {
        const y = row * cell;
        ctx.strokeStyle = row % 5 === 0 ? "rgba(22,25,22,.52)" : "rgba(22,25,22,.16)";
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(logicalWidth, y);
        ctx.stroke();
      }
    }

    const usedColors = state.palette.filter((color) => color.count > 0).length;
    elements.livePreviewMeta.textContent = `${state.cols} × ${state.rows} · ${usedColors} 色`;
  }

  function setLivePreviewPosition(x, y) {
    const preview = elements.livePatternPreview;
    const inset = 8;
    const maxX = Math.max(inset, window.innerWidth - preview.offsetWidth - inset);
    const maxY = Math.max(inset, window.innerHeight - preview.offsetHeight - inset);
    state.previewPosition = {
      x: clamp(x, inset, maxX),
      y: clamp(y, inset, maxY),
    };
    preview.style.right = "auto";
    preview.style.left = `${state.previewPosition.x}px`;
    preview.style.top = `${state.previewPosition.y}px`;
  }

  function clampLivePreviewPosition() {
    if (!state.previewPosition || elements.livePatternPreview.hidden) return;
    setLivePreviewPosition(state.previewPosition.x, state.previewPosition.y);
  }

  function setLivePreviewCollapsed(collapsed) {
    state.livePreviewCollapsed = Boolean(collapsed);
    elements.livePatternPreview.classList.toggle("collapsed", state.livePreviewCollapsed);
    elements.livePreviewToggle.textContent = state.livePreviewCollapsed ? "展开" : "收起";
    elements.livePreviewToggle.setAttribute(
      "aria-expanded",
      String(!state.livePreviewCollapsed),
    );
    elements.livePreviewToggle.setAttribute(
      "aria-label",
      state.livePreviewCollapsed ? "展开实时图纸预览" : "收起实时图纸预览",
    );
    requestAnimationFrame(clampLivePreviewPosition);
  }

  function startLivePreviewDrag(event) {
    if (event.button > 0 || event.target.closest("button") || !event.target.closest("header")) return;
    const previewRect = elements.livePatternPreview.getBoundingClientRect();
    setLivePreviewPosition(previewRect.left, previewRect.top);
    state.previewDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialX: state.previewPosition.x,
      initialY: state.previewPosition.y,
    };
    elements.livePatternPreview.classList.add("dragging");
    elements.livePatternPreview.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function moveLivePreviewDrag(event) {
    const drag = state.previewDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setLivePreviewPosition(
      drag.initialX + event.clientX - drag.startX,
      drag.initialY + event.clientY - drag.startY,
    );
    event.preventDefault();
    event.stopPropagation();
  }

  function finishLivePreviewDrag(event) {
    const drag = state.previewDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    state.previewDrag = null;
    elements.livePatternPreview.classList.remove("dragging");
    elements.livePatternPreview.releasePointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  }

  function renderStatus() {
    const filled = state.cells.filter((cell) => cell >= 0).length;
    const usedColors = state.palette.filter((color) => color.count > 0).length;
    const averageConfidence =
      state.confidences.reduce((sum, value) => sum + value, 0) / Math.max(1, state.confidences.length);
    elements.gridStatus.textContent = `${state.cols} × ${state.rows} · ${filled.toLocaleString()} 颗`;
    elements.colorStatus.textContent = `${usedColors} 种颜色`;
    const confidence = (averageConfidence + state.detectionConfidence) / 2;
    elements.confidenceStatus.textContent =
      confidence > 0.78 ? "识别稳定" : confidence > 0.58 ? "建议检查网格" : "建议手动校正";
    elements.confidenceStatus.style.color =
      confidence > 0.78 ? "#39795f" : confidence > 0.58 ? "#9b6b13" : "#b74634";
  }

  function renderHistoryButtons() {
    elements.undoButton.disabled = !state.history.length;
    elements.redoButton.disabled = !state.future.length;
  }

  function renderAll() {
    updateView();
    updateColorPickUi();
    drawSourceThumb();
    renderPattern();
    renderLivePatternPreview();
    renderPalette();
    renderStatus();
    renderHistoryButtons();
  }

  function updateFrameMode() {
    const rectangular = state.frameMode === "rect";
    elements.rectModeButton.classList.toggle("active", rectangular);
    elements.freeModeButton.classList.toggle("active", !rectangular);
    elements.rectModeButton.setAttribute("aria-pressed", String(rectangular));
    elements.freeModeButton.setAttribute("aria-pressed", String(!rectangular));
    elements.sourceEditor.dataset.frameMode = state.frameMode;
  }

  function updateView() {
    const result = state.view === "result";
    elements.patternCanvas.hidden = !result;
    elements.sourceEditor.hidden = result;
    elements.livePatternPreview.hidden = result || !state.image;
    elements.originalCanvas.hidden = true;
    elements.calibrationBar.hidden = result;
    elements.previewPanel?.classList?.toggle("source-active", !result);
    elements.resultTab.classList.toggle("active", result);
    elements.originalTab.classList.toggle("active", !result);
    elements.resultTab.setAttribute("aria-selected", String(result));
    elements.originalTab.setAttribute("aria-selected", String(!result));
    elements.zoomValue.value = `${Math.round((result ? state.zoom : state.sourceZoom) * 100)}%`;
    if (result) sizeSourceEditor();
    else {
      requestAnimationFrame(() => {
        drawSourceThumb();
        clampLivePreviewPosition();
      });
    }
  }

  function updateZoom(next) {
    state.zoom = clamp(next, 0.35, 3);
    elements.patternCanvas.style.width = `${Math.round(state.patternLogicalWidth * state.zoom)}px`;
    elements.patternCanvas.style.height = `${Math.round(state.patternLogicalHeight * state.zoom)}px`;
    if (state.view === "result") elements.zoomValue.value = `${Math.round(state.zoom * 100)}%`;
  }

  function updateSourceZoom(next) {
    state.sourceZoom = clamp(next, 0.5, 6);
    elements.zoomValue.value = `${Math.round(state.sourceZoom * 100)}%`;
    drawSourceThumb();
  }

  function chooseInitialZoom() {
    const available = Math.max(280, elements.canvasStage.clientWidth - 68);
    const scale = available / Math.max(1, state.patternLogicalWidth);
    updateZoom(clamp(scale, 0.5, 1));
  }

  function editCell(event) {
    if (state.view !== "result" || !state.palette.length) return;
    const rect = elements.patternCanvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * state.patternLogicalWidth;
    const y = ((event.clientY - rect.top) / rect.height) * state.patternLogicalHeight;
    const col = Math.floor((x - state.margin) / state.renderCellSize);
    const row = Math.floor((y - state.margin) / state.renderCellSize);
    if (col < 0 || row < 0 || col >= state.cols || row >= state.rows) return;
    const index = row * state.cols + col;
    const previous = state.cells[index];
    const next = state.selectedColor;
    if (previous === next) return;
    state.history.push({ index, previous, next });
    if (state.history.length > 100) state.history.shift();
    state.future = [];
    state.cells[index] = next;
    recalculateCounts();
    renderPattern();
    renderLivePatternPreview();
    renderPalette();
    renderStatus();
    renderHistoryButtons();
  }

  function undo() {
    const action = state.history.pop();
    if (!action) return;
    state.cells[action.index] = action.previous;
    state.future.push(action);
    recalculateCounts();
    renderPattern();
    renderLivePatternPreview();
    renderPalette();
    renderStatus();
    renderHistoryButtons();
  }

  function redo() {
    const action = state.future.pop();
    if (!action) return;
    state.cells[action.index] = action.next;
    state.history.push(action);
    recalculateCounts();
    renderPattern();
    renderLivePatternPreview();
    renderPalette();
    renderStatus();
    renderHistoryButtons();
  }

  function rgbToHex(color) {
    return `#${[color.r, color.g, color.b]
      .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()}`;
  }

  function hexToRgb(hex) {
    const value = String(hex).replace("#", "");
    if (!/^[\dA-F]{6}$/i.test(value)) return null;
    const rgb = {
      r: Number.parseInt(value.slice(0, 2), 16),
      g: Number.parseInt(value.slice(2, 4), 16),
      b: Number.parseInt(value.slice(4, 6), 16),
    };
    return { ...rgb, lab: rgbToLab(rgb) };
  }

  function rgbToHsv(color) {
    const r = color.r / 255;
    const g = color.g / 255;
    const b = color.b / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    if (delta) {
      if (max === r) h = 60 * (((g - b) / delta) % 6);
      else if (max === g) h = 60 * ((b - r) / delta + 2);
      else h = 60 * ((r - g) / delta + 4);
    }
    if (h < 0) h += 360;
    return {
      h,
      s: max ? delta / max : 0,
      v: max,
    };
  }

  function hsvToRgb(hsv) {
    const h = ((hsv.h % 360) + 360) % 360;
    const s = clamp(hsv.s, 0, 1);
    const v = clamp(hsv.v, 0, 1);
    const chroma = v * s;
    const section = h / 60;
    const secondary = chroma * (1 - Math.abs((section % 2) - 1));
    let r = 0;
    let g = 0;
    let b = 0;
    if (section < 1) [r, g] = [chroma, secondary];
    else if (section < 2) [r, g] = [secondary, chroma];
    else if (section < 3) [g, b] = [chroma, secondary];
    else if (section < 4) [g, b] = [secondary, chroma];
    else if (section < 5) [r, b] = [secondary, chroma];
    else [r, b] = [chroma, secondary];
    const offset = v - chroma;
    const rgb = {
      r: Math.round((r + offset) * 255),
      g: Math.round((g + offset) * 255),
      b: Math.round((b + offset) * 255),
    };
    return { ...rgb, lab: rgbToLab(rgb) };
  }

  function updateColorEditorUi({ syncHex = true } = {}) {
    const draft = state.colorEditorDraft;
    const rgb = hsvToRgb(draft);
    elements.colorSvField.style.setProperty("--picker-hue", draft.h.toFixed(1));
    elements.colorSvField.style.setProperty("--picker-x", `${(draft.s * 100).toFixed(2)}%`);
    elements.colorSvField.style.setProperty("--picker-y", `${((1 - draft.v) * 100).toFixed(2)}%`);
    elements.colorSvField.setAttribute("aria-valuenow", String(Math.round(draft.v * 100)));
    elements.colorSvField.setAttribute(
      "aria-valuetext",
      `饱和度 ${Math.round(draft.s * 100)}%，明度 ${Math.round(draft.v * 100)}%`,
    );
    elements.colorHueInput.value = String(Math.round(draft.h));
    elements.colorEditorPreview.style.background = colorCss(rgb);
    if (syncHex) elements.colorHexInput.value = rgbToHex(rgb);
  }

  function closeColorEditor() {
    state.colorEditorPointer = null;
    state.colorEditorIndex = -1;
    safeCloseModal(elements.colorEditorDialog);
  }

  function openColorEditor(index) {
    const color = state.palette[index];
    if (!color) return;
    state.colorEditorIndex = index;
    state.colorEditorDraft = rgbToHsv(color);
    elements.colorEditorTitle.textContent = `${color.name} · 第 ${index + 1} 项`;
    updateColorEditorUi();
    safeShowModal(elements.colorEditorDialog);
  }

  function applyPaletteColor(index, rgb) {
    const color = state.palette[index];
    if (!color || !rgb) return;
    const previousHex = rgbToHex(color);
    Object.assign(color, rgb);
    if (!color.codeCustomized || color.code === previousHex) {
      color.code = rgbToHex(color);
      color.codeCustomized = false;
    }
    state.paletteEdited = true;
    elements.resetPaletteButton.disabled = !state.detectedPaletteSnapshot.length;
    renderPattern();
    renderLivePatternPreview();
    renderPalette();
  }

  function applyColorEditor() {
    const index = state.colorEditorIndex;
    if (!state.palette[index]) {
      closeColorEditor();
      return;
    }
    const rgb = hsvToRgb(state.colorEditorDraft);
    closeColorEditor();
    applyPaletteColor(index, rgb);
  }

  function setColorSvFromPointer(event) {
    const rect = elements.colorSvField.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    state.colorEditorDraft.s = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    state.colorEditorDraft.v = 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1);
    updateColorEditorUi();
  }

  function startColorSvPointer(event) {
    if (event.button > 0) return;
    state.colorEditorPointer = event.pointerId;
    elements.colorSvField.setPointerCapture?.(event.pointerId);
    setColorSvFromPointer(event);
    event.preventDefault();
  }

  function moveColorSvPointer(event) {
    if (state.colorEditorPointer !== event.pointerId) return;
    setColorSvFromPointer(event);
    event.preventDefault();
  }

  function finishColorSvPointer(event) {
    if (state.colorEditorPointer !== event.pointerId) return;
    state.colorEditorPointer = null;
    elements.colorSvField.releasePointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function normalizeColorCode(value, index) {
    const cleaned = String(value || "")
      .trim()
      .replace(/[\r\n,]+/g, " ")
      .slice(0, 12)
      .toUpperCase();
    return cleaned || rgbToHex(state.palette[index]);
  }

  function updateColorPickUi() {
    const active =
      state.colorPickTarget >= 0 && Boolean(state.palette[state.colorPickTarget]);
    elements.sourceEditor.classList.toggle("color-picking", active);
    elements.livePatternPreview.classList.toggle("color-picking", active);
    elements.colorPickBanner.hidden = !active;
    if (active) {
      const color = state.palette[state.colorPickTarget];
      elements.colorPickLabel.textContent = `正在为 ${color.name} 吸取原图颜色`;
      elements.sourceCanvas.setAttribute(
        "aria-label",
        `正在为图纸颜色 ${color.name} 吸取匹配色；点击原图中的目标颜色，按 Escape 取消`,
      );
    }
  }

  function cancelColorPick({ redraw = true } = {}) {
    if (state.colorPickTarget < 0) return;
    state.colorPickTarget = -1;
    updateColorPickUi();
    if (redraw) drawSourceThumb();
  }

  function beginColorPick(index) {
    if (!state.palette[index]) return;
    state.selectedColor = index;
    state.colorPickTarget = index;
    state.view = "source";
    updateView();
    updateColorPickUi();
    drawSourceThumb();
    showToast(`请点击原图，为 ${state.palette[index].name} 吸取匹配颜色`);
  }

  function sampleSourceColorAt(point) {
    const source = getSourcePixelData(1800);
    const sourcePoint = viewPointToSource({ x: point.x, y: point.y });
    const colors = [];
    const stepX = 1.25 / Math.max(1, source.width - 1);
    const stepY = 1.25 / Math.max(1, source.height - 1);
    for (const offsetY of [-1, 0, 1]) {
      for (const offsetX of [-1, 0, 1]) {
        colors.push(
          readSourcePixel(
            source,
            sourcePoint.x + offsetX * stepX,
            sourcePoint.y + offsetY * stepY,
          ),
        );
      }
    }
    const opaque = colors.filter((color) => color[3] >= 20);
    if (!opaque.length) return null;
    const rgb = {
      r: median(opaque.map((color) => color[0])),
      g: median(opaque.map((color) => color[1])),
      b: median(opaque.map((color) => color[2])),
    };
    return { ...rgb, lab: rgbToLab(rgb) };
  }

  function addPaletteMatch(index, match) {
    if (!state.palette[index] || !match) return;
    const transferThreshold = 2.5;
    state.palette.forEach((entry) => {
      entry.matches = (entry.matches || []).filter(
        (existing) => labDistance(existing.lab, match.lab) > transferThreshold,
      );
    });
    state.palette[index].matches.push(match);
    state.selectedColor = index;
    state.paletteEdited = true;
    remapCellsFromPaletteMatches();
  }

  function pickColorFromSourceEvent(event) {
    const target = state.colorPickTarget;
    if (target < 0 || !state.palette[target]) return false;
    const match = sampleSourceColorAt(pointerImagePoint(event));
    if (!match) {
      showToast("这里接近透明，请点击有颜色的位置");
      return true;
    }
    const name = state.palette[target].name;
    addPaletteMatch(target, match);
    cancelColorPick();
    showToast(`${rgbToHex(match)} 已匹配到 ${name}`);
    return true;
  }

  function addPaletteEntry() {
    const selected = state.palette[state.selectedColor];
    const rgb = selected
      ? { r: selected.r, g: selected.g, b: selected.b }
      : { r: 239, g: 236, b: 225 };
    const entry = {
      ...rgb,
      lab: rgbToLab(rgb),
      count: 0,
      name: makeAvailableName(),
      code: rgbToHex(rgb),
      codeCustomized: false,
      matches: [],
    };
    state.palette.push(entry);
    state.selectedColor = state.palette.length - 1;
    state.paletteEdited = true;
    renderAll();
  }

  function removePaletteEntry(index) {
    if (!state.palette[index]) return;
    const name = state.palette[index].name;
    cancelColorPick({ redraw: false });
    state.palette.splice(index, 1);
    state.selectedColor = clamp(index, 0, Math.max(0, state.palette.length - 1));
    state.paletteEdited = true;
    remapCellsFromPaletteMatches();
    showToast(`已删除图纸颜色 ${name}`);
  }

  function removePaletteMatch(index, matchIndex) {
    const entry = state.palette[index];
    if (!entry?.matches?.[matchIndex]) return;
    entry.matches.splice(matchIndex, 1);
    state.selectedColor = index;
    state.paletteEdited = true;
    remapCellsFromPaletteMatches();
  }

  function resetPaletteMappings() {
    if (!state.detectedPaletteSnapshot.length) {
      showToast("当前没有可恢复的自动识别结果");
      return;
    }
    cancelColorPick({ redraw: false });
    state.palette = clonePalette(state.detectedPaletteSnapshot);
    state.paletteEdited = false;
    state.selectedColor = 0;
    remapCellsFromPaletteMatches();
    showToast("颜色匹配已恢复为自动识别结果");
  }

  function transferPaletteMatch(sourceIndex, matchIndex, targetIndex) {
    const source = state.palette[sourceIndex];
    const target = state.palette[targetIndex];
    const match = source?.matches?.[matchIndex];
    if (!source || !target || !match || sourceIndex === targetIndex) return;
    source.matches.splice(matchIndex, 1);
    const transferThreshold = 2.5;
    state.palette.forEach((entry) => {
      entry.matches = (entry.matches || []).filter(
        (existing) => labDistance(existing.lab, match.lab) > transferThreshold,
      );
    });
    target.matches.push(match);
    state.selectedColor = targetIndex;
    state.paletteEdited = true;
    remapCellsFromPaletteMatches();
    showToast(`${rgbToHex(match)} 已移到 ${target.name}`);
  }

  function cleanupMatchDrag() {
    const drag = state.matchDrag;
    if (!drag) return;
    try {
      drag.chip.releasePointerCapture?.(drag.pointerId);
    } catch {
      // The chip can be replaced after a successful drop.
    }
    drag.chip.classList.remove("dragging");
    drag.ghost?.remove();
    elements.paletteList
      .querySelectorAll(".palette-mapping.drop-target")
      .forEach((card) => card.classList.remove("drop-target"));
    state.matchDrag = null;
  }

  function startMatchDrag(event) {
    if (event.button > 0 || event.target.closest("button")) return;
    const chip = event.target.closest(".match-color-chip");
    if (!chip) return;
    state.matchDrag = {
      pointerId: event.pointerId,
      sourceIndex: Number(chip.dataset.paletteIndex),
      matchIndex: Number(chip.dataset.matchIndex),
      startX: event.clientX,
      startY: event.clientY,
      active: false,
      chip,
      ghost: null,
      targetIndex: -1,
    };
    chip.setPointerCapture?.(event.pointerId);
  }

  function moveMatchDrag(event) {
    const drag = state.matchDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) {
      return;
    }
    if (!drag.active) {
      drag.active = true;
      drag.chip.classList.add("dragging");
      drag.ghost = drag.chip.cloneNode(true);
      drag.ghost.className = "match-drag-ghost";
      drag.ghost.querySelector("button")?.remove();
      document.body.append(drag.ghost);
    }
    drag.ghost.style.transform = `translate(${event.clientX + 12}px, ${event.clientY + 12}px)`;
    const targetCard = document.elementFromPoint(event.clientX, event.clientY)?.closest(".palette-mapping");
    drag.targetIndex = targetCard ? Number(targetCard.dataset.index) : -1;
    elements.paletteList.querySelectorAll(".palette-mapping").forEach((card) => {
      card.classList.toggle(
        "drop-target",
        card === targetCard && drag.targetIndex !== drag.sourceIndex,
      );
    });
    event.preventDefault();
  }

  function finishMatchDrag(event) {
    const drag = state.matchDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { active, sourceIndex, matchIndex, targetIndex } = drag;
    cleanupMatchDrag();
    if (active && targetIndex >= 0 && targetIndex !== sourceIndex) {
      transferPaletteMatch(sourceIndex, matchIndex, targetIndex);
      event.preventDefault();
    }
  }

  function downloadBlob(blob, extension) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${state.fileName || "拼豆图纸"}.${extension}`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function makeExportCanvas() {
    const cell = clamp(Math.floor(3000 / Math.max(state.cols, 1)), 12, 34);
    const margin = 46;
    const legendWidth = 270;
    const gridWidth = state.cols * cell;
    const gridHeight = state.rows * cell;
    const used = state.palette.filter((color) => color.count > 0);
    const legendHeight = 100 + used.length * 29;
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(4096, gridWidth + margin * 2 + legendWidth);
    canvas.height = Math.min(8192, Math.max(gridHeight + margin * 2, legendHeight));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fffdf8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const paletteIndex = state.cells[row * state.cols + col];
        const x = margin + col * cell;
        const y = margin + row * cell;
        if (paletteIndex < 0) {
          ctx.fillStyle = (row + col) % 2 ? "#f3f1eb" : "#e7e4dd";
        } else {
          ctx.fillStyle = colorCss(state.palette[paletteIndex]);
        }
        ctx.fillRect(x, y, cell, cell);
        if (paletteIndex >= 0 && cell >= 18) {
          const color = state.palette[paletteIndex];
          ctx.fillStyle = textColor(color);
          ctx.font = `700 ${Math.max(8, Math.floor(cell * 0.34))}px system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(color.name, x + cell / 2, y + cell / 2);
        }
      }
    }

    for (let col = 0; col <= state.cols; col += 1) {
      ctx.strokeStyle = col % 5 === 0 ? "rgba(25,25,22,.7)" : "rgba(25,25,22,.22)";
      ctx.lineWidth = col % 5 === 0 ? 1.5 : 1;
      const x = margin + col * cell + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, margin);
      ctx.lineTo(x, margin + gridHeight);
      ctx.stroke();
    }
    for (let row = 0; row <= state.rows; row += 1) {
      ctx.strokeStyle = row % 5 === 0 ? "rgba(25,25,22,.7)" : "rgba(25,25,22,.22)";
      ctx.lineWidth = row % 5 === 0 ? 1.5 : 1;
      const y = margin + row * cell + 0.5;
      ctx.beginPath();
      ctx.moveTo(margin, y);
      ctx.lineTo(margin + gridWidth, y);
      ctx.stroke();
    }

    const legendX = margin * 1.2 + gridWidth;
    ctx.fillStyle = "#20231f";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.font = "800 21px system-ui";
    ctx.fillText("豆稿 · 拼豆图纸", legendX, 48);
    ctx.fillStyle = "#70746c";
    ctx.font = "12px system-ui";
    ctx.fillText(`${state.cols} × ${state.rows} · ${state.cells.filter((cellIndex) => cellIndex >= 0).length} 颗`, legendX, 72);

    used.forEach((color, index) => {
      const y = 103 + index * 29;
      ctx.fillStyle = colorCss(color);
      ctx.fillRect(legendX, y - 16, 20, 20);
      ctx.strokeStyle = "rgba(0,0,0,.16)";
      ctx.strokeRect(legendX + 0.5, y - 15.5, 19, 19);
      ctx.fillStyle = "#20231f";
      ctx.font = "700 12px system-ui";
      ctx.fillText(color.name, legendX + 29, y);
      ctx.fillStyle = "#70746c";
      ctx.font = "11px system-ui";
      const hex = rgbToHex(color);
      const reference = color.code === hex ? hex : `${color.code} · ${hex}`;
      ctx.fillText(`${reference} · ${color.count} 颗`, legendX + 61, y);
    });
    return canvas;
  }

  function exportPng() {
    const canvas = makeExportCanvas();
    canvas.toBlob((blob) => {
      if (!blob) {
        showToast("无法生成 PNG，请尝试减小网格尺寸");
        return;
      }
      downloadBlob(blob, "png");
      safeCloseModal(elements.exportDialog);
      showToast("高清图纸已下载");
    }, "image/png");
  }

  function exportCsv() {
    const rows = [];
    rows.push(["行/列", ...Array.from({ length: state.cols }, (_, index) => index + 1)].join(","));
    for (let row = 0; row < state.rows; row += 1) {
      const values = [row + 1];
      for (let col = 0; col < state.cols; col += 1) {
        const cell = state.cells[row * state.cols + col];
        values.push(cell < 0 ? "" : state.palette[cell].name);
      }
      rows.push(values.join(","));
    }
    rows.push("");
    rows.push("名称,色号,HEX,数量");
    state.palette
      .filter((color) => color.count)
      .forEach((color) =>
        rows.push(`${color.name},${color.code},${rgbToHex(color)},${color.count}`),
      );
    downloadBlob(new Blob([`\uFEFF${rows.join("\r\n")}`], { type: "text/csv;charset=utf-8" }), "csv");
    safeCloseModal(elements.exportDialog);
    showToast("CSV 色号矩阵已下载");
  }

  function exportJson() {
    const data = {
      format: "dougao-pattern",
      version: 2,
      name: state.fileName,
      width: state.cols,
      height: state.rows,
      totalBeads: state.cells.filter((cell) => cell >= 0).length,
      palette: state.palette
        .map((color, index) => ({
          index,
          name: color.name,
          code: color.code,
          hex: rgbToHex(color),
          count: color.count,
        }))
        .filter((color) => color.count),
      cells: Array.from({ length: state.rows }, (_, row) =>
        Array.from({ length: state.cols }, (_, col) => {
          const cell = state.cells[row * state.cols + col];
          return cell < 0 ? null : state.palette[cell].name;
        }),
      ),
    };
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }),
      "json",
    );
    safeCloseModal(elements.exportDialog);
    showToast("工程数据已下载");
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  const processDebounced = debounce(() => processImage({ resetHistory: true }), 260);
  const preservePaletteDebounced = debounce(
    () => processImage({ resetHistory: true, preservePalette: true }),
    260,
  );
  const cropDebounced = debounce(() => {
    readCrop(true);
    drawSourceThumb();
    processImage({ resetHistory: true, preservePalette: true });
  }, 320);

  function updateGridFromInputs() {
    const cols = clamp(Math.round(Number(elements.gridCols.value) || state.cols), 2, 200);
    const rows = clamp(Math.round(Number(elements.gridRows.value) || state.rows), 2, 200);
    state.cols = cols;
    state.rows = rows;
    elements.gridCols.value = String(cols);
    elements.gridRows.value = String(rows);
    drawSourceThumb();
    elements.detectHint.textContent = `已手动设为 ${cols} × ${rows}，正在自动更新图纸；“重新识别”会重新推测行列数。`;
    processDebounced();
  }

  function setFrameMode(mode) {
    state.frameMode = mode === "free" ? "free" : "rect";
    if (state.frameMode === "rect") {
      const xs = state.frame.map((point) => point.x);
      const ys = state.frame.map((point) => point.y);
      const left = Math.min(...xs);
      const right = Math.max(...xs);
      const top = Math.min(...ys);
      const bottom = Math.max(...ys);
      state.frame = [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
      ];
      syncCropFromFrame();
      preservePaletteDebounced();
    }
    updateFrameMode();
    drawSourceThumb();
  }

  function setRotation(value) {
    state.rotation = clamp(Number(value) || 0, -15, 15);
    elements.rotationInput.value = state.rotation.toFixed(1);
    elements.rotationValue.value = `${state.rotation.toFixed(1)}°`;
    drawSourceThumb();
    preservePaletteDebounced();
  }

  function bindEvents() {
    elements.selectButton.addEventListener("click", () => elements.fileInput.click());
    elements.replaceButton.addEventListener("click", () => elements.fileInput.click());
    elements.fileInput.addEventListener("change", () => loadFile(elements.fileInput.files[0]));
    elements.clipboardButton.addEventListener("click", async () => {
      if (state.clipboardFile) {
        loadFile(state.clipboardFile);
        return;
      }
      const found = await readClipboardImage();
      if (found && state.clipboardFile) loadFile(state.clipboardFile);
    });

    for (const type of ["dragenter", "dragover"]) {
      elements.dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        elements.dropZone.classList.add("dragging");
      });
    }
    for (const type of ["dragleave", "drop"]) {
      elements.dropZone.addEventListener(type, (event) => {
        event.preventDefault();
        elements.dropZone.classList.remove("dragging");
      });
    }
    elements.dropZone.addEventListener("drop", (event) => loadFile(event.dataTransfer.files[0]));
    document.addEventListener("paste", (event) => {
      const file =
        [...(event.clipboardData?.files || [])].find((item) => item.type.startsWith("image/")) ||
        [...(event.clipboardData?.items || [])]
          .find((item) => item.kind === "file" && item.type.startsWith("image/"))
          ?.getAsFile();
      if (!file) return;
      event.preventDefault();
      loadFile(file);
    });

    elements.helpButton.addEventListener("click", () => safeShowModal(elements.helpDialog));
    $$(".modal-close").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        safeCloseModal(button.closest("dialog"));
      });
    });
    const helpConfirm = elements.helpDialog.querySelector('[value="close"]');
    helpConfirm.addEventListener("click", (event) => {
      event.preventDefault();
      safeCloseModal(elements.helpDialog);
    });
    elements.exportButton.addEventListener("click", () => {
      if (state.cells.length) safeShowModal(elements.exportDialog);
    });
    elements.colorEditorClose.addEventListener("click", closeColorEditor);
    elements.colorEditorCancel.addEventListener("click", closeColorEditor);
    elements.colorEditorApply.addEventListener("click", applyColorEditor);
    elements.colorEditorDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeColorEditor();
    });
    elements.colorEditorDialog.addEventListener("click", (event) => {
      if (event.target === elements.colorEditorDialog) closeColorEditor();
    });
    elements.colorSvField.addEventListener("pointerdown", startColorSvPointer);
    elements.colorSvField.addEventListener("pointermove", moveColorSvPointer);
    elements.colorSvField.addEventListener("pointerup", finishColorSvPointer);
    elements.colorSvField.addEventListener("pointercancel", finishColorSvPointer);
    elements.colorSvField.addEventListener("keydown", (event) => {
      const step = event.shiftKey ? 0.05 : 0.01;
      if (event.key === "ArrowLeft") state.colorEditorDraft.s -= step;
      else if (event.key === "ArrowRight") state.colorEditorDraft.s += step;
      else if (event.key === "ArrowDown") state.colorEditorDraft.v -= step;
      else if (event.key === "ArrowUp") state.colorEditorDraft.v += step;
      else return;
      state.colorEditorDraft.s = clamp(state.colorEditorDraft.s, 0, 1);
      state.colorEditorDraft.v = clamp(state.colorEditorDraft.v, 0, 1);
      updateColorEditorUi();
      event.preventDefault();
    });
    elements.colorHueInput.addEventListener("input", () => {
      state.colorEditorDraft.h = Number(elements.colorHueInput.value) || 0;
      updateColorEditorUi();
    });
    elements.colorHexInput.addEventListener("input", () => {
      const rgb = hexToRgb(elements.colorHexInput.value);
      if (!rgb) return;
      state.colorEditorDraft = rgbToHsv(rgb);
      updateColorEditorUi({ syncHex: false });
    });
    elements.colorHexInput.addEventListener("focusout", () => updateColorEditorUi());
    elements.colorHexInput.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      applyColorEditor();
    });
    elements.detectButton.addEventListener("click", () => {
      if (!state.image) return;
      state.frame = defaultFrame();
      state.sourcePan = { x: 0, y: 0 };
      state.sourceZoom = 1;
      suggestPhotoFrame();
      syncCropFromFrame();
      drawSourceThumb();
      autoDetect(false);
    });
    elements.rectModeButton.addEventListener("click", () => setFrameMode("rect"));
    elements.freeModeButton.addEventListener("click", () => setFrameMode("free"));
    elements.rotationInput.addEventListener("input", () => setRotation(elements.rotationInput.value));
    elements.rotationResetButton.addEventListener("click", () => setRotation(0));
    elements.resetFrameButton.addEventListener("click", () => {
      if (!state.image) return;
      state.frame = defaultFrame();
      state.sourcePan = { x: 0, y: 0 };
      state.sourceZoom = 1;
      suggestPhotoFrame();
      syncCropFromFrame();
      drawSourceThumb();
      autoDetect(false);
    });
    elements.sourceMode.addEventListener("change", () => {
      if (!state.image) return;
      suggestPhotoFrame();
      drawSourceThumb();
      autoDetect(false);
    });
    elements.sourceCanvas.addEventListener("pointerdown", startFramePointer);
    elements.sourceCanvas.addEventListener("pointermove", moveFramePointer);
    elements.sourceCanvas.addEventListener("pointerup", finishFramePointer);
    elements.sourceCanvas.addEventListener("pointercancel", finishFramePointer);
    elements.sourceCanvas.addEventListener("keydown", (event) => {
      if (!state.image || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      const amount = event.shiftKey ? 0.01 : 0.0025;
      const deltaX = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
      const deltaY = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
      const limit = Math.max(1, (state.sourceZoom + 1) / 2);
      state.sourcePan = {
        x: clamp(state.sourcePan.x + deltaX, -limit, limit),
        y: clamp(state.sourcePan.y + deltaY, -limit, limit),
      };
      drawSourceThumb();
      preservePaletteDebounced();
      event.preventDefault();
    });

    for (const input of [
      elements.cropLeft,
      elements.cropRight,
      elements.cropTop,
      elements.cropBottom,
    ]) {
      input.addEventListener("input", cropDebounced);
    }
    for (const input of [elements.gridCols, elements.gridRows]) {
      input.addEventListener("input", updateGridFromInputs);
      input.addEventListener(
        "wheel",
        (event) => {
          if (!event.deltaY) return;
          event.preventDefault();
          const amount = event.shiftKey ? 5 : 1;
          input.value = String(clamp((Number(input.value) || 2) + (event.deltaY < 0 ? amount : -amount), 2, 200));
          updateGridFromInputs();
        },
        { passive: false },
      );
    }
    for (const input of [
      elements.denoise,
      elements.colorMerge,
      elements.keepTransparent,
    ]) {
      input.addEventListener("input", () => {
        updateRangeLabels();
        processDebounced();
      });
    }

    $$(".section-title").forEach((button) => {
      button.addEventListener("click", () => {
        button.setAttribute("aria-expanded", String(button.getAttribute("aria-expanded") !== "true"));
      });
    });

    elements.paletteList.addEventListener("pointerdown", startMatchDrag);
    elements.paletteList.addEventListener("pointermove", moveMatchDrag);
    elements.paletteList.addEventListener("pointerup", finishMatchDrag);
    elements.paletteList.addEventListener("pointercancel", cleanupMatchDrag);
    elements.paletteList.addEventListener("click", (event) => {
      const card = event.target.closest(".palette-mapping");
      if (!card) return;
      const index = Number(card.dataset.index);
      state.selectedColor = index;
      elements.paletteList.querySelectorAll(".palette-mapping").forEach((item) => {
        item.classList.toggle("active", item === card);
      });
      const action = event.target.closest("[data-action]")?.dataset.action;
      if (action === "open-color-editor") {
        openColorEditor(index);
      } else if (action === "pick-match") {
        beginColorPick(index);
      } else if (action === "remove-match") {
        removePaletteMatch(index, Number(event.target.closest("[data-action]").dataset.matchIndex));
      } else if (action === "remove-entry") {
        removePaletteEntry(index);
      }
    });
    elements.paletteList.addEventListener("input", (event) => {
      const card = event.target.closest(".palette-mapping");
      if (!card) return;
      const index = Number(card.dataset.index);
      const color = state.palette[index];
      if (!color) return;
      if (event.target.dataset.action === "color-code") {
        color.code = event.target.value.slice(0, 12);
        color.codeCustomized = true;
        state.paletteEdited = true;
        elements.resetPaletteButton.disabled = !state.detectedPaletteSnapshot.length;
        renderPattern();
      }
    });
    elements.paletteList.addEventListener("focusout", (event) => {
      if (event.target.dataset.action !== "color-code") return;
      const card = event.target.closest(".palette-mapping");
      if (!card) return;
      const index = Number(card.dataset.index);
      const color = state.palette[index];
      if (!color) return;
      color.code = normalizeColorCode(event.target.value, index);
      color.codeCustomized = color.code !== rgbToHex(color);
      event.target.value = color.code;
      renderPattern();
    });
    elements.addPaletteButton.addEventListener("click", addPaletteEntry);
    elements.resetPaletteButton.addEventListener("click", resetPaletteMappings);
    elements.cancelColorPickButton.addEventListener("click", () => cancelColorPick());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.colorPickTarget >= 0) {
        cancelColorPick();
        showToast("已取消吸取颜色");
      }
    });
    elements.patternCanvas.addEventListener("click", editCell);
    elements.livePatternPreview.addEventListener("pointerdown", startLivePreviewDrag);
    window.addEventListener("pointermove", moveLivePreviewDrag);
    window.addEventListener("pointerup", finishLivePreviewDrag);
    window.addEventListener("pointercancel", finishLivePreviewDrag);
    elements.livePreviewToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      setLivePreviewCollapsed(!state.livePreviewCollapsed);
    });
    elements.undoButton.addEventListener("click", undo);
    elements.redoButton.addEventListener("click", redo);
    elements.zoomOut.addEventListener("click", () => {
      if (state.view === "result") updateZoom(state.zoom - 0.15);
      else updateSourceZoom(state.sourceZoom - 0.25);
    });
    elements.zoomIn.addEventListener("click", () => {
      if (state.view === "result") updateZoom(state.zoom + 0.15);
      else updateSourceZoom(state.sourceZoom + 0.25);
    });

    elements.resultTab.addEventListener("click", () => {
      cancelColorPick({ redraw: false });
      state.view = "result";
      updateView();
      updateZoom(state.zoom);
    });
    elements.originalTab.addEventListener("click", () => {
      state.view = "source";
      updateView();
      drawSourceThumb();
    });

    elements.exportDialog.addEventListener("click", (event) => {
      const button = event.target.closest("[data-export]");
      if (!button) return;
      const type = button.dataset.export;
      if (type === "png") exportPng();
      else if (type === "csv") exportCsv();
      else if (type === "json") exportJson();
      else if (type === "print") {
        safeCloseModal(elements.exportDialog);
        window.print();
      }
    });

    window.addEventListener(
      "resize",
      debounce(() => {
        if (!state.image) return;
        sizeSourceEditor();
        drawSourceThumb();
        clampLivePreviewPosition();
      }, 120),
    );
    window.addEventListener("focus", detectGrantedClipboardImage);
    window.addEventListener("keydown", (event) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier || elements.workspace.hidden) return;
      if (event.key.toLowerCase() === "z" && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    });
  }

  function init() {
    restoreSettings();
    bindEvents();
    updateFrameMode();
    requestAnimationFrame(detectGrantedClipboardImage);
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js?v=31").catch(() => {});
    }
    window.addEventListener(
      "load",
      () => {
        if (state.image) chooseInitialZoom();
      },
      { once: true },
    );
  }

  const coreApi = Object.freeze({
    clamp,
    median,
    rgbToLab,
    labDistance,
    scoreGridCount,
    inferAxisCount,
    cleanCells,
    makeCode,
    rgbToHex,
  });

  if (typeof module !== "undefined" && module.exports) module.exports = coreApi;
  if (!hasDocument) globalThis.DougaoCore = coreApi;
  if (hasDocument) {
    window.DougaoCore = coreApi;
    init();
  }
})();
