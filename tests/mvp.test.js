import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import JSZip from 'jszip';

import {
  assertValidDeckSlug,
  redactPII,
  safeResolvePath,
  validateUploadFile
} from '../src/utils/security.js';
import { storage } from '../src/services/storage.js';
import { extractBrandKitFromOfficeBuffer } from '../src/services/brand-extractor.js';
import { compileBrandGalleryHtml } from '../src/services/gallery-builder.js';
import { buildDeliberatelyBrokenDeckHtml } from '../src/services/broken-fixture.js';
import { runHeadlessDeckCheck } from '../src/services/checker.js';
import { runAgentCreateDeck, runAgentEditDeck } from '../src/services/agent.js';
import { handleMcpJsonRpc } from '../src/mcp/server.js';
import { ensureSampleMediaAssets } from '../src/utils/sample-media.js';
import { getSharedBrowser, closeSharedBrowser } from '../src/utils/browser.js';
import { extractBrandSignalsFromHtmlOrText } from '../src/services/guidelines-crawler.js';
import { DatabaseAdapter } from '../src/services/db-adapter.js';
import { createApp } from '../src/server/index.js';

const TEST_ORG = 'test-suite-org';

test.before(async () => {
  const testOrgDir = path.join(process.cwd(), 'data/orgs', TEST_ORG);
  fs.rmSync(testOrgDir, { recursive: true, force: true });
  await storage.ensureSeedData(TEST_ORG);
});

test.after(async () => {
  await closeSharedBrowser();
});

test('1. Security: kebab-case deck slugs, path traversal rejection, upload validation & PII redaction (§10)', () => {
  assert.equal(assertValidDeckSlug('march-12-incident'), 'march-12-incident');
  assert.throws(() => assertValidDeckSlug('../etc/passwd'), /Invalid deck name/);
  assert.throws(() => assertValidDeckSlug('Bad_Slug_Upper'), /Invalid deck name/);

  const base = '/Users/oktay/Projects/deck-studio/data';
  const resolved = safeResolvePath(base, 'orgs', 'default-org', 'decks');
  assert.ok(resolved.startsWith(base));
  assert.throws(() => safeResolvePath(base, '../../etc/passwd'), /Path traversal/);
  assert.throws(() => safeResolvePath(base, 'orgs/%2e%2e/%2e%2e/secret'), /Path traversal/);

  // Upload size & type limits
  const validImg = validateUploadFile({
    originalname: 'Cluster Telemetry.PNG',
    mimetype: 'image/png',
    size: 2 * 1024 * 1024,
    category: 'auto'
  });
  assert.equal(validImg.category, 'image');
  assert.match(validImg.safeFilename, /^cluster-telemetry-[0-9a-f]{6}\.png$/);

  assert.throws(
    () =>
      validateUploadFile({
        originalname: 'huge.png',
        mimetype: 'image/png',
        size: 30 * 1024 * 1024, // > 25 MB limit
        category: 'image'
      }),
    /exceeds maximum size of 25 MB/
  );

  assert.throws(
    () =>
      validateUploadFile({
        originalname: 'payload.exe',
        mimetype: 'application/x-msdownload',
        size: 1024,
        category: 'auto'
      }),
    /Unsupported file extension/
  );

  const pii = redactPII(
    'Contact alice.ops@danishcvi.dk with token sk-1234567890abcdefghijklmnop or account 123-45-6789.'
  );
  assert.ok(!pii.text.includes('alice.ops@danishcvi.dk'));
  assert.ok(!pii.text.includes('sk-1234567890'));
  assert.ok(!pii.text.includes('123-45-6789'));
  assert.equal(pii.redactions.length, 3);
});

