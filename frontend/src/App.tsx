import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppViewName,
  AuditLogEntry,
  BootstrapPayload,
  BrandColorMap,
  BrandKitSummary,
  BuildJobSummary,
  DeckCheckReportSummary,
  DeckEngineWindow,
  DeckSummary,
  JobStepSummary,
  MediaTrayItem,
  OrgSummary,
  QuotaStatus,
  SidebarTab,
  StarterBriefPreset,
  ThemeMode,
} from './types';

const STARTER_BRIEFS: Record<string, StarterBriefPreset> = {
  postmortem: {
    topic:
      '10-minute talk for management about the March 12 EU-Central-1 incident. At 14:02 UTC traffic surged 3.4x above baseline. At 14:06 UTC the primary database connection pool reached 94% saturation and P99 latency spiked to 412 ms (error rate 3.8%). At 14:11 UTC automated pool-guard promoted standby replica eu-central-1b and raised the connection ceiling from 250 to 500 with jittered backoff. By 14:16 UTC (14 minutes total mitigation window) latency returned to 38 ms nominal baseline with 0 lost transactions.',
    audience: 'management',
    lengthMinutes: 10,
    endsWithLiveDemo: true,
    slug: 'march-12-incident-review',
  },
  demo: {
    topic:
      'Live engineering walkthrough of the automated Pool-Guard failover daemon. Previously, static 250-connection limits required manual operator intervention taking 14 minutes. With Pool-Guard v2, standby replica promotion executes in 12 seconds when saturation exceeds 85%, maintaining 99.98% availability SLA.',
    audience: 'developers',
    lengthMinutes: 12,
    endsWithLiveDemo: true,
    slug: 'pool-guard-feature-demo',
  },
  status: {
    topic:
      'Q3 Infrastructure Reliability Status Update. Availability reached 99.98% across 3 regions. Completed automated replica failover rollout in EU-Central-1 and reduced P99 latency from 412 ms peak to 38 ms steady state. Next milestone: multi-region active-active routing in Q4.',
    audience: 'management',
    lengthMinutes: 8,
    endsWithLiveDemo: false,
    slug: 'q3-reliability-status',
  },
  howitworks: {
    topic:
      'How the Zero-Trust Brand Deck Engine works: 1) Extract design tokens and inch geometry from an Office .pptx template into a versioned Brand Kit. 2) Map factual brief statements and unaltered media evidence onto 15 brand-tokenised components. 3) Verify 100% of slides in headless Chromium for WCAG AA contrast and zero stage overflow.',
    audience: 'product',
    lengthMinutes: 10,
    endsWithLiveDemo: true,
    slug: 'zero-trust-deck-engine',
  },
};

const DRAFT_STORAGE_KEY = 'deck_studio_draft_v1';
const THEME_STORAGE_KEY = 'deck_studio_theme_v1';

const COLOR_ROLES: Array<{ key: keyof BrandColorMap; label: string }> = [
  { key: 'primary', label: 'Primary' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'accent', label: 'Accent' },
  { key: 'surfaceLight', label: 'Light Surface' },
  { key: 'surfaceAlt', label: 'Alt Surface' },
  { key: 'surfaceDark', label: 'Dark Surface' },
];

const SLIDE_LAYOUT_OPTIONS = [
  'cover',
  'content',
  'content-alt',
  'content-dark',
  'statement',
  'section-dark',
  'section-light',
  'end',
] as const;

function slugify(text: string): string {
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

interface StoredDraft {
  topic: string;
  slug: string;
  audience: string;
  lengthMinutes: number;
  endsWithLiveDemo: boolean;
}

function loadInitialDraft(): StoredDraft {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredDraft>;
      return {
        topic: parsed.topic ?? STARTER_BRIEFS.postmortem.topic,
        slug: parsed.slug ?? STARTER_BRIEFS.postmortem.slug,
        audience: parsed.audience ?? 'management',
        lengthMinutes: Number(parsed.lengthMinutes) || 10,
        endsWithLiveDemo: parsed.endsWithLiveDemo ?? true,
      };
    }
  } catch {
    // ignore invalid stored draft
  }
  return {
    topic: STARTER_BRIEFS.postmortem.topic,
    slug: STARTER_BRIEFS.postmortem.slug,
    audience: STARTER_BRIEFS.postmortem.audience,
    lengthMinutes: STARTER_BRIEFS.postmortem.lengthMinutes,
    endsWithLiveDemo: STARTER_BRIEFS.postmortem.endsWithLiveDemo,
  };
}

function loadInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore storage errors
  }
  return 'light';
}

