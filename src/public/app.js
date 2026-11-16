/* ==========================================================================
   Deck Studio — Browser Application Controller
   Connects Studio, Brand Setup, Library, Gallery & SaaS Quota/Cost Lab to API
   ========================================================================== */

const STARTER_BRIEFS = {
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
      'How the Zero-Trust Brand Deck Engine works: 1) Extract design tokens and inch geometry from an Office .pptx template into a versioned Brand Kit like DanishCVI. 2) Map factual brief statements and unaltered media evidence onto 15 brand-tokenised components. 3) Verify 100% of slides in headless Chromium for WCAG AA contrast and zero stage overflow.',
    audience: 'product',
    lengthMinutes: 10,
    endsWithLiveDemo: true,
    slug: 'zero-trust-deck-engine'
  }
};

const DRAFT_STORAGE_KEY = 'deck_studio_draft_v1';

class DeckStudioApp {
  constructor() {
    this.org = null;
    this.quota = null;
    this.brandKits = [];
    this.activeBrandKit = null;
    this.decks = [];
    this.selectedDeck = null;
    this.mediaTray = [];
    this.auditLog = [];
    this.sampleTemplates = [];
    this.currentView = 'studio';
    this.runningJobId = null;

    this.init();
  }

  async init() {
    this.bindNavigation();
    this.bindStudioEvents();
    this.bindBrandSetupEvents();
    this.bindLibraryEvents();
    this.bindSaasQuotaEvents();
    this.restoreDraftFromStorage();
    await this.refreshBootstrap();
  }

  showToast(message) {
    const el = document.getElementById('toast-banner');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
  }

  slugify(text) {
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

  async refreshBootstrap() {
    const res = await fetch('/api/bootstrap');
    const data = await res.json();
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
      const updated = this.decks.find((d) => d.slug === this.selectedDeck.slug);
      if (updated) this.selectedDeck = updated;
    }

    this.renderHeaderAndQuota();
    this.renderBrandSelectors();
    this.renderBrandSetupSurface();
    this.renderLibrarySurface();
    this.renderSaasSurface();
    this.renderSelectedDeckInViewer();
  }

