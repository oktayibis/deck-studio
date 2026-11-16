import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { evaluateBrandContrast, getContrastRatio, normalizeHex } from '../utils/color.js';

const EMU_PER_INCH = 914400;
const STAGE_WIDTH_PX = 1600;
const STAGE_HEIGHT_PX = 900;

export const APPROVED_ICONS = [
  'shield',
  'alert',
  'check',
  'clock',
  'cpu',
  'database',
  'terminal',
  'bolt',
  'chart',
  'users',
  'arrow-right',
  'lock',
  'globe',
  'layers',
  'play',
  'search',
  'sparkle',
  'wrench',
  'server',
  'activity'
];

export const WEB_AVAILABLE_FONTS = new Set([
  'Plus Jakarta Sans',
  'Instrument Serif',
  'JetBrains Mono',
  'Space Grotesk',
  'IBM Plex Sans',
  'IBM Plex Mono',
  'Fraunces',
  'Syne',
  'DM Sans',
  'Georgia',
  'Helvetica Neue',
  'Arial',
  'Courier New',
  'Menlo',
  'system-ui'
]);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true
});

function emuToInches(emu, fallbackIn) {
  const num = Number(emu);
  if (!Number.isFinite(num) || num <= 0) return fallbackIn;
  return Number((num / EMU_PER_INCH).toFixed(3));
}

function inchesToStagePx(inches, totalInches, stageTotalPx) {
  return Math.round((inches / totalInches) * stageTotalPx);
}

function extractColorFromXmlNode(node, fallbackHex) {
  if (!node || typeof node !== 'object') return fallbackHex;
  if (node.srgbClr && node.srgbClr['@_val']) {
    return normalizeHex(node.srgbClr['@_val']) || fallbackHex;
  }
  if (node.sysClr) {
    const val = node.sysClr['@_lastClr'] || node.sysClr['@_val'];
    if (val && /^[0-9A-Fa-f]{6}$/.test(val)) {
      return `#${val.toUpperCase()}`;
    }
  }
  return fallbackHex;
}

/**
 * Extracts a complete Brand Kit specification from an Office Open XML (.pptx, .potx, .thmx) buffer
 * or merges overrides (logo, fonts, hex colours).
 */
