/* ==========================================================================
   Deck Studio — Strict TypeScript Browser Application Controller
   Clean, intuitive workflow across Create, Brand Kit, My Decks, Gallery & Plans
   ========================================================================== */

export interface BrandColorMap {
  primary: string;
  secondary: string;
  accent: string;
  surfaceLight: string;
  surfaceAlt: string;
  surfaceDark: string;
  [role: string]: string;
}

export interface FontRoleSummary {
  family: string;
  fallback: string;
  missingFontFile?: boolean;
  warning?: string | null;
}

export interface ContrastCheckRow {
  label: string;
  fg: string;
  bg: string;
  ratio: number;
  passed: boolean;
}

export interface GeometryBoxIn {
  xIn: number;
  yIn: number;
  wIn: number;
  hIn: number;
}

export interface GeometryBoxPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BrandKitSummary {
  id: string;
  orgId?: string;
  name: string;
  version: number;
  currentVersion?: number;
  colors: BrandColorMap;
  fonts: {
    title: FontRoleSummary;
    [role: string]: FontRoleSummary;
  };
  logo?: {
    placement: string;
    [key: string]: unknown;
  };
  frame?: {
    classification: string;
    [key: string]: unknown;
  };
  contrastReport?: {
    passed: boolean;
    checks: ContrastCheckRow[];
  };
  geometry?: {
    placeholdersIn?: Record<string, GeometryBoxIn>;
    placeholdersPx?: Record<string, GeometryBoxPx>;
  };
  latest?: {
    colors?: Partial<BrandColorMap>;
    fonts?: {
      title?: Partial<FontRoleSummary>;
    };
  };
}

export interface PlanTierSummary {
  id: string;
  name: string;
  priceMonthlyUsd: number;
  maxBrands: number;
  dailyDeckLimit: number;
}

export interface CostHistoryEntry {
  deckSlug: string;
  operation: string;
  promptTokens: number;
  completionTokens: number;
  renderDurationMs: number;
  totalCostUsd: number | string;
}

export interface UsageStatsSummary {
  totalDecksCreated?: number;
  totalDecksEdited?: number;
  totalEstimatedCostUsd?: number;
  costHistory?: CostHistoryEntry[];
}

export interface QuotaStatus {
  tier: string;
  tierName: string;
  usedBrands: number;
  maxBrands: number;
  canCreateBrand: boolean;
  usedDecksToday: number;
  dailyDeckLimit: number;
  planCatalog?: Record<string, PlanTierSummary>;
  usageStats?: UsageStatsSummary;
}

export interface SlideSummary {
  id?: string;
  type: string;
  title?: string;
  lede?: string;
  speakerNotes?: string;
}

export interface SlideCheckItem {
  slideNumber: number;
  title: string;
  passed: boolean;
  errorCount: number;
}

export interface DeckCheckReportSummary {
  passed: boolean;
  slideCount: number;
  errorCount: number;
  humanSummary: string;
  slides?: SlideCheckItem[];
}

export interface DeckBriefSummary {
  topic?: string;
  audience?: string;
  lengthMinutes?: number;
  endsWithLiveDemo?: boolean;
  language?: string;
  slug?: string;
  sourceUrl?: string;
}

export interface DeckSummary {
  id?: string;
  slug: string;
  title: string;
  brandKitId: string;
  version?: number;
  slides: SlideSummary[];
  brief?: DeckBriefSummary;
  lastCheckReport?: DeckCheckReportSummary | null;
}

export interface MediaTrayItem {
  id?: string;
  filename: string;
  category: 'image' | 'video' | string;
  previewUrl?: string;
  src?: string;
  caption?: string;
}

export interface OrgSummary {
  id?: string;
  name?: string;
  role?: string;
  llmConfig?: {
    provider?: string;
    internalNetworkOnly?: boolean;
    forbidExternalMedia?: boolean;
  };
}

export interface AuditLogEntry {
  action: string;
  target: string;
  detail: string;
  timestamp: string;
}

export interface JobStepSummary {
  tool: string;
  message: string;
  phase: string;
}

export interface BuildJobSummary {
  steps?: JobStepSummary[];
}

export interface StarterBriefPreset {
  topic: string;
  audience: string;
  lengthMinutes: number;
  endsWithLiveDemo: boolean;
  slug: string;
}

export type AppViewName = 'studio' | 'brand' | 'library' | 'gallery' | 'saas';

interface BootstrapPayload {
  org: OrgSummary | null;
  quota: QuotaStatus | null;
  brandKits?: BrandKitSummary[];
  activeBrandKit: BrandKitSummary | null;
  decks?: DeckSummary[];
  auditLog?: AuditLogEntry[];
  sampleTemplates?: string[];
}

interface DeckEngineHandle {
  currentIndex: number;
  prevStep: () => void;
  nextStep: () => void;
  goToSlide: (idx: number, opts?: { revealAllSteps?: boolean }) => void;
}

interface DeckEngineWindow extends Window {
  __deckEngine?: DeckEngineHandle;
}

declare global {
  interface Window {
    __app?: DeckStudioApp;
  }
}

const STARTER_BRIEFS: Record<string, StarterBriefPreset> = {
  postmortem: {
    topic:
      '10-minute talk for management about the March 12 EU-Central-1 incident. At 14:02 UTC traffic surged 3.4x above baseline. At 14:06 UTC the primary database connection pool reached 94% saturation and P99 latency spiked to 412 ms (error rate 3.8%). At 14:11 UTC automated pool-guard promoted standby replica eu-central-1b and raised the connection ceiling from 250 to 500 with jittered backoff. By 14:16 UTC (14 minutes total mitigation window) latency returned to 38 ms nominal baseline with 0 lost transactions.',
    audience: 'management',
    lengthMinutes: 10,
    endsWithLiveDemo: true,
    slug: 'march-12-incident-review'
  },
  demo: {
    topic:
      'Live engineering walkthrough of the automated Pool-Guard failover daemon. Previously, static 250-connection limits required manual operator intervention taking 14 minutes. With Pool-Guard v2, standby replica promotion executes in 12 seconds when saturation exceeds 85%, maintaining 99.98% availability SLA.',
    audience: 'developers',
    lengthMinutes: 12,
    endsWithLiveDemo: true,
    slug: 'pool-guard-feature-demo'
  },
  status: {
    topic:
      'Q3 Infrastructure Reliability Status Update. Availability reached 99.98% across 3 regions. Completed automated replica failover rollout in EU-Central-1 and reduced P99 latency from 412 ms peak to 38 ms steady state. Next milestone: multi-region active-active routing in Q4.',
    audience: 'management',
    lengthMinutes: 8,
    endsWithLiveDemo: false,
    slug: 'q3-reliability-status'
  },
  howitworks: {
    topic:
      'How the Zero-Trust Brand Deck Engine works: 1) Extract design tokens and inch geometry from an Office .pptx template into a versioned Brand Kit. 2) Map factual brief statements and unaltered media evidence onto 15 brand-tokenised components. 3) Verify 100% of slides in headless Chromium for WCAG AA contrast and zero stage overflow.',
    audience: 'product',
    lengthMinutes: 10,
    endsWithLiveDemo: true,
    slug: 'zero-trust-deck-engine'
  }
};

const DRAFT_STORAGE_KEY = 'deck_studio_draft_v1';

