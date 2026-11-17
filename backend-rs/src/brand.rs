use std::io::{Cursor, Read, Write};

use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::models::{BrandColors, BrandKit, ContrastCheck};

pub const EMU_PER_INCH: f64 = 914_400.0;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BrandExtractionError {
    InvalidArchive(String),
    MissingThemeXml(String),
    XmlParse(String),
}

impl std::fmt::Display for BrandExtractionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidArchive(msg) => write!(f, "Invalid Office Open XML ZIP archive: {msg}"),
            Self::MissingThemeXml(msg) => write!(f, "Missing Office theme XML: {msg}"),
            Self::XmlParse(msg) => write!(f, "XML parse error: {msg}"),
        }
    }
}

impl std::error::Error for BrandExtractionError {}

/// Converts Office Open XML English Metric Units (EMUs) into inches (`914400.0` EMUs per inch),
/// rounded to 3 decimal places.
pub fn emu_to_inches(emu: i64, fallback_in: f64) -> f64 {
    if emu <= 0 {
        return fallback_in;
    }
    let inches = (emu as f64) / EMU_PER_INCH;
    (inches * 1000.0).round() / 1000.0
}

/// Normalizes a 3-digit or 6-digit hex color string to uppercase `#RRGGBB`.
pub fn normalize_hex(input: &str) -> Option<String> {
    let trimmed = input.trim().trim_start_matches('#');
    if trimmed.len() == 3 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        let mut out = String::with_capacity(7);
        out.push('#');
        for ch in trimmed.chars() {
            let up = ch.to_ascii_uppercase();
            out.push(up);
            out.push(up);
        }
        return Some(out);
    }
    if trimmed.len() == 6 && trimmed.chars().all(|c| c.is_ascii_hexdigit()) {
        return Some(format!("#{}", trimmed.to_ascii_uppercase()));
    }
    None
}

/// Parses a `#RRGGBB` or `#RGB` hex color string into `(r, g, b)`.
pub fn parse_hex_rgb(hex: &str) -> Option<(u8, u8, u8)> {
    let norm = normalize_hex(hex)?;
    let raw = &norm[1..];
    let r = u8::from_str_radix(&raw[0..2], 16).ok()?;
    let g = u8::from_str_radix(&raw[2..4], 16).ok()?;
    let b = u8::from_str_radix(&raw[4..6], 16).ok()?;
    Some((r, g, b))
}

/// Computes WCAG 2.1 relative luminance for an RGB color (`0.0` to `1.0`).
pub fn relative_luminance(r: u8, g: u8, b: u8) -> f64 {
    fn channel_lum(c: u8) -> f64 {
        let s = (c as f64) / 255.0;
        if s <= 0.03928 {
            s / 12.92
        } else {
            ((s + 0.055) / 1.055).powf(2.4)
        }
    }
    0.2126 * channel_lum(r) + 0.7152 * channel_lum(g) + 0.0722 * channel_lum(b)
}

/// Computes WCAG 2.1 contrast ratio between two hex colors (`1.0` to `21.0`), rounded to 2 decimals.
pub fn wcag_contrast_ratio(hex_a: &str, hex_b: &str) -> f64 {
    let (ra, ga, ba) = parse_hex_rgb(hex_a).unwrap_or((0, 0, 0));
    let (rb, gb, bb) = parse_hex_rgb(hex_b).unwrap_or((255, 255, 255));
    let lum_a = relative_luminance(ra, ga, ba);
    let lum_b = relative_luminance(rb, gb, bb);
    let brightest = lum_a.max(lum_b);
    let darkest = lum_a.min(lum_b);
    let ratio = (brightest + 0.05) / (darkest + 0.05);
    (ratio * 100.0).round() / 100.0
}

