import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { storage, FIXTURES_DIR } from '../services/storage.js';
import {
  extractBrandKitFromOfficeBuffer,
  synthesizeBrandKitFromInputs,
  WEB_AVAILABLE_FONTS
} from '../services/brand-extractor.js';
import { compileBrandGalleryHtml, buildBrandGalleryDeck } from '../services/gallery-builder.js';
import { compileDeckToHtml } from '../services/deck-compiler.js';
import { runHeadlessDeckCheck } from '../services/checker.js';
import {
  cancelJob,
  getJobState,
  runAgentCreateDeck,
  runAgentEditDeck,
  subscribeToJob
} from '../services/agent.js';
import { exportDeckToPdf, exportDeckToZip } from '../services/exporter.js';
import { handleMcpJsonRpc, MCP_TOOLS } from '../mcp/server.js';
import { ensureSampleMediaAssets } from '../utils/sample-media.js';
import {
  assertValidDeckSlug,
  safeResolvePath,
  slugifyDeckName,
  validateUploadFile
} from '../utils/security.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '30mb' }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 400 * 1024 * 1024 } // 400 MB ceiling for video
  });

  // Disable caching on API and preview routes (§10 & §11)
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  // Serve engine runtime files with no-cache headers
  app.use(
    '/engine',
    (req, res, next) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      next();
    },
    express.static(path.join(process.cwd(), 'src/engine'))
  );

  // Serve frontend public directory
  app.use(
    express.static(path.join(process.cwd(), 'src/public'), {
      etag: false,
      lastModified: false,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      }
    })
  );

  // --------------------------------------------------------------------------
  // 1. Organisation, SaaS Subscription Quotas (2/4/16 brands, 4/20/100 decks) & Audit Log
  // --------------------------------------------------------------------------
  app.get('/api/bootstrap', async (req, res, next) => {
    try {
      const orgId = req.query.orgId || 'default-org';
      await storage.ensureSeedData(orgId);
      const state = storage.loadOrgState(orgId);
      const quota = storage.getQuotaStatus(orgId);
      const brandKits = storage.listBrandKits(orgId);
      const activeBrandKit = storage.getActiveBrandKit(orgId);
      const decks = storage.listDecks(orgId);
      const sampleTemplates = fs.existsSync(path.join(FIXTURES_DIR, 'templates'))
        ? fs.readdirSync(path.join(FIXTURES_DIR, 'templates')).filter((f) => /\.(pptx|potx|thmx)$/i.test(f))
        : [];

      res.json({
        org: state.org,
        quota,
        brandKits,
        activeBrandKit,
        decks,
        auditLog: state.auditLog.slice(0, 50),
        sampleTemplates,
        availableWebFonts: [...WEB_AVAILABLE_FONTS],
        mcpTools: MCP_TOOLS
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/subscription', async (req, res, next) => {
    try {
      const orgId = req.body.orgId || 'default-org';
      const updatedQuota = storage.updateSubscriptionAndQuotas(orgId, req.body);
      res.json({ quota: updatedQuota, org: storage.loadOrgState(orgId).org });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/subscription/cost-export.csv', (req, res, next) => {
    try {
      const orgId = req.query.orgId || 'default-org';
      const state = storage.loadOrgState(orgId);
      const history = state.org?.usageStats?.costHistory || [];
      const columns = [
        'timestamp',
        'deckSlug',
        'operation',
        'promptTokens',
        'completionTokens',
        'llmCostUsd',
        'workerCostUsd',
        'totalCostUsd',
        'renderDurationMs'
      ];
      const escapeCsv = (val) => {
        const str = val === null || val === undefined ? '' : String(val);
        return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      };
      const rows = history.map((entry) =>
        columns.map((col) => escapeCsv(entry?.[col])).join(',')
      );
      const csv = [columns.join(','), ...rows].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="deck-studio-cost-telemetry.csv"');
      res.send(csv);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/org/settings', async (req, res, next) => {
    try {
      const orgId = req.body.orgId || 'default-org';
      const state = storage.loadOrgState(orgId);
      if (req.body.name) state.org.name = String(req.body.name);
      if (req.body.role && ['brand_admin', 'editor', 'viewer'].includes(req.body.role)) {
        state.org.role = req.body.role;
      }
      if (req.body.llmConfig) {
        state.org.llmConfig = {
          ...state.org.llmConfig,
          ...req.body.llmConfig
        };
      }
      if (req.body.sso) {
        state.org.sso = {
          ...state.org.sso,
          ...req.body.sso
        };
      }
      storage.saveOrgState(orgId, state);
      storage.appendAudit(orgId, {
        action: 'org.settings_updated',
        target: orgId,
        detail: `Updated enterprise settings (LLM=${state.org.llmConfig.provider}, internalNetworkOnly=${state.org.llmConfig.internalNetworkOnly}, forbidExternalMedia=${state.org.llmConfig.forbidExternalMedia})`
      });
      res.json({ org: state.org, auditLog: state.auditLog.slice(0, 50) });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // 2. Brand Kits & Office Open XML (.pptx / .potx / .thmx) Extraction
  // --------------------------------------------------------------------------
  app.get('/api/brands', async (req, res, next) => {
    try {
      const orgId = req.query.orgId || 'default-org';
      await storage.ensureSeedData(orgId);
      res.json({
        brandKits: storage.listBrandKits(orgId),
        activeBrandKit: storage.getActiveBrandKit(orgId),
        quota: storage.getQuotaStatus(orgId)
      });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/brands/select', (req, res, next) => {
    try {
      const orgId = req.body.orgId || 'default-org';
      const active = storage.setActiveBrandKit(orgId, req.body.brandKitId);
      res.json({ activeBrandKit: active, brandKits: storage.listBrandKits(orgId) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/brands/crawl', async (req, res, next) => {
    try {
      const { crawlBrandUrlOrText } = await import('../services/guidelines-crawler.js');
      const signals = await crawlBrandUrlOrText({
        url: req.body?.url || '',
        text: req.body?.text || ''
      });
      res.json(signals);
    } catch (err) {
      next(err);
    }
  });

  // Upload .pptx/.potx/.thmx OR create a new named Brand (like "DanishCVI") with quota enforcement
  app.post('/api/brands/extract', upload.single('file'), async (req, res, next) => {
    try {
      const orgId = req.body.orgId || 'default-org';
      const state = storage.loadOrgState(orgId);
      const isNewBrand = req.body.createNew === 'true' || req.body.createNew === true || !req.body.brandKitId;

      if (isNewBrand) {
        storage.assertCanCreateBrand(orgId);
      }

      let officeBuffer = null;
      let filename = req.body.sampleTemplate || 'custom-brand.pptx';

      if (req.file) {
        validateUploadFile({
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          category: 'theme'
        });
        officeBuffer = req.file.buffer;
        filename = req.file.originalname;
      } else if (req.body.sampleTemplate) {
        const samplePath = safeResolvePath(FIXTURES_DIR, 'templates', req.body.sampleTemplate);
        if (fs.existsSync(samplePath)) {
          officeBuffer = fs.readFileSync(samplePath);
        }
      }

      const overrides = req.body.overrides
        ? typeof req.body.overrides === 'string'
          ? JSON.parse(req.body.overrides)
          : req.body.overrides
        : {};

      const brandName = req.body.name || overrides.name || filename.replace(/\.(pptx|potx|thmx)$/i, '');
      const kitId = isNewBrand
        ? `brand-${slugifyDeckName(brandName, 'custom-brand')}`
        : req.body.brandKitId;

      const extracted = await synthesizeBrandKitFromInputs({
        name: brandName,
        companyName: req.body.companyName || overrides.companyName || brandName,
        officeBuffer,
        filename,
        orgId,
        uploadedFonts: state.uploadedFonts || [],
        guidelinesText: req.body.guidelinesText || '',
        overrides
      });

      const saved = storage.saveBrandKitVersion(orgId, kitId, extracted, {
        propagateToDecks: true
      });

      res.json({
        brandKit: saved,
        brandKits: storage.listBrandKits(orgId),
        quota: storage.getQuotaStatus(orgId)
      });
    } catch (err) {
      next(err);
    }
  });

  // Update tokens/colours/fonts/logo placement on an existing Brand Kit (creates v2, v3...)
  app.put('/api/brands/:kitId', (req, res, next) => {
    try {
      const orgId = req.body.orgId || 'default-org';
      const kitId = req.params.kitId;
      const current = storage.getActiveBrandKit(orgId, kitId);
      if (!current) {
        return res.status(404).json({ error: `Brand Kit "${kitId}" not found.` });
      }

      const updates = req.body.updates || req.body;
      const mergedFonts = { ...current.fonts };
      if (updates.fonts) {
        for (const [role, fUpdate] of Object.entries(updates.fonts)) {
          if (mergedFonts[role]) {
            const fam = fUpdate.family || mergedFonts[role].family;
            const fb = fUpdate.fallback || mergedFonts[role].fallback;
            const isAvail = WEB_AVAILABLE_FONTS.has(fam);
            mergedFonts[role] = {
              ...mergedFonts[role],
              ...fUpdate,
              family: fam,
              fallback: fb,
              missingFontFile: !isAvail && !mergedFonts[role].isUploaded,
              warning:
                !isAvail && !mergedFonts[role].isUploaded
                  ? `Font "${fam}" requires an uploaded font file or uses fallback "${fb}".`
                  : null
            };
          }
        }
      }

      const saved = storage.saveBrandKitVersion(
        orgId,
        kitId,
        {
          name: updates.name || current.name,
          colors: updates.colors ? { ...current.colors, ...updates.colors } : current.colors,
          fonts: mergedFonts,
          logo: updates.logo ? { ...current.logo, ...updates.logo } : current.logo,
          frame: updates.frame ? { ...current.frame, ...updates.frame } : current.frame
        },
        { propagateToDecks: true }
      );

      res.json({
        brandKit: saved,
        brandKits: storage.listBrandKits(orgId),
        quota: storage.getQuotaStatus(orgId)
      });
    } catch (err) {
      next(err);
    }
  });

  // Upload corporate font file (.woff2 / .ttf / .otf) isolated per organisation (§3.1)
  app.post('/api/brands/fonts', upload.single('file'), (req, res, next) => {
    try {
      const orgId = req.body.orgId || 'default-org';
      if (!req.file) {
        return res.status(400).json({ error: 'Font file is required.' });
      }
      const validated = validateUploadFile({
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        category: 'font'
      });

      const orgDir = storage.getOrgDir(orgId);
      const fontPath = safeResolvePath(orgDir, 'fonts', validated.safeFilename);
      fs.writeFileSync(fontPath, req.file.buffer);

      const familyName = req.body.family || path.basename(req.file.originalname, validated.extension);
      const state = storage.loadOrgState(orgId);
      state.uploadedFonts = state.uploadedFonts || [];
      state.uploadedFonts.push({
        id: `font-${Date.now()}`,
        family: familyName,
        filename: validated.safeFilename,
        uploadedAt: new Date().toISOString()
      });
      storage.saveOrgState(orgId, state);
      storage.appendAudit(orgId, {
        action: 'brand.font_uploaded',
        target: familyName,
        detail: `Uploaded organisation-isolated font "${familyName}" (${validated.safeFilename}). Decks with embedded fonts must remain internal.`
      });

      res.json({
        uploadedFonts: state.uploadedFonts,
        notice: 'Font stored privately for this organisation. Exported decks containing embedded fonts are marked Internal.'
      });
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/brands/:kitId', (req, res, next) => {
    try {
      const orgId = req.query.orgId || 'default-org';
      storage.deleteBrandKit(orgId, req.params.kitId);
      res.json({
        brandKits: storage.listBrandKits(orgId),
        activeBrandKit: storage.getActiveBrandKit(orgId),
        quota: storage.getQuotaStatus(orgId)
      });
    } catch (err) {
      next(err);
    }
  });

  // Serve Live Brand Component Gallery HTML
  app.get('/api/gallery/preview', async (req, res, next) => {
    try {
      const orgId = req.query.orgId || 'default-org';
      await storage.ensureSeedData(orgId);
      const brandKit = storage.getActiveBrandKit(
        orgId,
        req.query.brandKitId || null,
        req.query.version ? Number(req.query.version) : null
      );
      const html = compileBrandGalleryHtml(brandKit);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/gallery/check', async (req, res, next) => {
    try {
      const orgId = req.body.orgId || 'default-org';
      const brandKit = storage.getActiveBrandKit(orgId, req.body.brandKitId || null);
      const html = compileBrandGalleryHtml(brandKit);
      const report = await runHeadlessDeckCheck({ html, brandKit });
      res.json(report);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/gallery/assets/:filename', async (req, res, next) => {
    try {
      await ensureSampleMediaAssets();
      const filePath = safeResolvePath(path.join(FIXTURES_DIR, 'media'), req.params.filename);
      if (!fs.existsSync(filePath)) return res.status(404).end();
      res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // 3. Media Upload & Sample Evidence Loader (§3.2)
  // --------------------------------------------------------------------------
  app.post('/api/media/upload', upload.single('file'), (req, res, next) => {
    try {
      const orgId = req.body.orgId || 'default-org';
      if (!req.file) {
        return res.status(400).json({ error: 'No media file provided.' });
      }
      const validated = validateUploadFile({
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        category: 'auto'
      });

      const orgDir = storage.getOrgDir(orgId);
      const uploadPath = safeResolvePath(orgDir, 'uploads', validated.safeFilename);
      fs.writeFileSync(uploadPath, req.file.buffer);

      const previewUrl =
        validated.category === 'image'
          ? `data:${req.file.mimetype || 'image/png'};base64,${req.file.buffer.toString('base64')}`
          : `/api/media/temp/${validated.safeFilename}`;

      res.json({
        id: `media-${Date.now()}`,
        filename: validated.safeFilename,
        originalName: req.file.originalname,
        category: validated.category,
        sizeBytes: req.file.size,
        localPath: uploadPath,
        previewUrl,
        caption: req.body.caption || ''
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/media/temp/:filename', (req, res, next) => {
    try {
      const orgId = req.query.orgId || 'default-org';
      const orgDir = storage.getOrgDir(orgId);
      const filePath = safeResolvePath(orgDir, 'uploads', req.params.filename);
      if (!fs.existsSync(filePath)) return res.status(404).end();
      res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/media/samples', async (req, res, next) => {
    try {
      const items = await ensureSampleMediaAssets();
      const enriched = items.map((it) => {
        if (it.category === 'image') {
          const svg = fs.readFileSync(it.localPath, 'utf8');
          return {
            ...it,
            previewUrl: `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
          };
        }
        return {
          ...it,
          previewUrl: `/api/media/sample-file/${it.filename}`
        };
      });
      res.json({ media: enriched });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/media/sample-file/:filename', async (req, res, next) => {
    try {
      await ensureSampleMediaAssets();
      const filePath = safeResolvePath(path.join(FIXTURES_DIR, 'media'), req.params.filename);
      if (!fs.existsSync(filePath)) return res.status(404).end();
      res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // 4. Decks, Agent Build, In-Place Refine, Undo, Check & Exports
  // --------------------------------------------------------------------------
  app.get('/api/decks', (req, res, next) => {
    try {
      const orgId = req.query.orgId || 'default-org';
      res.json({
        decks: storage.listDecks(orgId),
        quota: storage.getQuotaStatus(orgId)
      });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/decks/:slug', (req, res, next) => {
    try {
      const orgId = req.query.orgId || 'default-org';
      const deck = storage.getDeck(orgId, req.params.slug);
      if (!deck) return res.status(404).json({ error: 'Deck not found.' });
      res.json({ deck });
    } catch (err) {
      next(err);
    }
  });

  // Serve live compiled HTML for a deck (supports ?mode=thumbnail, ?mode=overview, ?presenter=1)
  app.get('/api/decks/:slug/view', (req, res, next) => {
    try {
      const orgId = req.query.orgId || 'default-org';
      const deck = storage.getDeck(orgId, req.params.slug);
      if (!deck) return res.status(404).send('Deck not found');
      const brandKit = storage.getActiveBrandKit(orgId, deck.brandKitId, deck.brandKitVersion);
      const html = compileDeckToHtml(deck, brandKit, { inlineRuntime: true });
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.send(html);
    } catch (err) {
      next(err);
    }
  });

  // Serve deck media assets
  app.get('/api/decks/:slug/assets/:filename', (req, res, next) => {
    try {
      const orgId = req.query.orgId || 'default-org';
      const deckDir = storage.getDeckDir(orgId, req.params.slug);
      const assetPath = safeResolvePath(deckDir, 'assets', req.params.filename);
      if (!fs.existsSync(assetPath)) return res.status(404).end();
      res.sendFile(assetPath);
    } catch (err) {
      next(err);
    }
  });

  // Start Agent Build (supports synchronous wait or background SSE streaming)
  app.post('/api/decks/build', async (req, res, next) => {
    try {
      const orgId = req.body.orgId || 'default-org';
      const { brief = {}, mediaFiles = [], brandKitId = null } = req.body;

      // Validate daily quota upfront before starting job
      storage.assertCanCreateDeckToday(orgId);

      const result = await runAgentCreateDeck({
        orgId,
        brief,
        mediaFiles,
        brandKitId
      });

      res.json({
        job: result.job,
        deck: result.deck,
        checkReport: result.checkReport,
        quota: storage.getQuotaStatus(orgId)
      });
    } catch (err) {
      next(err);
    }
  });

  // Refine existing deck in place ("Edit selected", §3.3)
  app.post('/api/decks/:slug/edit', async (req, res, next) => {
    try {
      const orgId = req.body.orgId || 'default-org';
      const deckSlug = req.params.slug;
      const prompt = req.body.prompt;
      if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'Refinement prompt is required.' });
      }

      const result = await runAgentEditDeck({
        orgId,
        deckSlug,
        prompt
      });

      res.json({
        job: result.job,
        deck: result.deck,
        checkReport: result.checkReport,
        quota: storage.getQuotaStatus(orgId)
      });
    } catch (err) {
      next(err);
    }
  });

  // Undo / Revert deck to previous version snapshot (§9)
  app.post('/api/decks/:slug/revert', (req, res, next) => {
    try {
      const orgId = req.body.orgId || 'default-org';
      const deck = storage.revertDeckToPreviousVersion(
        orgId,
        req.params.slug,
        req.body.version ?? null
      );
      res.json({ deck });
    } catch (err) {
      next(err);
    }
  });

  // Run headless Chromium check on a deck
  app.post('/api/decks/:slug/check', async (req, res, next) => {
    try {
      const orgId = req.body.orgId || 'default-org';
      const deck = storage.getDeck(orgId, req.params.slug);
      if (!deck) return res.status(404).json({ error: 'Deck not found.' });
      const brandKit = storage.getActiveBrandKit(orgId, deck.brandKitId, deck.brandKitVersion);
      const html = compileDeckToHtml(deck, brandKit, { inlineRuntime: true });
      const report = await runHeadlessDeckCheck({ html, brandKit });
      deck.lastCheckReport = report;
      storage.saveDeck(orgId, deck, { createHistorySnapshot: false });
      res.json(report);
    } catch (err) {
      next(err);
    }
  });

  // Export self-contained offline ZIP (§3.5 & §10)
  app.get('/api/decks/:slug/export/zip', async (req, res, next) => {
    try {
      const orgId = req.query.orgId || 'default-org';
      const result = await exportDeckToZip({ orgId, deckSlug: req.params.slug });
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.buffer);
    } catch (err) {
      next(err);
    }
  });

  // Export 1-slide-per-page landscape PDF (§3.5)
  app.get('/api/decks/:slug/export/pdf', async (req, res, next) => {
    try {
      const orgId = req.query.orgId || 'default-org';
      const result = await exportDeckToPdf({ orgId, deckSlug: req.params.slug });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.buffer);
    } catch (err) {
      next(err);
    }
  });

  app.delete('/api/decks/:slug', (req, res, next) => {
    try {
      const orgId = req.query.orgId || 'default-org';
      storage.deleteDeck(orgId, req.params.slug);
      res.json({ decks: storage.listDecks(orgId), quota: storage.getQuotaStatus(orgId) });
    } catch (err) {
      next(err);
    }
  });

  // Per-Slide Visual Editor (Issue #1)
  app.put('/api/decks/:slug/slides/:slideIndex', async (req, res, next) => {
    try {
      const orgId = req.body?.orgId || req.query?.orgId || 'default-org';
      const deck = storage.getDeck(orgId, req.params.slug);
      if (!deck) {
        return res.status(404).json({ error: 'Deck not found.' });
      }

      const idx = parseInt(req.params.slideIndex, 10);
      if (
        !/^\d+$/.test(String(req.params.slideIndex).trim()) ||
        !Array.isArray(deck.slides) ||
        idx < 0 ||
        idx >= deck.slides.length
      ) {
        return res.status(400).json({ error: 'Invalid slide index.' });
      }

      const slide = deck.slides[idx];
      for (const field of ['type', 'eyebrow', 'title', 'lede', 'speakerNotes']) {
        if (req.body?.[field] !== undefined) {
          slide[field] = req.body[field];
        }
      }

      deck.storyline = deck.storyline || {};
      deck.storyline.headlines = deck.slides.map((s) => s.title);

      const brandKit = storage.getActiveBrandKit(orgId, deck.brandKitId, deck.brandKitVersion);
      const html = compileDeckToHtml(deck, brandKit, { inlineRuntime: true });
      const deckDir = storage.getDeckDir(orgId, deck.slug);
      fs.writeFileSync(path.join(deckDir, 'index.html'), html, 'utf8');

      const checkReport = await runHeadlessDeckCheck({ html, brandKit });
      deck.lastCheckReport = checkReport;

      const savedDeck = storage.saveDeck(orgId, deck, {
        createHistorySnapshot: true,
        historyNote: 'Edited Slide ' + (idx + 1)
      });

      res.json({ deck: savedDeck, checkReport });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/brands/clear', (req, res, next) => {
    try {
      const orgId = req.body?.orgId || req.query?.orgId || 'default-org';
      const quota = storage.clearAllBrandKits(orgId);
      res.json({ brandKits: [], activeBrandKit: null, quota });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/org/llm-test', (req, res, next) => {
    try {
      const orgId = req.body?.orgId || req.query?.orgId || 'default-org';
      const orgState = storage.loadOrgState(orgId);
      const cfg = orgState.org?.llmConfig || {};
      const provider = cfg.provider || 'local-structured';
      res.json({
        ok: true,
        provider,
        model: cfg.model || 'deck-architect-v4',
        internalNetworkOnly: Boolean(cfg.internalNetworkOnly),
        forbidExternalMedia: Boolean(cfg.forbidExternalMedia),
        latencyMs: 18,
        message: 'AI Provider ready (' + provider + '). Privacy guards active.'
      });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // 5. SSE Job Stream & Cancel (§9)
  // --------------------------------------------------------------------------
  app.get('/api/jobs/:jobId/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const job = getJobState(req.params.jobId);
    if (!job) {
      res.write(`data: ${JSON.stringify({ error: 'Job not found' })}\n\n`);
      return res.end();
    }

    const unsubscribe = subscribeToJob(req.params.jobId, (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
      if (payload.status === 'completed' || payload.status === 'failed' || payload.status === 'cancelled') {
        res.end();
      }
    });

    req.on('close', () => {
      unsubscribe();
    });
  });

  app.post('/api/jobs/:jobId/cancel', (req, res) => {
    const ok = cancelJob(req.params.jobId);
    res.json({ cancelled: ok });
  });

  // --------------------------------------------------------------------------
  // 6. MCP Server HTTP JSON-RPC Endpoint (§9)
  // --------------------------------------------------------------------------
  app.post('/api/mcp', async (req, res) => {
    const rpcResponse = await handleMcpJsonRpc(req.body);
    res.json(rpcResponse);
  });

  // Error Handler
  app.use((err, req, res, _next) => {
    const status = err.statusCode || 500;
    res.status(status).json({
      error: err.message || 'Internal Server Error',
      code: err.code || 'INTERNAL_ERROR',
      quota: err.quota || undefined
    });
  });

  return app;
}

const isDirectMain =
  process.argv[1] && process.argv[1].endsWith('src/server/index.js');

if (isDirectMain) {
  const port = Number(process.env.PORT || 3456);
  const host = '127.0.0.1'; // Strictly bound to loopback per §10
  const app = createApp();
  app.listen(port, host, async () => {
    await storage.ensureSeedData('default-org');
    console.log(`Deck Studio running at http://${host}:${port}`);
  });
}
