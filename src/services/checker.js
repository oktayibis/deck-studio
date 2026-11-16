import fs from 'node:fs';
import path from 'node:path';
import { getSharedBrowser } from '../utils/browser.js';
import {
  compositeOver,
  getContrastRatio,
  matchColorInPalette,
  normalizeHex,
  parseColorToRgba,
  rgbaToHex
} from '../utils/color.js';

export function buildAllowedPaletteList(brandKit) {
  const c = brandKit?.colors || {};
  const scheme = c.scheme || {};
  const raw = [
    c.primary,
    c.secondary,
    c.accent,
    c.surfaceLight,
    c.surfaceAlt,
    c.surfaceDark,
    c.textOnLight,
    c.textMutedOnLight,
    c.textOnDark,
    c.textMutedOnDark,
    c.borderOnLight,
    c.borderOnDark,
    c.status?.positive,
    c.status?.caution,
    c.status?.negative,
    scheme.dk1,
    scheme.lt1,
    scheme.dk2,
    scheme.lt2,
    scheme.accent1,
    scheme.accent2,
    scheme.accent3,
    scheme.accent4,
    scheme.accent5,
    scheme.accent6,
    scheme.hlink,
    scheme.folHlink,
    '#FFFFFF',
    '#000000',
    '#0F172A',
    '#1E293B',
    '#334155',
    '#475569',
    '#CBD5E1',
    '#F8FAFC'
  ];
  return Array.from(new Set(raw.map(normalizeHex).filter(Boolean)));
}

/**
 * Runs the Headless Chromium Brand & Quality Check (§7) across all slides in their fully revealed state.
 */
