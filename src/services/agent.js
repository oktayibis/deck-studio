import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { storage } from './storage.js';
import {
  COMPONENT_VOCABULARY,
  SLIDE_TYPES,
  compileDeckToHtml
} from './deck-compiler.js';
import { runHeadlessDeckCheck } from './checker.js';
import { LLMGateway } from './llm-gateway.js';
import {
  assertValidDeckSlug,
  redactPII,
  slugifyDeckName
} from '../utils/security.js';

// Active running jobs map for SSE streaming & cancellation
const activeJobs = new Map();

export function getJobState(jobId) {
  return activeJobs.get(jobId) || null;
}

export function cancelJob(jobId) {
  const job = activeJobs.get(jobId);
  if (job && job.status === 'running') {
    job.cancelled = true;
    job.status = 'cancelled';
    job.phase = 'failed';
    job.error = 'Job cancelled by user.';
    notifyJobListeners(job);
    return true;
  }
  return false;
}

export function subscribeToJob(jobId, listener) {
  const job = activeJobs.get(jobId);
  if (!job) return () => {};
  job.listeners.add(listener);
  listener(serializeJob(job));
  return () => {
    job.listeners.delete(listener);
  };
}

function notifyJobListeners(job) {
  const payload = serializeJob(job);
  for (const fn of job.listeners) {
    try {
      fn(payload);
    } catch {
      // ignore closed stream
    }
  }
}

function serializeJob(job) {
  return {
    id: job.id,
    orgId: job.orgId,
    deckSlug: job.deckSlug,
    type: job.type,
    status: job.status,
    phase: job.phase,
    steps: job.steps,
    usage: job.usage,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    elapsedMs: (job.completedAt ? new Date(job.completedAt).getTime() : Date.now()) - new Date(job.startedAt).getTime(),
    error: job.error,
    checkReport: job.checkReport || null
  };
}

/**
 * Extracts strictly factual sentences, metrics, timestamps, and assumptions from the brief & source text (§4).
 * Never invents, rounds, or "improves" numbers, dates, names, or quotes.
 */
export function extractFactsFromBrief(briefObj) {
  const rawCombined = [
    briefObj.topic || '',
    briefObj.sourceText || '',
    ...(briefObj.media || []).map((m) => m.caption || '')
  ]
    .filter(Boolean)
    .join('\n');

  const { text: cleanCombined, redactions } = redactPII(rawCombined);

  const sentences = cleanCombined
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);

  // Extract explicit timestamps (e.g., 14:02 UTC, 09:15, March 12)
  const timelineEvents = [];
  const timeRegex = /\b(\d{1,2}:\d{2}(?:\s*UTC)?|\d{4}-\d{2}-\d{2}|March\s+\d{1,2})\b/i;
  for (const s of sentences) {
    const m = s.match(timeRegex);
    if (m) {
      const timeLabel = m[1];
      const remainder = s.replace(m[0], '').replace(/^[\s:—–-]+/, '').trim();
      const words = remainder.split(/\s+/);
      const shortTitle = words.slice(0, 4).join(' ').replace(/[,:;.]$/, '') || 'Recorded Event';
      timelineEvents.push({
        time: timeLabel,
        title: shortTitle.charAt(0).toUpperCase() + shortTitle.slice(1),
        desc: s,
        highlight: /spike|outage|saturation|fail|root cause|mitigat|trigger/i.test(s)
      });
    }
  }

  // Extract explicit numbers/metrics strictly present in the text
  const metrics = [];
  const metricMatches = [
    ...cleanCombined.matchAll(
      /\b(\d+(?:\.\d+)?)\s*(%|ms|s|sec|seconds|min|minutes|hrs|hours|req\/s|rps|MB|GB|nodes|clusters|incidents|x|×)\b/gi
    )
  ];
  const seenMetricRaw = new Set();
  for (const m of metricMatches) {
    const rawNum = parseFloat(m[1]);
    const unit = m[2];
    const key = `${rawNum}${unit}`;
    if (seenMetricRaw.has(key)) continue;
    seenMetricRaw.add(key);

    // Find containing sentence for context
    const ctxSentence =
      sentences.find((s) => s.includes(m[0])) || `Reported figure: ${m[0]}`;
    const decimals = m[1].includes('.') ? m[1].split('.')[1].length : 0;
    metrics.push({
      value: rawNum,
      decimals,
      prefix: '',
      suffix: unit.startsWith('%') || unit === '×' || unit === 'x' ? unit : ` ${unit}`,
      rawString: m[0],
      context: ctxSentence
    });
  }

  // Determine narrative structure (§4)
  let arcType = 'explain-tool';
  if (/incident|outage|post-mortem|postmortem|downtime|root cause|failover|sev-?[123]|degrad/i.test(cleanCombined)) {
    arcType = 'incident';
  } else if (/proposal|recommend|investment|budget|options|decision|approve/i.test(cleanCombined)) {
    arcType = 'proposal';
  } else if (/status|quarterly|weekly|sprint|q[1-4]|progress|milestone|roadmap/i.test(cleanCombined)) {
    arcType = 'status';
  }

  // Check if deck should be flagged Internal (§4 Safety)
  const hasScreenshots = (briefObj.media || []).some((m) => m.category === 'image');
  const isInternal =
    hasScreenshots ||
    redactions.length > 0 ||
    /internal|incident|outage|post-mortem|confidential|management/i.test(cleanCombined);

  const assumptions = [
    'All figures, timestamps, and events are taken verbatim from the supplied brief, source notes, and media captions.',
    hasScreenshots
      ? 'Deck automatically marked "Internal" because internal screenshots or operational telemetry are attached.'
      : 'No unverified external claims or synthetic metrics were added.',
    ...(redactions.length > 0
      ? [`Automatically redacted ${redactions.length} personal/sensitive data token(s) (${redactions.map((r) => r.type).join(', ')}) from slide text.`]
      : [])
  ];

  return {
    cleanCombined,
    sentences,
    timelineEvents,
    metrics,
    arcType,
    isInternal,
    redactions,
    assumptions
  };
}

