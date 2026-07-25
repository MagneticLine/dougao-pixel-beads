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
    replaceButton: $("#replaceButton"),
    fileName: $("#fileName"),
    sourceCanvas: $("#sourceCanvas"),
    patternCanvas: $("#patternCanvas"),
    originalCanvas: $("#originalCanvas"),
    canvasStage: $("#canvasStage"),
    processing: $("#processing"),
    gridCols: $("#gridCols"),
    gridRows: $("#gridRows"),
    cropLeft: $("#cropLeft"),
    cropRight: $("#cropRight"),
    cropTop: $("#cropTop"),
    cropBottom: $("#cropBottom"),
    detectButton: $("#detectButton"),
    detectHint: $("#detectHint"),
    denoise: $("#denoise"),
    denoiseValue: $("#denoiseValue"),
    colorMerge: $("#colorMerge"),
    mergeValue: $("#mergeValue"),
    maxColors: $("#maxColors"),
    keepTransparent: $("#keepTransparent"),
    paletteList: $("#paletteList"),
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
    palette: [],
    cells: [],
    confidences: [],
    selectedColor: 0,
    zoom: 1,
    view: "result",
    renderCellSize: 20,
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
          maxColors: elements.maxColors.value,
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
    if (saved.maxColors != null) elements.maxColors.value = saved.maxColors;
    if (saved.keepTransparent != null) elements.keepTransparent.checked = saved.keepTransparent;
    updateRangeLabels();
  }

  function updateRangeLabels() {
    elements.denoiseValue.value = labels.denoise[Number(elements.denoise.value)];
    elements.mergeValue.value = labels.merge[Number(elements.colorMerge.value)];
  }

  function readCrop() {
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
    return crop;
  }

  function getCropRect() {
    const { naturalWidth: width, naturalHeight: height } = state.image;
    const crop = state.crop;
    const x = Math.round((width * crop.left) / 100);
    const y = Math.round((height * crop.top) / 100);
    const right = Math.round((width * crop.right) / 100);
    const bottom = Math.round((height * crop.bottom) / 100);
    return {
      x,
      y,
      width: Math.max(2, width - x - right),
      height: Math.max(2, height - y - bottom),
    };
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
      state.history = [];
      state.future = [];
      elements.fileName.textContent = state.fileName;
      for (const side of ["Left", "Right", "Top", "Bottom"]) elements[`crop${side}`].value = 0;
      elements.hero.hidden = true;
      elements.workspace.hidden = false;
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

  function drawSourceThumb() {
    if (!state.image) return;
    const canvas = elements.sourceCanvas;
    const box = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(260, Math.round(box.width * dpr));
    canvas.height = Math.max(120, Math.round(box.height * dpr));
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const scale = Math.min(canvas.width / state.image.naturalWidth, canvas.height / state.image.naturalHeight);
    const width = state.image.naturalWidth * scale;
    const height = state.image.naturalHeight * scale;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;
    ctx.drawImage(state.image, x, y, width, height);

    const crop = state.crop;
    const cx = x + (width * crop.left) / 100;
    const cy = y + (height * crop.top) / 100;
    const cw = width * (1 - (crop.left + crop.right) / 100);
    const ch = height * (1 - (crop.top + crop.bottom) / 100);
    ctx.save();
    ctx.fillStyle = "rgba(26, 25, 22, 0.56)";
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.rect(cx, cy, cw, ch);
    ctx.fill("evenodd");
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2 * dpr;
    ctx.setLineDash([5 * dpr, 4 * dpr]);
    ctx.strokeRect(cx, cy, cw, ch);
    ctx.restore();
  }

  function makeAnalysisCanvas(maxSide = 520) {
    const rect = getCropRect();
    const scale = Math.min(1, maxSide / Math.max(rect.width, rect.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(rect.width * scale));
    canvas.height = Math.max(2, Math.round(rect.height * scale));
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (!elements.keepTransparent.checked) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(
      state.image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return canvas;
  }

  function buildAxisEdges(imageData, axis) {
    const { data, width, height } = imageData;
    const length = axis === "x" ? width : height;
    const cross = axis === "x" ? height : width;
    const step = Math.max(1, Math.floor(cross / 90));
    const edges = new Float32Array(length);

    for (let position = 1; position < length; position += 1) {
      let total = 0;
      let count = 0;
      for (let other = 0; other < cross; other += step) {
        const x1 = axis === "x" ? position - 1 : other;
        const y1 = axis === "x" ? other : position - 1;
        const x2 = axis === "x" ? position : other;
        const y2 = axis === "x" ? other : position;
        const a = (y1 * width + x1) * 4;
        const b = (y2 * width + x2) * 4;
        const alpha = Math.min(data[a + 3], data[b + 3]) / 255;
        total +=
          alpha *
          (Math.abs(data[a] - data[b]) * 0.3 +
            Math.abs(data[a + 1] - data[b + 1]) * 0.55 +
            Math.abs(data[a + 2] - data[b + 2]) * 0.15);
        count += 1;
      }
      edges[position] = count ? total / count : 0;
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

  async function autoDetect(isInitial = false) {
    if (!state.image) return;
    readCrop();
    const token = ++state.processingToken;
    elements.processing.hidden = false;
    elements.detectButton.disabled = true;
    await sleepFrame();

    try {
      const canvas = makeAnalysisCanvas();
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const rect = getCropRect();
      const xResult = inferAxisCount(buildAxisEdges(imageData, "x"), rect.width);
      const yResult = inferAxisCount(buildAxisEdges(imageData, "y"), rect.height);
      if (token !== state.processingToken) return;

      state.cols = clamp(xResult.count, 2, 200);
      state.rows = clamp(yResult.count, 2, 200);

      // Very elongated artwork is commonly a uniformly scaled grid. Reconcile implausible cell ratios.
      const cellX = rect.width / state.cols;
      const cellY = rect.height / state.rows;
      if (Math.max(cellX, cellY) / Math.max(0.01, Math.min(cellX, cellY)) > 1.45) {
        if (xResult.confidence > yResult.confidence + 0.12) {
          state.rows = clamp(Math.round(rect.height / cellX), 2, 200);
        } else if (yResult.confidence > xResult.confidence + 0.12) {
          state.cols = clamp(Math.round(rect.width / cellY), 2, 200);
        }
      }

      state.detectionConfidence = (xResult.confidence + yResult.confidence) / 2;
      elements.gridCols.value = state.cols;
      elements.gridRows.value = state.rows;
      elements.detectHint.textContent =
        state.detectionConfidence > 0.7
          ? `已识别为 ${state.cols} × ${state.rows}。修改行列数会立即更新；此按钮只负责重新推测。`
          : `暂定 ${state.cols} × ${state.rows}；请检查行列数。手动修改后会立即更新图纸。`;
      await processImage({ resetHistory: true });
      if (isInitial) chooseInitialZoom();
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
    return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
  }

  function sampleCells() {
    const rect = getCropRect();
    const cols = state.cols;
    const rows = state.rows;
    const nativeCell = Math.min(rect.width / cols, rect.height / rows);
    const sampleSize = clamp(Math.floor(nativeCell), 4, 10);
    const canvas = document.createElement("canvas");
    canvas.width = cols * sampleSize;
    canvas.height = rows * sampleSize;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (!elements.keepTransparent.checked) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(
      state.image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const samples = [];
    const confidences = [];
    const inset = Math.max(1, Math.floor(sampleSize * 0.2));

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const rs = [];
        const gs = [];
        const bs = [];
        const alphas = [];
        for (let y = inset; y < sampleSize - inset; y += 1) {
          for (let x = inset; x < sampleSize - inset; x += 1) {
            const index = ((row * sampleSize + y) * canvas.width + col * sampleSize + x) * 4;
            const alpha = data[index + 3];
            alphas.push(alpha);
            if (alpha >= 20) {
              rs.push(data[index]);
              gs.push(data[index + 1]);
              bs.push(data[index + 2]);
            }
          }
        }
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
        confidences.push(clamp(1 - variability / 50, 0, 1));
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

    const maxColors = clamp(Math.round(Number(elements.maxColors.value) || 24), 1, 256);
    elements.maxColors.value = maxColors;
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
      .map((color) => ({
        r: Math.round(color.r),
        g: Math.round(color.g),
        b: Math.round(color.b),
        lab: rgbToLab(color),
        count: 0,
      }))
      .sort((a, b) => {
        const hueA = Math.atan2(a.lab.b, a.lab.a);
        const hueB = Math.atan2(b.lab.b, b.lab.a);
        return hueA - hueB || b.lab.l - a.lab.l;
      })
      .map((color, index) => ({ ...color, code: makeCode(index) }));
  }

  function makeCode(index) {
    const letter = String.fromCharCode(65 + (index % 26));
    return `${letter}${Math.floor(index / 26) + 1}`;
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

  async function processImage({ resetHistory = false } = {}) {
    if (!state.image) return;
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
      const palette = clusterPalette(samples);
      if (!palette.length) {
        showToast("裁切区域几乎完全透明，请调整裁切或关闭透明留空");
        return;
      }
      let cells = samples.map((color) => (color.a ? nearestColorIndex(color, palette) : -1));
      cells = cleanCells(cells, confidences, palette, Number(elements.denoise.value));
      if (token !== state.processingToken) return;

      state.palette = palette;
      state.cells = cells;
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
    state.renderCellSize = cell;
    state.margin = margin;
    canvas.width = cols * cell + margin * 2;
    canvas.height = rows * cell + margin * 2;
    canvas.style.width = `${Math.round(canvas.width * state.zoom)}px`;
    canvas.style.height = `${Math.round(canvas.height * state.zoom)}px`;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fffefb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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
          ctx.font = `700 ${Math.max(7, Math.floor(cell * 0.36))}px system-ui`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(color.code, x + cell / 2, y + cell / 2 + 0.5);
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
      ctx.font = `600 ${Math.max(7, Math.min(10, cell * 0.45))}px system-ui`;
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
    const rect = getCropRect();
    const scale = Math.min(1, 1400 / Math.max(rect.width, rect.height));
    canvas.width = Math.max(2, Math.round(rect.width * scale));
    canvas.height = Math.max(2, Math.round(rect.height * scale));
    canvas.style.width = `${Math.round(canvas.width * state.zoom)}px`;
    canvas.style.height = `${Math.round(canvas.height * state.zoom)}px`;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      state.image,
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }

  function renderPalette() {
    elements.paletteList.replaceChildren();
    const fragment = document.createDocumentFragment();
    state.palette.forEach((color, index) => {
      if (!color.count) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = `palette-item${index === state.selectedColor ? " active" : ""}`;
      button.dataset.index = String(index);
      button.setAttribute("aria-label", `选择颜色 ${color.code}，共 ${color.count} 颗`);
      const swatch = document.createElement("span");
      swatch.className = "swatch";
      swatch.style.background = colorCss(color);
      const info = document.createElement("span");
      const name = document.createElement("b");
      name.textContent = `${color.code} · ${rgbToHex(color)}`;
      const count = document.createElement("small");
      count.textContent = `${color.count} 颗`;
      info.append(name, count);
      button.append(swatch, info);
      fragment.append(button);
    });
    elements.paletteList.append(fragment);
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
    drawSourceThumb();
    renderPattern();
    renderOriginal();
    renderPalette();
    renderStatus();
    renderHistoryButtons();
    updateView();
  }

  function updateView() {
    const result = state.view === "result";
    elements.patternCanvas.hidden = !result;
    elements.originalCanvas.hidden = result;
    elements.resultTab.classList.toggle("active", result);
    elements.originalTab.classList.toggle("active", !result);
    elements.resultTab.setAttribute("aria-selected", String(result));
    elements.originalTab.setAttribute("aria-selected", String(!result));
  }

  function updateZoom(next) {
    state.zoom = clamp(next, 0.35, 3);
    elements.zoomValue.value = `${Math.round(state.zoom * 100)}%`;
    if (state.view === "result") {
      elements.patternCanvas.style.width = `${Math.round(elements.patternCanvas.width * state.zoom)}px`;
      elements.patternCanvas.style.height = `${Math.round(elements.patternCanvas.height * state.zoom)}px`;
    } else {
      elements.originalCanvas.style.width = `${Math.round(elements.originalCanvas.width * state.zoom)}px`;
      elements.originalCanvas.style.height = `${Math.round(elements.originalCanvas.height * state.zoom)}px`;
    }
  }

  function chooseInitialZoom() {
    const available = Math.max(280, elements.canvasStage.clientWidth - 68);
    const scale = available / Math.max(1, elements.patternCanvas.width);
    updateZoom(clamp(scale, 0.5, 1));
  }

  function editCell(event) {
    if (state.view !== "result" || !state.palette.length) return;
    const rect = elements.patternCanvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * elements.patternCanvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * elements.patternCanvas.height;
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
          ctx.fillText(color.code, x + cell / 2, y + cell / 2);
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
      ctx.fillText(color.code, legendX + 29, y);
      ctx.fillStyle = "#70746c";
      ctx.font = "11px system-ui";
      ctx.fillText(`${rgbToHex(color)}  ·  ${color.count} 颗`, legendX + 61, y);
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
        values.push(cell < 0 ? "" : state.palette[cell].code);
      }
      rows.push(values.join(","));
    }
    rows.push("");
    rows.push("色号,HEX,数量");
    state.palette
      .filter((color) => color.count)
      .forEach((color) => rows.push(`${color.code},${rgbToHex(color)},${color.count}`));
    downloadBlob(new Blob([`\uFEFF${rows.join("\r\n")}`], { type: "text/csv;charset=utf-8" }), "csv");
    safeCloseModal(elements.exportDialog);
    showToast("CSV 色号矩阵已下载");
  }

  function exportJson() {
    const data = {
      format: "dougao-pattern",
      version: 1,
      name: state.fileName,
      width: state.cols,
      height: state.rows,
      totalBeads: state.cells.filter((cell) => cell >= 0).length,
      palette: state.palette
        .map((color, index) => ({ index, code: color.code, hex: rgbToHex(color), count: color.count }))
        .filter((color) => color.count),
      cells: Array.from({ length: state.rows }, (_, row) =>
        Array.from({ length: state.cols }, (_, col) => {
          const cell = state.cells[row * state.cols + col];
          return cell < 0 ? null : state.palette[cell].code;
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
  const cropDebounced = debounce(() => {
    readCrop();
    drawSourceThumb();
    processImage({ resetHistory: true });
  }, 320);

  function bindEvents() {
    elements.selectButton.addEventListener("click", () => elements.fileInput.click());
    elements.replaceButton.addEventListener("click", () => elements.fileInput.click());
    elements.fileInput.addEventListener("change", () => loadFile(elements.fileInput.files[0]));

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
      const file = [...(event.clipboardData?.files || [])].find((item) => item.type.startsWith("image/"));
      if (file) loadFile(file);
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
    elements.detectButton.addEventListener("click", () => autoDetect(false));

    for (const input of [
      elements.cropLeft,
      elements.cropRight,
      elements.cropTop,
      elements.cropBottom,
    ]) {
      input.addEventListener("input", cropDebounced);
    }
    for (const input of [elements.gridCols, elements.gridRows]) {
      input.addEventListener("input", () => {
        const cols = clamp(Math.round(Number(elements.gridCols.value) || state.cols), 2, 200);
        const rows = clamp(Math.round(Number(elements.gridRows.value) || state.rows), 2, 200);
        elements.detectHint.textContent = `已手动设为 ${cols} × ${rows}，正在自动更新图纸；“重新自动识别”会重新推测行列数。`;
        processDebounced();
      });
    }
    for (const input of [
      elements.denoise,
      elements.colorMerge,
      elements.maxColors,
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

    elements.paletteList.addEventListener("click", (event) => {
      const item = event.target.closest(".palette-item");
      if (!item) return;
      state.selectedColor = Number(item.dataset.index);
      renderPalette();
    });
    elements.patternCanvas.addEventListener("click", editCell);
    elements.undoButton.addEventListener("click", undo);
    elements.redoButton.addEventListener("click", redo);
    elements.zoomOut.addEventListener("click", () => updateZoom(state.zoom - 0.15));
    elements.zoomIn.addEventListener("click", () => updateZoom(state.zoom + 0.15));

    elements.resultTab.addEventListener("click", () => {
      state.view = "result";
      updateView();
      updateZoom(state.zoom);
    });
    elements.originalTab.addEventListener("click", () => {
      state.view = "original";
      updateView();
      updateZoom(state.zoom);
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
        drawSourceThumb();
      }, 120),
    );
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
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("./sw.js?v=6").catch(() => {});
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