export async function runHeadlessDeckCheck({
  html,
  brandKit,
  deckDir = null,
  captureScreenshotsDir = null
}) {
  const browser = await getSharedBrowser();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();

  try {
    // Load HTML into page with mode-check class so all fragment steps are revealed
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => {
      document.body.classList.add('mode-check');
      if (window.__deckEngine) {
        window.__deckEngine.mode = 'check';
        window.__deckEngine.revealAllStepsEverywhere();
      }
    });

    const slideCount = await page.locator('.slide').count();
    const allowedPalette = buildAllowedPaletteList(brandKit);
    const minFontSizePx = brandKit?.rules?.minFontSizePx || 13;
    const toleranceDeltaE = brandKit?.rules?.colorToleranceDeltaE || 12;
    const allowedLogoSlideTypes = brandKit?.logo?.allowedSlideTypes || ['cover', 'end'];

    // Check Brand Kit font warnings
    const fontWarnings = [];
    if (brandKit?.fonts) {
      for (const [role, fontObj] of Object.entries(brandKit.fonts)) {
        if (fontObj?.missingFontFile && !fontObj?.fallback) {
          fontWarnings.push({
            code: 'MISSING_BRAND_FONT',
            severity: 'error',
            message: `Brand font "${fontObj.family}" for role "${role}" is not loaded and has no fallback.`
          });
        }
      }
    }

    const slideReports = [];
    let totalErrors = 0;
    let totalWarnings = 0;

    if (captureScreenshotsDir) {
      fs.mkdirSync(captureScreenshotsDir, { recursive: true });
    }

    for (let i = 0; i < slideCount; i++) {
      // Activate slide i and reveal all steps
      await page.evaluate((idx) => {
        if (window.__deckEngine) {
          window.__deckEngine.goToSlide(idx, { revealAllSteps: true, broadcast: false });
          window.__deckEngine.revealAllStepsEverywhere();
        } else {
          document.querySelectorAll('.slide').forEach((s, j) => {
            s.classList.toggle('active', j === idx);
          });
        }
      }, i);

      if (captureScreenshotsDir) {
        const shotPath = path.join(captureScreenshotsDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
        await page.screenshot({ path: shotPath, fullPage: false });
      }

      // Inspect active slide in browser DOM
      const rawSlideData = await page.evaluate(
        ({ slideIdx, minFontPx, allowedLogoTypes }) => {
          const slide = document.querySelectorAll('.slide')[slideIdx];
          if (!slide) return null;

          const stage = document.querySelector('.deck-stage') || slide;
          const stageRect = stage.getBoundingClientRect();
          const slideType = slide.getAttribute('data-slide-type') || 'content';
          const slideTitle = slide.querySelector('.ds-title')?.textContent?.trim() || `Slide ${slideIdx + 1}`;
          const findings = [];
          const colorSamples = [];
          const contrastSamples = [];

          // Safe zone boundaries on 1600x900 stage
          const topSafeLimit = stageRect.top + 8; // Top progress bar safe zone
          const bottomSafeLimit = stageRect.bottom - 52; // Footer band safe zone

          // 1. Check slide-inner overflow or clipping
          const slideInner = slide.querySelector('.slide-inner');
          if (slideInner) {
            if (slideInner.scrollHeight > slideInner.clientHeight + 4) {
              findings.push({
                code: 'SLIDE_CONTENT_OVERFLOW',
                severity: 'error',
                selector: '.slide-inner',
                message: `Slide content overflows vertical stage height (${slideInner.scrollHeight}px > ${slideInner.clientHeight}px).`
              });
            }
          }

          // 2. Check logo placement rule
          const logoEl = slide.querySelector('.ds-frame-logo');
          if (logoEl && !allowedLogoTypes.includes(slideType)) {
            findings.push({
              code: 'FORBIDDEN_LOGO_PLACEMENT',
              severity: 'error',
              selector: '.ds-frame-logo',
              message: `Logo appeared on slide type "${slideType}" (only allowed on ${allowedLogoTypes.join(', ')}).`
            });
          }

          // 3. Check explicit missing font attribute if present
          const unapprovedFontEl = slide.querySelector('[data-missing-font="true"]');
          if (unapprovedFontEl) {
            findings.push({
              code: 'BRAND_FONT_NOT_LOADED',
              severity: 'error',
              selector: unapprovedFontEl.tagName.toLowerCase(),
              message: `Element references an unloaded brand font without an approved fallback.`
            });
          }

          // Helper to walk up DOM and collect background colors for alpha compositing
          const getAncestorBackgroundChain = (el) => {
            const chain = [];
            let cur = el;
            while (cur && cur !== document.body) {
              const bg = window.getComputedStyle(cur).backgroundColor;
              if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
                chain.push(bg);
              }
              if (cur === slide) break;
              cur = cur.parentElement;
            }
            return chain;
          };

          const allElements = Array.from(slide.querySelectorAll('*'));
          for (const el of allElements) {
            // Skip hidden annotation layer or frame elements for safe-zone checks
            const isFrame =
              el.classList.contains('ds-frame-progress') ||
              el.classList.contains('ds-frame-progress-bar') ||
              el.classList.contains('ds-frame-footer') ||
              el.classList.contains('ds-frame-source') ||
              el.classList.contains('ds-frame-logo') ||
              el.classList.contains('slide-pattern') ||
              el.classList.contains('ds-annotation-layer') ||
              el.closest('.ds-frame-footer') ||
              el.closest('.ds-frame-progress') ||
              el.closest('.slide-pattern') ||
              el.closest('.ds-annotation-layer');

            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) {
              continue;
            }

            const rect = el.getBoundingClientRect();
            const tag = el.tagName.toLowerCase();
            const selectorDesc = `${tag}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''}`;

            // Check broken images & videos (§7)
            if (tag === 'img') {
              const src = el.getAttribute('src') || '';
              if (!src || !el.complete || el.naturalWidth === 0) {
                findings.push({
                  code: 'BROKEN_IMAGE',
                  severity: 'error',
                  selector: selectorDesc,
                  message: `Broken or unloaded image asset: "${src || '(empty src)'}".`
                });
              }
            }
            if (tag === 'video') {
              const src = el.getAttribute('src') || '';
              const brokenAttr = el.getAttribute('data-broken') === 'true';
              if (!src || brokenAttr) {
                findings.push({
                  code: 'MISSING_VIDEO',
                  severity: 'error',
                  selector: selectorDesc,
                  message: `Missing or unreadable video file: "${src || '(empty src)'}".`
                });
              }
            }

            if (isFrame) continue;

            // Check stage bounds overflow (§7)
            if (rect.width > 0 && rect.height > 0) {
              if (
                rect.right > stageRect.right + 4 ||
                rect.left < stageRect.left - 4 ||
                rect.bottom > stageRect.bottom + 4 ||
                rect.top < stageRect.top - 4
              ) {
                findings.push({
                  code: 'STAGE_OVERFLOW',
                  severity: 'error',
                  selector: selectorDesc,
                  message: `Element overflows the 1600×900 stage bounds (rect: ${Math.round(rect.left)},${Math.round(rect.top)} → ${Math.round(rect.right)},${Math.round(rect.bottom)}).`
                });
              }

              // Safe zone intrusion (§7): progress bar (top) and footer band (bottom)
              if (rect.top < topSafeLimit) {
                findings.push({
                  code: 'SAFE_ZONE_VIOLATION',
                  severity: 'error',
                  selector: selectorDesc,
                  message: `Element intrudes into the top progress indicator safe zone (top=${Math.round(rect.top)}px).`
                });
              }
              if (rect.bottom > bottomSafeLimit) {
                findings.push({
                  code: 'SAFE_ZONE_VIOLATION',
                  severity: 'error',
                  selector: selectorDesc,
                  message: `Element intrudes into the bottom footer safe zone (bottom=${Math.round(rect.bottom)}px > ${Math.round(bottomSafeLimit)}px).`
                });
              }
            }

            // Check self-clipping boxes (§7)
            const ovX = style.overflowX;
            const ovY = style.overflowY;
            if (
              ['hidden', 'clip', 'scroll', 'auto'].includes(ovY) &&
              el.clientHeight > 0 &&
              el.scrollHeight > el.clientHeight + 4 &&
              !el.classList.contains('slide-inner')
            ) {
              findings.push({
                code: 'CONTENT_CLIPPED',
                severity: 'error',
                selector: selectorDesc,
                message: `Container clips its vertical content (${el.scrollHeight}px > ${el.clientHeight}px).`
              });
            }
            if (
              ['hidden', 'clip', 'scroll', 'auto'].includes(ovX) &&
              el.clientWidth > 0 &&
              el.scrollWidth > el.clientWidth + 6 &&
              !el.classList.contains('ds-code-line')
            ) {
              findings.push({
                code: 'CONTENT_CLIPPED',
                severity: 'error',
                selector: selectorDesc,
                message: `Container clips its horizontal content (${el.scrollWidth}px > ${el.clientWidth}px).`
              });
            }

            // Check forbidden effects (§7): blurred shadows, multi-colour gradients, text shadows
            if (style.boxShadow && style.boxShadow !== 'none') {
              findings.push({
                code: 'FORBIDDEN_DROP_SHADOW',
                severity: 'error',
                selector: selectorDesc,
                message: `Forbidden box-shadow detected: "${style.boxShadow}".`
              });
            }
            if (style.textShadow && style.textShadow !== 'none') {
              findings.push({
                code: 'FORBIDDEN_TEXT_SHADOW',
                severity: 'error',
                selector: selectorDesc,
                message: `Forbidden text-shadow detected: "${style.textShadow}".`
              });
            }
            if (style.backgroundImage && /gradient\(/i.test(style.backgroundImage)) {
              findings.push({
                code: 'FORBIDDEN_GRADIENT',
                severity: 'error',
                selector: selectorDesc,
                message: `Forbidden CSS gradient detected: "${style.backgroundImage}".`
              });
            }

            // Check direct text nodes for font size, contrast, and palette
            const hasDirectText = Array.from(el.childNodes).some(
              (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0
            );

            if (hasDirectText) {
              const fontSizePx = parseFloat(style.fontSize);
              if (fontSizePx < minFontPx - 0.1) {
                findings.push({
                  code: 'TEXT_TOO_SMALL',
                  severity: 'error',
                  selector: selectorDesc,
                  message: `Text size ${fontSizePx}px is smaller than the minimum ${minFontPx}px on the 1600×900 stage.`
                });
              }

              const fontWeightNum = parseInt(style.fontWeight, 10) || 400;
              const isLargeText = fontSizePx >= 24 || (fontSizePx >= 18.5 && fontWeightNum >= 700);

              contrastSamples.push({
                selector: selectorDesc,
                textSample: el.textContent.trim().slice(0, 40),
                fgColor: style.color,
                bgChain: getAncestorBackgroundChain(el),
                isLargeText
              });

              colorSamples.push({
                selector: selectorDesc,
                prop: 'color',
                value: style.color
              });
            }

            if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') {
              colorSamples.push({
                selector: selectorDesc,
                prop: 'backgroundColor',
                value: style.backgroundColor
              });
            }

            if (parseFloat(style.borderTopWidth) > 0 && style.borderTopColor !== 'rgba(0, 0, 0, 0)') {
              colorSamples.push({
                selector: selectorDesc,
                prop: 'borderColor',
                value: style.borderTopColor
              });
            }
          }

          return {
            slideIndex: slideIdx,
            slideNumber: slideIdx + 1,
            slideType,
            slideTitle,
            findings,
            colorSamples,
            contrastSamples
          };
        },
        {
          slideIdx: i,
          minFontPx: minFontSizePx,
          allowedLogoTypes: allowedLogoSlideTypes
        }
      );

      if (!rawSlideData) continue;

      const slideFindings = [...rawSlideData.findings, ...fontWarnings];

      // Check video file existence on disk if deckDir is provided
      for (const f of rawSlideData.findings) {
        // already recorded
      }

      // 4. Evaluate Brand Kit Palette Compliance on collected color samples
      const seenPaletteErrors = new Set();
      for (const sample of rawSlideData.colorSamples) {
        const rgba = parseColorToRgba(sample.value);
        if (!rgba || rgba.a < 0.15) continue;
        const match = matchColorInPalette(rgba, allowedPalette, toleranceDeltaE);
        if (!match.matched) {
          const hex = rgbaToHex(rgba);
          const key = `${sample.prop}:${hex}`;
          if (!seenPaletteErrors.has(key)) {
            seenPaletteErrors.add(key);
            slideFindings.push({
              code: 'OFF_BRAND_COLOR',
              severity: 'error',
              selector: sample.selector,
              message: `Colour ${hex} (${sample.prop}) is outside the Brand Kit palette (nearest: ${match.nearestHex}, ΔE=${match.deltaE}).`
            });
          }
        }
      }

      // 5. Evaluate WCAG AA Contrast against real composited background
      const seenContrastErrors = new Set();
      for (const cs of rawSlideData.contrastSamples) {
        const fgRgba = parseColorToRgba(cs.fgColor);
        if (!fgRgba) continue;

        // Composite background chain from bottom (slide surface) to top (element)
        const chainReversed = [...cs.bgChain].reverse();
        let compositedBg = { r: 250, g: 248, b: 245, a: 1 };
        for (const bgStr of chainReversed) {
          const parsedBg = parseColorToRgba(bgStr);
          if (parsedBg) {
            compositedBg = compositeOver(parsedBg, compositedBg);
          }
        }
        const effectiveFg = compositeOver(fgRgba, compositedBg);
        const ratio = getContrastRatio(effectiveFg, compositedBg);
        const minRequired = cs.isLargeText ? 3.0 : 4.5;

        if (ratio < minRequired) {
          const fgHex = rgbaToHex(effectiveFg);
          const bgHex = rgbaToHex(compositedBg);
          const key = `${fgHex}_on_${bgHex}`;
          if (!seenContrastErrors.has(key)) {
            seenContrastErrors.add(key);
            slideFindings.push({
              code: 'LOW_WCAG_CONTRAST',
              severity: 'error',
              selector: cs.selector,
              message: `Contrast ratio ${ratio}:1 (${fgHex} on ${bgHex}) for "${cs.textSample}" is below WCAG AA minimum (${minRequired}:1).`
            });
          }
        }
      }

      // Deduplicate identical findings on the same slide
      const uniqueFindings = [];
      const seenKeys = new Set();
      for (const item of slideFindings) {
        const k = `${item.code}|${item.message}`;
        if (!seenKeys.has(k)) {
          seenKeys.add(k);
          uniqueFindings.push(item);
        }
      }

      const errCount = uniqueFindings.filter((f) => f.severity === 'error').length;
      const warnCount = uniqueFindings.filter((f) => f.severity === 'warning').length;
      totalErrors += errCount;
      totalWarnings += warnCount;

      const humanSummary =
        errCount === 0
          ? `Slide ${i + 1} (${rawSlideData.slideType} — "${rawSlideData.slideTitle}"): PASS (0 issues)`
          : `Slide ${i + 1} (${rawSlideData.slideType} — "${rawSlideData.slideTitle}"): FAIL (${errCount} error${errCount === 1 ? '' : 's'}) — ${uniqueFindings.map((f) => f.code).join(', ')}`;

      slideReports.push({
        slideNumber: i + 1,
        slideIndex: i,
        slideType: rawSlideData.slideType,
        title: rawSlideData.slideTitle,
        passed: errCount === 0,
        errorCount: errCount,
        warningCount: warnCount,
        humanSummary,
        findings: uniqueFindings
      });
    }

    const passed = totalErrors === 0;
    return {
      passed,
      checkedAt: new Date().toISOString(),
      brandKitId: brandKit?.id || 'unknown',
      brandKitVersion: brandKit?.version || 1,
      slideCount,
      errorCount: totalErrors,
      warningCount: totalWarnings,
      humanSummary: passed
        ? `ALL ${slideCount} SLIDES PASSED brand & quality verification (0 errors).`
        : `CHECK FAILED: ${totalErrors} error(s) found across ${slideReports.filter((s) => !s.passed).length} of ${slideCount} slides.`,
      slides: slideReports
    };
  } finally {
    await context.close();
  }
}
