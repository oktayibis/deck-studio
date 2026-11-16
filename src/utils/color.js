/**
 * Color & WCAG 2.1 Contrast Utilities for Brand Kit Extraction & Headless Checker
 */

export function normalizeHex(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  const hexMatch = trimmed.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) {
    let hex = hexMatch[1].toUpperCase();
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    return `#${hex}`;
  }
  const rgb = parseColorToRgba(trimmed);
  if (rgb) {
    return rgbaToHex(rgb);
  }
  return null;
}

export function parseColorToRgba(colorStr) {
  if (!colorStr || typeof colorStr !== 'string') return null;
  const str = colorStr.trim().toLowerCase();
  if (str === 'transparent' || str === 'none') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  const hexMatch = str.match(/^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hexMatch) {
    let h = hexMatch[1];
    if (h.length === 3) {
      h = h.split('').map((c) => c + c).join('');
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }

  const rgbMatch = str.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/);
  if (rgbMatch) {
    const r = Math.min(255, Math.max(0, Math.round(parseFloat(rgbMatch[1]))));
    const g = Math.min(255, Math.max(0, Math.round(parseFloat(rgbMatch[2]))));
    const b = Math.min(255, Math.max(0, Math.round(parseFloat(rgbMatch[3]))));
    let a = 1;
    if (rgbMatch[4] !== undefined) {
      a = rgbMatch[4].endsWith('%')
        ? parseFloat(rgbMatch[4]) / 100
        : parseFloat(rgbMatch[4]);
    }
    return { r, g, b, a: Math.min(1, Math.max(0, a)) };
  }

  return null;
}

export function rgbaToHex({ r, g, b }) {
  const toHex = (n) => Math.min(255, Math.max(0, Math.round(n))).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Alpha-composites foreground RGBA over an opaque background RGB.
 */
export function compositeOver(fg, bg) {
  const alpha = fg.a ?? 1;
  if (alpha >= 0.999) return { r: fg.r, g: fg.g, b: fg.b, a: 1 };
  if (alpha <= 0.001) return { r: bg.r, g: bg.g, b: bg.b, a: 1 };
  return {
    r: Math.round(fg.r * alpha + bg.r * (1 - alpha)),
    g: Math.round(fg.g * alpha + bg.g * (1 - alpha)),
    b: Math.round(fg.b * alpha + bg.b * (1 - alpha)),
    a: 1
  };
}

/**
 * Computes WCAG 2.1 relative luminance for an RGB color.
 */
export function getRelativeLuminance(color) {
  const rgb = typeof color === 'string' ? parseColorToRgba(color) : color;
  if (!rgb) return 0;
  const transform = (channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const R = transform(rgb.r);
  const G = transform(rgb.g);
  const B = transform(rgb.b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Computes WCAG 2.1 contrast ratio between two colors (1.0 to 21.0).
 */
export function getContrastRatio(colorA, colorB) {
  const lumA = getRelativeLuminance(colorA);
  const lumB = getRelativeLuminance(colorB);
  const brightest = Math.max(lumA, lumB);
  const darkest = Math.min(lumA, lumB);
  return Number(((brightest + 0.05) / (darkest + 0.05)).toFixed(2));
}

/**
 * Converts RGB to CIE LAB for perceptual Delta-E (CIE76) color comparison.
 */
export function rgbToLab(color) {
  const rgb = typeof color === 'string' ? parseColorToRgba(color) : color;
  if (!rgb) return { l: 0, a: 0, b: 0 };

  let r = rgb.r / 255;
  let g = rgb.g / 255;
  let b = rgb.b / 255;

  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

  let x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  let y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.0;
  let z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz)
  };
}

/**
 * Computes perceptual Delta-E distance between two colors.
 */
export function getDeltaE(colorA, colorB) {
  const labA = rgbToLab(colorA);
  const labB = rgbToLab(colorB);
  const dl = labA.l - labB.l;
  const da = labA.a - labB.a;
  const db = labA.b - labB.b;
  return Number(Math.sqrt(dl * dl + da * da + db * db).toFixed(2));
}

/**
 * Checks whether a color matches any color in the allowed Brand Kit palette within Delta-E tolerance.
 */
export function matchColorInPalette(colorInput, paletteHexes, toleranceDeltaE = 10) {
  const rgba = typeof colorInput === 'string' ? parseColorToRgba(colorInput) : colorInput;
  if (!rgba || rgba.a === 0) {
    return { matched: true, nearestHex: 'transparent', deltaE: 0 };
  }
  let bestDelta = Infinity;
  let bestHex = null;
  for (const hex of paletteHexes) {
    const norm = normalizeHex(hex);
    if (!norm) continue;
    const d = getDeltaE(rgba, norm);
    if (d < bestDelta) {
      bestDelta = d;
      bestHex = norm;
    }
  }
  return {
    matched: bestDelta <= toleranceDeltaE,
    nearestHex: bestHex,
    deltaE: bestDelta
  };
}

/**
 * Evaluates WCAG AA contrast for all core Brand Kit surface/text combinations.
 */
export function evaluateBrandContrast(colors) {
  const pairs = [
    {
      id: 'light-body',
      label: 'Primary text on default light surface',
      fg: colors.textOnLight,
      bg: colors.surfaceLight,
      minRatio: 4.5
    },
    {
      id: 'light-muted',
      label: 'Muted text on default light surface',
      fg: colors.textMutedOnLight,
      bg: colors.surfaceLight,
      minRatio: 4.5
    },
    {
      id: 'alt-body',
      label: 'Primary text on alternative light surface',
      fg: colors.textOnLight,
      bg: colors.surfaceAlt,
      minRatio: 4.5
    },
    {
      id: 'dark-body',
      label: 'Light text on dark surface',
      fg: colors.textOnDark,
      bg: colors.surfaceDark,
      minRatio: 4.5
    },
    {
      id: 'dark-muted',
      label: 'Muted text on dark surface',
      fg: colors.textMutedOnDark,
      bg: colors.surfaceDark,
      minRatio: 4.5
    },
    {
      id: 'accent-on-light',
      label: 'Action accent on light surface (large text / UI)',
      fg: colors.accent,
      bg: colors.surfaceLight,
      minRatio: 3.0
    },
    {
      id: 'primary-on-light',
      label: 'Primary brand color on light surface',
      fg: colors.primary,
      bg: colors.surfaceLight,
      minRatio: 4.5
    }
  ];

  const results = pairs.map((pair) => {
    const ratio = getContrastRatio(pair.fg, pair.bg);
    return {
      ...pair,
      ratio,
      passed: ratio >= pair.minRatio
    };
  });

  return {
    passed: results.every((r) => r.passed),
    checks: results
  };
}
