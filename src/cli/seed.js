import fs from 'node:fs';
import path from 'node:path';
import { storage } from '../services/storage.js';
import { ensureSampleMediaAssets } from '../utils/sample-media.js';
import { runAgentCreateDeck } from '../services/agent.js';
import { compileBrandGalleryHtml } from '../services/gallery-builder.js';
import { exportDeckToPdf, exportDeckToZip } from '../services/exporter.js';
import { createApp } from '../server/index.js';
import { getSharedBrowser, closeSharedBrowser } from '../utils/browser.js';

const ARTIFACT_DIR =
  process.env.ARTIFACT_DIR ||
  '/Users/oktay/.gemini/antigravity/brain/90a6a2b1-286f-418a-89e5-f58f244592e1';

async function main() {
  const orgId = 'default-org';
  await storage.ensureSeedData(orgId);
  const sampleMedia = await ensureSampleMediaAssets();

  // Build initial 9-slide deck under DanishCVI brand kit
  const brief = {
    slug: 'march-12-incident-review',
    topic:
      '10-minute talk for management about the March 12 EU-Central-1 incident. At 14:02 UTC traffic surged 3.4x above baseline. At 14:06 UTC the primary database connection pool reached 94% saturation and P99 latency spiked to 412 ms (error rate 3.8%). At 14:11 UTC automated pool-guard promoted standby replica eu-central-1b and raised the connection ceiling from 250 to 500 with jittered backoff. By 14:16 UTC (14 minutes total mitigation window) latency returned to 38 ms nominal baseline with 0 lost transactions.',
    audience: 'management',
    lengthMinutes: 10,
    endsWithLiveDemo: true,
    language: 'en',
    sourceUrl: 'https://status.danishcvi.internal/incidents/2026-03-12'
  };

  console.log('1. Building initial DanishCVI presentation (brief + 2 screenshots + 1 video)…');
  const buildRes = await runAgentCreateDeck({
    orgId,
    brandKitId: 'brand-danish-cvi',
    brief,
    mediaFiles: sampleMedia
  });
  console.log(`   -> Built "${buildRes.deck.slug}" (${buildRes.deck.slides.length} slides) · Check: ${buildRes.checkReport.humanSummary}`);

  console.log('2. Exporting offline .zip and landscape .pdf…');
  const zipExport = await exportDeckToZip({ orgId, deckSlug: buildRes.deck.slug });
  const pdfExport = await exportDeckToPdf({ orgId, deckSlug: buildRes.deck.slug });
  console.log(`   -> Exported ${zipExport.filename} (${Math.round(zipExport.buffer.length / 1024)} KB) and ${pdfExport.filename} (${Math.round(pdfExport.buffer.length / 1024)} KB)`);

  // Capture Gallery & Web App screenshots if ARTIFACT_DIR exists
  if (fs.existsSync(ARTIFACT_DIR)) {
    console.log('3. Capturing milestone verification screenshots…');
    const brandKit = storage.getActiveBrandKit(orgId, 'brand-danish-cvi');
    const galleryHtml = compileBrandGalleryHtml(brandKit);

    const browser = await getSharedBrowser();
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await context.newPage();

    // Gallery screenshots
    await page.setContent(galleryHtml, { waitUntil: 'load' });
    await page.evaluate(() => {
      document.body.classList.add('mode-check');
      window.__deckEngine?.revealAllStepsEverywhere();
    });

    const gallerySlideShots = [
      { idx: 0, file: 'gallery-slide-01-cover.png' },
      { idx: 1, file: 'gallery-slide-02-kpis-bars.png' },
      { idx: 2, file: 'gallery-slide-03-flow-timeline.png' },
      { idx: 3, file: 'gallery-slide-04-dark-code-chat.png' }
    ];

    for (const s of gallerySlideShots) {
      await page.evaluate((i) => window.__deckEngine?.goToSlide(i, { revealAllSteps: true }), s.idx);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, s.file) });
    }

    // Copy generated deck slide screenshots into ARTIFACT_DIR
    const deckShotsDir = path.join(storage.getDeckDir(orgId, buildRes.deck.slug), 'screenshots');
    for (const num of ['01', '02', '04', '07']) {
      const src = path.join(deckShotsDir, `slide-${num}.png`);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(ARTIFACT_DIR, `deck-slide-${num}.png`));
      }
    }

    // Capture Studio, Brand Setup, and SaaS Quota Lab UI screenshots
    const app = createApp();
    const srv = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const port = srv.address().port;

    const uiPage = await browser.newPage({ viewport: { width: 1600, height: 960 } });
    await uiPage.goto(`http://127.0.0.1:${port}`, { waitUntil: 'networkidle' });
    await uiPage.waitForTimeout(500);
    await uiPage.screenshot({ path: path.join(ARTIFACT_DIR, 'ui-01-studio.png') });

    // Toggle Dark Mode and capture Dark Studio screenshot
    await uiPage.click('#theme-toggle-btn');
    await uiPage.waitForTimeout(300);
    await uiPage.screenshot({ path: path.join(ARTIFACT_DIR, 'ui-04-studio-dark.png') });

    // Switch back to Light Mode for Brand & Workspace screenshots
    await uiPage.click('#theme-toggle-btn');
    await uiPage.waitForTimeout(200);

    await uiPage.click('[data-view="brand"]');
    await uiPage.waitForTimeout(500);
    await uiPage.screenshot({ path: path.join(ARTIFACT_DIR, 'ui-02-brand-setup-danishcvi.png') });

    await uiPage.click('[data-view="saas"]');
    await uiPage.waitForTimeout(400);
    await uiPage.screenshot({ path: path.join(ARTIFACT_DIR, 'ui-03-saas-quotas-cost-lab.png') });

    srv.close();
    await context.close();
  }

  await closeSharedBrowser();
  console.log('Seed & verification complete.');
}

main();
