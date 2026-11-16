import fs from 'node:fs';
import path from 'node:path';
import { escapeHtml } from '../utils/security.js';

const ENGINE_CSS_PATH = path.join(process.cwd(), 'src/engine/deck-engine.css');
const ENGINE_JS_PATH = path.join(process.cwd(), 'src/engine/deck-engine.js');

export const SLIDE_TYPES = [
  'cover',
  'content',
  'content-alt',
  'content-dark',
  'statement',
  'section-dark',
  'section-light',
  'end'
];

export const COMPONENT_VOCABULARY = {
  slideTypes: SLIDE_TYPES,
  components: [
    {
      type: 'bullets',
      description: 'Concise bullet list (3-5 items)',
      schema: '{ type: "bullets", items: string[], stepReveal?: boolean }'
    },
    {
      type: 'steps',
      description: 'Numbered sequence of actions or phases',
      schema: '{ type: "steps", items: string[], stepReveal?: boolean }'
    },
    {
      type: 'checklist',
      description: 'Status checklist with ok / no / pending badges',
      schema: '{ type: "checklist", items: [{ text: string, status: "ok"|"no"|"pending" }], stepReveal?: boolean }'
    },
    {
      type: 'callout',
      description: 'High-priority callout banner with icon',
      schema: '{ type: "callout", icon?: string, title?: string, text: string }'
    },
    {
      type: 'cards',
      description: 'Grid of 2-4 brand cards (variants: default, light, dark, focus)',
      schema: '{ type: "cards", columns?: 2|3|4, items: [{ variant?: "default"|"light"|"dark"|"focus", tag?: string, status?: "positive"|"caution"|"negative", icon?: string, title: string, body: string, step?: number }] }'
    },
    {
      type: 'kpi-grid',
      description: 'Big KPI numbers that count up on reveal',
      schema: '{ type: "kpi-grid", columns?: 2|3|4, items: [{ value: number, decimals?: number, prefix?: string, suffix?: string, label: string, delta?: string, status?: "positive"|"caution"|"negative", variant?: "default"|"light"|"dark"|"focus" }] }'
    },
    {
      type: 'flow',
      description: 'Horizontal or vertical flow diagram with auto-inserted arrows and animated trace dot',
      schema: '{ type: "flow", direction?: "horizontal"|"vertical", trace?: boolean, nodes: [{ icon?: string, title: string, desc: string }] }'
    },
    {
      type: 'timeline',
      description: 'Chronological incident or milestone timeline',
      schema: '{ type: "timeline", events: [{ time: string, title: string, desc: string, highlight?: boolean, step?: number }] }'
    },
    {
      type: 'before-after',
      description: 'Side-by-side comparison of state before and after',
      schema: '{ type: "before-after", before: { title: string, items: string[] }, after: { title: string, items: string[] } }'
    },
    {
      type: 'bars',
      description: 'Horizontal bar chart that grows, with one highlighted bar',
      schema: '{ type: "bars", rows: [{ label: string, value: number, displayValue: string, highlight?: boolean }] }'
    },
    {
      type: 'code',
      description: 'Monospace code block with line numbers and optional typewriter animation (never double-spaced)',
      schema: '{ type: "code", language?: string, title?: string, typewriter?: boolean, lines: string[] }'
    },
    {
      type: 'chat',
      description: 'Structured chat transcript: prompt -> tool-call -> answer',
      schema: '{ type: "chat", messages: [{ role: "prompt"|"tool"|"answer", label?: string, text: string }] }'
    },
    {
      type: 'screenshot',
      description: 'Zoomable screenshot evidence frame (never crops or stretches)',
      schema: '{ type: "screenshot", src: string, title?: string, caption: string }'
    },
    {
      type: 'video',
      description: 'Video evidence frame with poster image (pauses on slide leave)',
      schema: '{ type: "video", src: string, poster?: string, title?: string, caption: string, autoplay?: boolean }'
    },
    {
      type: 'quote',
      description: 'Editorial blockquote with attribution',
      schema: '{ type: "quote", text: string, author: string }'
    },
    {
      type: 'split',
      description: 'Two-column layout combining any two components side by side',
      schema: '{ type: "split", ratio?: "50-50"|"60-40", left: ComponentSpec, right: ComponentSpec }'
    }
  ]
};

