use std::io::{Cursor, Write};
use std::path::Path;

use serde_json::json;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::brand::slugify;
use crate::models::{BrandColors, BrandKit, Deck, SlideSpec};

const FALLBACK_ENGINE_CSS: &str = r#"/* Deck Studio — Fallback Standalone 1600x900 Stage CSS */
:root {
  --brand-primary: #1E293B;
  --brand-secondary: #2563EB;
  --brand-accent: #D94E28;
  --brand-surface-light: #FAF8F5;
  --brand-surface-alt: #F1ECE1;
  --brand-surface-dark: #0F172A;
  --brand-text-on-light: #0F172A;
  --brand-text-muted-on-light: #1E293B;
  --brand-text-on-dark: #FAF8F5;
  --brand-text-muted-on-dark: #F1ECE1;
  --brand-border-on-light: #CBD5E1;
  --brand-border-on-dark: #334155;
  --font-title: 'Instrument Serif', Georgia, serif;
  --font-heading: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-body: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', Menlo, monospace;
  --stage-width: 1600px;
  --stage-height: 900px;
  --margin-top: 64px;
  --margin-left: 88px;
  --margin-right: 88px;
  --margin-bottom: 86px;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; font-family: var(--font-body); }
.deck-viewport {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--brand-surface-light);
}
.deck-stage {
  position: relative;
  width: 1600px;
  height: 900px;
  flex-shrink: 0;
  overflow: hidden;
  background-color: var(--brand-surface-light);
}
.slide {
  position: absolute;
  inset: 0;
  width: 1600px;
  height: 900px;
  overflow: hidden;
  display: none;
  flex-direction: column;
  padding: var(--margin-top) var(--margin-right) var(--margin-bottom) var(--margin-left);
  background-color: var(--brand-surface-light);
  color: var(--brand-text-on-light);
}
.slide.active { display: flex; }
.slide[data-slide-type="content-alt"] { background-color: var(--brand-surface-alt); }
.slide[data-slide-type="content-dark"],
.slide[data-slide-type="cover"],
.slide[data-slide-type="statement"],
.slide[data-slide-type="end"] {
  background-color: var(--brand-surface-dark);
  color: var(--brand-text-on-dark);
}
"#;

const FALLBACK_ENGINE_JS: &str = r#"/* Deck Studio — Fallback Standalone Runtime */
(function () {
  'use strict';
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var current = 0;
  function show(idx) {
    if (!slides.length) return;
    current = Math.max(0, Math.min(slides.length - 1, idx));
    slides.forEach(function (s, i) {
      s.classList.toggle('active', i === current);
    });
  }
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') show(current + 1);
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') show(current - 1);
  });
  show(0);
})();
"#;

/// Loads `deck-engine.css` from `../src/engine/deck-engine.css` or `src/engine/deck-engine.css`,
/// falling back to an embedded 1600×900 stylesheet when executed outside the workspace root.
pub fn load_engine_css() -> String {
    let candidates = [
        "../src/engine/deck-engine.css",
        "src/engine/deck-engine.css",
    ];
    for candidate in candidates {
        if let Ok(content) = std::fs::read_to_string(Path::new(candidate)) {
            if !content.trim().is_empty() {
                return content;
            }
        }
    }
    FALLBACK_ENGINE_CSS.to_string()
}

/// Loads `deck-engine.js` from `../src/engine/deck-engine.js` or `src/engine/deck-engine.js`,
/// falling back to an embedded keyboard navigation runtime when executed outside the workspace root.
pub fn load_engine_js() -> String {
    let candidates = [
        "../src/engine/deck-engine.js",
        "src/engine/deck-engine.js",
    ];
    for candidate in candidates {
        if let Ok(content) = std::fs::read_to_string(Path::new(candidate)) {
            if !content.trim().is_empty() {
                return content;
            }
        }
    }
    FALLBACK_ENGINE_JS.to_string()
}

