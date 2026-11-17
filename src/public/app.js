/* ==========================================================================
   Deck Studio — Browser Application Controller
   Clean, intuitive workflow across Create, Brand Kit, My Decks, Gallery & Plans
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
    this.activeSlideIndex = 0;
    this.mediaTray = [];
    this.auditLog = [];
    this.sampleTemplates = [];
    this.currentView = 'studio';

    this.init();
  }

  async init() {
    this.bindNavigation();
    this.bindStudioEvents();
    this.bindBrandSetupEvents();
    this.bindLibraryEvents();
    this.bindSaasQuotaEvents();
    this.bindQuotaModalEvents();
    this.restoreDraftFromStorage();
    await this.refreshBootstrap();
  }

  showToast(message) {
    const el = document.getElementById('toast-banner');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
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
      this.showToast(`Switched brand to ${this.activeBrandKit?.name}`);
    }
  }

  renderHeaderAndQuota() {
    if (!this.quota) return;
    const pillText = document.getElementById('header-quota-text');
    if (pillText) {
      pillText.textContent = `${this.quota.tierName} · ${this.quota.usedBrands}/${this.quota.maxBrands} Brands · ${this.quota.usedDecksToday}/${this.quota.dailyDeckLimit} Today`;
    }
    const brandQuotaBadge = document.getElementById('brand-quota-badge');
    if (brandQuotaBadge) {
      brandQuotaBadge.textContent = `${this.quota.usedBrands} of ${this.quota.maxBrands} Brands Used (${this.quota.tierName} Plan)`;
      brandQuotaBadge.className = `badge ${this.quota.canCreateBrand ? 'badge-pass' : 'badge-warn'}`;
    }
  }

  renderBrandSelectors() {
    const headerSel = document.getElementById('header-brand-select');
    const studioSel = document.getElementById('studio-brand-select');
    const studioBadge = document.getElementById('studio-brand-badge');
    const headerDots = document.getElementById('header-brand-dots');

    const optionsHtml = this.brandKits
      .map(
        (k) =>
          `<option value="${k.id}" ${k.id === this.activeBrandKit?.id ? 'selected' : ''}>${k.name} (v${k.currentVersion})</option>`
      )
      .join('');

    if (headerSel) headerSel.innerHTML = optionsHtml;
    if (studioSel) studioSel.innerHTML = optionsHtml;
    if (studioBadge && this.activeBrandKit) {
      const shortName = this.activeBrandKit.name.split('—')[0].trim();
      studioBadge.textContent = `${shortName} v${this.activeBrandKit.version}`;
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
      this.showToast('Loaded sample brief + 2 screenshots + 1 failover video');
    });

    // Media dropzone, file picker & paste
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

    document.getElementById('build-deck-btn')?.addEventListener('click', () => this.handleBuildDeck());

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
    document.getElementById('save-slide-inspector-btn')?.addEventListener('click', () => this.handleSaveSlideInspector());

    // Viewer Controls
    document.getElementById('viewer-prev-btn')?.addEventListener('click', () => {
      const iframe = document.getElementById('studio-preview-iframe');
      const engine = iframe?.contentWindow?.__deckEngine;
      if (engine) {
        engine.prevStep();
        this.activeSlideIndex = engine.currentIndex;
        this.highlightActiveFilmstripPill();
        this.populateSlideInspector();
      }
    });
    document.getElementById('viewer-next-btn')?.addEventListener('click', () => {
      const iframe = document.getElementById('studio-preview-iframe');
      const engine = iframe?.contentWindow?.__deckEngine;
      if (engine) {
        engine.nextStep();
        this.activeSlideIndex = engine.currentIndex;
        this.highlightActiveFilmstripPill();
        this.populateSlideInspector();
      }
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
    if (badgeEl) badgeEl.textContent = `${this.mediaTray.length} attached`;
    if (!listEl) return;

    listEl.innerHTML = this.mediaTray
      .map(
        (item, idx) => `
      <div class="media-item" data-media-idx="${idx}">
        ${
          item.category === 'image'
            ? `<img class="media-thumb" src="${item.previewUrl}" alt="${item.filename}" />`
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
    const brief = {
      topic: document.getElementById('brief-topic')?.value || '',
      audience: document.getElementById('brief-audience')?.value || 'management',
      lengthMinutes: Number(document.getElementById('brief-length')?.value || 10),
      endsWithLiveDemo: Boolean(document.getElementById('brief-demo-toggle')?.checked),
      language: document.getElementById('brief-language')?.value || 'en',
      slug: document.getElementById('brief-slug')?.value || '',
      sourceUrl: document.getElementById('brief-source-url')?.value || ''
    };

    const brandKitId = this.activeBrandKit?.id;

    buildBtn.disabled = true;
    buildBtn.textContent = 'Building & Verifying Slides…';

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
        if (res.status === 429 || data.code === 'DAILY_DECK_LIMIT_EXCEEDED') {
          this.openQuotaUpgradeModal(data.error || 'Daily presentation limit reached.');
        }
        this.showToast(data.error || 'Could not create presentation');
        return;
      }

      this.selectedDeck = data.deck;
      this.activeSlideIndex = 0;
      this.renderJobActivity(data.job);
      await this.refreshBootstrap();
      this.showToast(`Created "${data.deck.title}" (${data.deck.slides.length} slides)`);
    } finally {
      buildBtn.disabled = false;
      buildBtn.textContent = 'Create Presentation';
    }
  }

  async handleRefineSelectedDeck() {
    if (!this.selectedDeck) {
      this.showToast('Create or select a presentation first.');
      return;
    }
    const promptInput = document.getElementById('refine-prompt-input');
    const prompt = promptInput?.value?.trim();
    if (!prompt) {
      this.showToast('Type what you would like to change.');
      return;
    }

    const btn = document.getElementById('apply-refine-btn');
    btn.disabled = true;
    btn.textContent = 'Updating…';

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
      promptInput.value = '';
      this.showToast(`Updated presentation (v${data.deck.version})`);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Update Deck';
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
      this.showToast(data.error || 'Nothing to undo yet.');
      return;
    }
    this.selectedDeck = data.deck;
    await this.refreshBootstrap();
    this.showToast('Reverted to previous version');
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

  renderSelectedDeckInViewer() {
    const deck = this.selectedDeck;
    const titleEl = document.getElementById('viewer-deck-title');
    const iframe = document.getElementById('studio-preview-iframe');
    const zipLink = document.getElementById('viewer-export-zip');
    const pdfLink = document.getElementById('viewer-export-pdf');
    const filmstrip = document.getElementById('studio-slide-filmstrip');

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

    // Render clickable slide filmstrip
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
          const win = iframe?.contentWindow;
          if (win && win.__deckEngine) {
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

  populateSlideInspector() {
    const slide = this.selectedDeck?.slides?.[this.activeSlideIndex] || null;
    const badgeEl = document.getElementById('inspector-slide-badge');
    const typeEl = document.getElementById('inspector-slide-type');
    const titleEl = document.getElementById('inspector-slide-title');
    const ledeEl = document.getElementById('inspector-slide-lede');
    const notesEl = document.getElementById('inspector-slide-notes');
    const saveBtn = document.getElementById('save-slide-inspector-btn');

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

  async handleSaveSlideInspector() {
    if (!this.selectedDeck) {
      this.showToast('Create or select a presentation first.');
      return;
    }
    const slide = this.selectedDeck.slides?.[this.activeSlideIndex];
    if (!slide) {
      this.showToast('No slide selected.');
      return;
    }

    const saveBtn = document.getElementById('save-slide-inspector-btn');
    const type = document.getElementById('inspector-slide-type')?.value || slide.type;
    const title = document.getElementById('inspector-slide-title')?.value ?? '';
    const lede = document.getElementById('inspector-slide-lede')?.value ?? '';
    const speakerNotes = document.getElementById('inspector-slide-notes')?.value ?? '';

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
      const data = await res.json();
      if (!res.ok) {
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

  highlightActiveFilmstripPill() {
    document.querySelectorAll('[data-slide-jump]').forEach((btn) => {
      const idx = Number(btn.getAttribute('data-slide-jump'));
      btn.classList.toggle('active', idx === this.activeSlideIndex);
    });
  }

  renderCheckReport(report) {
    const badge = document.getElementById('viewer-check-badge');
    const summaryBadge = document.getElementById('check-summary-badge');
    const list = document.getElementById('check-slides-list');

    if (badge) {
      badge.textContent = report.passed
        ? `✓ On-Brand (${report.slideCount} slides verified)`
        : `⚠ ${report.errorCount} Brand/Layout Issue(s)`;
      badge.className = `badge ${report.passed ? 'badge-pass' : 'badge-fail'}`;
    }
    if (summaryBadge) {
      summaryBadge.textContent = report.passed ? `All ${report.slideCount} slides passed` : `${report.errorCount} issue(s)`;
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
  setBrandWizardStep(stepNum) {
    document.querySelectorAll('#brand-wizard-steps [data-wizard-step]').forEach((pill) => {
      const step = Number(pill.getAttribute('data-wizard-step'));
      pill.classList.toggle('done', step < stepNum);
      pill.classList.toggle('active', step === stepNum);
    });
  }

  bindBrandSetupEvents() {
    document.getElementById('new-brand-file')?.addEventListener('change', () => {
      this.setBrandWizardStep(2);
    });
    document.getElementById('new-brand-sample')?.addEventListener('change', () => {
      this.setBrandWizardStep(3);
    });
    document.getElementById('new-brand-url')?.addEventListener('input', () => {
      this.setBrandWizardStep(1);
    });

    document.getElementById('crawl-brand-url-btn')?.addEventListener('click', async () => {
      const urlInput = document.getElementById('new-brand-url');
      const guidelinesInput = document.getElementById('new-brand-guidelines');
      const crawlBtn = document.getElementById('crawl-brand-url-btn');
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
        const data = await res.json();
        if (!res.ok) {
          this.showToast(data.error || 'Could not extract brand signals');
          return;
        }

        const sc = data.suggestedColors || {};
        const hexes = data.extractedHexes || [];
        const fonts = data.detectedFonts || [];
        const parts = [];
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
        const nameInput = document.getElementById('new-brand-name');
        if (nameInput && data.companyName && (!nameInput.value.trim() || nameInput.value.trim() === 'DanishCVI Event')) {
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
      this.showToast(`Saved ${data.brandKit.name} (v${data.brandKit.version})`);
    });

    document.getElementById('upload-font-btn')?.addEventListener('click', async () => {
      const inp = document.getElementById('upload-font-input');
      if (!inp?.files?.[0]) {
        this.showToast('Choose a font file (.woff2, .ttf, .otf) first.');
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
    // Render visual Brand Profile Cards at top of Brand Kit page
    const strip = document.getElementById('brand-profiles-strip');
    if (strip) {
      strip.innerHTML = this.brandKits
        .map((b) => {
          const c = b.latest?.colors || {};
          const isCurrent = b.id === this.activeBrandKit?.id;
          return `
          <div class="brand-profile-card ${isCurrent ? 'active' : ''}" data-pick-brand="${b.id}">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <strong style="font-size:15px;">${b.name}</strong>
              <span class="badge ${isCurrent ? 'badge-pass' : ''}">v${b.currentVersion}</span>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              <span style="width:22px;height:22px;border-radius:6px;background:${c.surfaceDark};border:1px solid rgba(0,0,0,0.1);"></span>
              <span style="width:22px;height:22px;border-radius:6px;background:${c.primary};border:1px solid rgba(0,0,0,0.1);"></span>
              <span style="width:22px;height:22px;border-radius:6px;background:${c.accent};border:1px solid rgba(0,0,0,0.1);"></span>
              <span style="width:22px;height:22px;border-radius:6px;background:${c.surfaceLight};border:1px solid rgba(0,0,0,0.15);"></span>
              <span style="margin-left:auto;font-size:12px;color:var(--text-secondary);">${b.latest?.fonts?.title?.family || 'Serif'}</span>
            </div>
          </div>`;
        })
        .join('');

      strip.querySelectorAll('[data-pick-brand]').forEach((card) => {
        card.addEventListener('click', () => {
          this.selectBrandKit(card.getAttribute('data-pick-brand'));
        });
      });
    }

    const sampleSel = document.getElementById('new-brand-sample');
    if (sampleSel) {
      sampleSel.innerHTML = this.sampleTemplates
        .map((f) => `<option value="${f}">${f}</option>`)
        .join('');
    }

    const kit = this.activeBrandKit;
    if (!kit) return;

    document.getElementById('active-brand-editor-title').textContent = kit.name;
    document.getElementById('active-brand-version-badge').textContent = `Version ${kit.version}`;

    const roles = [
      { key: 'primary', label: 'Primary' },
      { key: 'secondary', label: 'Secondary' },
      { key: 'accent', label: 'Accent' },
      { key: 'surfaceLight', label: 'Light Surface' },
      { key: 'surfaceAlt', label: 'Alt Surface' },
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
            <div style="font-size:12px;font-weight:600;">${r.label}</div>
            <div style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);">${kit.colors[r.key]}</div>
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
        warnBox.textContent = `${missingFont.warning} (Fallback: ${missingFont.fallback})`;
      } else {
        warnBox.style.display = 'none';
      }
    }

    const contrastTbody = document.getElementById('brand-contrast-tbody');
    const contrastBadge = document.getElementById('brand-contrast-badge');
    if (contrastBadge && kit.contrastReport) {
      contrastBadge.textContent = kit.contrastReport.passed ? 'WCAG AA Verified' : 'Contrast Warning';
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
        this.showToast('Updated plan quota limits');
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
        this.showToast("Reset today's presentation counter to 0");
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
        this.showToast('Saved workspace AI & privacy settings');
      }
    });
  }

  bindQuotaModalEvents() {
    const modal = document.getElementById('quota-upgrade-modal');
    if (!modal) return;

    document.getElementById('close-quota-modal-btn')?.addEventListener('click', () => {
      this.closeQuotaUpgradeModal();
    });
    document.getElementById('dismiss-quota-modal-btn')?.addEventListener('click', () => {
      this.closeQuotaUpgradeModal();
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeQuotaUpgradeModal();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) this.closeQuotaUpgradeModal();
    });

    modal.querySelectorAll('[data-upgrade-tier]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tier = btn.getAttribute('data-upgrade-tier');
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

  openQuotaUpgradeModal(message) {
    const modal = document.getElementById('quota-upgrade-modal');
    const msgEl = document.getElementById('quota-upgrade-message');
    if (msgEl && message) {
      msgEl.textContent = message;
    }
    if (modal) {
      modal.hidden = false;
    }
  }

  closeQuotaUpgradeModal() {
    const modal = document.getElementById('quota-upgrade-modal');
    if (modal) {
      modal.hidden = true;
    }
  }

  renderSaasSurface() {
    if (!this.quota) return;
    const activeTierBadge = document.getElementById('saas-active-tier-badge');
    if (activeTierBadge) {
      activeTierBadge.textContent = `${this.quota.tierName} Plan Active`;
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
          const tier = btn.getAttribute('data-select-tier');
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

    const costSummaryEl = document.getElementById('cost-summary-cards');
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

    const costTbody = document.getElementById('cost-history-tbody');
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