/**
 * Generates the Brand Kit CSS variable override block.
 */
export function buildBrandCssVariables(brandKit) {
  const c = brandKit?.colors || {};
  const f = brandKit?.fonts || {};
  const g = brandKit?.geometry?.marginsPx || { top: 64, left: 88, right: 88, bottom: 86 };

  const resolveFontStack = (roleObj, defaultFallback) => {
    if (!roleObj) return defaultFallback;
    const primary = roleObj.missingFontFile ? roleObj.fallback : roleObj.family;
    return `'${primary}', '${roleObj.fallback || defaultFallback}', sans-serif`;
  };

  return `:root {
  --brand-primary: ${c.primary || '#1E293B'};
  --brand-secondary: ${c.secondary || '#1D4ED8'};
  --brand-accent: ${c.accent || '#C83E1D'};
  --brand-surface-light: ${c.surfaceLight || '#FAF8F5'};
  --brand-surface-alt: ${c.surfaceAlt || '#EFECE6'};
  --brand-surface-dark: ${c.surfaceDark || '#0F172A'};
  --brand-text-on-light: ${c.textOnLight || '#0F172A'};
  --brand-text-muted-on-light: ${c.textMutedOnLight || '#475569'};
  --brand-text-on-dark: ${c.textOnDark || '#F8FAFC'};
  --brand-text-muted-on-dark: ${c.textMutedOnDark || '#CBD5E1'};
  --brand-border-on-light: ${c.borderOnLight || '#CBD5E1'};
  --brand-border-on-dark: ${c.borderOnDark || '#334155'};
  --brand-status-positive: ${c.status?.positive || '#0F766E'};
  --brand-status-caution: ${c.status?.caution || '#B45309'};
  --brand-status-negative: ${c.status?.negative || '#B91C1C'};

  --font-title: ${resolveFontStack(f.title, 'Instrument Serif')};
  --font-heading: ${resolveFontStack(f.heading, 'Plus Jakarta Sans')};
  --font-body: ${resolveFontStack(f.body, 'Plus Jakarta Sans')};
  --font-mono: '${f.mono?.missingFontFile ? f.mono.fallback : f.mono?.family || 'JetBrains Mono'}', Menlo, monospace;

  --margin-top: ${g.top || 64}px;
  --margin-left: ${g.left || 88}px;
  --margin-right: ${g.right || 88}px;
  --margin-bottom: ${g.bottom || 86}px;
}`;
}

/**
 * Renders a single structured component specification into Brand Engine HTML markup.
 */