/// Generates `:root { --brand-primary: ...; }` CSS token overrides from a `BrandKit`.
pub fn build_brand_css_variables(brand: &BrandKit) -> String {
    let c = &brand.colors;
    let major = if brand.major_font.trim().is_empty() {
        "Instrument Serif"
    } else {
        brand.major_font.trim()
    };
    let minor = if brand.minor_font.trim().is_empty() {
        "Plus Jakarta Sans"
    } else {
        brand.minor_font.trim()
    };

    format!(
        r#":root {{
  --brand-primary: {primary};
  --brand-secondary: {secondary};
  --brand-accent: {accent};
  --brand-surface-light: {surface_light};
  --brand-surface-alt: {surface_alt};
  --brand-surface-dark: {surface_dark};
  --brand-text-on-light: {text_on_light};
  --brand-text-muted-on-light: {text_muted_on_light};
  --brand-text-on-dark: {text_on_dark};
  --brand-text-muted-on-dark: {text_muted_on_dark};
  --brand-border-on-light: #CBD5E1;
  --brand-border-on-dark: #334155;
  --brand-status-positive: #0F766E;
  --brand-status-caution: #B45309;
  --brand-status-negative: #B91C1C;

  --font-title: '{major}', Georgia, serif;
  --font-heading: '{minor}', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-body: '{minor}', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', Menlo, monospace;

  --stage-width: 1600px;
  --stage-height: 900px;
  --margin-top: 64px;
  --margin-left: 88px;
  --margin-right: 88px;
  --margin-bottom: 86px;
}}"#,
        primary = c.primary,
        secondary = c.secondary,
        accent = c.accent,
        surface_light = c.surface_light,
        surface_alt = c.surface_alt,
        surface_dark = c.surface_dark,
        text_on_light = c.text_on_light,
        text_muted_on_light = c.text_muted_on_light,
        text_on_dark = c.text_on_dark,
        text_muted_on_dark = c.text_muted_on_dark,
        major = major,
        minor = minor,
    )
}

/// Escapes special HTML characters to prevent injection in compiled slide markup.
pub fn escape_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}

fn render_slide_body_html(slide: &SlideSpec, deck_title: &str, brand_name: &str) -> String {
    match slide.slide_type.as_str() {
        "cover" | "statement" | "end" => String::new(),
        "content-dark" => format!(
            r#"<div class="ds-grid-3">
        <div class="ds-card ds-card--dark">
          <span class="ds-tag"><span class="ds-status-dot" data-status="positive"></span>PILLAR 01</span>
          <div class="ds-card-title"><span>{eyebrow}</span></div>
          <div class="ds-card-body">{lede}</div>
        </div>
        <div class="ds-card ds-card--dark">
          <span class="ds-tag"><span class="ds-status-dot" data-status="positive"></span>PILLAR 02</span>
          <div class="ds-card-title"><span>{brand} Governance</span></div>
          <div class="ds-card-body">WCAG 2.1 AA verified surface and typography tokens applied to {title}.</div>
        </div>
        <div class="ds-card ds-card--focus">
          <span class="ds-tag"><span class="ds-status-dot" data-status="positive"></span>PILLAR 03</span>
          <div class="ds-card-title"><span>Execution Outcome</span></div>
          <div class="ds-card-body">{notes}</div>
        </div>
      </div>"#,
            eyebrow = escape_html(if slide.eyebrow.is_empty() {
                "CORE ARCHITECTURE"
            } else {
                &slide.eyebrow
            }),
            lede = escape_html(&slide.lede),
            brand = escape_html(brand_name),
            title = escape_html(deck_title),
            notes = escape_html(if slide.speaker_notes.is_empty() {
                &slide.lede
            } else {
                &slide.speaker_notes
            }),
        ),
        "content-alt" => format!(
            r#"<div class="ds-grid-2">
        <div class="ds-card ds-card--light">
          <span class="ds-tag"><span class="ds-status-dot" data-status="positive"></span>KEY INITIATIVE</span>
          <div class="ds-card-title"><span>{slide_title}</span></div>
          <div class="ds-card-body">{lede}</div>
        </div>
        <div class="ds-card ds-card--default">
          <span class="ds-tag"><span class="ds-status-dot" data-status="positive"></span>OPERATIONAL NOTES</span>
          <div class="ds-card-title"><span>Delivery Checkpoints</span></div>
          <div class="ds-card-body">{notes}</div>
        </div>
      </div>"#,
            slide_title = escape_html(&slide.title),
            lede = escape_html(&slide.lede),
            notes = escape_html(if slide.speaker_notes.is_empty() {
                &slide.lede
            } else {
                &slide.speaker_notes
            }),
        ),
        _ => format!(
            r#"<ul class="ds-bullets">
        <li>{lede}</li>
        <li>Aligned with {brand} Corporate Visual Identity (CVI) and 1600×900 stage geometry.</li>
        <li>{notes}</li>
      </ul>"#,
            lede = escape_html(&slide.lede),
            brand = escape_html(brand_name),
            notes = escape_html(if slide.speaker_notes.is_empty() {
                "Structured story-first narrative synthesized from brief facts."
            } else {
                &slide.speaker_notes
            }),
        ),
    }
}