function getEl<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export class DeckStudioApp {
  public org: OrgSummary | null = null;
  public quota: QuotaStatus | null = null;
  public brandKits: BrandKitSummary[] = [];
  public activeBrandKit: BrandKitSummary | null = null;
  public decks: DeckSummary[] = [];
  public selectedDeck: DeckSummary | null = null;
  public activeSlideIndex = 0;
  public mediaTray: MediaTrayItem[] = [];
  public auditLog: AuditLogEntry[] = [];
  public sampleTemplates: string[] = [];
  public currentView: AppViewName = 'studio';
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    void this.init();
  }

  public async init(): Promise<void> {
    this.bindNavigation();
    this.bindStudioEvents();
    this.bindBrandSetupEvents();
    this.bindLibraryEvents();
    this.bindSaasQuotaEvents();
    this.bindQuotaModalEvents();
    this.restoreDraftFromStorage();
    await this.refreshBootstrap();
  }

  public showToast(message: string): void {
    const el = getEl<HTMLElement>('toast-banner');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    if (this.toastTimer !== undefined) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
  }

  public slugify(text: string): string {
    return (
      String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .split('-')
        .slice(0, 5)
        .join('-') || 'untitled-deck'
    );
  }

  public async refreshBootstrap(): Promise<void> {
    const res = await fetch('/api/bootstrap');
    const data = (await res.json()) as BootstrapPayload;
    this.org = data.org;
    this.quota = data.quota;
    this.brandKits = data.brandKits || [];
    this.activeBrandKit = data.activeBrandKit;
    this.decks = data.decks || [];
    this.auditLog = data.auditLog || [];
    this.sampleTemplates = data.sampleTemplates || [];

    if (!this.selectedDeck && this.decks.length > 0) {
      this.selectedDeck = this.decks[0];
    } else if (this.selectedDeck) {
      const updated = this.decks.find((d) => d.slug === this.selectedDeck?.slug);
      if (updated) this.selectedDeck = updated;
    }

    this.renderHeaderAndQuota();
    this.renderBrandSelectors();
    this.renderBrandSetupSurface();
    this.renderLibrarySurface();
    this.renderSaasSurface();
    this.renderSelectedDeckInViewer();
  }

  private bindNavigation(): void {
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = (btn.getAttribute('data-view') || 'studio') as AppViewName;
        this.switchView(view);
      });
    });

    getEl<HTMLButtonElement>('header-quota-pill')?.addEventListener('click', () => {
      this.switchView('saas');
    });

    getEl<HTMLSelectElement>('header-brand-select')?.addEventListener('change', async (e) => {
      const select = e.target as HTMLSelectElement;
      await this.selectBrandKit(select.value);
    });
  }

  public switchView(viewName: AppViewName): void {
    this.currentView = viewName;
    document.querySelectorAll('.nav-tab').forEach((t) => {
      t.classList.toggle('active', t.getAttribute('data-view') === viewName);
    });
    document.querySelectorAll('.view-panel').forEach((p) => {
      p.classList.toggle('active', p.id === `view-${viewName}`);
    });

    if (viewName === 'gallery') {
      const iframe = getEl<HTMLIFrameElement>('full-gallery-iframe');
      if (iframe && this.activeBrandKit) {
        iframe.src = `/api/gallery/preview?brandKitId=${encodeURIComponent(this.activeBrandKit.id)}&t=${Date.now()}`;
      }
    } else if (viewName === 'brand') {
      this.refreshBrandGalleryIframe();
    }
  }

  public async selectBrandKit(brandKitId: string): Promise<void> {
    if (!brandKitId) return;
    const res = await fetch('/api/brands/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandKitId })
    });
    if (res.ok) {
      await this.refreshBootstrap();
      this.refreshBrandGalleryIframe();
      this.showToast(`Switched brand to ${this.activeBrandKit?.name || brandKitId}`);
    }
  }

  public renderHeaderAndQuota(): void {
    if (!this.quota) return;
    const pillText = getEl<HTMLElement>('header-quota-text');
    if (pillText) {
      pillText.textContent = `${this.quota.tierName} · ${this.quota.usedBrands}/${this.quota.maxBrands} Brands · ${this.quota.usedDecksToday}/${this.quota.dailyDeckLimit} Today`;
    }
    const brandQuotaBadge = getEl<HTMLElement>('brand-quota-badge');
    if (brandQuotaBadge) {
      brandQuotaBadge.textContent = `${this.quota.usedBrands} of ${this.quota.maxBrands} Brands Used (${this.quota.tierName} Plan)`;
      brandQuotaBadge.className = `badge ${this.quota.canCreateBrand ? 'badge-pass' : 'badge-warn'}`;
    }
  }

  public renderBrandSelectors(): void {
    const headerSel = getEl<HTMLSelectElement>('header-brand-select');
    const studioSel = getEl<HTMLSelectElement>('studio-brand-select');
    const studioBadge = getEl<HTMLElement>('studio-brand-badge');
    const headerDots = getEl<HTMLElement>('header-brand-dots');
    const onboardingBanner = getEl<HTMLElement>('zero-brand-onboarding-banner');

    if (onboardingBanner) {
      onboardingBanner.style.display = this.brandKits.length === 0 ? 'flex' : 'none';
    }

    const optionsHtml =
      this.brandKits.length > 0
        ? this.brandKits
            .map(
              (k) =>
                `<option value="${k.id}" ${k.id === this.activeBrandKit?.id ? 'selected' : ''}>${k.name} (v${k.currentVersion ?? k.version})</option>`
            )
            .join('')
        : '<option value="">No Brand CVI yet</option>';

    if (headerSel) headerSel.innerHTML = optionsHtml;
    if (studioSel) studioSel.innerHTML = optionsHtml;
    if (studioBadge) {
      if (this.activeBrandKit) {
        const shortName = this.activeBrandKit.name.split('—')[0].trim();
        studioBadge.textContent = `${shortName} v${this.activeBrandKit.version}`;
      } else {
        studioBadge.textContent = 'Select Brand CVI';
      }
    }
    if (headerDots && this.activeBrandKit?.colors) {
      const c = this.activeBrandKit.colors;
      headerDots.innerHTML = `
        <span class="brand-dot" style="background:${c.surfaceDark}"></span>
        <span class="brand-dot" style="background:${c.accent}"></span>
        <span class="brand-dot" style="background:${c.surfaceLight}"></span>
      `;
    }
  }

  // --------------------------------------------------------------------------
  // STUDIO: Create & Edit
  // --------------------------------------------------------------------------
  private bindStudioEvents(): void {
    getEl<HTMLButtonElement>('goto-brand-onboarding-btn')?.addEventListener('click', () => {
      this.switchView('brand');
    });

    const topicEl = getEl<HTMLTextAreaElement>('brief-topic');
    const slugEl = getEl<HTMLInputElement>('brief-slug');
    const audEl = getEl<HTMLSelectElement>('brief-audience');
    const lenEl = getEl<HTMLInputElement>('brief-length');
    const demoEl = getEl<HTMLInputElement>('brief-demo-toggle');

    const saveDraft = (): void => {
      if (topicEl && slugEl && !slugEl.dataset.manual) {
        slugEl.value = this.slugify(topicEl.value);
      }
      try {
        localStorage.setItem(
          DRAFT_STORAGE_KEY,
          JSON.stringify({
            topic: topicEl?.value || '',
            slug: slugEl?.value || '',
            audience: audEl?.value || 'management',
            lengthMinutes: lenEl?.value || 10,
            endsWithLiveDemo: demoEl?.checked ?? true
          })
        );
      } catch {
        // ignore storage quota errors
      }
    };

    topicEl?.addEventListener('input', saveDraft);
    audEl?.addEventListener('change', saveDraft);
    lenEl?.addEventListener('input', saveDraft);
    demoEl?.addEventListener('change', saveDraft);
    slugEl?.addEventListener('input', () => {
      slugEl.dataset.manual = '1';
      saveDraft();
    });

    document.querySelectorAll('[data-starter]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const key = chip.getAttribute('data-starter') || '';
        const preset = STARTER_BRIEFS[key];
        if (!preset) return;
        if (topicEl) topicEl.value = preset.topic;
        if (audEl) audEl.value = preset.audience;
        if (lenEl) lenEl.value = String(preset.lengthMinutes);
        if (demoEl) demoEl.checked = preset.endsWithLiveDemo;
        if (slugEl) slugEl.value = preset.slug;
        saveDraft();
      });
    });

    getEl<HTMLButtonElement>('load-full-sample-btn')?.addEventListener('click', async () => {
      const preset = STARTER_BRIEFS.postmortem;
      if (topicEl) topicEl.value = preset.topic;
      if (audEl) audEl.value = preset.audience;
      if (lenEl) lenEl.value = String(preset.lengthMinutes);
      if (demoEl) demoEl.checked = preset.endsWithLiveDemo;
      if (slugEl) slugEl.value = preset.slug;
      saveDraft();

      const res = await fetch('/api/media/samples');
      const data = (await res.json()) as { media?: MediaTrayItem[] };
      this.mediaTray = data.media || [];
      this.renderMediaTray();
      this.showToast('Loaded sample brief + 2 screenshots + 1 failover video');
    });

    const dropzone = getEl<HTMLElement>('media-dropzone');
    const fileInput = getEl<HTMLInputElement>('media-file-input');

    dropzone?.addEventListener('click', () => fileInput?.click());
    dropzone?.addEventListener('dragover', (e: DragEvent) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone?.addEventListener('drop', async (e: DragEvent) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer?.files?.length) {
        await this.uploadFilesToMediaTray(Array.from(e.dataTransfer.files));
      }
    });

    fileInput?.addEventListener('change', async () => {
      if (fileInput.files?.length) {
        await this.uploadFilesToMediaTray(Array.from(fileInput.files));
        fileInput.value = '';
      }
    });

    window.addEventListener('paste', async (e: ClipboardEvent) => {
      if (this.currentView !== 'studio') return;
      const items = Array.from(e.clipboardData?.items || []);
      const fileItems = items
        .filter((it) => it.kind === 'file')
        .map((it) => it.getAsFile())
        .filter((f): f is File => Boolean(f));
      if (fileItems.length > 0) {
        await this.uploadFilesToMediaTray(fileItems);
      }
    });

    getEl<HTMLButtonElement>('build-deck-btn')?.addEventListener('click', () => {
      void this.handleBuildDeck();
    });

    document.querySelectorAll('[data-refine]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const input = getEl<HTMLInputElement>('refine-prompt-input');
        if (input) {
          input.value = chip.getAttribute('data-refine') || '';
          void this.handleRefineSelectedDeck();
        }
      });
    });

    getEl<HTMLButtonElement>('apply-refine-btn')?.addEventListener('click', () => {
      void this.handleRefineSelectedDeck();
    });
    getEl<HTMLButtonElement>('undo-deck-btn')?.addEventListener('click', () => {
      void this.handleUndoDeck();
    });
    getEl<HTMLButtonElement>('save-slide-inspector-btn')?.addEventListener('click', () => {
      void this.handleSaveSlideInspector();
    });

    getEl<HTMLButtonElement>('viewer-prev-btn')?.addEventListener('click', () => {
      const iframe = getEl<HTMLIFrameElement>('studio-preview-iframe');
      const engine = (iframe?.contentWindow as DeckEngineWindow | null)?.__deckEngine;
      if (engine) {
        engine.prevStep();
        this.activeSlideIndex = engine.currentIndex;
        this.highlightActiveFilmstripPill();
        this.populateSlideInspector();
      }
    });
    getEl<HTMLButtonElement>('viewer-next-btn')?.addEventListener('click', () => {
      const iframe = getEl<HTMLIFrameElement>('studio-preview-iframe');
      const engine = (iframe?.contentWindow as DeckEngineWindow | null)?.__deckEngine;
      if (engine) {
        engine.nextStep();
        this.activeSlideIndex = engine.currentIndex;
        this.highlightActiveFilmstripPill();
        this.populateSlideInspector();
      }
    });
    getEl<HTMLButtonElement>('viewer-present-btn')?.addEventListener('click', () => {
      if (!this.selectedDeck) return;
      window.open(`/api/decks/${encodeURIComponent(this.selectedDeck.slug)}/view`, '_blank');
    });
    getEl<HTMLButtonElement>('viewer-presenter-btn')?.addEventListener('click', () => {
      if (!this.selectedDeck) return;
      window.open(
        `/api/decks/${encodeURIComponent(this.selectedDeck.slug)}/view?presenter=1`,
        '_blank',
        'width=1280,height=820'
      );
    });
    getEl<HTMLButtonElement>('viewer-check-btn')?.addEventListener('click', () => {
      void this.handleRunCheckOnSelectedDeck();
    });
  }

  private restoreDraftFromStorage(): void {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      const preset: Partial<StarterBriefPreset> = raw
        ? (JSON.parse(raw) as Partial<StarterBriefPreset>)
        : STARTER_BRIEFS.postmortem;
      const topicEl = getEl<HTMLTextAreaElement>('brief-topic');
      const slugEl = getEl<HTMLInputElement>('brief-slug');
      const audEl = getEl<HTMLSelectElement>('brief-audience');
      const lenEl = getEl<HTMLInputElement>('brief-length');
      const demoEl = getEl<HTMLInputElement>('brief-demo-toggle');
      if (topicEl) topicEl.value = preset.topic || STARTER_BRIEFS.postmortem.topic;
      if (slugEl) slugEl.value = preset.slug || STARTER_BRIEFS.postmortem.slug;
      if (audEl) audEl.value = preset.audience || 'management';
      if (lenEl) lenEl.value = String(preset.lengthMinutes || 10);
      if (demoEl) demoEl.checked = preset.endsWithLiveDemo ?? true;
    } catch {
      // ignore invalid stored draft
    }
  }

  public async uploadFilesToMediaTray(files: File[]): Promise<void> {
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('caption', `Visual evidence: ${file.name}`);
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
      const data = (await res.json()) as MediaTrayItem & { error?: string };
      if (!res.ok) {
        this.showToast(`Upload rejected: ${data.error || 'Unknown error'}`);
        continue;
      }
      this.mediaTray.push(data);
    }
    this.renderMediaTray();
  }

  public renderMediaTray(): void {
    const listEl = getEl<HTMLElement>('media-tray-list');
    const badgeEl = getEl<HTMLElement>('media-count-badge');
    if (badgeEl) badgeEl.textContent = `${this.mediaTray.length} attached`;
    if (!listEl) return;

    listEl.innerHTML = this.mediaTray
      .map(
        (item, idx) => `
      <div class="media-item" data-media-idx="${idx}">
        ${
          item.category === 'image'
            ? `<img class="media-thumb" src="${item.previewUrl || item.src || ''}" alt="${item.filename}" />`
            : `<div class="media-thumb">MP4</div>`
        }
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div style="font-size:12px;font-weight:600;color:var(--text-primary);">${item.filename}</div>
          <input type="text" class="ui-input" data-caption-idx="${idx}" value="${(item.caption || '').replace(/"/g, '&quot;')}" placeholder="Caption (what should the audience see?)" style="padding:5px 8px;font-size:12px;" />
        </div>
        <button type="button" class="btn btn-sm btn-ghost" data-remove-media="${idx}" aria-label="Remove media">✕</button>
      </div>`
      )
      .join('');

    listEl.querySelectorAll('[data-caption-idx]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const inputEl = inp as HTMLInputElement;
        const i = Number(inputEl.getAttribute('data-caption-idx'));
        if (this.mediaTray[i]) this.mediaTray[i].caption = inputEl.value;
      });
    });

    listEl.querySelectorAll('[data-remove-media]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.getAttribute('data-remove-media'));
        this.mediaTray.splice(i, 1);
        this.renderMediaTray();
      });
    });
  }

  public async handleBuildDeck(): Promise<void> {
    const buildBtn = getEl<HTMLButtonElement>('build-deck-btn');
    const brief: DeckBriefSummary = {
      topic: getEl<HTMLTextAreaElement>('brief-topic')?.value || '',
      audience: getEl<HTMLSelectElement>('brief-audience')?.value || 'management',
      lengthMinutes: Number(getEl<HTMLInputElement>('brief-length')?.value || 10),
      endsWithLiveDemo: Boolean(getEl<HTMLInputElement>('brief-demo-toggle')?.checked),
      language: getEl<HTMLSelectElement>('brief-language')?.value || 'en',
      slug: getEl<HTMLInputElement>('brief-slug')?.value || '',
      sourceUrl: getEl<HTMLInputElement>('brief-source-url')?.value || ''
    };

    const brandKitId = this.activeBrandKit?.id;

    if (buildBtn) {
      buildBtn.disabled = true;
      buildBtn.textContent = 'Building & Verifying Slides…';
    }

    try {
      const res = await fetch('/api/decks/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief,
          mediaFiles: this.mediaTray,
          brandKitId
        })
      });

      const data = (await res.json()) as {
        deck?: DeckSummary;
        job?: BuildJobSummary;
        error?: string;
        code?: string;
      };
      if (!res.ok || !data.deck) {
        if (res.status === 429 || data.code === 'DAILY_DECK_LIMIT_EXCEEDED') {
          this.openQuotaUpgradeModal(data.error || 'Daily presentation limit reached.');
        }
        this.showToast(data.error || 'Could not create presentation');
        return;
      }

      this.selectedDeck = data.deck;
      this.activeSlideIndex = 0;
      if (data.job) this.renderJobActivity(data.job);
      await this.refreshBootstrap();
      this.showToast(`Created "${data.deck.title}" (${data.deck.slides.length} slides)`);
    } finally {
      if (buildBtn) {
        buildBtn.disabled = false;
        buildBtn.textContent = 'Create Presentation';
      }
    }
  }

  public async handleRefineSelectedDeck(): Promise<void> {
    if (!this.selectedDeck) {
      this.showToast('Create or select a presentation first.');
      return;
    }
    const promptInput = getEl<HTMLInputElement>('refine-prompt-input');
    const prompt = promptInput?.value?.trim();
    if (!prompt) {
      this.showToast('Type what you would like to change.');
      return;
    }

    const btn = getEl<HTMLButtonElement>('apply-refine-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Updating…';
    }

    try {
      const res = await fetch(`/api/decks/${encodeURIComponent(this.selectedDeck.slug)}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = (await res.json()) as {
        deck?: DeckSummary;
        job?: BuildJobSummary;
        error?: string;
      };
      if (!res.ok || !data.deck) {
        this.showToast(data.error || 'Refinement failed');
        return;
      }
      this.selectedDeck = data.deck;
      if (data.job) this.renderJobActivity(data.job);
      await this.refreshBootstrap();
      if (promptInput) promptInput.value = '';
      this.showToast(`Updated presentation (v${data.deck.version ?? 1})`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Update Deck';
      }
    }
  }

  public async handleUndoDeck(): Promise<void> {
    if (!this.selectedDeck) return;
    const res = await fetch(`/api/decks/${encodeURIComponent(this.selectedDeck.slug)}/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = (await res.json()) as { deck?: DeckSummary; error?: string };
    if (!res.ok || !data.deck) {
      this.showToast(data.error || 'Nothing to undo yet.');
      return;
    }
    this.selectedDeck = data.deck;
    await this.refreshBootstrap();
    this.showToast('Reverted to previous version');
  }

  public async handleRunCheckOnSelectedDeck(): Promise<void> {
    if (!this.selectedDeck) return;
    const res = await fetch(`/api/decks/${encodeURIComponent(this.selectedDeck.slug)}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const report = (await res.json()) as DeckCheckReportSummary;
    this.selectedDeck.lastCheckReport = report;
    this.renderCheckReport(report);
    this.showToast(report.humanSummary);
  }

  public renderJobActivity(job: BuildJobSummary): void {
    const listEl = getEl<HTMLElement>('agent-activity-list');
    if (!listEl || !job) return;
    listEl.innerHTML = (job.steps || [])
      .map(
        (s) => `
      <div class="activity-step">
        <span><strong>${s.tool}</strong> — ${s.message}</span>
        <span style="color:var(--text-muted);font-size:11.5px;">${s.phase}</span>
      </div>`
      )
      .join('');
  }

  public renderSelectedDeckInViewer(): void {
    const deck = this.selectedDeck;
    const titleEl = getEl<HTMLElement>('viewer-deck-title');
    const iframe = getEl<HTMLIFrameElement>('studio-preview-iframe');
    const zipLink = getEl<HTMLAnchorElement>('viewer-export-zip');
    const pdfLink = getEl<HTMLAnchorElement>('viewer-export-pdf');
    const filmstrip = getEl<HTMLElement>('studio-slide-filmstrip');

    if (!deck) {
      if (titleEl) titleEl.textContent = 'No Presentation Selected';
      this.populateSlideInspector();
      return;
    }

    if ((deck.slides || []).length > 0 && this.activeSlideIndex >= deck.slides.length) {
      this.activeSlideIndex = 0;
    }

    if (titleEl) {
      const cleanTitle = deck.title.length > 54 ? deck.title.slice(0, 52) + '…' : deck.title;
      titleEl.textContent = cleanTitle;
    }
    if (iframe) {
      iframe.src = `/api/decks/${encodeURIComponent(deck.slug)}/view?slide=${this.activeSlideIndex}&t=${Date.now()}`;
    }
    if (zipLink) {
      zipLink.href = `/api/decks/${encodeURIComponent(deck.slug)}/export/zip`;
    }
    if (pdfLink) {
      pdfLink.href = `/api/decks/${encodeURIComponent(deck.slug)}/export/pdf`;
    }

    if (filmstrip) {
      filmstrip.innerHTML = (deck.slides || [])
        .map(
          (s, idx) => `
        <button type="button" class="filmstrip-pill ${idx === this.activeSlideIndex ? 'active' : ''}" data-slide-jump="${idx}">
          <div class="filmstrip-num">
            <span>Slide ${String(idx + 1).padStart(2, '0')}</span>
            <span style="color:var(--text-muted);font-weight:400;">${s.type}</span>
          </div>
          <div class="filmstrip-title">${s.title || `Slide ${idx + 1}`}</div>
        </button>`
        )
        .join('');

      filmstrip.querySelectorAll('[data-slide-jump]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = Number(btn.getAttribute('data-slide-jump'));
          this.activeSlideIndex = idx;
          this.highlightActiveFilmstripPill();
          this.populateSlideInspector();
          const win = iframe?.contentWindow as DeckEngineWindow | null;
          if (win?.__deckEngine) {
            win.__deckEngine.goToSlide(idx, { revealAllSteps: true });
          } else if (iframe) {
            iframe.src = `/api/decks/${encodeURIComponent(deck.slug)}/view?slide=${idx}&t=${Date.now()}`;
          }
        });
      });
    }

    this.populateSlideInspector();

    if (deck.lastCheckReport) {
      this.renderCheckReport(deck.lastCheckReport);
    }
  }

  public populateSlideInspector(): void {
    const slide = this.selectedDeck?.slides?.[this.activeSlideIndex] || null;
    const badgeEl = getEl<HTMLElement>('inspector-slide-badge');
    const typeEl = getEl<HTMLSelectElement>('inspector-slide-type');
    const titleEl = getEl<HTMLInputElement>('inspector-slide-title');
    const ledeEl = getEl<HTMLInputElement>('inspector-slide-lede');
    const notesEl = getEl<HTMLInputElement>('inspector-slide-notes');
    const saveBtn = getEl<HTMLButtonElement>('save-slide-inspector-btn');

    if (badgeEl) {
      badgeEl.textContent = slide
        ? `Slide ${String(this.activeSlideIndex + 1).padStart(2, '0')}`
        : 'No Slide';
    }
    if (typeEl) typeEl.value = slide?.type || 'content';
    if (titleEl) titleEl.value = slide?.title || '';
    if (ledeEl) ledeEl.value = slide?.lede || '';
    if (notesEl) notesEl.value = slide?.speakerNotes || '';
    if (saveBtn) saveBtn.disabled = !slide;
  }

  public async handleSaveSlideInspector(): Promise<void> {
    if (!this.selectedDeck) {
      this.showToast('Create or select a presentation first.');
      return;
    }
    const slide = this.selectedDeck.slides?.[this.activeSlideIndex];
    if (!slide) {
      this.showToast('No slide selected.');
      return;
    }

    const saveBtn = getEl<HTMLButtonElement>('save-slide-inspector-btn');
    const type = getEl<HTMLSelectElement>('inspector-slide-type')?.value || slide.type;
    const title = getEl<HTMLInputElement>('inspector-slide-title')?.value ?? '';
    const lede = getEl<HTMLInputElement>('inspector-slide-lede')?.value ?? '';
    const speakerNotes = getEl<HTMLInputElement>('inspector-slide-notes')?.value ?? '';

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
    }

    try {
      const res = await fetch(
        `/api/decks/${encodeURIComponent(this.selectedDeck.slug)}/slides/${this.activeSlideIndex}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, title, lede, speakerNotes })
        }
      );
      const data = (await res.json()) as { deck?: DeckSummary; error?: string };
      if (!res.ok || !data.deck) {
        this.showToast(data.error || 'Could not save slide');
        return;
      }

      this.selectedDeck = data.deck;
      await this.refreshBootstrap();
      this.showToast(`Saved Slide ${this.activeSlideIndex + 1}`);
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Slide';
      }
    }
  }

  public highlightActiveFilmstripPill(): void {
    document.querySelectorAll('[data-slide-jump]').forEach((btn) => {
      const idx = Number(btn.getAttribute('data-slide-jump'));
      btn.classList.toggle('active', idx === this.activeSlideIndex);
    });
  }

  public renderCheckReport(report: DeckCheckReportSummary): void {
    const badge = getEl<HTMLElement>('viewer-check-badge');
    const summaryBadge = getEl<HTMLElement>('check-summary-badge');
    const list = getEl<HTMLElement>('check-slides-list');

    if (badge) {
      badge.textContent = report.passed
        ? `✓ On-Brand (${report.slideCount} slides verified)`
        : `⚠ ${report.errorCount} Brand/Layout Issue(s)`;
      badge.className = `badge ${report.passed ? 'badge-pass' : 'badge-fail'}`;
    }
    if (summaryBadge) {
      summaryBadge.textContent = report.passed
        ? `All ${report.slideCount} slides passed`
        : `${report.errorCount} issue(s)`;
      summaryBadge.className = `badge ${report.passed ? 'badge-pass' : 'badge-fail'}`;
    }
    if (list) {
      list.innerHTML = (report.slides || [])
        .map(
          (s) => `
        <div class="activity-step" style="border-left-color:${s.passed ? 'var(--positive)' : 'var(--negative)'}">
          <span>Slide ${s.slideNumber}: ${s.title.slice(0, 56)}</span>
          <span class="badge ${s.passed ? 'badge-pass' : 'badge-fail'}">${s.passed ? 'Pass' : `${s.errorCount} err`}</span>
        </div>`
        )
        .join('');
    }
  }

  // --------------------------------------------------------------------------
  // BRAND KIT SETUP
  // --------------------------------------------------------------------------
  public setBrandWizardStep(stepNum: number): void {
    document.querySelectorAll('#brand-wizard-steps [data-wizard-step]').forEach((pill) => {
      const step = Number(pill.getAttribute('data-wizard-step'));
      pill.classList.toggle('done', step < stepNum);
      pill.classList.toggle('active', step === stepNum);
    });
  }

  private bindBrandSetupEvents(): void {
    getEl<HTMLInputElement>('new-brand-file')?.addEventListener('change', () => {
      this.setBrandWizardStep(2);
    });
    getEl<HTMLSelectElement>('new-brand-sample')?.addEventListener('change', () => {
      this.setBrandWizardStep(3);
    });
    getEl<HTMLInputElement>('new-brand-url')?.addEventListener('input', () => {
      this.setBrandWizardStep(1);
    });

    getEl<HTMLButtonElement>('crawl-brand-url-btn')?.addEventListener('click', async () => {
      const urlInput = getEl<HTMLInputElement>('new-brand-url');
      const guidelinesInput = getEl<HTMLTextAreaElement>('new-brand-guidelines');
      const crawlBtn = getEl<HTMLButtonElement>('crawl-brand-url-btn');
      const url = urlInput?.value?.trim() || '';
      const text = guidelinesInput?.value?.trim() || '';

      if (!url && !text) {
        this.showToast('Enter a website URL or brand notes/CSS text to extract.');
        return;
      }

      this.setBrandWizardStep(2);
      if (crawlBtn) {
        crawlBtn.disabled = true;
        crawlBtn.textContent = 'Extracting…';
      }

      try {
        const res = await fetch('/api/brands/crawl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, text })
        });
        const data = (await res.json()) as {
          error?: string;
          companyName?: string;
          suggestedColors?: Partial<BrandColorMap>;
          extractedHexes?: string[];
          detectedFonts?: string[];
          summary?: string;
        };
        if (!res.ok) {
          this.showToast(data.error || 'Could not extract brand signals');
          return;
        }

        const sc = data.suggestedColors || {};
        const hexes = data.extractedHexes || [];
        const fonts = data.detectedFonts || [];
        const parts: string[] = [];
        if (sc.primary) parts.push(`Primary ${sc.primary}`);
        if (sc.accent) parts.push(`Accent ${sc.accent}`);
        if (sc.surfaceDark) parts.push(`Dark ${sc.surfaceDark}`);
        if (sc.surfaceLight) parts.push(`Light ${sc.surfaceLight}`);
        if (hexes.length > 0) parts.push(`Palette: ${hexes.join(', ')}`);
        if (fonts.length > 0) parts.push(`Fonts: ${fonts.join(', ')}`);
        if (data.summary) parts.push(data.summary);

        if (guidelinesInput) {
          guidelinesInput.value = parts.join(' | ');
        }

        const nameInput = getEl<HTMLInputElement>('new-brand-name');
        if (nameInput && data.companyName && !nameInput.value.trim()) {
          nameInput.value = data.companyName;
        }

        this.setBrandWizardStep(3);
        this.showToast(`Extracted ${hexes.length} colours and ${fonts.length} fonts`);
      } finally {
        if (crawlBtn) {
          crawlBtn.disabled = false;
          crawlBtn.textContent = 'Auto-Extract from URL/Text';
        }
      }
    });

    getEl<HTMLButtonElement>('create-brand-btn')?.addEventListener('click', async () => {
      const name = getEl<HTMLInputElement>('new-brand-name')?.value?.trim() || 'CustomBrand';
      const fileInput = getEl<HTMLInputElement>('new-brand-file');
      const sampleSel = getEl<HTMLSelectElement>('new-brand-sample');
      const guidelines = getEl<HTMLTextAreaElement>('new-brand-guidelines')?.value || '';

      const fd = new FormData();
      fd.append('createNew', 'true');
      fd.append('name', name);
      fd.append('companyName', name);
      fd.append('guidelinesText', guidelines);

      if (fileInput?.files?.[0]) {
        fd.append('file', fileInput.files[0]);
      } else if (sampleSel?.value) {
        fd.append('sampleTemplate', sampleSel.value);
      }

      const res = await fetch('/api/brands/extract', { method: 'POST', body: fd });
      const data = (await res.json()) as {
        brandKit?: BrandKitSummary;
        error?: string;
        code?: string;
      };
      if (!res.ok || !data.brandKit) {
        if (res.status === 403 || data.code === 'BRAND_QUOTA_EXCEEDED') {
          this.openQuotaUpgradeModal(data.error || 'Brand Kit quota reached.');
        }
        this.showToast(data.error || 'Could not create Brand Kit');
        return;
      }
      this.setBrandWizardStep(1);
      await this.refreshBootstrap();
      this.refreshBrandGalleryIframe();
      this.showToast(`Created Brand Kit "${data.brandKit.name}"`);
    });

    getEl<HTMLButtonElement>('save-brand-version-btn')?.addEventListener('click', async () => {
      if (!this.activeBrandKit) return;
      const colors: BrandColorMap = { ...this.activeBrandKit.colors };
      document.querySelectorAll('[data-color-role]').forEach((inp) => {
        const inputEl = inp as HTMLInputElement;
        const role = inputEl.getAttribute('data-color-role');
        if (role) colors[role] = inputEl.value;
      });

      const titleFamily =
        getEl<HTMLInputElement>('brand-font-title')?.value ||
        this.activeBrandKit.fonts.title.family;
      const fallbackFamily =
        getEl<HTMLSelectElement>('brand-font-fallback')?.value || 'Instrument Serif';
      const logoPlacement =
        getEl<HTMLSelectElement>('brand-logo-placement')?.value || 'top-right';
      const classification =
        getEl<HTMLSelectElement>('brand-classification')?.value || 'Internal';

      const res = await fetch(`/api/brands/${encodeURIComponent(this.activeBrandKit.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: {
            colors,
            fonts: {
              title: {
                ...this.activeBrandKit.fonts.title,
                family: titleFamily,
                fallback: fallbackFamily
              }
            },
            logo: {
              ...this.activeBrandKit.logo,
              placement: logoPlacement
            },
            frame: {
              ...this.activeBrandKit.frame,
              classification
            }
          }
        })
      });

      const data = (await res.json()) as { brandKit?: BrandKitSummary; error?: string };
      if (!res.ok || !data.brandKit) {
        this.showToast(data.error || 'Failed to update Brand Kit');
        return;
      }
      await this.refreshBootstrap();
      this.refreshBrandGalleryIframe();
      this.showToast(`Saved ${data.brandKit.name} (v${data.brandKit.version})`);
    });

    getEl<HTMLButtonElement>('upload-font-btn')?.addEventListener('click', async () => {
      const inp = getEl<HTMLInputElement>('upload-font-input');
      if (!inp?.files?.[0]) {
        this.showToast('Choose a font file (.woff2, .ttf, .otf) first.');
        return;
      }
      const fd = new FormData();
      fd.append('file', inp.files[0]);
      const res = await fetch('/api/brands/fonts', { method: 'POST', body: fd });
      const data = (await res.json()) as { notice?: string; error?: string };
      if (!res.ok) {
        this.showToast(data.error || 'Font upload failed');
        return;
      }
      this.showToast(data.notice || 'Font uploaded');
    });

    getEl<HTMLButtonElement>('run-gallery-check-btn')?.addEventListener('click', async () => {
      const res = await fetch('/api/gallery/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandKitId: this.activeBrandKit?.id })
      });
      const report = (await res.json()) as DeckCheckReportSummary;
      this.showToast(report.humanSummary);
    });
  }

  public refreshBrandGalleryIframe(): void {
    const iframe = getEl<HTMLIFrameElement>('brand-gallery-iframe');
    if (iframe && this.activeBrandKit) {
      iframe.src = `/api/gallery/preview?brandKitId=${encodeURIComponent(this.activeBrandKit.id)}&t=${Date.now()}`;
    }
  }

  public renderBrandSetupSurface(): void {
    const strip = getEl<HTMLElement>('brand-profiles-strip');
    if (strip) {
      strip.innerHTML = this.brandKits
        .map((b) => {
          const c = b.latest?.colors || {};
          const isCurrent = b.id === this.activeBrandKit?.id;
          return `
          <div class="brand-profile-card ${isCurrent ? 'active' : ''}" data-pick-brand="${b.id}">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong style="font-size:15px;">${b.name}</strong>
              <span class="badge ${isCurrent ? 'badge-pass' : ''}">v${b.currentVersion ?? b.version}</span>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              <span style="width:22px;height:22px;border-radius:6px;background:${c.surfaceDark || '#0F172A'};border:1px solid rgba(0,0,0,0.1);"></span>
              <span style="width:22px;height:22px;border-radius:6px;background:${c.primary || '#1E293B'};border:1px solid rgba(0,0,0,0.1);"></span>
              <span style="width:22px;height:22px;border-radius:6px;background:${c.accent || '#C84B31'};border:1px solid rgba(0,0,0,0.1);"></span>
              <span style="width:22px;height:22px;border-radius:6px;background:${c.surfaceLight || '#FAF8F5'};border:1px solid rgba(0,0,0,0.15);"></span>
              <span style="margin-left:auto;font-size:12px;color:var(--text-secondary);">${b.latest?.fonts?.title?.family || 'Serif'}</span>
            </div>
          </div>`;
        })
        .join('');

      strip.querySelectorAll('[data-pick-brand]').forEach((card) => {
        card.addEventListener('click', () => {
          const id = card.getAttribute('data-pick-brand');
          if (id) void this.selectBrandKit(id);
        });
      });
    }

    const sampleSel = getEl<HTMLSelectElement>('new-brand-sample');
    if (sampleSel) {
      sampleSel.innerHTML = this.sampleTemplates
        .map((f) => `<option value="${f}">${f}</option>`)
        .join('');
    }

    const kit = this.activeBrandKit;
    if (!kit) {
      const editorTitle = getEl<HTMLElement>('active-brand-editor-title');
      const versionBadge = getEl<HTMLElement>('active-brand-version-badge');
      if (editorTitle) editorTitle.textContent = 'Active Brand CVI';
      if (versionBadge) versionBadge.textContent = 'v0';
      return;
    }

    const editorTitle = getEl<HTMLElement>('active-brand-editor-title');
    const versionBadge = getEl<HTMLElement>('active-brand-version-badge');
    if (editorTitle) editorTitle.textContent = kit.name;
    if (versionBadge) versionBadge.textContent = `Version ${kit.version}`;

    const roles: Array<{ key: keyof BrandColorMap; label: string }> = [
      { key: 'primary', label: 'Primary' },
      { key: 'secondary', label: 'Secondary' },
      { key: 'accent', label: 'Accent' },
      { key: 'surfaceLight', label: 'Light Surface' },
      { key: 'surfaceAlt', label: 'Alt Surface' },
      { key: 'surfaceDark', label: 'Dark Surface' }
    ];

    const swatchesEl = getEl<HTMLElement>('brand-color-swatches');
    if (swatchesEl) {
      swatchesEl.innerHTML = roles
        .map(
          (r) => `
        <div class="swatch-box">
          <input type="color" class="swatch-color-input" data-color-role="${String(r.key)}" value="${kit.colors[r.key] || '#0F172A'}" />
          <div>
            <div style="font-size:12px;font-weight:600;">${r.label}</div>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${kit.colors[r.key]}</div>
          </div>
        </div>`
        )
        .join('');
    }

    const titleFontEl = getEl<HTMLInputElement>('brand-font-title');
    const fallbackFontEl = getEl<HTMLSelectElement>('brand-font-fallback');
    const logoPlaceEl = getEl<HTMLSelectElement>('brand-logo-placement');
    const classEl = getEl<HTMLSelectElement>('brand-classification');
    if (titleFontEl) titleFontEl.value = kit.fonts?.title?.family || 'Instrument Serif';
    if (fallbackFontEl) fallbackFontEl.value = kit.fonts?.title?.fallback || 'Instrument Serif';
    if (logoPlaceEl) logoPlaceEl.value = kit.logo?.placement || 'top-right';
    if (classEl) classEl.value = kit.frame?.classification || 'Internal';

    const warnBox = getEl<HTMLElement>('brand-font-warning-box');
    const missingFont = Object.values(kit.fonts || {}).find((f) => f.missingFontFile);
    if (warnBox) {
      if (missingFont) {
        warnBox.style.display = 'block';
        warnBox.textContent = `${missingFont.warning || ''} (Fallback: ${missingFont.fallback})`;
      } else {
        warnBox.style.display = 'none';
      }
    }

    const contrastTbody = getEl<HTMLElement>('brand-contrast-tbody');
    const contrastBadge = getEl<HTMLElement>('brand-contrast-badge');
    if (contrastBadge && kit.contrastReport) {
      contrastBadge.textContent = kit.contrastReport.passed
        ? 'WCAG AA Verified'
        : 'Contrast Warning';
      contrastBadge.className = `badge ${kit.contrastReport.passed ? 'badge-pass' : 'badge-warn'}`;
    }
    if (contrastTbody && kit.contrastReport) {
      contrastTbody.innerHTML = (kit.contrastReport.checks || [])
        .map(
          (c) => `
        <tr>
          <td>${c.label}</td>
          <td style="font-family:var(--font-mono);font-size:12px;">${c.fg} / ${c.bg}</td>
          <td style="font-weight:600;">${c.ratio}:1</td>
          <td><span class="badge ${c.passed ? 'badge-pass' : 'badge-fail'}">${c.passed ? 'Pass' : 'Low'}</span></td>
        </tr>`
        )
        .join('');
    }

    const geomTbody = getEl<HTMLElement>('brand-geometry-tbody');
    if (geomTbody && kit.geometry) {
      const inMap = kit.geometry.placeholdersIn || {};
      const pxMap = kit.geometry.placeholdersPx || {};
      geomTbody.innerHTML = Object.keys(inMap)
        .map((k) => {
          const bIn = inMap[k];
          const bPx = pxMap[k] || { x: 0, y: 0, w: 0, h: 0 };
          return `
          <tr>
            <td style="font-weight:600;text-transform:capitalize;">${k}</td>
            <td style="font-family:var(--font-mono);font-size:12px;">${bIn.xIn}", ${bIn.yIn}" (${bIn.wIn}"×${bIn.hIn}")</td>
            <td style="font-family:var(--font-mono);font-size:12px;">${bPx.x}, ${bPx.y} (${bPx.w}×${bPx.h}px)</td>
          </tr>`;
        })
        .join('');
    }
  }

  // --------------------------------------------------------------------------
  // LIBRARY SURFACE
  // --------------------------------------------------------------------------
  private bindLibraryEvents(): void {
    getEl<HTMLInputElement>('library-search-input')?.addEventListener('input', () => {
      this.renderLibrarySurface();
    });
    getEl<HTMLButtonElement>('gallery-fullscreen-btn')?.addEventListener('click', () => {
      window.open('/api/gallery/preview', '_blank');
    });
  }

  public renderLibrarySurface(): void {
    const grid = getEl<HTMLElement>('library-deck-grid');
    if (!grid) return;
    const query = (getEl<HTMLInputElement>('library-search-input')?.value || '')
      .toLowerCase()
      .trim();

    const filtered = this.decks.filter((d) => {
      if (!query) return true;
      return (
        d.title?.toLowerCase().includes(query) ||
        d.slug?.toLowerCase().includes(query) ||
        d.brief?.audience?.toLowerCase().includes(query)
      );
    });

    grid.innerHTML = filtered
      .map(
        (d) => `
      <article class="deck-card">
        <div class="deck-card-thumb">
          <iframe src="/api/decks/${encodeURIComponent(d.slug)}/view?mode=thumbnail" loading="lazy" title="${d.title}"></iframe>
        </div>
        <div class="deck-card-body">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-size:12px;font-weight:600;color:var(--text-secondary);">${d.brandKitId.replace('brand-', '')} · v${d.version || 1}</span>
            <span class="badge ${d.lastCheckReport?.passed !== false ? 'badge-pass' : 'badge-fail'}">${
          d.lastCheckReport?.passed !== false ? '✓ Verified' : 'Issues'
        }</span>
          </div>
          <h3 style="font-family:var(--font-display);font-size:18px;font-weight:600;">${d.title}</h3>
          <div style="font-size:13px;color:var(--text-secondary);">
            ${d.slides?.length || 0} slides · ${d.brief?.audience || 'management'} audience
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;">
            <button type="button" class="btn btn-sm btn-primary" data-lib-open="${d.slug}">Edit in Studio</button>
            <a class="btn btn-sm" href="/api/decks/${encodeURIComponent(d.slug)}/view" target="_blank">Present</a>
            <a class="btn btn-sm" href="/api/decks/${encodeURIComponent(d.slug)}/view?presenter=1" target="_blank">Presenter</a>
            <a class="btn btn-sm" href="/api/decks/${encodeURIComponent(d.slug)}/export/zip" download>ZIP</a>
            <a class="btn btn-sm" href="/api/decks/${encodeURIComponent(d.slug)}/export/pdf" download>PDF</a>
          </div>
        </div>
      </article>`
      )
      .join('');

    grid.querySelectorAll('[data-lib-open]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const slug = btn.getAttribute('data-lib-open');
        const found = this.decks.find((d) => d.slug === slug);
        if (found) {
          this.selectedDeck = found;
          this.activeSlideIndex = 0;
          this.renderSelectedDeckInViewer();
          this.switchView('studio');
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // SAAS PLANS, QUOTAS & SETTINGS
  // --------------------------------------------------------------------------
  private bindSaasQuotaEvents(): void {
    getEl<HTMLButtonElement>('save-quotas-btn')?.addEventListener('click', async () => {
      const planCatalog = {
        starter: {
          maxBrands: Number(getEl<HTMLInputElement>('q-starter-brands')?.value || 2),
          dailyDeckLimit: Number(getEl<HTMLInputElement>('q-starter-decks')?.value || 4)
        },
        pro: {
          maxBrands: Number(getEl<HTMLInputElement>('q-pro-brands')?.value || 4),
          dailyDeckLimit: Number(getEl<HTMLInputElement>('q-pro-decks')?.value || 20)
        },
        enterprise: {
          maxBrands: Number(getEl<HTMLInputElement>('q-ent-brands')?.value || 16),
          dailyDeckLimit: Number(getEl<HTMLInputElement>('q-ent-decks')?.value || 100)
        }
      };

      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCatalog })
      });
      if (res.ok) {
        await this.refreshBootstrap();
        this.showToast('Updated plan quota limits');
      }
    });

    getEl<HTMLButtonElement>('reset-today-usage-btn')?.addEventListener('click', async () => {
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetTodayUsage: true })
      });
      if (res.ok) {
        await this.refreshBootstrap();
        this.showToast("Reset today's presentation counter to 0");
      }
    });

    getEl<HTMLButtonElement>('save-ent-settings-btn')?.addEventListener('click', async () => {
      const provider =
        getEl<HTMLSelectElement>('ent-llm-provider')?.value || 'local-structured';
      const role = getEl<HTMLSelectElement>('ent-role-select')?.value || 'brand_admin';
      const internalNetworkOnly = Boolean(getEl<HTMLInputElement>('ent-internal-net')?.checked);
      const forbidExternalMedia = Boolean(
        getEl<HTMLInputElement>('ent-forbid-media')?.checked
      );

      const res = await fetch('/api/org/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          llmConfig: {
            provider,
            internalNetworkOnly,
            forbidExternalMedia
          }
        })
      });
      if (res.ok) {
        await this.refreshBootstrap();
        this.showToast('Saved workspace AI & privacy settings');
      }
    });
  }

  private bindQuotaModalEvents(): void {
    const modal = getEl<HTMLElement>('quota-upgrade-modal');
    if (!modal) return;

    getEl<HTMLButtonElement>('close-quota-modal-btn')?.addEventListener('click', () => {
      this.closeQuotaUpgradeModal();
    });
    getEl<HTMLButtonElement>('dismiss-quota-modal-btn')?.addEventListener('click', () => {
      this.closeQuotaUpgradeModal();
    });
    modal.addEventListener('click', (e: MouseEvent) => {
      if (e.target === modal) this.closeQuotaUpgradeModal();
    });
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !modal.hidden) this.closeQuotaUpgradeModal();
    });

    modal.querySelectorAll('[data-upgrade-tier]').forEach((node) => {
      const btn = node as HTMLButtonElement;
      btn.addEventListener('click', async () => {
        const tier = btn.getAttribute('data-upgrade-tier') || '';
        btn.disabled = true;
        try {
          const res = await fetch('/api/subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tier })
          });
          if (res.ok) {
            await this.refreshBootstrap();
            this.closeQuotaUpgradeModal();
            this.showToast(`Switched to ${tier.toUpperCase()} plan`);
          } else {
            this.showToast('Could not switch subscription tier');
          }
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  public openQuotaUpgradeModal(message?: string): void {
    const modal = getEl<HTMLElement>('quota-upgrade-modal');
    const msgEl = getEl<HTMLElement>('quota-upgrade-message');
    if (msgEl && message) {
      msgEl.textContent = message;
    }
    if (modal) {
      modal.hidden = false;
    }
  }

  public closeQuotaUpgradeModal(): void {
    const modal = getEl<HTMLElement>('quota-upgrade-modal');
    if (modal) {
      modal.hidden = true;
    }
  }

  public renderSaasSurface(): void {
    if (!this.quota) return;
    const activeTierBadge = getEl<HTMLElement>('saas-active-tier-badge');
    if (activeTierBadge) {
      activeTierBadge.textContent = `${this.quota.tierName} Plan Active`;
    }

    const catalog = this.quota.planCatalog || {};
    if (catalog.starter) {
      const sb = getEl<HTMLInputElement>('q-starter-brands');
      const sd = getEl<HTMLInputElement>('q-starter-decks');
      if (sb) sb.value = String(catalog.starter.maxBrands);
      if (sd) sd.value = String(catalog.starter.dailyDeckLimit);
    }
    if (catalog.pro) {
      const pb = getEl<HTMLInputElement>('q-pro-brands');
      const pd = getEl<HTMLInputElement>('q-pro-decks');
      if (pb) pb.value = String(catalog.pro.maxBrands);
      if (pd) pd.value = String(catalog.pro.dailyDeckLimit);
    }
    if (catalog.enterprise) {
      const eb = getEl<HTMLInputElement>('q-ent-brands');
      const ed = getEl<HTMLInputElement>('q-ent-decks');
      if (eb) eb.value = String(catalog.enterprise.maxBrands);
      if (ed) ed.value = String(catalog.enterprise.dailyDeckLimit);
    }

    const planCards = getEl<HTMLElement>('plan-cards-container');
    if (planCards) {
      planCards.innerHTML = Object.values(catalog)
        .map((p) => {
          const isCurrent = p.id === this.quota?.tier;
          return `
          <div class="brand-profile-card ${isCurrent ? 'active' : ''}" style="cursor:default;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong style="font-family:var(--font-display);font-size:18px;">${p.name}</strong>
              <span style="font-weight:700;color:var(--accent);">$${p.priceMonthlyUsd}/mo</span>
            </div>
            <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;">
              • Up to <strong>${p.maxBrands} Brand Kits</strong><br/>
              • <strong>${p.dailyDeckLimit} presentations</strong> / day
            </div>
            <button type="button" class="btn btn-sm ${isCurrent ? 'btn-primary' : ''}" data-select-tier="${p.id}" style="margin-top:4px;">
              ${isCurrent ? 'Current Plan' : `Switch to ${p.name}`}
            </button>
          </div>`;
        })
        .join('');

      planCards.querySelectorAll('[data-select-tier]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const tier = btn.getAttribute('data-select-tier') || '';
          await fetch('/api/subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tier })
          });
          await this.refreshBootstrap();
          this.showToast(`Switched to ${tier.toUpperCase()} plan`);
        });
      });
    }

    const stats = this.quota.usageStats || {};
    const totalDecks = (stats.totalDecksCreated || 0) + (stats.totalDecksEdited || 0);
    const totalCost = Number(stats.totalEstimatedCostUsd || 0);
    const avgCost = totalDecks > 0 ? (totalCost / totalDecks).toFixed(3) : '0.014';

    const costSummaryEl = getEl<HTMLElement>('cost-summary-cards');
    if (costSummaryEl) {
      costSummaryEl.innerHTML = `
        <div class="swatch-box">
          <div>
            <div style="font-size:11.5px;color:var(--text-secondary);">Brands Used</div>
            <div style="font-family:var(--font-display);font-size:22px;font-weight:600;">${this.quota.usedBrands} / ${this.quota.maxBrands}</div>
          </div>
        </div>
        <div class="swatch-box">
          <div>
            <div style="font-size:11.5px;color:var(--text-secondary);">Decks Built Today</div>
            <div style="font-family:var(--font-display);font-size:22px;font-weight:600;">${this.quota.usedDecksToday} / ${this.quota.dailyDeckLimit}</div>
          </div>
        </div>
        <div class="swatch-box">
          <div>
            <div style="font-size:11.5px;color:var(--text-secondary);">Avg Cost / Deck</div>
            <div style="font-family:var(--font-display);font-size:22px;font-weight:600;color:var(--positive);">$${avgCost}</div>
          </div>
        </div>
      `;
    }

    const costTbody = getEl<HTMLElement>('cost-history-tbody');
    if (costTbody) {
      const history = stats.costHistory || [];
      costTbody.innerHTML =
        history.length > 0
          ? history
              .slice(0, 6)
              .map(
                (h) => `
              <tr>
                <td style="font-weight:600;">${h.deckSlug}</td>
                <td>${h.operation === 'create_deck' ? 'Created' : 'Refined'}</td>
                <td style="font-family:var(--font-mono);font-size:12px;">${h.promptTokens + h.completionTokens} tok</td>
                <td>${(h.renderDurationMs / 1000).toFixed(1)}s</td>
                <td style="font-weight:600;color:var(--positive);">$${h.totalCostUsd}</td>
              </tr>`
              )
              .join('')
          : `<tr><td colspan="5" style="color:var(--text-muted);">No presentations built yet.</td></tr>`;
    }

    if (this.org) {
      const providerEl = getEl<HTMLSelectElement>('ent-llm-provider');
      const roleEl = getEl<HTMLSelectElement>('ent-role-select');
      const netEl = getEl<HTMLInputElement>('ent-internal-net');
      const mediaEl = getEl<HTMLInputElement>('ent-forbid-media');
      if (providerEl) providerEl.value = this.org.llmConfig?.provider || 'local-structured';
      if (roleEl) roleEl.value = this.org.role || 'brand_admin';
      if (netEl) netEl.checked = Boolean(this.org.llmConfig?.internalNetworkOnly);
      if (mediaEl) mediaEl.checked = Boolean(this.org.llmConfig?.forbidExternalMedia);
    }

    const auditList = getEl<HTMLElement>('audit-log-list');
    if (auditList) {
      auditList.innerHTML = (this.auditLog || [])
        .map(
          (a) => `
        <div class="activity-step">
          <span><strong>${a.action}</strong> · ${a.target} — ${a.detail}</span>
          <span style="color:var(--text-muted);font-size:11.5px;">${a.timestamp.slice(11, 19)}</span>
        </div>`
        )
        .join('');
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__app = new DeckStudioApp();
});
