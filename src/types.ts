/**
 * Strict Domain Model & Discriminated Union Types for Deck Studio
 */

export type SlideType =
  | 'cover'
  | 'content'
  | 'content-alt'
  | 'content-dark'
  | 'statement'
  | 'section-dark'
  | 'section-light'
  | 'end';

export type AudienceType = 'management' | 'product' | 'developers' | 'mixed';

export type NarrativeArcType = 'explain-tool' | 'incident' | 'proposal' | 'status';

export type StatusKind = 'positive' | 'caution' | 'negative';

export type CardVariant = 'default' | 'light' | 'dark' | 'focus';

export interface BrandColorScheme {
  dk1: string;
  lt1: string;
  dk2: string;
  lt2: string;
  accent1: string;
  accent2: string;
  accent3: string;
  accent4: string;
  accent5: string;
  accent6: string;
  hlink: string;
  folHlink: string;
}

export interface BrandColors {
  primary: string;
  secondary: string;
  accent: string;
  surfaceLight: string;
  surfaceAlt: string;
  surfaceDark: string;
  textOnLight: string;
  textMutedOnLight: string;
  textOnDark: string;
  textMutedOnDark: string;
  borderOnLight: string;
  borderOnDark: string;
  status: {
    positive: string;
    caution: string;
    negative: string;
    rules: string;
  };
  scheme: BrandColorScheme;
}

export interface FontRoleSpec {
  role: 'title' | 'heading' | 'body' | 'mono';
  family: string;
  weights: number[];
  isUploaded: boolean;
  missingFontFile: boolean;
  warning: string | null;
  fallback: string;
}

export interface PlaceholderBoxIn {
  xIn: number;
  yIn: number;
  wIn: number;
  hIn: number;
}

export interface PlaceholderBoxPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BrandLogoVariant {
  id: string;
  name: string;
  forSurface: 'light' | 'dark' | 'both';
  dataUrl: string;
}

export interface ContrastCheckPair {
  id: string;
  label: string;
  fg: string;
  bg: string;
  minRatio: number;
  ratio: number;
  passed: boolean;
}

export interface BrandKit {
  id: string;
  orgId: string;
  version: number;
  name: string;
  sourceFile: string;
  colors: BrandColors;
  fonts: {
    title: FontRoleSpec;
    heading: FontRoleSpec;
    body: FontRoleSpec;
    mono: FontRoleSpec;
  };
  fontLicensingNotice: string;
  typeScale: {
    hero: number;
    h1: number;
    h2: number;
    h3: number;
    lede: number;
    body: number;
    small: number;
    caption: number;
    kpi: number;
    minSizePx: number;
  };
  geometry: {
    slideWidthIn: number;
    slideHeightIn: number;
    stageWidthPx: number;
    stageHeightPx: number;
    marginsPx: {
      top: number;
      left: number;
      right: number;
      bottom: number;
    };
    safeZonesPx: {
      topProgressHeight: number;
      footerBandTop: number;
      footerBandHeight: number;
      sourceNoteTop: number;
    };
    placeholdersIn: Record<string, PlaceholderBoxIn>;
    placeholdersPx: Record<string, PlaceholderBoxPx>;
    grid: {
      columns: number;
      gapPx: number;
    };
  };
  backgrounds: {
    coverPattern: string;
    sectionDarkPattern: string;
    sectionLightPattern: string;
    contentSurface: string;
    altLightSurface: string;
  };
  logo: {
    variants: BrandLogoVariant[];
    placement: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
    allowedSlideTypes: SlideType[];
    forbiddenSlideTypes: SlideType[];
  };
  frame: {
    showProgress: boolean;
    classification: 'Internal' | 'Public' | 'Confidential';
    companyName: string;
    showPageNumber: boolean;
    sourceNotePosition: string;
  };
  icons: string[];
  rules: {
    noGradients: boolean;
    noDropShadows: boolean;
    noTextShadows: boolean;
    noClipArt: boolean;
    minFontSizePx: number;
    wcagLevel: 'AA';
    colorToleranceDeltaE: number;
  };
  contrastReport: {
    passed: boolean;
    checks: ContrastCheckPair[];
  };
  createdAt?: string;
  updatedAt?: string;
}