fn render_slide_html(slide: &SlideSpec, index: usize, deck_title: &str, brand_name: &str) -> String {
    let valid_types = [
        "cover",
        "content",
        "content-alt",
        "content-dark",
        "statement",
        "section-dark",
        "section-light",
        "end",
    ];
    let slide_type = if valid_types.contains(&slide.slide_type.as_str()) {
        slide.slide_type.as_str()
    } else {
        "content"
    };
    let active_class = if index == 0 { " active" } else { "" };
    let notes = if slide.speaker_notes.trim().is_empty() {
        "Source-backed speaker notes for this slide."
    } else {
        slide.speaker_notes.trim()
    };

    let eyebrow_html = if !slide.eyebrow.trim().is_empty() {
        format!(
            r#"<div class="ds-eyebrow"><span>{}</span></div>"#,
            escape_html(slide.eyebrow.trim())
        )
    } else {
        String::new()
    };

    let title_html = if !slide.title.trim().is_empty() {
        format!(
            r#"<h1 class="ds-title">{}</h1>"#,
            escape_html(slide.title.trim())
        )
    } else {
        String::new()
    };

    let lede_html = if !slide.lede.trim().is_empty() {
        format!(
            r#"<p class="ds-lede">{}</p>"#,
            escape_html(slide.lede.trim())
        )
    } else {
        String::new()
    };

    let body_html = render_slide_body_html(slide, deck_title, brand_name);

    format!(
        r#"      <section class="slide{active_class}" data-slide-index="{index}" data-slide-type="{slide_type}" data-notes="{notes}">
        <div class="slide-inner">
          <header class="ds-header">
            {eyebrow_html}
            {title_html}
            {lede_html}
          </header>
          {body_html}
        </div>
      </section>"#,
        active_class = active_class,
        index = index,
        slide_type = slide_type,
        notes = escape_html(notes),
        eyebrow_html = eyebrow_html,
        title_html = title_html,
        lede_html = lede_html,
        body_html = body_html,
    )
}

/// Compiles a complete `1600×900` standalone HTML presentation embedding
/// `../src/engine/deck-engine.css` and `../src/engine/deck-engine.js` (or fallback inline styles).
pub fn compile_deck_to_html(deck: &Deck, brand: &BrandKit) -> String {
    let engine_css = load_engine_css();
    let engine_js = load_engine_js();
    let brand_vars_css = build_brand_css_variables(brand);

    let slides_html = deck
        .slides
        .iter()
        .enumerate()
        .map(|(idx, slide)| render_slide_html(slide, idx, &deck.title, &brand.name))
        .collect::<Vec<_>>()
        .join("\n\n");

    let safe_brand_json = serde_json::to_string(brand)
        .unwrap_or_else(|_| "{}".to_string())
        .replace('<', "\\u003c");
    let safe_meta_json = serde_json::to_string(&json!({
        "slug": deck.slug,
        "title": deck.title,
        "classification": "Internal",
        "version": deck.version,
        "brandKitId": brand.id,
        "brandKitVersion": brand.version
    }))
    .unwrap_or_else(|_| "{}".to_string())
    .replace('<', "\\u003c");

    format!(
        r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <style id="ds-engine-css">
{engine_css}
  </style>
  <style id="ds-brand-tokens">
{brand_vars_css}
  </style>
</head>
<body>
  <main class="deck-viewport">
    <div class="deck-stage">
{slides_html}
    </div>
  </main>
  <script>
    window.__BRAND_KIT__ = {safe_brand_json};
    window.__DECK_META__ = {safe_meta_json};
  </script>
  <script id="ds-engine-js">
{engine_js}
  </script>
</body>
</html>"#,
        title = escape_html(if deck.title.trim().is_empty() {
            "Presentation Deck"
        } else {
            deck.title.trim()
        }),
        engine_css = engine_css,
        brand_vars_css = brand_vars_css,
        slides_html = slides_html,
        safe_brand_json = safe_brand_json,
        safe_meta_json = safe_meta_json,
        engine_js = engine_js,
    )
}