test('2. Brand Extraction: real Office (.pptx / .potx) extraction, inch geometry, WCAG AA & missing font warning (§3.1)', async () => {
  const pptxPath = path.join(process.cwd(), 'fixtures/templates/danish-cvi-corporate.pptx');
  const buf = fs.readFileSync(pptxPath);
  const kit = await extractBrandKitFromOfficeBuffer(buf, {
    filename: 'danish-cvi-corporate.pptx',
    orgId: TEST_ORG
  });

  assert.equal(kit.colors.scheme.dk1, '#0F172A');
  assert.equal(kit.colors.accent, '#B83214');
  assert.equal(kit.geometry.slideWidthIn, 13.333);
  assert.equal(kit.geometry.slideHeightIn, 7.5);
  assert.ok(kit.geometry.placeholdersIn.title.wIn > 10);
  assert.ok(kit.logo.variants.length >= 1);
  assert.deepEqual(kit.logo.allowedSlideTypes, ['cover', 'end']);
  assert.equal(kit.contrastReport.passed, true);

  // Verify missing font warning on Helios Cloud .potx template (never silently substitute!)
  const potxPath = path.join(process.cwd(), 'fixtures/templates/helios-cloud-proprietary-font.potx');
  const potxKit = await extractBrandKitFromOfficeBuffer(fs.readFileSync(potxPath), {
    filename: 'helios-cloud-proprietary-font.potx',
    orgId: TEST_ORG
  });
  assert.equal(potxKit.fonts.title.family, 'Helios Display Corporate');
  assert.equal(potxKit.fonts.title.missingFontFile, true);
  assert.ok(potxKit.fonts.title.warning.includes('no font file'));
  assert.ok(potxKit.fonts.title.fallback);
});

test('3. SaaS Subscription & Quotas: 2 / 4 / 16 Brand limits and 4 / 20 / 100 Daily Deck limits', () => {
  // Switch to Starter plan (2 brands max, 4 daily decks max)
  const starterQuota = storage.updateSubscriptionAndQuotas(TEST_ORG, { tier: 'starter' });
  assert.equal(starterQuota.maxBrands, 2);
  assert.equal(starterQuota.dailyDeckLimit, 4);
  assert.equal(starterQuota.usedBrands, 2); // DanishCVI + Nordic Grid seeded
  assert.equal(starterQuota.canCreateBrand, false);

  // Attempting to create a 3rd brand on Starter (2/2 used) must fail with BRAND_QUOTA_EXCEEDED
  assert.throws(
    () =>
      storage.saveBrandKitVersion(TEST_ORG, 'brand-third-blocked', {
        name: 'Third Brand',
        colors: storage.getActiveBrandKit(TEST_ORG).colors
      }),
    (err) => err.code === 'BRAND_QUOTA_EXCEEDED' && err.statusCode === 403
  );

  // Upgrade to Pro plan (4 brands max, 20 daily decks max) -> adding 3rd brand succeeds!
  const proQuota = storage.updateSubscriptionAndQuotas(TEST_ORG, { tier: 'pro' });
  assert.equal(proQuota.maxBrands, 4);
  assert.equal(proQuota.dailyDeckLimit, 20);
  assert.equal(proQuota.canCreateBrand, true);

  const thirdBrand = storage.saveBrandKitVersion(TEST_ORG, 'brand-danish-event', {
    ...storage.getActiveBrandKit(TEST_ORG),
    name: 'DanishCVI Event Series'
  });
  assert.equal(thirdBrand.id, 'brand-danish-event');
  assert.equal(storage.getQuotaStatus(TEST_ORG).usedBrands, 3);
});