export type ComponentSpec =
  | { type: 'bullets'; items: string[]; stepReveal?: boolean; step?: number }
  | { type: 'steps'; items: string[]; stepReveal?: boolean; step?: number }
  | {
      type: 'checklist';
      items: Array<{ text: string; status: 'ok' | 'no' | 'pending' }>;
      stepReveal?: boolean;
      step?: number;
    }
  | { type: 'callout'; icon?: string; title?: string; text: string; step?: number }
  | {
      type: 'cards';
      columns?: 2 | 3 | 4;
      stepReveal?: boolean;
      step?: number;
      items: Array<{
        variant?: CardVariant;
        tag?: string;
        status?: StatusKind;
        icon?: string;
        title: string;
        body: string;
        step?: number;
      }>;
    }
  | {
      type: 'kpi-grid';
      columns?: 2 | 3 | 4;
      stepReveal?: boolean;
      step?: number;
      items: Array<{
        variant?: CardVariant;
        value: number;
        decimals?: number;
        prefix?: string;
        suffix?: string;
        label: string;
        delta?: string;
        status?: StatusKind;
        step?: number;
      }>;
    }
  | {
      type: 'flow';
      direction?: 'horizontal' | 'vertical';
      trace?: boolean;
      step?: number;
      nodes: Array<{ icon?: string; title: string; desc: string }>;
    }
  | {
      type: 'timeline';
      stepReveal?: boolean;
      step?: number;
      events: Array<{
        time: string;
        title: string;
        desc: string;
        highlight?: boolean;
        step?: number;
      }>;
    }
  | {
      type: 'before-after';
      step?: number;
      before: { title: string; items: string[] };
      after: { title: string; items: string[] };
    }
  | {
      type: 'bars';
      step?: number;
      rows: Array<{
        label: string;
        value: number;
        displayValue: string;
        highlight?: boolean;
      }>;
    }
  | {
      type: 'code';
      title?: string;
      language?: string;
      typewriter?: boolean;
      step?: number;
      lines: string[];
    }
  | {
      type: 'chat';
      step?: number;
      messages: Array<{
        role: 'prompt' | 'tool' | 'answer';
        label?: string;
        text: string;
      }>;
    }
  | {
      type: 'screenshot';
      src: string;
      title?: string;
      caption: string;
      step?: number;
    }
  | {
      type: 'video';
      src: string;
      poster?: string;
      title?: string;
      caption: string;
      autoplay?: boolean;
      step?: number;
    }
  | { type: 'quote'; text: string; author: string; step?: number }
  | {
      type: 'split';
      ratio?: '50-50' | '60-40';
      step?: number;
      left: ComponentSpec;
      right: ComponentSpec;
    };

export interface SlideSpec {
  id: string;
  type: SlideType;
  eyebrow?: string;
  eyebrowIcon?: string;
  title: string;
  lede?: string;
  sourceNote?: string;
  speakerNotes?: string;
  components?: ComponentSpec[];
  rawBodyHtml?: string;
}

export interface MediaAsset {
  id: string;
  filename: string;
  category: 'image' | 'video';
  caption: string;
  src: string;
  assetRelativePath?: string;
}

export interface CheckFinding {
  code: string;
  severity: 'error' | 'warning';
  selector?: string;
  message: string;
}

export interface SlideCheckReport {
  slideNumber: number;
  slideIndex: number;
  slideType: SlideType | string;
  title: string;
  passed: boolean;
  errorCount: number;
  warningCount: number;
  humanSummary: string;
  findings: CheckFinding[];
}

export interface DeckCheckReport {
  passed: boolean;
  checkedAt: string;
  brandKitId: string;
  brandKitVersion: number;
  slideCount: number;
  errorCount: number;
  warningCount: number;
  humanSummary: string;
  slides: SlideCheckReport[];
}

export interface DeckBrief {
  topic: string;
  audience: AudienceType;
  lengthMinutes: number;
  endsWithLiveDemo: boolean;
  language: string;
  sourceText?: string;
  sourceUrl?: string;
  slug?: string;
}

export interface Deck {
  id: string;
  slug: string;
  orgId: string;
  title: string;
  brandKitId: string;
  brandKitVersion: number;
  classification: 'Internal' | 'Public' | 'Confidential';
  brief: DeckBrief;
  storyline: {
    takeawaySentence: string;
    arcType: NarrativeArcType;
    headlines: string[];
  };
  slides: SlideSpec[];
  assumptions: string[];
  media: MediaAsset[];
  lastCheckReport?: DeckCheckReport | null;
  version: number;
  history: Array<{
    version: number;
    timestamp: string;
    note: string;
    storyline: Deck['storyline'];
    slides: SlideSpec[];
    assumptions: string[];
    lastCheckReport?: DeckCheckReport | null;
  }>;
  createdAt: string;
  updatedAt: string;
}