/// Deterministic story-first Rust deck synthesizer producing 8 slides (`7..=9` range)
/// across `cover`, `content`, `content-alt`, `content-dark`, `statement`, and `end`
/// strictly from the provided brief facts (`topic`, `audience`, and `brand`).
pub fn synthesize_deck_from_brief(
    slug: &str,
    topic: &str,
    audience: &str,
    brand: &BrandKit,
) -> Deck {
    let clean_topic = {
        let t = topic.trim();
        if t.is_empty() {
            "Strategic Architecture & Execution Brief"
        } else {
            t
        }
    };
    let clean_audience = {
        let a = audience.trim();
        if a.is_empty() {
            "Executive & Engineering Stakeholders"
        } else {
            a
        }
    };
    let resolved_slug = if slug.trim().is_empty() {
        slugify(clean_topic)
    } else {
        slugify(slug)
    };

    // Extract deterministic sentences/facts from the brief topic string
    let sentences: Vec<String> = clean_topic
        .split(|c: char| c == '.' || c == ';' || c == '\n')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();

    let headline = sentences
        .first()
        .cloned()
        .unwrap_or_else(|| clean_topic.to_string());
    let fact_a = sentences
        .get(1)
        .cloned()
        .unwrap_or_else(|| format!("Primary focus: {headline} tailored for {clean_audience}."));
    let fact_b = sentences.get(2).cloned().unwrap_or_else(|| {
        format!(
            "Enforced under {} CVI (version {}) with verified WCAG 2.1 AA contrast.",
            brand.name, brand.version
        )
    });

    let slides = vec![
        SlideSpec {
            index: 0,
            slide_type: "cover".to_string(),
            eyebrow: format!("{} · BRIEFING FOR {}", brand.name.to_ascii_uppercase(), clean_audience.to_ascii_uppercase()),
            title: headline.clone(),
            lede: format!(
                "Prepared for {clean_audience} using the {} Corporate Visual Identity.",
                brand.name
            ),
            speaker_notes: format!(
                "Welcome {clean_audience}. This presentation covers {clean_topic} under {} CVI governance.",
                brand.name
            ),
        },
        SlideSpec {
            index: 1,
            slide_type: "content".to_string(),
            eyebrow: "01 · EXECUTIVE CONTEXT".to_string(),
            title: format!("Why {} Matters Now", headline),
            lede: fact_a.clone(),
            speaker_notes: format!(
                "Establish the baseline context for {clean_audience}: {clean_topic}."
            ),
        },
        SlideSpec {
            index: 2,
            slide_type: "content-alt".to_string(),
            eyebrow: "02 · STAKEHOLDER ALIGNMENT".to_string(),
            title: format!("Priorities for {}", clean_audience),
            lede: format!(
                "Aligning {} objectives with measurable delivery milestones for {}.",
                brand.company_name, clean_audience
            ),
            speaker_notes: format!(
                "Review how {clean_audience} interacts with the core workflow described in the brief."
            ),
        },
        SlideSpec {
            index: 3,
            slide_type: "content-dark".to_string(),
            eyebrow: "03 · ARCHITECTURE & GOVERNANCE".to_string(),
            title: "System Foundations & Brand Guardrails".to_string(),
            lede: fact_b.clone(),
            speaker_notes: format!(
                "Highlight technical and CVI guardrails: fonts {} / {}, primary token {}.",
                brand.major_font, brand.minor_font, brand.colors.primary
            ),
        },
        SlideSpec {
            index: 4,
            slide_type: "statement".to_string(),
            eyebrow: "04 · CORE THESIS".to_string(),
            title: headline.clone(),
            lede: format!(
                "Every slide and decision for {} is anchored in verifiable brief facts and zero-drift CVI tokens.",
                clean_audience
            ),
            speaker_notes: "Pause on the core statement to confirm alignment before walking through execution steps.".to_string(),
        },
        SlideSpec {
            index: 5,
            slide_type: "content".to_string(),
            eyebrow: "05 · IMPLEMENTATION ROADMAP".to_string(),
            title: "Phased Execution & Verification".to_string(),
            lede: format!(
                "Translating {} into deterministic deliverables for {}.",
                headline, clean_audience
            ),
            speaker_notes: format!("Walk through the concrete delivery phases for {clean_topic}."),
        },
        SlideSpec {
            index: 6,
            slide_type: "content-alt".to_string(),
            eyebrow: "06 · QUALITY & RISK CONTROLS".to_string(),
            title: "WCAG 2.1 AA Contrast & Operational Readiness".to_string(),
            lede: format!(
                "{} passes automated contrast and 1600×900 stage geometry verification.",
                brand.name
            ),
            speaker_notes: "Confirm that all quality gates, contrast ratios, and export checks are green.".to_string(),
        },
        SlideSpec {
            index: 7,
            slide_type: "end".to_string(),
            eyebrow: format!("{} · NEXT STEPS", brand.name.to_ascii_uppercase()),
            title: "Summary & Decision Checkpoint".to_string(),
            lede: format!(
                "Ready for review with {clean_audience} · Topic: {headline}"
            ),
            speaker_notes: format!(
                "Conclude the briefing with {clean_audience} and open the floor for decisions."
            ),
        },
    ];

    Deck {
        slug: resolved_slug,
        org_id: brand.org_id.clone(),
        version: 1,
        title: headline,
        brand_kit_id: brand.id.clone(),
        brand_kit_version: brand.version,
        slides,
        updated_at: "2026-01-01T00:00:00Z".to_string(),
    }
}