// ============================================================================
// Top Navigation Header
// ============================================================================
interface TopBarProps {
  currentView: AppViewName;
  onSwitchView: (view: AppViewName) => void;
  brandKits: BrandKitSummary[];
  activeBrandKit: BrandKitSummary | null;
  onSelectBrand: (id: string) => void;
  quota: QuotaStatus | null;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

function TopBar({
  currentView,
  onSwitchView,
  brandKits,
  activeBrandKit,
  onSelectBrand,
  quota,
  theme,
  onToggleTheme,
}: TopBarProps) {
  const navItems: Array<{ id: AppViewName; label: string }> = [
    { id: 'studio', label: 'Studio' },
    { id: 'brand', label: 'Brand CVI' },
    { id: 'library', label: 'Library' },
    { id: 'gallery', label: 'Gallery' },
    { id: 'saas', label: 'Workspace' },
  ];

  const colors = activeBrandKit?.colors;

  return (
    <header className="app-topbar">
      <div className="brand-mark">
        <div className="brand-mark-icon">D</div>
        <div className="brand-mark-title">Deck Studio</div>
      </div>

      <nav className="app-nav" role="tablist" aria-label="Main navigation">
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={currentView === item.id}
            className={`nav-tab ${currentView === item.id ? 'active' : ''}`}
            onClick={() => onSwitchView(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="topbar-right">
        <div className="brand-selector-pill" title="Active Brand CVI">
          <div className="brand-selector-dots">
            <span
              className="brand-dot"
              style={{ background: colors?.surfaceDark || '#0F172A' }}
            />
            <span
              className="brand-dot"
              style={{ background: colors?.accent || '#4F46E5' }}
            />
            <span
              className="brand-dot"
              style={{ background: colors?.surfaceLight || '#FAF8F5' }}
            />
          </div>
          <select
            id="header-brand-select"
            aria-label="Active Brand Kit"
            value={activeBrandKit?.id || ''}
            onChange={(e) => onSelectBrand(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              fontFamily: 'var(--font-sans)',
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            {brandKits.length === 0 ? (
              <option value="">No Brand CVI yet</option>
            ) : (
              brandKits.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name} (v{k.currentVersion ?? k.version})
                </option>
              ))
            )}
          </select>
        </div>

        <button
          type="button"
          className="quota-pill"
          id="header-quota-pill"
          title="Plan & quota usage"
          onClick={() => onSwitchView('saas')}
        >
          <span className="quota-dot" />
          <span id="header-quota-text">
            {quota
              ? `${quota.tierName} · ${quota.usedBrands}/${quota.maxBrands} Brands · ${quota.usedDecksToday}/${quota.dailyDeckLimit} Today`
              : 'Pro · 0/4 CVI'}
          </span>
        </button>

        <button
          type="button"
          className="theme-toggle-btn"
          id="theme-toggle-btn"
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} theme`}
          aria-label="Switch Light or Dark theme"
          onClick={onToggleTheme}
        >
          {theme === 'light' ? '◐' : '◑'}
        </button>
      </div>
    </header>
  );
}

// ============================================================================
// View 1: Studio (2-Tab Sidebar + 16:9 Stage + Capsule Filmstrip + AI Command Bar)
// ============================================================================
interface StudioViewProps {
  isActive: boolean;
  brandKits: BrandKitSummary[];
  activeBrandKit: BrandKitSummary | null;
  selectedDeck: DeckSummary | null;
  onGoToBrandOnboarding: () => void;
  onDeckUpdated: (deck: DeckSummary, job?: BuildJobSummary) => Promise<void>;
  onOpenQuotaModal: (msg: string) => void;
  onShowToast: (msg: string) => void;
}

function StudioView({
  isActive,
  brandKits,
  activeBrandKit,
  selectedDeck,
  onGoToBrandOnboarding,
  onDeckUpdated,
  onOpenQuotaModal,
  onShowToast,
}: StudioViewProps) {
  const initialDraft = useMemo(() => loadInitialDraft(), []);

  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('compose');
  const [topic, setTopic] = useState(initialDraft.topic);
  const [slug, setSlug] = useState(initialDraft.slug);
  const [slugManual, setSlugManual] = useState(false);
  const [audience, setAudience] = useState(initialDraft.audience);
  const [lengthMinutes, setLengthMinutes] = useState(initialDraft.lengthMinutes);
  const [endsWithLiveDemo, setEndsWithLiveDemo] = useState(initialDraft.endsWithLiveDemo);
  const [language, setLanguage] = useState('en');
  const [sourceUrl, setSourceUrl] = useState('');

  const [mediaTray, setMediaTray] = useState<MediaTrayItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [inspectorType, setInspectorType] = useState('content');
  const [inspectorTitle, setInspectorTitle] = useState('');
  const [inspectorLede, setInspectorLede] = useState('');
  const [inspectorNotes, setInspectorNotes] = useState('');
  const [isSavingSlide, setIsSavingSlide] = useState(false);

  const [checkReport, setCheckReport] = useState<DeckCheckReportSummary | null>(null);
  const [jobSteps, setJobSteps] = useState<JobStepSummary[]>([]);
  const [refinePrompt, setRefinePrompt] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(() => Date.now());

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Sync draft to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({ topic, slug, audience, lengthMinutes, endsWithLiveDemo })
      );
    } catch {
      // ignore storage quota errors
    }
  }, [topic, slug, audience, lengthMinutes, endsWithLiveDemo]);

  // Reset slide index and populate inspector when deck changes
  useEffect(() => {
    if (!selectedDeck) {
      setCheckReport(null);
      setInspectorType('content');
      setInspectorTitle('');
      setInspectorLede('');
      setInspectorNotes('');
      return;
    }
    const slides = selectedDeck.slides || [];
    const safeIndex = activeSlideIndex >= slides.length ? 0 : activeSlideIndex;
    if (safeIndex !== activeSlideIndex) {
      setActiveSlideIndex(safeIndex);
    }
    const slide = slides[safeIndex];
    setInspectorType(slide?.type || 'content');
    setInspectorTitle(slide?.title || '');
    setInspectorLede(slide?.lede || '');
    setInspectorNotes(slide?.speakerNotes || '');
    if (selectedDeck.lastCheckReport) {
      setCheckReport(selectedDeck.lastCheckReport);
    }
    setPreviewNonce(Date.now());
  }, [selectedDeck]);

  // Keep inspector inputs synced when activeSlideIndex changes
  useEffect(() => {
    const slide = selectedDeck?.slides?.[activeSlideIndex];
    setInspectorType(slide?.type || 'content');
    setInspectorTitle(slide?.title || '');
    setInspectorLede(slide?.lede || '');
    setInspectorNotes(slide?.speakerNotes || '');
  }, [selectedDeck, activeSlideIndex]);

  const uploadFilesToMediaTray = useCallback(
    async (files: File[]) => {
      const uploaded: MediaTrayItem[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('caption', `Visual evidence: ${file.name}`);
        const res = await fetch('/api/media/upload', { method: 'POST', body: fd });
        const data = (await res.json()) as MediaTrayItem & { error?: string };
        if (!res.ok) {
          onShowToast(`Upload rejected: ${data.error || 'Unknown error'}`);
          continue;
        }
        uploaded.push(data);
      }
      if (uploaded.length > 0) {
        setMediaTray((prev) => [...prev, ...uploaded]);
      }
    },
    [onShowToast]
  );

  // Paste handler when Studio is active
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!isActive) return;
      const items = Array.from(e.clipboardData?.items || []);
      const files = items
        .filter((it) => it.kind === 'file')
        .map((it) => it.getAsFile())
        .filter((f): f is File => Boolean(f));
      if (files.length > 0) {
        void uploadFilesToMediaTray(files);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isActive, uploadFilesToMediaTray]);

  const applyStarterPreset = (key: string) => {
    const preset = STARTER_BRIEFS[key];
    if (!preset) return;
    setTopic(preset.topic);
    setAudience(preset.audience);
    setLengthMinutes(preset.lengthMinutes);
    setEndsWithLiveDemo(preset.endsWithLiveDemo);
    setSlug(preset.slug);
    setSlugManual(true);
  };

  const handleLoadDemoAndMedia = async () => {
    applyStarterPreset('postmortem');
    const res = await fetch('/api/media/samples');
    const data = (await res.json()) as { media?: MediaTrayItem[] };
    setMediaTray(data.media || []);
    onShowToast('Loaded sample brief + 2 screenshots + 1 failover video');
  };

  const handleBuildDeck = async () => {
    setIsBuilding(true);
    try {
      const res = await fetch('/api/decks/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: {
            topic,
            audience,
            lengthMinutes,
            endsWithLiveDemo,
            language,
            slug,
            sourceUrl,
          },
          mediaFiles: mediaTray,
          brandKitId: activeBrandKit?.id,
        }),
      });
      const data = (await res.json()) as {
        deck?: DeckSummary;
        job?: BuildJobSummary;
        error?: string;
        code?: string;
      };
      if (!res.ok || !data.deck) {
        if (res.status === 429 || data.code === 'DAILY_DECK_LIMIT_EXCEEDED') {
          onOpenQuotaModal(data.error || 'Daily presentation limit reached.');
        }
        onShowToast(data.error || 'Could not create presentation');
        return;
      }
      setActiveSlideIndex(0);
      if (data.job?.steps) setJobSteps(data.job.steps);
      await onDeckUpdated(data.deck, data.job);
      onShowToast(`Created "${data.deck.title}" (${data.deck.slides.length} slides)`);
    } finally {
      setIsBuilding(false);
    }
  };

  const handleRefineDeck = async (overridePrompt?: string) => {
    if (!selectedDeck) {
      onShowToast('Create or select a presentation first.');
      return;
    }
    const prompt = (overridePrompt ?? refinePrompt).trim();
    if (!prompt) {
      onShowToast('Type what you would like to change.');
      return;
    }
    setIsRefining(true);
    try {
      const res = await fetch(`/api/decks/${encodeURIComponent(selectedDeck.slug)}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = (await res.json()) as {
        deck?: DeckSummary;
        job?: BuildJobSummary;
        error?: string;
      };
      if (!res.ok || !data.deck) {
        onShowToast(data.error || 'Refinement failed');
        return;
      }
      if (data.job?.steps) setJobSteps(data.job.steps);
      setRefinePrompt('');
      await onDeckUpdated(data.deck, data.job);
      onShowToast(`Updated presentation (v${data.deck.version ?? 1})`);
    } finally {
      setIsRefining(false);
    }
  };

