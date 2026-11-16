/* ==========================================================================
   Deck Studio — Dependency-Free Interactive Deck Engine Runtime
   Shared across Studio Preview, Component Gallery, Live Presenting & ZIP Export
   ========================================================================== */

(function () {
  'use strict';

  const ICON_SVGS = {
    shield: '<svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    alert: '<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    check: '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    cpu: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/></svg>',
    database: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>',
    terminal: '<svg viewBox="0 0 24 24"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    bolt: '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    chart: '<svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    users: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    'arrow-right': '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    layers: '<svg viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    play: '<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24"><path d="M12 3l2.4 7.2L22 12l-7.6 1.8L12 21l-2.4-7.2L2 12l7.6-1.8L12 3z"/></svg>',
    wrench: '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
    server: '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>',
    activity: '<svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>'
  };

  function getPatternSvg(patternType, strokeColor) {
    const stroke = strokeColor || '#94A3B8';
    if (patternType === 'diagonal') {
      return `<svg class="slide-pattern" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="pat-diag" width="48" height="48" patternTransform="rotate(35)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="48" stroke="${stroke}" stroke-width="1.5"/>
          </pattern>
        </defs>
        <rect width="1600" height="900" fill="url(#pat-diag)"/>
      </svg>`;
    }
    if (patternType === 'architectural-lines') {
      return `<svg class="slide-pattern" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="pat-arch" width="160" height="90" patternUnits="userSpaceOnUse">
            <path d="M 160 0 L 0 0 0 90" fill="none" stroke="${stroke}" stroke-width="1.2"/>
            <circle cx="160" cy="90" r="2.5" fill="${stroke}"/>
          </pattern>
        </defs>
        <rect width="1600" height="900" fill="url(#pat-arch)"/>
      </svg>`;
    }
    return `<svg class="slide-pattern" viewBox="0 0 1600 900" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="pat-grid" width="80" height="80" patternUnits="userSpaceOnUse">
          <path d="M 80 0 L 0 0 0 80" fill="none" stroke="${stroke}" stroke-width="1"/>
        </pattern>
      </defs>
      <rect width="1600" height="900" fill="url(#pat-grid)"/>
    </svg>`;
  }

  class DeckEngine {
    constructor() {
      const params = new URLSearchParams(window.location.search);
      this.mode = params.get('mode') || 'interactive'; // 'interactive' | 'thumbnail' | 'overview' | 'check' | 'print'
      this.isPresenterWindow = params.get('presenter') === '1';
      this.initialSlideParam = parseInt(params.get('slide') || '0', 10);

      if (this.mode !== 'interactive') {
        document.body.classList.add(`mode-${this.mode}`);
      }

      this.brandKit = window.__BRAND_KIT__ || {};
      this.deckMeta = window.__DECK_META__ || {};
      this.viewport = document.querySelector('.deck-viewport');
      this.stage = document.querySelector('.deck-stage');
      this.slides = Array.from(document.querySelectorAll('.slide'));
      this.currentIndex = Number.isFinite(this.initialSlideParam)
        ? Math.min(Math.max(0, this.initialSlideParam), Math.max(0, this.slides.length - 1))
        : 0;

      // Dock state machine (§6 & §11)
      this.dockOpen = false;
      this.dockPinned = false;
      try {
        this.dockPinned = localStorage.getItem('ds_dock_pinned') === '1';
      } catch {
        this.dockPinned = false;
      }
      this.requiresBottomZoneExit = false;
      this.bottomHoverTimer = null;
      this.dockIdleTimer = null;
      this.dockLeaveTimer = null;
      this.cursorIdleTimer = null;

      // Annotation & Tool state (§6)
      this.activeTool = null; // null | 'pen' | 'highlighter' | 'underline' | 'laser' | 'zoom'
      this.swatches = this.computeBrandSwatches();
      this.activeColor = this.swatches[0];
      this.annotationsBySlide = this.slides.map(() => []);
      this.isDrawing = false;
      this.drawPoints = [];
      this.laserTrail = [];
      this.laserDecayTimer = null;
      this.zoomed = false;
      this.zoomOrigin = { x: 800, y: 450 };

      // Overlays state
      this.lightboxOpen = false;
      this.overviewOpen = false;
      this.helpOpen = false;
      this.notesOpen = false;
      this.blackoutOpen = false;

      // Timer state
      this.timerSeconds = 0;
      this.timerPaused = false;
      this.presenterWin = null;
      this.syncChannel = null;
      this.traceTimers = [];
      this.typewriterTimers = [];

      if (this.isPresenterWindow) {
        this.initPresenterWindowMode();
        return;
      }

      this.init();
    }

    computeBrandSwatches() {
      const c = this.brandKit.colors || {};
      return [
        c.accent || '#C83E1D',
        c.secondary || '#1D4ED8',
        c.status?.positive || '#0F766E',
        c.status?.negative || '#B91C1C'
      ];
    }

    init() {
      if (!this.stage || this.slides.length === 0) return;

      this.injectIcons();
      this.decorateSlidesWithBrandFrame();
      this.enhanceFlowDiagrams();
      this.buildPresentingUI();
      this.setupScaleListener();
      this.setupKeyboardShortcuts();
      this.setupPointerAndDockListeners();
      this.setupSyncTransport();
      this.setupClockAndTimer();

      // If in check, thumbnail, overview, or print mode, reveal all steps immediately
      if (this.mode !== 'interactive' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.revealAllStepsEverywhere();
      }

      this.goToSlide(this.currentIndex, { revealAllSteps: false, broadcast: false });

      if (this.dockPinned && this.mode === 'interactive') {
        this.openDock('pinned');
      }
    }

    injectIcons() {
      const iconEls = document.querySelectorAll('.ds-icon[data-icon]');
      iconEls.forEach((el) => {
        const name = el.getAttribute('data-icon');
        const svg = ICON_SVGS[name] || ICON_SVGS.sparkle;
        el.innerHTML = svg;
      });
    }

    decorateSlidesWithBrandFrame() {
      const total = this.slides.length;
      const frame = this.brandKit.frame || {
        showProgress: true,
        classification: this.deckMeta.classification || 'Internal',
        companyName: 'Nordic Grid Systems',
        showPageNumber: true
      };
      const logoCfg = this.brandKit.logo || {
        placement: 'top-right',
        allowedSlideTypes: ['cover', 'end'],
        variants: []
      };
      const backgrounds = this.brandKit.backgrounds || {};

      this.slides.forEach((slide, idx) => {
        const slideType = slide.getAttribute('data-slide-type') || 'content';
        const isDark = ['cover', 'content-dark', 'section-dark', 'end'].includes(slideType);

        // 1. Pattern overlay for cover & section breakers
        if (['cover', 'section-dark', 'section-light'].includes(slideType) && !slide.querySelector('.slide-pattern')) {
          const patName =
            slideType === 'cover'
              ? backgrounds.coverPattern || 'swiss-grid'
              : slideType === 'section-dark'
              ? backgrounds.sectionDarkPattern || 'architectural-lines'
              : backgrounds.sectionLightPattern || 'swiss-grid';
          const patColor = isDark
            ? this.brandKit.colors?.textOnDark || '#F8FAFC'
            : this.brandKit.colors?.primary || '#1E293B';
          slide.insertAdjacentHTML('afterbegin', getPatternSvg(patName, patColor));
        }

        // 2. Progress bar
        if (frame.showProgress !== false && !slide.querySelector('.ds-frame-progress')) {
          const pct = Math.round(((idx + 1) / total) * 100);
          slide.insertAdjacentHTML(
            'beforeend',
            `<div class="ds-frame-progress" aria-hidden="true"><div class="ds-frame-progress-bar" style="width:${pct}%"></div></div>`
          );
        }

        // 3. Logo strictly on cover & end slides only (§5)
        const allowedLogoTypes = logoCfg.allowedSlideTypes || ['cover', 'end'];
        if (allowedLogoTypes.includes(slideType) && !slide.querySelector('.ds-frame-logo')) {
          const variants = logoCfg.variants || [];
          const preferred =
            variants.find((v) => v.forSurface === (isDark ? 'dark' : 'light')) ||
            variants[0];
          if (preferred && preferred.dataUrl) {
            const posClass = `pos-${logoCfg.placement || 'top-right'}`;
            slide.insertAdjacentHTML(
              'beforeend',
              `<img class="ds-frame-logo ${posClass}" src="${preferred.dataUrl}" alt="${frame.companyName || 'Brand'} Logo" />`
            );
          }
        }

        // 4. Source note if data-source is present
        const sourceText = slide.getAttribute('data-source');
        if (sourceText && !slide.querySelector('.ds-frame-source')) {
          slide.insertAdjacentHTML(
            'beforeend',
            `<div class="ds-frame-source">Source: ${sourceText}</div>`
          );
        }

        // 5. Footer band (classification · company · page number)
        if (!slide.querySelector('.ds-frame-footer')) {
          const leftLabel = `${frame.classification || 'Internal'} · ${frame.companyName || 'Nordic Grid Systems'}`;
          const rightLabel =
            frame.showPageNumber !== false
              ? `${String(idx + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`
              : '';
          slide.insertAdjacentHTML(
            'beforeend',
            `<footer class="ds-frame-footer" aria-label="Slide footer">
              <span>${leftLabel}</span>
              <span>${rightLabel}</span>
            </footer>`
          );
        }

        // 6. SVG Annotation layer per slide (§6)
        if (!slide.querySelector('.ds-annotation-layer')) {
          slide.insertAdjacentHTML(
            'beforeend',
            `<svg class="ds-annotation-layer" viewBox="0 0 1600 900" data-slide-annotation="${idx}"></svg>`
          );
        }
      });
    }

    enhanceFlowDiagrams() {
      const flows = document.querySelectorAll('.ds-flow');
      flows.forEach((flow) => {
        const nodes = Array.from(flow.querySelectorAll('.ds-flow-node'));
        if (nodes.length < 2) return;
        // Insert arrows between nodes if not already present
        if (flow.querySelectorAll('.ds-flow-arrow').length === 0) {
          for (let i = 0; i < nodes.length - 1; i++) {
            const arrow = document.createElement('div');
            arrow.className = 'ds-flow-arrow';
            arrow.setAttribute('aria-hidden', 'true');
            arrow.innerHTML = ICON_SVGS['arrow-right'];
            nodes[i].after(arrow);
          }
        }
      });
    }

    buildPresentingUI() {
      if (this.mode !== 'interactive') return;

      // 1. Faint bottom handle
      const handle = document.createElement('button');
      handle.className = 'ds-dock-handle';
      handle.setAttribute('aria-label', 'Open presentation controls');
      handle.setAttribute('title', 'Click or rest pointer at bottom edge to open controls');
      handle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.requiresBottomZoneExit = false;
        this.openDock('handle');
      });
      document.body.appendChild(handle);
      this.dockHandleEl = handle;

      // 2. Floating Control Dock Pill (§6)
      const dock = document.createElement('nav');
      dock.className = 'ds-control-dock';
      dock.setAttribute('aria-label', 'Presentation control dock');
      dock.innerHTML = `
        <button type="button" class="ds-dock-btn" data-action="prev" aria-label="Previous step (Left Arrow)">←</button>
        <span class="ds-dock-counter" data-role="counter">1 / ${this.slides.length}</span>
        <button type="button" class="ds-dock-btn" data-action="next" aria-label="Next step (Right Arrow)">→</button>
        <span class="ds-dock-sep"></span>
        <button type="button" class="ds-dock-btn" data-tool="pen" aria-label="Pen annotation tool">Pen</button>
        <button type="button" class="ds-dock-btn" data-tool="highlighter" aria-label="Highlighter tool">Highlight</button>
        <button type="button" class="ds-dock-btn" data-tool="underline" aria-label="Snap underline tool">Underline</button>
        <button type="button" class="ds-dock-btn" data-tool="laser" aria-label="Laser pointer">Laser</button>
        <button type="button" class="ds-dock-btn" data-tool="zoom" aria-label="Click to zoom 2x">Zoom 2×</button>
        <span class="ds-dock-sep"></span>
        <div class="ds-swatch-group" style="display:flex;gap:5px;align-items:center;">
          ${this.swatches
            .map(
              (hex, i) =>
                `<button type="button" class="ds-swatch ${i === 0 ? 'active' : ''}" data-swatch="${hex}" style="background-color:${hex}" aria-label="Annotation colour ${i + 1}"></button>`
            )
            .join('')}
        </div>
        <button type="button" class="ds-dock-btn" data-action="undo" aria-label="Undo last annotation">Undo</button>
        <button type="button" class="ds-dock-btn" data-action="clear" aria-label="Clear slide annotations">Clear</button>
        <span class="ds-dock-sep"></span>
        <button type="button" class="ds-dock-btn" data-action="overview" aria-label="Slide overview (O)">Overview</button>
        <button type="button" class="ds-dock-btn" data-action="notes" aria-label="Speaker notes (N)">Notes</button>
        <button type="button" class="ds-dock-btn" data-action="presenter" aria-label="Presenter view (S)">Presenter</button>
        <button type="button" class="ds-dock-btn" data-action="fullscreen" aria-label="Full screen (F)">Full</button>
        <button type="button" class="ds-dock-btn" data-action="help" aria-label="Keyboard shortcuts (?)">?</button>
        <button type="button" class="ds-dock-btn ${this.dockPinned ? 'active' : ''}" data-action="pin" aria-label="Pin control dock (C)">Pin</button>
      `;
      document.body.appendChild(dock);
      this.dockEl = dock;

      // 3. Speaker Notes Drawer (N)
      const notesDrawer = document.createElement('aside');
      notesDrawer.className = 'ds-notes-drawer';
      notesDrawer.setAttribute('aria-label', 'Speaker notes and timer');
      notesDrawer.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;padding-bottom:8px;">
          <span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--brand-accent);">SPEAKER NOTES</span>
          <div style="display:flex;gap:10px;align-items:center;font-family:var(--font-mono);font-size:13px;">
            <span data-role="timer">00:00</span>
            <button type="button" class="ds-dock-btn" data-notes-action="pause-timer" style="padding:2px 8px;" aria-label="Pause or resume timer">Pause</button>
            <button type="button" class="ds-dock-btn" data-notes-action="reset-timer" style="padding:2px 8px;" aria-label="Reset timer">Reset</button>
            <span data-role="clock">--:--</span>
          </div>
        </div>
        <div data-role="notes-body" style="font-size:15px;line-height:1.5;color:#E2E8F0;overflow-y:auto;max-height:240px;"></div>
      `;
      document.body.appendChild(notesDrawer);
      this.notesDrawerEl = notesDrawer;

      // 4. Overview Grid Overlay (O)
      const overview = document.createElement('section');
      overview.className = 'ds-overlay';
      overview.setAttribute('aria-label', 'Slide overview grid');
      overview.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h2 style="font-family:var(--font-heading);font-size:24px;">Slide Overview (${this.slides.length} slides — all steps & live ink revealed)</h2>
          <button type="button" class="ds-dock-btn" data-overview-close="1" aria-label="Close overview">Esc · Close</button>
        </div>
        <div class="ds-overview-grid" data-role="overview-grid"></div>
      `;
      document.body.appendChild(overview);
      this.overviewEl = overview;

      // 5. Keyboard Shortcuts Help Overlay (?)
      const help = document.createElement('section');
      help.className = 'ds-overlay';
      help.setAttribute('aria-label', 'Keyboard shortcuts help');
      help.innerHTML = `
        <div style="max-width:720px;margin:40px auto;background:#1E293B;border:2px solid #334155;border-radius:10px;padding:28px 32px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
            <h2 style="font-family:var(--font-heading);font-size:24px;">Keyboard & Presenting Shortcuts</h2>
            <button type="button" class="ds-dock-btn" data-help-close="1" aria-label="Close shortcut help">Esc</button>
          </div>
          <div style="display:grid;grid-template-columns:160px 1fr;gap:10px 20px;font-size:15px;">
            <code>→ / Space / PgDn</code><span>Next step or slide</span>
            <code>← / PgUp</code><span>Previous step or slide (arriving backwards reveals all steps)</span>
            <code>Home / End</code><span>Jump to first / last slide</span>
            <code>F</code><span>Toggle full screen</span>
            <code>O</code><span>Toggle live overview grid</span>
            <code>N</code><span>Toggle speaker notes & timer</span>
            <code>S</code><span>Open synced Presenter View window</span>
            <code>B</code><span>Toggle blackout screen</span>
            <code>P</code><span>Print / Export PDF view</span>
            <code>C</code><span>Pin / unpin control dock</span>
            <code>?</code><span>Toggle shortcut help</span>
            <code>Esc</code><span>Close topmost: dock → lightbox → overview → help → zoom → tool → notes</span>
          </div>
        </div>
      `;
      document.body.appendChild(help);
      this.helpEl = help;

      // 6. Blackout Overlay (B)
      const blackout = document.createElement('div');
      blackout.className = 'ds-blackout';
      blackout.addEventListener('click', () => this.toggleBlackout(false));
      document.body.appendChild(blackout);
      this.blackoutEl = blackout;

      // Bind dock buttons
      dock.addEventListener('click', (e) => {
        const toolBtn = e.target.closest('[data-tool]');
        if (toolBtn) {
          const toolName = toolBtn.getAttribute('data-tool');
          this.selectTool(this.activeTool === toolName ? null : toolName);
          // Requirement §6: Dock closes immediately when an ink/annotation tool is picked!
          this.closeDock('tool-picked', { forceEvenIfPinned: true });
          return;
        }

        const swatchBtn = e.target.closest('[data-swatch]');
        if (swatchBtn) {
          this.activeColor = swatchBtn.getAttribute('data-swatch');
          dock.querySelectorAll('.ds-swatch').forEach((s) => s.classList.toggle('active', s === swatchBtn));
          return;
        }

        const actionBtn = e.target.closest('[data-action]');
        if (!actionBtn) return;
        const action = actionBtn.getAttribute('data-action');
        if (action === 'prev') this.prevStep();
        else if (action === 'next') this.nextStep();
        else if (action === 'undo') this.undoAnnotation();
        else if (action === 'clear') this.clearAnnotations();
        else if (action === 'overview') this.toggleOverview();
        else if (action === 'notes') this.toggleNotes();
        else if (action === 'presenter') this.openPresenterWindow();
        else if (action === 'fullscreen') this.toggleFullscreen();
        else if (action === 'help') this.toggleHelp();
        else if (action === 'pin') this.togglePinDock();
      });

      notesDrawer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-notes-action]');
        if (!btn) return;
        const act = btn.getAttribute('data-notes-action');
        if (act === 'pause-timer') {
          this.timerPaused = !this.timerPaused;
          btn.textContent = this.timerPaused ? 'Resume' : 'Pause';
        } else if (act === 'reset-timer') {
          this.timerSeconds = 0;
          this.updateClockAndTimerDOM();
        }
      });

      overview.querySelector('[data-overview-close]')?.addEventListener('click', () => this.toggleOverview(false));
      help.querySelector('[data-help-close]')?.addEventListener('click', () => this.toggleHelp(false));
    }

    setupScaleListener() {
      const updateScale = () => {
        if (!this.stage) return;
        if (this.mode === 'print') {
          this.stage.style.transform = 'none';
          return;
        }
        const vw = window.innerWidth || 1600;
        const vh = window.innerHeight || 900;
        const baseScale = Math.min(vw / 1600, vh / 900);
        this.currentScale = baseScale;
        if (this.zoomed) {
          const offsetX = (800 - this.zoomOrigin.x) * baseScale;
          const offsetY = (450 - this.zoomOrigin.y) * baseScale;
          this.stage.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${baseScale * 2})`;
        } else {
          this.stage.style.transform = `scale(${baseScale})`;
        }
      };
      this.updateScale = updateScale;
      window.addEventListener('resize', updateScale);
      updateScale();
    }

    setupKeyboardShortcuts() {
      if (this.mode !== 'interactive') return;
      window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return;

        if (e.key === 'Escape') {
          e.preventDefault();
          this.handleEscapeCascade();
          return;
        }

        if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
          e.preventDefault();
          this.nextStep();
        } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
          e.preventDefault();
          this.prevStep();
        } else if (e.key === 'Home') {
          e.preventDefault();
          this.goToSlide(0, { revealAllSteps: false });
        } else if (e.key === 'End') {
          e.preventDefault();
          this.goToSlide(this.slides.length - 1, { revealAllSteps: true });
        } else if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          this.toggleFullscreen();
        } else if (e.key === 'o' || e.key === 'O') {
          e.preventDefault();
          this.toggleOverview();
        } else if (e.key === 'n' || e.key === 'N') {
          e.preventDefault();
          this.toggleNotes();
        } else if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          this.openPresenterWindow();
        } else if (e.key === 'b' || e.key === 'B') {
          e.preventDefault();
          this.toggleBlackout();
        } else if (e.key === 'p' || e.key === 'P') {
          e.preventDefault();
          window.print();
        } else if (e.key === 'c' || e.key === 'C') {
          e.preventDefault();
          this.togglePinDock();
        } else if (e.key === '?') {
          e.preventDefault();
          this.toggleHelp();
        }
      });
    }

    /**
     * Strictly ordered Esc cascade (§6):
     * dock -> lightbox -> overview -> help -> zoom -> tool -> notes
     */
    handleEscapeCascade() {
      if (this.blackoutOpen) {
        this.toggleBlackout(false);
        return;
      }
      if (this.dockOpen) {
        this.closeDock('esc', { forceEvenIfPinned: true });
        return;
      }
      if (this.lightboxOpen) {
        this.lightboxOpen = false;
        return;
      }
      if (this.overviewOpen) {
        this.toggleOverview(false);
        return;
      }
      if (this.helpOpen) {
        this.toggleHelp(false);
        return;
      }
      if (this.zoomed) {
        this.resetZoom();
        return;
      }
      if (this.activeTool) {
        this.selectTool(null);
        return;
      }
      if (this.notesOpen) {
        this.toggleNotes(false);
      }
    }

    /**
     * Dock & Pointer State Machine (§6 & §11):
     * - Ordinary mouse movement does NOT show the dock.
     * - Opens ONLY when pointer rests at bottom edge (~0.6s / 600ms), handle is clicked, or keyboard focus enters dock.
     * - Closes when pointer leaves it, after ~4s without movement even on dock, on Esc, and immediately when an ink tool is picked.
     * - Blurs focused button on close so focus never keeps dock open.
     * - After forced close, pointer must leave bottom zone before dock can reopen!
     */
    setupPointerAndDockListeners() {
      if (this.mode !== 'interactive' || !this.dockEl) return;

      const isBottomZone = (clientY) => {
        const vh = window.innerHeight || 900;
        return clientY >= vh - 32;
      };

      const isOutsideBottomZone = (clientY) => {
        const vh = window.innerHeight || 900;
        return clientY < vh - 48;
      };

      const onPointerMove = (e) => {
        const clientY = e.clientY;

        // Cursor hide in fullscreen when idle unless a tool is active
        if (this.viewport) {
          this.viewport.classList.remove('cursor-hidden');
          clearTimeout(this.cursorIdleTimer);
          if (document.fullscreenElement && !this.activeTool) {
            this.cursorIdleTimer = setTimeout(() => {
              this.viewport.classList.add('cursor-hidden');
            }, 2500);
          }
        }

        if (isOutsideBottomZone(clientY)) {
          this.requiresBottomZoneExit = false;
          if (this.bottomHoverTimer) {
            clearTimeout(this.bottomHoverTimer);
            this.bottomHoverTimer = null;
          }
        } else if (isBottomZone(clientY)) {
          if (!this.dockOpen && !this.requiresBottomZoneExit && !this.bottomHoverTimer) {
            this.bottomHoverTimer = setTimeout(() => {
              this.bottomHoverTimer = null;
              if (!this.requiresBottomZoneExit && !this.dockOpen) {
                this.openDock('bottom-edge-rest');
              }
            }, 600);
          }
        }

        if (this.dockOpen) {
          this.resetDockIdleTimer();
        }
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('mousemove', onPointerMove);

      this.dockEl.addEventListener('pointerenter', () => {
        if (this.dockLeaveTimer) {
          clearTimeout(this.dockLeaveTimer);
          this.dockLeaveTimer = null;
        }
        this.resetDockIdleTimer();
      });

      this.dockEl.addEventListener('pointerleave', () => {
        if (this.dockPinned) return;
        this.dockLeaveTimer = setTimeout(() => {
          this.closeDock('pointer-leave');
        }, 220);
      });

      this.dockEl.addEventListener('focusin', () => {
        if (!this.requiresBottomZoneExit) {
          this.openDock('keyboard-focus');
        }
      });

      // Setup stage annotation & zoom interactions
      this.setupAnnotationEvents();
    }

    openDock() {
      if (!this.dockEl) return;
      if (this.bottomHoverTimer) {
        clearTimeout(this.bottomHoverTimer);
        this.bottomHoverTimer = null;
      }
      this.dockOpen = true;
      this.dockEl.classList.add('dock-open');
      this.resetDockIdleTimer();
    }

    closeDock(reason = 'auto', { forceEvenIfPinned = false } = {}) {
      if (!this.dockEl) return;
      if (this.dockPinned && !forceEvenIfPinned) return;

      if (this.bottomHoverTimer) {
        clearTimeout(this.bottomHoverTimer);
        this.bottomHoverTimer = null;
      }
      if (this.dockIdleTimer) {
        clearTimeout(this.dockIdleTimer);
        this.dockIdleTimer = null;
      }
      if (this.dockLeaveTimer) {
        clearTimeout(this.dockLeaveTimer);
        this.dockLeaveTimer = null;
      }

      this.dockOpen = false;
      this.dockEl.classList.remove('dock-open');
      this.requiresBottomZoneExit = true;

      // Critical (§6 & §11): Blur focused button inside dock so focus never keeps dock open!
      if (document.activeElement && this.dockEl.contains(document.activeElement)) {
        document.activeElement.blur();
      }
    }

    resetDockIdleTimer() {
      if (this.dockIdleTimer) {
        clearTimeout(this.dockIdleTimer);
      }
      if (this.dockPinned) return;
      this.dockIdleTimer = setTimeout(() => {
        this.closeDock('idle-4s');
      }, 4000);
    }

    togglePinDock() {
      this.dockPinned = !this.dockPinned;
      try {
        localStorage.setItem('ds_dock_pinned', this.dockPinned ? '1' : '0');
      } catch {
        // ignore storage errors on restricted origins
      }
      const pinBtn = this.dockEl?.querySelector('[data-action="pin"]');
      if (pinBtn) pinBtn.classList.toggle('active', this.dockPinned);
      if (this.dockPinned) {
        this.openDock('pin');
      }
    }

    selectTool(toolName) {
      this.activeTool = toolName;
      if (this.dockEl) {
        this.dockEl.querySelectorAll('[data-tool]').forEach((btn) => {
          btn.classList.toggle('active', btn.getAttribute('data-tool') === toolName);
        });
      }
      if (this.stage) {
        this.stage.classList.toggle('tool-active', Boolean(toolName && toolName !== 'zoom'));
      }
      if (toolName !== 'laser') {
        this.clearLaserTrail();
      }
    }

    clientToStageCoords(clientX, clientY) {
      const rect = this.stage.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 1600;
      const y = ((clientY - rect.top) / rect.height) * 900;
      return {
        x: Math.max(0, Math.min(1600, Math.round(x))),
        y: Math.max(0, Math.min(900, Math.round(y)))
      };
    }

    setupAnnotationEvents() {
      if (!this.stage) return;

      // Click on screenshot or stage when zoom tool is active
      this.stage.addEventListener('click', (e) => {
        const clickedScreenshot = e.target.closest('.ds-screenshot img');
        if (this.activeTool === 'zoom' || clickedScreenshot) {
          e.stopPropagation();
          if (this.zoomed) {
            this.resetZoom();
          } else {
            const pt = this.clientToStageCoords(e.clientX, e.clientY);
            this.zoomOrigin = pt;
            this.zoomed = true;
            this.stage.classList.add('zoomed-2x');
            this.updateScale();
          }
        }
      });

      this.stage.addEventListener('pointerdown', (e) => {
        if (!this.activeTool || this.activeTool === 'zoom') return;
        const pt = this.clientToStageCoords(e.clientX, e.clientY);

        if (this.activeTool === 'underline') {
          this.handleSnapUnderline(e.clientX, e.clientY, pt);
          return;
        }

        if (this.activeTool === 'laser') {
          this.isDrawing = true;
          this.pushLaserPoint(pt);
          return;
        }

        this.isDrawing = true;
        this.drawPoints = [pt];
        this.renderActiveSlideAnnotations();
      });

      window.addEventListener('pointermove', (e) => {
        if (!this.activeTool) return;
        const pt = this.clientToStageCoords(e.clientX, e.clientY);

        if (this.activeTool === 'laser') {
          this.pushLaserPoint(pt);
          return;
        }

        if (!this.isDrawing || this.drawPoints.length === 0) return;

        if (this.activeTool === 'pen' && e.shiftKey) {
          // Shift draws a straight line
          this.drawPoints = [this.drawPoints[0], pt];
        } else if (this.activeTool === 'highlighter') {
          const start = this.drawPoints[0];
          // Nearly horizontal strokes snap straight (§6)
          const snappedY = Math.abs(pt.y - start.y) < 26 ? start.y : pt.y;
          this.drawPoints.push({ x: pt.x, y: snappedY });
        } else {
          this.drawPoints.push(pt);
        }

        this.renderActiveSlideAnnotations(true);
      });

      window.addEventListener('pointerup', () => {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        if (this.activeTool === 'pen' || this.activeTool === 'highlighter') {
          if (this.drawPoints.length >= 2) {
            const start = this.drawPoints[0];
            const end = this.drawPoints[this.drawPoints.length - 1];
            let points = [...this.drawPoints];
            if (this.activeTool === 'highlighter' && Math.abs(end.y - start.y) < 28) {
              points = [
                { x: start.x, y: start.y },
                { x: end.x, y: start.y }
              ];
            }
            this.annotationsBySlide[this.currentIndex].push({
              type: this.activeTool,
              color: this.activeColor,
              points
            });
          }
          this.drawPoints = [];
          this.renderActiveSlideAnnotations();
        }
      });
    }

    /**
     * Snap Underline to the clicked word via caret hit-testing (§6).
     */
    handleSnapUnderline(clientX, clientY, fallbackStagePt) {
      const svg = this.slides[this.currentIndex]?.querySelector('.ds-annotation-layer');
      if (svg) svg.style.pointerEvents = 'none';

      let wordRect = null;
      try {
        if (document.caretRangeFromPoint) {
          const range = document.caretRangeFromPoint(clientX, clientY);
          if (range && range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
            const text = range.startContainer.textContent || '';
            let start = range.startOffset;
            let end = range.startOffset;
            while (start > 0 && /\S/.test(text[start - 1])) start--;
            while (end < text.length && /\S/.test(text[end])) end++;
            if (end > start) {
              const wordRange = document.createRange();
              wordRange.setStart(range.startContainer, start);
              wordRange.setEnd(range.startContainer, end);
              wordRect = wordRange.getBoundingClientRect();
            }
          }
        }
      } catch {
        wordRect = null;
      }

      if (svg && this.activeTool) svg.style.pointerEvents = 'auto';

      let x1 = fallbackStagePt.x - 45;
      let x2 = fallbackStagePt.x + 45;
      let y = fallbackStagePt.y + 8;

      if (wordRect && wordRect.width > 4) {
        const leftPt = this.clientToStageCoords(wordRect.left, wordRect.bottom);
        const rightPt = this.clientToStageCoords(wordRect.right, wordRect.bottom);
        x1 = leftPt.x;
        x2 = rightPt.x;
        y = leftPt.y + 3;
      }

      this.annotationsBySlide[this.currentIndex].push({
        type: 'underline',
        color: this.activeColor,
        x1,
        x2,
        y
      });
      this.renderActiveSlideAnnotations();
    }

    pushLaserPoint(pt) {
      const now = Date.now();
      this.laserTrail.push({ x: pt.x, y: pt.y, t: now });
      this.laserTrail = this.laserTrail.filter((p) => now - p.t < 360).slice(-16);
      this.renderActiveSlideAnnotations();

      clearTimeout(this.laserDecayTimer);
      this.laserDecayTimer = setTimeout(() => {
        this.clearLaserTrail();
      }, 380);
    }

    clearLaserTrail() {
      this.laserTrail = [];
      this.renderActiveSlideAnnotations();
    }

    renderActiveSlideAnnotations(includeInProgress = false) {
      const slide = this.slides[this.currentIndex];
      if (!slide) return;
      const svg = slide.querySelector('.ds-annotation-layer');
      if (!svg) return;

      const items = [...(this.annotationsBySlide[this.currentIndex] || [])];
      if (includeInProgress && this.drawPoints.length >= 2) {
        items.push({
          type: this.activeTool,
          color: this.activeColor,
          points: this.drawPoints
        });
      }

      const parts = items.map((item) => {
        if (item.type === 'underline') {
          return `<line x1="${item.x1}" y1="${item.y}" x2="${item.x2}" y2="${item.y}" stroke="${item.color}" stroke-width="4" stroke-linecap="round" />`;
        }
        const d = item.points
          .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
          .join(' ');
        if (item.type === 'highlighter') {
          return `<path d="${d}" fill="none" stroke="${item.color}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round" opacity="0.32" />`;
        }
        return `<path d="${d}" fill="none" stroke="${item.color}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />`;
      });

      if (this.laserTrail.length > 0) {
        const last = this.laserTrail[this.laserTrail.length - 1];
        if (this.laserTrail.length >= 2) {
          const trailPath = this.laserTrail
            .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
            .join(' ');
          parts.push(
            `<path d="${trailPath}" fill="none" stroke="${this.activeColor}" stroke-width="4" stroke-linecap="round" opacity="0.55" />`
          );
        }
        parts.push(
          `<circle cx="${last.x}" cy="${last.y}" r="8" fill="${this.activeColor}" stroke="#FFFFFF" stroke-width="2" />`
        );
      }

      svg.innerHTML = parts.join('');
    }

    undoAnnotation() {
      const list = this.annotationsBySlide[this.currentIndex];
      if (list && list.length > 0) {
        list.pop();
        this.renderActiveSlideAnnotations();
      }
    }

    clearAnnotations() {
      this.annotationsBySlide[this.currentIndex] = [];
      this.renderActiveSlideAnnotations();
    }

    resetZoom() {
      this.zoomed = false;
      this.stage?.classList.remove('zoomed-2x');
      this.updateScale();
    }

    revealAllStepsEverywhere() {
      document.querySelectorAll('[data-step]').forEach((el) => el.classList.add('step-visible'));
      document.querySelectorAll('.ds-kpi-value[data-target]').forEach((el) => {
        const prefix = el.getAttribute('data-prefix') || '';
        const suffix = el.getAttribute('data-suffix') || '';
        const target = el.getAttribute('data-target') || '0';
        el.textContent = `${prefix}${target}${suffix}`;
      });
      document.querySelectorAll('.ds-bar-fill[data-value]').forEach((el) => {
        el.style.width = `${el.getAttribute('data-value')}%`;
      });
      document.querySelectorAll('.ds-code-line').forEach((el) => {
        el.classList.remove('typewriter-hidden');
      });
    }

    getSlideSteps(slideEl) {
      if (!slideEl) return [];
      return Array.from(slideEl.querySelectorAll('[data-step]')).sort(
        (a, b) => Number(a.getAttribute('data-step')) - Number(b.getAttribute('data-step'))
      );
    }

    nextStep() {
      const currentSlide = this.slides[this.currentIndex];
      const steps = this.getSlideSteps(currentSlide);
      const nextUnrevealed = steps.find((el) => !el.classList.contains('step-visible'));
      if (nextUnrevealed) {
        nextUnrevealed.classList.add('step-visible');
        this.broadcastSyncState();
        return;
      }
      if (this.currentIndex < this.slides.length - 1) {
        this.goToSlide(this.currentIndex + 1, { revealAllSteps: false });
      }
    }

    prevStep() {
      const currentSlide = this.slides[this.currentIndex];
      const steps = this.getSlideSteps(currentSlide);
      const revealed = steps.filter((el) => el.classList.contains('step-visible'));
      if (revealed.length > 0) {
        revealed[revealed.length - 1].classList.remove('step-visible');
        this.broadcastSyncState();
        return;
      }
      if (this.currentIndex > 0) {
        // Requirement §5: Arriving backwards shows all steps!
        this.goToSlide(this.currentIndex - 1, { revealAllSteps: true });
      }
    }

    goToSlide(index, { revealAllSteps = false, broadcast = true } = {}) {
      if (index < 0 || index >= this.slides.length) return;

      // Pause any videos on previous slide (§5)
      const prevSlide = this.slides[this.currentIndex];
      if (prevSlide) {
        prevSlide.querySelectorAll('video').forEach((v) => {
          try {
            v.pause();
          } catch {
            // ignore
          }
        });
      }

      this.clearSlideAnimations();
      if (this.zoomed) this.resetZoom();

      this.currentIndex = index;
      this.slides.forEach((s, idx) => {
        s.classList.toggle('active', idx === index);
      });

      const activeSlide = this.slides[index];
      const steps = this.getSlideSteps(activeSlide);
      const forceAllSteps =
        revealAllSteps ||
        this.mode !== 'interactive' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      steps.forEach((stepEl) => {
        stepEl.classList.toggle('step-visible', forceAllSteps);
      });

      // Update viewport surface colour to match active slide (§5 & §11)
      if (this.viewport && activeSlide) {
        const computedBg = window.getComputedStyle(activeSlide).backgroundColor;
        this.viewport.style.backgroundColor = computedBg;
      }

      // Update dock counter & speaker notes
      const counterEl = this.dockEl?.querySelector('[data-role="counter"]');
      if (counterEl) {
        counterEl.textContent = `${index + 1} / ${this.slides.length}`;
      }
      this.updateNotesContent();
      this.runSlideHeroAnimations(activeSlide);

      // Handle video autoplay if requested and in interactive mode
      if (this.mode === 'interactive') {
        activeSlide.querySelectorAll('video[data-autoplay="true"]').forEach((v) => {
          v.muted = true;
          v.play().catch(() => {});
        });
      }

      if (broadcast) {
        this.broadcastSyncState();
      }
    }

    clearSlideAnimations() {
      this.traceTimers.forEach((t) => clearInterval(t));
      this.traceTimers = [];
      this.typewriterTimers.forEach((t) => clearTimeout(t));
      this.typewriterTimers = [];
    }

    runSlideHeroAnimations(slideEl) {
      if (!slideEl) return;
      const isStatic =
        this.mode !== 'interactive' ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      // 1. KPI Count-Up
      slideEl.querySelectorAll('.ds-kpi-value[data-target]').forEach((el) => {
        const targetRaw = parseFloat(el.getAttribute('data-target') || '0');
        const decimals = parseInt(el.getAttribute('data-decimals') || '0', 10);
        const prefix = el.getAttribute('data-prefix') || '';
        const suffix = el.getAttribute('data-suffix') || '';

        if (isStatic || !Number.isFinite(targetRaw)) {
          el.textContent = `${prefix}${targetRaw.toFixed(decimals)}${suffix}`;
          return;
        }

        const duration = 650;
        const start = performance.now();
        const step = (now) => {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = (targetRaw * eased).toFixed(decimals);
          el.textContent = `${prefix}${current}${suffix}`;
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      // 2. Growing Horizontal Bars
      slideEl.querySelectorAll('.ds-bar-fill[data-value]').forEach((el) => {
        const val = el.getAttribute('data-value') || '0';
        if (isStatic) {
          el.style.width = `${val}%`;
        } else {
          el.style.width = '0%';
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              el.style.width = `${val}%`;
            });
          });
        }
      });

      // 3. Flow Diagram Trace Dot
      slideEl.querySelectorAll('.ds-flow[data-trace="true"]').forEach((flow) => {
        const nodes = Array.from(flow.querySelectorAll('.ds-flow-node'));
        if (nodes.length === 0) return;

        let dot = flow.querySelector('.ds-flow-trace-dot');
        if (!dot) {
          dot = document.createElement('div');
          dot.className = 'ds-flow-trace-dot';
          flow.appendChild(dot);
        }

        let activeNodeIdx = 0;
        const moveTrace = (idx) => {
          nodes.forEach((n, i) => n.classList.toggle('trace-active', i === idx));
          const node = nodes[idx];
          if (!node) return;
          dot.style.left = `${node.offsetLeft + node.offsetWidth / 2 - 7}px`;
          dot.style.top = `${node.offsetTop - 7}px`;
        };

        moveTrace(0);
        if (!isStatic && nodes.length > 1) {
          const timer = setInterval(() => {
            activeNodeIdx = (activeNodeIdx + 1) % nodes.length;
            moveTrace(activeNodeIdx);
          }, 1100);
          this.traceTimers.push(timer);
        }
      });

      // 4. Typewriter Code Block
      slideEl.querySelectorAll('.ds-code[data-typewriter="true"]').forEach((codeEl) => {
        const lines = Array.from(codeEl.querySelectorAll('.ds-code-line'));
        if (isStatic) {
          lines.forEach((l) => l.classList.remove('typewriter-hidden'));
          return;
        }
        lines.forEach((l) => l.classList.add('typewriter-hidden'));
        lines.forEach((line, idx) => {
          const t = setTimeout(() => {
            line.classList.remove('typewriter-hidden');
          }, idx * 140);
          this.typewriterTimers.push(t);
        });
      });
    }

    updateNotesContent() {
      const notesBody = this.notesDrawerEl?.querySelector('[data-role="notes-body"]');
      if (!notesBody) return;
      const slide = this.slides[this.currentIndex];
      const notes = slide?.getAttribute('data-notes') || slide?.querySelector('.ds-speaker-notes')?.textContent || 'No speaker notes for this slide.';
      notesBody.textContent = notes;
    }

    toggleOverview(forceState) {
      if (!this.overviewEl) return;
      this.overviewOpen = typeof forceState === 'boolean' ? forceState : !this.overviewOpen;
      this.overviewEl.classList.toggle('open', this.overviewOpen);
      if (this.overviewOpen) {
        this.renderOverviewThumbnails();
      }
    }

    renderOverviewThumbnails() {
      const grid = this.overviewEl?.querySelector('[data-role="overview-grid"]');
      if (!grid) return;
      grid.innerHTML = '';

      this.slides.forEach((slide, idx) => {
        const card = document.createElement('div');
        card.className = `ds-overview-card ${idx === this.currentIndex ? 'current' : ''}`;
        const titleText = slide.querySelector('.ds-title')?.textContent || `Slide ${idx + 1}`;

        const thumb = document.createElement('div');
        thumb.className = 'ds-overview-thumb';

        const clone = slide.cloneNode(true);
        clone.classList.add('active');
        clone.style.transform = 'scale(0.2)';
        clone.style.transformOrigin = 'top left';
        clone.style.pointerEvents = 'none';
        clone.querySelectorAll('[data-step]').forEach((el) => el.classList.add('step-visible'));
        clone.querySelectorAll('video').forEach((v) => v.removeAttribute('autoplay'));

        thumb.appendChild(clone);
        const meta = document.createElement('div');
        meta.className = 'ds-overview-meta';
        meta.innerHTML = `<span>${String(idx + 1).padStart(2, '0')} · ${titleText.slice(0, 32)}</span><span>${slide.getAttribute('data-slide-type') || 'content'}</span>`;

        card.appendChild(thumb);
        card.appendChild(meta);
        card.addEventListener('click', () => {
          this.goToSlide(idx, { revealAllSteps: true });
          this.toggleOverview(false);
        });
        grid.appendChild(card);
      });
    }

    toggleNotes(forceState) {
      if (!this.notesDrawerEl) return;
      this.notesOpen = typeof forceState === 'boolean' ? forceState : !this.notesOpen;
      this.notesDrawerEl.classList.toggle('open', this.notesOpen);
      this.updateNotesContent();
    }

    toggleHelp(forceState) {
      if (!this.helpEl) return;
      this.helpOpen = typeof forceState === 'boolean' ? forceState : !this.helpOpen;
      this.helpEl.classList.toggle('open', this.helpOpen);
    }

    toggleBlackout(forceState) {
      if (!this.blackoutEl) return;
      this.blackoutOpen = typeof forceState === 'boolean' ? forceState : !this.blackoutOpen;
      this.blackoutEl.classList.toggle('open', this.blackoutOpen);
    }

    toggleFullscreen() {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    }

    setupClockAndTimer() {
      this.updateClockAndTimerDOM();
      setInterval(() => {
        if (!this.timerPaused) {
          this.timerSeconds++;
        }
        this.updateClockAndTimerDOM();
      }, 1000);
    }

    updateClockAndTimerDOM() {
      const mins = String(Math.floor(this.timerSeconds / 60)).padStart(2, '0');
      const secs = String(this.timerSeconds % 60).padStart(2, '0');
      const now = new Date();
      const clockStr = now.toTimeString().slice(0, 5);

      document.querySelectorAll('[data-role="timer"]').forEach((el) => {
        el.textContent = `${mins}:${secs}`;
      });
      document.querySelectorAll('[data-role="clock"]').forEach((el) => {
        el.textContent = clockStr;
      });
    }

    /**
     * Multi-transport sync (postMessage + BroadcastChannel + localStorage) so Presenter View works even on file:// (§6)
     */
    setupSyncTransport() {
      try {
        this.syncChannel = new BroadcastChannel('deck_studio_presenter_sync');
        this.syncChannel.onmessage = (ev) => this.handleIncomingSync(ev.data);
      } catch {
        this.syncChannel = null;
      }

      window.addEventListener('message', (ev) => {
        if (ev.data && ev.data.source === 'deck-studio-sync') {
          this.handleIncomingSync(ev.data);
        }
      });

      window.addEventListener('storage', (ev) => {
        if (ev.key === 'deck_studio_sync_payload' && ev.newValue) {
          try {
            this.handleIncomingSync(JSON.parse(ev.newValue));
          } catch {
            // ignore
          }
        }
      });
    }

    getSyncPayload() {
      const activeSlide = this.slides[this.currentIndex];
      const steps = this.getSlideSteps(activeSlide);
      const revealedCount = steps.filter((el) => el.classList.contains('step-visible')).length;
      return {
        source: 'deck-studio-sync',
        slideIndex: this.currentIndex,
        revealedSteps: revealedCount,
        totalStepsOnSlide: steps.length,
        timestamp: Date.now()
      };
    }

    broadcastSyncState() {
      const payload = this.getSyncPayload();
      try {
        this.syncChannel?.postMessage(payload);
      } catch {
        // ignore
      }
      try {
        if (this.presenterWin && !this.presenterWin.closed) {
          this.presenterWin.postMessage(payload, '*');
        }
        if (window.opener) {
          window.opener.postMessage(payload, '*');
        }
      } catch {
        // ignore
      }
      try {
        localStorage.setItem('deck_studio_sync_payload', JSON.stringify(payload));
      } catch {
        // ignore
      }
    }

    handleIncomingSync(data) {
      if (!data || typeof data.slideIndex !== 'number') return;
      if (data.slideIndex !== this.currentIndex) {
        this.goToSlide(data.slideIndex, { revealAllSteps: false, broadcast: false });
      }
      const activeSlide = this.slides[this.currentIndex];
      const steps = this.getSlideSteps(activeSlide);
      steps.forEach((el, idx) => {
        el.classList.toggle('step-visible', idx < (data.revealedSteps || 0));
      });
      if (this.isPresenterWindow) {
        this.renderPresenterState();
      }
    }

    openPresenterWindow() {
      const url = new URL(window.location.href);
      url.searchParams.set('presenter', '1');
      this.presenterWin = window.open(
        url.toString(),
        'DeckStudioPresenterView',
        'width=1280,height=820,menubar=no,toolbar=no'
      );
      setTimeout(() => this.broadcastSyncState(), 400);
    }

    /**
     * Second-Screen Presenter View (§6):
     * Shows current slide, next STEP (fragment or next slide), speaker notes, timer (pause/reset) & clock.
     */
    initPresenterWindowMode() {
      this.injectIcons();
      this.decorateSlidesWithBrandFrame();
      this.enhanceFlowDiagrams();
      this.setupSyncTransport();
      this.setupClockAndTimer();

      const slideTemplates = this.slides.map((s) => s.cloneNode(true));
      document.body.innerHTML = `
        <div style="width:100vw;height:100vh;background:#090D16;color:#F8FAFC;display:grid;grid-template-columns:1.25fr 1fr;gap:24px;padding:24px;font-family:var(--font-body);">
          <div style="display:flex;flex-direction:column;gap:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-family:var(--font-mono);font-size:14px;color:var(--brand-accent);font-weight:700;">CURRENT SLIDE</span>
              <span data-presenter="counter" style="font-family:var(--font-mono);font-size:14px;">1 / ${slideTemplates.length}</span>
            </div>
            <div data-presenter="current-box" style="position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border:2px solid #334155;border-radius:8px;background:#0F172A;"></div>
            <div style="display:flex;gap:12px;align-items:center;">
              <button type="button" class="ds-dock-btn" data-presenter-act="prev" style="border-color:#475569;">← Prev Step</button>
              <button type="button" class="ds-dock-btn" data-presenter-act="next" style="background:var(--brand-accent);">Next Step →</button>
              <div style="margin-left:auto;display:flex;gap:12px;align-items:center;font-family:var(--font-mono);font-size:15px;">
                <span>Elapsed: <strong data-role="timer">00:00</strong></span>
                <button type="button" class="ds-dock-btn" data-presenter-act="pause">Pause</button>
                <button type="button" class="ds-dock-btn" data-presenter-act="reset">Reset</button>
                <span>Clock: <strong data-role="clock">--:--</strong></span>
              </div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span data-presenter="next-label" style="font-family:var(--font-mono);font-size:14px;color:#38BDF8;font-weight:700;">NEXT STEP PREVIEW</span>
            </div>
            <div data-presenter="next-box" style="position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border:2px solid #334155;border-radius:8px;background:#0F172A;"></div>
            <div style="flex:1;background:#1E293B;border:2px solid #334155;border-radius:8px;padding:18px;display:flex;flex-direction:column;gap:10px;overflow-y:auto;">
              <span style="font-family:var(--font-mono);font-size:13px;color:var(--brand-accent);font-weight:700;">SPEAKER NOTES</span>
              <div data-presenter="notes" style="font-size:17px;line-height:1.55;color:#F1F5F9;"></div>
            </div>
          </div>
        </div>
      `;

      this.slides = slideTemplates;
      this.renderPresenterState = () => {
        const curBox = document.querySelector('[data-presenter="current-box"]');
        const nextBox = document.querySelector('[data-presenter="next-box"]');
        const nextLabel = document.querySelector('[data-presenter="next-label"]');
        const counter = document.querySelector('[data-presenter="counter"]');
        const notesEl = document.querySelector('[data-presenter="notes"]');

        const curSlide = this.slides[this.currentIndex];
        if (!curSlide || !curBox || !nextBox) return;

        counter.textContent = `Slide ${this.currentIndex + 1} / ${this.slides.length}`;
        notesEl.textContent = curSlide.getAttribute('data-notes') || 'No speaker notes for this slide.';

        // Render current slide at current step
        curBox.innerHTML = '';
        const curClone = curSlide.cloneNode(true);
        curClone.classList.add('active');
        const scaleCur = curBox.clientWidth / 1600 || 0.35;
        curClone.style.transform = `scale(${scaleCur})`;
        curClone.style.transformOrigin = 'top left';
        curBox.appendChild(curClone);

        // Determine NEXT STEP (next fragment on current slide, or next slide!)
        const curSteps = this.getSlideSteps(curSlide);
        const revealedCount = curSteps.filter((el) => el.classList.contains('step-visible')).length;
        nextBox.innerHTML = '';

        if (revealedCount < curSteps.length) {
          nextLabel.textContent = `NEXT STEP: Fragment ${revealedCount + 1} of ${curSteps.length} on Current Slide`;
          const nextStepClone = curSlide.cloneNode(true);
          nextStepClone.classList.add('active');
          const cloneSteps = this.getSlideSteps(nextStepClone);
          cloneSteps.forEach((el, idx) => {
            el.classList.toggle('step-visible', idx <= revealedCount);
            if (idx === revealedCount) {
              el.style.outline = '3px solid var(--brand-accent)';
            }
          });
          const scaleNext = nextBox.clientWidth / 1600 || 0.3;
          nextStepClone.style.transform = `scale(${scaleNext})`;
          nextStepClone.style.transformOrigin = 'top left';
          nextBox.appendChild(nextStepClone);
        } else if (this.currentIndex + 1 < this.slides.length) {
          nextLabel.textContent = `NEXT SLIDE (${this.currentIndex + 2} / ${this.slides.length})`;
          const nextSlideClone = this.slides[this.currentIndex + 1].cloneNode(true);
          nextSlideClone.classList.add('active');
          const scaleNext = nextBox.clientWidth / 1600 || 0.3;
          nextSlideClone.style.transform = `scale(${scaleNext})`;
          nextSlideClone.style.transformOrigin = 'top left';
          nextBox.appendChild(nextSlideClone);
        } else {
          nextLabel.textContent = 'END OF PRESENTATION';
          nextBox.innerHTML = '<div style="display:flex;height:100%;align-items:center;justify-content:center;font-family:var(--font-mono);color:#94A3B8;">End of deck reached</div>';
        }
      };

      document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-presenter-act]');
        if (!btn) return;
        const act = btn.getAttribute('data-presenter-act');
        if (act === 'next') {
          this.nextStep();
          this.renderPresenterState();
        } else if (act === 'prev') {
          this.prevStep();
          this.renderPresenterState();
        } else if (act === 'pause') {
          this.timerPaused = !this.timerPaused;
          btn.textContent = this.timerPaused ? 'Resume' : 'Pause';
        } else if (act === 'reset') {
          this.timerSeconds = 0;
          this.updateClockAndTimerDOM();
        }
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === ' ') {
          this.nextStep();
          this.renderPresenterState();
        } else if (e.key === 'ArrowLeft') {
          this.prevStep();
          this.renderPresenterState();
        }
      });

      setTimeout(() => this.renderPresenterState(), 60);
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.__deckEngine = new DeckEngine();
  });
})();