export async function extractBrandKitFromOfficeBuffer(buffer, options = {}) {
  const {
    filename = 'uploaded-template.pptx',
    orgId = 'default-org',
    uploadedFonts = [],
    overrides = {}
  } = options;

  const zip = await JSZip.loadAsync(buffer);
  const fileNames = Object.keys(zip.files);

  // 1. Locate theme XML (ppt/theme/theme1.xml or theme/theme/theme1.xml)
  const themePath =
    fileNames.find((f) => /ppt\/theme\/theme\d*\.xml$/i.test(f)) ||
    fileNames.find((f) => /theme\/theme\/theme\d*\.xml$/i.test(f)) ||
    fileNames.find((f) => /theme\d*\.xml$/i.test(f));

  if (!themePath) {
    const err = new Error(`No Office theme XML (theme1.xml) found inside "${filename}".`);
    err.statusCode = 400;
    err.code = 'INVALID_OFFICE_PACKAGE';
    throw err;
  }

  const themeXmlText = await zip.file(themePath).async('string');
  const themeDoc = xmlParser.parse(themeXmlText);
  const themeRoot = themeDoc.theme || themeDoc.override || {};
  const themeElements = themeRoot.themeElements || {};
  const themeName = themeRoot['@_name'] || filename.replace(/\.(pptx|potx|thmx)$/i, '');

  // 2. Parse <a:clrScheme>
  const clrScheme = themeElements.clrScheme || {};
  const scheme = {
    dk1: extractColorFromXmlNode(clrScheme.dk1, '#0F172A'),
    lt1: extractColorFromXmlNode(clrScheme.lt1, '#FAF8F5'),
    dk2: extractColorFromXmlNode(clrScheme.dk2, '#1E293B'),
    lt2: extractColorFromXmlNode(clrScheme.lt2, '#F1ECE1'),
    accent1: extractColorFromXmlNode(clrScheme.accent1, '#D94E28'),
    accent2: extractColorFromXmlNode(clrScheme.accent2, '#2563EB'),
    accent3: extractColorFromXmlNode(clrScheme.accent3, '#0D9488'),
    accent4: extractColorFromXmlNode(clrScheme.accent4, '#D97706'),
    accent5: extractColorFromXmlNode(clrScheme.accent5, '#7C3AED'),
    accent6: extractColorFromXmlNode(clrScheme.accent6, '#DC2626'),
    hlink: extractColorFromXmlNode(clrScheme.hlink, '#2563EB'),
    folHlink: extractColorFromXmlNode(clrScheme.folHlink, '#4F46E5')
  };

  // 3. Parse <a:fontScheme>
  const fontScheme = themeElements.fontScheme || {};
  const majorTypeface =
    fontScheme.majorFont?.latin?.['@_typeface'] ||
    fontScheme.majorFont?.ea?.['@_typeface'] ||
    'Instrument Serif';
  const minorTypeface =
    fontScheme.minorFont?.latin?.['@_typeface'] ||
    fontScheme.minorFont?.ea?.['@_typeface'] ||
    'Plus Jakarta Sans';
  const monoTypeface =
    fontScheme.minorFont?.cs?.['@_typeface'] ||
    'JetBrains Mono';

  // 4. Parse presentation slide size (<p:sldSz>) if present
  let slideWidthIn = 13.333;
  let slideHeightIn = 7.5;
  const presPath = fileNames.find((f) => /ppt\/presentation\.xml$/i.test(f));
  if (presPath) {
    const presXml = await zip.file(presPath).async('string');
    const presDoc = xmlParser.parse(presXml);
    const sldSz = presDoc.presentation?.sldSz;
    if (sldSz) {
      slideWidthIn = emuToInches(sldSz['@_cx'], 13.333);
      slideHeightIn = emuToInches(sldSz['@_cy'], 7.5);
    }
  }

  // 5. Parse Slide Master & Slide Layouts for placeholder geometry (in inches), background patterns, frame & logo
  const placeholdersIn = {
    title: { xIn: 0.85, yIn: 0.65, wIn: 11.63, hIn: 1.05 },
    subtitle: { xIn: 0.85, yIn: 1.75, wIn: 10.5, hIn: 0.65 },
    content: { xIn: 0.85, yIn: 1.85, wIn: 11.63, hIn: 4.85 },
    sourceNote: { xIn: 0.85, yIn: 6.78, wIn: 8.5, hIn: 0.28 },
    footer: { xIn: 0.85, yIn: 7.1, wIn: 11.63, hIn: 0.3 },
    pageNumber: { xIn: 11.4, yIn: 7.1, wIn: 1.08, hIn: 0.3 },
    logo: { xIn: 11.3, yIn: 0.45, wIn: 1.2, hIn: 0.45 }
  };

  let detectedLogoPlacement = 'top-right';
  let extractedFooterText = themeName.split(/[-–—]/)[0].trim() || 'Enterprise';
  let extractedClassification = 'Internal';
  let extractedPatternType = 'swiss-grid';

  const masterAndLayoutFiles = fileNames.filter(
    (f) => /slideMasters\/slideMaster\d*\.xml$/i.test(f) || /slideLayouts\/slideLayout\d*\.xml$/i.test(f)
  );

  for (const xmlFile of masterAndLayoutFiles) {
    const xmlStr = await zip.file(xmlFile).async('string');
    const doc = xmlParser.parse(xmlStr);
    const root = doc.sldMaster || doc.sldLayout || {};
    const cSld = root.cSld || {};

    if (cSld['@_name'] && /hex|diagonal|dots|waves|grid|architectural/i.test(cSld['@_name'])) {
      extractedPatternType = cSld['@_name'].toLowerCase();
    }

    const spTree = cSld.spTree || {};
    const shapes = [].concat(spTree.sp || [], spTree.pic || []);

    for (const sp of shapes) {
      if (!sp) continue;
      const nvPr = sp.nvSpPr?.nvPr || sp.nvPicPr?.nvPr || {};
      const cNvPr = sp.nvSpPr?.cNvPr || sp.nvPicPr?.cNvPr || {};
      const ph = nvPr.ph || {};
      const phType = (ph['@_type'] || cNvPr['@_name'] || '').toLowerCase();
      const xfrm = sp.spPr?.xfrm;

      if (xfrm?.off && xfrm?.ext) {
        const box = {
          xIn: emuToInches(xfrm.off['@_x'], 0.85),
          yIn: emuToInches(xfrm.off['@_y'], 0.65),
          wIn: emuToInches(xfrm.ext['@_cx'], 10.0),
          hIn: emuToInches(xfrm.ext['@_cy'], 1.0)
        };

        if (phType.includes('title') && !phType.includes('sub')) {
          placeholdersIn.title = box;
        } else if (phType.includes('subtitle') || phType === 'subTitle') {
          placeholdersIn.subtitle = box;
        } else if (phType === 'body' || phType.includes('content') || phType === 'obj') {
          placeholdersIn.content = box;
        } else if (phType.includes('source')) {
          placeholdersIn.sourceNote = box;
        } else if (phType === 'ftr' || phType.includes('footer')) {
          placeholdersIn.footer = box;
          const textVal = extractPlainTextFromTxBody(sp.txBody);
          if (textVal) {
            if (/confidential|public|internal/i.test(textVal)) {
              const m = textVal.match(/confidential|public|internal/i);
              extractedClassification = m[0].charAt(0).toUpperCase() + m[0].slice(1).toLowerCase();
            }
            const parts = textVal.split(/[·|•-]/).map((s) => s.trim()).filter(Boolean);
            if (parts.length > 0) {
              extractedFooterText = parts[parts.length - 1];
            }
          }
        } else if (phType === 'sldnum' || phType.includes('number')) {
          placeholdersIn.pageNumber = box;
        } else if (phType.includes('logo')) {
          placeholdersIn.logo = box;
          const isRight = box.xIn > slideWidthIn / 2;
          const isBottom = box.yIn > slideHeightIn / 2;
          detectedLogoPlacement = `${isBottom ? 'bottom' : 'top'}-${isRight ? 'right' : 'left'}`;
        }
      }
    }
  }

  // 6. Map placeholder geometry from inches to 1600x900 stage pixels
  const placeholdersPx = {};
  for (const [key, box] of Object.entries(placeholdersIn)) {
    placeholdersPx[key] = {
      x: inchesToStagePx(box.xIn, slideWidthIn, STAGE_WIDTH_PX),
      y: inchesToStagePx(box.yIn, slideHeightIn, STAGE_HEIGHT_PX),
      w: inchesToStagePx(box.wIn, slideWidthIn, STAGE_WIDTH_PX),
      h: inchesToStagePx(box.hIn, slideHeightIn, STAGE_HEIGHT_PX)
    };
  }

  const marginsPx = {
    top: Math.max(56, placeholdersPx.title.y),
    left: Math.max(64, placeholdersPx.title.x),
    right: Math.max(64, STAGE_WIDTH_PX - (placeholdersPx.title.x + placeholdersPx.title.w)),
    bottom: Math.max(68, STAGE_HEIGHT_PX - placeholdersPx.sourceNote.y)
  };

  // 7. Extract embedded logo if present in ppt/media/*
  const mediaFiles = fileNames.filter((f) => /media\/.*\.(svg|png|jpg|jpeg)$/i.test(f));
  const extractedLogos = [];
  for (const mf of mediaFiles) {
    if (mf.toLowerCase().includes('logo') || mediaFiles.length === 1) {
      const ext = mf.split('.').pop().toLowerCase();
      if (ext === 'svg') {
        const svgContent = await zip.file(mf).async('string');
        const b64 = Buffer.from(svgContent, 'utf8').toString('base64');
        extractedLogos.push({
          id: 'logo-extracted',
          name: mf.split('/').pop(),
          forSurface: 'both',
          dataUrl: `data:image/svg+xml;base64,${b64}`
        });
      } else {
        const bin = await zip.file(mf).async('base64');
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        extractedLogos.push({
          id: 'logo-extracted',
          name: mf.split('/').pop(),
          forSurface: 'both',
          dataUrl: `data:${mime};base64,${bin}`
        });
      }
    }
  }

  // 8. Check font availability & build font rules (never silently substitute!)
  const uploadedFontFamilies = new Set(uploadedFonts.map((f) => f.family));
  const checkFontRole = (roleName, requestedFamily, defaultFallback, weights) => {
    const isAvailable = WEB_AVAILABLE_FONTS.has(requestedFamily) || uploadedFontFamilies.has(requestedFamily);
    return {
      role: roleName,
      family: requestedFamily,
      weights,
      isUploaded: uploadedFontFamilies.has(requestedFamily),
      missingFontFile: !isAvailable,
      warning: !isAvailable
        ? `Font "${requestedFamily}" was referenced in the Office theme but no font file (.woff2/.ttf) was uploaded. Select an approved fallback or upload the licensed font file.`
        : null,
      fallback: defaultFallback
    };
  };

  const fonts = {
    title: checkFontRole('title', overrides.titleFont || majorTypeface, 'Instrument Serif', [600, 700]),
    heading: checkFontRole('heading', overrides.headingFont || majorTypeface, 'Plus Jakarta Sans', [600, 700]),
    body: checkFontRole('body', overrides.bodyFont || minorTypeface, 'Plus Jakarta Sans', [400, 500, 600]),
    mono: checkFontRole('mono', overrides.monoFont || monoTypeface, 'JetBrains Mono', [400, 500])
  };

  // 9. Map color roles & ensure WCAG AA contrast
  const surfaceLight = normalizeHex(overrides.surfaceLight || scheme.lt1) || '#FAF8F5';
  const surfaceAlt = normalizeHex(overrides.surfaceAlt || scheme.lt2) || '#F1ECE1';
  const surfaceDark = normalizeHex(overrides.surfaceDark || scheme.dk1) || '#0F172A';
  const primary = normalizeHex(overrides.primary || scheme.dk2) || '#1E293B';
  const secondary = normalizeHex(overrides.secondary || scheme.accent2) || '#1D4ED8';
  const accent = normalizeHex(overrides.accent || scheme.accent1) || '#B83214';

  // Ensure text colors achieve WCAG AA on their surfaces
  const textOnLight = getContrastRatio(scheme.dk1, surfaceLight) >= 4.5 ? scheme.dk1 : '#0F172A';
  const textMutedOnLight = getContrastRatio(scheme.dk2, surfaceLight) >= 4.5 ? scheme.dk2 : '#475569';
  const textOnDark = getContrastRatio(scheme.lt1, surfaceDark) >= 4.5 ? scheme.lt1 : '#F8FAFC';
  const textMutedOnDark = getContrastRatio(scheme.lt2, surfaceDark) >= 4.5 ? scheme.lt2 : '#CBD5E1';

  const colors = {
    primary,
    secondary,
    accent,
    surfaceLight,
    surfaceAlt,
    surfaceDark,
    textOnLight,
    textMutedOnLight,
    textOnDark,
    textMutedOnDark,
    borderOnLight: '#CBD5E1',
    borderOnDark: '#334155',
    status: {
      positive: normalizeHex(overrides.statusPositive || scheme.accent3) || '#0F766E',
      caution: normalizeHex(overrides.statusCaution || scheme.accent4) || '#B45309',
      negative: normalizeHex(overrides.statusNegative || scheme.accent6) || '#B91C1C',
      rules: 'Use status colours strictly for semantic state indicators (KPI deltas, checklist status, timeline incidents, before/after badges). Never use status colours for decorative backgrounds.'
    },
    scheme
  };

  const contrastReport = evaluateBrandContrast(colors);

  // Build default SVG brand logos if none were embedded
  const companyName = overrides.companyName || extractedFooterText || 'Vanguard Systems';
  const defaultLogos = extractedLogos.length > 0 ? extractedLogos : buildDefaultLogoVariants(companyName, colors);

  return {
    name: overrides.name || themeName,
    orgId,
    sourceFile: filename,
    colors,
    fonts,
    fontLicensingNotice:
      'Uploaded corporate fonts are isolated per organisation. Exported decks containing embedded font files must remain internal to the organisation.',
    typeScale: {
      hero: 64,
      h1: 44,
      h2: 30,
      h3: 22,
      lede: 22,
      body: 18,
      small: 15,
      caption: 14,
      kpi: 56,
      minSizePx: 13
    },
    geometry: {
      slideWidthIn,
      slideHeightIn,
      stageWidthPx: STAGE_WIDTH_PX,
      stageHeightPx: STAGE_HEIGHT_PX,
      marginsPx,
      safeZonesPx: {
        topProgressHeight: 8,
        footerBandTop: STAGE_HEIGHT_PX - 54,
        footerBandHeight: 54,
        sourceNoteTop: STAGE_HEIGHT_PX - 86
      },
      placeholdersIn,
      placeholdersPx,
      grid: {
        columns: 12,
        gapPx: 24
      }
    },
    backgrounds: {
      coverPattern: extractedPatternType,
      sectionDarkPattern: 'architectural-lines',
      sectionLightPattern: 'subtle-grid',
      contentSurface: colors.surfaceLight,
      altLightSurface: colors.surfaceAlt
    },
    logo: {
      variants: defaultLogos,
      placement: overrides.logoPlacement || detectedLogoPlacement,
      allowedSlideTypes: ['cover', 'end'],
      forbiddenSlideTypes: ['content', 'content-alt', 'content-dark', 'statement', 'section-dark', 'section-light']
    },
    frame: {
      showProgress: true,
      classification: overrides.classification || extractedClassification,
      companyName,
      showPageNumber: true,
      sourceNotePosition: 'bottom-left'
    },
    icons: APPROVED_ICONS,
    rules: {
      noGradients: true,
      noDropShadows: true,
      noTextShadows: true,
      noClipArt: true,
      minFontSizePx: 13,
      wcagLevel: 'AA',
      colorToleranceDeltaE: 10
    },
    contrastReport
  };
}