/// Evaluates WCAG 2.1 AA contrast across core Brand Kit surface & text combinations.
pub fn evaluate_brand_contrast(colors: &BrandColors) -> (bool, Vec<ContrastCheck>) {
    let pairs = [
        (
            "light-body",
            "Primary text on default light surface",
            &colors.text_on_light,
            &colors.surface_light,
            4.5,
        ),
        (
            "light-muted",
            "Muted text on default light surface",
            &colors.text_muted_on_light,
            &colors.surface_light,
            4.5,
        ),
        (
            "alt-body",
            "Primary text on alternative light surface",
            &colors.text_on_light,
            &colors.surface_alt,
            4.5,
        ),
        (
            "dark-body",
            "Light text on dark surface",
            &colors.text_on_dark,
            &colors.surface_dark,
            4.5,
        ),
        (
            "dark-muted",
            "Muted text on dark surface",
            &colors.text_muted_on_dark,
            &colors.surface_dark,
            4.5,
        ),
        (
            "accent-on-light",
            "Action accent on light surface (large text / UI)",
            &colors.accent,
            &colors.surface_light,
            3.0,
        ),
        (
            "primary-on-light",
            "Primary brand color on light surface",
            &colors.primary,
            &colors.surface_light,
            4.5,
        ),
    ];

    let mut checks = Vec::with_capacity(pairs.len());
    for (id, label, fg, bg, min_ratio) in pairs {
        let ratio = wcag_contrast_ratio(fg, bg);
        checks.push(ContrastCheck {
            id: id.to_string(),
            label: label.to_string(),
            fg: fg.clone(),
            bg: bg.clone(),
            ratio,
            min_ratio,
            passed: ratio >= min_ratio,
        });
    }

    let all_passed = checks.iter().all(|c| c.passed);
    (all_passed, checks)
}

#[derive(Debug, Clone)]
pub struct ParsedThemeXml {
    pub theme_name: String,
    pub colors: BrandColors,
    pub major_font: String,
    pub minor_font: String,
}