export function renderComponentSpec(comp, options = {}) {
  if (!comp || typeof comp !== 'object') return '';
  const stepAttr = comp.step ? ` data-step="${Number(comp.step)}"` : '';

  switch (comp.type) {
    case 'bullets': {
      const items = (comp.items || [])
        .map((item, idx) => {
          const s = comp.stepReveal ? ` data-step="${idx + 1}"` : '';
          return `<li${s}>${escapeHtml(item)}</li>`;
        })
        .join('');
      return `<ul class="ds-bullets"${stepAttr}>${items}</ul>`;
    }

    case 'steps': {
      const items = (comp.items || [])
        .map((item, idx) => {
          const s = comp.stepReveal ? ` data-step="${idx + 1}"` : '';
          return `<li${s}><span>${escapeHtml(item)}</span></li>`;
        })
        .join('');
      return `<ol class="ds-steps"${stepAttr}>${items}</ol>`;
    }

    case 'checklist': {
      const items = (comp.items || [])
        .map((item, idx) => {
          const status = ['ok', 'no', 'pending'].includes(item.status) ? item.status : 'ok';
          const badgeLabel = status === 'ok' ? 'PASS' : status === 'no' ? 'BLOCKED' : 'PENDING';
          const s = comp.stepReveal ? ` data-step="${idx + 1}"` : '';
          return `<li data-status="${status}"${s}><span class="ds-check-badge">${badgeLabel}</span><span>${escapeHtml(item.text)}</span></li>`;
        })
        .join('');
      return `<ul class="ds-checklist"${stepAttr}>${items}</ul>`;
    }

    case 'callout': {
      const iconHtml = comp.icon ? `<span class="ds-icon" data-icon="${escapeHtml(comp.icon)}"></span>` : '';
      const titleHtml = comp.title ? `<strong>${escapeHtml(comp.title)}:</strong> ` : '';
      return `<div class="ds-callout"${stepAttr}>${iconHtml}<div>${titleHtml}${escapeHtml(comp.text)}</div></div>`;
    }

    case 'cards': {
      const cols = [2, 3, 4].includes(comp.columns) ? comp.columns : Math.min(4, Math.max(2, (comp.items || []).length));
      const cardsHtml = (comp.items || [])
        .map((card, idx) => {
          const variant = ['default', 'light', 'dark', 'focus'].includes(card.variant) ? card.variant : 'default';
          const cStep = card.step ? ` data-step="${Number(card.step)}"` : comp.stepReveal ? ` data-step="${idx + 1}"` : '';
          const statusDot = card.status
            ? `<span class="ds-status-dot" data-status="${escapeHtml(card.status)}"></span>`
            : '';
          const tagHtml = card.tag
            ? `<span class="ds-tag">${statusDot}${escapeHtml(card.tag)}</span>`
            : '';
          const iconHtml = card.icon
            ? `<span class="ds-icon" data-icon="${escapeHtml(card.icon)}"></span>`
            : '';
          return `<div class="ds-card ds-card--${variant}"${cStep}>
            ${tagHtml}
            <div class="ds-card-title">${iconHtml}<span>${escapeHtml(card.title)}</span></div>
            <div class="ds-card-body">${escapeHtml(card.body)}</div>
          </div>`;
        })
        .join('');
      return `<div class="ds-grid-${cols}"${stepAttr}>${cardsHtml}</div>`;
    }

    case 'kpi-grid': {
      const cols = [2, 3, 4].includes(comp.columns) ? comp.columns : Math.min(4, Math.max(2, (comp.items || []).length));
      const kpisHtml = (comp.items || [])
        .map((item, idx) => {
          const variant = ['default', 'light', 'dark', 'focus'].includes(item.variant) ? item.variant : 'default';
          const cStep = item.step ? ` data-step="${Number(item.step)}"` : comp.stepReveal ? ` data-step="${idx + 1}"` : '';
          const statusDot = item.status
            ? `<span class="ds-status-dot" data-status="${escapeHtml(item.status)}"></span>`
            : '';
          const targetNum = Number(item.value ?? 0);
          const decimals = Number(item.decimals ?? (String(item.value).includes('.') ? 1 : 0));
          const prefix = escapeHtml(item.prefix || '');
          const suffix = escapeHtml(item.suffix || '');
          return `<div class="ds-card ds-card--${variant} ds-kpi"${cStep}>
            <div class="ds-kpi-value" data-target="${targetNum}" data-decimals="${decimals}" data-prefix="${prefix}" data-suffix="${suffix}">${prefix}${targetNum.toFixed(decimals)}${suffix}</div>
            <div class="ds-kpi-label">${escapeHtml(item.label)}</div>
            ${item.delta ? `<div class="ds-kpi-delta">${statusDot}<span>${escapeHtml(item.delta)}</span></div>` : ''}
          </div>`;
        })
        .join('');
      return `<div class="ds-grid-${cols}"${stepAttr}>${kpisHtml}</div>`;
    }

    case 'flow': {
      const dirClass = comp.direction === 'vertical' ? ' ds-flow--vertical' : '';
      const traceAttr = comp.trace !== false ? ' data-trace="true"' : '';
      const nodesHtml = (comp.nodes || [])
        .map((n) => {
          const iconHtml = n.icon ? `<span class="ds-icon" data-icon="${escapeHtml(n.icon)}"></span>` : '';
          return `<div class="ds-flow-node">
            <div class="ds-flow-node-title">${iconHtml}<span>${escapeHtml(n.title)}</span></div>
            <div class="ds-flow-node-desc">${escapeHtml(n.desc)}</div>
          </div>`;
        })
        .join('');
      return `<div class="ds-flow${dirClass}"${traceAttr}${stepAttr}>${nodesHtml}</div>`;
    }

    case 'timeline': {
      const eventsHtml = (comp.events || [])
        .map((ev, idx) => {
          const hl = ev.highlight ? ' data-highlight="true"' : '';
          const evStep = ev.step ? ` data-step="${Number(ev.step)}"` : comp.stepReveal ? ` data-step="${idx + 1}"` : '';
          return `<div class="ds-timeline-item"${hl}${evStep}>
            <div class="ds-timeline-time">${escapeHtml(ev.time)}</div>
            <div class="ds-timeline-title">${escapeHtml(ev.title)}</div>
            <div class="ds-timeline-desc">${escapeHtml(ev.desc)}</div>
          </div>`;
        })
        .join('');
      return `<div class="ds-timeline"${stepAttr}>${eventsHtml}</div>`;
    }

    case 'before-after': {
      const beforeItems = (comp.before?.items || []).map((i) => `<li>${escapeHtml(i)}</li>`).join('');
      const afterItems = (comp.after?.items || []).map((i) => `<li>${escapeHtml(i)}</li>`).join('');
      return `<div class="ds-before-after"${stepAttr}>
        <div class="ds-ba-pane ds-ba-pane--before">
          <span class="ds-tag"><span class="ds-status-dot" data-status="negative"></span>BEFORE</span>
          <div class="ds-card-title">${escapeHtml(comp.before?.title || 'Previous State')}</div>
          <ul class="ds-bullets">${beforeItems}</ul>
        </div>
        <div class="ds-ba-pane ds-ba-pane--after">
          <span class="ds-tag"><span class="ds-status-dot" data-status="positive"></span>AFTER</span>
          <div class="ds-card-title">${escapeHtml(comp.after?.title || 'Updated State')}</div>
          <ul class="ds-bullets">${afterItems}</ul>
        </div>
      </div>`;
    }

    case 'bars': {
      const rowsHtml = (comp.rows || [])
        .map((row) => {
          const pct = Math.max(2, Math.min(100, Number(row.value || 50)));
          const hl = row.highlight ? ' data-highlight="true"' : '';
          return `<div class="ds-bar-row"${hl}>
            <div class="ds-bar-label">${escapeHtml(row.label)}</div>
            <div class="ds-bar-track"><div class="ds-bar-fill" data-value="${pct}" style="width:${pct}%"></div></div>
            <div class="ds-bar-value">${escapeHtml(row.displayValue || `${pct}%`)}</div>
          </div>`;
        })
        .join('');
      return `<div class="ds-bars"${stepAttr}>${rowsHtml}</div>`;
    }

    case 'code': {
      const tw = comp.typewriter ? ' data-typewriter="true"' : '';
      const linesHtml = (comp.lines || [])
        .map(
          (line, idx) =>
            `<div class="ds-code-line"><span class="ds-code-ln">${idx + 1}</span><span>${escapeHtml(line)}</span></div>`
        )
        .join('');
      return `<div class="ds-code"${tw}${stepAttr}>
        <div class="ds-code-header">
          <span>${escapeHtml(comp.title || 'snippet')}</span>
          <span>${escapeHtml(comp.language || 'sh')}</span>
        </div>
        ${linesHtml}
      </div>`;
    }

    case 'chat': {
      const msgsHtml = (comp.messages || [])
        .map((m) => {
          const role = ['prompt', 'tool', 'answer'].includes(m.role) ? m.role : 'prompt';
          const defaultLabel = role === 'prompt' ? 'USER PROMPT' : role === 'tool' ? 'TOOL CALL' : 'AGENT RESPONSE';
          return `<div class="ds-chat-msg ds-chat-msg--${role}">
            <span class="ds-chat-role">${escapeHtml(m.label || defaultLabel)}</span>
            <div>${escapeHtml(m.text)}</div>
          </div>`;
        })
        .join('');
      return `<div class="ds-chat"${stepAttr}>${msgsHtml}</div>`;
    }

    case 'screenshot': {
      const src = options.resolveAssetPath ? options.resolveAssetPath(comp.src) : comp.src;
      return `<figure class="ds-screenshot"${stepAttr}>
        <div class="ds-media-toolbar">
          <span>${escapeHtml(comp.title || 'Evidence Screenshot')}</span>
          <span>Click to zoom 2×</span>
        </div>
        <div class="ds-media-viewport">
          <img src="${escapeHtml(src)}" alt="${escapeHtml(comp.caption || comp.title || 'Screenshot evidence')}" />
        </div>
        <figcaption class="ds-media-caption">${escapeHtml(comp.caption || '')}</figcaption>
      </figure>`;
    }

    case 'video': {
      const src = options.resolveAssetPath ? options.resolveAssetPath(comp.src) : comp.src;
      const poster = comp.poster
        ? options.resolveAssetPath
          ? options.resolveAssetPath(comp.poster)
          : comp.poster
        : buildDefaultVideoPosterDataUrl(comp.title || 'Live Recording');
      const autoAttr = comp.autoplay ? ' data-autoplay="true"' : '';
      return `<figure class="ds-video"${stepAttr}>
        <div class="ds-media-toolbar">
          <span>${escapeHtml(comp.title || 'Video Evidence')}</span>
          <span>HTML5 Video · Poster Ready</span>
        </div>
        <div class="ds-media-viewport">
          <video src="${escapeHtml(src)}" poster="${escapeHtml(poster)}" controls preload="metadata" playsinline${autoAttr}></video>
        </div>
        <figcaption class="ds-media-caption">${escapeHtml(comp.caption || '')}</figcaption>
      </figure>`;
    }

    case 'quote': {
      return `<blockquote class="ds-quote"${stepAttr}>
        <p class="ds-quote-text">“${escapeHtml(comp.text)}”</p>
        <footer class="ds-quote-author">— ${escapeHtml(comp.author || 'Source Material')}</footer>
      </blockquote>`;
    }

    case 'split': {
      const gridClass = comp.ratio === '60-40' ? 'ds-split-60-40' : 'ds-grid-2';
      return `<div class="${gridClass}"${stepAttr}>
        <div style="display:flex;flex-direction:column;gap:16px;">${renderComponentSpec(comp.left, options)}</div>
        <div style="display:flex;flex-direction:column;gap:16px;">${renderComponentSpec(comp.right, options)}</div>
      </div>`;
    }

    default:
      return '';
  }
}