  bindNavigation() {
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.getAttribute('data-view');
        this.switchView(view);
      });
    });

    document.getElementById('header-quota-pill')?.addEventListener('click', () => {
      this.switchView('saas');
    });

    document.getElementById('header-brand-select')?.addEventListener('change', async (e) => {
      await this.selectBrandKit(e.target.value);
    });
  }

  switchView(viewName) {
    this.currentView = viewName;
    document.querySelectorAll('.nav-tab').forEach((t) => {
      t.classList.toggle('active', t.getAttribute('data-view') === viewName);
    });
    document.querySelectorAll('.view-panel').forEach((p) => {
      p.classList.toggle('active', p.id === `view-${viewName}`);
    });

    if (viewName === 'gallery') {
      const iframe = document.getElementById('full-gallery-iframe');
      if (iframe && this.activeBrandKit) {
        iframe.src = `/api/gallery/preview?brandKitId=${encodeURIComponent(this.activeBrandKit.id)}&t=${Date.now()}`;
      }
    } else if (viewName === 'brand') {
      this.refreshBrandGalleryIframe();
    }
  }

  async selectBrandKit(brandKitId) {
    const res = await fetch('/api/brands/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandKitId })
    });
    if (res.ok) {
      await this.refreshBootstrap();
      this.refreshBrandGalleryIframe();
      this.showToast(`Switched active Brand Kit to "${this.activeBrandKit?.name}" (v${this.activeBrandKit?.version})`);
    }
  }

  renderHeaderAndQuota() {
    if (!this.quota) return;
    const pillText = document.getElementById('header-quota-text');
    if (pillText) {
      pillText.textContent = `${this.quota.tierName.toUpperCase()} · ${this.quota.usedBrands}/${this.quota.maxBrands} Brands · ${this.quota.usedDecksToday}/${this.quota.dailyDeckLimit} Decks Today`;
    }
    const brandQuotaBadge = document.getElementById('brand-quota-badge');
    if (brandQuotaBadge) {
      brandQuotaBadge.textContent = `${this.quota.usedBrands} / ${this.quota.maxBrands} Brands (${this.quota.tierName})`;
      brandQuotaBadge.className = `badge ${this.quota.canCreateBrand ? 'badge-pass' : 'badge-warn'}`;
    }
  }

  renderBrandSelectors() {
    const headerSel = document.getElementById('header-brand-select');
    const studioSel = document.getElementById('studio-brand-select');
    const studioBadge = document.getElementById('studio-brand-badge');

    const optionsHtml = this.brandKits
      .map(
        (k) =>
          `<option value="${k.id}" ${k.id === this.activeBrandKit?.id ? 'selected' : ''}>${k.name} (v${k.currentVersion})</option>`
      )
      .join('');

    if (headerSel) headerSel.innerHTML = optionsHtml;
    if (studioSel) studioSel.innerHTML = optionsHtml;
    if (studioBadge && this.activeBrandKit) {
      studioBadge.textContent = `${this.activeBrandKit.name} v${this.activeBrandKit.version}`;
    }
  }

  // --------------------------------------------------------------------------
  // STUDIO SURFACE: Brief, Draft Autosave, Media Tray, Build & Refine
  // --------------------------------------------------------------------------
  bindStudioEvents() {
    const topicEl = document.getElementById('brief-topic');
    const slugEl = document.getElementById('brief-slug');
    const audEl = document.getElementById('brief-audience');
    const lenEl = document.getElementById('brief-length');
    const demoEl = document.getElementById('brief-demo-toggle');

    const saveDraft = () => {
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
        // ignore
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

    document.getElementById('studio-brand-select')?.addEventListener('change', async (e) => {
      await this.selectBrandKit(e.target.value);
    });

    // Starter template chips
    document.querySelectorAll('[data-starter]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const key = chip.getAttribute('data-starter');
        const preset = STARTER_BRIEFS[key];
        if (!preset) return;
        topicEl.value = preset.topic;
        audEl.value = preset.audience;
        lenEl.value = preset.lengthMinutes;
        demoEl.checked = preset.endsWithLiveDemo;
        slugEl.value = preset.slug;
        saveDraft();
      });
    });

    // Load Full Sample Brief + 2 Screenshots + 1 Video
    document.getElementById('load-full-sample-btn')?.addEventListener('click', async () => {
      const preset = STARTER_BRIEFS.postmortem;
      topicEl.value = preset.topic;
      audEl.value = preset.audience;
      lenEl.value = preset.lengthMinutes;
      demoEl.checked = preset.endsWithLiveDemo;
      slugEl.value = preset.slug;
      saveDraft();

      const res = await fetch('/api/media/samples');
      const data = await res.json();
      this.mediaTray = data.media || [];
      this.renderMediaTray();
      this.showToast('Loaded March Incident Brief + 2 telemetry screenshots + 1 failover video.');
    });

    // Media dropzone, file picker & clipboard paste (⌘V)
    const dropzone = document.getElementById('media-dropzone');
    const fileInput = document.getElementById('media-file-input');

    dropzone?.addEventListener('click', () => fileInput?.click());
    dropzone?.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
    dropzone?.addEventListener('drop', async (e) => {
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

    window.addEventListener('paste', async (e) => {
      if (this.currentView !== 'studio') return;
      const items = Array.from(e.clipboardData?.items || []);
      const fileItems = items.filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter(Boolean);
      if (fileItems.length > 0) {
        await this.uploadFilesToMediaTray(fileItems);
      }
    });

    // Build Deck Button
    document.getElementById('build-deck-btn')?.addEventListener('click', () => this.handleBuildDeck());

    // Quick Refine Chips & Apply Refine Button
    document.querySelectorAll('[data-refine]').forEach((chip) => {
      chip.addEventListener('click', () => {
        const input = document.getElementById('refine-prompt-input');
        if (input) {
          input.value = chip.getAttribute('data-refine');
          this.handleRefineSelectedDeck();
        }
      });
    });

    document.getElementById('apply-refine-btn')?.addEventListener('click', () => this.handleRefineSelectedDeck());
    document.getElementById('undo-deck-btn')?.addEventListener('click', () => this.handleUndoDeck());

    // Viewer Controls
    document.getElementById('viewer-prev-btn')?.addEventListener('click', () => {
      const iframe = document.getElementById('studio-preview-iframe');
      iframe?.contentWindow?.__deckEngine?.prevStep();
    });
    document.getElementById('viewer-next-btn')?.addEventListener('click', () => {
      const iframe = document.getElementById('studio-preview-iframe');
      iframe?.contentWindow?.__deckEngine?.nextStep();
    });
    document.getElementById('viewer-present-btn')?.addEventListener('click', () => {
      if (!this.selectedDeck) return;
      window.open(`/api/decks/${encodeURIComponent(this.selectedDeck.slug)}/view`, '_blank');
    });
    document.getElementById('viewer-presenter-btn')?.addEventListener('click', () => {
      if (!this.selectedDeck) return;
      window.open(`/api/decks/${encodeURIComponent(this.selectedDeck.slug)}/view?presenter=1`, '_blank', 'width=1280,height=820');
    });
    document.getElementById('viewer-check-btn')?.addEventListener('click', () => this.handleRunCheckOnSelectedDeck());
  }

  restoreDraftFromStorage() {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      const preset = raw ? JSON.parse(raw) : STARTER_BRIEFS.postmortem;
      document.getElementById('brief-topic').value = preset.topic || STARTER_BRIEFS.postmortem.topic;
      document.getElementById('brief-slug').value = preset.slug || STARTER_BRIEFS.postmortem.slug;
      document.getElementById('brief-audience').value = preset.audience || 'management';
      document.getElementById('brief-length').value = preset.lengthMinutes || 10;
      document.getElementById('brief-demo-toggle').checked = preset.endsWithLiveDemo ?? true;
    } catch {
      // ignore
    }
  }

  async uploadFilesToMediaTray(files) {
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('caption', `Visual evidence: ${file.name}`);
      const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        this.showToast(`Upload rejected: ${data.error}`);
        continue;
      }
      this.mediaTray.push(data);
    }
    this.renderMediaTray();
  }

  renderMediaTray() {
    const listEl = document.getElementById('media-tray-list');
    const badgeEl = document.getElementById('media-count-badge');
    if (badgeEl) badgeEl.textContent = `${this.mediaTray.length} item(s)`;
    if (!listEl) return;

    listEl.innerHTML = this.mediaTray
      .map(
        (item, idx) => `
      <div class="media-item" data-media-idx="${idx}">
        ${
          item.category === 'image'
            ? `<img class="media-thumb" src="${item.previewUrl}" alt="${item.filename}" />`
            : `<div class="media-thumb">VIDEO<br/>MP4</div>`
        }
        <div style="display:flex;flex-direction:column;gap:4px;">
          <div style="font-family:var(--ui-mono);font-size:11px;color:var(--ui-ink);">${item.filename}</div>
          <input type="text" class="ui-input" data-caption-idx="${idx}" value="${(item.caption || '').replace(/"/g, '&quot;')}" placeholder="What should the audience see here?" style="padding:4px 8px;font-size:12px;" />
        </div>
        <button type="button" class="btn btn-sm btn-danger" data-remove-media="${idx}" aria-label="Remove media">✕</button>
      </div>`
      )
      .join('');

    listEl.querySelectorAll('[data-caption-idx]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const i = Number(inp.getAttribute('data-caption-idx'));
        if (this.mediaTray[i]) this.mediaTray[i].caption = inp.value;
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

  async handleBuildDeck() {
    const buildBtn = document.getElementById('build-deck-btn');
    const phaseBadge = document.getElementById('agent-phase-badge');
    const activityList = document.getElementById('agent-activity-list');

    const brief = {
      topic: document.getElementById('brief-topic')?.value || '',
      audience: document.getElementById('brief-audience')?.value || 'management',
      lengthMinutes: Number(document.getElementById('brief-length')?.value || 10),
      endsWithLiveDemo: Boolean(document.getElementById('brief-demo-toggle')?.checked),
      language: document.getElementById('brief-language')?.value || 'en',
      slug: document.getElementById('brief-slug')?.value || '',
      sourceUrl: document.getElementById('brief-source-url')?.value || ''
    };

    const brandKitId = document.getElementById('studio-brand-select')?.value || this.activeBrandKit?.id;

    buildBtn.disabled = true;
    buildBtn.textContent = '⏳ Agent Building & Checking…';
    if (phaseBadge) {
      phaseBadge.textContent = 'BUILDING & CHECKING…';
      phaseBadge.className = 'badge badge-warn';
    }
    if (activityList) {
      activityList.innerHTML = `<div class="activity-step"><span>Starting Story → Build → Check-and-Fix loop with Brand Kit "${brandKitId}"…</span><span>0.1s</span></div>`;
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

      const data = await res.json();
      if (!res.ok) {
        this.showToast(data.error || 'Build failed');
        if (phaseBadge) {
          phaseBadge.textContent = data.code || 'BLOCKED';
          phaseBadge.className = 'badge badge-fail';
        }
        return;
      }

      this.selectedDeck = data.deck;
      this.renderJobActivity(data.job);
      await this.refreshBootstrap();
      this.showToast(`Built "${data.deck.title}" (${data.deck.slides.length} slides) — Check passed: ${data.checkReport.passed}`);
    } finally {
      buildBtn.disabled = false;
      buildBtn.textContent = '▶ Build Brand-True Deck';
    }
  }

  async handleRefineSelectedDeck() {
    if (!this.selectedDeck) {
      this.showToast('Select or build a deck first.');
      return;
    }
    const promptInput = document.getElementById('refine-prompt-input');
    const prompt = promptInput?.value?.trim();
    if (!prompt) {
      this.showToast('Enter a refinement instruction (e.g. "make slide 4 simpler").');
      return;
    }

    const btn = document.getElementById('apply-refine-btn');
    btn.disabled = true;
    btn.textContent = 'Refining…';

    try {
      const res = await fetch(`/api/decks/${encodeURIComponent(this.selectedDeck.slug)}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      if (!res.ok) {
        this.showToast(data.error || 'Refinement failed');
        return;
      }
      this.selectedDeck = data.deck;
      this.renderJobActivity(data.job);
      await this.refreshBootstrap();
      this.showToast(`Refined "${data.deck.slug}" to v${data.deck.version} — All checks passed!`);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Refine';
    }
  }

  async handleUndoDeck() {
    if (!this.selectedDeck) return;
    const res = await fetch(`/api/decks/${encodeURIComponent(this.selectedDeck.slug)}/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const data = await res.json();
    if (!res.ok) {
      this.showToast(data.error || 'No previous version to revert to.');
      return;
    }
    this.selectedDeck = data.deck;
    await this.refreshBootstrap();
    this.showToast(`Reverted "${data.deck.slug}" to previous snapshot.`);
  }

  async handleRunCheckOnSelectedDeck() {
    if (!this.selectedDeck) return;
    const res = await fetch(`/api/decks/${encodeURIComponent(this.selectedDeck.slug)}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const report = await res.json();
    this.selectedDeck.lastCheckReport = report;
    this.renderCheckReport(report);
    this.showToast(report.humanSummary);
  }

  renderJobActivity(job) {
    const listEl = document.getElementById('agent-activity-list');
    const badgeEl = document.getElementById('agent-phase-badge');
    if (!listEl || !job) return;

    if (badgeEl) {
      badgeEl.textContent = `${job.phase.toUpperCase()} · ${(job.elapsedMs / 1000).toFixed(1)}s`;
      badgeEl.className = `badge ${job.status === 'completed' ? 'badge-pass' : 'badge-warn'}`;
    }

    listEl.innerHTML = (job.steps || [])
      .map(
        (s) => `
      <div class="activity-step">
        <span><strong>[${s.tool}]</strong> ${s.message}</span>
        <span>${s.phase}</span>
      </div>`
      )
      .join('');
  }

  renderSelectedDeckInViewer() {
    const deck = this.selectedDeck;
    const titleEl = document.getElementById('viewer-deck-title');
    const iframe = document.getElementById('studio-preview-iframe');
    const zipLink = document.getElementById('viewer-export-zip');
    const pdfLink = document.getElementById('viewer-export-pdf');

    if (!deck) {
      if (titleEl) titleEl.textContent = 'NO DECK SELECTED';
      return;
    }

    if (titleEl) {
      titleEl.textContent = `${deck.title.slice(0, 52)} (v${deck.version || 1} · ${deck.slides?.length || 0} slides)`;
    }
    if (iframe) {
      iframe.src = `/api/decks/${encodeURIComponent(deck.slug)}/view?t=${Date.now()}`;
    }
    if (zipLink) {
      zipLink.href = `/api/decks/${encodeURIComponent(deck.slug)}/export/zip`;
    }
    if (pdfLink) {
      pdfLink.href = `/api/decks/${encodeURIComponent(deck.slug)}/export/pdf`;
    }

    if (deck.lastCheckReport) {
      this.renderCheckReport(deck.lastCheckReport);
    }
  }

  renderCheckReport(report) {
    const badge = document.getElementById('viewer-check-badge');
    const summaryBadge = document.getElementById('check-summary-badge');
    const list = document.getElementById('check-slides-list');

    if (badge) {
      badge.textContent = report.passed ? `CHECK PASSED (${report.slideCount} SLIDES)` : `CHECK FAILED (${report.errorCount} ERRORS)`;
      badge.className = `badge ${report.passed ? 'badge-pass' : 'badge-fail'}`;
    }
    if (summaryBadge) {
      summaryBadge.textContent = `${report.errorCount} Error(s)`;
      summaryBadge.className = `badge ${report.passed ? 'badge-pass' : 'badge-fail'}`;
    }
    if (list) {
      list.innerHTML = (report.slides || [])
        .map(
          (s) => `
        <div class="activity-step" style="border-left-color:${s.passed ? 'var(--ui-positive)' : 'var(--ui-negative)'}">
          <span>${s.humanSummary}</span>
          <span class="badge ${s.passed ? 'badge-pass' : 'badge-fail'}">${s.passed ? 'PASS' : 'FAIL'}</span>
        </div>`
        )
        .join('');
    }
  }

  // --------------------------------------------------------------------------
  // BRAND SETUP SURFACE (DanishCVI, Office .pptx/.thmx Upload, WCAG & Geometry)
  // --------------------------------------------------------------------------
  bindBrandSetupEvents() {
    document.getElementById('create-brand-btn')?.addEventListener('click', async () => {
      const name = document.getElementById('new-brand-name')?.value?.trim() || 'CustomBrand';
      const fileInput = document.getElementById('new-brand-file');
      const sampleSel = document.getElementById('new-brand-sample');
      const guidelines = document.getElementById('new-brand-guidelines')?.value || '';

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
      const data = await res.json();
      if (!res.ok) {
        this.showToast(data.error || 'Could not create Brand Kit');
        return;
      }
      await this.refreshBootstrap();
      this.refreshBrandGalleryIframe();
      this.showToast(`Created Brand Kit "${data.brandKit.name}" (v${data.brandKit.version})!`);
    });

    document.getElementById('save-brand-version-btn')?.addEventListener('click', async () => {
      if (!this.activeBrandKit) return;
      const colors = { ...this.activeBrandKit.colors };
      document.querySelectorAll('[data-color-role]').forEach((inp) => {
        const role = inp.getAttribute('data-color-role');
        colors[role] = inp.value;
      });

      const titleFamily = document.getElementById('brand-font-title')?.value || this.activeBrandKit.fonts.title.family;
      const fallbackFamily = document.getElementById('brand-font-fallback')?.value || 'Instrument Serif';
      const logoPlacement = document.getElementById('brand-logo-placement')?.value || 'top-right';
      const classification = document.getElementById('brand-classification')?.value || 'Internal';

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

      const data = await res.json();
      if (!res.ok) {
        this.showToast(data.error || 'Failed to update Brand Kit');
        return;
      }
      await this.refreshBootstrap();
      this.refreshBrandGalleryIframe();
      this.showToast(`Saved "${data.brandKit.name}" v${data.brandKit.version} and updated referencing decks!`);
    });

    document.getElementById('upload-font-btn')?.addEventListener('click', async () => {
      const inp = document.getElementById('upload-font-input');
      if (!inp?.files?.[0]) {
        this.showToast('Pick a .woff2, .ttf, or .otf font file first.');
        return;
      }
      const fd = new FormData();
      fd.append('file', inp.files[0]);
      const res = await fetch('/api/brands/fonts', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        this.showToast(data.error || 'Font upload failed');
        return;
      }
      this.showToast(data.notice);
    });

    document.getElementById('run-gallery-check-btn')?.addEventListener('click', async () => {
      const res = await fetch('/api/gallery/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandKitId: this.activeBrandKit?.id })
      });
      const report = await res.json();
      this.showToast(report.humanSummary);
    });
  }

  refreshBrandGalleryIframe() {
    const iframe = document.getElementById('brand-gallery-iframe');
    if (iframe && this.activeBrandKit) {
      iframe.src = `/api/gallery/preview?brandKitId=${encodeURIComponent(this.activeBrandKit.id)}&t=${Date.now()}`;
    }
  }

  renderBrandSetupSurface() {
    const sampleSel = document.getElementById('new-brand-sample');
    if (sampleSel) {
      sampleSel.innerHTML = this.sampleTemplates
        .map((f) => `<option value="${f}">${f}</option>`)
        .join('');
    }

    const kit = this.activeBrandKit;
    if (!kit) return;

    document.getElementById('active-brand-editor-title').textContent = `EDIT ACTIVE BRAND: ${kit.name.toUpperCase()}`;
    document.getElementById('active-brand-version-badge').textContent = `v${kit.version}`;

    const roles = [
      { key: 'primary', label: 'Primary / Dominant' },
      { key: 'secondary', label: 'Secondary' },
      { key: 'accent', label: 'Action Accent' },
      { key: 'surfaceLight', label: 'Light Surface' },
      { key: 'surfaceAlt', label: 'Alt Light Surface' },
      { key: 'surfaceDark', label: 'Dark Surface' }
    ];

    const swatchesEl = document.getElementById('brand-color-swatches');
    if (swatchesEl) {
      swatchesEl.innerHTML = roles
        .map(
          (r) => `
        <div class="swatch-box">
          <input type="color" class="swatch-color-input" data-color-role="${r.key}" value="${kit.colors[r.key] || '#0F172A'}" />
          <div>
            <div style="font-size:11px;font-weight:700;">${r.label}</div>
            <div style="font-family:var(--ui-mono);font-size:11px;color:var(--ui-ink-muted);">${kit.colors[r.key]}</div>
          </div>
        </div>`
        )
        .join('');
    }

    document.getElementById('brand-font-title').value = kit.fonts?.title?.family || 'Instrument Serif';
    document.getElementById('brand-font-fallback').value = kit.fonts?.title?.fallback || 'Instrument Serif';
    document.getElementById('brand-logo-placement').value = kit.logo?.placement || 'top-right';
    document.getElementById('brand-classification').value = kit.frame?.classification || 'Internal';

    const warnBox = document.getElementById('brand-font-warning-box');
    const missingFont = Object.values(kit.fonts || {}).find((f) => f.missingFontFile);
    if (warnBox) {
      if (missingFont) {
        warnBox.style.display = 'block';
        warnBox.textContent = `⚠️ ${missingFont.warning} (Using explicit fallback: "${missingFont.fallback}")`;
      } else {
        warnBox.style.display = 'none';
      }
    }

    // Contrast table
    const contrastTbody = document.getElementById('brand-contrast-tbody');
    const contrastBadge = document.getElementById('brand-contrast-badge');
    if (contrastBadge && kit.contrastReport) {
      contrastBadge.textContent = kit.contrastReport.passed ? 'WCAG AA PASS' : 'CONTRAST WARNING';
      contrastBadge.className = `badge ${kit.contrastReport.passed ? 'badge-pass' : 'badge-warn'}`;
    }
    if (contrastTbody && kit.contrastReport) {
      contrastTbody.innerHTML = (kit.contrastReport.checks || [])
        .map(
          (c) => `
        <tr>
          <td>${c.label}</td>
          <td style="font-family:var(--ui-mono);">${c.fg} on ${c.bg}</td>
          <td style="font-family:var(--ui-mono);font-weight:700;">${c.ratio}:1</td>
          <td><span class="badge ${c.passed ? 'badge-pass' : 'badge-fail'}">${c.passed ? 'AA PASS' : 'LOW'}</span></td>
        </tr>`
        )
        .join('');
    }

    // Geometry table
    const geomTbody = document.getElementById('brand-geometry-tbody');
    if (geomTbody && kit.geometry) {
      const inMap = kit.geometry.placeholdersIn || {};
      const pxMap = kit.geometry.placeholdersPx || {};
      geomTbody.innerHTML = Object.keys(inMap)
        .map((k) => {
          const bIn = inMap[k];
          const bPx = pxMap[k] || {};
          return `
          <tr>
            <td style="font-family:var(--ui-mono);font-weight:700;">${k}</td>
            <td style="font-family:var(--ui-mono);">${bIn.xIn}" , ${bIn.yIn}" (${bIn.wIn}" × ${bIn.hIn}")</td>
            <td style="font-family:var(--ui-mono);">${bPx.x}px, ${bPx.y}px (${bPx.w}×${bPx.h}px)</td>
          </tr>`;
        })
        .join('');
    }
  }

  // --------------------------------------------------------------------------
  // LIBRARY SURFACE (Live Cover Thumbnails, Search & Actions)
  // --------------------------------------------------------------------------
  bindLibraryEvents() {
    document.getElementById('library-search-input')?.addEventListener('input', () => {
      this.renderLibrarySurface();
    });
    document.getElementById('gallery-fullscreen-btn')?.addEventListener('click', () => {
      window.open('/api/gallery/preview', '_blank');
    });
  }

  renderLibrarySurface() {
    const grid = document.getElementById('library-deck-grid');
    if (!grid) return;
    const query = (document.getElementById('library-search-input')?.value || '').toLowerCase().trim();

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
      <article class="deck-card ${this.selectedDeck?.slug === d.slug ? 'selected' : ''}">
        <div class="deck-card-thumb">
          <iframe src="/api/decks/${encodeURIComponent(d.slug)}/view?mode=thumbnail" loading="lazy" title="${d.title}"></iframe>
        </div>
        <div class="deck-card-body">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-family:var(--ui-mono);font-size:11px;color:var(--ui-accent);">${d.brandKitId} · v${d.version || 1}</span>
            <span class="badge ${d.lastCheckReport?.passed !== false ? 'badge-pass' : 'badge-fail'}">${
          d.lastCheckReport?.passed !== false ? 'ON-BRAND PASS' : 'CHECK ISSUES'
        }</span>
          </div>
          <h3 style="font-size:15px;font-weight:700;">${d.title}</h3>
          <div style="font-family:var(--ui-mono);font-size:11.5px;color:var(--ui-ink-muted);">
            ${d.slides?.length || 0} slides · ${d.brief?.audience || 'management'} · ${d.classification || 'Internal'}
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;">
            <button type="button" class="btn btn-sm btn-primary" data-lib-open="${d.slug}">Open in Studio</button>
            <a class="btn btn-sm" href="/api/decks/${encodeURIComponent(d.slug)}/view" target="_blank">Present</a>
            <a class="btn btn-sm" href="/api/decks/${encodeURIComponent(d.slug)}/view?presenter=1" target="_blank">Presenter View</a>
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
          this.renderSelectedDeckInViewer();
          this.switchView('studio');
        }
      });
    });
  }

  // --------------------------------------------------------------------------
  // SAAS PLANS, QUOTAS (2/4/16 Brands & 4/20/100 Daily Decks) & COST LAB
  // --------------------------------------------------------------------------
  bindSaasQuotaEvents() {
    document.getElementById('save-quotas-btn')?.addEventListener('click', async () => {
      const planCatalog = {
        starter: {
          maxBrands: Number(document.getElementById('q-starter-brands')?.value || 2),
          dailyDeckLimit: Number(document.getElementById('q-starter-decks')?.value || 4)
        },
        pro: {
          maxBrands: Number(document.getElementById('q-pro-brands')?.value || 4),
          dailyDeckLimit: Number(document.getElementById('q-pro-decks')?.value || 20)
        },
        enterprise: {
          maxBrands: Number(document.getElementById('q-ent-brands')?.value || 16),
          dailyDeckLimit: Number(document.getElementById('q-ent-decks')?.value || 100)
        }
      };

      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCatalog })
      });
      if (res.ok) {
        await this.refreshBootstrap();
        this.showToast('Updated SaaS plan quotas (Brands & Daily Presentation limits)!');
      }
    });

    document.getElementById('reset-today-usage-btn')?.addEventListener('click', async () => {
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetTodayUsage: true })
      });
      if (res.ok) {
        await this.refreshBootstrap();
        this.showToast("Reset today's presentation usage counter to 0.");
      }
    });

    document.getElementById('save-ent-settings-btn')?.addEventListener('click', async () => {
      const provider = document.getElementById('ent-llm-provider')?.value || 'local-structured';
      const role = document.getElementById('ent-role-select')?.value || 'brand_admin';
      const internalNetworkOnly = Boolean(document.getElementById('ent-internal-net')?.checked);
      const forbidExternalMedia = Boolean(document.getElementById('ent-forbid-media')?.checked);

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
        this.showToast('Saved enterprise LLM & privacy policy.');
      }
    });
  }

  renderSaasSurface() {
    if (!this.quota) return;
    const activeTierBadge = document.getElementById('saas-active-tier-badge');
    if (activeTierBadge) {
      activeTierBadge.textContent = `${this.quota.tierName.toUpperCase()} ACTIVE`;
    }

    const catalog = this.quota.planCatalog || {};
    if (catalog.starter) {
      document.getElementById('q-starter-brands').value = catalog.starter.maxBrands;
      document.getElementById('q-starter-decks').value = catalog.starter.dailyDeckLimit;
    }
    if (catalog.pro) {
      document.getElementById('q-pro-brands').value = catalog.pro.maxBrands;
      document.getElementById('q-pro-decks').value = catalog.pro.dailyDeckLimit;
    }
    if (catalog.enterprise) {
      document.getElementById('q-ent-brands').value = catalog.enterprise.maxBrands;
      document.getElementById('q-ent-decks').value = catalog.enterprise.dailyDeckLimit;
    }

    const planCards = document.getElementById('plan-cards-container');
    if (planCards) {
      planCards.innerHTML = Object.values(catalog)
        .map((p) => {
          const isCurrent = p.id === this.quota.tier;
          return `
          <div class="panel-card" style="padding:14px;border-color:${isCurrent ? 'var(--ui-accent)' : 'var(--ui-border)'}">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong style="font-family:var(--ui-mono);font-size:13px;">${p.name.toUpperCase()}</strong>
              <span style="font-family:var(--ui-mono);font-size:12px;color:var(--ui-accent);">$${p.priceMonthlyUsd}/mo</span>
            </div>
            <div style="font-family:var(--ui-mono);font-size:12px;">
              • Max Brands: <strong>${p.maxBrands}</strong><br/>
              • Daily Presentations: <strong>${p.dailyDeckLimit}/day</strong>
            </div>
            <button type="button" class="btn btn-sm ${isCurrent ? 'btn-primary' : ''}" data-select-tier="${p.id}">
              ${isCurrent ? '✓ Active Plan' : `Switch to ${p.name}`}
            </button>
          </div>`;
        })
        .join('');

      planCards.querySelectorAll('[data-select-tier]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const tier = btn.getAttribute('data-select-tier');
          await fetch('/api/subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tier })
          });
          await this.refreshBootstrap();
          this.showToast(`Switched workspace subscription to ${tier.toUpperCase()} plan.`);
        });
      });
    }

    // Cost Summary Cards & Table
    const stats = this.quota.usageStats || {};
    const totalDecks = (stats.totalDecksCreated || 0) + (stats.totalDecksEdited || 0);
    const totalCost = Number(stats.totalEstimatedCostUsd || 0);
    const avgCost = totalDecks > 0 ? (totalCost / totalDecks).toFixed(4) : '0.0140';

    const costSummaryEl = document.getElementById('cost-summary-cards');
    if (costSummaryEl) {
      costSummaryEl.innerHTML = `
        <div class="swatch-box">
          <div>
            <div style="font-size:11px;color:var(--ui-ink-muted);">BRANDS USED</div>
            <div style="font-family:var(--ui-mono);font-size:18px;font-weight:700;">${this.quota.usedBrands} / ${this.quota.maxBrands}</div>
          </div>
        </div>
        <div class="swatch-box">
          <div>
            <div style="font-size:11px;color:var(--ui-ink-muted);">TODAY'S DECKS</div>
            <div style="font-family:var(--ui-mono);font-size:18px;font-weight:700;">${this.quota.usedDecksToday} / ${this.quota.dailyDeckLimit}</div>
          </div>
        </div>
        <div class="swatch-box">
          <div>
            <div style="font-size:11px;color:var(--ui-ink-muted);">AVG COST / DECK</div>
            <div style="font-family:var(--ui-mono);font-size:18px;font-weight:700;color:var(--ui-positive);">$${avgCost}</div>
          </div>
        </div>
      `;
    }

    const costTbody = document.getElementById('cost-history-tbody');
    if (costTbody) {
      const history = stats.costHistory || [];
      costTbody.innerHTML =
        history.length > 0
          ? history
              .slice(0, 8)
              .map(
                (h) => `
              <tr>
                <td style="font-family:var(--ui-mono);">${h.deckSlug}</td>
                <td>${h.operation}</td>
                <td style="font-family:var(--ui-mono);">${h.promptTokens} / ${h.completionTokens}</td>
                <td style="font-family:var(--ui-mono);">${(h.renderDurationMs / 1000).toFixed(1)}s</td>
                <td style="font-family:var(--ui-mono);color:var(--ui-positive);">$${h.totalCostUsd}</td>
              </tr>`
              )
              .join('')
          : `<tr><td colspan="5" style="color:var(--ui-ink-muted);">Build or refine a deck to record live token &amp; Chromium render cost telemetry.</td></tr>`;
    }

    // Enterprise settings & Audit Log
    if (this.org) {
      document.getElementById('ent-llm-provider').value = this.org.llmConfig?.provider || 'local-structured';
      document.getElementById('ent-role-select').value = this.org.role || 'brand_admin';
      document.getElementById('ent-internal-net').checked = Boolean(this.org.llmConfig?.internalNetworkOnly);
      document.getElementById('ent-forbid-media').checked = Boolean(this.org.llmConfig?.forbidExternalMedia);
    }

    const auditList = document.getElementById('audit-log-list');
    if (auditList) {
      auditList.innerHTML = (this.auditLog || [])
        .map(
          (a) => `
        <div class="activity-step">
          <span><strong>${a.action}</strong> · ${a.target} — ${a.detail}</span>
          <span>${a.timestamp.slice(11, 19)}</span>
        </div>`
        )
        .join('');
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.__app = new DeckStudioApp();
});