/// Parses an Office Open XML `theme1.xml` document using `quick-xml` to extract
/// `<a:clrScheme>` (`dk1`, `lt1`, `dk2`, `lt2`, `accent1..6`) and `<a:fontScheme>` (`majorFont`, `minorFont`).
pub fn parse_office_theme_xml(xml: &str) -> Result<ParsedThemeXml, BrandExtractionError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut theme_name = String::from("Custom Office Brand");
    let mut colors = BrandColors::default();
    let mut major_font = String::from("Instrument Serif");
    let mut minor_font = String::from("Plus Jakarta Sans");

    let mut in_clr_scheme = false;
    let mut current_color_slot: Option<String> = None;

    let mut in_font_scheme = false;
    let mut current_font_slot: Option<String> = None;

    loop {
        match reader.read_event() {
            Ok(Event::Start(ref e)) => {
                let local = local_tag_name(e.name().as_ref());
                match local.as_str() {
                    "theme" => {
                        if let Some(name) = get_attr(e, "name") {
                            if !name.trim().is_empty() {
                                theme_name = name;
                            }
                        }
                    }
                    "clrScheme" => {
                        in_clr_scheme = true;
                    }
                    "dk1" | "lt1" | "dk2" | "lt2" | "accent1" | "accent2" | "accent3"
                    | "accent4" | "accent5" | "accent6"
                        if in_clr_scheme =>
                    {
                        current_color_slot = Some(local);
                    }
                    "srgbClr" | "sysClr" if in_clr_scheme => {
                        if let Some(ref slot) = current_color_slot {
                            if let Some(hex) = extract_color_attr(e, &local) {
                                apply_scheme_color(&mut colors, slot, &hex);
                            }
                        }
                    }
                    "fontScheme" => {
                        in_font_scheme = true;
                    }
                    "majorFont" | "minorFont" if in_font_scheme => {
                        current_font_slot = Some(local);
                    }
                    "latin" if in_font_scheme => {
                        if let Some(typeface) = get_attr(e, "typeface") {
                            if !typeface.trim().is_empty() {
                                match current_font_slot.as_deref() {
                                    Some("majorFont") => major_font = typeface,
                                    Some("minorFont") => minor_font = typeface,
                                    _ => {}
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(ref e)) => {
                let local = local_tag_name(e.name().as_ref());
                match local.as_str() {
                    "srgbClr" | "sysClr" if in_clr_scheme => {
                        if let Some(ref slot) = current_color_slot {
                            if let Some(hex) = extract_color_attr(e, &local) {
                                apply_scheme_color(&mut colors, slot, &hex);
                            }
                        }
                    }
                    "latin" if in_font_scheme => {
                        if let Some(typeface) = get_attr(e, "typeface") {
                            if !typeface.trim().is_empty() {
                                match current_font_slot.as_deref() {
                                    Some("majorFont") => major_font = typeface,
                                    Some("minorFont") => minor_font = typeface,
                                    _ => {}
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::End(ref e)) => {
                let local = local_tag_name(e.name().as_ref());
                match local.as_str() {
                    "clrScheme" => {
                        in_clr_scheme = false;
                        current_color_slot = None;
                    }
                    "dk1" | "lt1" | "dk2" | "lt2" | "accent1" | "accent2" | "accent3"
                    | "accent4" | "accent5" | "accent6" => {
                        current_color_slot = None;
                    }
                    "fontScheme" => {
                        in_font_scheme = false;
                        current_font_slot = None;
                    }
                    "majorFont" | "minorFont" => {
                        current_font_slot = None;
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(err) => return Err(BrandExtractionError::XmlParse(err.to_string())),
            _ => {}
        }
    }

    finalize_semantic_brand_colors(&mut colors);

    Ok(ParsedThemeXml {
        theme_name,
        colors,
        major_font,
        minor_font,
    })
}

/// Parses `ppt/presentation.xml` to extract `<p:sldSz cx="..." cy="..."/>` and converts EMUs to inches.
pub fn parse_presentation_slide_size_xml(xml: &str) -> Result<(f64, f64), BrandExtractionError> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut width_in = 13.333;
    let mut height_in = 7.5;

    loop {
        match reader.read_event() {
            Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                let local = local_tag_name(e.name().as_ref());
                if local == "sldSz" {
                    if let Some(cx_str) = get_attr(e, "cx") {
                        if let Ok(cx) = cx_str.parse::<i64>() {
                            width_in = emu_to_inches(cx, 13.333);
                        }
                    }
                    if let Some(cy_str) = get_attr(e, "cy") {
                        if let Ok(cy) = cy_str.parse::<i64>() {
                            height_in = emu_to_inches(cy, 7.5);
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(err) => return Err(BrandExtractionError::XmlParse(err.to_string())),
            _ => {}
        }
    }

    Ok((width_in, height_in))
}

/// Extracts a complete `BrandKit` specification from an Office Open XML (`.pptx`, `.potx`, `.thmx`) byte slice.
pub fn extract_brand_kit_from_pptx_bytes(
    bytes: &[u8],
    org_id: &str,
    filename: &str,
    override_name: Option<&str>,
) -> Result<BrandKit, BrandExtractionError> {
    let reader = Cursor::new(bytes);
    let mut archive = ZipArchive::new(reader)
        .map_err(|e| BrandExtractionError::InvalidArchive(e.to_string()))?;

    let mut theme_entry_name: Option<String> = None;
    let mut pres_entry_name: Option<String> = None;

    for i in 0..archive.len() {
        if let Ok(file) = archive.by_index(i) {
            let name = file.name().to_string();
            let lower = name.to_ascii_lowercase();
            if theme_entry_name.is_none()
                && (lower.ends_with("ppt/theme/theme1.xml")
                    || lower.ends_with("theme/theme/theme1.xml")
                    || (lower.contains("theme") && lower.ends_with(".xml")))
            {
                theme_entry_name = Some(name);
            } else if pres_entry_name.is_none() && lower.ends_with("ppt/presentation.xml") {
                pres_entry_name = Some(name);
            }
        }
    }

    let theme_path = theme_entry_name.ok_or_else(|| {
        BrandExtractionError::MissingThemeXml(format!(
            "No ppt/theme/theme1.xml found inside '{filename}'"
        ))
    })?;

    let mut theme_xml = String::new();
    {
        let mut theme_file = archive
            .by_name(&theme_path)
            .map_err(|e| BrandExtractionError::InvalidArchive(e.to_string()))?;
        theme_file
            .read_to_string(&mut theme_xml)
            .map_err(|e| BrandExtractionError::InvalidArchive(e.to_string()))?;
    }

    let parsed_theme = parse_office_theme_xml(&theme_xml)?;

    let (slide_width_in, slide_height_in) = if let Some(pres_path) = pres_entry_name {
        let mut pres_xml = String::new();
        let mut pres_file = archive
            .by_name(&pres_path)
            .map_err(|e| BrandExtractionError::InvalidArchive(e.to_string()))?;
        pres_file
            .read_to_string(&mut pres_xml)
            .map_err(|e| BrandExtractionError::InvalidArchive(e.to_string()))?;
        parse_presentation_slide_size_xml(&pres_xml)?
    } else {
        (13.333, 7.5)
    };

    let (wcag_aa_passed, contrast_checks) = evaluate_brand_contrast(&parsed_theme.colors);
    let resolved_name = override_name
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| parsed_theme.theme_name.clone());
    let kit_id = format!("brand-{}", slugify(&resolved_name));

    Ok(BrandKit {
        id: kit_id,
        org_id: org_id.to_string(),
        version: 1,
        name: resolved_name.clone(),
        company_name: resolved_name,
        source_file: filename.to_string(),
        colors: parsed_theme.colors,
        major_font: parsed_theme.major_font,
        minor_font: parsed_theme.minor_font,
        slide_width_in,
        slide_height_in,
        wcag_aa_passed,
        contrast_checks,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    })
}

/// Builds a spec-compliant in-memory `.pptx` ZIP archive containing `ppt/theme/theme1.xml`
/// and `ppt/presentation.xml` for CVI synthesis and unit testing.
pub fn build_synthetic_pptx_zip(
    theme_name: &str,
    colors: &BrandColors,
    major_font: &str,
    minor_font: &str,
    width_in: f64,
    height_in: f64,
) -> Result<Vec<u8>, BrandExtractionError> {
    let buf = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(buf);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    let cx_emu = (width_in * EMU_PER_INCH).round() as i64;
    let cy_emu = (height_in * EMU_PER_INCH).round() as i64;

    let pres_xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldSz cx="{cx_emu}" cy="{cy_emu}" type="screen16x9"/>
</p:presentation>"#
    );

    let strip = |h: &str| h.trim_start_matches('#').to_ascii_uppercase();
    let theme_xml = format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="{theme_name}">
  <a:themeElements>
    <a:clrScheme name="{theme_name} Colors">
      <a:dk1><a:srgbClr val="{dk1}"/></a:dk1>
      <a:lt1><a:srgbClr val="{lt1}"/></a:lt1>
      <a:dk2><a:srgbClr val="{dk2}"/></a:dk2>
      <a:lt2><a:srgbClr val="{lt2}"/></a:lt2>
      <a:accent1><a:srgbClr val="{accent1}"/></a:accent1>
      <a:accent2><a:srgbClr val="{accent2}"/></a:accent2>
      <a:accent3><a:srgbClr val="{accent3}"/></a:accent3>
      <a:accent4><a:srgbClr val="{accent4}"/></a:accent4>
      <a:accent5><a:srgbClr val="{accent5}"/></a:accent5>
      <a:accent6><a:srgbClr val="{accent6}"/></a:accent6>
    </a:clrScheme>
    <a:fontScheme name="{theme_name} Fonts">
      <a:majorFont>
        <a:latin typeface="{major_font}"/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="{minor_font}"/>
      </a:minorFont>
    </a:fontScheme>
  </a:themeElements>
</a:theme>"#,
        dk1 = strip(&colors.dk1),
        lt1 = strip(&colors.lt1),
        dk2 = strip(&colors.dk2),
        lt2 = strip(&colors.lt2),
        accent1 = strip(&colors.accent1),
        accent2 = strip(&colors.accent2),
        accent3 = strip(&colors.accent3),
        accent4 = strip(&colors.accent4),
        accent5 = strip(&colors.accent5),
        accent6 = strip(&colors.accent6),
    );

    zip.start_file("ppt/presentation.xml", options)
        .map_err(|e| BrandExtractionError::InvalidArchive(e.to_string()))?;
    zip.write_all(pres_xml.as_bytes())
        .map_err(|e| BrandExtractionError::InvalidArchive(e.to_string()))?;

    zip.start_file("ppt/theme/theme1.xml", options)
        .map_err(|e| BrandExtractionError::InvalidArchive(e.to_string()))?;
    zip.write_all(theme_xml.as_bytes())
        .map_err(|e| BrandExtractionError::InvalidArchive(e.to_string()))?;

    let cursor = zip
        .finish()
        .map_err(|e| BrandExtractionError::InvalidArchive(e.to_string()))?;
    Ok(cursor.into_inner())
}

fn local_tag_name(raw_name: &[u8]) -> String {
    let full = std::str::from_utf8(raw_name).unwrap_or("");
    full.rsplit(':').next().unwrap_or(full).to_string()
}

fn get_attr(e: &BytesStart<'_>, attr_name: &str) -> Option<String> {
    for attr in e.attributes().flatten() {
        let key = local_tag_name(attr.key.as_ref());
        if key == attr_name {
            if let Ok(val) = attr.unescape_value() {
                return Some(val.into_owned());
            }
        }
    }
    None
}

fn extract_color_attr(e: &BytesStart<'_>, tag: &str) -> Option<String> {
    if tag == "srgbClr" {
        if let Some(val) = get_attr(e, "val") {
            return normalize_hex(&val);
        }
    } else if tag == "sysClr" {
        if let Some(last) = get_attr(e, "lastClr") {
            if let Some(norm) = normalize_hex(&last) {
                return Some(norm);
            }
        }
        if let Some(val) = get_attr(e, "val") {
            if let Some(norm) = normalize_hex(&val) {
                return Some(norm);
            }
        }
    }
    None
}

fn apply_scheme_color(colors: &mut BrandColors, slot: &str, hex: &str) {
    match slot {
        "dk1" => colors.dk1 = hex.to_string(),
        "lt1" => colors.lt1 = hex.to_string(),
        "dk2" => colors.dk2 = hex.to_string(),
        "lt2" => colors.lt2 = hex.to_string(),
        "accent1" => colors.accent1 = hex.to_string(),
        "accent2" => colors.accent2 = hex.to_string(),
        "accent3" => colors.accent3 = hex.to_string(),
        "accent4" => colors.accent4 = hex.to_string(),
        "accent5" => colors.accent5 = hex.to_string(),
        "accent6" => colors.accent6 = hex.to_string(),
        _ => {}
    }
}

fn finalize_semantic_brand_colors(colors: &mut BrandColors) {
    colors.surface_dark = colors.dk1.clone();
    colors.surface_light = colors.lt1.clone();
    colors.primary = colors.dk2.clone();
    colors.surface_alt = colors.lt2.clone();
    colors.accent = colors.accent1.clone();
    colors.secondary = colors.accent2.clone();

    colors.text_on_light = if wcag_contrast_ratio(&colors.dk1, &colors.surface_light) >= 4.5 {
        colors.dk1.clone()
    } else {
        "#0F172A".to_string()
    };

    colors.text_muted_on_light = if wcag_contrast_ratio(&colors.dk2, &colors.surface_light) >= 4.5 {
        colors.dk2.clone()
    } else {
        "#475569".to_string()
    };

    colors.text_on_dark = if wcag_contrast_ratio(&colors.lt1, &colors.surface_dark) >= 4.5 {
        colors.lt1.clone()
    } else {
        "#F8FAFC".to_string()
    };

    colors.text_muted_on_dark = if wcag_contrast_ratio(&colors.lt2, &colors.surface_dark) >= 4.5 {
        colors.lt2.clone()
    } else {
        "#CBD5E1".to_string()
    };
}

pub fn slugify(input: &str) -> String {
    let mut slug = String::new();
    let mut prev_dash = false;
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            prev_dash = false;
        } else if !prev_dash && !slug.is_empty() {
            slug.push('-');
            prev_dash = true;
        }
    }
    let trimmed = slug.trim_matches('-');
    if trimmed.is_empty() {
        "custom-brand".to_string()
    } else {
        trimmed.to_string()
    }
}
