use std::path::Path;
use tokio::process::Command;
use serde_json::{json, Value};

use crate::brand::evaluate_brand_contrast;
use crate::models::{BrandKit, Deck};

/// Runs the Node/Playwright headless Chromium 8-point check CLI as an isolated subprocess
/// without invoking a shell (`tokio::process::Command::new("node")`, strictly no `sh -c` per §10).
pub async fn run_headless_check_subprocess(html_path: &str) -> Result<Value, String> {
    if html_path.trim().is_empty() {
        return Err("html_path must not be empty".to_string());
    }

    let script_path = if Path::new("src/cli/check-deck.js").exists() {
        "src/cli/check-deck.js"
    } else if Path::new("../src/cli/check-deck.js").exists() {
        "../src/cli/check-deck.js"
    } else {
        "src/cli/check-deck.js"
    };

    let output = Command::new("node")
        .args([script_path, "--file", html_path])
        .output()
        .await
        .map_err(|e| format!("Failed to spawn headless check subprocess: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "Headless check subprocess produced empty stdout (status: {:?}): {}",
            output.status.code(),
            stderr.trim()
        ));
    }

    serde_json::from_str::<Value>(trimmed).map_err(|e| {
        format!("Failed to parse JSON check report from headless subprocess: {e}")
    })
}

/// Fast (<10ms) deterministic structural, 1600×900 geometry budget, and WCAG 2.1 AA contrast
/// verifier used for instant unit tests and synchronous slide edits when Chromium is not spawned.
pub fn verify_deck_structure(deck: &Deck, brand: &BrandKit) -> Value {
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

    let (wcag_aa_passed, contrast_checks) = evaluate_brand_contrast(&brand.colors);
    let mut slide_reports = Vec::with_capacity(deck.slides.len());
    let mut total_errors: usize = 0;
    let mut total_warnings: usize = 0;

    for (idx, slide) in deck.slides.iter().enumerate() {
        let mut findings: Vec<Value> = Vec::new();

        if !valid_types.contains(&slide.slide_type.as_str()) {
            findings.push(json!({
                "code": "INVALID_SLIDE_TYPE",
                "severity": "error",
                "selector": ".slide",
                "message": format!("Slide type '{}' is not in the approved Brand CVI layout catalog.", slide.slide_type)
            }));
        }

        if slide.title.trim().is_empty() {
            findings.push(json!({
                "code": "EMPTY_SLIDE_TITLE",
                "severity": "error",
                "selector": ".ds-title",
                "message": "Slide headline (.ds-title) must not be empty."
            }));
        }

        if slide.title.chars().count() > 180 || slide.lede.chars().count() > 600 {
            findings.push(json!({
                "code": "SLIDE_CONTENT_OVERFLOW",
                "severity": "error",
                "selector": ".slide-inner",
                "message": "Slide text exceeds 1600x900 stage safe-zone character density budget."
            }));
        }

        if !wcag_aa_passed {
            for check in contrast_checks.iter().filter(|c| !c.passed) {
                findings.push(json!({
                    "code": "LOW_WCAG_CONTRAST",
                    "severity": "error",
                    "selector": ".slide",
                    "message": format!(
                        "{} contrast ratio {:.2}:1 ({} on {}) is below WCAG AA minimum ({:.1}:1).",
                        check.label, check.ratio, check.fg, check.bg, check.min_ratio
                    )
                }));
            }
        }

        let err_count = findings
            .iter()
            .filter(|f| f.get("severity").and_then(|s| s.as_str()) == Some("error"))
            .count();
        let warn_count = findings
            .iter()
            .filter(|f| f.get("severity").and_then(|s| s.as_str()) == Some("warning"))
            .count();

        total_errors += err_count;
        total_warnings += warn_count;

        let slide_passed = err_count == 0;
        let human_summary = if slide_passed {
            format!(
                "Slide {} ({} — \"{}\"): PASS (0 issues)",
                idx + 1,
                slide.slide_type,
                slide.title
            )
        } else {
            format!(
                "Slide {} ({} — \"{}\"): FAIL ({} error{})",
                idx + 1,
                slide.slide_type,
                slide.title,
                err_count,
                if err_count == 1 { "" } else { "s" }
            )
        };

        slide_reports.push(json!({
            "slideNumber": idx + 1,
            "slideIndex": idx,
            "slideType": slide.slide_type,
            "title": slide.title,
            "passed": slide_passed,
            "errorCount": err_count,
            "warningCount": warn_count,
            "humanSummary": human_summary,
            "findings": findings
        }));
    }

    let passed = total_errors == 0 && !deck.slides.is_empty();
    let slide_count = deck.slides.len();
    let human_summary = if passed {
        format!(
            "ALL {} SLIDES PASSED brand & quality verification (0 errors).",
            slide_count
        )
    } else {
        format!(
            "CHECK FAILED: {} error(s) found across {} slides.",
            total_errors, slide_count
        )
    };

    json!({
        "passed": passed,
        "checkedAt": "2026-01-01T00:00:00Z",
        "engine": "rust-structural-wcag-verifier",
        "stageGeometry": "1600x900",
        "brandKitId": brand.id,
        "brandKitVersion": brand.version,
        "wcagAaPassed": wcag_aa_passed,
        "slideCount": slide_count,
        "totalIssues": total_errors + total_warnings,
        "errorCount": total_errors,
        "warningCount": total_warnings,
        "humanSummary": human_summary,
        "slides": slide_reports
    })
}