/**
 * Synthesizes a complete Brand Kit from any combination of:
 * - Office template (.pptx / .potx / .thmx) buffer
 * - Brand name (e.g., "DanishCVI"), hex colours, logo file, font names, or guidelines prose/URL
 */
export async function synthesizeBrandKitFromInputs({
  name = 'DanishCVI',
  companyName = '',
  officeBuffer = null,
  filename = 'brand-guidelines',
  orgId = 'default-org',
  uploadedFonts = [],
  guidelinesText = '',
  overrides = {}
}) {
  if (officeBuffer) {
    return extractBrandKitFromOfficeBuffer(officeBuffer, {
      filename,
      orgId,
      uploadedFonts,
      overrides: {
        name,
        companyName: companyName || name,
        ...overrides
      }
    });
  }

  // Parse hex colors mentioned in guidelinesText if any
  const extractedHexes = [...(guidelinesText || '').matchAll(/#[0-9A-Fa-f]{6}\b/g)].map((m) => m[0].toUpperCase());
  const detectedPlacement = /top-left/i.test(guidelinesText)
    ? 'top-left'
    : /bottom-right/i.test(guidelinesText)
    ? 'bottom-right'
    : /bottom-left/i.test(guidelinesText)
    ? 'bottom-left'
    : overrides.logoPlacement || 'top-right';

  const synthBuffer = await generateRealOfficeTemplateZip({
    themeName: name,
    companyName: companyName || name,
    classification: overrides.classification || (/public/i.test(guidelinesText) ? 'Public' : 'Internal'),
    logoPlacement: detectedPlacement,
    majorFont: overrides.titleFont || 'Instrument Serif',
    minorFont: overrides.bodyFont || 'Plus Jakarta Sans',
    monoFont: overrides.monoFont || 'JetBrains Mono',
    scheme: {
      dk1: (overrides.surfaceDark || extractedHexes[0] || '#0F172A').replace('#', ''),
      lt1: (overrides.surfaceLight || '#FAF8F5').replace('#', ''),
      dk2: (overrides.primary || extractedHexes[1] || '#1E293B').replace('#', ''),
      lt2: (overrides.surfaceAlt || '#EFECE6').replace('#', ''),
      accent1: (overrides.accent || extractedHexes[2] || '#B83214').replace('#', ''),
      accent2: (overrides.secondary || '#1D4ED8').replace('#', ''),
      accent3: (overrides.statusPositive || '#0F766E').replace('#', ''),
      accent4: (overrides.statusCaution || '#B45309').replace('#', ''),
      accent5: '6D28D9',
      accent6: (overrides.statusNegative || '#B91C1C').replace('#', ''),
      hlink: '1D4ED8',
      folHlink: '4338CA'
    }
  });

  const kit = await extractBrandKitFromOfficeBuffer(synthBuffer, {
    filename,
    orgId,
    uploadedFonts,
    overrides: {
      name,
      companyName: companyName || name,
      ...overrides
    }
  });

  if (overrides.logoDataUrl) {
    kit.logo.variants = [
      {
        id: 'logo-uploaded',
        name: `${name} Uploaded Logo`,
        forSurface: 'both',
        dataUrl: overrides.logoDataUrl
      },
      ...kit.logo.variants
    ];
  }

  return kit;
}

function extractPlainTextFromTxBody(txBody) {
  if (!txBody) return '';
  const paragraphs = [].concat(txBody.p || []);
  const chunks = [];
  for (const p of paragraphs) {
    const runs = [].concat(p?.r || []);
    for (const r of runs) {
      if (r?.t) chunks.push(String(r.t));
    }
  }
  return chunks.join(' ').trim();
}

export function buildDefaultLogoVariants(companyName, colors) {
  const initials = companyName
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'VS';

  const makeSvg = (fg, accent) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 48" width="220" height="48">
      <rect x="2" y="6" width="36" height="36" rx="4" fill="${accent}"/>
      <path d="M11 24 L20 14 L29 24 L20 34 Z" fill="#FFFFFF"/>
      <text x="50" y="31" font-family="Plus Jakarta Sans, sans-serif" font-weight="700" font-size="20" letter-spacing="0.5" fill="${fg}">${companyName.slice(0, 16)}</text>
    </svg>`;
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
  };

  return [
    {
      id: 'logo-on-dark',
      name: `${initials} Dark-Surface Logo`,
      forSurface: 'dark',
      dataUrl: makeSvg(colors.textOnDark, colors.accent)
    },
    {
      id: 'logo-on-light',
      name: `${initials} Light-Surface Logo`,
      forSurface: 'light',
      dataUrl: makeSvg(colors.textOnLight, colors.accent)
    }
  ];
}

/**
 * Generates a real, spec-compliant Office Open XML (.pptx / .potx / .thmx) ZIP buffer
 * containing presentation.xml, theme1.xml, slideMaster1.xml, slideLayout1.xml, and embedded SVG logo.
 */
export async function generateRealOfficeTemplateZip(preset = {}) {
  const {
    themeName = 'Nordic Grid Systems — Corporate Theme',
    companyName = 'Nordic Grid Systems',
    classification = 'Internal',
    patternName = 'swiss-grid',
    logoPlacement = 'top-right',
    majorFont = 'Instrument Serif',
    minorFont = 'Plus Jakarta Sans',
    monoFont = 'JetBrains Mono',
    scheme = {
      dk1: '0F172A',
      lt1: 'FAF8F5',
      dk2: '1E293B',
      lt2: 'EFECE6',
      accent1: 'B83214',
      accent2: '1D4ED8',
      accent3: '0F766E',
      accent4: 'B45309',
      accent5: '6D28D9',
      accent6: 'B91C1C',
      hlink: '1D4ED8',
      folHlink: '4338CA'
    },
    geometryIn = {
      widthIn: 13.333,
      heightIn: 7.5,
      title: { xIn: 0.85, yIn: 0.65, wIn: 11.63, hIn: 1.05 },
      subtitle: { xIn: 0.85, yIn: 1.75, wIn: 10.5, hIn: 0.65 },
      content: { xIn: 0.85, yIn: 1.85, wIn: 11.63, hIn: 4.8 },
      sourceNote: { xIn: 0.85, yIn: 6.76, wIn: 8.5, hIn: 0.28 },
      footer: { xIn: 0.85, yIn: 7.1, wIn: 10.2, hIn: 0.3 },
      pageNumber: { xIn: 11.35, yIn: 7.1, wIn: 1.13, hIn: 0.3 },
      logo: logoPlacement === 'top-left'
        ? { xIn: 0.85, yIn: 0.42, wIn: 1.5, hIn: 0.45 }
        : { xIn: 10.95, yIn: 0.42, wIn: 1.5, hIn: 0.45 }
    }
  } = preset;

  const toEmu = (inches) => Math.round(inches * EMU_PER_INCH);
  const stripHash = (hex) => String(hex).replace(/^#/, '').toUpperCase();

  const zip = new JSZip();

  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="svg" ContentType="image/svg+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
</Types>`
  );

  zip.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldSz cx="${toEmu(geometryIn.widthIn)}" cy="${toEmu(geometryIn.heightIn)}" type="screen16x9"/>
  <p:notesSz cx="${toEmu(7.5)}" cy="${toEmu(10.0)}"/>
</p:presentation>`
  );

  zip.file(
    'ppt/theme/theme1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${themeName}">
  <a:themeElements>
    <a:clrScheme name="${themeName} Colors">
      <a:dk1><a:srgbClr val="${stripHash(scheme.dk1)}"/></a:dk1>
      <a:lt1><a:srgbClr val="${stripHash(scheme.lt1)}"/></a:lt1>
      <a:dk2><a:srgbClr val="${stripHash(scheme.dk2)}"/></a:dk2>
      <a:lt2><a:srgbClr val="${stripHash(scheme.lt2)}"/></a:lt2>
      <a:accent1><a:srgbClr val="${stripHash(scheme.accent1)}"/></a:accent1>
      <a:accent2><a:srgbClr val="${stripHash(scheme.accent2)}"/></a:accent2>
      <a:accent3><a:srgbClr val="${stripHash(scheme.accent3)}"/></a:accent3>
      <a:accent4><a:srgbClr val="${stripHash(scheme.accent4)}"/></a:accent4>
      <a:accent5><a:srgbClr val="${stripHash(scheme.accent5)}"/></a:accent5>
      <a:accent6><a:srgbClr val="${stripHash(scheme.accent6)}"/></a:accent6>
      <a:hlink><a:srgbClr val="${stripHash(scheme.hlink)}"/></a:hlink>
      <a:folHlink><a:srgbClr val="${stripHash(scheme.folHlink)}"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="${themeName} Fonts">
      <a:majorFont>
        <a:latin typeface="${majorFont}"/>
        <a:ea typeface="${majorFont}"/>
        <a:cs typeface="${monoFont}"/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="${minorFont}"/>
        <a:ea typeface="${minorFont}"/>
        <a:cs typeface="${monoFont}"/>
      </a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Standard"/>
  </a:themeElements>
</a:theme>`
  );

  const shapeXml = (id, name, phType, box, textContent = '') => `
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="${id}" name="${name}"/>
          <p:cNvSpPr/>
          <p:nvPr><p:ph type="${phType}"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm>
            <a:off x="${toEmu(box.xIn)}" y="${toEmu(box.yIn)}"/>
            <a:ext cx="${toEmu(box.wIn)}" cy="${toEmu(box.hIn)}"/>
          </a:xfrm>
        </p:spPr>
        ${textContent ? `<p:txBody><a:bodyPr/><a:p><a:r><a:t>${textContent}</a:t></a:r></a:p></p:txBody>` : ''}
      </p:sp>`;

  zip.file(
    'ppt/slideMasters/slideMaster1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld name="${patternName}">
    <p:spTree>
      ${shapeXml(2, 'Title Placeholder', 'title', geometryIn.title)}
      ${shapeXml(3, 'Subtitle Placeholder', 'subTitle', geometryIn.subtitle)}
      ${shapeXml(4, 'Content Placeholder', 'body', geometryIn.content)}
      ${shapeXml(5, 'Source Note Placeholder', 'source', geometryIn.sourceNote)}
      ${shapeXml(6, 'Footer Placeholder', 'ftr', geometryIn.footer, `${classification} · ${companyName}`)}
      ${shapeXml(7, 'Slide Number Placeholder', 'sldNum', geometryIn.pageNumber)}
      ${shapeXml(8, 'Brand Logo Placeholder', 'logo', geometryIn.logo)}
    </p:spTree>
  </p:cSld>
</p:sldMaster>`
  );

  zip.file(
    'ppt/slideLayouts/slideLayout1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             type="titleAndContent">
  <p:cSld name="${patternName}">
    <p:spTree>
      ${shapeXml(10, 'Layout Title', 'title', geometryIn.title)}
      ${shapeXml(11, 'Layout Body', 'body', geometryIn.content)}
    </p:spTree>
  </p:cSld>
</p:sldLayout>`
  );

  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 230 48" width="230" height="48">
    <rect x="2" y="6" width="36" height="36" rx="4" fill="#${stripHash(scheme.accent1)}"/>
    <path d="M12 24 L20 14 L28 24 L20 34 Z" fill="#FFFFFF"/>
    <text x="48" y="31" font-family="Plus Jakarta Sans, sans-serif" font-weight="700" font-size="19" fill="#${stripHash(scheme.dk1)}">${companyName}</text>
  </svg>`;
  zip.file('ppt/media/brand-logo.svg', logoSvg);

  return zip.generateAsync({ type: 'nodebuffer' });
}