test('4. Headless Chromium Checker: Brand Gallery passes (0 errors) & Deliberately Broken Fixture fails non-zero (§7)', async () => {
  const brandKit = storage.getActiveBrandKit(TEST_ORG, 'brand-danish-cvi');

  // Positive check: 9-slide Brand Component Gallery
  const galleryHtml = compileBrandGalleryHtml(brandKit);
  const posReport = await runHeadlessDeckCheck({ html: galleryHtml, brandKit });
  assert.equal(posReport.passed, true, `Expected Gallery to pass, got: ${posReport.humanSummary}`);
  assert.equal(posReport.slideCount, 9);
  assert.equal(posReport.errorCount, 0);

  // Negative check: Deliberately Broken Deck Fixture
  const brokenHtml = buildDeliberatelyBrokenDeckHtml(brandKit);
  const negReport = await runHeadlessDeckCheck({ html: brokenHtml, brandKit });
  assert.equal(negReport.passed, false);
  assert.ok(negReport.errorCount >= 10);

  const allCodes = new Set(negReport.slides.flatMap((s) => s.findings.map((f) => f.code)));
  assert.ok(allCodes.has('CONTENT_CLIPPED'));
  assert.ok(allCodes.has('TEXT_TOO_SMALL'));
  assert.ok(allCodes.has('STAGE_OVERFLOW'));
  assert.ok(allCodes.has('OFF_BRAND_COLOR'));
  assert.ok(allCodes.has('LOW_WCAG_CONTRAST'));
  assert.ok(allCodes.has('FORBIDDEN_DROP_SHADOW'));
  assert.ok(allCodes.has('FORBIDDEN_GRADIENT'));
  assert.ok(allCodes.has('FORBIDDEN_TEXT_SHADOW'));
  assert.ok(allCodes.has('BROKEN_IMAGE'));
  assert.ok(allCodes.has('MISSING_VIDEO'));
  assert.ok(allCodes.has('SAFE_ZONE_VIOLATION'));
  assert.ok(allCodes.has('FORBIDDEN_LOGO_PLACEMENT'));
  assert.ok(allCodes.has('BRAND_FONT_NOT_LOADED'));
});

test('5. Agent Create + Check-and-Fix Loop + "Edit Selected" Refinement (§4, §7, §12)', async () => {
  const sampleMedia = await ensureSampleMediaAssets();
  const brief = {
    slug: 'march-incident-danishcvi',
    topic:
      '10-minute talk for management about the March 12 EU-Central-1 incident. At 14:02 UTC traffic surged 3.4x above baseline. At 14:06 UTC the database connection pool reached 94% saturation and P99 latency spiked to 412 ms. At 14:11 UTC automated pool-guard promoted standby replica eu-central-1b. By 14:16 UTC (14 minutes total mitigation window) latency returned to 38 ms with 0 lost transactions.',
    audience: 'management',
    lengthMinutes: 10,
    endsWithLiveDemo: true,
    language: 'en'
  };

  // Run with injectTestDefect: true to prove the Agent Check-and-Fix loop catches and repairs slide errors!
  const buildRes = await runAgentCreateDeck({
    orgId: TEST_ORG,
    brandKitId: 'brand-danish-cvi',
    brief,
    mediaFiles: sampleMedia,
    injectTestDefect: true
  });

  assert.equal(buildRes.checkReport.passed, true);
  assert.equal(buildRes.checkReport.errorCount, 0);
  assert.ok(buildRes.deck.slides.length >= 7 && buildRes.deck.slides.length <= 10);
  assert.equal(buildRes.deck.classification, 'Internal');

  // Verify the job executed the fixing phase and called write_slide to repair the injected defect
  const toolsCalled = buildRes.job.steps.map((s) => s.tool);
  assert.ok(toolsCalled.includes('read_brand_kit'));
  assert.ok(toolsCalled.includes('list_components'));
  assert.ok(toolsCalled.includes('add_media'));
  assert.ok(toolsCalled.includes('write_deck'));
  assert.ok(toolsCalled.includes('run_check'));
  assert.ok(toolsCalled.includes('write_slide'), 'Expected write_slide to be called in check-and-fix loop');

  // Verify every slide has speaker notes and media are placed
  for (const s of buildRes.deck.slides) {
    assert.ok(s.speakerNotes && s.speakerNotes.length > 10);
  }

  // Test "Edit selected" refinement ("make slide 4 simpler")
  const slide1Before = JSON.stringify(buildRes.deck.slides[0]);
  const editRes = await runAgentEditDeck({
    orgId: TEST_ORG,
    deckSlug: 'march-incident-danishcvi',
    prompt: 'make slide 4 simpler'
  });

  assert.equal(editRes.checkReport.passed, true);
  assert.equal(editRes.deck.version, 2);
  assert.equal(editRes.deck.history.length, 1);
  // Slide 1 was not touched, Slide 4 was simplified
  assert.equal(JSON.stringify(editRes.deck.slides[0]), slide1Before);
  assert.ok(editRes.deck.slides[3].eyebrow.includes('SIMPLIFIED'));
});