export function buildDefaultVideoPosterDataUrl(title = 'Video Recording') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450" width="800" height="450">
    <rect width="800" height="450" fill="#0F172A"/>
    <rect x="32" y="32" width="736" height="386" rx="8" fill="#1E293B" stroke="#334155" stroke-width="2"/>
    <circle cx="400" cy="205" r="42" fill="#C83E1D"/>
    <polygon points="390,185 390,225 422,205" fill="#FFFFFF"/>
    <text x="400" y="285" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif" font-weight="700" font-size="22" fill="#F8FAFC">${escapeHtml(title.slice(0, 42))}</text>
    <text x="400" y="315" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="14" fill="#CBD5E1">VIDEO EVIDENCE · POSTER FRAME</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

/**
 * Renders a complete SlideSpec into a `<section class="slide" ...>` block.
 */
export function renderSlideToHtml(slide, index, options = {}) {
  const slideType = SLIDE_TYPES.includes(slide.type) ? slide.type : 'content';
  const notes = escapeHtml(slide.speakerNotes || 'Source-backed speaker notes for this slide.');
  const sourceAttr = slide.sourceNote ? ` data-source="${escapeHtml(slide.sourceNote)}"` : '';
  const activeClass = index === 0 ? ' active' : '';

  const eyebrowHtml = slide.eyebrow
    ? `<div class="ds-eyebrow">${slide.eyebrowIcon ? `<span class="ds-icon" data-icon="${escapeHtml(slide.eyebrowIcon)}"></span>` : ''}<span>${escapeHtml(slide.eyebrow)}</span></div>`
    : '';
  const titleHtml = slide.title ? `<h1 class="ds-title">${escapeHtml(slide.title)}</h1>` : '';
  const ledeHtml = slide.lede ? `<p class="ds-lede">${escapeHtml(slide.lede)}</p>` : '';

  const renderedComponents = Array.isArray(slide.components)
    ? slide.components.map((c) => renderComponentSpec(c, options)).join('\n')
    : '';
  const componentsHtml = [renderedComponents, slide.rawBodyHtml || ''].filter(Boolean).join('\n');

  return `<section class="slide${activeClass}" data-slide-index="${index}" data-slide-type="${slideType}" data-notes="${notes}"${sourceAttr}>
    <div class="slide-inner">
      <header class="ds-header">
        ${eyebrowHtml}
        ${titleHtml}
        ${ledeHtml}
      </header>
      ${componentsHtml}
    </div>
  </section>`;
}

