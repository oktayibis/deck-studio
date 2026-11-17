import { getRelativeLuminance, normalizeHex, parseColorToRgba } from '../utils/color.js';

const GENERIC_FONT_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  '-apple-system',
  'blinkmacsystemfont',
  'inherit',
  'initial',
  'unset',
  'revert'
]);

const DEFAULT_SUGGESTED_COLORS = {
  primary: '#0F172A',
  accent: '#2563EB',
  surfaceDark: '#0F172A',
  surfaceLight: '#FFFFFF'
};

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html) {
  return decodeHtmlEntities(String(html || '').replace(/<[^>]+>/g, ' '));
}

function deriveNameFromUrl(sourceUrl) {
  if (!sourceUrl) return '';
  try {
    const parsed = new URL(sourceUrl);
    const host = parsed.hostname.replace(/^www\./i, '');
    const base = host.split('.')[0];
    if (!base) return '';
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return '';
  }
}

function extractCompanyName(inputText, sourceUrl) {
  const titleMatch = inputText.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const cleaned = stripTags(titleMatch[1]);
    if (cleaned) return cleaned;
  }

  const headingMatch = inputText.match(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/i);
  if (headingMatch) {
    const cleaned = stripTags(headingMatch[1]);
    if (cleaned) return cleaned;
  }

  const mdHeadingMatch = inputText.match(/^\s{0,3}#{1,2}\s+(.+)$/m);
  if (mdHeadingMatch) {
    const cleaned = decodeHtmlEntities(mdHeadingMatch[1]);
    if (cleaned) return cleaned;
  }

  return deriveNameFromUrl(sourceUrl) || 'Extracted Brand';
}

function extractUniqueHexes(inputText) {
  const matches = inputText.match(/#[0-9A-Fa-f]{6}\b/g) || [];
  const seen = new Set();
  const hexes = [];
  for (const raw of matches) {
    const norm = normalizeHex(raw);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      hexes.push(norm);
    }
  }
  return hexes;
}

function extractCssCustomProperties(inputText) {
  const regex = /(--[a-z0-9-]+)\s*:\s*([^;\n}]+)/gi;
  const props = [];
  const seen = new Set();
  let match;
  while ((match = regex.exec(inputText)) !== null) {
    const name = match[1].trim();
    const value = match[2].trim();
    if (!seen.has(name)) {
      seen.add(name);
      props.push({ name, value });
    }
  }
  return props;
}

function extractFonts(inputText) {
  const seen = new Set();
  const fonts = [];

  const addFont = (rawName) => {
    if (!rawName) return;
    const cleaned = decodeURIComponent(rawName.replace(/\+/g, ' '))
      .replace(/^['"]|['"]$/g, '')
      .split(/[:@]/)[0]
      .trim();
    if (!cleaned) return;
    if (/^var\(/i.test(cleaned)) return;
    if (GENERIC_FONT_FAMILIES.has(cleaned.toLowerCase())) return;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      fonts.push(cleaned);
    }
  };

  // Google Fonts links: family=Font+One|Font+Two or family=Font+One:wght@400;700
  const gfRegex = /family=([^&:"'>\s]+)/gi;
  let match;
  while ((match = gfRegex.exec(inputText)) !== null) {
    const parts = match[1].split('|');
    for (const part of parts) {
      addFont(part);
    }
  }

  // CSS font-family declarations
  const cssFontRegex = /font-family\s*:\s*([^;{}]+)/gi;
  while ((match = cssFontRegex.exec(inputText)) !== null) {
    const candidates = match[1].split(',');
    for (const candidate of candidates) {
      addFont(candidate);
    }
  }

  return fonts;
}

function getChromaScore(hex) {
  const rgba = parseColorToRgba(hex);
  if (!rgba) return 0;
  const max = Math.max(rgba.r, rgba.g, rgba.b);
  const min = Math.min(rgba.r, rgba.g, rgba.b);
  return max - min;
}

function mapSuggestedColors(extractedHexes) {
  if (!extractedHexes.length) {
    return { ...DEFAULT_SUGGESTED_COLORS };
  }

  const withMetrics = extractedHexes.map((hex) => ({
    hex,
    luminance: getRelativeLuminance(hex),
    chroma: getChromaScore(hex)
  }));

  const byLuminanceAsc = [...withMetrics].sort((a, b) => a.luminance - b.luminance);
  const darkest = byLuminanceAsc[0].hex;
  const lightest = byLuminanceAsc[byLuminanceAsc.length - 1].hex;

  const byChromaDesc = [...withMetrics].sort((a, b) => b.chroma - a.chroma);
  const mostVibrant = byChromaDesc[0].hex;

  return {
    primary: darkest,
    accent: mostVibrant,
    surfaceDark: darkest,
    surfaceLight: lightest
  };
}

/**
 * Extracts brand identity signals (colors, CSS custom properties, fonts, and company name)
 * from raw HTML, CSS, or brand guidelines text.
 */
export function extractBrandSignalsFromHtmlOrText(inputText = '', sourceUrl = '') {
  const text = typeof inputText === 'string' ? inputText : String(inputText || '');
  const companyName = extractCompanyName(text, sourceUrl);
  const extractedHexes = extractUniqueHexes(text);
  const suggestedColors = mapSuggestedColors(extractedHexes);
  const cssVariables = extractCssCustomProperties(text);
  const detectedFonts = extractFonts(text);

  const summaryParts = [
    `Brand: ${companyName}`,
    sourceUrl ? `Source: ${sourceUrl}` : null,
    extractedHexes.length
      ? `Colors (${extractedHexes.length}): ${extractedHexes.join(', ')}`
      : 'Colors: none detected (using defaults)',
    `Suggested Palette -> Primary: ${suggestedColors.primary}, Accent: ${suggestedColors.accent}, Dark: ${suggestedColors.surfaceDark}, Light: ${suggestedColors.surfaceLight}`,
    detectedFonts.length ? `Fonts: ${detectedFonts.join(', ')}` : 'Fonts: none detected',
    cssVariables.length
      ? `CSS Variables (${cssVariables.length}): ${cssVariables
          .slice(0, 8)
          .map((v) => `${v.name}: ${v.value}`)
          .join('; ')}`
      : null
  ].filter(Boolean);

  return {
    companyName,
    extractedHexes,
    suggestedColors,
    detectedFonts,
    summary: summaryParts.join(' | ')
  };
}

/**
 * Crawls an HTTP/HTTPS URL (with a 4s timeout and clean fallback to provided text)
 * and extracts brand identity signals.
 */
export async function crawlBrandUrlOrText({ url = '', text = '' } = {}) {
  const trimmedUrl = typeof url === 'string' ? url.trim() : '';
  const fallbackText = typeof text === 'string' ? text : String(text || '');
  let fetchedText = '';

  if (trimmedUrl) {
    try {
      const parsed = new URL(trimmedUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        const response = await fetch(parsed.toString(), {
          signal: AbortSignal.timeout(4000)
        });
        if (response.ok) {
          fetchedText = await response.text();
        }
      }
    } catch {
      // Fall back cleanly to provided text when offline or unreachable
    }
  }

  const effectiveText = fetchedText && fetchedText.trim() ? fetchedText : fallbackText;
  return extractBrandSignalsFromHtmlOrText(effectiveText, trimmedUrl);
}
