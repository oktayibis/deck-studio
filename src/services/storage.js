import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  assertValidDeckSlug,
  isValidKebabSlug,
  redactPII,
  safeResolvePath
} from '../utils/security.js';
import { evaluateBrandContrast } from '../utils/color.js';
import {
  extractBrandKitFromOfficeBuffer,
  generateRealOfficeTemplateZip
} from './brand-extractor.js';
import { DatabaseAdapter } from './db-adapter.js';

const ROOT_DIR = process.cwd();
export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const FIXTURES_DIR = path.join(ROOT_DIR, 'fixtures');

export const DEFAULT_PLAN_CATALOG = {
  starter: {
    id: 'starter',
    name: 'Starter',
    maxBrands: 2,
    dailyDeckLimit: 4,
    priceMonthlyUsd: 29,
    description: 'For individuals & small teams: up to 2 Brand Kits and 4 deck builds per day.'
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    maxBrands: 4,
    dailyDeckLimit: 20,
    priceMonthlyUsd: 99,
    description: 'For growing companies & agencies: up to 4 Brand Kits and 20 deck builds per day.'
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    maxBrands: 16,
    dailyDeckLimit: 100,
    priceMonthlyUsd: 490,
    description: 'Full governance, SSO, internal LLM lock: up to 16 Brand Kits and 100 deck builds per day.'
  }
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

export class StorageService {
  constructor(baseDataDir = DATA_DIR) {
    this.baseDataDir = baseDataDir;
    ensureDir(this.baseDataDir);
    this.db = new DatabaseAdapter({
      dbPath: path.join(this.baseDataDir, 'deck_studio.sqlite')
    });
    this.db.initSchema();
  }

  getOrgDir(orgId = 'default-org') {
    if (!isValidKebabSlug(orgId)) {
      throw new Error(`Invalid organisation ID "${orgId}".`);
    }
    const dir = safeResolvePath(this.baseDataDir, 'orgs', orgId);
    ensureDir(dir);
    ensureDir(path.join(dir, 'brands'));
    ensureDir(path.join(dir, 'fonts'));
    ensureDir(path.join(dir, 'decks'));
    ensureDir(path.join(dir, 'exports'));
    ensureDir(path.join(dir, 'uploads'));
    return dir;
  }

  getStateFilePath(orgId = 'default-org') {
    const orgDir = this.getOrgDir(orgId);
    return path.join(orgDir, 'state.json');
  }

  loadOrgState(orgId = 'default-org') {
    const stateFile = this.getStateFilePath(orgId);
    const defaultState = {
      org: {
        id: orgId,
        name: 'My Studio Workspace',
        role: 'brand_admin', // 'brand_admin' | 'editor' | 'viewer'
        subscription: {
          tier: 'pro', // 'starter' | 'pro' | 'enterprise'
          planCatalog: JSON.parse(JSON.stringify(DEFAULT_PLAN_CATALOG)),
          customMaxBrands: null,
          customDailyDeckLimit: null
        },
        usageStats: {
          dailyDecksByDate: {},
          totalDecksCreated: 0,
          totalDecksEdited: 0,
          totalCheckRuns: 0,
          totalPromptTokens: 0,
          totalCompletionTokens: 0,
          totalEstimatedCostUsd: 0,
          costHistory: []
        },
        sso: {
          enabled: true,
          provider: 'OIDC (Okta Enterprise)',
          issuerUrl: 'https://sso.workspace.internal/oauth2/default',
          dataResidency: 'eu-north-1 (Copenhagen)'
        },
        llmConfig: {
          provider: process.env.LLM_PROVIDER || 'local-structured',
          model: process.env.LLM_MODEL || 'deck-architect-v4',
          baseUrl: process.env.LLM_BASE_URL || 'http://127.0.0.1:11434/v1',
          internalNetworkOnly: true,
          forbidExternalMedia: false
        },
        retentionDays: 30
      },
      activeBrandKitId: 'brand-danish-cvi',
      brandKits: {},
      uploadedFonts: [],
      decks: {},
      jobs: {},
      auditLog: []
    };
    const loaded = readJsonSafe(stateFile, null);
    if (!loaded) {
      writeJsonAtomic(stateFile, defaultState);
      return defaultState;
    }
    // Ensure subscription & usageStats fields exist when loading older state
    loaded.org = {
      ...defaultState.org,
      ...(loaded.org || {}),
      subscription: {
        ...defaultState.org.subscription,
        ...(loaded.org?.subscription || {}),
        planCatalog: {
          ... JSON.parse(JSON.stringify(DEFAULT_PLAN_CATALOG)),
          ...(loaded.org?.subscription?.planCatalog || {})
        }
      },
      usageStats: {
        ...defaultState.org.usageStats,
        ...(loaded.org?.usageStats || {})
      }
    };
    return { ...defaultState, ...loaded };
  }

  saveOrgState(orgId, state) {
    const stateFile = this.getStateFilePath(orgId);
    writeJsonAtomic(stateFile, state);
    if (this.db) {
      this.db.syncFromOrgState(orgId, state);
    }
    return state;
  }

  /**
   * Computes current effective quotas and live usage for the organisation.
   */
  getQuotaStatus(orgId = 'default-org') {
    const state = this.loadOrgState(orgId);
    const sub = state.org.subscription;
    const catalog = sub.planCatalog || DEFAULT_PLAN_CATALOG;
    const activeTierObj = catalog[sub.tier] || catalog.starter;

    const maxBrands =
      typeof sub.customMaxBrands === 'number' && sub.customMaxBrands > 0
        ? sub.customMaxBrands
        : activeTierObj.maxBrands;

    const dailyDeckLimit =
      typeof sub.customDailyDeckLimit === 'number' && sub.customDailyDeckLimit > 0
        ? sub.customDailyDeckLimit
        : activeTierObj.dailyDeckLimit;

    const today = getTodayDateString();
    const usedBrands = Object.keys(state.brandKits || {}).length;
    const usedDecksToday = state.org.usageStats?.dailyDecksByDate?.[today] || 0;

    return {
      tier: sub.tier,
      tierName: activeTierObj.name,
      maxBrands,
      usedBrands,
      remainingBrands: Math.max(0, maxBrands - usedBrands),
      canCreateBrand: usedBrands < maxBrands,
      dailyDeckLimit,
      usedDecksToday,
      remainingDecksToday: Math.max(0, dailyDeckLimit - usedDecksToday),
      canCreateDeckToday: usedDecksToday < dailyDeckLimit,
      todayDate: today,
      planCatalog: catalog,
      usageStats: state.org.usageStats
    };
  }

  /**
   * Enforces Brand Kit creation quota (2 / 4 / 16 depending on plan or override).
   */
  assertCanCreateBrand(orgId = 'default-org') {
    const q = this.getQuotaStatus(orgId);
    if (!q.canCreateBrand) {
      const err = new Error(
        `Brand Kit quota reached (${q.usedBrands}/${q.maxBrands} brands on ${q.tierName} plan). Upgrade plan or increase the brand quota (2 / 4 / 16) to add another brand.`
      );
      err.statusCode = 403;
      err.code = 'BRAND_QUOTA_EXCEEDED';
      err.quota = q;
      throw err;
    }
    return q;
  }

  /**
   * Enforces Daily Presentation creation quota (4 / 20 / 100 depending on plan or override).
   */
  assertCanCreateDeckToday(orgId = 'default-org') {
    const q = this.getQuotaStatus(orgId);
    if (!q.canCreateDeckToday) {
      const err = new Error(
        `Daily presentation limit reached (${q.usedDecksToday}/${q.dailyDeckLimit} decks created today on ${q.tierName} plan). Upgrade plan or adjust daily quota (4 / 20 / 100).`
      );
      err.statusCode = 429;
      err.code = 'DAILY_DECK_LIMIT_EXCEEDED';
      err.quota = q;
      throw err;
    }
    return q;
  }

  /**
   * Records presentation creation/edit token & render cost telemetry for SaaS unit-economics analysis.
   */
  recordDeckUsageAndCost(orgId, { isNewDeck = true, deckSlug, promptTokens = 0, completionTokens = 0, estimatedCostUsd = 0, renderDurationMs = 0 }) {
    const state = this.loadOrgState(orgId);
    const stats = state.org.usageStats;
    const today = getTodayDateString();

    if (isNewDeck) {
      stats.dailyDecksByDate[today] = (stats.dailyDecksByDate[today] || 0) + 1;
      stats.totalDecksCreated = (stats.totalDecksCreated || 0) + 1;
    } else {
      stats.totalDecksEdited = (stats.totalDecksEdited || 0) + 1;
    }

    stats.totalPromptTokens = (stats.totalPromptTokens || 0) + promptTokens;
    stats.totalCompletionTokens = (stats.totalCompletionTokens || 0) + completionTokens;
    // Include estimated headless Chromium worker compute cost ($0.002 per render/check cycle)
    const workerCost = 0.002;
    const totalJobCost = Number((estimatedCostUsd + workerCost).toFixed(4));
    stats.totalEstimatedCostUsd = Number(((stats.totalEstimatedCostUsd || 0) + totalJobCost).toFixed(4));

    stats.costHistory = stats.costHistory || [];
    stats.costHistory.unshift({
      timestamp: new Date().toISOString(),
      deckSlug,
      operation: isNewDeck ? 'create_deck' : 'edit_deck',
      promptTokens,
      completionTokens,
      llmCostUsd: estimatedCostUsd,
      workerCostUsd: workerCost,
      totalCostUsd: totalJobCost,
      renderDurationMs
    });
    stats.costHistory = stats.costHistory.slice(0, 100);

    this.saveOrgState(orgId, state);
    return this.getQuotaStatus(orgId);
  }

  /**
   * Updates subscription tier ('starter' | 'pro' | 'enterprise') and/or plan catalog quotas (e.g. 2/4/16 brands, 4/20/100 daily decks).
   */
  updateSubscriptionAndQuotas(orgId, updates = {}) {
    const state = this.loadOrgState(orgId);
    const sub = state.org.subscription;

    if (updates.tier && sub.planCatalog[updates.tier]) {
      sub.tier = updates.tier;
    }
    if (updates.customMaxBrands !== undefined) {
      sub.customMaxBrands = updates.customMaxBrands ? Number(updates.customMaxBrands) : null;
    }
    if (updates.customDailyDeckLimit !== undefined) {
      sub.customDailyDeckLimit = updates.customDailyDeckLimit ? Number(updates.customDailyDeckLimit) : null;
    }
    if (updates.planCatalog && typeof updates.planCatalog === 'object') {
      for (const [tierKey, tierUpdates] of Object.entries(updates.planCatalog)) {
        if (sub.planCatalog[tierKey]) {
          if (tierUpdates.maxBrands !== undefined) {
            sub.planCatalog[tierKey].maxBrands = Math.max(1, Number(tierUpdates.maxBrands));
          }
          if (tierUpdates.dailyDeckLimit !== undefined) {
            sub.planCatalog[tierKey].dailyDeckLimit = Math.max(1, Number(tierUpdates.dailyDeckLimit));
          }
        }
      }
    }
    if (updates.resetTodayUsage) {
      const today = getTodayDateString();
      state.org.usageStats.dailyDecksByDate[today] = 0;
    }

    this.saveOrgState(orgId, state);
    this.appendAudit(orgId, {
      action: 'subscription.quota_updated',
      target: sub.tier,
      detail: `Updated subscription/quotas: tier=${sub.tier}, maxBrands=${this.getQuotaStatus(orgId).maxBrands}, dailyDeckLimit=${this.getQuotaStatus(orgId).dailyDeckLimit}`
    });
    return this.getQuotaStatus(orgId);
  }

  appendAudit(orgId, { action, actor = 'admin@danishcvi.internal', role = 'brand_admin', target, detail = '' }) {
    const state = this.loadOrgState(orgId);
    const { text: cleanDetail } = redactPII(String(detail));
    const entry = {
      id: `audit-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      timestamp: new Date().toISOString(),
      action,
      actor: redactPII(actor).text,
      role,
      target,
      detail: cleanDetail
    };
    state.auditLog.unshift(entry);
    state.auditLog = state.auditLog.slice(0, 200);
    this.saveOrgState(orgId, state);
    return entry;
  }

  /**
   * Seeds sample Office templates (.pptx / .thmx / .potx) in fixtures/templates/
   * and seeds two initial Brand Kits ('DanishCVI' and 'Nordic Grid') so Starter (2 brands) is at 2/2 and Pro (4 brands) is at 2/4.
   */
  async ensureSeedData(orgId = 'default-org') {
    const state = this.loadOrgState(orgId);
    const templatesDir = path.join(FIXTURES_DIR, 'templates');
    ensureDir(templatesDir);

    const presets = [
      {
        filename: 'danish-cvi-corporate.pptx',
        kitId: 'brand-danish-cvi',
        seedIntoWorkspace: true,
        themeName: 'DanishCVI — Corporate Visual Identity',
        companyName: 'DanishCVI',
        classification: 'Internal',
        patternName: 'swiss-grid',
        logoPlacement: 'top-right',
        majorFont: 'Instrument Serif',
        minorFont: 'Plus Jakarta Sans',
        monoFont: 'JetBrains Mono',
        scheme: {
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
        }
      },
      {
        filename: 'nordic-grid-corporate.pptx',
        kitId: 'brand-nordic-grid',
        seedIntoWorkspace: true,
        themeName: 'Nordic Grid — Executive System',
        companyName: 'Nordic Grid Systems',
        classification: 'Internal',
        patternName: 'architectural-lines',
        logoPlacement: 'top-right',
        majorFont: 'Fraunces',
        minorFont: 'Plus Jakarta Sans',
        monoFont: 'IBM Plex Mono',
        scheme: {
          dk1: '141413',
          lt1: 'FBF9F5',
          dk2: '292524',
          lt2: 'F0EBE1',
          accent1: '0F766E',
          accent2: '0369A1',
          accent3: '15803D',
          accent4: 'B45309',
          accent5: '7E22CE',
          accent6: 'BE123C',
          hlink: '0F766E',
          folHlink: '115E59'
        }
      },
      {
        filename: 'atelier-meridian-theme.thmx',
        kitId: 'brand-atelier-meridian',
        seedIntoWorkspace: false, // Available in fixtures/templates to test uploading a 3rd brand!
        themeName: 'Atelier Meridian — Product & Editorial',
        companyName: 'Atelier Meridian',
        classification: 'Public',
        patternName: 'architectural-lines',
        logoPlacement: 'top-right',
        majorFont: 'Fraunces',
        minorFont: 'DM Sans',
        monoFont: 'IBM Plex Mono',
        scheme: {
          dk1: '111827',
          lt1: 'FAF8F5',
          dk2: '1F2937',
          lt2: 'EDE9FE',
          accent1: '4F46E5',
          accent2: '0284C7',
          accent3: '059669',
          accent4: 'D97706',
          accent5: '7C3AED',
          accent6: 'DC2626',
          hlink: '4F46E5',
          folHlink: '4338CA'
        }
      },
      {
        filename: 'helios-cloud-proprietary-font.potx',
        kitId: 'brand-helios-cloud',
        seedIntoWorkspace: false, // Available in fixtures/templates to test missing font warning!
        themeName: 'Helios Cloud — Infrastructure',
        companyName: 'Helios Cloud Corp',
        classification: 'Confidential',
        patternName: 'diagonal',
        logoPlacement: 'top-left',
        majorFont: 'Helios Display Corporate',
        minorFont: 'IBM Plex Sans',
        monoFont: 'JetBrains Mono',
        scheme: {
          dk1: '090D16',
          lt1: 'F8FAFC',
          dk2: '1E293B',
          lt2: 'E2E8F0',
          accent1: '1D4ED8',
          accent2: '0284C7',
          accent3: '059669',
          accent4: 'D97706',
          accent5: '4F46E5',
          accent6: 'DC2626',
          hlink: '1D4ED8',
          folHlink: '1E40AF'
        }
      }
    ];

    for (const preset of presets) {
      const filePath = path.join(templatesDir, preset.filename);
      let buf;
      if (!fs.existsSync(filePath)) {
        buf = await generateRealOfficeTemplateZip(preset);
        fs.writeFileSync(filePath, buf);
      } else {
        buf = fs.readFileSync(filePath);
      }

      if (preset.seedIntoWorkspace && !state.brandKits[preset.kitId]) {
        const extracted = await extractBrandKitFromOfficeBuffer(buf, {
          filename: preset.filename,
          orgId,
          uploadedFonts: state.uploadedFonts
        });
        const now = new Date().toISOString();
        const kitVersionObj = {
          ...extracted,
          id: preset.kitId,
          version: 1,
          createdAt: now,
          updatedAt: now
        };
        state.brandKits[preset.kitId] = {
          id: preset.kitId,
          name: extracted.name,
          currentVersion: 1,
          versions: {
            1: kitVersionObj
          },
          createdAt: now,
          updatedAt: now
        };
      }
    }

    if (!state.brandKits[state.activeBrandKitId]) {
      state.activeBrandKitId = Object.keys(state.brandKits)[0] || 'brand-danish-cvi';
    }

    this.saveOrgState(orgId, state);
    return state;
  }

  getActiveBrandKit(orgId = 'default-org', kitId = null, version = null) {
    const state = this.loadOrgState(orgId);
    const targetId = kitId || state.activeBrandKitId || Object.keys(state.brandKits)[0];
    const kitRecord = state.brandKits[targetId];
    if (!kitRecord) return null;
    const targetVer = version || kitRecord.currentVersion;
    return kitRecord.versions[targetVer] || kitRecord.versions[kitRecord.currentVersion];
  }

  setActiveBrandKit(orgId = 'default-org', kitId) {
    const state = this.loadOrgState(orgId);
    if (!state.brandKits[kitId]) {
      const err = new Error(`Brand Kit "${kitId}" not found.`);
      err.statusCode = 404;
      throw err;
    }
    state.activeBrandKitId = kitId;
    this.saveOrgState(orgId, state);
    return this.getActiveBrandKit(orgId, kitId);
  }

  listBrandKits(orgId = 'default-org') {
    const state = this.loadOrgState(orgId);
    return Object.values(state.brandKits).map((kit) => ({
      id: kit.id,
      name: kit.name,
      currentVersion: kit.currentVersion,
      active: state.activeBrandKitId === kit.id,
      latest: kit.versions[kit.currentVersion],
      versionList: Object.keys(kit.versions).map(Number).sort((a, b) => b - a)
    }));
  }

  /**
   * Creates a new Brand Kit (checking the 2 / 4 / 16 brand quota!)
   * or appends a new version to an existing Brand Kit.
   */
  saveBrandKitVersion(orgId, kitId, specUpdates, options = { propagateToDecks: true }) {
    const state = this.loadOrgState(orgId);
    const now = new Date().toISOString();
    let kitRecord = state.brandKits[kitId];

    if (!kitRecord) {
      // Enforce Brand Quota when adding a new Brand Kit!
      this.assertCanCreateBrand(orgId);

      const cleanId = isValidKebabSlug(kitId) ? kitId : `brand-${Date.now()}`;
      const v1 = {
        ...specUpdates,
        id: cleanId,
        orgId,
        version: 1,
        contrastReport: evaluateBrandContrast(specUpdates.colors),
        createdAt: now,
        updatedAt: now
      };
      kitRecord = {
        id: cleanId,
        name: v1.name || 'Custom Brand Kit',
        currentVersion: 1,
        versions: { 1: v1 },
        createdAt: now,
        updatedAt: now
      };
      state.brandKits[cleanId] = kitRecord;
      state.activeBrandKitId = cleanId;
      this.saveOrgState(orgId, state);
      this.appendAudit(orgId, {
        action: 'brand_kit.created',
        target: `${cleanId}@v1`,
        detail: `Created Brand Kit "${kitRecord.name}" from "${v1.sourceFile || 'brand setup'}"`
      });
      return v1;
    }

    const prevSpec = kitRecord.versions[kitRecord.currentVersion];
    const nextVersion = kitRecord.currentVersion + 1;
    const mergedColors = {
      ...prevSpec.colors,
      ...(specUpdates.colors || {}),
      status: {
        ...prevSpec.colors.status,
        ...(specUpdates.colors?.status || {})
      },
      scheme: {
        ...prevSpec.colors.scheme,
        ...(specUpdates.colors?.scheme || {})
      }
    };

    const mergedFonts = {
      ...prevSpec.fonts,
      ...(specUpdates.fonts || {})
    };

    const mergedSpec = {
      ...prevSpec,
      ...specUpdates,
      id: kitRecord.id,
      orgId,
      version: nextVersion,
      colors: mergedColors,
      fonts: mergedFonts,
      geometry: {
        ...prevSpec.geometry,
        ...(specUpdates.geometry || {})
      },
      logo: {
        ...prevSpec.logo,
        ...(specUpdates.logo || {})
      },
      frame: {
        ...prevSpec.frame,
        ...(specUpdates.frame || {})
      },
      rules: {
        ...prevSpec.rules,
        ...(specUpdates.rules || {})
      },
      contrastReport: evaluateBrandContrast(mergedColors),
      updatedAt: now
    };

    kitRecord.name = mergedSpec.name;
    kitRecord.currentVersion = nextVersion;
    kitRecord.versions[nextVersion] = mergedSpec;
    kitRecord.updatedAt = now;

    if (options.propagateToDecks) {
      for (const deck of Object.values(state.decks)) {
        if (deck.brandKitId === kitRecord.id) {
          deck.brandKitVersion = nextVersion;
          deck.updatedAt = now;
        }
      }
    }

    this.saveOrgState(orgId, state);
    this.appendAudit(orgId, {
      action: 'brand_kit.version_created',
      target: `${kitRecord.id}@v${nextVersion}`,
      detail: `Updated Brand Kit "${kitRecord.name}" to v${nextVersion}`
    });
    return mergedSpec;
  }

  deleteBrandKit(orgId, kitId) {
    const state = this.loadOrgState(orgId);
    if (!state.brandKits[kitId]) return false;
    if (Object.keys(state.brandKits).length <= 1) {
      const err = new Error('Cannot delete the only remaining Brand Kit in the workspace.');
      err.statusCode = 400;
      throw err;
    }
    delete state.brandKits[kitId];
    if (state.activeBrandKitId === kitId) {
      state.activeBrandKitId = Object.keys(state.brandKits)[0];
    }
    this.saveOrgState(orgId, state);
    this.appendAudit(orgId, {
      action: 'brand_kit.deleted',
      target: kitId,
      detail: `Deleted Brand Kit "${kitId}"`
    });
    return true;
  }

  /**
   * Resets a workspace to 0 Brand Kits (`usedBrands: 0`) for testing Zero-Brand CVI Onboarding.
   */
  clearAllBrandKits(orgId = 'default-org') {
    const state = this.loadOrgState(orgId);
    state.brandKits = {};
    state.activeBrandKitId = null;
    if (this.db?.sqliteDb) {
      this.db.sqliteDb
        .prepare('DELETE FROM brand_kits WHERE org_id = ?')
        .run(String(orgId));
    }
    this.saveOrgState(orgId, state);
    this.appendAudit(orgId, {
      action: 'brand_kits.cleared',
      target: orgId,
      detail: 'Cleared all Brand Kits from workspace (reset to 0 Brand Kits)'
    });
    return this.getQuotaStatus(orgId);
  }

  getDeckDir(orgId, deckSlug) {
    assertValidDeckSlug(deckSlug);
    const orgDir = this.getOrgDir(orgId);
    const deckDir = safeResolvePath(orgDir, 'decks', deckSlug);
    ensureDir(deckDir);
    ensureDir(path.join(deckDir, 'assets'));
    return deckDir;
  }

  saveDeck(orgId, deckObj, { createHistorySnapshot = true, historyNote = 'Updated deck' } = {}) {
    assertValidDeckSlug(deckObj.slug);
    const state = this.loadOrgState(orgId);
    const existing = state.decks[deckObj.slug];
    const now = new Date().toISOString();

    const history = existing?.history ? [...existing.history] : [];
    const nextVersion = existing ? (existing.version || 1) + 1 : 1;

    if (existing && createHistorySnapshot) {
      history.unshift({
        version: existing.version || 1,
        timestamp: existing.updatedAt || now,
        note: historyNote,
        storyline: existing.storyline,
        slides: existing.slides,
        assumptions: existing.assumptions,
        lastCheckReport: existing.lastCheckReport
      });
    }

    const record = {
      ...existing,
      ...deckObj,
      orgId,
      version: nextVersion,
      history: history.slice(0, 15),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    state.decks[deckObj.slug] = record;
    this.saveOrgState(orgId, state);
    return record;
  }

  revertDeckToPreviousVersion(orgId, deckSlug, targetVersion = null) {
    assertValidDeckSlug(deckSlug);
    const state = this.loadOrgState(orgId);
    const deck = state.decks[deckSlug];
    if (!deck || !Array.isArray(deck.history) || deck.history.length === 0) {
      const err = new Error(`No previous version history available for deck "${deckSlug}".`);
      err.statusCode = 400;
      throw err;
    }

    const snapshotIdx =
      targetVersion !== null
        ? deck.history.findIndex((h) => h.version === Number(targetVersion))
        : 0;
    const snapshot = deck.history[snapshotIdx >= 0 ? snapshotIdx : 0];

    deck.slides = snapshot.slides;
    deck.storyline = snapshot.storyline;
    deck.assumptions = snapshot.assumptions;
    deck.lastCheckReport = snapshot.lastCheckReport;
    deck.version = (deck.version || 1) + 1;
    deck.history.splice(snapshotIdx >= 0 ? snapshotIdx : 0, 1);
    deck.updatedAt = new Date().toISOString();

    this.saveOrgState(orgId, state);
    this.appendAudit(orgId, {
      action: 'deck.reverted',
      target: `${deckSlug}@v${deck.version}`,
      detail: `Reverted "${deckSlug}" to snapshot v${snapshot.version}`
    });
    return deck;
  }

  getDeck(orgId, deckSlug) {
    assertValidDeckSlug(deckSlug);
    const state = this.loadOrgState(orgId);
    return state.decks[deckSlug] || null;
  }

  listDecks(orgId = 'default-org') {
    const state = this.loadOrgState(orgId);
    return Object.values(state.decks).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  deleteDeck(orgId, deckSlug) {
    assertValidDeckSlug(deckSlug);
    const state = this.loadOrgState(orgId);
    if (!state.decks[deckSlug]) return false;
    delete state.decks[deckSlug];
    this.saveOrgState(orgId, state);
    const deckDir = this.getDeckDir(orgId, deckSlug);
    fs.rmSync(deckDir, { recursive: true, force: true });
    this.appendAudit(orgId, {
      action: 'deck.deleted',
      target: deckSlug,
      detail: `Deleted deck "${deckSlug}"`
    });
    return true;
  }

  /**
   * Lists known multi-tenant workspaces (Issue #24) with quota summaries.
   */
  listOrganisations() {
    const presetOrgs = [
      { id: 'default-org', defaultName: 'Default Workspace' },
      { id: 'nordic-labs', defaultName: 'Nordic Labs' },
      { id: 'atelier-studio', defaultName: 'Atelier Studio' }
    ];
    const seen = new Set(presetOrgs.map((o) => o.id));
    const orgsRoot = path.join(this.baseDataDir, 'orgs');
    if (fs.existsSync(orgsRoot)) {
      for (const entry of fs.readdirSync(orgsRoot, { withFileTypes: true })) {
        if (entry.isDirectory() && !seen.has(entry.name) && !entry.name.startsWith('test-')) {
          seen.add(entry.name);
          presetOrgs.push({ id: entry.name, defaultName: entry.name });
        }
      }
    }

    return presetOrgs.map(({ id, defaultName }) => {
      const state = this.loadOrgState(id);
      const quota = this.getQuotaStatus(id);
      const rawName = state.org?.name;
      const isGenericName =
        !rawName ||
        rawName === 'My Studio Workspace' ||
        rawName === 'Nordic Grid Enterprise';
      return {
        id,
        name: isGenericName ? defaultName : rawName,
        tier: quota.tier,
        tierName: quota.tierName,
        usedBrands: quota.usedBrands,
        maxBrands: quota.maxBrands,
        usedDecksToday: quota.usedDecksToday,
        dailyDeckLimit: quota.dailyDeckLimit
      };
    });
  }

  /**
   * Inserts a new slide into an existing deck (Issue #25).
   */
  addSlideToDeck(orgId, deckSlug, payload = {}) {
    assertValidDeckSlug(deckSlug);
    const deck = this.getDeck(orgId, deckSlug);
    if (!deck) {
      const err = new Error(`Deck "${deckSlug}" not found.`);
      err.statusCode = 404;
      throw err;
    }

    const slides = Array.isArray(deck.slides) ? [...deck.slides] : [];
    const afterIdx =
      typeof payload.afterIndex === 'number' && Number.isFinite(payload.afterIndex)
        ? Math.max(0, Math.min(slides.length - 1, payload.afterIndex))
        : Math.max(0, slides.length - 2);
    const insertIdx = slides.length === 0 ? 0 : Math.min(slides.length, afterIdx + 1);

    const newSlide = {
      id: `slide-custom-${Date.now()}`,
      type: payload.type || 'content',
      eyebrow: payload.eyebrow || `0${insertIdx + 1} · KEY POINT`,
      eyebrowIcon: 'sparkle',
      title: payload.title || 'New Brand-Aligned Slide',
      lede: payload.lede || 'Supporting factual context and decision takeaway.',
      speakerNotes: payload.speakerNotes || 'Added via Slide Inspector.',
      components: Array.isArray(payload.components) && payload.components.length > 0
        ? payload.components
        : [
            {
              type: 'bullets',
              items: [
                payload.lede || 'Supporting factual context and decision takeaway.',
                'Verified against active Brand CVI palette and 1600×900 stage geometry.'
              ]
            }
          ]
    };

    slides.splice(insertIdx, 0, newSlide);
    const saved = this.saveDeck(
      orgId,
      {
        ...deck,
        slides
      },
      {
        createHistorySnapshot: true,
        historyNote: `Added Slide ${insertIdx + 1}`
      }
    );
    this.appendAudit(orgId, {
      action: 'deck.slide_added',
      target: `${deckSlug}#slide-${insertIdx + 1}`,
      detail: `Added slide "${newSlide.title}" at position ${insertIdx + 1}`
    });
    return { deck: saved, insertedIndex: insertIdx };
  }

  /**
   * Deletes a slide at slideIndex from an existing deck (Issue #25).
   */
  deleteSlideFromDeck(orgId, deckSlug, slideIndex) {
    assertValidDeckSlug(deckSlug);
    const deck = this.getDeck(orgId, deckSlug);
    if (!deck) {
      const err = new Error(`Deck "${deckSlug}" not found.`);
      err.statusCode = 404;
      throw err;
    }

    const slides = Array.isArray(deck.slides) ? [...deck.slides] : [];
    if (slides.length <= 1) {
      const err = new Error('A presentation must contain at least 1 slide.');
      err.statusCode = 400;
      throw err;
    }
    if (slideIndex < 0 || slideIndex >= slides.length) {
      const err = new Error(`Slide index ${slideIndex} is out of bounds.`);
      err.statusCode = 400;
      throw err;
    }

    const [removed] = slides.splice(slideIndex, 1);
    const saved = this.saveDeck(
      orgId,
      {
        ...deck,
        slides
      },
      {
        createHistorySnapshot: true,
        historyNote: `Deleted Slide ${slideIndex + 1}`
      }
    );
    this.appendAudit(orgId, {
      action: 'deck.slide_deleted',
      target: `${deckSlug}#slide-${slideIndex + 1}`,
      detail: `Deleted slide "${removed?.title || slideIndex + 1}"`
    });
    return { deck: saved };
  }

  /**
   * Moves a slide up or down in an existing deck (Issue #25).
   */
  moveSlideInDeck(orgId, deckSlug, slideIndex, direction = 'up') {
    assertValidDeckSlug(deckSlug);
    const deck = this.getDeck(orgId, deckSlug);
    if (!deck) {
      const err = new Error(`Deck "${deckSlug}" not found.`);
      err.statusCode = 404;
      throw err;
    }

    const slides = Array.isArray(deck.slides) ? [...deck.slides] : [];
    if (slideIndex < 0 || slideIndex >= slides.length) {
      const err = new Error(`Slide index ${slideIndex} is out of bounds.`);
      err.statusCode = 400;
      throw err;
    }

    const targetIndex = direction === 'down' ? slideIndex + 1 : slideIndex - 1;
    if (targetIndex < 0 || targetIndex >= slides.length) {
      return { deck, newIndex: slideIndex };
    }

    const temp = slides[slideIndex];
    slides[slideIndex] = slides[targetIndex];
    slides[targetIndex] = temp;

    const saved = this.saveDeck(
      orgId,
      {
        ...deck,
        slides
      },
      {
        createHistorySnapshot: true,
        historyNote: `Moved Slide ${slideIndex + 1} ${direction}`
      }
    );
    this.appendAudit(orgId, {
      action: 'deck.slide_moved',
      target: `${deckSlug}#slide-${targetIndex + 1}`,
      detail: `Moved slide from #${slideIndex + 1} to #${targetIndex + 1}`
    });
    return { deck: saved, newIndex: targetIndex };
  }
}

export const storage = new StorageService();