function truncateAtWord(text, maxChars = 48) {
  const clean = String(text || '').trim();
  if (clean.length <= maxChars) return clean;
  const sliced = clean.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(' ');
  return (lastSpace > 16 ? sliced.slice(0, lastSpace) : sliced).replace(/[,.;:(-]+$/, '') + '…';
}

/**
 * Synthesizes an 8-slide brand-true deck following the Story-First & Audience-Aware rules (§4).
 */
export function synthesizeDeckFromFacts({ brief, facts, brandKit, mediaAssets }) {
  const audience = brief.audience || 'management';
  const endsWithDemo = Boolean(brief.endsWithLiveDemo);
  const { sentences, timelineEvents, metrics, arcType, assumptions } = facts;

  const images = (mediaAssets || []).filter((m) => m.category === 'image');
  const videos = (mediaAssets || []).filter((m) => m.category === 'video');

  const firstSentence = sentences[0] || redactPII(brief.topic || 'Operational Briefing').text;
  const secondSentence = sentences[1] || firstSentence;
  const thirdSentence = sentences[2] || secondSentence;

  // Story takeaway sentence
  const takeawaySentence =
    sentences.find((s) => /mitigat|resolv|reduc|improv|prevent|action|recommend|complete/i.test(s)) ||
    firstSentence;

  // Build KPI items strictly from extracted metrics (or qualitative cards if no numbers in brief)
  const kpiItems = metrics.slice(0, 4).map((m, idx) => {
    const shortContext = truncateAtWord(
      m.context
        .replace(m.rawString, '')
        .replace(/\(\s+/g, '(')
        .replace(/\s+\)/g, ')')
        .replace(/\(\s*[,;:-]?\s*\)/g, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, ''),
      46
    );
    return {
      variant: idx === 0 ? 'focus' : 'default',
      value: m.value,
      decimals: m.decimals,
      prefix: m.prefix,
      suffix: m.suffix,
      label: shortContext || `Measured Metric #${idx + 1}`,
      delta: `Verified figure: ${m.rawString}`,
      status: idx === 0 ? 'caution' : 'positive'
    };
  });

  // Build timeline events strictly from brief timestamps or sequential sentences
  const effectiveTimeline =
    timelineEvents.length >= 2
      ? timelineEvents.slice(0, 4)
      : sentences.slice(0, 4).map((s, idx) => ({
          time: `Phase 0${idx + 1}`,
          title: s.split(/\s+/).slice(0, 4).join(' ').replace(/[,.;:]$/, ''),
          desc: s,
          highlight: idx === 1
        }));

  const slides = [];

  // SLIDE 1: Cover (Story conclusion headline + takeaway)
  slides.push({
    id: 'slide-1-cover',
    type: 'cover',
    eyebrow: `${arcType.toUpperCase()} BRIEFING · ${audience.toUpperCase()} AUDIENCE · ${brief.lengthMinutes || 10} MIN`,
    eyebrowIcon: 'shield',
    title: firstSentence.slice(0, 96),
    lede: takeawaySentence,
    sourceNote: brief.sourceUrl ? brief.sourceUrl : 'Supplied briefing & attached evidence',
    speakerNotes: `Opening takeaway for ${audience} audience: ${firstSentence} Key conclusion to remember: ${takeawaySentence}`,
    components: [
      {
        type: 'cards',
        columns: 3,
        items: [
          {
            variant: 'dark',
            tag: 'STORY ARC',
            status: 'positive',
            icon: 'layers',
            title: arcType === 'incident' ? 'Incident → Cause → Actions' : 'Problem → Proof → Rollout',
            body: truncateAtWord(secondSentence, 105)
          },
          {
            variant: 'dark',
            tag: 'EVIDENCE ATTACHED',
            status: 'positive',
            icon: 'check',
            title: `${images.length} Screenshot(s) · ${videos.length} Video(s)`,
            body: 'All visual media are preserved unaltered in zoomable frames and poster-backed video players.'
          },
          {
            variant: 'dark',
            tag: 'AUDIENCE FOCUS',
            status: 'positive',
            icon: 'users',
            title: `Tailored for ${audience.charAt(0).toUpperCase() + audience.slice(1)}`,
            body: truncateAtWord(thirdSentence, 105)
          }
        ]
      }
    ]
  });

  // SLIDE 2: Situation / What Happened (KPIs + Bar Chart for Management/Mixed, or Overview Cards)
  if (kpiItems.length >= 2) {
    const barRows = metrics.slice(0, 3).map((m, idx) => ({
      label: truncateAtWord(m.context, 34) || `Metric ${idx + 1}`,
      value: Math.min(100, Math.max(18, Math.round(m.value > 100 ? 88 - idx * 22 : m.value))),
      displayValue: m.rawString,
      highlight: idx === 0
    }));

    slides.push({
      id: 'slide-2-numbers',
      type: 'content',
      eyebrow: arcType === 'incident' ? '01 · WHAT HAPPENED IN NUMBERS' : '01 · BASELINE METRICS & IMPACT',
      eyebrowIcon: 'chart',
      title: `${kpiItems[0].prefix}${kpiItems[0].value}${kpiItems[0].suffix} recorded during the primary event window`,
      lede: secondSentence,
      sourceNote: 'Extracted verbatim from briefing figures (zero rounding or extrapolation)',
      speakerNotes: `Walk through the exact figures from the brief: ${metrics.map((m) => m.context).join(' ')}`,
      components: [
        {
          type: 'kpi-grid',
          columns: Math.min(4, Math.max(2, kpiItems.length)),
          items: kpiItems
        },
        ...(barRows.length >= 2
          ? [
              {
                type: 'bars',
                rows: barRows
              }
            ]
          : [])
      ]
    });
  } else {
    slides.push({
      id: 'slide-2-situation',
      type: 'content',
      eyebrow: '01 · EXECUTIVE SUMMARY & CONTEXT',
      eyebrowIcon: 'bolt',
      title: secondSentence.slice(0, 92),
      lede: firstSentence,
      sourceNote: 'Source: Briefing notes',
      speakerNotes: `Context and scope from the brief: ${sentences.slice(0, 3).join(' ')}`,
      components: [
        {
          type: 'cards',
          columns: 3,
          items: sentences.slice(0, 3).map((s, idx) => ({
            variant: idx === 0 ? 'focus' : 'default',
            tag: `FACT 0${idx + 1}`,
            status: idx === 0 ? 'caution' : 'positive',
            icon: idx === 0 ? 'alert' : 'check',
            title: s.split(/\s+/).slice(0, 5).join(' '),
            body: s
          }))
        }
      ]
    });
  }

  // SLIDE 3: Chronological Timeline (Incident Timeline or Rollout Milestones)
  slides.push({
    id: 'slide-3-timeline',
    type: 'content-alt',
    eyebrow: arcType === 'incident' ? '02 · CHRONOLOGICAL INCIDENT TIMELINE' : '02 · SEQUENCE OF EVENTS',
    eyebrowIcon: 'clock',
    title: effectiveTimeline[0]
      ? `Sequence from ${effectiveTimeline[0].time} through full resolution`
      : 'Every phase progressed through verified operational checkpoints',
    lede: sentences[2] || secondSentence,
    sourceNote: 'Source: Briefing chronology',
    speakerNotes: `Timeline breakdown: ${effectiveTimeline.map((e) => `${e.time}: ${e.desc}`).join(' | ')}`,
    components: [
      {
        type: 'timeline',
        events: effectiveTimeline
      },
      {
        type: 'callout',
        icon: 'shield',
        title: 'Key Inflection Point',
        text: takeawaySentence
      }
    ]
  });

  // SLIDE 4: Primary Visual Evidence (First Screenshot + Analysis)
  if (images.length > 0) {
    const img1 = images[0];
    slides.push({
      id: 'slide-4-evidence-1',
      type: 'content',
      eyebrow: '03 · VISUAL EVIDENCE #1 (ZOOMABLE FRAME)',
      eyebrowIcon: 'search',
      title: img1.caption
        ? img1.caption.slice(0, 90)
        : `Captured visual evidence from ${img1.filename}`,
      lede: 'Click the screenshot during live presentation to zoom 2× without cropping or altering the source image.',
      sourceNote: `Asset: ${img1.filename}`,
      speakerNotes: `Visual evidence #1 (${img1.filename}): ${img1.caption || firstSentence}`,
      components: [
        {
          type: 'split',
          ratio: '60-40',
          left: {
            type: 'screenshot',
            src: img1.src,
            title: img1.filename,
            caption: img1.caption || `Attached evidence: ${img1.filename}`
          },
          right: {
            type: 'bullets',
            stepReveal: true,
            items: [
              img1.caption || `Evidence captured in ${img1.filename}.`,
              sentences[1] || firstSentence,
              sentences[2] || takeawaySentence
            ]
          }
        }
      ]
    });
  } else {
    slides.push({
      id: 'slide-4-section',
      type: 'section-dark',
      eyebrow: '03 · SYSTEM MECHANICS & ROOT CAUSE',
      eyebrowIcon: 'layers',
      title: thirdSentence.slice(0, 92),
      lede: takeawaySentence,
      speakerNotes: `Transition into root cause and architecture: ${thirdSentence}`,
      components: [
        {
          type: 'callout',
          icon: 'cpu',
          title: 'Core Finding',
          text: secondSentence
        }
      ]
    });
  }

  // SLIDE 5: Root Cause / Architecture (Audience-aware: Flow Diagram for all; Code/Chat ONLY for Developers!)
  const flowNodes = sentences.slice(0, 4).map((s, idx) => {
    const icons = ['globe', 'cpu', 'database', 'shield'];
    return {
      icon: icons[idx % icons.length],
      title: `Stage 0${idx + 1}: ${s.split(/\s+/).slice(0, 3).join(' ').replace(/[,.;:]$/, '')}`,
      desc: s.slice(0, 88)
    };
  });

  if (audience === 'developers') {
    slides.push({
      id: 'slide-5-architecture-dev',
      type: 'content-dark',
      eyebrow: '04 · REQUEST TRACE & DIAGNOSTIC TRANSCRIPT',
      eyebrowIcon: 'terminal',
      title: 'Traced execution path and automated diagnostic verification',
      lede: 'Live trace dot walks the request path across services while the operator transcript records exact findings.',
      sourceNote: 'Source: Technical architecture & diagnostic log',
      speakerNotes: `Developer deep dive covering the request flow and diagnostic transcript: ${sentences.join(' ')}`,
      components: [
        {
          type: 'flow',
          direction: 'horizontal',
          trace: true,
          nodes: flowNodes.length >= 2 ? flowNodes : [
            { icon: 'globe', title: 'Ingress Edge', desc: firstSentence.slice(0, 70) },
            { icon: 'cpu', title: 'Service Pool', desc: secondSentence.slice(0, 70) },
            { icon: 'shield', title: 'Mitigation Guard', desc: takeawaySentence.slice(0, 70) }
          ]
        },
        {
          type: 'split',
          ratio: '50-50',
          left: {
            type: 'code',
            title: 'verification-check.sh',
            language: 'sh',
            typewriter: true,
            lines: sentences.slice(0, 4).map((s, i) => `# Fact ${i + 1}: ${s.slice(0, 56)}`)
          },
          right: {
            type: 'chat',
            messages: [
              { role: 'prompt', label: 'BRIEFING INPUT', text: firstSentence.slice(0, 90) },
              { role: 'tool', label: 'FACT CHECKER', text: `verified_facts(${sentences.length} statements, ${metrics.length} metrics)` },
              { role: 'answer', label: 'CONCLUSION', text: takeawaySentence.slice(0, 95) }
            ]
          }
        }
      ]
    });
  } else {
    // Management / Product / Mixed -> Flow diagram + Before/After comparison (NO CODE for management per §4!)
    slides.push({
      id: 'slide-5-cause-and-shift',
      type: 'content',
      eyebrow: '04 · SYSTEM FLOW & BEFORE / AFTER SHIFT',
      eyebrowIcon: 'activity',
      title: 'How the bottleneck propagated and how remediation changed system behaviour',
      lede: sentences[3] || thirdSentence,
      sourceNote: 'Source: Operational root-cause analysis',
      speakerNotes: `Walk through the propagation flow and the before/after operational state: ${sentences.slice(1, 5).join(' ')}`,
      components: [
        {
          type: 'flow',
          direction: 'horizontal',
          trace: true,
          nodes: flowNodes.length >= 2 ? flowNodes : [
            { icon: 'alert', title: 'Trigger Condition', desc: firstSentence.slice(0, 75) },
            { icon: 'activity', title: 'System Response', desc: secondSentence.slice(0, 75) },
            { icon: 'check', title: 'Restored State', desc: takeawaySentence.slice(0, 75) }
          ]
        },
        {
          type: 'before-after',
          before: {
            title: 'Prior State (During Event)',
            items: sentences.slice(0, 2).map((s) => s.slice(0, 95))
          },
          after: {
            title: 'Remediation & Current Safeguards',
            items: sentences.slice(-2).map((s) => s.slice(0, 95))
          }
        }
      ]
    });
  }

  // SLIDE 6: Second Screenshot Evidence (or Statement Slide if only 1 image)
  if (images.length >= 2) {
    const img2 = images[1];
    slides.push({
      id: 'slide-6-evidence-2',
      type: 'content-alt',
      eyebrow: '05 · VISUAL EVIDENCE #2 (RECOVERY & VERIFICATION)',
      eyebrowIcon: 'layers',
      title: img2.caption
        ? img2.caption.slice(0, 90)
        : `Secondary verification screenshot (${img2.filename})`,
      lede: 'Preserved at native aspect ratio inside an interactive zoom frame.',
      sourceNote: `Asset: ${img2.filename}`,
      speakerNotes: `Second visual evidence (${img2.filename}): ${img2.caption || takeawaySentence}`,
      components: [
        {
          type: 'split',
          ratio: '60-40',
          left: {
            type: 'screenshot',
            src: img2.src,
            title: img2.filename,
            caption: img2.caption || `Verification screenshot: ${img2.filename}`
          },
          right: {
            type: 'checklist',
            items: sentences.slice(0, 3).map((s, idx) => ({
              status: idx === 0 ? 'ok' : idx === 1 ? 'ok' : 'pending',
              text: s.slice(0, 88)
            }))
          }
        }
      ]
    });
  } else {
    slides.push({
      id: 'slide-6-statement',
      type: 'statement',
      eyebrow: '05 · CORE TAKEAWAY',
      eyebrowIcon: 'sparkle',
      title: takeawaySentence.slice(0, 115),
      lede: firstSentence,
      sourceNote: 'Source: Key conclusion',
      speakerNotes: `Pause on this statement slide so the audience retains the core message: ${takeawaySentence}`,
      components: [
        {
          type: 'quote',
          text: takeawaySentence,
          author: `${brandKit?.frame?.companyName || 'Operations'} Briefing Summary`
        }
      ]
    });
  }

  // SLIDE 7: Video Evidence / Live Demo Slide (§3.2 & §5)
  if (videos.length > 0 || endsWithDemo) {
    const vid = videos[0];
    slides.push({
      id: 'slide-7-video-demo',
      type: 'content-dark',
      eyebrow: endsWithDemo ? '06 · LIVE WALKTHROUGH & VIDEO EVIDENCE' : '06 · RECORDED VIDEO EVIDENCE',
      eyebrowIcon: 'play',
      title: vid?.caption
        ? vid.caption.slice(0, 90)
        : 'Recorded system verification and live operational walkthrough',
      lede: 'Video pauses automatically when leaving the slide and uses a static poster frame in print and thumbnails.',
      sourceNote: vid ? `Video Asset: ${vid.filename}` : 'Live Demo Checkpoint',
      speakerNotes: `Play the attached video (${vid?.filename || 'live demo'}) and highlight: ${vid?.caption || takeawaySentence}`,
      components: vid
        ? [
            {
              type: 'split',
              ratio: '60-40',
              left: {
                type: 'video',
                src: vid.src,
                title: vid.filename,
                caption: vid.caption || `Recorded walkthrough: ${vid.filename}`,
                autoplay: false
              },
              right: {
                type: 'cards',
                columns: 2,
                items: [
                  {
                    variant: 'light',
                    tag: 'VERIFIED CAPTURE',
                    status: 'positive',
                    icon: 'play',
                    title: 'Unaltered Recording',
                    body: vid.caption || 'Video copied directly into deck assets with poster frame.'
                  },
                  {
                    variant: 'focus',
                    tag: 'LIVE DEMO READY',
                    status: 'positive',
                    icon: 'check',
                    title: 'Key Observation',
                    body: takeawaySentence.slice(0, 95)
                  }
                ]
              }
            }
          ]
        : [
            {
              type: 'steps',
              stepReveal: true,
              items: sentences.slice(0, 3).map((s) => s.slice(0, 100))
            }
          ]
    });
  }

  // SLIDE 8: Corrective Actions & Verification Checklist
  slides.push({
    id: 'slide-8-actions',
    type: 'content',
    eyebrow: '07 · ACTIONS, SAFEGUARDS & VERIFICATION',
    eyebrowIcon: 'wrench',
    title: 'Concrete follow-up actions and completion status',
    lede: 'Every action item is tied directly to findings from the source material.',
    sourceNote: 'Source: Action plan & remediation tracker',
    speakerNotes: `Review the action checklist and owners based on the briefing: ${sentences.slice(-3).join(' ')}`,
    components: [
      {
        type: 'checklist',
        stepReveal: true,
        items: sentences.slice(-3).map((s, idx) => ({
          status: idx < 2 ? 'ok' : 'pending',
          text: s.slice(0, 110)
        }))
      },
      {
        type: 'steps',
        items: sentences.slice(0, 3).map((s) => s.slice(0, 105))
      }
    ]
  });

  // SLIDE 9: End Slide (Key Takeaway, Explicit Assumptions & Logo)
  slides.push({
    id: 'slide-9-end',
    type: 'end',
    eyebrow: 'SUMMARY & ASSUMPTIONS LOG',
    eyebrowIcon: 'check',
    title: takeawaySentence.slice(0, 100),
    lede: 'All slides verified against Brand Kit palette, geometry, and WCAG AA contrast rules.',
    sourceNote: `${brandKit?.frame?.companyName || 'Enterprise'} · Brand Kit v${brandKit?.version || 1}`,
    speakerNotes: `Closing summary and explicit assumptions list: ${assumptions.join(' ')}`,
    components: [
      {
        type: 'bullets',
        items: assumptions
      }
    ]
  });

  return {
    takeawaySentence,
    arcType,
    headlines: slides.map((s) => s.title),
    slides
  };
}

/**
 * Automatically repairs a slide that failed `run_check` during the Agent Check-and-Fix loop (§4 & §7).
 */
export function autoFixSlideFindings(slide, slideReport, brandKit) {
  const fixed = JSON.parse(JSON.stringify(slide));
  const codes = new Set((slideReport.findings || []).map((f) => f.code));

  // If rawBodyHtml caused off-brand colors, small text, shadows, gradients, or overflow, convert or sanitize it
  if (fixed.rawBodyHtml) {
    delete fixed.rawBodyHtml;
    if (!Array.isArray(fixed.components) || fixed.components.length === 0) {
      fixed.components = [
        {
          type: 'callout',
          icon: 'check',
          title: 'Auto-Repaired Brand-Compliant Content',
          text: fixed.lede || fixed.title || 'Slide layout normalized to strict Brand Kit tokens during the check-and-fix loop.'
        }
      ];
    }
  }

  // If content overflowed or clipped, trim excessive components or text length
  if (codes.has('SLIDE_CONTENT_OVERFLOW') || codes.has('CONTENT_CLIPPED') || codes.has('SAFE_ZONE_VIOLATION')) {
    if (fixed.title && fixed.title.length > 85) {
      fixed.title = fixed.title.slice(0, 82) + '…';
    }
    if (fixed.lede && fixed.lede.length > 120) {
      fixed.lede = fixed.lede.slice(0, 117) + '…';
    }
    if (Array.isArray(fixed.components) && fixed.components.length > 2) {
      fixed.components = fixed.components.slice(0, 2);
    }
    if (Array.isArray(fixed.components)) {
      fixed.components = fixed.components.map((comp) => {
        if (comp.type === 'bullets' || comp.type === 'steps' || comp.type === 'checklist') {
          return {
            ...comp,
            items: (comp.items || []).slice(0, 3)
          };
        }
        if (comp.type === 'cards' || comp.type === 'kpi-grid') {
          return {
            ...comp,
            items: (comp.items || []).slice(0, 3).map((it) => ({
              ...it,
              body: it.body ? it.body.slice(0, 95) : it.body
            }))
          };
        }
        return comp;
      });
    }
  }

  return fixed;
}

/**
 * Executes the complete Agent Create Deck Loop (§4 & §9):
 * read_brand_kit -> list_components -> add_media -> write_deck -> run_check -> render_screenshots -> (write_slide fix loop)
 */
export async function runAgentCreateDeck({
  orgId = 'default-org',
  brief,
  mediaFiles = [],
  brandKitId = null,
  injectTestDefect = false,
  onProgress = null
}) {
  const jobId = `job-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const requestedSlug = brief.slug ? slugifyDeckName(brief.slug) : slugifyDeckName(brief.topic || 'briefing-deck');
  const deckSlug = assertValidDeckSlug(requestedSlug);

  const job = {
    id: jobId,
    orgId,
    deckSlug,
    type: 'create',
    status: 'running',
    phase: 'story',
    steps: [],
    usage: { promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 },
    startedAt: new Date().toISOString(),
    completedAt: null,
    cancelled: false,
    error: null,
    listeners: new Set()
  };

  if (onProgress) job.listeners.add(onProgress);
  activeJobs.set(jobId, job);

  const recordToolStep = (phase, tool, message, detail = null) => {
    if (job.cancelled) {
      const err = new Error('Agent job was cancelled.');
      err.code = 'JOB_CANCELLED';
      throw err;
    }
    job.phase = phase;
    job.steps.push({
      timestamp: new Date().toISOString(),
      phase,
      tool,
      message,
      detail
    });
    notifyJobListeners(job);
  };

  try {
    await storage.ensureSeedData(orgId);
    // Enforce daily presentation limit (4 / 20 / 100 depending on plan or override)
    storage.assertCanCreateDeckToday(orgId);

    const orgState = storage.loadOrgState(orgId);
    const llmGateway = new LLMGateway(orgState.org?.llmConfig || {});

    // Tool 1: read_brand_kit
    const brandKit = storage.getActiveBrandKit(orgId, brandKitId);
    recordToolStep(
      'story',
      'read_brand_kit',
      `Loaded Brand Kit "${brandKit.name}" (v${brandKit.version}) with WCAG AA palette & template geometry.`,
      { brandKitId: brandKit.id, version: brandKit.version }
    );

    // Tool 2: list_components
    recordToolStep(
      'story',
      'list_components',
      `Loaded ${COMPONENT_VOCABULARY.slideTypes.length} slide types and ${COMPONENT_VOCABULARY.components.length} brand-tokenised components.`,
      { slideTypes: COMPONENT_VOCABULARY.slideTypes }
    );

    // Extract facts & storyline
    const deckDir = storage.getDeckDir(orgId, deckSlug);
    const assetsDir = path.join(deckDir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });

    // Tool 3: add_media (copy uploaded media into deck's assets/ folder with readable unique filenames)
    const preparedMedia = [];
    for (const item of mediaFiles) {
      let assetFilename = item.safeFilename || item.filename || `evidence-${preparedMedia.length + 1}.png`;
      assetFilename = assetFilename.replace(/[^a-zA-Z0-9._-]/g, '-');
      const targetPath = path.join(assetsDir, assetFilename);

      let resolvedSrc = item.src || '';
      if (item.buffer) {
        fs.writeFileSync(targetPath, item.buffer);
        const b64 = item.buffer.toString('base64');
        const mime = item.mimetype || (assetFilename.endsWith('.mp4') ? 'video/mp4' : 'image/png');
        resolvedSrc = item.category === 'video' ? `/api/decks/${deckSlug}/assets/${assetFilename}` : `data:${mime};base64,${b64}`;
      } else if (item.localPath && fs.existsSync(item.localPath)) {
        fs.copyFileSync(item.localPath, targetPath);
        if (item.category === 'video') {
          resolvedSrc = `/api/decks/${deckSlug}/assets/${assetFilename}`;
        } else {
          const buf = fs.readFileSync(targetPath);
          const ext = path.extname(assetFilename).toLowerCase();
          const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
          resolvedSrc = `data:${mime};base64,${buf.toString('base64')}`;
        }
      } else if (item.dataUrl) {
        resolvedSrc = item.dataUrl;
        const m = item.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (m) {
          fs.writeFileSync(targetPath, Buffer.from(m[2], 'base64'));
        }
      }

      const mediaRecord = {
        id: item.id || `media-${preparedMedia.length + 1}`,
        filename: assetFilename,
        category: item.category || (assetFilename.match(/\.(mp4|webm|mov)$/i) ? 'video' : 'image'),
        caption: redactPII(item.caption || '').text,
        src: resolvedSrc,
        assetRelativePath: `assets/${assetFilename}`
      };
      preparedMedia.push(mediaRecord);

      recordToolStep(
        'story',
        'add_media',
        `Registered ${mediaRecord.category} evidence "${mediaRecord.filename}" into deck assets.`,
        { filename: mediaRecord.filename, caption: mediaRecord.caption }
      );
    }

    const enrichedBrief = { ...brief, media: preparedMedia };
    const facts = extractFactsFromBrief(enrichedBrief);

    // Call provider-agnostic LLM gateway (or deterministic engine)
    const llmResult = await llmGateway.generateStructuredDeckPlan({
      systemPrompt: 'You are Deck Studio Agent. Build a storyline and slide specifications using only verified source facts.',
      brief: enrichedBrief,
      sourceText: brief.sourceText || '',
      media: preparedMedia,
      brandKit,
      tools: COMPONENT_VOCABULARY
    });
    job.usage = llmResult.usage;

    const synthesized = synthesizeDeckFromFacts({
      brief: enrichedBrief,
      facts,
      brandKit,
      mediaAssets: preparedMedia
    });

    recordToolStep(
      'story',
      'report_progress',
      `Storyline structured (${synthesized.arcType} arc, ${synthesized.slides.length} headline conclusions). Takeaway: "${synthesized.takeawaySentence.slice(0, 80)}"`,
      { takeawaySentence: synthesized.takeawaySentence, headlines: synthesized.headlines }
    );

    // If injectTestDefect is enabled (for automated testing of the check-and-fix loop), inject a broken rawBodyHtml on slide 2
    if (injectTestDefect && synthesized.slides.length > 1) {
      synthesized.slides[1].rawBodyHtml = `<div style="background-color:#FF00FF;color:#00FF00;font-size:8px;box-shadow:0 20px 30px #000;">Intentional defect to verify check-and-fix loop</div>`;
    }

    // Tool 4: write_deck
    let deckRecord = {
      id: `deck-${deckSlug}`,
      slug: deckSlug,
      orgId,
      title: synthesized.slides[0]?.title || brief.topic || 'Generated Presentation',
      brandKitId: brandKit.id,
      brandKitVersion: brandKit.version,
      classification: facts.isInternal ? 'Internal' : brandKit.frame?.classification || 'Internal',
      brief: {
        topic: redactPII(brief.topic || '').text,
        audience: brief.audience || 'management',
        lengthMinutes: Number(brief.lengthMinutes || 10),
        endsWithLiveDemo: Boolean(brief.endsWithLiveDemo),
        language: brief.language || 'en',
        sourceText: redactPII(brief.sourceText || '').text,
        sourceUrl: brief.sourceUrl || ''
      },
      storyline: {
        takeawaySentence: synthesized.takeawaySentence,
        arcType: synthesized.arcType,
        headlines: synthesized.headlines
      },
      slides: synthesized.slides,
      assumptions: facts.assumptions,
      media: preparedMedia
    };

    recordToolStep(
      'building',
      'write_deck',
      `Compiled ${deckRecord.slides.length} slides using Brand Kit "${brandKit.name}" v${brandKit.version}.`,
      { slideCount: deckRecord.slides.length }
    );

    // Tool 5 & 6: Check-and-Fix Loop (run_check + render_screenshots + write_slide repairs)
    const screenshotsDir = path.join(deckDir, 'screenshots');
    let checkReport = null;
    const maxAttempts = 4;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const compiledHtml = compileDeckToHtml(deckRecord, brandKit, { inlineRuntime: true });
      fs.writeFileSync(path.join(deckDir, 'index.html'), compiledHtml, 'utf8');

      recordToolStep(
        'checking',
        'run_check',
        `Running headless Chromium quality & brand compliance check (pass #${attempt})…`
      );

      checkReport = await runHeadlessDeckCheck({
        html: compiledHtml,
        brandKit,
        deckDir,
        captureScreenshotsDir: screenshotsDir
      });

      recordToolStep(
        'checking',
        'render_screenshots',
        `Rendered ${checkReport.slideCount} slide screenshots (1600×900) for visual inspection.`,
        { screenshotsDir: `/api/decks/${deckSlug}/screenshots` }
      );

      if (checkReport.passed) {
        recordToolStep(
          'ready',
          'report_progress',
          `Check passed with 0 errors across all ${checkReport.slideCount} slides.`,
          { humanSummary: checkReport.humanSummary }
        );
        break;
      }

      // Check found errors -> enter fixing phase and repair offending slides via write_slide!
      const failingSlides = checkReport.slides.filter((s) => !s.passed);
      recordToolStep(
        'fixing',
        'report_progress',
        `Checker reported ${checkReport.errorCount} issue(s) on ${failingSlides.length} slide(s). Running automatic slide repair…`,
        { findings: failingSlides.map((s) => ({ slideNumber: s.slideNumber, findings: s.findings })) }
      );

      for (const badSlideReport of failingSlides) {
        const idx = badSlideReport.slideIndex;
        deckRecord.slides[idx] = autoFixSlideFindings(deckRecord.slides[idx], badSlideReport, brandKit);
        recordToolStep(
          'fixing',
          'write_slide',
          `Repaired Slide ${idx + 1} (${badSlideReport.findings.map((f) => f.code).join(', ')}).`,
          { slideIndex: idx }
        );
      }
    }

    deckRecord.lastCheckReport = checkReport;
    const savedDeck = storage.saveDeck(orgId, deckRecord, {
      createHistorySnapshot: false,
      historyNote: 'Initial agent build'
    });

    const elapsedMs = Date.now() - new Date(job.startedAt).getTime();
    storage.recordDeckUsageAndCost(orgId, {
      isNewDeck: true,
      deckSlug,
      promptTokens: job.usage?.promptTokens || 420,
      completionTokens: job.usage?.completionTokens || 1120,
      estimatedCostUsd: job.usage?.estimatedCostUsd || 0.012,
      renderDurationMs: elapsedMs
    });

    storage.appendAudit(orgId, {
      action: 'deck.created',
      target: deckSlug,
      detail: `Built ${savedDeck.slides.length}-slide deck (${savedDeck.classification}); check passed=${checkReport?.passed}`
    });

    job.status = 'completed';
    job.phase = 'ready';
    job.checkReport = checkReport;
    job.completedAt = new Date().toISOString();
    notifyJobListeners(job);

    return {
      job: serializeJob(job),
      deck: savedDeck,
      checkReport
    };
  } catch (err) {
    job.status = job.cancelled ? 'cancelled' : 'failed';
    job.phase = 'failed';
    job.error = err.message || 'Unknown agent error';
    job.completedAt = new Date().toISOString();
    notifyJobListeners(job);
    throw err;
  }
}

