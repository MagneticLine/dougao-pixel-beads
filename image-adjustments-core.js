(() => {
  "use strict";

  const DEFAULTS = Object.freeze({
    exposure: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
    tint: 0,
  });

  const clamp = (value, minimum, maximum) =>
    Math.min(maximum, Math.max(minimum, value));

  function normalizeAdjustments(value = {}) {
    return {
      exposure: clamp(Number(value.exposure) || 0, -2, 2),
      contrast: clamp(Number(value.contrast) || 0, -100, 100),
      saturation: clamp(Number(value.saturation) || 0, -100, 100),
      temperature: clamp(Number(value.temperature) || 0, -100, 100),
      tint: clamp(Number(value.tint) || 0, -100, 100),
    };
  }

  function isNeutral(value = {}) {
    const normalized = normalizeAdjustments(value);
    return Object.keys(DEFAULTS).every(
      (key) => Math.abs(normalized[key] - DEFAULTS[key]) < 1e-9,
    );
  }

  function adjustRgb(red, green, blue, value = {}) {
    const adjustments = normalizeAdjustments(value);
    const exposureGain = 2 ** adjustments.exposure;
    const contrastGain = 2 ** (adjustments.contrast / 100);
    const saturationGain = 1 + adjustments.saturation / 100;
    const warmth = adjustments.temperature / 100;
    const tint = adjustments.tint / 100;

    let r = (Number(red) || 0) / 255;
    let g = (Number(green) || 0) / 255;
    let b = (Number(blue) || 0) / 255;

    r *= exposureGain;
    g *= exposureGain;
    b *= exposureGain;

    r += warmth * 0.1 + tint * 0.035;
    g -= Math.abs(warmth) * 0.012 + tint * 0.07;
    b -= warmth * 0.1 - tint * 0.035;

    r = (r - 0.5) * contrastGain + 0.5;
    g = (g - 0.5) * contrastGain + 0.5;
    b = (b - 0.5) * contrastGain + 0.5;

    const luminance = r * 0.2126 + g * 0.7152 + b * 0.0722;
    r = luminance + (r - luminance) * saturationGain;
    g = luminance + (g - luminance) * saturationGain;
    b = luminance + (b - luminance) * saturationGain;

    return [
      Math.round(clamp(r, 0, 1) * 255),
      Math.round(clamp(g, 0, 1) * 255),
      Math.round(clamp(b, 0, 1) * 255),
    ];
  }

  function applyToImageData(imageData, value = {}) {
    if (!imageData?.data) {
      throw new TypeError("imageData.data is required");
    }
    const adjustments = normalizeAdjustments(value);
    if (isNeutral(adjustments)) return imageData;
    const data = imageData.data;
    for (let index = 0; index < data.length; index += 4) {
      const [red, green, blue] = adjustRgb(
        data[index],
        data[index + 1],
        data[index + 2],
        adjustments,
      );
      data[index] = red;
      data[index + 1] = green;
      data[index + 2] = blue;
    }
    return imageData;
  }

  globalThis.DougaoImageAdjustments = Object.freeze({
    DEFAULTS,
    normalizeAdjustments,
    isNeutral,
    adjustRgb,
    applyToImageData,
  });
})();