test('6. Presenting Tools & Dock Scenario: open dock -> pick laser -> dock closes and stays closed while pointer rests at bottom (§6, §11, §12)', async () => {
  const deckDir = storage.getDeckDir(TEST_ORG, 'march-incident-danishcvi');
  const html = fs.readFileSync(path.join(deckDir, 'index.html'), 'utf8');

  const browser = await getSharedBrowser();
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await context.newPage();

  try {
    await page.setContent(html, { waitUntil: 'load' });

    // 1. Ordinary mouse movement in middle of screen must NOT open the dock
    await page.mouse.move(800, 450);
    await page.waitForTimeout(200);
    let isOpen = await page.locator('.ds-control-dock').evaluate((el) => el.classList.contains('dock-open'));
    assert.equal(isOpen, false, 'Dock should remain closed on ordinary mouse movement');

    // 2. Rest pointer at bottom edge (y = 890) for ~0.65s -> dock opens
    await page.mouse.move(800, 890);
    await page.waitForTimeout(700);
    isOpen = await page.locator('.ds-control-dock').evaluate((el) => el.classList.contains('dock-open'));
    assert.equal(isOpen, true, 'Dock should open after resting pointer at bottom edge for ~0.6s');

    // 3. Pick Laser tool -> dock must close immediately AND stay closed while pointer rests at bottom
    const laserBtn = page.locator('[data-tool="laser"]');
    const box = await laserBtn.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    isOpen = await page.locator('.ds-control-dock').evaluate((el) => el.classList.contains('dock-open'));
    assert.equal(isOpen, false, 'Dock must close immediately when laser tool is picked');

    // Keep pointer resting in the bottom zone (y = 892) for 800ms -> dock must STAY closed!
    await page.mouse.move(820, 892);
    await page.waitForTimeout(800);
    isOpen = await page.locator('.ds-control-dock').evaluate((el) => el.classList.contains('dock-open'));
    assert.equal(isOpen, false, 'Dock must stay closed while pointer remains in bottom zone after tool pick');

    // 4. Verify keyboard shortcuts: ArrowRight advances, O opens Overview, Esc closes active tool & overlays
    await page.keyboard.press('o');
    const overviewOpen = await page.locator('.ds-overlay').first().evaluate((el) => el.classList.contains('open'));
    assert.equal(overviewOpen, true, 'Pressing O should open Overview grid');

    await page.keyboard.press('Escape');
    const overviewAfterEsc = await page.locator('.ds-overlay').first().evaluate((el) => el.classList.contains('open'));
    assert.equal(overviewAfterEsc, false, 'Pressing Esc should close Overview grid');
  } finally {
    await context.close();
  }
});

test('7. MCP Server & Offline ZIP / PDF Exports (§3.5, §9, §12)', async () => {
  // List tools via MCP
  const listRes = await handleMcpJsonRpc({ id: 1, method: 'tools/list' });
  const toolNames = listRes.result.tools.map((t) => t.name);
  assert.ok(toolNames.includes('create_deck'));
  assert.ok(toolNames.includes('edit_deck'));
  assert.ok(toolNames.includes('check_deck'));
  assert.ok(toolNames.includes('export_deck'));
  assert.ok(toolNames.includes('list_decks'));
  assert.ok(toolNames.includes('get_brand_kit'));

  // Export ZIP via MCP
  const zipRpc = await handleMcpJsonRpc({
    id: 2,
    method: 'tools/call',
    params: {
      name: 'export_deck',
      arguments: { orgId: TEST_ORG, deckSlug: 'march-incident-danishcvi', format: 'zip' }
    }
  });
  assert.equal(zipRpc.result.isError, false);
  const zipInfo = zipRpc.result.structuredContent;
  assert.ok(fs.existsSync(zipInfo.filePath));

  const zipArchive = await JSZip.loadAsync(fs.readFileSync(zipInfo.filePath));
  assert.ok(zipArchive.file('index.html'));
  assert.ok(zipArchive.file('engine/deck-engine.css'));
  assert.ok(zipArchive.file('engine/deck-engine.js'));
  assert.ok(zipArchive.file('README.txt'));

  // Export PDF via MCP
  const pdfRpc = await handleMcpJsonRpc({
    id: 3,
    method: 'tools/call',
    params: {
      name: 'export_deck',
      arguments: { orgId: TEST_ORG, deckSlug: 'march-incident-danishcvi', format: 'pdf' }
    }
  });
  assert.equal(pdfRpc.result.isError, false);
  const pdfInfo = pdfRpc.result.structuredContent;
  const pdfBuf = fs.readFileSync(pdfInfo.filePath);
  assert.equal(pdfBuf.subarray(0, 5).toString('ascii'), '%PDF-');
});

