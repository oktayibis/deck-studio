export type AppViewName = 'studio' | 'brand' | 'library' | 'gallery' | 'saas';

export type SidebarTab = 'compose' | 'inspector';

export type ThemeMode = 'light' | 'dark';

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
  timestamp?: string;
}

export interface BuildJobSummary {
  id?: string;
  status?: 'running' | 'completed' | 'failed' | 'cancelled' | string;
  phase?: string;
  error?: string | null;
  elapsedMs?: number;
  steps?: JobStepSummary[];
}

export interface StarterBriefPreset {
  topic: string;
  audience: string;
  lengthMinutes: number;
  endsWithLiveDemo: boolean;
  slug: string;
}

export interface BootstrapPayload {
  org: OrgSummary | null;
  quota: QuotaStatus | null;
  brandKits?: BrandKitSummary[];
  activeBrandKit: BrandKitSummary | null;
  decks?: DeckSummary[];
  auditLog?: AuditLogEntry[];
  sampleTemplates?: string[];
}

export interface DeckEngineHandle {
  currentIndex: number;
  prevStep: () => void;
  nextStep: () => void;
  goToSlide: (idx: number, opts?: { revealAllSteps?: boolean }) => void;
}

export interface DeckEngineWindow extends Window {
  __deckEngine?: DeckEngineHandle;
}