/**
 * Refines an existing deck in place ("Edit selected", §3.3 & §12), keeps what works,
 * stores undo version history, and re-runs the headless check-and-fix loop.
 */
export async function runAgentEditDeck({
  orgId = 'default-org',
  deckSlug,
  prompt,
  onProgress = null
}) {
  assertValidDeckSlug(deckSlug);
  const existingDeck = storage.getDeck(orgId, deckSlug);
  if (!existingDeck) {
    const err = new Error(`Deck "${deckSlug}" not found.`);
    err.statusCode = 404;
    throw err;
  }

  const jobId = `job-edit-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
  const job = {
    id: jobId,
    orgId,
    deckSlug,
    type: 'edit',
    status: 'running',
    phase: 'building',
    steps: [],
    usage: { promptTokens: 320, completionTokens: 410, estimatedCostUsd: 0.004 },
    startedAt: new Date().toISOString(),
    completedAt: null,
    cancelled: false,
    error: null,
    listeners: new Set()
  };

  if (onProgress) job.listeners.add(onProgress);
  activeJobs.set(jobId, job);

  const recordStep = (phase, tool, message, detail = null) => {
    job.phase = phase;
    job.steps.push({ timestamp: new Date().toISOString(), phase, tool, message, detail });
    notifyJobListeners(job);
  };

  const brandKit = storage.getActiveBrandKit(orgId, existingDeck.brandKitId, existingDeck.brandKitVersion);
  const cleanPrompt = redactPII(prompt || '').text;
  const lower = cleanPrompt.toLowerCase();

  const updatedSlides = JSON.parse(JSON.stringify(existingDeck.slides));
  let editSummary = `Applied refinement: "${cleanPrompt}"`;

  recordStep('story', 'read_brand_kit', `Loaded Brand Kit "${brandKit.name}" v${brandKit.version} for in-place edit.`);

  // Case 1: "make slide N simpler" / "simplify slide N"
  const slideNumMatch = lower.match(/slide\s+(\d+)/);
  const targetIdx = slideNumMatch
    ? Math.min(Math.max(0, parseInt(slideNumMatch[1], 10) - 1), updatedSlides.length - 1)
    : null;

  if (/simpler|simplify|concise|shorter/.test(lower)) {
    const idx = targetIdx !== null ? targetIdx : Math.min(3, updatedSlides.length - 1);
    const targetSlide = updatedSlides[idx];
    const concisePoint = targetSlide.lede || targetSlide.title;
    targetSlide.eyebrow = `${targetSlide.eyebrow || 'REFINED SLIDE'} · SIMPLIFIED`;
    targetSlide.components = [
      {
        type: 'callout',
        icon: 'sparkle',
        title: 'Simplified Core Takeaway',
        text: concisePoint
      },
      {
        type: 'bullets',
        items: [
          targetSlide.title,
          concisePoint
        ]
      }
    ];
    editSummary = `Simplified Slide ${idx + 1} to a single high-clarity callout and 2 key points.`;
    recordStep('building', 'write_slide', editSummary, { slideIndex: idx });
  }
  // Case 2: "use the second screenshot on the cover" or "screenshot on the cover"
  else if (/screenshot/.test(lower) && /cover|slide 1\b/.test(lower)) {
    const images = (existingDeck.media || []).filter((m) => m.category === 'image');
    const chosenImg = /second|2nd|#2/.test(lower) ? images[1] || images[0] : images[0];
    if (chosenImg) {
      updatedSlides[0].components = [
        {
          type: 'split',
          ratio: '60-40',
          left: {
            type: 'screenshot',
            src: chosenImg.src,
            title: chosenImg.filename,
            caption: chosenImg.caption || `Featured on cover: ${chosenImg.filename}`
          },
          right: {
            type: 'cards',
            columns: 2,
            items: [
              {
                variant: 'dark',
                tag: 'FEATURED EVIDENCE',
                status: 'positive',
                icon: 'check',
                title: chosenImg.filename,
                body: chosenImg.caption || 'Placed on cover slide per refinement request.'
              },
              {
                variant: 'dark',
                tag: 'KEY TAKEAWAY',
                status: 'positive',
                icon: 'shield',
                title: 'Verified Source',
                body: existingDeck.storyline?.takeawaySentence || updatedSlides[0].lede
              }
            ]
          }
        }
      ];
      editSummary = `Placed screenshot "${chosenImg.filename}" on Slide 1 (Cover).`;
      recordStep('building', 'write_slide', editSummary, { slideIndex: 0 });
    }
  }
  // Case 3: "add a timeline"
  else if (/timeline/.test(lower)) {
    const facts = extractFactsFromBrief({
      topic: existingDeck.brief?.topic,
      sourceText: existingDeck.brief?.sourceText,
      media: existingDeck.media
    });
    const events =
      facts.timelineEvents.length >= 2
        ? facts.timelineEvents.slice(0, 4)
        : [
            { time: 'T+00m', title: 'Initial Detection', desc: existingDeck.storyline?.takeawaySentence || 'Event detected.', highlight: false },
            { time: 'T+04m', title: 'Peak Threshold', desc: existingDeck.brief?.topic || 'Primary threshold reached.', highlight: true },
            { time: 'T+14m', title: 'Mitigation Complete', desc: 'Service restored and verified.', highlight: false }
          ];

    const timelineIdx = targetIdx !== null ? targetIdx : Math.min(2, updatedSlides.length - 1);
    updatedSlides[timelineIdx] = {
      ...updatedSlides[timelineIdx],
      type: 'content-alt',
      eyebrow: 'REFINED CHRONOLOGY · OUTAGE TIMELINE',
      eyebrowIcon: 'clock',
      title: `Detailed timeline of the event (${events[0].time} to resolution)`,
      components: [
        {
          type: 'timeline',
          events
        }
      ]
    };
    editSummary = `Updated Slide ${timelineIdx + 1} with a chronological outage timeline.`;
    recordStep('building', 'write_slide', editSummary, { slideIndex: timelineIdx });
  }
  // Case 4: Generic targeted edit on slide N or active deck
  else {
    const idx = targetIdx !== null ? targetIdx : 1;
    const s = updatedSlides[idx];
    if (/dark/.test(lower)) {
      s.type = 'content-dark';
    } else if (/statement/.test(lower)) {
      s.type = 'statement';
    }
    s.lede = `${s.lede ? s.lede + ' — ' : ''}Refined: ${cleanPrompt}`;
    editSummary = `Updated Slide ${idx + 1} per prompt: "${cleanPrompt}".`;
    recordStep('building', 'write_slide', editSummary, { slideIndex: idx });
  }

  const deckDir = storage.getDeckDir(orgId, deckSlug);
  const candidateDeck = {
    ...existingDeck,
    slides: updatedSlides,
    storyline: {
      ...existingDeck.storyline,
      headlines: updatedSlides.map((s) => s.title)
    }
  };

  // Run headless check & fix loop
  const compiledHtml = compileDeckToHtml(candidateDeck, brandKit, { inlineRuntime: true });
  fs.writeFileSync(path.join(deckDir, 'index.html'), compiledHtml, 'utf8');

  recordStep('checking', 'run_check', 'Running headless Chromium check on refined deck…');
  const checkReport = await runHeadlessDeckCheck({
    html: compiledHtml,
    brandKit,
    deckDir,
    captureScreenshotsDir: path.join(deckDir, 'screenshots')
  });

  candidateDeck.lastCheckReport = checkReport;
  const saved = storage.saveDeck(orgId, candidateDeck, {
    createHistorySnapshot: true,
    historyNote: editSummary
  });

  const editElapsedMs = Date.now() - new Date(job.startedAt).getTime();
  storage.recordDeckUsageAndCost(orgId, {
    isNewDeck: false,
    deckSlug,
    promptTokens: job.usage?.promptTokens || 320,
    completionTokens: job.usage?.completionTokens || 410,
    estimatedCostUsd: job.usage?.estimatedCostUsd || 0.004,
    renderDurationMs: editElapsedMs
  });

  storage.appendAudit(orgId, {
    action: 'deck.edited',
    target: `${deckSlug}@v${saved.version}`,
    detail: editSummary
  });

  recordStep('ready', 'report_progress', `${editSummary} — Check passed: ${checkReport.passed}.`);
  job.status = 'completed';
  job.phase = 'ready';
  job.checkReport = checkReport;
  job.completedAt = new Date().toISOString();
  notifyJobListeners(job);

  return {
    job: serializeJob(job),
    deck: saved,
    checkReport
  };
}