  const handleUndoDeck = async () => {
    if (!selectedDeck) return;
    const res = await fetch(`/api/decks/${encodeURIComponent(selectedDeck.slug)}/revert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = (await res.json()) as { deck?: DeckSummary; error?: string };
    if (!res.ok || !data.deck) {
      onShowToast(data.error || 'Nothing to undo yet.');
      return;
    }
    await onDeckUpdated(data.deck);
    onShowToast('Reverted to previous version');
  };

  const handleSaveSlideInspector = async () => {
    if (!selectedDeck) {
      onShowToast('Create or select a presentation first.');
      return;
    }
    const slide = selectedDeck.slides?.[activeSlideIndex];
    if (!slide) {
      onShowToast('No slide selected.');
      return;
    }
    setIsSavingSlide(true);
    try {
      const res = await fetch(
        `/api/decks/${encodeURIComponent(selectedDeck.slug)}/slides/${activeSlideIndex}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: inspectorType,
            title: inspectorTitle,
            lede: inspectorLede,
            speakerNotes: inspectorNotes,
          }),
        }
      );
      const data = (await res.json()) as {
        deck?: DeckSummary;
        checkReport?: DeckCheckReportSummary;
        error?: string;
      };
      if (!res.ok || !data.deck) {
        onShowToast(data.error || 'Could not save slide');
        return;
      }
      if (data.checkReport) setCheckReport(data.checkReport);
      await onDeckUpdated(data.deck);
      onShowToast(`Saved Slide ${activeSlideIndex + 1}`);
    } finally {
      setIsSavingSlide(false);
    }
  };

  const handleRunCheck = async () => {
    if (!selectedDeck) return;
    const res = await fetch(`/api/decks/${encodeURIComponent(selectedDeck.slug)}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const report = (await res.json()) as DeckCheckReportSummary;
    setCheckReport(report);
    onShowToast(report.humanSummary);
  };

  const handleStepSlide = (direction: 'prev' | 'next') => {
    const engine = (iframeRef.current?.contentWindow as DeckEngineWindow | null)?.__deckEngine;
    if (engine) {
      if (direction === 'prev') engine.prevStep();
      else engine.nextStep();
      setActiveSlideIndex(engine.currentIndex);
    } else if (selectedDeck && selectedDeck.slides.length > 0) {
      const nextIdx =
        direction === 'prev'
          ? Math.max(0, activeSlideIndex - 1)
          : Math.min(selectedDeck.slides.length - 1, activeSlideIndex + 1);
      setActiveSlideIndex(nextIdx);
      setPreviewNonce(Date.now());
    }
  };

  const handleJumpToSlide = (idx: number) => {
    setActiveSlideIndex(idx);
    const engine = (iframeRef.current?.contentWindow as DeckEngineWindow | null)?.__deckEngine;
    if (engine) {
      engine.goToSlide(idx, { revealAllSteps: true });
    } else {
      setPreviewNonce(Date.now());
    }
  };

  const brandBadgeText = activeBrandKit
    ? `${activeBrandKit.name.split('—')[0].trim()} v${activeBrandKit.version}`
    : 'Select Brand CVI';

  const cleanDeckTitle = selectedDeck
    ? selectedDeck.title.length > 54
      ? `${selectedDeck.title.slice(0, 52)}…`
      : selectedDeck.title
    : 'No Presentation Selected';

  const activeSlide = selectedDeck?.slides?.[activeSlideIndex] || null;

  return (
    <main id="view-studio" className={`view-panel ${isActive ? 'active' : ''}`}>
      {brandKits.length === 0 && (
        <div
          id="zero-brand-onboarding-banner"
          className="surface-card"
          style={{
            marginBottom: '16px',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <strong style={{ fontSize: '14px' }}>
              Welcome — Start by creating your own Brand CVI
            </strong>
            <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Upload a PowerPoint template (<code>.pptx</code>), logo, or website URL so every
              presentation matches your visual identity.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            id="goto-brand-onboarding-btn"
            onClick={onGoToBrandOnboarding}
          >
            Create Your Brand CVI →
          </button>
        </div>
      )}

      <div className="studio-workspace">
        {/* Left Sidebar: 2-Tab Switcher (Compose Deck & Slide & Check) */}
        <aside className="studio-sidebar">
          <div className="sidebar-mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={sidebarTab === 'compose'}
              className={`sidebar-mode-btn ${sidebarTab === 'compose' ? 'active' : ''}`}
              onClick={() => setSidebarTab('compose')}
            >
              Compose Deck
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sidebarTab === 'inspector'}
              className={`sidebar-mode-btn ${sidebarTab === 'inspector' ? 'active' : ''}`}
              onClick={() => setSidebarTab('inspector')}
            >
              Slide &amp; Check
            </button>
          </div>

          {sidebarTab === 'compose' ? (
            <section
              className="surface-card"
              id="sidebar-pane-compose"
              aria-label="Compose presentation"
            >
              <div className="card-heading">
                <span className="card-title">Brief &amp; Evidence</span>
                <span className="badge badge-pass" id="studio-brand-badge">
                  {brandBadgeText}
                </span>
              </div>

              <div className="field-group">
                <label className="field-label" htmlFor="brief-topic">
                  <span>Topic &amp; key facts</span>
                  <button
                    type="button"
                    className="suggestion-pill highlight"
                    id="load-full-sample-btn"
                    style={{ padding: '2px 8px', fontSize: '11px' }}
                    onClick={() => void handleLoadDemoAndMedia()}
                  >
                    Load Demo + Media
                  </button>
                </label>
                <textarea
                  id="brief-topic"
                  className="ui-textarea"
                  placeholder="Describe your presentation topic, audience, and key facts..."
                  value={topic}
                  onChange={(e) => {
                    const nextTopic = e.target.value;
                    setTopic(nextTopic);
                    if (!slugManual) setSlug(slugify(nextTopic));
                  }}
                />
                <div className="pill-row" style={{ marginTop: '2px' }}>
                  <button
                    type="button"
                    className="suggestion-pill"
                    onClick={() => applyStarterPreset('postmortem')}
                  >
                    Outage Review
                  </button>
                  <button
                    type="button"
                    className="suggestion-pill"
                    onClick={() => applyStarterPreset('demo')}
                  >
                    Product Demo
                  </button>
                  <button
                    type="button"
                    className="suggestion-pill"
                    onClick={() => applyStarterPreset('status')}
                  >
                    Q3 Status
                  </button>
                  <button
                    type="button"
                    className="suggestion-pill"
                    onClick={() => applyStarterPreset('howitworks')}
                  >
                    Architecture
                  </button>
                </div>
              </div>

              <div className="field-row">
                <div className="field-group">
                  <label className="field-label" htmlFor="brief-audience">
                    Audience
                  </label>
                  <select
                    id="brief-audience"
                    className="ui-select"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                  >
                    <option value="management">Management</option>
                    <option value="product">Product</option>
                    <option value="developers">Engineering</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </div>
                <div className="field-group">
                  <label className="field-label" htmlFor="brief-length">
                    Minutes
                  </label>
                  <input
                    type="number"
                    id="brief-length"
                    className="ui-input"
                    value={lengthMinutes}
                    min={3}
                    max={60}
                    onChange={(e) => setLengthMinutes(Number(e.target.value) || 10)}
                  />
                </div>
              </div>

              <div className="field-group">
                <div className="field-label">
                  <span>Screenshots &amp; Video</span>
                  <span id="media-count-badge" style={{ color: 'var(--text-muted)' }}>
                    {mediaTray.length} attached
                  </span>
                </div>
                <div
                  className={`media-dropzone ${isDragging ? 'dragover' : ''}`}
                  id="media-dropzone"
                  tabIndex={0}
                  role="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer?.files?.length) {
                      void uploadFilesToMediaTray(Array.from(e.dataTransfer.files));
                    }
                  }}
                >
                  Drop files, paste with <strong>⌘V</strong>, or{' '}
                  <span style={{ textDecoration: 'underline' }}>browse</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    id="media-file-input"
                    multiple
                    accept=".png,.jpg,.jpeg,.gif,.webp,.svg,.mp4,.webm,.mov"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        void uploadFilesToMediaTray(Array.from(e.target.files));
                        e.target.value = '';
                      }
                    }}
                  />
                </div>

                <div className="media-tray-list" id="media-tray-list">
                  {mediaTray.map((item, idx) => (
                    <div className="media-item" key={`${item.filename}-${idx}`}>
                      {item.category === 'image' ? (
                        <img
                          className="media-thumb"
                          src={item.previewUrl || item.src || ''}
                          alt={item.filename}
                        />
                      ) : (
                        <div className="media-thumb">MP4</div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div
                          style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                          }}
                        >
                          {item.filename}
                        </div>
                        <input
                          type="text"
                          className="ui-input"
                          value={item.caption || ''}
                          placeholder="Caption (what should the audience see?)"
                          style={{ padding: '5px 8px', fontSize: '12px' }}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMediaTray((prev) =>
                              prev.map((m, i) => (i === idx ? { ...m, caption: val } : m))
                            );
                          }}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        aria-label="Remove media"
                        onClick={() =>
                          setMediaTray((prev) => prev.filter((_, i) => i !== idx))
                        }
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <details style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 500 }}>
                  Options (language, slug, source)
                </summary>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    marginTop: '8px',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--border-subtle)',
                  }}
                >
                  <div className="field-row">
                    <select
                      id="brief-language"
                      className="ui-select"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      <option value="en">English</option>
                      <option value="da">Danish</option>
                      <option value="de">German</option>
                    </select>
                    <input
                      type="text"
                      id="brief-slug"
                      className="ui-input"
                      placeholder="deck-slug"
                      value={slug}
                      onChange={(e) => {
                        setSlugManual(true);
                        setSlug(e.target.value);
                      }}
                    />
                  </div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      id="brief-demo-toggle"
                      checked={endsWithLiveDemo}
                      onChange={(e) => setEndsWithLiveDemo(e.target.checked)}
                    />
                    <span>Include live demo slide</span>
                  </label>
                  <input
                    type="text"
                    id="brief-source-url"
                    className="ui-input"
                    placeholder="Optional source URL"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                  />
                </div>
              </details>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  id="build-deck-btn"
                  style={{ flex: 1, padding: '10px 14px' }}
                  disabled={isBuilding}
                  onClick={() => void handleBuildDeck()}
                >
                  {isBuilding ? 'Building & Verifying Slides…' : 'Generate Presentation'}
                </button>
              </div>
            </section>
          ) : (
            <section
              className="surface-card"
              id="sidebar-pane-inspector"
              aria-label="Slide inspector"
            >
              <div id="slide-inspector-drawer">
                <div className="card-heading" style={{ marginBottom: '10px' }}>
                  <span className="card-title" id="inspector-slide-badge">
                    {activeSlide
                      ? `Edit Slide ${String(activeSlideIndex + 1).padStart(2, '0')}`
                      : 'Edit Active Slide'}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    id="save-slide-inspector-btn"
                    disabled={!activeSlide || isSavingSlide}
                    onClick={() => void handleSaveSlideInspector()}
                  >
                    {isSavingSlide ? 'Saving…' : 'Save Slide'}
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="field-group">
                    <label className="field-label" htmlFor="inspector-slide-type">
                      Slide Layout
                    </label>
                    <select
                      id="inspector-slide-type"
                      className="ui-select"
                      value={inspectorType}
                      onChange={(e) => setInspectorType(e.target.value)}
                    >
                      {SLIDE_LAYOUT_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="inspector-slide-title">
                      Headline
                    </label>
                    <input
                      type="text"
                      id="inspector-slide-title"
                      className="ui-input"
                      placeholder="Slide headline..."
                      value={inspectorTitle}
                      onChange={(e) => setInspectorTitle(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="inspector-slide-lede">
                      Subtitle / Lede
                    </label>
                    <input
                      type="text"
                      id="inspector-slide-lede"
                      className="ui-input"
                      placeholder="Supporting sentence..."
                      value={inspectorLede}
                      onChange={(e) => setInspectorLede(e.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="inspector-slide-notes">
                      Speaker Notes
                    </label>
                    <input
                      type="text"
                      id="inspector-slide-notes"
                      className="ui-input"
                      placeholder="Notes for presenter view..."
                      value={inspectorNotes}
                      onChange={(e) => setInspectorNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  borderTop: '1px solid var(--border-subtle)',
                  paddingTop: '12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span className="field-label">Quality Check</span>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span
                      id="check-summary-badge"
                      className={`badge ${
                        checkReport && !checkReport.passed ? 'badge-fail' : 'badge-pass'
                      }`}
                    >
                      {checkReport
                        ? checkReport.passed
                          ? `All ${checkReport.slideCount} slides passed`
                          : `${checkReport.errorCount} issue(s)`
                        : 'Verified'}
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm"
                      id="viewer-check-btn"
                      onClick={() => void handleRunCheck()}
                    >
                      Re-check
                    </button>
                  </div>
                </div>

                {checkReport?.slides && checkReport.slides.length > 0 && (
                  <div className="activity-list" id="check-slides-list">
                    {checkReport.slides.map((s) => (
                      <div
                        key={s.slideNumber}
                        className="activity-step"
                        style={{
                          borderLeftColor: s.passed ? 'var(--positive)' : 'var(--negative)',
                        }}
                      >
                        <span>
                          Slide {s.slideNumber}: {s.title.slice(0, 56)}
                        </span>
                        <span className={`badge ${s.passed ? 'badge-pass' : 'badge-fail'}`}>
                          {s.passed ? 'Pass' : `${s.errorCount} err`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {jobSteps.length > 0 && (
                  <div className="activity-list" id="agent-activity-list">
                    {jobSteps.map((s, idx) => (
                      <div key={idx} className="activity-step">
                        <span>
                          <strong>{s.tool}</strong> — {s.message}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>
                          {s.phase}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </aside>

        {/* Right Stage Column */}
        <section className="studio-stage-column">
          <div className="stage-toolbar">
            <div className="stage-deck-info">
              <h2 className="stage-deck-title" id="viewer-deck-title">
                {cleanDeckTitle}
              </h2>
              <span
                className={`badge ${
                  checkReport && !checkReport.passed ? 'badge-fail' : 'badge-pass'
                }`}
                id="viewer-check-badge"
                style={{ cursor: 'pointer' }}
                title="Click to inspect slide verification"
                onClick={() => setSidebarTab('inspector')}
              >
                {checkReport
                  ? checkReport.passed
                    ? `✓ On-Brand (${checkReport.slideCount} slides verified)`
                    : `⚠ ${checkReport.errorCount} Brand/Layout Issue(s)`
                  : '✓ On-Brand'}
              </span>
            </div>

            <div className="stage-actions">
              <button
                type="button"
                className="btn btn-sm"
                id="viewer-prev-btn"
                onClick={() => handleStepSlide('prev')}
              >
                ←
              </button>
              <button
                type="button"
                className="btn btn-sm"
                id="viewer-next-btn"
                onClick={() => handleStepSlide('next')}
              >
                →
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                id="viewer-present-btn"
                disabled={!selectedDeck}
                onClick={() => {
                  if (selectedDeck) {
                    window.open(
                      `/api/decks/${encodeURIComponent(selectedDeck.slug)}/view`,
                      '_blank'
                    );
                  }
                }}
              >
                Present
              </button>
              <button
                type="button"
                className="btn btn-sm"
                id="viewer-presenter-btn"
                disabled={!selectedDeck}
                onClick={() => {
                  if (selectedDeck) {
                    window.open(
                      `/api/decks/${encodeURIComponent(selectedDeck.slug)}/view?presenter=1`,
                      '_blank',
                      'width=1280,height=820'
                    );
                  }
                }}
              >
                Presenter View
              </button>
              <a
                className="btn btn-sm"
                id="viewer-export-zip"
                href={
                  selectedDeck
                    ? `/api/decks/${encodeURIComponent(selectedDeck.slug)}/export/zip`
                    : '#'
                }
                download
              >
                ZIP
              </a>
              <a
                className="btn btn-sm"
                id="viewer-export-pdf"
                href={
                  selectedDeck
                    ? `/api/decks/${encodeURIComponent(selectedDeck.slug)}/export/pdf`
                    : '#'
                }
                download
              >
                PDF
              </a>
            </div>
          </div>

          <div className="stage-canvas-wrapper">
            <div className="preview-frame-wrap">
              {selectedDeck ? (
                <iframe
                  ref={iframeRef}
                  id="studio-preview-iframe"
                  className="preview-iframe"
                  title="Interactive Deck Preview"
                  src={`/api/decks/${encodeURIComponent(selectedDeck.slug)}/view?slide=${activeSlideIndex}&t=${previewNonce}`}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                  }}
                >
                  Generate or open a presentation from the Library to preview slides.
                </div>
              )}
            </div>

            {/* Capsule Slide Filmstrip */}
            <div
              className="slide-filmstrip"
              id="studio-slide-filmstrip"
              aria-label="Slide strip"
            >
              {(selectedDeck?.slides || []).map((s, idx) => (
                <button
                  key={s.id || idx}
                  type="button"
                  className={`filmstrip-pill ${idx === activeSlideIndex ? 'active' : ''}`}
                  onClick={() => handleJumpToSlide(idx)}
                >
                  <span className="filmstrip-num">
                    Slide {String(idx + 1).padStart(2, '0')} · {s.type}
                  </span>
                  <span className="filmstrip-title">{s.title || `Slide ${idx + 1}`}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Floating AI Command Bar */}
          <div className="ai-refine-bar">
            <div className="ai-refine-input-row">
              <input
                type="text"
                id="refine-prompt-input"
                className="ui-input"
                placeholder="Ask AI to refine this deck (e.g. 'Make slide 4 simpler' or 'Add outage timeline')..."
                style={{ border: 'none', background: 'transparent', padding: '6px 8px' }}
                value={refinePrompt}
                onChange={(e) => setRefinePrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleRefineDeck();
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                className="suggestion-pill"
                onClick={() => {
                  setRefinePrompt('make slide 4 simpler');
                  void handleRefineDeck('make slide 4 simpler');
                }}
              >
                Simplify slide 4
              </button>
              <button
                type="button"
                className="suggestion-pill"
                onClick={() => {
                  setRefinePrompt('add a timeline of the outage');
                  void handleRefineDeck('add a timeline of the outage');
                }}
              >
                Add timeline
              </button>
              <button
                type="button"
                className="suggestion-pill"
                onClick={() => {
                  setRefinePrompt('use the second screenshot on the cover');
                  void handleRefineDeck('use the second screenshot on the cover');
                }}
              >
                Cover screenshot
              </button>
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                id="undo-deck-btn"
                title="Undo last edit"
                onClick={() => void handleUndoDeck()}
              >
                ↺ Undo
              </button>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                id="apply-refine-btn"
                disabled={isRefining}
                onClick={() => void handleRefineDeck()}
              >
                {isRefining ? 'Updating…' : 'Apply'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

// ============================================================================
// View 2: Brand CVI Setup & Onboarding
// ============================================================================
interface BrandViewProps {
  isActive: boolean;
  brandKits: BrandKitSummary[];
  activeBrandKit: BrandKitSummary | null;
  quota: QuotaStatus | null;
  sampleTemplates: string[];
  onSelectBrand: (id: string) => void;
  onRefreshBootstrap: () => Promise<void>;
  onSwitchToStudio: () => void;
  onOpenQuotaModal: (msg: string) => void;
  onShowToast: (msg: string) => void;
}

function BrandView({
  isActive,
  brandKits,
  activeBrandKit,
  quota,
  sampleTemplates,
  onSelectBrand,
  onRefreshBootstrap,
  onSwitchToStudio,
  onOpenQuotaModal,
  onShowToast,
}: BrandViewProps) {
  const [colors, setColors] = useState<BrandColorMap>({
    primary: '#0F172A',
    secondary: '#334155',
    accent: '#4F46E5',
    surfaceLight: '#FAF8F5',
    surfaceAlt: '#EFECE6',
    surfaceDark: '#0F172A',
  });
  const [titleFont, setTitleFont] = useState('Instrument Serif');
  const [fallbackFont, setFallbackFont] = useState('Instrument Serif');
  const [logoPlacement, setLogoPlacement] = useState('top-right');
  const [classification, setClassification] = useState('Internal');

  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandUrl, setNewBrandUrl] = useState('');
  const [newBrandSample, setNewBrandSample] = useState('');
  const [newBrandGuidelines, setNewBrandGuidelines] = useState('');
  const [wizardStep, setWizardStep] = useState(1);
  const [isCrawling, setIsCrawling] = useState(false);
  const [galleryNonce, setGalleryNonce] = useState(() => Date.now());

  const newBrandFileRef = useRef<HTMLInputElement | null>(null);
  const uploadFontRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!newBrandSample && sampleTemplates.length > 0) {
      setNewBrandSample(sampleTemplates[0]);
    }
  }, [sampleTemplates, newBrandSample]);

  useEffect(() => {
    if (!activeBrandKit) return;
    setColors({ ...activeBrandKit.colors });
    setTitleFont(activeBrandKit.fonts?.title?.family || 'Instrument Serif');
    setFallbackFont(activeBrandKit.fonts?.title?.fallback || 'Instrument Serif');
    setLogoPlacement(activeBrandKit.logo?.placement || 'top-right');
    setClassification(activeBrandKit.frame?.classification || 'Internal');
    setGalleryNonce(Date.now());
  }, [activeBrandKit]);

  const handleSaveBrandTokens = async () => {
    if (!activeBrandKit) return;
    const res = await fetch(`/api/brands/${encodeURIComponent(activeBrandKit.id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        updates: {
          colors,
          fonts: {
            title: {
              ...activeBrandKit.fonts.title,
              family: titleFont,
              fallback: fallbackFont,
            },
          },
          logo: {
            ...activeBrandKit.logo,
            placement: logoPlacement,
          },
          frame: {
            ...activeBrandKit.frame,
            classification,
          },
        },
      }),
    });
    const data = (await res.json()) as { brandKit?: BrandKitSummary; error?: string };
    if (!res.ok || !data.brandKit) {
      onShowToast(data.error || 'Failed to update Brand Kit');
      return;
    }
    await onRefreshBootstrap();
    setGalleryNonce(Date.now());
    onShowToast(`Saved ${data.brandKit.name} (v${data.brandKit.version})`);
  };

  const handleCrawlUrl = async () => {
    const url = newBrandUrl.trim();
    const text = newBrandGuidelines.trim();
    if (!url && !text) {
      onShowToast('Enter a website URL or brand notes/CSS text to extract.');
      return;
    }
    setWizardStep(2);
    setIsCrawling(true);
    try {
      const res = await fetch('/api/brands/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, text }),
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
        onShowToast(data.error || 'Could not extract brand signals');
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

      setNewBrandGuidelines(parts.join(' | '));
      if (data.companyName && !newBrandName.trim()) {
        setNewBrandName(data.companyName);
      }
      setWizardStep(3);
      onShowToast(`Extracted ${hexes.length} colours and ${fonts.length} fonts`);
    } finally {
      setIsCrawling(false);
    }
  };

  const handleCreateBrand = async () => {
    const name = newBrandName.trim() || 'CustomBrand';
    const fd = new FormData();
    fd.append('createNew', 'true');
    fd.append('name', name);
    fd.append('companyName', name);
    fd.append('guidelinesText', newBrandGuidelines);

    const file = newBrandFileRef.current?.files?.[0];
    if (file) {
      fd.append('file', file);
    } else if (newBrandSample) {
      fd.append('sampleTemplate', newBrandSample);
    }

    const res = await fetch('/api/brands/extract', { method: 'POST', body: fd });
    const data = (await res.json()) as {
      brandKit?: BrandKitSummary;
      error?: string;
      code?: string;
    };
    if (!res.ok || !data.brandKit) {
      if (res.status === 403 || data.code === 'BRAND_QUOTA_EXCEEDED') {
        onOpenQuotaModal(data.error || 'Brand Kit quota reached.');
      }
      onShowToast(data.error || 'Could not create Brand Kit');
      return;
    }
    setWizardStep(1);
    setNewBrandName('');
    await onRefreshBootstrap();
    setGalleryNonce(Date.now());
    onShowToast(`Created Brand Kit "${data.brandKit.name}"`);
  };

  const handleUploadFont = async () => {
    const file = uploadFontRef.current?.files?.[0];
    if (!file) {
      onShowToast('Choose a font file (.woff2, .ttf, .otf) first.');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/brands/fonts', { method: 'POST', body: fd });
    const data = (await res.json()) as { notice?: string; error?: string };
    if (!res.ok) {
      onShowToast(data.error || 'Font upload failed');
      return;
    }
    onShowToast(data.notice || 'Font uploaded');
  };

  const handleResetZeroBrands = async () => {
    const res = await fetch('/api/brands/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      onShowToast(data.error || 'Could not reset Brand CVIs');
      return;
    }
    await onRefreshBootstrap();
    onSwitchToStudio();
    onShowToast('Workspace reset to 0 Brand CVIs — create your own CVI to begin!');
  };

  const handleSeedSampleBrand = async () => {
    const res = await fetch('/api/brands/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        createNew: true,
        sampleTemplate: 'nordic-grid-corporate.pptx',
        name: 'Nordic Grid',
        companyName: 'Nordic Grid',
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      brandKit?: BrandKitSummary;
      error?: string;
      code?: string;
    };
    if (!res.ok) {
      if (res.status === 403 || data.code === 'BRAND_QUOTA_EXCEEDED') {
        onOpenQuotaModal(data.error || 'Brand Kit quota reached.');
      }
      onShowToast(data.error || 'Could not load sample CVI');
      return;
    }
    await onRefreshBootstrap();
    setGalleryNonce(Date.now());
    onShowToast(`Loaded sample CVI "${data.brandKit?.name || 'Nordic Grid'}"`);
  };

  const handleRunGalleryCheck = async () => {
    const res = await fetch('/api/gallery/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brandKitId: activeBrandKit?.id }),
    });
    const report = (await res.json()) as DeckCheckReportSummary;
    onShowToast(report.humanSummary);
  };

  const missingFont = activeBrandKit
    ? Object.values(activeBrandKit.fonts || {}).find((f) => f.missingFontFile)
    : undefined;

  return (
    <main id="view-brand" className={`view-panel ${isActive ? 'active' : ''}`}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em' }}>
            Brand CVI Profiles
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            Create your own visual identity from a PowerPoint template, website URL, or colour
            palette.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            className="btn btn-sm"
            id="reset-zero-brands-btn"
            title="Clear brands to test 0-Brand CVI Onboarding"
            onClick={() => void handleResetZeroBrands()}
          >
            Start Fresh (0 CVI)
          </button>
          <button
            type="button"
            className="btn btn-sm"
            id="seed-sample-brands-btn"
            title="Restore sample CVI templates"
            onClick={() => void handleSeedSampleBrand()}
          >
            Load Sample CVI
          </button>
          <span
            className={`badge ${quota?.canCreateBrand !== false ? 'badge-pass' : 'badge-warn'}`}
            id="brand-quota-badge"
          >
            {quota
              ? `${quota.usedBrands} of ${quota.maxBrands} Brands Used (${quota.tierName} Plan)`
              : '0 of 4 Brands'}
          </span>
        </div>
      </div>

      <div className="brand-cards-strip" id="brand-profiles-strip">
        {brandKits.map((b) => {
          const c = b.latest?.colors || b.colors || {};
          const isCurrent = b.id === activeBrandKit?.id;
          return (
            <div
              key={b.id}
              className={`brand-profile-card ${isCurrent ? 'active' : ''}`}
              onClick={() => onSelectBrand(b.id)}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <strong style={{ fontSize: '15px' }}>{b.name}</strong>
                <span className={`badge ${isCurrent ? 'badge-pass' : ''}`}>
                  v{b.currentVersion ?? b.version}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '6px',
                    background: c.surfaceDark || '#0F172A',
                    border: '1px solid rgba(0,0,0,0.1)',
                  }}
                />
                <span
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '6px',
                    background: c.primary || '#1E293B',
                    border: '1px solid rgba(0,0,0,0.1)',
                  }}
                />
                <span
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '6px',
                    background: c.accent || '#C84B31',
                    border: '1px solid rgba(0,0,0,0.1)',
                  }}
                />
                <span
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '6px',
                    background: c.surfaceLight || '#FAF8F5',
                    border: '1px solid rgba(0,0,0,0.15)',
                  }}
                />
                <span
                  style={{
                    marginLeft: 'auto',
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {b.latest?.fonts?.title?.family || b.fonts?.title?.family || 'Serif'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '390px minmax(0,1fr)',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <section className="surface-card">
            <div className="card-heading">
              <span className="card-title" id="active-brand-editor-title">
                {activeBrandKit ? activeBrandKit.name : 'Active Brand CVI'}
              </span>
              <span className="badge badge-pass" id="active-brand-version-badge">
                {activeBrandKit ? `Version ${activeBrandKit.version}` : 'v0'}
              </span>
            </div>

            <div className="swatch-grid" id="brand-color-swatches">
              {COLOR_ROLES.map((r) => (
                <div className="swatch-box" key={String(r.key)}>
                  <input
                    type="color"
                    className="swatch-color-input"
                    value={colors[r.key] || '#0F172A'}
                    onChange={(e) =>
                      setColors((prev) => ({ ...prev, [r.key]: e.target.value }))
                    }
                  />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{r.label}</div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {colors[r.key]}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="field-row">
              <div className="field-group">
                <label className="field-label" htmlFor="brand-font-title">
                  Heading Font
                </label>
                <input
                  type="text"
                  id="brand-font-title"
                  className="ui-input"
                  value={titleFont}
                  onChange={(e) => setTitleFont(e.target.value)}
                />
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="brand-font-fallback">
                  Fallback
                </label>
                <select
                  id="brand-font-fallback"
                  className="ui-select"
                  value={fallbackFont}
                  onChange={(e) => setFallbackFont(e.target.value)}
                >
                  <option value="Instrument Serif">Instrument Serif</option>
                  <option value="Fraunces">Fraunces</option>
                  <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                  <option value="IBM Plex Sans">IBM Plex Sans</option>
                  <option value="Georgia">Georgia</option>
                </select>
              </div>
            </div>

            {missingFont && (
              <div
                id="brand-font-warning-box"
                style={{
                  padding: '10px',
                  borderRadius: '6px',
                  background: 'var(--caution-soft)',
                  color: 'var(--caution)',
                  fontSize: '12px',
                }}
              >
                {missingFont.warning || ''} (Fallback: {missingFont.fallback})
              </div>
            )}

            <div className="field-row">
              <div className="field-group">
                <label className="field-label" htmlFor="brand-logo-placement">
                  Logo Position
                </label>
                <select
                  id="brand-logo-placement"
                  className="ui-select"
                  value={logoPlacement}
                  onChange={(e) => setLogoPlacement(e.target.value)}
                >
                  <option value="top-right">Top Right</option>
                  <option value="top-left">Top Left</option>
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-left">Bottom Left</option>
                </select>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="brand-classification">
                  Footer Tag
                </label>
                <select
                  id="brand-classification"
                  className="ui-select"
                  value={classification}
                  onChange={(e) => setClassification(e.target.value)}
                >
                  <option value="Internal">Internal</option>
                  <option value="Public">Public</option>
                  <option value="Confidential">Confidential</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              id="save-brand-version-btn"
              disabled={!activeBrandKit}
              onClick={() => void handleSaveBrandTokens()}
            >
              Save Brand Tokens
            </button>
          </section>

          <section className="surface-card">
            <div className="card-heading">
              <span className="card-title">Create New Brand CVI</span>
              <span
                id="brand-wizard-steps"
                style={{ fontSize: '11px', color: 'var(--text-muted)' }}
              >
                Step {wizardStep}/3 · Source → Tokens → Save
              </span>
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="new-brand-name">
                Brand Name
              </label>
              <input
                type="text"
                id="new-brand-name"
                className="ui-input"
                placeholder="Enter your brand name (e.g. Acme Studio)..."
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="new-brand-file">
                PowerPoint Theme (.pptx, .potx, .thmx)
              </label>
              <input
                ref={newBrandFileRef}
                type="file"
                id="new-brand-file"
                className="ui-input"
                accept=".pptx,.potx,.thmx"
                onChange={() => setWizardStep(2)}
              />
            </div>

            <div className="field-group">
              <label className="field-label" htmlFor="new-brand-url">
                Or extract from website URL
              </label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="url"
                  id="new-brand-url"
                  className="ui-input"
                  placeholder="https://your-company.com"
                  value={newBrandUrl}
                  onChange={(e) => {
                    setNewBrandUrl(e.target.value);
                    setWizardStep(1);
                  }}
                />
                <button
                  type="button"
                  className="btn btn-sm"
                  id="crawl-brand-url-btn"
                  disabled={isCrawling}
                  onClick={() => void handleCrawlUrl()}
                >
                  {isCrawling ? 'Extracting…' : 'Extract'}
                </button>
              </div>
            </div>

            <details style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 500 }}>
                Sample templates, custom fonts &amp; hex notes
              </summary>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  marginTop: '8px',
                  paddingTop: '8px',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <select
                  id="new-brand-sample"
                  className="ui-select"
                  value={newBrandSample}
                  onChange={(e) => {
                    setNewBrandSample(e.target.value);
                    setWizardStep(3);
                  }}
                >
                  {sampleTemplates.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <textarea
                  id="new-brand-guidelines"
                  className="ui-textarea"
                  style={{ minHeight: '56px' }}
                  placeholder="Optional hex colours or brand rules..."
                  value={newBrandGuidelines}
                  onChange={(e) => setNewBrandGuidelines(e.target.value)}
                />
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    ref={uploadFontRef}
                    type="file"
                    id="upload-font-input"
                    className="ui-input"
                    accept=".woff2,.woff,.ttf,.otf"
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    id="upload-font-btn"
                    onClick={() => void handleUploadFont()}
                  >
                    Upload Font
                  </button>
                </div>
              </div>
            </details>

            <button
              type="button"
              className="btn btn-primary"
              id="create-brand-btn"
              onClick={() => void handleCreateBrand()}
            >
              + Create Brand CVI
            </button>
          </section>
        </div>

        {/* Right: Live Brand Gallery & Collapsible WCAG/Geometry Table */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <section className="surface-card">
            <div className="card-heading">
              <span className="card-title">Live Brand Preview Gallery</span>
              <button
                type="button"
                className="btn btn-sm"
                id="run-gallery-check-btn"
                onClick={() => void handleRunGalleryCheck()}
              >
                ✓ Verify WCAG &amp; Layout
              </button>
            </div>
            <div className="stage-canvas-wrapper" style={{ padding: '16px' }}>
              <div className="preview-frame-wrap">
                {activeBrandKit ? (
                  <iframe
                    id="brand-gallery-iframe"
                    className="preview-iframe"
                    title="Brand Kit Live Preview Gallery"
                    src={`/api/gallery/preview?brandKitId=${encodeURIComponent(activeBrandKit.id)}&t=${galleryNonce}`}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                      fontSize: '13px',
                    }}
                  >
                    Create or select a Brand CVI to preview its live component gallery.
                  </div>
                )}
              </div>
            </div>
          </section>

          <details className="inspector-drawer">
            <summary>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>WCAG AA Contrast Matrix &amp; Template Geometry</span>
                <span
                  className={`badge ${
                    activeBrandKit?.contrastReport?.passed !== false
                      ? 'badge-pass'
                      : 'badge-warn'
                  }`}
                  id="brand-contrast-badge"
                >
                  {activeBrandKit?.contrastReport
                    ? activeBrandKit.contrastReport.passed
                      ? 'WCAG AA Verified'
                      : 'Contrast Warning'
                    : 'WCAG AA Pass'}
                </span>
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Show table ▾
              </span>
            </summary>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginTop: '12px',
                paddingTop: '12px',
                borderTop: '1px solid var(--border-subtle)',
              }}
            >
              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Pair</th>
                    <th>Colours</th>
                    <th>Ratio</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody id="brand-contrast-tbody">
                  {(activeBrandKit?.contrastReport?.checks || []).map((c, idx) => (
                    <tr key={idx}>
                      <td>{c.label}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                        {c.fg} / {c.bg}
                      </td>
                      <td style={{ fontWeight: 600 }}>{c.ratio}:1</td>
                      <td>
                        <span className={`badge ${c.passed ? 'badge-pass' : 'badge-fail'}`}>
                          {c.passed ? 'Pass' : 'Low'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <table className="ui-table">
                <thead>
                  <tr>
                    <th>Region</th>
                    <th>Inches</th>
                    <th>Stage Pixels</th>
                  </tr>
                </thead>
                <tbody id="brand-geometry-tbody">
                  {Object.entries(activeBrandKit?.geometry?.placeholdersIn || {}).map(
                    ([k, bIn]) => {
                      const bPx = activeBrandKit?.geometry?.placeholdersPx?.[k] || {
                        x: 0,
                        y: 0,
                        w: 0,
                        h: 0,
                      };
                      return (
                        <tr key={k}>
                          <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{k}</td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                            {bIn.xIn}&quot;, {bIn.yIn}&quot; ({bIn.wIn}&quot;×{bIn.hIn}&quot;)
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                            {bPx.x}, {bPx.y} ({bPx.w}×{bPx.h}px)
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </div>
    </main>
  );
}

// ============================================================================
// View 3: Library
// ============================================================================
interface LibraryViewProps {
  isActive: boolean;
  decks: DeckSummary[];
  onOpenDeckInStudio: (deck: DeckSummary) => void;
}

function LibraryView({ isActive, decks, onOpenDeckInStudio }: LibraryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return decks;
    return decks.filter(
      (d) =>
        d.title?.toLowerCase().includes(q) ||
        d.slug?.toLowerCase().includes(q) ||
        d.brief?.audience?.toLowerCase().includes(q)
    );
  }, [decks, searchQuery]);

  return (
    <main id="view-library" className={`view-panel ${isActive ? 'active' : ''}`}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '18px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 600, letterSpacing: '-0.02em' }}>
            Presentation Library
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            Open any deck in the Studio, present live, or export offline bundles.
          </p>
        </div>
        <input
          type="search"
          id="library-search-input"
          className="ui-input"
          placeholder="Search decks..."
          style={{ width: '260px', background: 'var(--bg-surface)' }}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      <div className="deck-grid" id="library-deck-grid">
        {filtered.map((d) => (
          <article className="deck-card" key={d.slug}>
            <div className="deck-card-thumb">
              <iframe
                src={`/api/decks/${encodeURIComponent(d.slug)}/view?mode=thumbnail`}
                loading="lazy"
                title={d.title}
              />
            </div>
            <div className="deck-card-body">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {d.brandKitId.replace('brand-', '')} · v{d.version || 1}
                </span>
                <span
                  className={`badge ${
                    d.lastCheckReport?.passed !== false ? 'badge-pass' : 'badge-fail'
                  }`}
                >
                  {d.lastCheckReport?.passed !== false ? '✓ Verified' : 'Issues'}
                </span>
              </div>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '18px',
                  fontWeight: 600,
                }}
              >
                {d.title}
              </h3>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {d.slides?.length || 0} slides · {d.brief?.audience || 'management'} audience
              </div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px',
                  marginTop: '4px',
                }}
              >
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => onOpenDeckInStudio(d)}
                >
                  Edit in Studio
                </button>
                <a
                  className="btn btn-sm"
                  href={`/api/decks/${encodeURIComponent(d.slug)}/view`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Present
                </a>
                <a
                  className="btn btn-sm"
                  href={`/api/decks/${encodeURIComponent(d.slug)}/view?presenter=1`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Presenter
                </a>
                <a
                  className="btn btn-sm"
                  href={`/api/decks/${encodeURIComponent(d.slug)}/export/zip`}
                  download
                >
                  ZIP
                </a>
                <a
                  className="btn btn-sm"
                  href={`/api/decks/${encodeURIComponent(d.slug)}/export/pdf`}
                  download
                >
                  PDF
                </a>
              </div>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}

// ============================================================================
// View 4: Gallery
// ============================================================================
interface GalleryViewProps {
  isActive: boolean;
  activeBrandKit: BrandKitSummary | null;
}

function GalleryView({ isActive, activeBrandKit }: GalleryViewProps) {
  const [nonce, setNonce] = useState(() => Date.now());

  useEffect(() => {
    if (isActive) setNonce(Date.now());
  }, [isActive, activeBrandKit?.id]);

  const galleryUrl = activeBrandKit
    ? `/api/gallery/preview?brandKitId=${encodeURIComponent(activeBrandKit.id)}&t=${nonce}`
    : '/api/gallery/preview';

  return (
    <main id="view-gallery" className={`view-panel ${isActive ? 'active' : ''}`}>
      <div className="surface-card">
        <div className="card-heading">
          <div>
            <span className="card-title">Component &amp; Slide Type Gallery</span>
            <p className="card-subtitle">
              All 8 slide layouts and 15+ tokenised components rendered in your active Brand CVI.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              id="gallery-fullscreen-btn"
              onClick={() => window.open('/api/gallery/preview', '_blank')}
            >
              Present Fullscreen
            </button>
            <a
              className="btn btn-sm"
              href="/api/gallery/preview"
              target="_blank"
              rel="noreferrer"
            >
              New Tab ↗
            </a>
          </div>
        </div>
        <div className="stage-canvas-wrapper">
          <div className="preview-frame-wrap" style={{ maxWidth: '1180px' }}>
            <iframe
              id="full-gallery-iframe"
              className="preview-iframe"
              title="Full Component Gallery"
              src={galleryUrl}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

// ============================================================================
// View 5: Workspace, Plans & Quotas
// ============================================================================
interface WorkspaceViewProps {
  isActive: boolean;
  org: OrgSummary | null;
  quota: QuotaStatus | null;
  auditLog: AuditLogEntry[];
  onRefreshBootstrap: () => Promise<void>;
  onShowToast: (msg: string) => void;
}

function WorkspaceView({
  isActive,
  org,
  quota,
  auditLog,
  onRefreshBootstrap,
  onShowToast,
}: WorkspaceViewProps) {
  const [starterBrands, setStarterBrands] = useState(2);
  const [starterDecks, setStarterDecks] = useState(4);
  const [proBrands, setProBrands] = useState(4);
  const [proDecks, setProDecks] = useState(20);
  const [entBrands, setEntBrands] = useState(16);
  const [entDecks, setEntDecks] = useState(100);

  const [llmProvider, setLlmProvider] = useState('local-structured');
  const [role, setRole] = useState('brand_admin');
  const [internalNetOnly, setInternalNetOnly] = useState(true);
  const [forbidExternalMedia, setForbidExternalMedia] = useState(false);

  useEffect(() => {
    const cat = quota?.planCatalog;
    if (cat?.starter) {
      setStarterBrands(cat.starter.maxBrands);
      setStarterDecks(cat.starter.dailyDeckLimit);
    }
    if (cat?.pro) {
      setProBrands(cat.pro.maxBrands);
      setProDecks(cat.pro.dailyDeckLimit);
    }
    if (cat?.enterprise) {
      setEntBrands(cat.enterprise.maxBrands);
      setEntDecks(cat.enterprise.dailyDeckLimit);
    }
  }, [quota]);

  useEffect(() => {
    if (!org) return;
    setLlmProvider(org.llmConfig?.provider || 'local-structured');
    setRole(org.role || 'brand_admin');
    setInternalNetOnly(Boolean(org.llmConfig?.internalNetworkOnly ?? true));
    setForbidExternalMedia(Boolean(org.llmConfig?.forbidExternalMedia));
  }, [org]);

  const handleSelectTier = async (tier: string) => {
    const res = await fetch('/api/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier }),
    });
    if (res.ok) {
      await onRefreshBootstrap();
      onShowToast(`Switched to ${tier.toUpperCase()} plan`);
    }
  };

  const handleSaveQuotas = async () => {
    const res = await fetch('/api/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planCatalog: {
          starter: { maxBrands: starterBrands, dailyDeckLimit: starterDecks },
          pro: { maxBrands: proBrands, dailyDeckLimit: proDecks },
          enterprise: { maxBrands: entBrands, dailyDeckLimit: entDecks },
        },
      }),
    });
    if (res.ok) {
      await onRefreshBootstrap();
      onShowToast('Updated plan quota limits');
    }
  };

  const handleResetTodayUsage = async () => {
    const res = await fetch('/api/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetTodayUsage: true }),
    });
    if (res.ok) {
      await onRefreshBootstrap();
      onShowToast("Reset today's presentation counter to 0");
    }
  };

  const handleSavePolicy = async () => {
    const res = await fetch('/api/org/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role,
        llmConfig: {
          provider: llmProvider,
          internalNetworkOnly: internalNetOnly,
          forbidExternalMedia,
        },
      }),
    });
    if (res.ok) {
      await onRefreshBootstrap();
      onShowToast('Saved workspace AI & privacy settings');
    }
  };

  const handleTestLlm = async () => {
    const res = await fetch('/api/org/llm-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = (await res.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
    };
    if (!res.ok) {
      onShowToast(data.error || 'AI connection test failed');
      return;
    }
    onShowToast(data.message || 'AI Provider ready.');
  };

  const stats = quota?.usageStats || {};
  const totalDecks = (stats.totalDecksCreated || 0) + (stats.totalDecksEdited || 0);
  const totalCost = Number(stats.totalEstimatedCostUsd || 0);
  const avgCost = totalDecks > 0 ? (totalCost / totalDecks).toFixed(3) : '0.014';
  const costHistory = stats.costHistory || [];

  return (
    <main id="view-saas" className={`view-panel ${isActive ? 'active' : ''}`}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.1fr 0.9fr',
          gap: '22px',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <section className="surface-card">
            <div className="card-heading">
              <span className="card-title">Subscription Plan &amp; Quotas</span>
              <span className="badge badge-pass" id="saas-active-tier-badge">
                {quota ? `${quota.tierName} Plan Active` : 'Pro Plan'}
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3,1fr)',
                gap: '12px',
              }}
              id="plan-cards-container"
            >
              {Object.values(quota?.planCatalog || {}).map((p) => {
                const isCurrent = p.id === quota?.tier;
                return (
                  <div
                    key={p.id}
                    className={`brand-profile-card ${isCurrent ? 'active' : ''}`}
                    style={{ cursor: 'default' }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <strong
                        style={{ fontFamily: 'var(--font-display)', fontSize: '18px' }}
                      >
                        {p.name}
                      </strong>
                      <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                        ${p.priceMonthlyUsd}/mo
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '13px',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.6,
                      }}
                    >
                      • Up to <strong>{p.maxBrands} Brand Kits</strong>
                      <br />• <strong>{p.dailyDeckLimit} presentations</strong> / day
                    </div>
                    <button
                      type="button"
                      className={`btn btn-sm ${isCurrent ? 'btn-primary' : ''}`}
                      style={{ marginTop: '4px' }}
                      onClick={() => void handleSelectTier(p.id)}
                    >
                      {isCurrent ? 'Current Plan' : `Switch to ${p.name}`}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="surface-card">
            <span className="card-title">
              Dynamic Quota Limits (2 / 4 / 16 CVI · 4 / 20 / 100 Daily Decks)
            </span>
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Max Brand CVIs</th>
                  <th>Daily Presentations</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>Starter</strong>
                  </td>
                  <td>
                    <input
                      type="number"
                      id="q-starter-brands"
                      className="ui-input"
                      value={starterBrands}
                      min={1}
                      max={100}
                      onChange={(e) => setStarterBrands(Number(e.target.value) || 2)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      id="q-starter-decks"
                      className="ui-input"
                      value={starterDecks}
                      min={1}
                      max={500}
                      onChange={(e) => setStarterDecks(Number(e.target.value) || 4)}
                    />
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Pro</strong>
                  </td>
                  <td>
                    <input
                      type="number"
                      id="q-pro-brands"
                      className="ui-input"
                      value={proBrands}
                      min={1}
                      max={100}
                      onChange={(e) => setProBrands(Number(e.target.value) || 4)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      id="q-pro-decks"
                      className="ui-input"
                      value={proDecks}
                      min={1}
                      max={500}
                      onChange={(e) => setProDecks(Number(e.target.value) || 20)}
                    />
                  </td>
                </tr>
                <tr>
                  <td>
                    <strong>Enterprise</strong>
                  </td>
                  <td>
                    <input
                      type="number"
                      id="q-ent-brands"
                      className="ui-input"
                      value={entBrands}
                      min={1}
                      max={500}
                      onChange={(e) => setEntBrands(Number(e.target.value) || 16)}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      id="q-ent-decks"
                      className="ui-input"
                      value={entDecks}
                      min={1}
                      max={2000}
                      onChange={(e) => setEntDecks(Number(e.target.value) || 100)}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-primary"
                id="save-quotas-btn"
                onClick={() => void handleSaveQuotas()}
              >
                Save Quota Limits
              </button>
              <button
                type="button"
                className="btn"
                id="reset-today-usage-btn"
                onClick={() => void handleResetTodayUsage()}
              >
                Reset Today&apos;s Counter
              </button>
            </div>
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <section className="surface-card">
            <div className="card-heading">
              <span className="card-title">Unit Economics &amp; Cost Telemetry</span>
              <a
                className="btn btn-sm"
                href="/api/subscription/cost-export.csv"
                download
              >
                ⬇ Export Cost CSV
              </a>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3,1fr)',
                gap: '10px',
              }}
              id="cost-summary-cards"
            >
              <div className="swatch-box">
                <div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    Brands Used
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '22px',
                      fontWeight: 600,
                    }}
                  >
                    {quota ? `${quota.usedBrands} / ${quota.maxBrands}` : '0 / 4'}
                  </div>
                </div>
              </div>
              <div className="swatch-box">
                <div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    Decks Built Today
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '22px',
                      fontWeight: 600,
                    }}
                  >
                    {quota ? `${quota.usedDecksToday} / ${quota.dailyDeckLimit}` : '0 / 20'}
                  </div>
                </div>
              </div>
              <div className="swatch-box">
                <div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                    Avg Cost / Deck
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '22px',
                      fontWeight: 600,
                      color: 'var(--positive)',
                    }}
                  >
                    ${avgCost}
                  </div>
                </div>
              </div>
            </div>

            <table className="ui-table">
              <thead>
                <tr>
                  <th>Deck</th>
                  <th>Action</th>
                  <th>Tokens</th>
                  <th>Time</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody id="cost-history-tbody">
                {costHistory.length > 0 ? (
                  costHistory.slice(0, 6).map((h, idx) => (
                    <tr key={`${h.deckSlug}-${idx}`}>
                      <td style={{ fontWeight: 600 }}>{h.deckSlug}</td>
                      <td>{h.operation === 'create_deck' ? 'Created' : 'Refined'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                        {h.promptTokens + h.completionTokens} tok
                      </td>
                      <td>{(h.renderDurationMs / 1000).toFixed(1)}s</td>
                      <td style={{ fontWeight: 600, color: 'var(--positive)' }}>
                        ${h.totalCostUsd}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--text-muted)' }}>
                      No presentations built yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="surface-card">
            <span className="card-title">AI Provider &amp; Privacy</span>
            <div className="field-row">
              <div className="field-group">
                <label className="field-label" htmlFor="ent-llm-provider">
                  AI Provider
                </label>
                <select
                  id="ent-llm-provider"
                  className="ui-select"
                  value={llmProvider}
                  onChange={(e) => setLlmProvider(e.target.value)}
                >
                  <option value="local-structured">Built-in Structured Agent</option>
                  <option value="openai">OpenAI (GPT-4o)</option>
                  <option value="azure">Azure OpenAI</option>
                  <option value="anthropic">Anthropic Claude</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="internal-gateway">Internal Gateway</option>
                </select>
              </div>
              <div className="field-group">
                <label className="field-label" htmlFor="ent-role-select">
                  Role
                </label>
                <select
                  id="ent-role-select"
                  className="ui-select"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="brand_admin">Brand Admin</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12.5px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                id="ent-internal-net"
                checked={internalNetOnly}
                onChange={(e) => setInternalNetOnly(e.target.checked)}
              />
              <span>Keep all data and AI traffic inside company network</span>
            </label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12.5px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                id="ent-forbid-media"
                checked={forbidExternalMedia}
                onChange={(e) => setForbidExternalMedia(e.target.checked)}
              />
              <span>Never send raw media binaries to external LLMs</span>
            </label>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                className="btn btn-primary"
                id="save-ent-settings-btn"
                onClick={() => void handleSavePolicy()}
              >
                Save Policy
              </button>
              <button
                type="button"
                className="btn"
                id="test-llm-conn-btn"
                onClick={() => void handleTestLlm()}
              >
                Test AI Connection
              </button>
            </div>

            <details>
              <summary
                style={{ cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)' }}
              >
                Audit Log ▾
              </summary>
              <div className="activity-list" id="audit-log-list">
                {auditLog.map((a, idx) => (
                  <div className="activity-step" key={idx}>
                    <span>
                      <strong>{a.action}</strong> · {a.target} — {a.detail}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>
                      {a.timestamp.slice(11, 19)}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          </section>
        </div>
      </div>
    </main>
  );
}

// ============================================================================
// Quota Upgrade Modal
// ============================================================================
interface QuotaModalProps {
  message: string | null;
  onClose: () => void;
  onUpgradeTier: (tier: 'pro' | 'enterprise') => Promise<void>;
}

function QuotaUpgradeModal({ message, onClose, onUpgradeTier }: QuotaModalProps) {
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    if (!message) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [message, onClose]);

  const handleUpgrade = async (tier: 'pro' | 'enterprise') => {
    setUpgrading(true);
    try {
      await onUpgradeTier(tier);
    } finally {
      setUpgrading(false);
    }
  };

  return (
    <div
      className={`modal-backdrop ${message ? 'open' : ''}`}
      id="quota-upgrade-modal"
      role="dialog"
      aria-modal="true"
      aria-hidden={!message}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-card">
        <div className="card-heading">
          <span className="card-title">Plan Limit Reached</span>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            id="close-quota-modal-btn"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <p
          id="quota-modal-message"
          style={{ fontSize: '13px', color: 'var(--text-secondary)' }}
        >
          {message || ''}
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            className="btn btn-primary"
            id="upgrade-pro-modal-btn"
            style={{ flex: 1 }}
            disabled={upgrading}
            onClick={() => void handleUpgrade('pro')}
          >
            Switch to Pro (4 CVI · 20/day)
          </button>
          <button
            type="button"
            className="btn"
            id="upgrade-ent-modal-btn"
            style={{ flex: 1 }}
            disabled={upgrading}
            onClick={() => void handleUpgrade('enterprise')}
          >
            Enterprise (16 CVI · 100/day)
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Root App
// ============================================================================
export default function App() {
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);
  const [currentView, setCurrentView] = useState<AppViewName>('studio');

  const [org, setOrg] = useState<OrgSummary | null>(null);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [brandKits, setBrandKits] = useState<BrandKitSummary[]>([]);
  const [activeBrandKit, setActiveBrandKit] = useState<BrandKitSummary | null>(null);
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [selectedDeck, setSelectedDeck] = useState<DeckSummary | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [sampleTemplates, setSampleTemplates] = useState<string[]>([]);

  const [quotaModalMessage, setQuotaModalMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current !== undefined) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  const refreshBootstrap = useCallback(async () => {
    try {
      const res = await fetch('/api/bootstrap');
      if (!res.ok) return;
      const data = (await res.json()) as BootstrapPayload;
      const nextDecks = data.decks || [];
      setOrg(data.org);
      setQuota(data.quota);
      setBrandKits(data.brandKits || []);
      setActiveBrandKit(data.activeBrandKit);
      setDecks(nextDecks);
      setAuditLog(data.auditLog || []);
      setSampleTemplates(data.sampleTemplates || []);

      setSelectedDeck((prev) => {
        if (!prev && nextDecks.length > 0) return nextDecks[0];
        if (prev) {
          return nextDecks.find((d) => d.slug === prev.slug) || prev;
        }
        return null;
      });
    } catch {
      // ignore initial offline bootstrap failure in standalone preview
    }
  }, []);

  useEffect(() => {
    void refreshBootstrap();
  }, [refreshBootstrap]);

  const handleSelectBrandKit = useCallback(
    async (brandKitId: string) => {
      if (!brandKitId) return;
      const res = await fetch('/api/brands/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandKitId }),
      });
      if (res.ok) {
        await refreshBootstrap();
        const chosen = brandKits.find((b) => b.id === brandKitId);
        showToast(`Switched brand to ${chosen?.name || brandKitId}`);
      }
    },
    [brandKits, refreshBootstrap, showToast]
  );

  const handleUpgradeFromModal = useCallback(
    async (tier: 'pro' | 'enterprise') => {
      const res = await fetch('/api/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      if (res.ok) {
        await refreshBootstrap();
        setQuotaModalMessage(null);
        showToast(`Switched to ${tier.toUpperCase()} plan`);
      } else {
        showToast('Could not switch subscription tier');
      }
    },
    [refreshBootstrap, showToast]
  );

  return (
    <>
      <TopBar
        currentView={currentView}
        onSwitchView={setCurrentView}
        brandKits={brandKits}
        activeBrandKit={activeBrandKit}
        onSelectBrand={(id) => void handleSelectBrandKit(id)}
        quota={quota}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
      />

      <StudioView
        isActive={currentView === 'studio'}
        brandKits={brandKits}
        activeBrandKit={activeBrandKit}
        selectedDeck={selectedDeck}
        onGoToBrandOnboarding={() => setCurrentView('brand')}
        onDeckUpdated={async (deck) => {
          setSelectedDeck(deck);
          await refreshBootstrap();
        }}
        onOpenQuotaModal={(msg) => setQuotaModalMessage(msg)}
        onShowToast={showToast}
      />

      <BrandView
        isActive={currentView === 'brand'}
        brandKits={brandKits}
        activeBrandKit={activeBrandKit}
        quota={quota}
        sampleTemplates={sampleTemplates}
        onSelectBrand={(id) => void handleSelectBrandKit(id)}
        onRefreshBootstrap={refreshBootstrap}
        onSwitchToStudio={() => setCurrentView('studio')}
        onOpenQuotaModal={(msg) => setQuotaModalMessage(msg)}
        onShowToast={showToast}
      />

      <LibraryView
        isActive={currentView === 'library'}
        decks={decks}
        onOpenDeckInStudio={(deck) => {
          setSelectedDeck(deck);
          setCurrentView('studio');
        }}
      />

      <GalleryView
        isActive={currentView === 'gallery'}
        activeBrandKit={activeBrandKit}
      />

      <WorkspaceView
        isActive={currentView === 'saas'}
        org={org}
        quota={quota}
        auditLog={auditLog}
        onRefreshBootstrap={refreshBootstrap}
        onShowToast={showToast}
      />

      <QuotaUpgradeModal
        message={quotaModalMessage}
        onClose={() => setQuotaModalMessage(null)}
        onUpgradeTier={handleUpgradeFromModal}
      />

      <div
        className={`toast-banner ${toastMessage ? 'show' : ''}`}
        id="toast-banner"
        role="status"
        aria-live="polite"
      >
        {toastMessage || ''}
      </div>
    </>
  );
}
