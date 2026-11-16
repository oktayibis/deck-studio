import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { storage } from './storage.js';
import { compileDeckToHtml } from './deck-compiler.js';
import { getSharedBrowser } from '../utils/browser.js';
import { assertValidDeckSlug } from '../utils/security.js';

const ENGINE_CSS_PATH = path.join(process.cwd(), 'src/engine/deck-engine.css');
const ENGINE_JS_PATH = path.join(process.cwd(), 'src/engine/deck-engine.js');

/**
 * Exports a deck as a self-contained offline .zip bundle (§3.5 & §10).
 * Double-clicking index.html inside the unzipped folder works 100% offline via file://.
 */
export async function exportDeckToZip({ orgId = 'default-org', deckSlug }) {
  assertValidDeckSlug(deckSlug);
  const deck = storage.getDeck(orgId, deckSlug);
  if (!deck) {
    const err = new Error(`Deck "${deckSlug}" not found.`);
    err.statusCode = 404;
    throw err;
  }

  const brandKit = storage.getActiveBrandKit(orgId, deck.brandKitId, deck.brandKitVersion);
  const deckDir = storage.getDeckDir(orgId, deckSlug);
  const assetsDir = path.join(deckDir, 'assets');

  // Rewrite asset paths to relative ./assets/<filename> for offline file:// portability
  const resolveAssetPath = (rawSrc) => {
    if (!rawSrc) return '';
    if (rawSrc.startsWith('data:')) return rawSrc;
    const match = rawSrc.match(/\/assets\/([^/?#]+)$/);
    if (match) {
      return `./assets/${match[1]}`;
    }
    return rawSrc;
  };

  // Inline both CSS/JS and also include engine/ files in the zip so both double-click and inspection work
  const html = compileDeckToHtml(deck, brandKit, {
    inlineRuntime: true,
    resolveAssetPath
  });

  const zip = new JSZip();
  zip.file('index.html', html);
  zip.file('engine/deck-engine.css', fs.readFileSync(ENGINE_CSS_PATH, 'utf8'));
  zip.file('engine/deck-engine.js', fs.readFileSync(ENGINE_JS_PATH, 'utf8'));

  if (fs.existsSync(assetsDir)) {
    const files = fs.readdirSync(assetsDir);
    for (const f of files) {
      const full = path.join(assetsDir, f);
      if (fs.statSync(full).isFile()) {
        zip.file(`assets/${f}`, fs.readFileSync(full));
      }
    }
  }

  const readmeText = [
    `${deck.title} (${deck.slug})`,
    `Brand Kit: ${brandKit?.name || deck.brandKitId} (v${brandKit?.version || 1})`,
    `Classification: ${deck.classification || 'Internal'}`,
    '',
    'HOW TO PRESENT OFFLINE:',
    '1. Double-click index.html to open in any modern browser (works offline via file://).',
    '2. Press F for Full Screen, S for Second-Screen Presenter View, O for Overview, N for Speaker Notes, ? for Shortcuts.',
    '3. Rest pointer at bottom edge (~0.6s) to open the Control Dock for live Pen, Highlighter, Snap-Underline, Laser & 2x Zoom.',
    '',
    'FONT LICENSING & PRIVACY NOTICE:',
    brandKit?.fontLicensingNotice ||
      'Decks exported with embedded organisation fonts must remain internal to the organisation.'
  ].join('\n');

  zip.file('README.txt', readmeText);

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });

  const orgDir = storage.getOrgDir(orgId);
  const outPath = path.join(orgDir, 'exports', `${deckSlug}.zip`);
  fs.writeFileSync(outPath, zipBuffer);

  storage.appendAudit(orgId, {
    action: 'deck.exported_zip',
    target: `${deckSlug}.zip`,
    detail: `Exported self-contained offline ZIP (${Math.round(zipBuffer.length / 1024)} KB)`
  });

  return {
    filename: `${deckSlug}.zip`,
    filePath: outPath,
    buffer: zipBuffer
  };
}

/**
 * Exports a deck to a 1-slide-per-page (1600×900) landscape PDF with all fragment steps revealed
 * and video poster frames displayed (§3.5 & §5).
 */
export async function exportDeckToPdf({ orgId = 'default-org', deckSlug }) {
  assertValidDeckSlug(deckSlug);
  const deck = storage.getDeck(orgId, deckSlug);
  if (!deck) {
    const err = new Error(`Deck "${deckSlug}" not found.`);
    err.statusCode = 404;
    throw err;
  }

  const brandKit = storage.getActiveBrandKit(orgId, deck.brandKitId, deck.brandKitVersion);
  const html = compileDeckToHtml(deck, brandKit, { inlineRuntime: true });

  const browser = await getSharedBrowser();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 900 }
  });
  const page = await context.newPage();

  try {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => {
      document.body.classList.add('mode-print');
      if (window.__deckEngine) {
        window.__deckEngine.mode = 'print';
        window.__deckEngine.revealAllStepsEverywhere();
      }
      // Make all slides visible in sequence for print pagination
      document.querySelectorAll('.slide').forEach((s) => {
        s.classList.add('active');
        s.style.position = 'relative';
        s.style.display = 'flex';
        s.style.pageBreakAfter = 'always';
        s.style.breakAfter = 'page';
      });
    });

    const pdfBuffer = await page.pdf({
      width: '1600px',
      height: '900px',
      printBackground: true,
      margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
    });

    const orgDir = storage.getOrgDir(orgId);
    const outPath = path.join(orgDir, 'exports', `${deckSlug}.pdf`);
    fs.writeFileSync(outPath, pdfBuffer);

    storage.appendAudit(orgId, {
      action: 'deck.exported_pdf',
      target: `${deckSlug}.pdf`,
      detail: `Exported 1600×900 multi-page PDF (${Math.round(pdfBuffer.length / 1024)} KB)`
    });

    return {
      filename: `${deckSlug}.pdf`,
      filePath: outPath,
      buffer: pdfBuffer
    };
  } finally {
    await context.close();
  }
}