/**
 * Compiles a full Deck + Brand Kit into a standalone HTML document.
 * When inlineRuntime = true (default for exports & headless checking), embeds CSS and JS directly
 * so the file opens with zero external network dependencies.
 */
export function compileDeckToHtml(deck, brandKit, options = {}) {
  const {
    inlineRuntime = true,
    cssHref = './engine/deck-engine.css',
    jsSrc = './engine/deck-engine.js',
    resolveAssetPath = null
  } = options;

  const engineCss = fs.readFileSync(ENGINE_CSS_PATH, 'utf8');
  const engineJs = fs.readFileSync(ENGINE_JS_PATH, 'utf8');
  const brandVarsCss = buildBrandCssVariables(brandKit);

  const slidesHtml = (deck.slides || [])
    .map((slide, idx) => renderSlideToHtml(slide, idx, { resolveAssetPath }))
    .join('\n\n');

  const safeBrandJson = JSON.stringify(brandKit || {}).replace(/</g, '\\u003c');
  const safeMetaJson = JSON.stringify({
    slug: deck.slug,
    title: deck.title,
    classification: deck.classification || brandKit?.frame?.classification || 'Internal',
    version: deck.version || 1,
    brandKitId: brandKit?.id,
    brandKitVersion: brandKit?.version || 1
  }).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html lang="${escapeHtml(deck.brief?.language || 'en')}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(deck.title || 'Presentation Deck')}</title>
  ${
    inlineRuntime
      ? `<style id="ds-engine-css">\n${engineCss}\n</style>`
      : `<link rel="stylesheet" href="${escapeHtml(cssHref)}" />`
  }
  <style id="ds-brand-tokens">
${brandVarsCss}
  </style>
</head>
<body>
  <main class="deck-viewport">
    <div class="deck-stage">
${slidesHtml}
    </div>
  </main>
  <script>
    window.__BRAND_KIT__ = ${safeBrandJson};
    window.__DECK_META__ = ${safeMetaJson};
  </script>
  ${
    inlineRuntime
      ? `<script id="ds-engine-js">\n${engineJs}\n</script>`
      : `<script src="${escapeHtml(jsSrc)}"></script>`
  }
</body>
</html>`;
}