test('8. ADLC Features: Brand Guidelines Crawler (#5), SQLite DatabaseAdapter (#3), Per-Slide PUT & CSV Cost Export (#1, #4)', async () => {
  // 1. Brand Guidelines Crawler (#5)
  const sampleHtml = `
    <html>
      <head>
        <title>Nordic Compute — Brand Guidelines</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">
        <style>
          :root { --brand-primary: #0F172A; --brand-accent: #E11D48; --brand-light: #F8FAFC; }
          body { font-family: "Inter", sans-serif; background: #F8FAFC; color: #0F172A; }
        </style>
      </head>
      <body><h1>Nordic Compute</h1></body>
    </html>
  `;
  const signals = extractBrandSignalsFromHtmlOrText(sampleHtml, 'https://nordiccompute.example');
  assert.ok(signals.companyName.includes('Nordic Compute'));
  assert.ok(signals.extractedHexes.includes('#0F172A'));
  assert.ok(signals.extractedHexes.includes('#E11D48'));
  assert.ok(signals.extractedHexes.includes('#F8FAFC'));
  assert.ok(signals.suggestedColors.primary);
  assert.ok(signals.suggestedColors.accent);
  assert.ok(signals.detectedFonts.some((f) => f.toLowerCase().includes('inter')));

  // 2. DatabaseAdapter (#3) with in-memory SQLite
  const db = new DatabaseAdapter({ sqlitePath: ':memory:' });
  await db.initSchema();
  await db.upsertOrganisation({
    id: TEST_ORG,
    name: 'Test Suite Org',
    tier: 'pro',
    maxBrands: 4,
    dailyDeckLimit: 20,
    settings: { region: 'eu-central-1' }
  });
  const orgRow = await db.getOrganisation(TEST_ORG);
  assert.equal(orgRow.id, TEST_ORG);
  assert.equal(orgRow.tier, 'pro');

  const orgState = storage.loadOrgState(TEST_ORG);
  const syncSummary = await db.syncFromOrgState(TEST_ORG, orgState);
  assert.equal(syncSummary.synced, true);
  assert.ok(syncSummary.counts.brandKitVersions >= 1);
  assert.ok(syncSummary.counts.decks >= 1);
  const listedBrands = await db.listBrandKits(TEST_ORG);
  assert.ok(listedBrands.length >= 1);
  const syncedDeck = await db.getDeck(TEST_ORG, 'march-incident-danishcvi');
  assert.ok(syncedDeck && syncedDeck.slug === 'march-incident-danishcvi');
  db.close();

  // 3. HTTP Endpoints via createApp(): PUT /api/decks/:slug/slides/0 (#1) & GET /api/subscription/cost-export.csv (#4)
  const app = createApp();
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    // PUT /api/decks/:slug/slides/0
    const updatedTitle = 'EU-Central-1 Mitigation Summary';
    const putRes = await fetch(
      `${baseUrl}/api/decks/march-incident-danishcvi/slides/0`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId: TEST_ORG,
          title: updatedTitle,
          speakerNotes: 'Updated speaker notes from slide inspector test.'
        })
      }
    );
    assert.equal(putRes.status, 200);
    const putJson = await putRes.json();
    assert.equal(putJson.deck.slides[0].title, updatedTitle);
    assert.equal(putJson.deck.storyline.headlines[0], updatedTitle);
    assert.equal(putJson.checkReport.passed, true);

    // GET /api/subscription/cost-export.csv
    const csvRes = await fetch(
      `${baseUrl}/api/subscription/cost-export.csv?orgId=${encodeURIComponent(TEST_ORG)}`
    );
    assert.equal(csvRes.status, 200);
    assert.ok(csvRes.headers.get('content-type').includes('text/csv'));
    const csvText = await csvRes.text();
    assert.ok(
      csvText.startsWith(
        'timestamp,deckSlug,operation,promptTokens,completionTokens,llmCostUsd,workerCostUsd,totalCostUsd,renderDurationMs'
      )
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('9. Phase 2: StorageService SQLite auto-sync (data/deck_studio.sqlite) & TypeScript controller (src/public/app.ts)', async () => {
  // Verify StorageService initialized storage.db pointing to data/deck_studio.sqlite
  const expectedSqlitePath = path.join(process.cwd(), 'data', 'deck_studio.sqlite');
  assert.ok(storage.db, 'Expected storage.db DatabaseAdapter instance on StorageService');
  assert.equal(storage.db.dbPath, expectedSqlitePath);
  assert.ok(fs.existsSync(expectedSqlitePath), 'Expected data/deck_studio.sqlite to exist on disk');

  // Verify saveOrgState() automatically syncs TEST_ORG into relational SQLite tables
  const state = storage.loadOrgState(TEST_ORG);
  storage.saveOrgState(TEST_ORG, state);

  const syncedOrg = await storage.db.getOrganisation(TEST_ORG);
  assert.ok(syncedOrg, 'Expected TEST_ORG to be synced into SQLite organisations table');
  assert.equal(syncedOrg.id, TEST_ORG);

  const syncedBrands = await storage.db.listBrandKits(TEST_ORG);
  assert.ok(syncedBrands.length >= 1, 'Expected synced brand kits in SQLite');

  const syncedDeck = await storage.db.getDeck(TEST_ORG, 'march-incident-danishcvi');
  assert.ok(syncedDeck && syncedDeck.slug === 'march-incident-danishcvi', 'Expected synced deck in SQLite');

  // Verify src/public/app.ts exists and compiles cleanly under npx tsc --noEmit
  const appTsPath = path.join(process.cwd(), 'src', 'public', 'app.ts');
  assert.ok(fs.existsSync(appTsPath), 'Expected src/public/app.ts to exist');
  const tscOut = execFileSync('npx', ['tsc', '--noEmit'], { encoding: 'utf8' });
  assert.equal(tscOut.trim(), '', 'Expected npx tsc --noEmit to produce 0 errors');
});

test('10. Phase 3: Zero-Brand CVI Reset (POST /api/brands/clear) & Live LLM Connection Tester (POST /api/org/llm-test)', async () => {
  const app = createApp();
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });

  try {
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    // 1. Test POST /api/brands/clear
    const clearRes = await fetch(`${baseUrl}/api/brands/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: TEST_ORG })
    });
    assert.equal(clearRes.status, 200);
    const clearJson = await clearRes.json();
    assert.ok(Array.isArray(clearJson.brandKits));
    assert.equal(clearJson.brandKits.length, 0);
    assert.equal(clearJson.activeBrandKit, null);
    assert.equal(clearJson.quota.usedBrands, 0);

    // Restore seed data for TEST_ORG
    await storage.ensureSeedData(TEST_ORG);

    // 2. Test POST /api/org/llm-test
    const llmRes = await fetch(`${baseUrl}/api/org/llm-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: TEST_ORG })
    });
    assert.equal(llmRes.status, 200);
    const llmJson = await llmRes.json();
    assert.equal(llmJson.ok, true);
    assert.ok(typeof llmJson.provider === 'string' && llmJson.provider.length > 0);
    assert.ok(typeof llmJson.model === 'string' && llmJson.model.length > 0);
    assert.ok(typeof llmJson.message === 'string' && llmJson.message.includes('AI Provider ready'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('11. Phase 4: React + TypeScript Vite Frontend & Containerised Deployment Manifests', async () => {
  // 1. Verify React + TypeScript frontend source & production build output
  const appTsxPath = path.join(process.cwd(), 'frontend', 'src', 'App.tsx');
  const distIndexPath = path.join(process.cwd(), 'frontend', 'dist', 'index.html');
  assert.ok(fs.existsSync(appTsxPath), 'Expected frontend/src/App.tsx to exist');
  const appTsx = fs.readFileSync(appTsxPath, 'utf8');
  assert.ok(appTsx.includes('StudioView') && appTsx.includes('QuotaUpgradeModal'), 'Expected core React views in frontend/src/App.tsx');

  assert.ok(fs.existsSync(distIndexPath), 'Expected frontend/dist/index.html to exist from Vite build');
  const distHtml = fs.readFileSync(distIndexPath, 'utf8');
  assert.ok(distHtml.includes('<div id="root">') && distHtml.includes('script'), 'Expected valid bundled HTML in frontend/dist/index.html');

  // 2. Verify containerised deployment manifests
  const dockerfilePath = path.join(process.cwd(), 'Dockerfile');
  const composePath = path.join(process.cwd(), 'docker-compose.yml');
  const envExamplePath = path.join(process.cwd(), '.env.example');

  assert.ok(fs.existsSync(dockerfilePath), 'Expected Dockerfile to exist');
  const dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
  assert.ok(dockerfile.includes('EXPOSE 3456'), 'Expected Dockerfile to expose port 3456');

  assert.ok(fs.existsSync(composePath), 'Expected docker-compose.yml to exist');
  const compose = fs.readFileSync(composePath, 'utf8');
  assert.ok(compose.includes('deck-studio-app') && compose.includes('deck-studio-rust-api'), 'Expected both app and rust-api services in docker-compose.yml');

  assert.ok(fs.existsSync(envExamplePath), 'Expected .env.example to exist');
  const envExample = fs.readFileSync(envExamplePath, 'utf8');
  assert.ok(envExample.includes('DATABASE_URL=') && envExample.includes('PORT=3456'), 'Expected DATABASE_URL and PORT in .env.example');
});

test('12. Phase 5: Tablet & Mobile Responsive Studio Layout, Touch Gestures & Full Rust SPA Endpoint Parity (#11, #20, #21)', async () => {
  // 1. Verify responsive tablet (1024px) & mobile (768px) CSS breakpoints in both frontend/src/styles.css and src/public/styles.css
  const reactStyles = fs.readFileSync(path.join(process.cwd(), 'frontend', 'src', 'styles.css'), 'utf8');
  const publicStyles = fs.readFileSync(path.join(process.cwd(), 'src', 'public', 'styles.css'), 'utf8');

  for (const [label, css] of [['frontend/src/styles.css', reactStyles], ['src/public/styles.css', publicStyles]]) {
    assert.ok(css.includes('@media (max-width: 1024px)'), `Expected 1024px tablet breakpoint in ${label}`);
    assert.ok(css.includes('@media (max-width: 768px)'), `Expected 768px mobile breakpoint in ${label}`);
    assert.ok(css.includes('scroll-snap-type: x mandatory'), `Expected touch filmstrip scroll-snap in ${label}`);
  }

  // 2. Verify touch swipe & bottom-edge tap gestures in src/engine/deck-engine.js
  const engineJs = fs.readFileSync(path.join(process.cwd(), 'src', 'engine', 'deck-engine.js'), 'utf8');
  assert.ok(engineJs.includes('touchstart') && engineJs.includes('touchend'), 'Expected touchstart/touchend gesture listeners in deck-engine.js');
  assert.ok(engineJs.includes('touch-tap'), 'Expected bottom-edge touch dock toggle in deck-engine.js');

  // 3. Verify complete React 19 SPA endpoint parity in backend-rs/src/main.rs
  const rustMain = fs.readFileSync(path.join(process.cwd(), 'backend-rs', 'src', 'main.rs'), 'utf8');
  for (const route of [
    '/api/org/settings',
    '/api/brands/select',
    '/api/brands/crawl',
    '/api/brands/fonts',
    '/api/brands/:kit_id',
    '/api/gallery/preview',
    '/api/gallery/check',
    '/api/media/samples',
    '/api/media/upload',
    '/api/decks/:slug/revert',
    '/api/decks/:slug/check',
    '/api/decks/:slug/export/pdf'
  ]) {
    assert.ok(rustMain.includes(route), `Expected route ${route} in backend-rs/src/main.rs`);
  }
});

test('13. Phase 6: Real-Time Agent Build Stepper, Multi-Tenant Workspace Switcher & Slide Reorder/Add/Delete (#23, #24, #25, #26)', async () => {
  // 1. Verify UI markup for Agent Build Progress Stepper (#23), Workspace Switcher (#24), and Slide Inspector Actions (#25)
  const publicHtml = fs.readFileSync(path.join(process.cwd(), 'src', 'public', 'index.html'), 'utf8');
  const reactApp = fs.readFileSync(path.join(process.cwd(), 'frontend', 'src', 'App.tsx'), 'utf8');

  for (const [label, source] of [['src/public/index.html', publicHtml], ['frontend/src/App.tsx', reactApp]]) {
    assert.ok(source.includes('agent-progress-stepper'), `Expected agent-progress-stepper in ${label}`);
    assert.ok(source.includes('header-org-select'), `Expected header-org-select in ${label}`);
    assert.ok(source.includes('slide-inspector-actions'), `Expected slide-inspector-actions in ${label}`);
  }

  // 2. Test live HTTP API for Multi-Tenant Orgs (#24) and Slide Add / Move / Delete (#25)
  const app = createApp();
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await storage.ensureSeedData(TEST_ORG);
    const orgsRes = await fetch(`${baseUrl}/api/orgs`);
    assert.equal(orgsRes.status, 200);
    const orgsJson = await orgsRes.json();
    assert.ok(Array.isArray(orgsJson.organisations) && orgsJson.organisations.length >= 3);

    // Ensure a deck exists in TEST_ORG
    const decks = storage.listDecks(TEST_ORG);
    assert.ok(decks.length >= 1, 'Expected at least 1 deck in TEST_ORG');
    const slug = decks[0].slug;
    const initialCount = decks[0].slides.length;

    // Add a slide after index 1
    const addRes = await fetch(`${baseUrl}/api/decks/${encodeURIComponent(slug)}/slides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId: TEST_ORG,
        afterIndex: 1,
        type: 'content',
        title: 'Phase 6 Added Slide',
        lede: 'Added via Phase 6 Slide Inspector API test.'
      })
    });
    assert.equal(addRes.status, 200);
    const addJson = await addRes.json();
    assert.equal(addJson.insertedIndex, 2);
    assert.equal(addJson.deck.slides.length, initialCount + 1);
    assert.equal(addJson.deck.slides[2].title, 'Phase 6 Added Slide');

    // Move slide 2 up to index 1
    const moveRes = await fetch(`${baseUrl}/api/decks/${encodeURIComponent(slug)}/slides/2/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: TEST_ORG, direction: 'up' })
    });
    assert.equal(moveRes.status, 200);
    const moveJson = await moveRes.json();
    assert.equal(moveJson.newIndex, 1);
    assert.equal(moveJson.deck.slides[1].title, 'Phase 6 Added Slide');

    // Delete slide at index 1
    const delRes = await fetch(`${baseUrl}/api/decks/${encodeURIComponent(slug)}/slides/1?orgId=${encodeURIComponent(TEST_ORG)}`, {
      method: 'DELETE'
    });
    assert.equal(delRes.status, 200);
    const delJson = await delRes.json();
    assert.equal(delJson.deck.slides.length, initialCount);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