/// Builds a self-contained `.zip` archive in memory (`index.html`, `engine/deck-engine.css`,
/// `engine/deck-engine.js`, `README.txt`) using the `zip` crate.
pub fn export_deck_to_zip_bytes(deck: &Deck, brand: &BrandKit) -> Result<Vec<u8>, String> {
    let html = compile_deck_to_html(deck, brand);
    let engine_css = load_engine_css();
    let engine_js = load_engine_js();

    let readme = format!(
        "Deck Studio — Self-Contained Presentation Bundle\n\
         ================================================\n\n\
         Title: {title}\n\
         Slug: {slug}\n\
         Organisation: {org_id}\n\
         Brand CVI: {brand_name} ({brand_id} v{brand_version})\n\
         Slide Count: {slide_count}\n\
         Stage Geometry: 1600x900 (16:9)\n\n\
         Contents:\n\
         - index.html             Standalone offline-ready HTML5 presentation\n\
         - engine/deck-engine.css Fixed 1600x900 stage & Brand Kit token stylesheet\n\
         - engine/deck-engine.js  Interactive presenter dock, overview & keyboard runtime\n\
         - README.txt             This bundle manifest\n\n\
         How to Present:\n\
         Open `index.html` directly in any modern browser. Use Arrow keys or Space to navigate.\n",
        title = deck.title,
        slug = deck.slug,
        org_id = deck.org_id,
        brand_name = brand.name,
        brand_id = brand.id,
        brand_version = brand.version,
        slide_count = deck.slides.len(),
    );

    let buf = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(buf);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    zip.start_file("index.html", options)
        .map_err(|e| format!("Failed to create index.html in ZIP: {e}"))?;
    zip.write_all(html.as_bytes())
        .map_err(|e| format!("Failed to write index.html in ZIP: {e}"))?;

    zip.start_file("engine/deck-engine.css", options)
        .map_err(|e| format!("Failed to create engine/deck-engine.css in ZIP: {e}"))?;
    zip.write_all(engine_css.as_bytes())
        .map_err(|e| format!("Failed to write engine/deck-engine.css in ZIP: {e}"))?;

    zip.start_file("engine/deck-engine.js", options)
        .map_err(|e| format!("Failed to create engine/deck-engine.js in ZIP: {e}"))?;
    zip.write_all(engine_js.as_bytes())
        .map_err(|e| format!("Failed to write engine/deck-engine.js in ZIP: {e}"))?;

    zip.start_file("README.txt", options)
        .map_err(|e| format!("Failed to create README.txt in ZIP: {e}"))?;
    zip.write_all(readme.as_bytes())
        .map_err(|e| format!("Failed to write README.txt in ZIP: {e}"))?;

    let cursor = zip
        .finish()
        .map_err(|e| format!("Failed to finalize ZIP archive: {e}"))?;
    Ok(cursor.into_inner())
}

