import { compileDeckToHtml, buildDefaultVideoPosterDataUrl } from './deck-compiler.js';

export function buildSampleScreenshotDataUrl(title = 'Cluster Latency Telemetry', accent = '#C83E1D') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 520" width="960" height="520">
    <rect width="960" height="520" fill="#0F172A"/>
    <rect x="20" y="20" width="920" height="480" rx="8" fill="#1E293B" stroke="#334155" stroke-width="2"/>
    <rect x="44" y="48" width="260" height="24" rx="4" fill="${accent}"/>
    <text x="56" y="65" font-family="JetBrains Mono, monospace" font-weight="700" font-size="13" fill="#FFFFFF">${title}</text>
    <line x1="44" y1="96" x2="916" y2="96" stroke="#334155" stroke-width="1.5"/>
    <rect x="44" y="120" width="270" height="140" rx="6" fill="#0F172A" stroke="#475569"/>
    <text x="64" y="154" font-family="JetBrains Mono, monospace" font-size="14" fill="#CBD5E1">P99 LATENCY</text>
    <text x="64" y="210" font-family="Plus Jakarta Sans, sans-serif" font-weight="700" font-size="42" fill="#F8FAFC">412 ms</text>
    <rect x="338" y="120" width="270" height="140" rx="6" fill="#0F172A" stroke="#475569"/>
    <text x="358" y="154" font-family="JetBrains Mono, monospace" font-size="14" fill="#CBD5E1">ERROR RATE</text>
    <text x="358" y="210" font-family="Plus Jakarta Sans, sans-serif" font-weight="700" font-size="42" fill="${accent}">3.8%</text>
    <rect x="632" y="120" width="284" height="140" rx="6" fill="#0F172A" stroke="#475569"/>
    <text x="652" y="154" font-family="JetBrains Mono, monospace" font-size="14" fill="#CBD5E1">RECOVERY WINDOW</text>
    <text x="652" y="210" font-family="Plus Jakarta Sans, sans-serif" font-weight="700" font-size="42" fill="#10B981">14 min</text>
    <polyline points="48,430 160,420 270,415 380,295 490,280 600,340 710,418 820,422 910,420" fill="none" stroke="${accent}" stroke-width="4"/>
    <line x1="48" y1="450" x2="912" y2="450" stroke="#475569" stroke-width="1"/>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

/**
 * Generates the comprehensive Component Gallery & Brand Kit Visual Fixture Deck (§3.1 & §8).
 */