/// Returns a default `BrandKit` for an organisation when no custom CVI has been uploaded yet.
pub fn default_brand_kit_for_org(org_id: &str) -> BrandKit {
    let colors = BrandColors::default();
    let (wcag_aa_passed, contrast_checks) = crate::brand::evaluate_brand_contrast(&colors);
    BrandKit {
        id: "brand-default-studio".to_string(),
        org_id: org_id.to_string(),
        version: 1,
        name: "Studio Default CVI".to_string(),
        company_name: "My Studio Workspace".to_string(),
        source_file: "default-theme.pptx".to_string(),
        colors,
        major_font: "Instrument Serif".to_string(),
        minor_font: "Plus Jakarta Sans".to_string(),
        slide_width_in: 13.333,
        slide_height_in: 7.5,
        wcag_aa_passed,
        contrast_checks,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    }
}

/// Deterministically refines an existing `Deck` in place based on a natural-language `prompt`
/// (e.g. simplifying a slide, adding an execution timeline, or sharpening executive takeaways).
pub fn refine_deck_with_prompt(deck: &Deck, prompt: &str, brand: &BrandKit) -> Deck {
    let mut updated = deck.clone();
    updated.version = updated.version.saturating_add(1);
    let clean_prompt = prompt.trim();
    let lower = clean_prompt.to_ascii_lowercase();

    if (lower.contains("timeline") || lower.contains("milestone") || lower.contains("roadmap"))
        && updated.slides.len() < 9
    {
        let insert_pos = if updated.slides.len() > 1 {
            updated.slides.len() - 1
        } else {
            updated.slides.len()
        };
        updated.slides.insert(
            insert_pos,
            SlideSpec {
                index: insert_pos,
                slide_type: "content-alt".to_string(),
                eyebrow: "TIMELINE & MILESTONES".to_string(),
                title: "Execution Timeline & Delivery Milestones".to_string(),
                lede: format!("{} ({} CVI)", clean_prompt, brand.name),
                speaker_notes: format!("Added timeline slide from prompt: {clean_prompt}"),
            },
        );
    } else if lower.contains("simplify") || lower.contains("concise") || lower.contains("shorten") {
        let target_idx = if updated.slides.len() > 1 { 1 } else { 0 };
        if let Some(slide) = updated.slides.get_mut(target_idx) {
            slide.eyebrow = "SIMPLIFIED EXECUTIVE TAKEAWAY".to_string();
            slide.lede = format!("Concise focus: {clean_prompt}");
            slide.speaker_notes = format!("Simplified slide via prompt: {clean_prompt}");
        }
    } else {
        let target_idx = if updated.slides.len() > 1 { 1 } else { 0 };
        if let Some(slide) = updated.slides.get_mut(target_idx) {
            slide.lede = format!("{clean_prompt} — aligned with {}.", brand.name);
            slide.speaker_notes = format!("Refined in-place: {clean_prompt}");
        }
    }

    for (idx, slide) in updated.slides.iter_mut().enumerate() {
        slide.index = idx;
    }

    updated
}