export function buildBrandGalleryDeck(brandKit) {
  const accent = brandKit?.colors?.accent || '#C83E1D';
  const company = brandKit?.frame?.companyName || brandKit?.name || 'Nordic Grid Systems';
  const screenshotDataUrl = buildSampleScreenshotDataUrl('Telemetry Dashboard Snapshot', accent);
  const posterDataUrl = buildDefaultVideoPosterDataUrl('Live Failover Verification Run');

  const slides = [
    {
      id: 'gallery-1-cover',
      type: 'cover',
      eyebrow: `BRAND KIT v${brandKit?.version || 1} · VISUAL COMPONENT GALLERY`,
      eyebrowIcon: 'sparkle',
      title: `${company} — Brand-True Presentation System`,
      lede: 'Live preview fixture of every slide type, surface token, typography role, frame rule, and interactive component.',
      sourceNote: `Extracted from ${brandKit?.sourceFile || 'Office Theme (.pptx)'} · Geometry ${brandKit?.geometry?.slideWidthIn || 13.333}×${brandKit?.geometry?.slideHeightIn || 7.5} in`,
      speakerNotes: 'Cover slide demonstrating the brand pattern overlay, cover logo placement, hero typography, and footer safe zone.',
      components: [
        {
          type: 'cards',
          columns: 3,
          items: [
            {
              variant: 'dark',
              tag: 'PALETTE ROLES',
              status: 'positive',
              icon: 'layers',
              title: 'WCAG AA Verified Tokens',
              body: `Primary ${brandKit?.colors?.primary}, Accent ${brandKit?.colors?.accent}, Light ${brandKit?.colors?.surfaceLight}`
            },
            {
              variant: 'dark',
              tag: 'TYPOGRAPHY',
              status: 'positive',
              icon: 'terminal',
              title: `${brandKit?.fonts?.title?.family || 'Instrument Serif'}`,
              body: `Paired with ${brandKit?.fonts?.body?.family || 'Plus Jakarta Sans'} and ${brandKit?.fonts?.mono?.family || 'JetBrains Mono'}`
            },
            {
              variant: 'dark',
              tag: 'TEMPLATE GEOMETRY',
              status: 'positive',
              icon: 'shield',
              title: '1600×900 Stage Fidelity',
              body: 'Logo restricted strictly to Cover and End slides; safe zones enforced.'
            }
          ]
        }
      ]
    },
    {
      id: 'gallery-2-content-kpis-bars',
      type: 'content',
      eyebrow: 'SLIDE TYPE: CONTENT (DEFAULT LIGHT SURFACE)',
      eyebrowIcon: 'chart',
      title: 'KPI Count-Ups, Status Cards & Horizontal Bars',
      lede: 'Management components animate with purpose on reveal and render statically in print and thumbnails.',
      sourceNote: 'Brand Gallery Fixture · Metrics & Card Variants',
      speakerNotes: 'Default light content slide showing KPI count-up cards, focus/light/dark card resets, and growing horizontal bars.',
      components: [
        {
          type: 'kpi-grid',
          columns: 4,
          items: [
            {
              variant: 'default',
              value: 99.98,
              decimals: 2,
              suffix: '%',
              label: 'Availability SLA',
              delta: '+0.14% vs Q2 target',
              status: 'positive'
            },
            {
              variant: 'light',
              value: 14,
              decimals: 0,
              suffix: ' min',
              label: 'Mean Time to Mitigate',
              delta: 'Within 15m threshold',
              status: 'positive'
            },
            {
              variant: 'focus',
              value: 412,
              decimals: 0,
              suffix: ' ms',
              label: 'Peak Failover Latency',
              delta: 'Action highlight card',
              status: 'caution'
            },
            {
              variant: 'dark',
              value: 0,
              decimals: 0,
              suffix: ' leaks',
              label: 'Data Loss Events',
              delta: 'Zero customer impact',
              status: 'positive'
            }
          ]
        },
        {
          type: 'bars',
          rows: [
            { label: 'EU-Central Primary Cluster', value: 94, displayValue: '94% load', highlight: true },
            { label: 'US-East Failover Standby', value: 62, displayValue: '62% load', highlight: false },
            { label: 'AP-North Edge Replicas', value: 48, displayValue: '48% load', highlight: false }
          ]
        }
      ]
    },
    {
      id: 'gallery-3-content-alt-flow-timeline',
      type: 'content-alt',
      eyebrow: 'SLIDE TYPE: CONTENT ON ALTERNATIVE LIGHT SURFACE',
      eyebrowIcon: 'activity',
      title: 'Traced Request Flow Diagram & Chronological Timeline',
      lede: 'The animated trace dot walks across nodes in sequence while timeline markers highlight critical inflection points.',
      sourceNote: 'Brand Gallery Fixture · Flow & Timeline Components',
      speakerNotes: 'Alternative light surface slide showing the flow diagram with auto-inserted arrows and trace dot, plus a 4-stage timeline.',
      components: [
        {
          type: 'flow',
          direction: 'horizontal',
          trace: true,
          nodes: [
            { icon: 'globe', title: 'Edge Ingress', desc: 'TLS termination & rate guard' },
            { icon: 'shield', title: 'Auth Gateway', desc: 'OIDC token verification' },
            { icon: 'cpu', title: 'Agent Orchestrator', desc: 'Story → Build → Check loop' },
            { icon: 'database', title: 'Isolated Store', desc: 'Per-org encrypted assets' }
          ]
        },
        {
          type: 'timeline',
          events: [
            { time: '14:02 UTC', title: 'Traffic Spike Detected', desc: 'Ingress rose 3.4× above baseline on eu-central-1.', highlight: false },
            { time: '14:06 UTC', title: 'Pool Saturation', desc: 'Connection pool hit 94% capacity threshold.', highlight: true },
            { time: '14:11 UTC', title: 'Automated Failover', desc: 'Traffic shifted to standby replicas cleanly.', highlight: false },
            { time: '14:16 UTC', title: 'Full Recovery', desc: 'Latency returned to 38 ms nominal baseline.', highlight: false }
          ]
        }
      ]
    },
    {
      id: 'gallery-4-dark-code-chat',
      type: 'content-dark',
      eyebrow: 'SLIDE TYPE: DARK CONTENT + NESTED LIGHT SURFACE RESET',
      eyebrowIcon: 'terminal',
      title: 'Typewriter Code Block, Chat Transcript & Nested Light Cards',
      lede: 'Light cards inside dark slides automatically reset their text tokens to dark-on-light to prevent white-on-white text (§11).',
      sourceNote: 'Brand Gallery Fixture · Developer Components',
      speakerNotes: 'Dark content slide verifying code block single-line spacing, chat transcript bubbles, and light cards nested inside a dark slide.',
      components: [
        {
          type: 'split',
          ratio: '50-50',
          left: {
            type: 'code',
            title: 'circuit-breaker-policy.yaml',
            language: 'yaml',
            typewriter: true,
            lines: [
              'pool_guard:',
              '  max_connections: 500',
              '  failover_threshold_pct: 85',
              '  drain_timeout_ms: 2000',
              '  audit_mode: strict'
            ]
          },
          right: {
            type: 'chat',
            messages: [
              { role: 'prompt', label: 'OPERATOR PROMPT', text: 'Check why eu-central-1 latency crossed 400ms at 14:02 UTC.' },
              { role: 'tool', label: 'TOOL CALL · query_metrics', text: 'query_metrics({ region: "eu-central-1", window: "15m" }) -> pool_saturation: 94%' },
              { role: 'answer', label: 'AGENT FINDING', text: 'Connection pool reached 94% capacity; standby drain completed in 14 minutes.' }
            ]
          }
        },
        {
          type: 'cards',
          columns: 2,
          items: [
            {
              variant: 'light',
              tag: 'NESTED LIGHT CARD ON DARK SLIDE',
              status: 'positive',
              icon: 'check',
              title: 'Automatic Text Token Reset',
              body: 'Even inside a dark slide, this light card resets --slide-text to dark ink so contrast remains >12:1.'
            },
            {
              variant: 'focus',
              tag: 'NESTED FOCUS CARD',
              status: 'caution',
              icon: 'bolt',
              title: 'Brand Accent Border',
              body: 'Uses the brand accent border and alternative light surface without any blurred shadows.'
            }
          ]
        }
      ]
    },
    {
      id: 'gallery-5-media-before-after',
      type: 'content',
      eyebrow: 'MEDIA EVIDENCE & COMPARISON',
      eyebrowIcon: 'layers',
      title: 'Zoomable Screenshot, Video Poster Frame & Before/After',
      lede: 'Media are never cropped or stretched; screenshots zoom 2× on click and videos pause automatically on slide change.',
      sourceNote: 'Brand Gallery Fixture · Evidence & Comparison Components',
      speakerNotes: 'Demonstrates zoomable screenshot frame, video component with poster frame, checklists, and before/after comparison.',
      components: [
        {
          type: 'split',
          ratio: '50-50',
          left: {
            type: 'screenshot',
            src: screenshotDataUrl,
            title: 'eu-central-1-telemetry.png',
            caption: 'Observed 412 ms P99 spike at 14:02 UTC and 14-minute mitigation window.'
          },
          right: {
            type: 'before-after',
            before: {
              title: 'Before Pool Guard',
              items: [
                'Static 250-connection ceiling per node',
                'Manual operator failover approval (14 min)',
                'Unbounded retry bursts during spikes'
              ]
            },
            after: {
              title: 'After Pool Guard',
              items: [
                'Dynamic 500-connection ceiling with backpressure',
                'Sub-15-second automated replica promotion',
                'Jittered exponential backoff enforced'
              ]
            }
          }
        }
      ]
    },
    {
      id: 'gallery-6-statement-checklist',
      type: 'statement',
      eyebrow: 'SLIDE TYPE: STATEMENT & CHECKLIST',
      eyebrowIcon: 'shield',
      title: 'Every generated slide is verified against 8 geometric, palette, and WCAG AA rules before the user sees it.',
      lede: 'Zero manual formatting: the engine owns the layout tokens while the headless checker enforces compliance.',
      sourceNote: 'Brand Gallery Fixture · Statement & Checklist',
      speakerNotes: 'Statement slide with high-impact takeaway headline, quote, and status checklist.',
      components: [
        {
          type: 'split',
          ratio: '50-50',
          left: {
            type: 'checklist',
            items: [
              { status: 'ok', text: 'WCAG AA contrast verified on composited surfaces' },
              { status: 'ok', text: 'Zero overflow or clipped text boxes on 1600×900 stage' },
              { status: 'pending', text: 'Optional second-screen presenter view ready (press S)' }
            ]
          },
          right: {
            type: 'quote',
            text: 'Design lives in the engine and the Brand Kit, never as ad-hoc overrides inside individual slides.',
            author: 'Deck Studio Architecture Specification'
          }
        }
      ]
    },
    {
      id: 'gallery-7-section-dark',
      type: 'section-dark',
      eyebrow: 'SECTION 01 · DARK PATTERNED VARIANT',
      eyebrowIcon: 'layers',
      title: 'Section Breaker — Dark Patterned Surface',
      lede: 'Used to transition between major narrative acts with architectural SVG linework.',
      speakerNotes: 'Dark section breaker slide with patterned background.',
      components: [
        {
          type: 'callout',
          icon: 'sparkle',
          title: 'Narrative Transition',
          text: 'Section breakers reset audience attention between Situation, Root Cause, and Action Plan.'
        }
      ]
    },
    {
      id: 'gallery-8-section-light',
      type: 'section-light',
      eyebrow: 'SECTION 02 · LIGHT PATTERNED VARIANT',
      eyebrowIcon: 'globe',
      title: 'Section Breaker — Light Patterned Surface',
      lede: 'Alternative light surface with subtle Swiss grid geometry and numbered steps.',
      speakerNotes: 'Light section breaker slide with numbered steps and video evidence frame.',
      components: [
        {
          type: 'split',
          ratio: '50-50',
          left: {
            type: 'steps',
            items: [
              'Upload Office .pptx, .potx or .thmx template to extract Brand Kit tokens.',
              'Compose brief and attach screenshot or video evidence.',
              'Agent builds storyline, compiles slides, and runs headless Chromium checker.'
            ]
          },
          right: {
            type: 'video',
            src: '/api/media/sample-file/failover-replay-demo.mp4',
            poster: posterDataUrl,
            title: 'failover-verification.mp4',
            caption: 'Recorded failover drill confirming zero dropped sessions.'
          }
        }
      ]
    },
    {
      id: 'gallery-9-end',
      type: 'end',
      eyebrow: 'SLIDE TYPE: END SLIDE (LOGO PERMITTED)',
      eyebrowIcon: 'check',
      title: 'Ready for Live Presentation & Offline Export',
      lede: 'Press ? for keyboard shortcuts, S for Presenter View, O for Overview, or rest the pointer at the bottom edge for live ink tools.',
      sourceNote: `${company} · Brand Kit v${brandKit?.version || 1}`,
      speakerNotes: 'Closing slide displaying the brand logo (allowed on cover and end slides only) and final summary.',
      components: [
        {
          type: 'bullets',
          items: [
            'Use → / Space to advance fragments and slides; ← reveals all steps when arriving backwards.',
            'Rest pointer at bottom edge (~0.6s) to open the Control Dock; picking an ink tool closes it immediately.',
            'Export as a self-contained offline ZIP or 1600×900 landscape PDF.'
          ]
        }
      ]
    }
  ];

  return {
    slug: 'brand-component-gallery',
    title: `${company} — Brand Component Gallery`,
    brandKitId: brandKit?.id || 'brand-nordic-grid',
    brandKitVersion: brandKit?.version || 1,
    classification: brandKit?.frame?.classification || 'Internal',
    brief: {
      topic: 'Visual Component Gallery & Brand Kit Verification Fixture',
      audience: 'mixed',
      lengthMinutes: 10,
      endsWithLiveDemo: true,
      language: 'en'
    },
    storyline: {
      takeawaySentence: 'Every slide type and component renders with strict Brand Kit token fidelity and passes all 8 quality checks.',
      arcType: 'explain-tool',
      headlines: slides.map((s) => s.title)
    },
    assumptions: ['Rendered directly from active Brand Kit tokens as the visual test fixture.'],
    slides
  };
}

export function compileBrandGalleryHtml(brandKit) {
  const deck = buildBrandGalleryDeck(brandKit);
  return compileDeckToHtml(deck, brandKit, { inlineRuntime: true });
}
